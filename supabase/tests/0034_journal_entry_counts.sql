-- Prov för 0034 (antal verifikationer per månad). Körs i Supabase
-- SQL-editorn efter 0034. Allt sker i en transaktion som rullas tillbaka: två
-- provanvändare, två provorganisationer, inget blir kvar. Ett fel avbryter
-- med ett tydligt meddelande; "Prov 0034: alla gick igenom" betyder att allt
-- höll.
--
--   A1  owner i organisation A: två verifikationer i augusti, en i
--       september, en i oktober (utanför intervallet)
--   B1  owner i organisation B: tre i augusti, som A1 aldrig får räkna

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000034a1', 'a-agare@prov.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000034b1', 'b-agare@prov.se', 'authenticated', 'authenticated');

create temp table prov (k text primary key, v uuid) on commit drop;
grant all on prov to authenticated, service_role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000034b1","role":"authenticated","email":"b-agare@prov.se"}';
insert into prov values ('b', create_organization('Prov B AB', ''));
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000034a1","role":"authenticated","email":"a-agare@prov.se"}';
insert into prov values ('a', create_organization('Prov A AB', ''));

-- Verifikationerna skrivs annars bara av databasfunktionerna; här direkt.
reset role;
set local request.jwt.claims = '';
insert into journal_entries (org_id, series, fiscal_year, number, entry_date, text, source_type)
select (select v from prov where k = o), 'V', 2026, n, d::date, 'Prov 0034', 'invoice'
  from (values ('a', 9001, '2026-08-01'), ('a', 9002, '2026-08-31'), ('a', 9003, '2026-09-15'), ('a', 9004, '2026-10-01'),
               ('b', 9001, '2026-08-05'), ('b', 9002, '2026-08-06'), ('b', 9003, '2026-08-07')) as x(o, n, d);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000034a1","role":"authenticated","email":"a-agare@prov.se"}';
do $$
declare
  v_a uuid := (select v from prov where k = 'a');
  v_b uuid := (select v from prov where k = 'b');
  v_got text;
begin
  -- Per månad, äldst först, bara månader med verifikationer, gränsdagarna med.
  select string_agg(period || '=' || count, ',' order by period) into v_got from journal_entry_counts(v_a, '2026-07-01', '2026-09-30');
  if v_got is distinct from '2026-08=2,2026-09=1' then raise exception 'Fel räkning för A: %', v_got; end if;

  -- Utan org: alla organisationer A1 är medlem i, alltså bara A.
  select string_agg(period || '=' || count, ',' order by period) into v_got from journal_entry_counts(null, '2026-07-01', '2026-09-30');
  if v_got is distinct from '2026-08=2,2026-09=1' then raise exception 'Fel räkning utan org: %', v_got; end if;

  -- B:s verifikationer räknas inte för A1 (RLS, security invoker).
  if exists (select 1 from journal_entry_counts(v_b, '2026-01-01', '2026-12-31')) then
    raise exception 'A1 fick räkna B:s verifikationer.';
  end if;
end $$;

-- Utloggad (anon) får inte köra funktionen.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
begin
  begin
    perform journal_entry_counts(null, '2026-01-01', '2026-12-31');
    raise exception 'anon fick köra journal_entry_counts.';
  exception when insufficient_privilege then null;
  end;
end $$;

do $$ begin raise notice 'Prov 0034: alla gick igenom'; end $$;

rollback;
