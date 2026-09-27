-- Storage bucket + policies. Mirrors PLAN.md §5.3.
-- Upload path convention: projects/{slug}/{uuid}.{ext}, gallery/{uuid}.{ext}.

insert into storage.buckets (id, name, public)
values ('gallery', 'gallery', true)
on conflict (id) do nothing;

create policy "gallery_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'gallery');

create policy "gallery_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'gallery' and is_admin());

create policy "gallery_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'gallery' and is_admin())
  with check (bucket_id = 'gallery' and is_admin());

create policy "gallery_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'gallery' and is_admin());
