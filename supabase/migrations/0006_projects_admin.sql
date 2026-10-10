-- Projects edited from /admin.
-- Services live in code (lib/placeholder.ts), not in the services table, so
-- the foreign key would reject every project with a service. The slug is
-- still validated by the admin before saving.
alter table projects drop constraint if exists projects_service_slug_fkey;

-- Alt text for the main photos (the gallery keeps its own {path, alt} objects).
alter table projects add column if not exists cover_alt  text;
alter table projects add column if not exists before_alt text;
alter table projects add column if not exists after_alt  text;
alter table projects add column if not exists updated_at timestamptz not null default now();

create trigger projects_set_updated_at before update on projects
  for each row execute function set_updated_at();
