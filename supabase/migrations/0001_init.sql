-- Byggly 01 — initial schema.
-- Mirrors PLAN.md §5.1. Run locally with `supabase start` + `supabase db reset`,
-- or against a real project once one exists (`supabase link` then `supabase db push`).

create extension if not exists pgcrypto;

create table content_blocks (
  key         text primary key,             -- 'site' | 'bygg' | 'software'
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

create table services (
  slug        text primary key,
  division    text not null default 'bygg',
  title       text not null,
  short_desc  text,
  hero_lead   text,
  icon        text,                          -- svg path string
  price_from  text,
  duration    text,
  areas       text[] default '{}',
  faq         jsonb default '[]',            -- [{q,a}]
  sort        int  default 0,
  published   boolean default true,
  updated_at  timestamptz not null default now()
);                                           -- long body = content/tjanster/{slug}.mdx

create table projects (
  slug        text primary key,
  title       text not null,
  service_slug text references services(slug),
  location    text,
  year        int,
  summary     text,
  scope       text[] default '{}',
  duration    text,
  testimonial jsonb,                          -- {quote, author}
  cover_path  text,                           -- path in 'gallery' bucket
  before_path text,
  after_path  text,
  gallery     jsonb default '[]',             -- [{path, alt}]
  featured    boolean default false,
  sort        int default 0,
  published   boolean default true,
  created_at  timestamptz not null default now()
);

create table cases (                          -- software case studies (body = content/case/{slug}.mdx)
  slug        text primary key,
  title       text not null,
  client      text,
  summary     text,
  metrics     jsonb default '[]',             -- [{label, value}]
  featured    boolean default false,
  published   boolean default true,
  created_at  timestamptz not null default now()
);

create table gallery_images (                 -- standalone gallery not tied to a project
  id          uuid primary key default gen_random_uuid(),
  path        text not null,                  -- path in 'gallery' bucket
  alt         text,
  division    text default 'bygg',
  sort        int default 0,
  created_at  timestamptz not null default now()
);

create table leads (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  division    text not null,                  -- 'bygg' | '01'
  kind        text not null,                  -- 'offert' | 'kontakt' | 'brief'
  name        text, email text, phone text,
  service     text, budget text, timeline text,
  message     text,
  source      jsonb,                          -- {utm_source, utm_medium, utm_campaign, referrer, page}
  status      text not null default 'new',    -- new|contacted|won|lost
  note        text
);

create table admins ( user_id uuid primary key references auth.users(id) on delete cascade );

create or replace function is_admin() returns boolean language sql stable as
  $$ select exists(select 1 from admins where user_id = auth.uid()) $$;

-- ---- helpful indexes (not in the plan's sketch, but cheap and obviously needed) ----
create index services_division_idx  on services (division, sort);
create index projects_featured_idx  on projects (featured, sort);
create index cases_featured_idx     on cases (featured);
create index gallery_division_idx   on gallery_images (division, sort);
create index leads_created_at_idx   on leads (created_at desc);
create index leads_status_idx       on leads (status);

-- ---- keep updated_at honest on UPDATE ----
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger content_blocks_set_updated_at before update on content_blocks
  for each row execute function set_updated_at();
create trigger services_set_updated_at before update on services
  for each row execute function set_updated_at();
