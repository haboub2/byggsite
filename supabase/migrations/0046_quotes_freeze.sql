-- Offerter låses när de skickats (docs/juridisk-granskning-2026-10-31.md,
-- Offerter H2 och M5; avtalslagen 1 §: det kunden accepterar är avtalets
-- innehåll, så det som skickades måste gå att visa).
--
-- * sent_hash / sent_data: sha256 av `data` och en kopia av dokumentet som
--   det såg ut när offerten skickades (lib/quotes/store.ts markQuoteSent).
-- * acceptance / accepted_at: när, av vem (den som registrerade), vilken
--   version (hash) och om en konsument uttryckligen begärt start under
--   ångerfristen (distansavtalslagen 2 kap. 11 och 15 §§).
-- * quotes_freeze: en skickad offert ändras inte; den återkallas till utkast
--   (data får ändras i samma sats som status blir 'draft', och sent_* nollas)
--   eller dupliceras till en ny. En accepterad offert ändras aldrig och tas
--   aldrig bort; en offert som en faktura hänvisar till tas inte heller bort.

begin;

alter table quotes
  add column if not exists sent_hash   text,
  add column if not exists sent_data   jsonb,
  add column if not exists acceptance  jsonb,
  add column if not exists accepted_at timestamptz;

create or replace function public.quotes_freeze() returns trigger language plpgsql as $$
begin
  if old.status = 'accepted' then
    if new.data is distinct from old.data
       or new.status is distinct from old.status
       or new.number is distinct from old.number
       or new.acceptance is distinct from old.acceptance
       or new.accepted_at is distinct from old.accepted_at
       or new.sent_hash is distinct from old.sent_hash
       or new.sent_data is distinct from old.sent_data
       or new.org_id is distinct from old.org_id then
      raise exception 'Offert % är accepterad och kan inte ändras. Gör en ny offert (Duplicera) för ändringar.', old.number using errcode = '0A000';
    end if;
    return new;
  end if;
  if old.status in ('sent', 'declined') and new.data is distinct from old.data and new.status <> 'draft' then
    raise exception 'Offert % är skickad och kan inte ändras. Återkalla den till utkast eller duplicera den.', old.number using errcode = '0A000';
  end if;
  if new.status = 'accepted' and old.status <> 'accepted' then
    if old.status <> 'sent' then
      raise exception 'Offert % måste vara skickad innan den accepteras.', old.number using errcode = '0A000';
    end if;
    if new.acceptance is null or new.accepted_at is null then
      raise exception 'Offert % accepteras bara med acceptQuote() (lib/quotes/store.ts), som sparar hur.', old.number using errcode = '0A000';
    end if;
    if old.sent_hash is not null and coalesce(new.acceptance->>'hash', '') <> old.sent_hash then
      raise exception 'Offert % har ändrats sedan den skickades; det går inte att acceptera en annan version än den kunden fick.', old.number using errcode = '0A000';
    end if;
  end if;
  if new.status = 'draft' and old.status <> 'draft' then
    -- Återkallad: det som skickades gäller inte längre.
    new.sent_hash := null;
    new.sent_data := null;
    new.sent_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists quotes_freeze on quotes;
create trigger quotes_freeze before update on quotes
  for each row execute function quotes_freeze();

create or replace function public.quotes_no_delete() returns trigger language plpgsql as $$
begin
  if old.status = 'accepted' then
    raise exception 'Offert % är accepterad och kan inte tas bort.', old.number using errcode = '0A000';
  end if;
  if exists (select 1 from public.invoices i where i.quote_id = old.id) then
    raise exception 'Offert % har fakturor och kan inte tas bort.', old.number using errcode = '0A000';
  end if;
  return old;
end;
$$;
drop trigger if exists quotes_no_delete on quotes;
create trigger quotes_no_delete before delete on quotes
  for each row execute function quotes_no_delete();

revoke all on function public.quotes_freeze() from public, anon, authenticated;
revoke all on function public.quotes_no_delete() from public, anon, authenticated;

commit;
