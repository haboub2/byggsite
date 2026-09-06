-- Row Level Security. Mirrors PLAN.md §5.2.
-- Rule of thumb: anon/public gets read-only on published content; every write
-- requires is_admin(); leads has NO anon policy at all — writes go through the
-- service-role client in app/api/*/route.ts, which bypasses RLS entirely.

alter table content_blocks  enable row level security;
alter table services        enable row level security;
alter table projects        enable row level security;
alter table cases           enable row level security;
alter table gallery_images  enable row level security;
alter table leads           enable row level security;
alter table admins          enable row level security;

-- ---- content_blocks: no published flag, always public-readable ----
create policy "content_blocks_select" on content_blocks
  for select to anon, authenticated using (true);
create policy "content_blocks_write" on content_blocks
  for all to authenticated using (is_admin()) with check (is_admin());

-- ---- services ----
create policy "services_select" on services
  for select to anon, authenticated using (published or is_admin());
create policy "services_write" on services
  for all to authenticated using (is_admin()) with check (is_admin());

-- ---- projects ----
create policy "projects_select" on projects
  for select to anon, authenticated using (published or is_admin());
create policy "projects_write" on projects
  for all to authenticated using (is_admin()) with check (is_admin());

-- ---- cases ----
create policy "cases_select" on cases
  for select to anon, authenticated using (published or is_admin());
create policy "cases_write" on cases
  for all to authenticated using (is_admin()) with check (is_admin());

-- ---- gallery_images: no published flag, always public-readable ----
create policy "gallery_images_select" on gallery_images
  for select to anon, authenticated using (true);
create policy "gallery_images_write" on gallery_images
  for all to authenticated using (is_admin()) with check (is_admin());

-- ---- leads: intentionally no anon policy of any kind ----
create policy "leads_select_admin" on leads
  for select to authenticated using (is_admin());
create policy "leads_update_admin" on leads
  for update to authenticated using (is_admin()) with check (is_admin());
-- No insert/delete policy for anyone, including authenticated non-admins.
-- app/api/{offert,contact,brief}/route.ts insert with the service-role key,
-- which bypasses RLS — that is the only way a row is ever created.

-- ---- admins: readable by admins (to render the admin list), never self-service ----
create policy "admins_select_admin" on admins
  for select to authenticated using (is_admin());
-- No insert/update/delete policy — manage membership from the Supabase dashboard
-- or via the service-role key in a one-off script, never from the app.
