-- Quotes ("offerter") written from /admin and sent to customers as PDF.
-- The document itself is one JSON blob (lib/quotes/schema.ts); the columns
-- beside it are what the list and the filters need. Admin-only, like leads.

create sequence if not exists quote_number_seq start with 1001;

create table quotes (
  id            uuid primary key default gen_random_uuid(),
  number        int not null unique default nextval('quote_number_seq'),
  status        text not null default 'draft',   -- draft|sent|accepted|declined
  division      text not null,                   -- 'bygg' | '01'
  customer_name text not null default '',
  title         text not null default '',
  total         int not null default 0,          -- what the customer pays, kr
  data          jsonb not null,
  lead_id       uuid references leads(id) on delete set null,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  sent_at       timestamptz
);

create index quotes_updated_at_idx on quotes (updated_at desc);
create index quotes_status_idx     on quotes (status);
create index quotes_lead_idx       on quotes (lead_id);

create trigger quotes_set_updated_at before update on quotes
  for each row execute function set_updated_at();

-- Templates the admins save themselves (the built-in ones live in code).
create table quote_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  division    text not null,
  data        jsonb not null,
  created_at  timestamptz not null default now()
);

alter table quotes          enable row level security;
alter table quote_templates enable row level security;

create policy "quotes_admin" on quotes
  for all to authenticated using (is_admin()) with check (is_admin());
create policy "quote_templates_admin" on quote_templates
  for all to authenticated using (is_admin()) with check (is_admin());
