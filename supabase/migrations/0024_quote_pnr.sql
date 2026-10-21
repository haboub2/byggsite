-- Personnummer i offerternas ROT-avdrag krypteras som fakturornas (0023).
-- Kräver 0023 och nyckeln rot_pnr_key i Supabase Vault.
--
-- Före 0024 låg quotes.data -> rotPersons[].personalNumber i klartext. Alla
-- medlemmar i organisationen läser offerterna, och offertens PDF (även i
-- kundportalen) skrev ut numret. Efter 0024:
--
-- * rotPersons[].personalNumber är "ÅÅÅÅMMDD-XXXX" och kryptotexten ligger
--   bredvid i personalNumberSealed, samma format och samma nyckel per
--   organisation som fakturans se.rot.buyers. En trigger på quotes (och
--   quote_templates) krypterar varje klartext som skrivs.
-- * Fakturan från en offert eller en betalplan får det maskerade numret och
--   kryptotexten kopierade; fakturans trigger lämnar dem orörda, så
--   invoice_buyer_pnr() och ROT-begäran öppnar numret som vanligt.
-- * Inget nytt sätt att öppna numret i offerten: det behövs först på fakturan.
-- * Befintliga offerter krypteras här, utan att updated_at ändras.
--
-- Hela migrationen är en transaktion; saknas nyckeln avbryts den utan att
-- något ändrats.

begin;

do $$ begin perform public.rot_pnr_key('00000000-0000-0000-0000-000000000000'); end $$;

-- Byter varje klartext i en lista med personer ({name, personalNumber}) mot
-- ÅÅÅÅMMDD-XXXX + kryptotext, med samma regler som rot_pnr_seal_document:
-- maskerat värde med kryptotext lämnas orört, ett tömt fält tar bort
-- kryptotexten och allt annat är ett fel.
create or replace function public.rot_pnr_seal_persons(p_org uuid, p_list jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = public, extensions, vault
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_p   jsonb;
  v_pnr text;
  v_n   text;
begin
  if p_list is null or jsonb_typeof(p_list) <> 'array' then
    return p_list;
  end if;
  for v_p in select value from jsonb_array_elements(p_list) with ordinality order by ordinality loop
    v_pnr := btrim(coalesce(v_p->>'personalNumber', ''));
    if v_pnr ~ '^(\d{2})?\d{6}-?\d{4}$' then
      v_n := public.rot_pnr_normalize(v_pnr);
      v_p := v_p || jsonb_build_object(
        'personalNumber', substr(v_n, 1, 8) || '-XXXX',
        'personalNumberSealed', replace(encode(public.rot_pnr_encrypt(p_org, v_n), 'base64'), E'\n', ''));
    elsif v_pnr = '' then
      v_p := v_p - 'personalNumberSealed';
    elsif v_pnr !~ '^\d{8}-XXXX$' then
      raise exception 'Personnummer skrivs ÅÅMMDD-XXXX.' using errcode = '22023';
    end if;
    v_out := v_out || jsonb_build_array(v_p);
  end loop;
  return v_out;
end;
$$;

-- Offertens dokument med rotPersons krypterade; oförändrat om inget behövde göras.
create or replace function public.rot_pnr_seal_quote(p_org uuid, p_data jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = public, extensions, vault
as $$
declare
  v_list jsonb := p_data -> 'rotPersons';
  v_new  jsonb;
begin
  if v_list is null or jsonb_typeof(v_list) <> 'array' then
    return p_data;
  end if;
  v_new := public.rot_pnr_seal_persons(p_org, v_list);
  if v_new = v_list then
    return p_data;
  end if;
  return jsonb_set(p_data, '{rotPersons}', v_new);
end;
$$;

revoke all on function public.rot_pnr_seal_persons(uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.rot_pnr_seal_quote(uuid, jsonb) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- befintliga rader

-- updated_at slås av: offertlistan sorteras på den.
alter table quotes disable trigger quotes_set_updated_at;
update quotes set data = public.rot_pnr_seal_quote(org_id, data)
where jsonb_typeof(data -> 'rotPersons') = 'array'
  and public.rot_pnr_seal_quote(org_id, data) is distinct from data;
alter table quotes enable trigger quotes_set_updated_at;

-- Mallarna sparas utan personer, men äldre rader kan ha haft dem.
update quote_templates set data = public.rot_pnr_seal_quote(org_id, data)
where jsonb_typeof(data -> 'rotPersons') = 'array'
  and public.rot_pnr_seal_quote(org_id, data) is distinct from data;

-- ---------------------------------------------------------------- triggrar

create or replace function public.quotes_seal_pnr() returns trigger
  language plpgsql security definer set search_path = public, extensions, vault
as $$
begin
  new.data := public.rot_pnr_seal_quote(new.org_id, new.data);
  return new;
end;
$$;
drop trigger if exists quotes_seal_pnr on quotes;
create trigger quotes_seal_pnr before insert or update of data on quotes
  for each row execute function quotes_seal_pnr();
drop trigger if exists quote_templates_seal_pnr on quote_templates;
create trigger quote_templates_seal_pnr before insert or update of data on quote_templates
  for each row execute function quotes_seal_pnr();

revoke all on function public.quotes_seal_pnr() from public, anon, authenticated, service_role;

commit;
