-- Förmåner, utlägg, Collectum och ägarnas löneuttag, fas 5 (docs/hr-lon.md,
-- avsnitt 3, 6, 7, 11 och 12). Läggs på efter 0035–0041, som inte ändras;
-- funktioner som byts ut här (pension_basis, pension_report_store,
-- payroll_inputs_hash, seed_payroll_accounts) skrivs om med create or replace.
--
-- Appen räknar (lib/core/payroll/benefits.ts, expenses.ts, collectum.ts,
-- owner-planner.ts); databasen lagrar, fryser och kontrollerar summor och
-- övre gränser, ingen lönematematik.
--
-- 1. benefits: förmåner per person (bil, kost, bostad, annan) med det
--    månadsvärde och den regelversion appen räknade fram. Körningen räknar
--    om värdet för lönedagens regler och lägger raden på lönebeskedet med
--    källan (source.kind = 'benefit'). När en godkänd körning har betalat
--    förmånen fryses raden: bara valid_to får sättas (inte före den sista
--    betalda månaden); en ändring är en ny rad.
-- 2. expense_claims: utlägg, milersättning och traktamente med kvitton i
--    hinken hr under {org}/{person}/kvitto-{id}-{n}.{ext}. Den anställde
--    skriver sina utkast och skickar in (expense_submit); ägare och
--    administratörer godkänner (expense_approve, med appens uppdelning i
--    skattefritt och skattepliktigt, inom regelbokens gränser) eller avslår
--    (expense_reject). Godkänd är fryst. Betald sätts bara när körningen som
--    bar raderna (source.kind = 'expense_claim') godkänns: en trigger på
--    pay_runs, inte payroll_run_approve (0039 ändras inte).
-- 3. payroll_inputs_hash: tar med godkända obetalda utlägg och förmånerna,
--    så att ett utlägg som godkänns eller en förmån som ändras efter
--    beräkningen stoppar godkännandet ("räkna om").
-- 4. Collectum: collectum_basis() ger den pensionsmedförande lönen per
--    ITP1-person och månad ur de stängda körningarna (lönearter med
--    pension_reportable); pension_basis() och pension_report_store() tar nu
--    scheme 'collectum' också. Raderna i pension_reports som förut.
-- 5. owner_planner_snapshots: planerarens indata och utfall per ägare och
--    år, sparade (bara insert).
-- 6. Konton 2514 och 7533 (särskild löneskatt) i kontoplanen.
-- 7. RLS: lönebehöriga läser allt; den anställde läser sina förmåner och
--    sina utlägg och skriver sina utkast; ägare och administratörer skriver
--    förmåner och godkänner utlägg; staff och readonly ingenting.
--
-- HFD 2017 ref. 41 (styrelsearvode kan normalt inte faktureras från
-- ledamotens bolag): leverantörskostnaderna (project_costs, kind
-- 'supplier') har inget organisationsnummer att jämföra med, så regeln står
-- i avtalet om styrelseuppdrag och på personsidan i stället för en kontroll.

begin;

-- =====================================================================
-- 0. Regler som SQL behöver (samma tal som regelboken; prov i
--    lib/core/payroll/expenses.test.ts)
-- =====================================================================

-- Skattefria schabloner 2026: milersättning per mil (egen bil, förmånsbil
-- bensin/diesel, förmånsbil el) och traktamente (hel dag, halv dag, natt).
-- Övre gränser för expense_approve; uppdelningen räknas i appen.
create or replace function public.expense_rules(out own_car_per_mil_ore bigint, out company_car_per_mil_ore bigint,
                                                out company_el_per_mil_ore bigint, out per_diem_full_ore bigint,
                                                out per_diem_half_ore bigint, out per_diem_night_ore bigint)
  language sql immutable
as $$ select 2500::bigint, 1200::bigint, 950::bigint, 30000::bigint, 15000::bigint, 15000::bigint $$;

-- =====================================================================
-- 1. Förmåner
-- =====================================================================

create table benefits (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references organizations(id) on delete cascade,
  employee_id            uuid not null,
  kind                   text not null check (kind in ('bil','kost','bostad','annan')),
  description            text not null default '' check (char_length(description) <= 200),
  valid_from             date not null,
  valid_to               date,
  -- Bil (Skatteverkets formel, benefits.ts carBenefit)
  registration_number    text check (registration_number is null or registration_number ~ '^[A-Z0-9]{2,7}$'),
  car_model              text not null default '' check (char_length(car_model) <= 120),
  first_registered_on    date,
  model_year             int check (model_year is null or model_year between 1950 and 2100),
  fuel                   text check (fuel is null or fuel in ('bensin','diesel','el','laddhybrid','vatgas','gas','etanol','annan')),
  new_car_price_ore      bigint check (new_car_price_ore is null or new_car_price_ore >= 0),
  extra_equipment_ore    bigint not null default 0 check (extra_equipment_ore >= 0),
  vehicle_tax_ore        bigint not null default 0 check (vehicle_tax_ore >= 0),     -- fordonsskatt per år
  business_mil_per_year  int not null default 0 check (business_mil_per_year >= 0), -- tjänstekörning i mil
  fuel_paid_by_employer  boolean not null default false,
  private_fuel_ore       bigint not null default 0 check (private_fuel_ore >= 0),     -- drivmedel för privat körning per månad, marknadsvärde
  -- Kost (antal måltider per månad), bostad (yta och område för Skatteverkets schablon), annan (marknadsvärde per månad)
  meals                  jsonb not null default '{}'::jsonb check (jsonb_typeof(meals) = 'object'),
  housing_area_m2        numeric(6,1) check (housing_area_m2 is null or housing_area_m2 > 0),
  housing_region         text check (housing_region is null or housing_region in ('storstockholm','storgoteborg','stormalmo','over75000','tatort','ovrigt')),
  market_value_ore       bigint not null default 0 check (market_value_ore >= 0),
  employee_payment_ore   bigint not null default 0 check (employee_payment_ore >= 0), -- vad den anställde betalar per månad
  -- Det appen räknade: värde per månad, regelversionen och parametrarna.
  monthly_value_ore      bigint not null check (monthly_value_ore >= 0),
  rule_version           text not null,
  computation            jsonb not null default '{}'::jsonb,
  created_by             uuid default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (id, org_id),
  foreign key (employee_id, org_id) references employees(id, org_id),
  check (valid_to is null or valid_to >= valid_from),
  check (kind <> 'bil' or (new_car_price_ore is not null and first_registered_on is not null and fuel is not null and registration_number is not null
                           and model_year is not null)),
  check (kind <> 'bostad' or (housing_area_m2 is not null and housing_region is not null))
);
create index benefits_employee_idx on benefits (employee_id, valid_from);
create trigger benefits_set_updated_at before update on benefits
  for each row execute function set_updated_at();

-- Den sista betalda månadens slut för en förmån (godkända lönebesked med en rad vars källa är förmånen).
create or replace function public.benefit_paid_until(p_benefit uuid) returns date
  language sql stable security definer set search_path = public
as $$
  select max((p.document->>'periodEnd')::date)
    from public.payslips p, jsonb_array_elements(p.document->'lines') l
   where p.approved_at is not null and l->'source'->>'kind' = 'benefit' and l->'source'->>'id' = p_benefit::text
$$;
revoke all on function public.benefit_paid_until(uuid) from public, anon;
grant execute on function public.benefit_paid_until(uuid) to authenticated;

create or replace function public.benefits_freeze() returns trigger
  language plpgsql set search_path = public
as $$
declare
  v_paid date := public.benefit_paid_until(old.id);
begin
  if v_paid is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Förmånen är betald på ett godkänt lönebesked och tas inte bort; sätt ett slutdatum.' using errcode = '0A000';
  end if;
  if (to_jsonb(new) - array['valid_to','updated_at']) <> (to_jsonb(old) - array['valid_to','updated_at']) then
    raise exception 'Förmånen är betald på ett godkänt lönebesked och ändras inte; sätt ett slutdatum och lägg in en ny.' using errcode = '0A000';
  end if;
  if new.valid_to is not null and new.valid_to < v_paid then
    raise exception 'Förmånen är betald till och med %; slutdatumet kan inte ligga före.', v_paid using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger benefits_freeze before update or delete on benefits
  for each row execute function benefits_freeze();

create or replace function public.benefits_events() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.hr_log(new.org_id, new.employee_id, 'benefit.saved',
      jsonb_build_object('benefitId', new.id, 'kind', new.kind, 'monthlyValueOre', new.monthly_value_ore, 'validFrom', new.valid_from));
  elsif tg_op = 'UPDATE' and new.valid_to is distinct from old.valid_to and (to_jsonb(new) - array['valid_to','updated_at']) = (to_jsonb(old) - array['valid_to','updated_at']) then
    perform public.hr_log(new.org_id, new.employee_id, 'benefit.ended', jsonb_build_object('benefitId', new.id, 'kind', new.kind, 'validTo', new.valid_to));
  elsif tg_op = 'UPDATE' then
    perform public.hr_log(new.org_id, new.employee_id, 'benefit.saved',
      jsonb_build_object('benefitId', new.id, 'kind', new.kind, 'monthlyValueOre', new.monthly_value_ore, 'validFrom', new.valid_from));
  else
    perform public.hr_log(old.org_id, old.employee_id, 'benefit.ended', jsonb_build_object('benefitId', old.id, 'kind', old.kind, 'removed', true));
  end if;
  return null;
end;
$$;
create trigger benefits_events after insert or update or delete on benefits
  for each row execute function benefits_events();

-- =====================================================================
-- 2. Utlägg, milersättning och traktamente
-- =====================================================================

create table expense_claims (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  employee_id       uuid not null,
  kind              text not null check (kind in ('utlagg','milersattning','traktamente')),
  date_from         date not null,
  date_to           date not null,
  description       text not null default '' check (char_length(description) <= 400),
  -- Utlägg: beloppet med moms och momsen (bokföringen av momsen görs av redovisningen).
  amount_ore        bigint check (amount_ore is null or amount_ore >= 0),
  vat_ore           bigint not null default 0 check (vat_ore >= 0),
  -- Milersättning: kilometer och bil.
  distance_km       numeric(8,1) check (distance_km is null or distance_km > 0),
  car_type          text check (car_type is null or car_type in ('egen','formansbil','formansbil_el')),
  -- Traktamente: resmål, avresa och hemkomst, nätter utan betalt logi, givna måltider, och om
  -- tjänsteresan är längre än tre månader eller två år på samma ort.
  destination       text not null default '' check (char_length(destination) <= 200),
  departure_time    time,
  return_time       time,
  nights            int not null default 0 check (nights >= 0),
  nights_without_lodging int not null default 0 check (nights_without_lodging >= 0),
  meals             jsonb not null default '{}'::jsonb check (jsonb_typeof(meals) = 'object'),
  long_stay         text not null default 'none' check (long_stay in ('none','after3months','after2years')),
  -- Appens uppdelning (förhandsvisning tills godkännandet, sedan den som gäller).
  tax_free_ore      bigint not null default 0 check (tax_free_ore >= 0),
  taxable_ore       bigint not null default 0 check (taxable_ore >= 0),
  computation       jsonb not null default '{}'::jsonb,
  rule_version      text,
  receipts          jsonb not null default '[]'::jsonb check (jsonb_typeof(receipts) = 'array'), -- [{path, sha256, size, contentType, name}]
  status            text not null default 'draft' check (status in ('draft','submitted','approved','rejected','paid')),
  submitted_at      timestamptz,
  approved_by       uuid,
  approved_by_name  text,
  approved_at       timestamptz,
  rejected_reason   text,
  rejected_at       timestamptz,
  payslip_id        uuid references payslips(id),
  paid_at           timestamptz,
  note              text not null default '' check (char_length(note) <= 400),
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, org_id),
  foreign key (employee_id, org_id) references employees(id, org_id),
  check (date_to >= date_from),
  check (kind <> 'utlagg' or amount_ore is not null),
  check (kind <> 'milersattning' or (distance_km is not null and car_type is not null)),
  check (kind <> 'traktamente' or destination <> ''),
  check (nights_without_lodging <= nights),
  check (status not in ('approved','paid') or (approved_at is not null and approved_by is not null)),
  check ((status = 'paid') = (payslip_id is not null and paid_at is not null)),
  check (status <> 'rejected' or rejected_reason is not null)
);
create index expense_claims_employee_idx on expense_claims (employee_id, date_from desc);
create index expense_claims_status_idx on expense_claims (org_id, status);
create trigger expense_claims_set_updated_at before update on expense_claims
  for each row execute function set_updated_at();

-- Ett godkänt, avslaget eller betalt utlägg ändras aldrig och tas aldrig
-- bort. Det enda som händer efter godkännandet är att körningen betalar det
-- (approved → paid med lönebeskedet), vilket bara triggern på pay_runs gör.
create or replace function public.expense_claims_freeze() returns trigger
  language plpgsql set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('approved','paid','rejected') then
      raise exception 'Ett godkänt, avslaget eller betalt utlägg tas inte bort.' using errcode = '0A000';
    end if;
    return old;
  end if;
  if old.status in ('paid','rejected') then
    raise exception 'Utlägget är %; det ändras inte.', case old.status when 'paid' then 'betalt' else 'avslaget' end using errcode = '0A000';
  end if;
  if old.status = 'approved' then
    if new.status <> 'paid' or (to_jsonb(new) - array['status','payslip_id','paid_at','updated_at'])
                               <> (to_jsonb(old) - array['status','payslip_id','paid_at','updated_at'])
       or coalesce(current_setting('hr.expense_paying', true), '') <> 'on' then
      raise exception 'Utlägget är godkänt och fryst; det betalas med nästa lönekörning.' using errcode = '0A000';
    end if;
  end if;
  return new;
end;
$$;
create trigger expense_claims_freeze before update or delete on expense_claims
  for each row execute function expense_claims_freeze();

-- Sökvägen för ett kvitto: {org}/{person}/kvitto-{utlägg}-{n}.{ändelse}.
create or replace function public.expense_receipt_path_ok(p_org uuid, p_employee uuid, p_claim uuid, p_path text) returns boolean
  language sql immutable
as $$
  select p_path ~ ('^' || p_org::text || '/' || p_employee::text || '/kvitto-' || p_claim::text || '-[0-9]{1,2}\.(jpg|jpeg|png|webp|heic|pdf)$')
$$;

create or replace function public.expense_claims_check() returns trigger
  language plpgsql set search_path = public
as $$
declare
  r jsonb;
begin
  for r in select * from jsonb_array_elements(new.receipts) loop
    if not public.expense_receipt_path_ok(new.org_id, new.employee_id, new.id, r->>'path') or coalesce(r->>'sha256', '') !~ '^[0-9a-f]{64}$' then
      raise exception 'Kvittot har fel sökväg eller saknar kontrollsumma.' using errcode = '22023';
    end if;
  end loop;
  if jsonb_array_length(new.receipts) > 10 then
    raise exception 'Högst tio kvitton per utlägg.' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger expense_claims_check before insert or update on expense_claims
  for each row execute function expense_claims_check();

-- Den anställde skickar in sitt utkast (eller lönebehörig någons); ett
-- utlägg behöver ett kvitto.
create or replace function public.expense_submit(p_id uuid) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  c public.expense_claims;
begin
  select * into c from public.expense_claims where id = p_id for update;
  if c.id is null or not (public.is_self(c.employee_id) or public.can_payroll_approve(c.org_id)) then
    raise exception 'Utlägget finns inte.' using errcode = '42501';
  end if;
  if c.status <> 'draft' then
    raise exception 'Bara ett utkast kan skickas in.' using errcode = '0A000';
  end if;
  if c.kind = 'utlagg' and jsonb_array_length(c.receipts) = 0 then
    raise exception 'Ett utlägg behöver ett kvitto; fotografera det och lägg till det.' using errcode = '22023';
  end if;
  if c.tax_free_ore + c.taxable_ore <= 0 then
    raise exception 'Utlägget har inget belopp.' using errcode = '22023';
  end if;
  update public.expense_claims set status = 'submitted', submitted_at = now() where id = p_id;
  perform public.hr_log(c.org_id, c.employee_id, 'expense.submitted',
    jsonb_build_object('claimId', c.id, 'kind', c.kind, 'amountOre', c.tax_free_ore + c.taxable_ore));
end;
$$;

-- Ägare eller administratör godkänner med appens uppdelning (räknad på
-- servern ur regelboken och lönebesluten), inom regelbokens gränser. Den som
-- äger utlägget godkänner inte sitt eget.
create or replace function public.expense_approve(p_id uuid, p_tax_free bigint, p_taxable bigint, p_computation jsonb, p_rule_version text) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  c public.expense_claims;
  x record;
  v_max bigint;
begin
  select * into c from public.expense_claims where id = p_id for update;
  if c.id is null or not public.can_payroll_read(c.org_id) then
    raise exception 'Utlägget finns inte.' using errcode = '42501';
  end if;
  if not public.can_payroll_approve(c.org_id) then
    raise exception 'Bara ägare och administratörer godkänner utlägg.' using errcode = '42501';
  end if;
  if c.status <> 'submitted' then
    raise exception 'Bara ett inskickat utlägg kan godkännas (det är %).', c.status using errcode = '0A000';
  end if;
  if exists (select 1 from public.employees e where e.id = c.employee_id and e.user_id = auth.uid()) then
    raise exception 'Du godkänner inte ditt eget utlägg; en annan ägare eller administratör gör det.' using errcode = '42501';
  end if;
  if p_tax_free is null or p_taxable is null or p_tax_free < 0 or p_taxable < 0 or p_tax_free + p_taxable <= 0 then
    raise exception 'Beloppen är fel.' using errcode = '22023';
  end if;
  select * into x from public.expense_rules();
  if c.kind = 'utlagg' and (p_taxable <> 0 or p_tax_free <> c.amount_ore) then
    raise exception 'Ett utlägg ersätts med kvittots belopp, skattefritt.' using errcode = '23514';
  end if;
  if c.kind = 'milersattning' then
    v_max := ceil(c.distance_km * (case c.car_type when 'egen' then x.own_car_per_mil_ore when 'formansbil' then x.company_car_per_mil_ore
                                                   else x.company_el_per_mil_ore end) / 10);
    if p_tax_free > v_max then
      raise exception 'Den skattefria milersättningen % öre är mer än schablonen % öre.', p_tax_free, v_max using errcode = '23514';
    end if;
  end if;
  if c.kind = 'traktamente' then
    v_max := (c.date_to - c.date_from + 1) * x.per_diem_full_ore + c.nights_without_lodging * x.per_diem_night_ore;
    if p_tax_free > v_max then
      raise exception 'Det skattefria traktamentet % öre är mer än schablonen medger (% öre).', p_tax_free, v_max using errcode = '23514';
    end if;
  end if;
  update public.expense_claims
     set status = 'approved', tax_free_ore = p_tax_free, taxable_ore = p_taxable, computation = coalesce(p_computation, '{}'::jsonb),
         rule_version = p_rule_version, approved_by = auth.uid(), approved_by_name = coalesce(auth.jwt()->>'email', ''), approved_at = now()
   where id = p_id;
  perform public.hr_log(c.org_id, c.employee_id, 'expense.approved',
    jsonb_build_object('claimId', c.id, 'kind', c.kind, 'taxFreeOre', p_tax_free, 'taxableOre', p_taxable));
end;
$$;

create or replace function public.expense_reject(p_id uuid, p_reason text) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  c public.expense_claims;
begin
  select * into c from public.expense_claims where id = p_id for update;
  if c.id is null or not public.can_payroll_approve(c.org_id) then
    raise exception 'Bara ägare och administratörer avslår utlägg.' using errcode = '42501';
  end if;
  if c.status <> 'submitted' then
    raise exception 'Bara ett inskickat utlägg kan avslås.' using errcode = '0A000';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Skriv varför utlägget avslås.' using errcode = '22023';
  end if;
  update public.expense_claims set status = 'rejected', rejected_reason = btrim(p_reason), rejected_at = now() where id = p_id;
  perform public.hr_log(c.org_id, c.employee_id, 'expense.rejected', jsonb_build_object('claimId', c.id, 'reason', btrim(p_reason)));
end;
$$;

-- Ett kvitto registreras på utlägget före uppladdningen (som avtalen: en
-- fil utan rad blir aldrig kvar i hinken); hinkens policy släpper bara in
-- en fil som utlägget redan listar.
create or replace function public.expense_add_receipt(p_id uuid, p_path text, p_sha256 text, p_size int, p_content_type text, p_name text) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  c public.expense_claims;
begin
  select * into c from public.expense_claims where id = p_id for update;
  if c.id is null or not (public.is_self(c.employee_id) or public.can_payroll_approve(c.org_id)) then
    raise exception 'Utlägget finns inte.' using errcode = '42501';
  end if;
  if c.status not in ('draft','submitted') then
    raise exception 'Kvitton läggs till innan utlägget är godkänt.' using errcode = '0A000';
  end if;
  if p_size is null or p_size <= 0 or p_size > 10485760 then
    raise exception 'Kvittot får vara högst 10 MB.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(c.receipts) r where r->>'path' = p_path) then
    raise exception 'Kvittot finns redan.' using errcode = '23505';
  end if;
  update public.expense_claims
     set receipts = receipts || jsonb_build_array(jsonb_build_object('path', p_path, 'sha256', p_sha256, 'size', p_size,
                                                                     'contentType', p_content_type, 'name', left(coalesce(p_name, ''), 120)))
   where id = p_id;
end;
$$;

create or replace function public.hr_receipt_upload_ok(p_name text) returns boolean
  language plpgsql stable security definer set search_path = public
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_claim uuid;
begin
  if array_length(v_parts, 1) <> 3 or v_parts[3] !~ '^kvitto-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-' then
    return false;
  end if;
  v_claim := substr(v_parts[3], 8, 36)::uuid;
  return exists (
    select 1 from public.expense_claims c
     where c.id = v_claim and c.status in ('draft','submitted')
       and c.org_id::text = v_parts[1] and c.employee_id::text = v_parts[2]
       and (public.is_self(c.employee_id) or public.can_payroll_approve(c.org_id))
       and exists (select 1 from jsonb_array_elements(c.receipts) r where r->>'path' = p_name));
end;
$$;
revoke all on function public.hr_receipt_upload_ok(text) from public, anon;
grant execute on function public.hr_receipt_upload_ok(text) to authenticated;

create policy "hr_receipt_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'hr' and public.hr_receipt_upload_ok(name));

-- Lönebeskedets rader med källa: ett utlägg ska vara godkänt, obetalt och
-- personens, och raderna ska vara dess belopp (skattefritt och
-- skattepliktigt); en förmån personens. Kontrolleras när körningen lagras
-- och igen när den godkänns.
create or replace function public.payslip_sources_check(p_payslip uuid, p_final boolean) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  p public.payslips;
  s record;
  c public.expense_claims;
begin
  select * into p from public.payslips where id = p_payslip;
  for s in
    select l->'source'->>'kind' as kind, (l->'source'->>'id')::uuid as id,
           sum((l->>'amountOre')::bigint) filter (where (l->'item'->'flags'->>'taxable')::boolean) as taxable,
           sum((l->>'amountOre')::bigint) filter (where not (l->'item'->'flags'->>'taxable')::boolean) as tax_free
      from jsonb_array_elements(p.document->'lines') l
     where l->'source' is not null and jsonb_typeof(l->'source') = 'object'
     group by 1, 2
  loop
    if s.kind = 'expense_claim' then
      select * into c from public.expense_claims where id = s.id for update;
      if c.id is null or c.org_id <> p.org_id or c.employee_id <> p.employee_id then
        raise exception 'Lönebeskedet för % betalar ett utlägg som inte är personens.', p.document->>'employeeName' using errcode = '22023';
      end if;
      if c.status <> 'approved' or c.payslip_id is not null then
        raise exception 'Utlägget % för % är inte godkänt eller redan betalt; räkna om.', c.id, p.document->>'employeeName' using errcode = '22023';
      end if;
      if coalesce(s.tax_free, 0) <> c.tax_free_ore or coalesce(s.taxable, 0) <> c.taxable_ore then
        raise exception 'Raderna för utlägget % är inte det godkända beloppet.', c.id using errcode = '23514';
      end if;
      if p_final then
        perform set_config('hr.expense_paying', 'on', true);
        update public.expense_claims set status = 'paid', payslip_id = p.id, paid_at = now() where id = c.id;
        perform set_config('hr.expense_paying', '', true);
        perform public.hr_log(c.org_id, c.employee_id, 'expense.paid',
          jsonb_build_object('claimId', c.id, 'payslipId', p.id, 'amountOre', c.tax_free_ore + c.taxable_ore));
      end if;
    elsif s.kind = 'benefit' then
      if not exists (select 1 from public.benefits b where b.id = s.id and b.org_id = p.org_id and b.employee_id = p.employee_id
                        and b.valid_from <= (p.document->>'periodEnd')::date
                        and (b.valid_to is null or b.valid_to >= (p.document->>'periodStart')::date)) then
        raise exception 'Lönebeskedet för % har en förmån som inte gäller personen i perioden.', p.document->>'employeeName' using errcode = '22023';
      end if;
    else
      raise exception 'Okänd källa % på en lönerad.', s.kind using errcode = '22023';
    end if;
  end loop;
end;
$$;
revoke all on function public.payslip_sources_check(uuid, boolean) from public, anon, authenticated;

create or replace function public.payslips_sources_on_insert() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  perform public.payslip_sources_check(new.id, false);
  return null;
end;
$$;
create trigger payslips_sources after insert on payslips
  for each row execute function payslips_sources_on_insert();

-- Godkännandet av körningen betalar utläggen: approved → paid med lönebeskedet.
create or replace function public.pay_runs_pay_expenses() returns trigger
  language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  for v_id in select id from public.payslips where run_id = new.id order by id loop
    perform public.payslip_sources_check(v_id, true);
  end loop;
  return null;
end;
$$;
create trigger pay_runs_pay_expenses after update of status on pay_runs
  for each row when (new.status = 'approved' and old.status = 'calculated')
  execute function pay_runs_pay_expenses();

-- =====================================================================
-- 3. Underlagets fingeravtryck (0039:s plus utlägg och förmåner)
-- =====================================================================

create or replace function public.payroll_inputs_hash(p_run uuid) returns text
  language sql stable security definer set search_path = public
as $$
  select md5(concat_ws('|',
    (select string_agg(concat_ws(',', t.id, case t.status when 'locked' then 'approved' else t.status end, t.hours, t.start_time,
                                 t.end_time, t.break_minutes, t.kind, t.corrects_id), ';' order by t.id)
       from public.time_entries t
      where t.org_id = r.org_id and t.work_date between r.time_period_start and r.time_period_end),
    (select string_agg(concat_ws(',', a.id, a.kind, a.from_date, a.to_date, a.extent, a.approved_at is not null), ';' order by a.id)
       from public.absences a
      where a.org_id = r.org_id and a.from_date <= r.time_period_end
        and (a.to_date is null or a.to_date >= (r.time_period_start - interval '1 year')::date)),
    (select string_agg(concat_ws(',', v.id, v.schedule_id), ';' order by v.id) from public.employments v where v.org_id = r.org_id),
    (select string_agg(x.id::text, ';' order by x.id) from public.employee_tax x where x.org_id = r.org_id),
    (select string_agg(concat_ws(',', e.id, e.birth_date, e.agreement, e.ended_at), ';' order by e.id) from public.employees e where e.org_id = r.org_id),
    (select string_agg(c.id::text, ';' order by c.id) from public.payroll_corrections c
      where c.org_id = r.org_id and (c.target_run_id is null or c.target_run_id = r.id)),
    (select s.data->>'vacationYear' from public.payroll_settings s where s.org_id = r.org_id),
    -- 0042: godkända obetalda utlägg och förmånerna.
    (select string_agg(concat_ws(',', c.id, c.tax_free_ore, c.taxable_ore), ';' order by c.id) from public.expense_claims c
      where c.org_id = r.org_id and c.status = 'approved'),
    (select string_agg(concat_ws(',', b.id, b.valid_from, b.valid_to, b.updated_at), ';' order by b.id) from public.benefits b
      where b.org_id = r.org_id)))
  from public.pay_runs r where r.id = p_run
$$;
revoke all on function public.payroll_inputs_hash(uuid) from public, anon, authenticated;

-- =====================================================================
-- 4. Collectum (ITP1)
-- =====================================================================

-- Den pensionsmedförande lönen per ITP1-person (collectum.ts collectumBasis):
-- lönebesked i stängda körningar med lönedag i månaden, för den vars
-- lönebesked säger ITP1; raderna vars löneart är pension_reportable (inte
-- förmåner, skattefria ersättningar eller arvode); hela kronor per person.
create or replace function public.collectum_basis(p_org uuid, p_period text) returns jsonb
  language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.can_payroll_read(p_org) then
    raise exception 'Bara lönebehöriga läser pensionsunderlaget.' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('employeeId', employee_id, 'name', name, 'payslipIds', ids, 'payOre', pay / 100 * 100)
                              order by name collate "C", employee_id), '[]'::jsonb)
      from (select p.employee_id, (array_agg(p.document->>'employeeName' order by p.document->>'payDate' desc))[1] as name,
                   jsonb_agg(distinct p.id) as ids,
                   coalesce(sum(l.amount_ore) filter (where i.pension_reportable), 0)::bigint as pay
              from public.payslips p
              join public.pay_runs r on r.id = p.run_id and r.status = 'closed' and to_char(r.pay_date, 'YYYY-MM') = p_period
              left join public.payslip_lines l on l.payslip_id = p.id
              left join public.pay_items i on i.org_id = p.org_id and i.code = l.code and i.version = l.item_version
             where p.org_id = p_org and p.approved_at is not null and p.document->'context'->'pension'->>'scheme' = 'itp1'
             group by p.employee_id) x);
end;
$$;

create or replace function public.pension_basis(p_org uuid, p_period text, p_scheme text) returns jsonb
  language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.can_payroll_read(p_org) then
    raise exception 'Bara lönebehöriga läser pensionsunderlaget.' using errcode = '42501';
  end if;
  if p_scheme = 'collectum' then
    return public.collectum_basis(p_org, p_period);
  end if;
  if p_scheme <> 'fora' then
    raise exception 'Pensionsrapporten är Fora eller Collectum.' using errcode = '22023';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('employeeId', employee_id, 'name', name, 'payslipIds', ids, 'payOre', pay / 100 * 100)
                              order by name collate "C", employee_id), '[]'::jsonb)
      from (select p.employee_id, (array_agg(p.document->>'employeeName' order by p.document->>'payDate' desc))[1] as name,
                   jsonb_agg(distinct p.id) as ids,
                   coalesce(sum(l.amount_ore) filter (where i.fora_category is not null), 0)::bigint as pay
              from public.payslips p
              join public.pay_runs r on r.id = p.run_id and r.status = 'closed' and to_char(r.pay_date, 'YYYY-MM') = p_period
              left join public.payslip_lines l on l.payslip_id = p.id
              left join public.pay_items i on i.org_id = p.org_id and i.code = l.code and i.version = l.item_version
             where p.org_id = p_org and p.approved_at is not null and p.document->'context'->'pension'->>'scheme' = 'saf-lo'
             group by p.employee_id) x);
end;
$$;

-- Som 0040 med formatet efter mottagaren; båda filerna har lönen i kronor i
-- sjätte kolumnen (fora.ts foraFile, collectum.ts collectumFile).
create or replace function public.pension_report_store(p_org uuid, p_period text, p_scheme text, p_file text, p_lines jsonb) returns uuid
  language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_basis jsonb;
  v_prev public.pension_reports;
  v_total bigint;
  v_file_total numeric;
  v_id uuid;
begin
  if not public.can_payroll_approve(p_org) then
    raise exception 'Bara ägare och administratörer skapar rapporten.' using errcode = '42501';
  end if;
  v_basis := public.pension_basis(p_org, p_period, p_scheme);
  if (select string_agg(x, '|' order by x) from (select (b->>'employeeId') || ':' || (b->>'payOre') x from jsonb_array_elements(v_basis) b) s)
     is distinct from (select string_agg(x, '|' order by x) from (select (b->>'employeeId') || ':' || (b->>'payOre') x from jsonb_array_elements(p_lines) b) s) then
    raise exception 'Raderna stämmer inte med månadens lönebesked.' using errcode = '23514';
  end if;
  select coalesce(sum((b->>'payOre')::bigint), 0) into v_total from jsonb_array_elements(v_basis) b;
  select coalesce(sum(nullif(split_part(l, ';', 6), '')::numeric), 0) into v_file_total
    from unnest((string_to_array(replace(p_file, E'\r', ''), E'\n'))[2:]) l where btrim(l) <> '';
  if round(v_file_total * 100) <> v_total then
    raise exception 'Filens summa % kr är inte månadens % kr.', v_file_total, v_total / 100 using errcode = '23514';
  end if;
  select * into v_prev from public.pension_reports where org_id = p_org and period = p_period and scheme = p_scheme order by version desc limit 1 for update;
  if v_prev.id is not null and v_prev.lines = p_lines then
    raise exception 'Ingenting har ändrats sedan version %.', v_prev.version using errcode = '22023';
  end if;
  update public.pension_reports set status = 'corrected' where org_id = p_org and period = p_period and scheme = p_scheme and status = 'draft';
  insert into public.pension_reports (org_id, period, scheme, version, format, file, sha256, lines, total_ore)
  values (p_org, p_period, p_scheme, coalesce(v_prev.version, 0) + 1,
          case p_scheme when 'collectum' then 'collectum-manuell-csv-1' else 'fora-manuell-csv-1' end, p_file,
          encode(digest(convert_to(p_file, 'UTF8'), 'sha256'), 'hex'), p_lines, v_total)
  returning id into v_id;
  perform public.payroll_log(p_org, v_id, 'pension.report_created', jsonb_build_object('period', p_period, 'scheme', p_scheme, 'totalOre', v_total));
  return v_id;
end;
$$;

-- =====================================================================
-- 5. Ägarnas löneuttag (planeraren, bara information)
-- =====================================================================

create table owner_planner_snapshots (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  employee_id  uuid not null,
  year         int not null check (year between 2026 and 2100),
  inputs       jsonb not null check (jsonb_typeof(inputs) = 'object'),
  result       jsonb not null check (jsonb_typeof(result) = 'object'),
  rule_version text not null,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  foreign key (employee_id, org_id) references employees(id, org_id)
);
create index owner_planner_snapshots_idx on owner_planner_snapshots (org_id, employee_id, year, created_at desc);
create trigger owner_planner_snapshots_immutable before update or delete on owner_planner_snapshots
  for each row execute function forbid_change();

create or replace function public.owner_planner_snapshots_check() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.employees e where e.id = new.employee_id and e.org_id = new.org_id and e.is_owner) then
    raise exception 'Planeraren gäller ägare (markerade som ägare i personalregistret).' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger owner_planner_snapshots_check before insert on owner_planner_snapshots
  for each row execute function owner_planner_snapshots_check();

-- =====================================================================
-- 6. Konton
-- =====================================================================

create or replace function public.seed_payroll_accounts(p_org uuid) returns void
  language sql security definer set search_path = public
as $$
  insert into public.accounts (org_id, number, name) values
    (p_org, '1610', 'Kortfristiga fordringar hos anställda'),
    (p_org, '2514', 'Beräknad särskild löneskatt på pensionskostnader'),
    (p_org, '2710', 'Personalskatt'),
    (p_org, '2731', 'Avräkning lagstadgade sociala avgifter'),
    (p_org, '2820', 'Kortfristiga skulder till anställda'),
    (p_org, '2920', 'Upplupna semesterlöner'),
    (p_org, '2940', 'Upplupna lagstadgade sociala och andra avgifter'),
    (p_org, '2941', 'Beräknade upplupna lagstadgade sociala avgifter'),
    (p_org, '2950', 'Upplupna avtalade sociala avgifter'),
    (p_org, '7010', 'Löner till kollektivanställda'),
    (p_org, '7081', 'Sjuklöner till kollektivanställda'),
    (p_org, '7082', 'Semesterlöner till kollektivanställda'),
    (p_org, '7090', 'Förändring av semesterlöneskuld'),
    (p_org, '7210', 'Löner till tjänstemän'),
    (p_org, '7220', 'Löner till företagsledare'),
    (p_org, '7240', 'Styrelsearvoden som inte är lön'),
    (p_org, '7281', 'Sjuklöner till tjänstemän'),
    (p_org, '7282', 'Semesterlöner till tjänstemän'),
    (p_org, '7290', 'Förändring av semesterlöneskuld, tjänstemän'),
    (p_org, '7321', 'Skattefria traktamenten, Sverige'),
    (p_org, '7322', 'Skattepliktiga traktamenten, Sverige'),
    (p_org, '7331', 'Skattefria bilersättningar'),
    (p_org, '7332', 'Skattepliktiga bilersättningar'),
    (p_org, '7382', 'Kostnader för fria eller subventionerade måltider'),
    (p_org, '7385', 'Kostnader för fri bil'),
    (p_org, '7389', 'Övriga kostnader för förmåner'),
    (p_org, '7399', 'Motkonto förmånsvärden'),
    (p_org, '7410', 'Pensionsförsäkringspremier'),
    (p_org, '7510', 'Arbetsgivaravgifter'),
    (p_org, '7519', 'Sociala avgifter för semester- och löneskulder'),
    (p_org, '7533', 'Särskild löneskatt för pensionskostnader'),
    (p_org, '7570', 'Premier för arbetsmarknadsförsäkringar'),
    (p_org, '7690', 'Övriga personalkostnader')
  on conflict do nothing
$$;
revoke all on function public.seed_payroll_accounts(uuid) from public, anon, authenticated;

select public.seed_payroll_accounts(id) from organizations where exists (select 1 from pay_items where pay_items.org_id = organizations.id);

-- =====================================================================
-- 7. RLS och rättigheter
-- =====================================================================

alter table benefits                enable row level security;
alter table expense_claims          enable row level security;
alter table owner_planner_snapshots enable row level security;

create policy "benefits_select" on benefits
  for select to authenticated using (public.can_payroll_read(org_id) or public.is_self(employee_id));
create policy "benefits_insert" on benefits
  for insert to authenticated with check (public.can_payroll_approve(org_id));
create policy "benefits_update" on benefits
  for update to authenticated using (public.can_payroll_approve(org_id)) with check (public.can_payroll_approve(org_id));
create policy "benefits_delete" on benefits
  for delete to authenticated using (public.can_payroll_approve(org_id));

-- Den anställde läser sina utlägg och skriver sina utkast; lönebehöriga
-- läser alla; ägare och administratörer skriver utkast och inskickade.
create policy "expense_claims_select" on expense_claims
  for select to authenticated using (public.can_payroll_read(org_id) or public.is_self(employee_id));
create policy "expense_claims_insert" on expense_claims
  for insert to authenticated with check (status = 'draft' and (public.is_self(employee_id) or public.can_payroll_approve(org_id)));
create policy "expense_claims_update" on expense_claims
  for update to authenticated
  using ((public.is_self(employee_id) and status = 'draft') or (public.can_payroll_approve(org_id) and status in ('draft','submitted')))
  with check ((public.is_self(employee_id) and status = 'draft') or (public.can_payroll_approve(org_id) and status in ('draft','submitted')));
create policy "expense_claims_delete" on expense_claims
  for delete to authenticated
  using ((public.is_self(employee_id) and status = 'draft') or (public.can_payroll_approve(org_id) and status in ('draft','submitted')));

create policy "owner_planner_snapshots_select" on owner_planner_snapshots
  for select to authenticated using (public.can_payroll_read(org_id));
create policy "owner_planner_snapshots_insert" on owner_planner_snapshots
  for insert to authenticated with check (public.can_payroll_approve(org_id));

revoke all on benefits, expense_claims, owner_planner_snapshots from anon, authenticated;
grant select, insert, delete on benefits to authenticated;
grant update (description, valid_from, valid_to, registration_number, car_model, first_registered_on, model_year, fuel, new_car_price_ore,
              extra_equipment_ore, vehicle_tax_ore, business_mil_per_year, fuel_paid_by_employer, private_fuel_ore, meals,
              housing_area_m2, housing_region, market_value_ore, employee_payment_ore, monthly_value_ore, rule_version, computation) on benefits to authenticated;
-- Status, godkännande, lönebesked och kvitton ändras bara genom funktionerna.
grant select, delete on expense_claims to authenticated;
grant insert (id, org_id, employee_id, kind, date_from, date_to, description, amount_ore, vat_ore, distance_km, car_type, destination,
              departure_time, return_time, nights, nights_without_lodging, meals, long_stay, tax_free_ore, taxable_ore, computation,
              rule_version, note) on expense_claims to authenticated;
grant update (kind, date_from, date_to, description, amount_ore, vat_ore, distance_km, car_type, destination, departure_time, return_time,
              nights, nights_without_lodging, meals, long_stay, tax_free_ore, taxable_ore, computation, rule_version, note)
  on expense_claims to authenticated;
grant select, insert on owner_planner_snapshots to authenticated;

revoke all on function public.expense_rules() from public, anon;
revoke all on function public.expense_submit(uuid) from public, anon;
revoke all on function public.expense_approve(uuid, bigint, bigint, jsonb, text) from public, anon;
revoke all on function public.expense_reject(uuid, text) from public, anon;
revoke all on function public.expense_add_receipt(uuid, text, text, int, text, text) from public, anon;
revoke all on function public.collectum_basis(uuid, text) from public, anon;
grant execute on function public.expense_rules() to authenticated;
grant execute on function public.expense_submit(uuid) to authenticated;
grant execute on function public.expense_approve(uuid, bigint, bigint, jsonb, text) to authenticated;
grant execute on function public.expense_reject(uuid, text) to authenticated;
grant execute on function public.expense_add_receipt(uuid, text, text, int, text, text) to authenticated;
grant execute on function public.collectum_basis(uuid, text) to authenticated;

commit;
