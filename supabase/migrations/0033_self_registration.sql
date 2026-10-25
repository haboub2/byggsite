-- 0033: självregistrering. Ett nytt byggföretag registrerar sig på
-- /registrera utan inbjudan:
--
-- 1. Formuläret sparar en väntande registrering (pending_registrations) med
--    start_registration() och skickar en inloggningslänk (Supabase Auth,
--    signInWithOtp). Länken bär en token; bara dess sha256 sparas.
--    Samma e-post med en öppen registrering får samma rad med en ny token
--    (den gamla länken slutar gälla), aldrig en ny rad.
-- 2. Länken landar på /admin/registrera/klar, som anropar
--    complete_registration() som den inloggade användaren. Funktionen
--    kontrollerar token, giltighetstid och att den inloggade adressen är den
--    registrerade, skapar organisationen med create_organization() (0021),
--    fyller i kontaktuppgifterna och markerar registreringen förbrukad, allt
--    i en transaktion. En förbrukad token kan inte användas igen.
--
-- Tabellen har RLS utan policyer: ingen läser eller skriver den direkt.
-- start_registration körs bara med service role (server action med
-- rate limit per IP), complete_registration av den inloggade.

create table if not exists public.pending_registrations (
  id           uuid primary key default gen_random_uuid(),
  org_name     text not null check (char_length(org_name) between 2 and 120),
  org_nr       text not null default '' check (org_nr = '' or org_nr ~ '^\d{6}-\d{4}$'),
  contact_name text not null check (char_length(contact_name) between 1 and 120),
  email        text not null check (email = lower(email) and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  token_hash   text not null unique,
  ip           text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',
  consumed_at  timestamptz,
  org_id       uuid references public.organizations(id) on delete set null
);
-- En öppen registrering per adress; en ny begäran återanvänder raden.
create unique index if not exists pending_registrations_open_email_uq on public.pending_registrations (email) where consumed_at is null;
create index if not exists pending_registrations_created_idx on public.pending_registrations (created_at desc);

alter table public.pending_registrations enable row level security;
revoke all on public.pending_registrations from anon, authenticated;

create or replace function public.registration_token_hash(p_token text)
returns text
  language sql immutable set search_path = public, extensions
as $$
  select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
$$;
revoke all on function public.registration_token_hash(text) from public, anon, authenticated;

-- Spara eller förnya en väntande registrering. Returnerar 'created' eller
-- 'resent'. p_token är den slumpade token som står i länken.
create or replace function public.start_registration(
  p_org_name text, p_org_nr text, p_contact_name text, p_email text, p_token text, p_ip text default null
)
returns text
  language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_name    text := btrim(coalesce(p_org_name, ''));
  v_orgnr   text := btrim(coalesce(p_org_nr, ''));
  v_contact text := btrim(coalesce(p_contact_name, ''));
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_hash    text;
  v_id      uuid;
begin
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Företagsnamnet ska vara 2–120 tecken.' using errcode = '22023';
  end if;
  if v_orgnr !~ '^\d{6}-?\d{4}$' then
    raise exception 'Organisationsnummer skrivs 559123-4567.' using errcode = '22023';
  end if;
  if v_orgnr ~ '^\d{10}$' then
    v_orgnr := substr(v_orgnr, 1, 6) || '-' || substr(v_orgnr, 7);
  end if;
  if char_length(v_contact) < 1 or char_length(v_contact) > 120 then
    raise exception 'Ange ditt namn.' using errcode = '22023';
  end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or char_length(v_email) > 320 then
    raise exception 'Ange en giltig e-postadress.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_token, '')) < 32 then
    raise exception 'Token saknas.' using errcode = '22023';
  end if;
  v_hash := public.registration_token_hash(p_token);

  select id into v_id from public.pending_registrations where email = v_email and consumed_at is null for update;
  if found then
    update public.pending_registrations
       set org_name = v_name, org_nr = v_orgnr, contact_name = v_contact, token_hash = v_hash,
           ip = left(p_ip, 64), sent_at = now(), expires_at = now() + interval '7 days'
     where id = v_id;
    return 'resent';
  end if;
  insert into public.pending_registrations (org_name, org_nr, contact_name, email, token_hash, ip)
    values (v_name, v_orgnr, v_contact, v_email, v_hash, left(p_ip, 64));
  return 'created';
end;
$$;
revoke all on function public.start_registration(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.start_registration(text, text, text, text, text, text) to service_role;

-- Skapa organisationen för en väntande registrering, som den inloggade.
-- Returnerar organisationens id.
create or replace function public.complete_registration(p_token text)
returns uuid
  language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_reg   public.pending_registrations%rowtype;
  v_org   uuid;
begin
  if v_uid is null then
    raise exception 'Logga in för att slutföra registreringen.' using errcode = '42501';
  end if;
  select * into v_reg from public.pending_registrations where token_hash = public.registration_token_hash(p_token) for update;
  if not found then
    raise exception 'Registreringen finns inte. Öppna länken i det senaste mejlet.' using errcode = 'P0002';
  end if;
  if v_reg.consumed_at is not null then
    raise exception 'Registreringen är redan slutförd. Logga in som vanligt.' using errcode = '22023';
  end if;
  if v_reg.expires_at < now() then
    raise exception 'Länken har gått ut. Registrera företaget igen.' using errcode = '22023';
  end if;
  if v_reg.email <> v_email then
    raise exception 'Registreringen gäller %, men du är inloggad som %.', v_reg.email, v_email using errcode = '42501';
  end if;

  v_org := public.create_organization(v_reg.org_name, v_reg.org_nr);
  -- Den som registrerade är kontakten på fakturorna tills inställningarna säger annat.
  update public.org_settings
     set data = jsonb_set(data, '{company}', coalesce(data->'company', '{}'::jsonb) || jsonb_build_object('email', v_reg.email, 'signer', v_reg.contact_name))
   where org_id = v_org;
  update public.pending_registrations set consumed_at = now(), org_id = v_org where id = v_reg.id;
  insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
    values (v_org, 'organization', v_org, 'organization.registered', jsonb_build_object('registration', v_reg.id),
            jsonb_build_object('kind', 'user', 'id', v_uid, 'name', v_email));
  return v_org;
end;
$$;
revoke all on function public.complete_registration(text) from public, anon;
grant execute on function public.complete_registration(text) to authenticated;
