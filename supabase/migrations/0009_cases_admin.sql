-- Software cases edited from /admin (same pattern as projects in 0006).
-- The cases table exists since 0001 with RLS from 0002 (public reads
-- published rows, admins write). This adds the fields the editor needs.

alter table cases add column if not exists area        text;                    -- 'webb' | 'automation' | 'interna-system'
alter table cases add column if not exists url         text;                    -- live site or product, optional
alter table cases add column if not exists situation   text;
alter table cases add column if not exists solution    text;
alter table cases add column if not exists stack       text[] not null default '{}';
alter table cases add column if not exists testimonial jsonb;                   -- {quote, author}
alter table cases add column if not exists cover_path  text;                    -- path in the 'gallery' bucket
alter table cases add column if not exists cover_alt   text;
alter table cases add column if not exists gallery     jsonb not null default '[]';  -- [{path, alt}]
alter table cases add column if not exists sort        int not null default 0;
alter table cases add column if not exists updated_at  timestamptz not null default now();

-- New cases start as drafts.
alter table cases alter column published set default false;

create index if not exists cases_sort_idx on cases (sort);

drop trigger if exists cases_set_updated_at on cases;
create trigger cases_set_updated_at before update on cases
  for each row execute function set_updated_at();
