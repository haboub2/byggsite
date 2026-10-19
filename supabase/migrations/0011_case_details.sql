-- Case details for the software case pages: whether the product is live,
-- what kind of product it is, where and when, a "what we built" checklist
-- and app store links. All optional, so existing cases keep working.

alter table cases add column if not exists status          text not null default 'live';  -- 'live' | 'dev'
alter table cases add column if not exists platform        text not null default 'web';   -- 'web' | 'app' | 'both'
alter table cases add column if not exists country         text;
alter table cases add column if not exists year            int;
alter table cases add column if not exists features        text[] not null default '{}';
alter table cases add column if not exists app_store_url   text;
alter table cases add column if not exists play_store_url  text;

-- area now also takes 'plattformar' (apps and marketplaces). It is plain
-- text, so there is no constraint to change.
