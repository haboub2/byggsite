-- 0030: PDF-arkivet som bakgrundsjobb och verifikationsserien per
-- räkenskapsår (docs/fakturering.md, Läge 2026-10-25).
--
-- Del 1–2: export_jobs och bucketen exports. Del 3: brutet räkenskapsår.
--
-- En organisation med många utfärdade fakturor får inte zippen i anropet:
-- en rad i export_jobs köas, och cron-routen /api/cron/exports bygger filen
-- i delar om 50 fakturor (lib/core/export/job-store.ts). Delarna och den
-- färdiga zippen ligger i den privata bucketen "exports" under
-- <org_id>/<jobb_id>/…; den som begärde får en signerad länk som gäller
-- 7 dagar, och därefter tas filen bort och jobbet blir 'expired'.
--
-- Medlemmar i organisationen läser sina jobb och köar nya i eget namn;
-- allt annat (status, delar, fil) skrivs av jobbet med service role.

-- =====================================================================
-- 1. export_jobs
-- =====================================================================

create table export_jobs (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  kind            text not null check (kind in ('pdf_archive')),
  status          text not null default 'queued' check (status in ('queued','running','done','failed','expired')),
  -- Den färdiga filen i bucketen exports, namnet den laddas ner med och
  -- storleken. Ett stort arkiv delas i volymer som var och en ryms i
  -- Storage; outputs listar alla [{path, name, bytes}], file_path är den
  -- första.
  file_path       text,
  file_name       text,
  bytes           bigint,
  outputs         jsonb not null default '[]'::jsonb,
  error           text check (char_length(error) <= 2000),
  requested_by    uuid references auth.users(id) on delete set null,
  -- Dit länken mejlas; frusen vid beställningen.
  requested_email text check (char_length(requested_email) <= 320),
  -- Fakturorna i arkivet och deras filnamn [{id, name}], i arkivets
  -- ordning, frysta när jobbet startar, och hur många delar om 50 som är
  -- klara.
  files           jsonb not null default '[]'::jsonb,
  parts_done      int not null default 0 check (parts_done >= 0),
  -- En körning håller jobbet till hit, så att två körningar aldrig bygger
  -- samma del.
  locked_until    timestamptz,
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz,
  -- När länken och filen slutar gälla.
  expires_at      timestamptz
);
create index export_jobs_org_idx on export_jobs (org_id, created_at desc);
create index export_jobs_open_idx on export_jobs (status) where status in ('queued','running','done');
-- Ett pågående jobb av varje slag per organisation.
create unique index export_jobs_one_active on export_jobs (org_id, kind) where status in ('queued','running');

alter table export_jobs enable row level security;

create policy "export_jobs_member_select" on export_jobs
  for select to authenticated using (is_org_member(org_id));
-- Varje medlem som får ladda ner arkivet får köa det, men bara i eget namn
-- och som ett nytt, tomt jobb.
create policy "export_jobs_member_insert" on export_jobs
  for insert to authenticated
  with check (
    is_org_member(org_id)
    and requested_by = auth.uid()
    and status = 'queued'
    and file_path is null
    and parts_done = 0
    and files = '[]'::jsonb
    and outputs = '[]'::jsonb
    and started_at is null
  );

-- =====================================================================
-- 2. Bucketen exports
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('exports', 'exports', false)
on conflict (id) do nothing;

-- Läsning för organisationens medlemmar (första mappen är org_id). Ingen
-- policy för skrivning: bara service role lägger och tar bort filer.
create policy "exports_member_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'exports'
    and (storage.foldername(name))[1] in (select m.org_id::text from public.memberships m where m.user_id = auth.uid())
  );

-- =====================================================================
-- 3. Verifikationsserien V per räkenskapsår
-- =====================================================================
--
-- Fram till nu numrerades V per kalenderår: varje funktion som bokför
-- (issue_invoice, register_payment, register_reminder, register_rot_payout,
-- void_invoice) tar extract(year from datum) och anropar
-- next_document_number(org, 'V', år). Med brutet räkenskapsår
-- (org_settings.data.fiscalYearStart, t.ex. "07-01") ska serien i stället
-- börja om när räkenskapsåret börjar.
--
-- fiscal_year också i journal_entries är räkenskapsårets etikett: det
-- kalenderår då räkenskapsåret slutar (1 juli 2026 – 30 juni 2027 är 2027,
-- som inkomståret). För kalenderår är det året som förut.
--
-- Funktionerna skrivs inte om här, eftersom andra migrationer arbetar i
-- dem samtidigt och en kopia av deras kroppar skulle skriva över det.
-- I stället rättar en trigger på journal_entries varje V-verifikation vars
-- år inte är räkenskapsåret: numret som funktionen just tog i
-- kalenderårets räknare lämnas tillbaka (raden är låst av transaktionen
-- sedan next_document_number, så ingen annan har hunnit ta ett senare
-- nummer och serien blir obruten), och verifikationen får nästa nummer i
-- räkenskapsårets räknare. Händelsen som funktionen loggar direkt efter
-- (data.entry = "år-nummer") får det rättade numret av en trigger på
-- events. En funktion som redan räknar med räkenskapsåret passerar
-- oförändrad. Befintliga verifikationer och nummer rörs inte.

create or replace function public.fiscal_year_of(p_org uuid, p_date date) returns int
  language sql stable security definer set search_path = public
as $$
  select case
           when m.start_month = 1 or extract(month from p_date)::int < m.start_month then extract(year from p_date)::int
           else extract(year from p_date)::int + 1
         end
  from (
    select coalesce(substring((select s.data->>'fiscalYearStart' from public.org_settings s where s.org_id = p_org) from '^(0[1-9]|1[0-2])-01$')::int, 1) as start_month
  ) m
$$;
revoke all on function public.fiscal_year_of(uuid, date) from public, anon;
grant execute on function public.fiscal_year_of(uuid, date) to authenticated, service_role;

create or replace function public.journal_entries_fiscal_year() returns trigger
  language plpgsql security definer set search_path = public
as $$
declare
  v_fy    int;
  v_map   jsonb := coalesce(nullif(current_setting('binaafy.renumbered_entries', true), ''), '{}')::jsonb;
  v_key   text := new.org_id::text || ':' || new.fiscal_year::text || '-' || new.number::text;
begin
  if new.series <> 'V' then
    return new;
  end if;
  v_fy := public.fiscal_year_of(new.org_id, new.entry_date);
  if new.fiscal_year = v_fy then
    -- Numret används nu på riktigt; en äldre omnumrering med samma etikett gäller inte längre.
    if v_map ? v_key then
      perform set_config('binaafy.renumbered_entries', (v_map - v_key)::text, true);
    end if;
    return new;
  end if;
  update public.number_counters set next = next - 1
    where org_id = new.org_id and series = 'V' and year = new.fiscal_year and next = new.number + 1;
  new.fiscal_year := v_fy;
  new.number := public.next_document_number(new.org_id, 'V', v_fy);
  perform set_config('binaafy.renumbered_entries', (v_map || jsonb_build_object(v_key, v_fy::text || '-' || new.number::text))::text, true);
  return new;
end;
$$;

drop trigger if exists journal_entries_fiscal_year on journal_entries;
create trigger journal_entries_fiscal_year before insert on journal_entries
  for each row execute function journal_entries_fiscal_year();

create or replace function public.events_renumbered_entry() returns trigger
  language plpgsql security definer set search_path = public
as $$
declare
  v_map jsonb;
  v_key text;
begin
  if not (new.data ? 'entry') then
    return new;
  end if;
  v_map := nullif(current_setting('binaafy.renumbered_entries', true), '')::jsonb;
  v_key := new.org_id::text || ':' || (new.data->>'entry');
  if v_map is null or not (v_map ? v_key) then
    return new;
  end if;
  new.data := jsonb_set(new.data, '{entry}', to_jsonb(v_map->>v_key));
  perform set_config('binaafy.renumbered_entries', (v_map - v_key)::text, true);
  return new;
end;
$$;

drop trigger if exists events_renumbered_entry on events;
create trigger events_renumbered_entry before insert on events
  for each row execute function events_renumbered_entry();
