-- Swish Handel: betalningsbegäranden som kvitteras av Swishs callback.
--
-- 1. swish_payment_requests: en rad per begäran vi skickar till Swish
--    (PUT /api/v2/paymentrequests/{instructionUUID}). swish_id är vårt
--    instructionUUID. Betalarens nummer lagras bara maskerat. Medlemmar i
--    organisationen läser; bara service role skriver (callback-routen och
--    status-routen kör som system).
-- 2. payments.source: varifrån betalningen kom ('swish' för Swish Handel).
--    method är fortfarande 'swish' (finns sedan 0014). Ett unikt index gör
--    att samma Swish-referens aldrig blir två betalningar.
-- 3. settle_swish_payment(): callbackens resultat i en transaktion. Raden
--    låses; en begäran som redan är betald ger tillbaka samma betalning
--    (dubbletter är ofarliga); PAID registreras via register_payment som
--    system. Om fakturan inte längre tar emot betalningar (makulerad,
--    krediterad) sparas felet på begäran i stället för att callbacken
--    misslyckas, så att pengarna syns och kan hanteras för hand.
-- 4. swish_secret(): läser en Vault-hemlighet med Swish-certifikatet för en
--    organisation (org_settings.payment.swishCommerce.credentials =
--    'vault:swish_<namn>'). Bara service role, bara namn som börjar med swish_.

-- =====================================================================
-- 1. Tabellen
-- =====================================================================

create table if not exists swish_payment_requests (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references organizations(id) on delete cascade,
  invoice_id               uuid not null references invoices(id) on delete restrict,
  -- instructionUUID: 32 tecken hex, versaler (Swishs krav).
  swish_id                 text not null unique check (swish_id ~ '^[0-9A-F]{32}$'),
  environment              text not null check (environment in ('test','prod')),
  flow                     text not null check (flow in ('mcommerce','ecommerce')),
  amount_ore               bigint not null check (amount_ore > 0),
  message                  text not null default '',
  status                   text not null default 'CREATED' check (status in ('CREATED','PAID','DECLINED','ERROR','CANCELLED')),
  -- Maskerat, t.ex. 4670*****67. Aldrig hela numret.
  payer_alias              text not null default '' check (payer_alias !~ '^\d{8,}$'),
  -- Bankens referens för betalningen; finns bara när status är PAID.
  payment_reference        text,
  -- sha256 av callbackIdentifier som Swish skickar tillbaka i en header.
  callback_identifier_hash text not null default '',
  payment_id               uuid references payments(id) on delete set null,
  error                    text,
  created_by               text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  paid_at                  timestamptz
);
create index if not exists swish_payment_requests_invoice_idx on swish_payment_requests (invoice_id, created_at desc);
create index if not exists swish_payment_requests_org_idx on swish_payment_requests (org_id, created_at desc);
-- Inte unik: två begäranden kan få samma callback-referens; det är
-- betalningen som är unik (payments_swish_reference_uq nedan).
create index if not exists swish_payment_requests_reference_idx
  on swish_payment_requests (payment_reference) where payment_reference is not null;

alter table swish_payment_requests enable row level security;
drop policy if exists "swish_payment_requests_member_select" on swish_payment_requests;
create policy "swish_payment_requests_member_select" on swish_payment_requests
  for select using (public.is_org_member(org_id));
-- Inga skrivpolicies: inloggade användare skriver aldrig direkt.
revoke insert, update, delete on swish_payment_requests from anon, authenticated;
revoke all on swish_payment_requests from anon;

-- =====================================================================
-- 2. payments.source
-- =====================================================================

alter table payments add column if not exists source text;
comment on column payments.source is 'Varifrån betalningen kom: null = registrerad för hand eller via bankfil (före 0032), swish = Swish Handel.';
create unique index if not exists payments_swish_reference_uq
  on payments (org_id, reference) where source = 'swish';

-- =====================================================================
-- 3. Kvittera en begäran
-- =====================================================================

create or replace function public.settle_swish_payment(
  p_swish_id text,
  p_status text,
  p_payment_reference text,
  p_amount bigint,
  p_payer_masked text,
  p_error text,
  p_paid_on date,
  p_posting jsonb
) returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  v_req     public.swish_payment_requests%rowtype;
  v_result  jsonb;
  v_payment uuid;
  v_status  text := upper(coalesce(p_status, ''));
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'Saknar behörighet.' using errcode = '42501';
  end if;
  if v_status not in ('PAID','DECLINED','ERROR','CANCELLED') then
    raise exception 'Okänd Swish-status %.', p_status using errcode = '22023';
  end if;

  select * into v_req from public.swish_payment_requests where swish_id = p_swish_id for update;
  if not found then
    raise exception 'Swish-begäran % finns inte.', p_swish_id using errcode = 'P0002';
  end if;

  -- Redan avgjord: samma svar igen, inget nytt händer.
  if v_req.status <> 'CREATED' then
    return jsonb_build_object('outcome', 'duplicate', 'status', v_req.status, 'paymentId', v_req.payment_id);
  end if;

  if v_status <> 'PAID' then
    update public.swish_payment_requests set
      status      = v_status,
      error       = nullif(p_error, ''),
      payer_alias = coalesce(nullif(p_payer_masked, ''), payer_alias),
      updated_at  = now()
    where id = v_req.id;
    return jsonb_build_object('outcome', 'updated', 'status', v_status, 'paymentId', null);
  end if;

  if coalesce(p_payment_reference, '') = '' then
    raise exception 'En betald Swish-begäran saknar betalningsreferens.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Beloppet från Swish är ogiltigt.' using errcode = '22023';
  end if;

  -- Samma referens redan bokförd (t.ex. två begäranden som fick samma
  -- callback): ingen ny betalning.
  select id into v_payment from public.payments
    where org_id = v_req.org_id and source = 'swish' and reference = p_payment_reference;
  if v_payment is null then
    begin
      v_result := public.register_payment(
        v_req.invoice_id, p_amount, 'swish', coalesce(p_paid_on, current_date),
        p_payment_reference, 'Swish Handel ' || v_req.swish_id, p_posting,
        '{"kind":"system","name":"Swish"}'::jsonb);
      v_payment := (v_result->>'paymentId')::uuid;
      update public.payments set source = 'swish' where id = v_payment;
    exception when others then
      -- Pengarna är betalda hos Swish men kunde inte bokas på fakturan.
      update public.swish_payment_requests set
        status            = 'PAID',
        payment_reference = p_payment_reference,
        payer_alias       = coalesce(nullif(p_payer_masked, ''), payer_alias),
        error             = 'Betald hos Swish men inte bokförd: ' || sqlerrm,
        paid_at           = now(),
        updated_at        = now()
      where id = v_req.id;
      return jsonb_build_object('outcome', 'unbooked', 'status', 'PAID', 'paymentId', null, 'error', sqlerrm);
    end;
  end if;

  update public.swish_payment_requests set
    status            = 'PAID',
    payment_reference = p_payment_reference,
    payer_alias       = coalesce(nullif(p_payer_masked, ''), payer_alias),
    payment_id        = v_payment,
    error             = case when p_amount <> v_req.amount_ore
                             then 'Swish betalade ' || p_amount || ' öre, begäran gällde ' || v_req.amount_ore || ' öre.'
                             else null end,
    paid_at           = now(),
    updated_at        = now()
  where id = v_req.id;
  return jsonb_build_object('outcome', case when v_result is null then 'duplicate' else 'paid' end,
                            'status', 'PAID', 'paymentId', v_payment,
                            'invoiceStatus', v_result->>'status');
end;
$$;
revoke all on function public.settle_swish_payment(text, text, text, bigint, text, text, date, jsonb) from public, anon, authenticated;
grant execute on function public.settle_swish_payment(text, text, text, bigint, text, text, date, jsonb) to service_role;

-- =====================================================================
-- 4. Certifikat i Vault
-- =====================================================================

create or replace function public.swish_secret(p_name text) returns text
  language plpgsql stable security definer set search_path = public, vault
as $$
declare
  v text;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'Saknar behörighet.' using errcode = '42501';
  end if;
  if p_name !~ '^swish_[a-z0-9_]{1,60}$' then
    raise exception 'Ogiltigt namn på Swish-hemlighet.' using errcode = '22023';
  end if;
  select decrypted_secret into v from vault.decrypted_secrets where name = p_name limit 1;
  return v;
end;
$$;
revoke all on function public.swish_secret(text) from public, anon, authenticated;
grant execute on function public.swish_secret(text) to service_role;
