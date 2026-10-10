-- Version history for content edited in /admin (content_blocks).
-- Every save writes the new version here too, so any earlier version can be
-- restored from the admin. Admin-only, like content_blocks writes.

create table content_history (
  id         uuid primary key default gen_random_uuid(),
  key        text not null,
  data       jsonb not null,
  saved_by   text,
  saved_at   timestamptz not null default now()
);

create index content_history_key_idx on content_history (key, saved_at desc);

alter table content_history enable row level security;

create policy "content_history_select_admin" on content_history
  for select to authenticated using (is_admin());
create policy "content_history_insert_admin" on content_history
  for insert to authenticated with check (is_admin());
