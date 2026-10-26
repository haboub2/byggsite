-- Antal verifikationer per månad, i en fråga.
--
-- journal_entry_counts() Ekonomisidan visar de tolv senaste avslutade
--                        månaderna och hur många verifikationer var och en
--                        har (lib/core/ledger/store.ts, journalEntryCounts).
--                        Tidigare blev det en räkning per månad, tolv anrop
--                        per sidvisning; nu ett. Bara månader med
--                        verifikationer kommer tillbaka; appen fyller i 0
--                        för resten.
--
-- security invoker: RLS på journal_entries (0014) avgör vilka rader som
-- räknas, så en användare räknar bara sina egna organisationers
-- verifikationer. p_org null räknar alla organisationer användaren är medlem
-- i, som frågan gjorde tidigare utan org-filter.
--
-- Bara en ny funktion: inget befintligt ändras, så den kan köras när som
-- helst. Appen faller tillbaka på räkningen per månad tills den finns.
--
-- Körs i Supabase SQL-editorn efter 0033.

create or replace function public.journal_entry_counts(p_org uuid, p_from date, p_to date)
  returns table (period text, count bigint)
  language sql stable security invoker set search_path = public
as $$
  select to_char(e.entry_date, 'YYYY-MM'), count(*)
    from public.journal_entries e
   where (p_org is null or e.org_id = p_org)
     and e.entry_date between p_from and p_to
   group by 1
   order by 1
$$;
revoke all on function public.journal_entry_counts(uuid, date, date) from public, anon;
grant execute on function public.journal_entry_counts(uuid, date, date) to authenticated, service_role;
