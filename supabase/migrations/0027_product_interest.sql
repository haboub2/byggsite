-- Intresseanmälningar för faktureringsverktyget (/fakturering på webbplatsen).
--
-- product_interest  En rad per anmälan. Hör inte till någon organisation:
--                   det är webbplatsens egen insamling, och läses bara av
--                   owner/admin i den organisation som äger webbplatsen
--                   (is_site_admin(), 0022).
--
-- Formuläret skriver genom submit_product_interest() (security definer), som
-- anon får köra. Ingen insert-policy behövs då, och en besökare kan bara
-- skriva de fält funktionen tar emot, med samma gränser som formuläret.
--
-- Körs i Supabase SQL-editorn efter 0026.

-- =====================================================================
-- 1. Tabellen
-- =====================================================================

create table if not exists public.product_interest (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  company            text not null check (char_length(company) between 1 and 200),
  name               text not null check (char_length(name) between 1 and 200),
  email              text not null check (char_length(email) between 3 and 320),
  phone              text check (char_length(phone) <= 50),
  volume             text not null check (volume in ('under-10', '10-50', 'over-50')),
  current_tool       text not null check (current_tool in ('fortnox', 'visma', 'word-excel', 'annat')),
  current_tool_other text check (char_length(current_tool_other) <= 200),
  priority           text check (char_length(priority) <= 2000),
  source             jsonb not null default '{}'::jsonb,
  consent_at         timestamptz not null default now()
);

create index if not exists product_interest_created_at_idx on public.product_interest (created_at desc);

alter table public.product_interest enable row level security;

drop policy if exists "product_interest_select_site" on public.product_interest;
create policy "product_interest_select_site" on public.product_interest
  for select to authenticated using (public.is_site_admin());

-- Spam and test rows are removed from /admin/intresse.
drop policy if exists "product_interest_delete_site" on public.product_interest;
create policy "product_interest_delete_site" on public.product_interest
  for delete to authenticated using (public.is_site_admin());

-- =====================================================================
-- 2. Formulärets insert
-- =====================================================================

create or replace function public.submit_product_interest(
  p_company text,
  p_name text,
  p_email text,
  p_phone text,
  p_volume text,
  p_current_tool text,
  p_current_tool_other text,
  p_priority text,
  p_source jsonb default '{}'::jsonb
) returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.product_interest (
    company, name, email, phone, volume, current_tool, current_tool_other, priority, source
  ) values (
    btrim(p_company),
    btrim(p_name),
    lower(btrim(p_email)),
    nullif(btrim(coalesce(p_phone, '')), ''),
    p_volume,
    p_current_tool,
    nullif(btrim(coalesce(p_current_tool_other, '')), ''),
    nullif(btrim(coalesce(p_priority, '')), ''),
    -- Only the attribution keys the form sends, each cut to 300 characters.
    coalesce((
      select jsonb_object_agg(key, left(value, 300))
      from jsonb_each_text(coalesce(p_source, '{}'::jsonb))
      where key in ('page', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign') and value is not null
    ), '{}'::jsonb)
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.submit_product_interest(text, text, text, text, text, text, text, text, jsonb) from public;
grant execute on function public.submit_product_interest(text, text, text, text, text, text, text, text, jsonb) to anon, authenticated;
