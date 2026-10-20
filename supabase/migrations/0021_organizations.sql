-- Fas 5: organisationen som riktig enhet, flera organisationer, roller,
-- inbjudningar, API på riktigt och webhooks (docs/fakturering.md, fas 5).
--
-- 1. create_organization(): en inloggad användare skapar en organisation och
--    blir owner. security definer, eftersom organizations saknar
--    insert-policy (ingen ska kunna skapa en organisation åt någon annan).
-- 2. Inbjudningar: giltighetstid, info och accept via token. Den inbjudna
--    måste vara inloggad med samma e-postadress som inbjudan gäller.
-- 3. Medlemmar: lista med e-post (auth.users är inte läsbar för
--    authenticated), skydd för sista ownern, bara owners utser owners.
-- 4. Funktionerna som API:et anropar med service role (register_payment,
--    mark_invoice_sent, mark_invoice_credited) använder
--    can_write_org_or_system som issue_invoice redan gör (0017/0018).
-- 5. Webhooks: en leverans per aktiv endpoint skapas av en trigger när en
--    händelse av en publik typ loggas. Cron-routen levererar.
--
-- org_id behåller default_org() som default på tabellerna; applikationen
-- skickar nu organisationen uttryckligen (lib/core/org/current.ts).

-- =====================================================================
-- 1. Skapa en organisation
-- =====================================================================

create or replace function public.create_organization(p_name text, p_org_nr text default '')
returns uuid
  language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text := btrim(coalesce(p_name, ''));
  v_orgnr text := btrim(coalesce(p_org_nr, ''));
  v_base  text;
  v_slug  text;
  v_org   uuid;
begin
  if v_uid is null then
    raise exception 'Logga in för att skapa en organisation.' using errcode = '42501';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Namnet ska vara 2–120 tecken.' using errcode = '22023';
  end if;
  if v_orgnr <> '' and v_orgnr !~ '^\d{6}-?\d{4}$' then
    raise exception 'Organisationsnummer skrivs 559123-4567.' using errcode = '22023';
  end if;
  if v_orgnr ~ '^\d{10}$' then
    v_orgnr := substr(v_orgnr, 1, 6) || '-' || substr(v_orgnr, 7);
  end if;

  -- Slug: namnet i gemener utan specialtecken, med ett löpnummer vid krock.
  v_base := trim(both '-' from regexp_replace(lower(translate(v_name, 'åäöéüÅÄÖÉÜ', 'aaoeuaaoeu')), '[^a-z0-9]+', '-', 'g'));
  if v_base = '' then v_base := 'org'; end if;
  v_slug := v_base;
  while exists (select 1 from public.organizations where slug = v_slug) loop
    v_slug := v_base || '-' || substr(encode(gen_random_bytes(3), 'hex'), 1, 5);
  end loop;

  insert into public.organizations (slug, name, org_nr) values (v_slug, v_name, v_orgnr) returning id into v_org;
  insert into public.memberships (org_id, user_id, role) values (v_org, v_uid, 'owner');
  -- Fakturor: löpande från 1. Verifikationer: per år från 1, som Binaafy.
  insert into public.number_series (org_id, series, per_year, start, pad) values
    (v_org, 'F', false, 1, 0),
    (v_org, 'V', true, 1, 0);
  perform public.seed_org_accounts(v_org);
  -- Inställningarna börjar med det vi vet; resten fylls i på /admin/installningar.
  insert into public.org_settings (org_id, data) values
    (v_org, jsonb_build_object('company', jsonb_build_object('legalName', v_name, 'orgNr', v_orgnr)));
  insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
    values (v_org, 'organization', v_org, 'organization.created', jsonb_build_object('name', v_name),
            jsonb_build_object('kind', 'user', 'id', v_uid, 'name', coalesce(auth.jwt()->>'email', v_uid::text)));
  return v_org;
end;
$$;
revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

-- =====================================================================
-- 2. Inbjudningar
-- =====================================================================

alter table invitations add column if not exists expires_at timestamptz not null default now() + interval '14 days';
create index if not exists invitations_org_idx on invitations (org_id, created_at desc);
-- Owner blir man genom att en owner ändrar rollen, inte via en inbjudan som
-- en admin kan skicka (då kunde en admin göra sig själv till owner).
alter table invitations add constraint invitations_not_owner check (role <> 'owner') not valid;

-- Det den inbjudna behöver se innan hon accepterar: organisationen, rollen,
-- e-postadressen och om inbjudan gäller. Token är hemligheten.
create or replace function public.invitation_info(p_token text)
returns table (org_name text, email text, role text, accepted boolean, expired boolean)
  language sql stable security definer set search_path = public
as $$
  select o.name, i.email, i.role, i.accepted_at is not null, i.expires_at < now()
    from public.invitations i join public.organizations o on o.id = i.org_id
   where i.token = p_token
$$;
revoke all on function public.invitation_info(text) from public, anon;
grant execute on function public.invitation_info(text) to authenticated;

create or replace function public.accept_invitation(p_token text)
returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_inv   public.invitations%rowtype;
begin
  if v_uid is null then
    raise exception 'Logga in för att acceptera inbjudan.' using errcode = '42501';
  end if;
  select * into v_inv from public.invitations where token = p_token for update;
  if not found then
    raise exception 'Inbjudan finns inte.' using errcode = 'P0002';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'Inbjudan är redan använd.' using errcode = '22023';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'Inbjudan har gått ut. Be om en ny.' using errcode = '22023';
  end if;
  if lower(v_inv.email) <> v_email then
    raise exception 'Inbjudan gäller %, men du är inloggad som %.', v_inv.email, v_email using errcode = '42501';
  end if;
  -- Den som redan är medlem behåller sin roll.
  insert into public.memberships (org_id, user_id, role) values (v_inv.org_id, v_uid, v_inv.role)
    on conflict (org_id, user_id) do nothing;
  update public.invitations set accepted_at = now() where id = v_inv.id;
  insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
    values (v_inv.org_id, 'organization', v_inv.org_id, 'member.joined', jsonb_build_object('email', v_inv.email, 'role', v_inv.role),
            jsonb_build_object('kind', 'user', 'id', v_uid, 'name', v_email));
  return v_inv.org_id;
end;
$$;
revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

-- =====================================================================
-- 3. Medlemmar
-- =====================================================================

-- Medlemmarna med e-post, för sidan Organisation. Bara för medlemmar.
create or replace function public.org_members(p_org uuid)
returns table (user_id uuid, email text, role text, created_at timestamptz)
  language sql stable security definer set search_path = public
as $$
  select m.user_id, u.email::text, m.role, m.created_at
    from public.memberships m join auth.users u on u.id = m.user_id
   where m.org_id = p_org and public.is_org_member(p_org)
   order by case m.role when 'owner' then 0 when 'admin' then 1 when 'staff' then 2 when 'accountant' then 3 else 4 end, u.email
$$;
revoke all on function public.org_members(uuid) from public, anon;
grant execute on function public.org_members(uuid) to authenticated;

-- RLS (memberships_admin_write, 0014) låter owner/admin ändra medlemmar.
-- Här de regler RLS inte kan uttrycka: organisationen har alltid en owner,
-- och bara en owner ger eller tar owner-rollen. Service role (create_organization
-- körs som definer, inte som service role) och SQL-editorn har ingen uid och
-- släpps förbi.
create or replace function public.memberships_guard() returns trigger
  language plpgsql security definer set search_path = public
as $$
declare
  v_org uuid := coalesce(new.org_id, old.org_id);
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    -- create_organization lägger in den första ownern i en tom organisation.
    if new.role = 'owner' and exists (select 1 from public.memberships where org_id = new.org_id)
       and not public.has_org_role(new.org_id, array['owner']) then
      raise exception 'Bara en owner kan göra någon till owner.' using errcode = '42501';
    end if;
    return new;
  end if;
  if (old.role = 'owner' or (tg_op = 'UPDATE' and new.role = 'owner'))
     and not public.has_org_role(v_org, array['owner']) then
    raise exception 'Bara en owner kan ändra en owner.' using errcode = '42501';
  end if;
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner')
     and not exists (select 1 from public.memberships where org_id = old.org_id and role = 'owner' and user_id <> old.user_id) then
    raise exception 'Organisationen måste ha minst en owner.' using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists memberships_guard on memberships;
create trigger memberships_guard before insert or update or delete on memberships
  for each row execute function memberships_guard();

-- =====================================================================
-- 4. API med service role: samma undantag som issue_invoice
-- =====================================================================

-- Oförändrade från 0015 utom behörighetskontrollen.
create or replace function public.register_payment(
  p_invoice uuid,
  p_amount bigint,
  p_method text,
  p_paid_on date,
  p_reference text,
  p_note text,
  p_posting jsonb,
  p_actor jsonb default '{"kind":"system","name":"system"}'::jsonb
) returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  v_inv        public.invoices%rowtype;
  v_payment_id uuid;
  v_paid       bigint;
  v_status     text;
  v_entry_id   uuid;
  v_year       int;
  v_no         int;
  v_line       jsonb;
begin
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then
    raise exception 'Fakturan finns inte.';
  end if;
  if not public.can_write_org_or_system(v_inv.org_id) then
    raise exception 'Saknar behörighet.' using errcode = '42501';
  end if;
  if v_inv.status not in ('issued','sent','partially_paid','paid') then
    raise exception 'Faktura % kan inte ta emot betalningar i status %.', v_inv.number, v_inv.status;
  end if;
  if p_amount = 0 then
    raise exception 'Beloppet kan inte vara noll.';
  end if;

  insert into public.payments (org_id, amount_ore, method, paid_on, reference, note, created_by)
    values (v_inv.org_id, p_amount, p_method, p_paid_on, coalesce(p_reference, ''), coalesce(p_note, ''), p_actor->>'name')
    returning id into v_payment_id;
  insert into public.payment_allocations (org_id, payment_id, invoice_id, amount_ore)
    values (v_inv.org_id, v_payment_id, p_invoice, p_amount);

  v_paid := v_inv.paid_ore + p_amount;
  v_status := case
    when v_paid >= v_inv.payable_ore then 'paid'
    when v_paid > 0 then 'partially_paid'
    else case when v_inv.status = 'paid' then 'issued' else v_inv.status end
  end;
  update public.invoices set
    paid_ore = v_paid,
    status   = v_status,
    paid_at  = case when v_status = 'paid' then coalesce(paid_at, now()) else null end
  where id = p_invoice;

  v_year := extract(year from p_paid_on)::int;
  v_no := public.next_document_number(v_inv.org_id, 'V', v_year);
  insert into public.journal_entries (org_id, series, fiscal_year, number, entry_date, text, source_type, source_id, created_by)
    values (v_inv.org_id, 'V', v_year, v_no, p_paid_on, coalesce(p_posting->>'text', 'Inbetalning'), 'payment', v_payment_id, p_actor->>'name')
    returning id into v_entry_id;
  for v_line in select * from jsonb_array_elements(p_posting->'lines') loop
    insert into public.journal_lines (org_id, entry_id, account, debit_ore, credit_ore, project_id, customer_id, text)
      values (v_inv.org_id, v_entry_id, v_line->>'account',
              coalesce((v_line->>'debit')::bigint, 0), coalesce((v_line->>'credit')::bigint, 0),
              nullif(v_line->'dimensions'->>'projectId', '')::uuid,
              nullif(v_line->'dimensions'->>'customerId', '')::uuid,
              v_line->>'text');
  end loop;

  insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
    values (v_inv.org_id, 'payment', v_payment_id, 'payment.received',
            jsonb_build_object('invoice', p_invoice, 'number', v_inv.number, 'amount', p_amount, 'method', p_method, 'paidOn', p_paid_on),
            p_actor);
  if v_status in ('paid', 'partially_paid') and v_status <> v_inv.status then
    insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
      values (v_inv.org_id, 'invoice', p_invoice, 'invoice.' || v_status,
              jsonb_build_object('number', v_inv.number, 'paid', v_paid, 'payable', v_inv.payable_ore, 'amount', p_amount, 'method', p_method),
              p_actor);
  end if;

  return jsonb_build_object('paymentId', v_payment_id, 'paid', v_paid, 'status', v_status, 'entryNumber', v_year::text || '-' || v_no::text);
end;
$$;
revoke all on function public.register_payment(uuid, bigint, text, date, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.register_payment(uuid, bigint, text, date, text, text, jsonb, jsonb) to authenticated, service_role;

create or replace function public.mark_invoice_sent(p_invoice uuid, p_to text, p_actor jsonb default '{"kind":"system","name":"system"}'::jsonb)
returns void
  language plpgsql security definer set search_path = public
as $$
declare
  v_inv public.invoices%rowtype;
begin
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then
    raise exception 'Fakturan finns inte.';
  end if;
  if not public.can_write_org_or_system(v_inv.org_id) then
    raise exception 'Saknar behörighet.' using errcode = '42501';
  end if;
  if v_inv.status = 'draft' then
    raise exception 'Utfärda fakturan innan den skickas.';
  end if;
  update public.invoices set
    sent_at = coalesce(sent_at, now()),
    status  = case when status = 'issued' then 'sent' else status end
  where id = p_invoice;
  insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
    values (v_inv.org_id, 'invoice', p_invoice, 'invoice.sent', jsonb_build_object('number', v_inv.number, 'to', p_to), p_actor);
end;
$$;
revoke all on function public.mark_invoice_sent(uuid, text, jsonb) from public, anon;
grant execute on function public.mark_invoice_sent(uuid, text, jsonb) to authenticated, service_role;

create or replace function public.mark_invoice_credited(p_invoice uuid, p_credit uuid, p_actor jsonb default '{"kind":"system","name":"system"}'::jsonb)
returns void
  language plpgsql security definer set search_path = public
as $$
declare
  v_inv    public.invoices%rowtype;
  v_credit public.invoices%rowtype;
begin
  select * into v_inv from public.invoices where id = p_invoice for update;
  select * into v_credit from public.invoices where id = p_credit;
  if v_inv.id is null or v_credit.id is null then
    raise exception 'Fakturan eller kreditfakturan finns inte.';
  end if;
  if not public.can_write_org_or_system(v_inv.org_id) then
    raise exception 'Saknar behörighet.' using errcode = '42501';
  end if;
  if v_credit.status = 'draft' or v_credit.credits_invoice_id <> p_invoice or v_credit.org_id <> v_inv.org_id then
    raise exception 'Kreditfakturan är inte utfärdad mot den här fakturan.';
  end if;
  if -v_credit.payable_ore >= v_inv.payable_ore - v_inv.paid_ore then
    update public.invoices set status = 'credited' where id = p_invoice;
  end if;
  insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
    values (v_inv.org_id, 'invoice', p_invoice, 'invoice.credited',
            jsonb_build_object('number', v_inv.number, 'creditNumber', v_credit.number, 'amount', -v_credit.payable_ore), p_actor);
end;
$$;
revoke all on function public.mark_invoice_credited(uuid, uuid, jsonb) from public, anon;
grant execute on function public.mark_invoice_credited(uuid, uuid, jsonb) to authenticated, service_role;

-- =====================================================================
-- 5. Webhooks
-- =====================================================================

-- Samma lista som WEBHOOK_EVENT_TYPES i lib/core/events.ts.
create or replace function public.is_webhook_event(p_type text) returns boolean
  language sql immutable
as $$
  select p_type = any(array[
    'invoice.issued', 'invoice.sent', 'invoice.reminded', 'invoice.partially_paid', 'invoice.paid',
    'invoice.credited', 'invoice.voided', 'payment.received', 'rot_claim.sent', 'rot_claim.paid', 'rot_claim.rejected'
  ])
$$;

-- En leverans per aktiv endpoint som vill ha händelsen (tom lista = alla).
-- security definer: händelsen loggas ofta av en vanlig användare, som inte
-- får skriva i webhook_deliveries.
create or replace function public.enqueue_webhook_deliveries() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  insert into public.webhook_deliveries (org_id, endpoint_id, event_id)
    select new.org_id, e.id, new.id
      from public.webhook_endpoints e
     where e.org_id = new.org_id and e.active and (cardinality(e.events) = 0 or new.type = any(e.events));
  return null;
end;
$$;
drop trigger if exists events_enqueue_webhooks on events;
create trigger events_enqueue_webhooks after insert on events
  for each row when (public.is_webhook_event(new.type))
  execute function enqueue_webhook_deliveries();

create index if not exists webhook_endpoints_org_idx on webhook_endpoints (org_id);
create index if not exists webhook_deliveries_endpoint_idx on webhook_deliveries (endpoint_id, created_at desc);
-- Den som levererar läser leveranser som inte är klara och inte har gett upp.
alter table webhook_deliveries add column if not exists failed_at timestamptz;

-- =====================================================================
-- 6. Läsning per organisation
-- =====================================================================

-- Listorna filtreras nu alltid på org_id; index där det saknades.
create index if not exists recurring_invoices_org_idx on recurring_invoices (org_id, next_on);
create index if not exists rot_claims_org_idx on rot_claims (org_id, created_at desc);
create index if not exists payment_plans_org_project_idx on payment_plans (org_id, project_id);
create index if not exists customers_org_deleted_idx on customers (org_id) where deleted_at is null;

-- =====================================================================
-- RLS-prov (körs för hand i SQL-editorn, i en transaktion som rullas
-- tillbaka; byt ut uuid:erna mot riktiga användare). Se även
-- supabase/tests/0021_rls.sql.
--
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<user i org A>","role":"authenticated","email":"a@example.se"}';
--   select count(*) from invoices where org_id = '<org B>';   -- 0
--   select create_organization('Prov AB', '559000-0000');      -- ny uuid
--   select count(*) from memberships where user_id = '<user i org A>';  -- en till
--   rollback;
-- =====================================================================
