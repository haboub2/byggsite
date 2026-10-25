-- Anropsgränser och anropslogg för API v1 (docs/fakturering.md, avsnitt 5).
--
-- api_keys.rate_per_minute / rate_per_day
--                    Gränsen per nyckel: 600 anrop i minuten och 20 000 per
--                    dygn (UTC) om inget annat sätts. Gränsen skyddar
--                    tjänsten, så den ändras av Binaafy (SQL-editorn eller
--                    service role), inte av organisationens admin: en
--                    trigger håller kvar värdena när en inloggad användare
--                    skapar eller ändrar en nyckel.
-- api_rate_counters  Två rader per nyckel, en för minuten och en för dygnet.
--                    Raden nollställs när fönstret byts, så tabellen växer
--                    inte och räkningen blir en radlåsning, inte en count
--                    över loggen. Fungerar lika från alla serverlösa
--                    instanser, eftersom räkningen sker i databasen.
-- api_check_rate()   Räknar ett anrop för nyckeln om det ryms, annars inte,
--                    och svarar med det som behövs för 429, Retry-After och
--                    X-RateLimit-*. Sätter också last_used_at.
-- api_requests       Ett rad per API-anrop: metod, sökväg (utan query),
--                    status, tid, Idempotency-Key och request id. Aldrig
--                    kropp, query eller nyckel. owner/admin läser sin
--                    organisations rader; servern skriver.
-- api_request_stats() Anrop och fel per nyckel sedan en tidpunkt, för
--                    adminsidans nyckeltal.
-- api_prune_usage()  Cron rensar loggen efter 90 dagar.
-- is_webhook_event() Får invoice.corrected (samma lista som
--                    WEBHOOK_EVENT_TYPES i lib/core/events.ts).
--
-- Körs i Supabase SQL-editorn efter 0028.

-- =====================================================================
-- 1. Gränser per nyckel
-- =====================================================================

alter table public.api_keys
  add column if not exists rate_per_minute int not null default 600,
  add column if not exists rate_per_day    int not null default 20000;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'api_keys_rate_per_minute_check') then
    alter table public.api_keys add constraint api_keys_rate_per_minute_check check (rate_per_minute between 1 and 100000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'api_keys_rate_per_day_check') then
    alter table public.api_keys add constraint api_keys_rate_per_day_check check (rate_per_day between 1 and 100000000);
  end if;
end $$;

-- En inloggad användare (adminsidan) kan inte sätta egna gränser.
create or replace function public.api_keys_keep_limits() returns trigger
  language plpgsql
as $$
begin
  if coalesce(auth.jwt()->>'role', '') = 'authenticated' then
    if tg_op = 'INSERT' then
      new.rate_per_minute := 600;
      new.rate_per_day := 20000;
    else
      new.rate_per_minute := old.rate_per_minute;
      new.rate_per_day := old.rate_per_day;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists api_keys_keep_limits on public.api_keys;
create trigger api_keys_keep_limits before insert or update on public.api_keys
  for each row execute function public.api_keys_keep_limits();

-- =====================================================================
-- 2. Räknare och kontrollen
-- =====================================================================

create table if not exists public.api_rate_counters (
  key_id        uuid not null references public.api_keys(id) on delete cascade,
  window_kind   text not null check (window_kind in ('minute', 'day')),
  window_start  timestamptz not null,
  count         int not null default 0,
  primary key (key_id, window_kind)
);
alter table public.api_rate_counters enable row level security;
-- Inga policies: bara servern (service role) och api_check_rate() rör tabellen.

create or replace function public.api_check_rate(p_key uuid) returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  v_now      timestamptz := now();
  v_minute   timestamptz := date_trunc('minute', v_now);
  v_day      timestamptz := date_trunc('day', v_now, 'UTC');
  v_per_min  int;
  v_per_day  int;
  v_m        int;
  v_d        int;
  v_allowed  boolean;
  v_reset_m  int;
  v_reset_d  int;
  v_retry    int := 0;
begin
  select rate_per_minute, rate_per_day into v_per_min, v_per_day from public.api_keys where id = p_key;
  if not found then
    raise exception 'Nyckeln finns inte.' using errcode = 'P0002';
  end if;

  -- Ett nytt fönster nollställer raden. Dygnet först, sedan minuten: samma
  -- låsordning för alla anrop med nyckeln, så samtidiga anrop köar.
  insert into public.api_rate_counters as c (key_id, window_kind, window_start, count)
    values (p_key, 'day', v_day, 0)
    on conflict (key_id, window_kind) do update set window_start = excluded.window_start, count = 0
      where c.window_start < excluded.window_start;
  insert into public.api_rate_counters as c (key_id, window_kind, window_start, count)
    values (p_key, 'minute', v_minute, 0)
    on conflict (key_id, window_kind) do update set window_start = excluded.window_start, count = 0
      where c.window_start < excluded.window_start;
  select count into v_d from public.api_rate_counters where key_id = p_key and window_kind = 'day' for update;
  select count into v_m from public.api_rate_counters where key_id = p_key and window_kind = 'minute' for update;

  v_allowed := v_m < v_per_min and v_d < v_per_day;
  v_reset_m := greatest(1, ceil(extract(epoch from (v_minute + interval '1 minute' - v_now)))::int);
  v_reset_d := greatest(1, ceil(extract(epoch from (v_day + interval '1 day' - v_now)))::int);

  if v_allowed then
    -- Ett nekat anrop räknas inte, så en klient som får 429 tär inte på dygnet.
    update public.api_rate_counters set count = count + 1 where key_id = p_key;
    v_m := v_m + 1;
    v_d := v_d + 1;
    update public.api_keys set last_used_at = v_now
      where id = p_key and (last_used_at is null or last_used_at < v_now - interval '1 minute');
  else
    v_retry := case when v_d >= v_per_day then v_reset_d else v_reset_m end;
  end if;

  return jsonb_build_object(
    'allowed', v_allowed,
    'limit_minute', v_per_min,
    'remaining_minute', greatest(v_per_min - v_m, 0),
    'reset_minute', v_reset_m,
    'limit_day', v_per_day,
    'remaining_day', greatest(v_per_day - v_d, 0),
    'reset_day', v_reset_d,
    'retry_after', v_retry
  );
end;
$$;
revoke all on function public.api_check_rate(uuid) from public, anon, authenticated;
grant execute on function public.api_check_rate(uuid) to service_role;

-- =====================================================================
-- 3. Anropsloggen
-- =====================================================================

create table if not exists public.api_requests (
  id               bigint generated always as identity primary key,
  org_id           uuid not null references public.organizations(id) on delete cascade,
  key_id           uuid references public.api_keys(id) on delete set null,
  request_id       text not null check (char_length(request_id) <= 64),
  method           text not null check (method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS')),
  path             text not null check (char_length(path) <= 300),
  status           int  not null check (status between 100 and 599),
  duration_ms      int  not null check (duration_ms >= 0),
  idempotency_key  text check (char_length(idempotency_key) <= 128),
  created_at       timestamptz not null default now()
);
create index if not exists api_requests_org_time_idx on public.api_requests (org_id, created_at desc);
create index if not exists api_requests_key_time_idx on public.api_requests (key_id, created_at desc);
create index if not exists api_requests_created_idx  on public.api_requests (created_at);

alter table public.api_requests enable row level security;
drop policy if exists "api_requests_admin_select" on public.api_requests;
create policy "api_requests_admin_select" on public.api_requests
  for select to authenticated using (public.can_admin_org(org_id));
-- Skrivs av servern (service role).

-- Nyckeltalen: anrop och fel (status 400 och uppåt) per nyckel sedan p_since.
-- security invoker: RLS ovan avgör vilka rader som räknas.
create or replace function public.api_request_stats(p_org uuid, p_since timestamptz)
  returns table (key_id uuid, calls bigint, errors bigint, last_at timestamptz)
  language sql stable
as $$
  select r.key_id, count(*), count(*) filter (where r.status >= 400), max(r.created_at)
    from public.api_requests r
   where r.org_id = p_org and r.created_at >= p_since
   group by r.key_id
$$;
revoke all on function public.api_request_stats(uuid, timestamptz) from public, anon;
grant execute on function public.api_request_stats(uuid, timestamptz) to authenticated, service_role;

-- Cron: loggen sparas i p_days dagar.
create or replace function public.api_prune_usage(p_days int default 90) returns int
  language plpgsql security definer set search_path = public
as $$
declare
  v_n int;
begin
  if p_days < 1 then
    raise exception 'Loggen sparas minst en dag.';
  end if;
  delete from public.api_requests where created_at < now() - make_interval(days => p_days);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.api_prune_usage(int) from public, anon, authenticated;
grant execute on function public.api_prune_usage(int) to service_role;

-- =====================================================================
-- 4. Webhooks: invoice.corrected
-- =====================================================================

-- Samma lista som WEBHOOK_EVENT_TYPES i lib/core/events.ts.
create or replace function public.is_webhook_event(p_type text) returns boolean
  language sql immutable
as $$
  select p_type = any(array[
    'invoice.issued', 'invoice.sent', 'invoice.reminded', 'invoice.partially_paid', 'invoice.paid',
    'invoice.credited', 'invoice.voided', 'invoice.corrected', 'payment.received',
    'rot_claim.sent', 'rot_claim.paid', 'rot_claim.rejected'
  ])
$$;
