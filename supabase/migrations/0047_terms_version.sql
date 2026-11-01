-- 0047: vilken version av användarvillkoren (/villkor) och personuppgifts-
-- biträdesavtalet (/personuppgiftsbitradesavtal) en registrering godkände.
--
-- 0033 sparar bara accepted_at. Nu sparar start_registration också
-- terms_version (lib/core/org/registration.ts, TERMS_VERSION), och
-- complete_registration kopierar den till organisationen, så det går att
-- visa vilken text ett företag godkände och när. Befintliga rader får null:
-- de godkände kryssrutan innan dokumenten fanns.
--
-- Idempotent: kolumnerna läggs till om de saknas, och den gamla
-- sexparametriga start_registration tas bort innan den nya skapas, så att
-- PostgREST inte ser två överlagringar.

alter table public.pending_registrations add column if not exists terms_version text;
alter table public.organizations add column if not exists terms_version text;

drop function if exists public.start_registration(text, text, text, text, text, text);

create or replace function public.start_registration(
  p_org_name text, p_org_nr text, p_contact_name text, p_email text, p_token text, p_ip text default null,
  p_terms_version text default null
)
returns text
  language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_name    text := btrim(coalesce(p_org_name, ''));
  v_orgnr   text := btrim(coalesce(p_org_nr, ''));
  v_contact text := btrim(coalesce(p_contact_name, ''));
  v_email   text := lower(btrim(coalesce(p_email, '')));
  v_terms   text := nullif(left(btrim(coalesce(p_terms_version, '')), 32), '');
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
           ip = left(p_ip, 64), accepted_at = now(), terms_version = v_terms,
           sent_at = now(), expires_at = now() + interval '7 days'
     where id = v_id;
    return 'resent';
  end if;
  insert into public.pending_registrations (org_name, org_nr, contact_name, email, token_hash, ip, terms_version)
    values (v_name, v_orgnr, v_contact, v_email, v_hash, left(p_ip, 64), v_terms);
  return 'created';
end;
$$;
revoke all on function public.start_registration(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.start_registration(text, text, text, text, text, text, text) to service_role;

-- Som 0033, plus att organisationen får registreringens terms_version.
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
  update public.organizations set terms_version = v_reg.terms_version where id = v_org;
  -- Den som registrerade är kontakten på fakturorna tills inställningarna säger annat.
  update public.org_settings
     set data = jsonb_set(data, '{company}', coalesce(data->'company', '{}'::jsonb) || jsonb_build_object('email', v_reg.email, 'signer', v_reg.contact_name))
   where org_id = v_org;
  update public.pending_registrations set consumed_at = now(), org_id = v_org where id = v_reg.id;
  insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
    values (v_org, 'organization', v_org, 'organization.registered',
            jsonb_build_object('registration', v_reg.id, 'termsVersion', v_reg.terms_version, 'acceptedAt', v_reg.accepted_at),
            jsonb_build_object('kind', 'user', 'id', v_uid, 'name', v_email));
  return v_org;
end;
$$;
revoke all on function public.complete_registration(text) from public, anon;
grant execute on function public.complete_registration(text) to authenticated;
