-- 0030: PDF-arkivet som bakgrundsjobb (docs/fakturering.md, Läge
-- 2026-10-25).
--
-- En organisation med många utfärdade fakturor får inte zippen i anropet:
-- en rad i export_jobs köas, och cron-routen /api/cron/exports bygger filen
-- i delar om 50 fakturor (lib/core/export/job-store.ts). Delarna och den
-- färdiga zippen ligger i den privata bucketen "exports" under
-- <org_id>/<jobb_id>/…; den som begärde får en signerad länk som gäller
-- 7 dagar, och därefter tas filen bort och jobbet blir 'expired'.
--
-- Medlemmar i organisationen läser sina jobb och köar nya i eget namn;
-- allt annat (status, delar, fil) skrivs av jobbet med service role.

-- =====================================================================
-- 1. export_jobs
-- =====================================================================

create table export_jobs (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  kind            text not null check (kind in ('pdf_archive')),
  status          text not null default 'queued' check (status in ('queued','running','done','failed','expired')),
  -- Den färdiga filen i bucketen exports, namnet den laddas ner med och
  -- storleken. Ett stort arkiv delas i volymer som var och en ryms i
  -- Storage; outputs listar alla [{path, name, bytes}], file_path är den
  -- första.
  file_path       text,
  file_name       text,
  bytes           bigint,
  outputs         jsonb not null default '[]'::jsonb,
  error           text check (char_length(error) <= 2000),
  requested_by    uuid references auth.users(id) on delete set null,
  -- Dit länken mejlas; frusen vid beställningen.
  requested_email text check (char_length(requested_email) <= 320),
  -- Fakturorna i arkivet och deras filnamn [{id, name}], i arkivets
  -- ordning, frysta när jobbet startar, och hur många delar om 50 som är
  -- klara.
  files           jsonb not null default '[]'::jsonb,
  parts_done      int not null default 0 check (parts_done >= 0),
  -- En körning håller jobbet till hit, så att två körningar aldrig bygger
  -- samma del.
  locked_until    timestamptz,
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz,
  -- När länken och filen slutar gälla.
  expires_at      timestamptz
);
create index export_jobs_org_idx on export_jobs (org_id, created_at desc);
create index export_jobs_open_idx on export_jobs (status) where status in ('queued','running','done');
-- Ett pågående jobb av varje slag per organisation.
create unique index export_jobs_one_active on export_jobs (org_id, kind) where status in ('queued','running');

alter table export_jobs enable row level security;

create policy "export_jobs_member_select" on export_jobs
  for select to authenticated using (is_org_member(org_id));
-- Varje medlem som får ladda ner arkivet får köa det, men bara i eget namn
-- och som ett nytt, tomt jobb.
create policy "export_jobs_member_insert" on export_jobs
  for insert to authenticated
  with check (
    is_org_member(org_id)
    and requested_by = auth.uid()
    and status = 'queued'
    and file_path is null
    and parts_done = 0
    and files = '[]'::jsonb
    and outputs = '[]'::jsonb
    and started_at is null
  );

-- =====================================================================
-- 2. Bucketen exports
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('exports', 'exports', false)
on conflict (id) do nothing;

-- Läsning för organisationens medlemmar (första mappen är org_id). Ingen
-- policy för skrivning: bara service role lägger och tar bort filer.
create policy "exports_member_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'exports'
    and (storage.foldername(name))[1] in (select m.org_id::text from public.memberships m where m.user_id = auth.uid())
  );
