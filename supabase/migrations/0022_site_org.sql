-- Webbplatsen och förfrågningarna följer organisationen (fas 5, punkten
-- "Offerterna och webbplatsen" i docs/fakturering.md).
--
-- Sedan 0014 betyder is_admin() owner/admin i VILKEN organisation som helst.
-- Det styr fortfarande webbplatsens innehåll (content_blocks och dess
-- historik, tjänster, projekt, case, galleriet och bucketen gallery),
-- tabellen admins och förfrågningarna (leads). En owner i en andra
-- organisation kunde alltså läsa Binaafys förfrågningar och skriva om sajten.
--
-- Här:
--   1. is_site_admin(): owner/admin i den organisation som äger webbplatsen,
--      default_org() (den äldsta, Binaafy). Webbplatsen har ingen org_id;
--      den hör till en organisation, och bara den organisationens owner/admin
--      skriver i den.
--   2. Alla webbplatsens policies byter is_admin() mot is_site_admin().
--   3. leads läses och uppdateras av personal i radens egen organisation
--      (org_id finns sedan 0014). Formulären på sajten skriver fortfarande med
--      service role, och org_id blir default_org() som förut.
--   4. is_admin() omdefinieras till is_site_admin(), så att ingen policy som
--      glömts kvar betyder "owner/admin någonstans".
--
-- Körs i Supabase SQL-editor efter 0021. Provet ligger i
-- supabase/tests/0022_rls.sql.

-- =====================================================================
-- 1. Webbplatsens organisation
-- =====================================================================

-- security definer: frågan ställs mot default_org() oavsett vilka
-- organisationer anroparen ser. anon får köra den, eftersom de publika
-- läsreglerna ("published or …") anropar den; auth.uid() är då null och
-- svaret false.
create or replace function public.is_site_admin() returns boolean
  language sql stable security definer set search_path = public
as $$ select public.can_admin_org(public.default_org()) $$;

revoke all on function public.is_site_admin() from public;
grant execute on function public.is_site_admin() to anon, authenticated;

-- =====================================================================
-- 2. Webbplatsens innehåll
-- =====================================================================

drop policy "content_blocks_write" on content_blocks;
create policy "content_blocks_write" on content_blocks
  for all to authenticated using (is_site_admin()) with check (is_site_admin());

drop policy "content_history_select_admin" on content_history;
drop policy "content_history_insert_admin" on content_history;
create policy "content_history_select_site" on content_history
  for select to authenticated using (is_site_admin());
create policy "content_history_insert_site" on content_history
  for insert to authenticated with check (is_site_admin());

drop policy "services_select" on services;
drop policy "services_write" on services;
create policy "services_select" on services
  for select to anon, authenticated using (published or is_site_admin());
create policy "services_write" on services
  for all to authenticated using (is_site_admin()) with check (is_site_admin());

drop policy "projects_select" on projects;
drop policy "projects_write" on projects;
create policy "projects_select" on projects
  for select to anon, authenticated using (published or is_site_admin());
create policy "projects_write" on projects
  for all to authenticated using (is_site_admin()) with check (is_site_admin());

drop policy "cases_select" on cases;
drop policy "cases_write" on cases;
create policy "cases_select" on cases
  for select to anon, authenticated using (published or is_site_admin());
create policy "cases_write" on cases
  for all to authenticated using (is_site_admin()) with check (is_site_admin());

drop policy "gallery_images_write" on gallery_images;
create policy "gallery_images_write" on gallery_images
  for all to authenticated using (is_site_admin()) with check (is_site_admin());

drop policy "admins_select_admin" on admins;
create policy "admins_select_site" on admins
  for select to authenticated using (is_site_admin());

-- Bucketen gallery: alla läser, webbplatsens owner/admin skriver.
drop policy "gallery_admin_insert" on storage.objects;
drop policy "gallery_admin_update" on storage.objects;
drop policy "gallery_admin_delete" on storage.objects;
create policy "gallery_site_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'gallery' and is_site_admin());
create policy "gallery_site_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'gallery' and is_site_admin())
  with check (bucket_id = 'gallery' and is_site_admin());
create policy "gallery_site_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'gallery' and is_site_admin());

-- =====================================================================
-- 3. Förfrågningarna följer radens organisation
-- =====================================================================

-- Personal och uppåt (som offerterna), inte läsare: en förfrågan har
-- namn, telefon och meddelande, och läsrollerna gäller ekonomin.
drop policy "leads_select_admin" on leads;
drop policy "leads_update_admin" on leads;
create policy "leads_staff_select" on leads
  for select to authenticated using (can_write_org(org_id));
create policy "leads_staff_update" on leads
  for update to authenticated using (can_write_org(org_id)) with check (can_write_org(org_id));
-- Fortfarande ingen insert- eller delete-policy: formulären skriver med
-- service role (lib/lead-handler.ts), och en förfrågan tas inte bort i appen.

-- =====================================================================
-- 4. is_admin() betyder webbplatsens owner/admin
-- =====================================================================

-- Ingen policy använder is_admin() efter detta, men funktionen finns kvar
-- (anon och authenticated får köra den sedan 0007). Den får inte längre
-- betyda "owner/admin någonstans".
create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public
as $$ select public.is_site_admin() $$;
