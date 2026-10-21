-- Personnummer för ROT krypteras i databasen (docs/fakturering.md, fas 5,
-- "Kryptering av personnummer (0023)").
--
-- Före 0023 låg köparens personnummer i klartext på två ställen:
-- rot_buyers.personal_number (bara owner/admin via RLS) och fakturans
-- dokument, invoices.document -> se.rot.buyers[].personalNumber, som alla
-- medlemmar och portalkunden läser. Efter 0023:
--
-- * Nyckeln ligger i Supabase Vault (vault.decrypted_secrets, namnet
--   rot_pnr_key) och lämnar aldrig databasen. Den skapas före migrationen:
--     select vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'),
--                                'rot_pnr_key', 'Nyckel för personnummer i ROT (0023)');
--   Varje organisation får sin egen härledda nyckel (Vault-nyckeln + org_id),
--   så en kryptotext går inte att öppna i en annan organisation.
-- * Kryptering: pgcrypto pgp_sym_encrypt (AES-256) av det tolvsiffriga
--   personnumret. I dokumentet blir personalNumber "ÅÅÅÅMMDD-XXXX" och
--   kryptotexten ligger bredvid i personalNumberSealed (base64). En trigger på
--   invoices och recurring_invoices krypterar varje klartext som skrivs, vilken
--   väg den än kommer (formuläret, API:t, offert, betalplan, kreditering).
-- * rot_buyers får personal_number_enc (bytea) och personal_number_masked;
--   klartextkolumnen tas bort. Raderna skapas med rot_buyer_from_invoice(),
--   som kopierar kryptotexten från fakturan utan att dekryptera.
-- * Dekryptering bara i invoice_buyer_pnr() och rot_buyer_pnr(), för
--   owner/admin i organisationen eller service role. Staff, accountant,
--   readonly och portalkunder får aldrig klartexten.
-- * Befintliga rader krypteras här. Utfärdade fakturor är låsta
--   (invoices_freeze); låset slås av för just den uppdateringen och sha256
--   räknas om för det krypterade dokumentet. Den som redan har fått PDF:en har
--   personnumret där; nya PDF:er visar ÅÅÅÅMMDD-XXXX.
-- * Inget hashvärde för att känna igen samma köpare: koden behöver det inte,
--   och en hash av ett personnummer går att gissa sig tillbaka från.
--
-- Hela migrationen är en transaktion: saknas nyckeln avbryts den utan att
-- något ändrats.

begin;

-- ---------------------------------------------------------------- nyckeln

create or replace function public.rot_pnr_key(p_org uuid) returns text
  language plpgsql stable security definer set search_path = public, extensions, vault
as $$
declare
  v_key text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'rot_pnr_key' limit 1;
  if v_key is null or length(v_key) < 32 then
    raise exception 'Nyckeln rot_pnr_key saknas i Supabase Vault. Skapa den först, se 0023_rot_pnr_encryption.sql.';
  end if;
  return v_key || ':' || p_org::text;
end;
$$;

do $$ begin perform public.rot_pnr_key('00000000-0000-0000-0000-000000000000'); end $$;

-- "850412-1234" → "198504121234", samma regel som toTwelveDigitPersonalNumber
-- i lib/core/rot/claim-xml.ts: köparen är minst 18 år. Null om det inte är 10
-- eller 12 siffror.
create or replace function public.rot_pnr_normalize(p text, p_today date default current_date) returns text
  language plpgsql stable set search_path = public
as $$
declare
  v_d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  v_yy int;
  v_year int := extract(year from p_today)::int;
  v_this int;
begin
  if length(v_d) = 12 then return v_d; end if;
  if length(v_d) <> 10 then return null; end if;
  v_yy := substr(v_d, 1, 2)::int;
  v_this := (v_year / 100) * 100;
  return ((case when v_year - (v_this + v_yy) >= 18 then v_this else v_this - 100 end) + v_yy)::text || substr(v_d, 3);
end;
$$;

create or replace function public.rot_pnr_encrypt(p_org uuid, p_pnr12 text) returns bytea
  language sql volatile security definer set search_path = public, extensions, vault
as $$ select pgp_sym_encrypt(p_pnr12, public.rot_pnr_key(p_org), 'cipher-algo=aes256') $$;

create or replace function public.rot_pnr_decrypt(p_org uuid, p_enc bytea) returns text
  language sql stable security definer set search_path = public, extensions, vault
as $$ select pgp_sym_decrypt(p_enc, public.rot_pnr_key(p_org)) $$;

-- Byter varje klartext i se.rot.buyers mot ÅÅÅÅMMDD-XXXX + kryptotext.
-- Maskerade värden med kryptotext lämnas orörda; ett tömt fält tar bort
-- kryptotexten. Allt annat är ett fel (zod släpper aldrig igenom det).
create or replace function public.rot_pnr_seal_document(p_org uuid, p_doc jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = public, extensions, vault
as $$
declare
  v_buyers jsonb := p_doc #> '{se,rot,buyers}';
  v_out    jsonb := '[]'::jsonb;
  v_b      jsonb;
  v_pnr    text;
  v_n      text;
  v_changed boolean := false;
begin
  if v_buyers is null or jsonb_typeof(v_buyers) <> 'array' then
    return p_doc;
  end if;
  for v_b in select value from jsonb_array_elements(v_buyers) with ordinality order by ordinality loop
    v_pnr := btrim(coalesce(v_b->>'personalNumber', ''));
    if v_pnr ~ '^(\d{2})?\d{6}-?\d{4}$' then
      v_n := public.rot_pnr_normalize(v_pnr);
      v_b := v_b || jsonb_build_object(
        'personalNumber', substr(v_n, 1, 8) || '-XXXX',
        'personalNumberSealed', replace(encode(public.rot_pnr_encrypt(p_org, v_n), 'base64'), E'\n', ''));
      v_changed := true;
    elsif v_pnr = '' then
      if v_b ? 'personalNumberSealed' then
        v_b := v_b - 'personalNumberSealed';
        v_changed := true;
      end if;
    elsif v_pnr !~ '^\d{8}-XXXX$' then
      raise exception 'Personnummer skrivs ÅÅMMDD-XXXX.' using errcode = '22023';
    end if;
    v_out := v_out || jsonb_build_array(v_b);
  end loop;
  if not v_changed then
    return p_doc;
  end if;
  return jsonb_set(p_doc, '{se,rot,buyers}', v_out);
end;
$$;

revoke all on function public.rot_pnr_key(uuid) from public, anon, authenticated, service_role;
revoke all on function public.rot_pnr_encrypt(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.rot_pnr_decrypt(uuid, bytea) from public, anon, authenticated, service_role;
revoke all on function public.rot_pnr_seal_document(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.rot_pnr_normalize(text, date) from public, anon;

-- ---------------------------------------------------------------- befintliga rader

-- Fakturor, även utfärdade: låset och updated_at slås av för den här
-- uppdateringen. sha256 följer det krypterade dokumentet.
alter table invoices disable trigger invoices_freeze;
alter table invoices disable trigger invoices_set_updated_at;
with sealed as (
  select id, public.rot_pnr_seal_document(org_id, document) as doc
  from invoices
  where jsonb_typeof(document #> '{se,rot,buyers}') = 'array'
)
update invoices i set
  document = s.doc,
  sha256 = case when i.sha256 is null then null else encode(digest(s.doc::text, 'sha256'), 'hex') end
from sealed s
where s.id = i.id and s.doc is distinct from i.document;
alter table invoices enable trigger invoices_freeze;
alter table invoices enable trigger invoices_set_updated_at;

update recurring_invoices set template = public.rot_pnr_seal_document(org_id, template)
where jsonb_typeof(template #> '{se,rot,buyers}') = 'array';

-- Sparade API-svar (Idempotency-Key) kan innehålla ett fakturadokument.
update idempotency_keys set response = jsonb_set(response, '{document}', public.rot_pnr_seal_document(org_id, response->'document'))
where jsonb_typeof(response #> '{document,se,rot,buyers}') = 'array';

-- rot_buyers: krypterad kolumn och maskerad visning, klartexten bort.
alter table rot_buyers add column if not exists personal_number_enc bytea;
alter table rot_buyers add column if not exists personal_number_masked text;
update rot_buyers set
  personal_number_enc = public.rot_pnr_encrypt(org_id, public.rot_pnr_normalize(personal_number)),
  personal_number_masked = substr(public.rot_pnr_normalize(personal_number), 1, 8) || '-XXXX'
where personal_number_enc is null;
alter table rot_buyers alter column personal_number_enc set not null;
alter table rot_buyers alter column personal_number_masked set not null;
alter table rot_buyers drop column personal_number;

-- Kryptotexten går inte att välja ens för owner/admin; den läses bara genom
-- rot_buyer_pnr(). Raderna skapas bara genom rot_buyer_from_invoice().
revoke all on rot_buyers from anon, authenticated;
grant select (id, org_id, invoice_id, name, personal_number_masked, share_ore, property, category, created_at) on rot_buyers to authenticated;

-- ---------------------------------------------------------------- triggrar

create or replace function public.invoices_seal_pnr() returns trigger
  language plpgsql security definer set search_path = public, extensions, vault
as $$
declare
  v_doc jsonb;
begin
  v_doc := public.rot_pnr_seal_document(new.org_id, new.document);
  if v_doc is distinct from new.document then
    new.document := v_doc;
    -- issue_invoice() räknar sha256 på dokumentet den fick; följ med om det ändrades här.
    if new.sha256 is not null then
      new.sha256 := encode(digest(v_doc::text, 'sha256'), 'hex');
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists invoices_seal_pnr on invoices;
create trigger invoices_seal_pnr before insert or update of document on invoices
  for each row execute function invoices_seal_pnr();

create or replace function public.recurring_invoices_seal_pnr() returns trigger
  language plpgsql security definer set search_path = public, extensions, vault
as $$
begin
  new.template := public.rot_pnr_seal_document(new.org_id, new.template);
  return new;
end;
$$;
drop trigger if exists recurring_invoices_seal_pnr on recurring_invoices;
create trigger recurring_invoices_seal_pnr before insert or update of template on recurring_invoices
  for each row execute function recurring_invoices_seal_pnr();

revoke all on function public.invoices_seal_pnr() from public, anon, authenticated, service_role;
revoke all on function public.recurring_invoices_seal_pnr() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- åtkomst

-- En köpare i en ROT-begäran, från fakturans köpare nr p_index (0-baserat).
-- Kryptotexten kopieras; inget dekrypteras. Den som får skriva fakturor får
-- skapa begäran, men bara owner/admin läser personnumret.
create or replace function public.rot_buyer_from_invoice(
  p_invoice uuid,
  p_index int,
  p_share_ore bigint,
  p_property jsonb,
  p_category text default 'Bygg'
) returns uuid
  language plpgsql security definer set search_path = public, extensions, vault
as $$
declare
  v_inv public.invoices%rowtype;
  v_b   jsonb;
  v_id  uuid;
begin
  select * into v_inv from public.invoices where id = p_invoice;
  if not found then
    raise exception 'Fakturan finns inte.';
  end if;
  if not public.can_write_org_or_system(v_inv.org_id) then
    raise exception 'Saknar behörighet.' using errcode = '42501';
  end if;
  v_b := v_inv.document #> array['se', 'rot', 'buyers', p_index::text];
  if v_b is null or coalesce(v_b->>'personalNumberSealed', '') = '' then
    raise exception 'Personnummer saknas för köpare % på faktura %.', p_index + 1, v_inv.number;
  end if;
  insert into public.rot_buyers (org_id, invoice_id, name, personal_number_enc, personal_number_masked, share_ore, property, category)
    values (v_inv.org_id, p_invoice, coalesce(v_b->>'name', ''), decode(v_b->>'personalNumberSealed', 'base64'),
            v_b->>'personalNumber', p_share_ore, p_property, coalesce(p_category, 'Bygg'))
    returning id into v_id;
  return v_id;
end;
$$;

-- Tolvsiffrigt personnummer för en köpare i en begäran (XML-filen).
create or replace function public.rot_buyer_pnr(p_buyer uuid) returns text
  language plpgsql stable security definer set search_path = public, extensions, vault
as $$
declare
  v_org uuid;
  v_enc bytea;
begin
  select org_id, personal_number_enc into v_org, v_enc from public.rot_buyers where id = p_buyer;
  if not found then
    raise exception 'Köparen finns inte.';
  end if;
  if not (public.can_admin_org(v_org) or coalesce(auth.jwt()->>'role', '') = 'service_role') then
    raise exception 'Bara ägare och administratörer ser personnummer.' using errcode = '42501';
  end if;
  return public.rot_pnr_decrypt(v_org, v_enc);
end;
$$;

-- Tolvsiffrigt personnummer för fakturans köpare nr p_index (0-baserat).
create or replace function public.invoice_buyer_pnr(p_invoice uuid, p_index int) returns text
  language plpgsql stable security definer set search_path = public, extensions, vault
as $$
declare
  v_org uuid;
  v_doc jsonb;
  v_sealed text;
begin
  select org_id, document into v_org, v_doc from public.invoices where id = p_invoice;
  if not found then
    raise exception 'Fakturan finns inte.';
  end if;
  if not (public.can_admin_org(v_org) or coalesce(auth.jwt()->>'role', '') = 'service_role') then
    raise exception 'Bara ägare och administratörer ser personnummer.' using errcode = '42501';
  end if;
  v_sealed := v_doc #>> array['se', 'rot', 'buyers', p_index::text, 'personalNumberSealed'];
  if coalesce(v_sealed, '') = '' then
    return null;
  end if;
  return public.rot_pnr_decrypt(v_org, decode(v_sealed, 'base64'));
end;
$$;

revoke all on function public.rot_buyer_from_invoice(uuid, int, bigint, jsonb, text) from public, anon;
revoke all on function public.rot_buyer_pnr(uuid) from public, anon;
revoke all on function public.invoice_buyer_pnr(uuid, int) from public, anon;
grant execute on function public.rot_buyer_from_invoice(uuid, int, bigint, jsonb, text) to authenticated, service_role;
grant execute on function public.rot_buyer_pnr(uuid) to authenticated, service_role;
grant execute on function public.invoice_buyer_pnr(uuid, int) to authenticated, service_role;

commit;
