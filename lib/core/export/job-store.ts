import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { asSystem, getDb } from "../db";
import { isDemo } from "../../leads";
import { createAdminClient } from "../../supabase/admin";
import { exportReadyMail } from "../../mail";
import { todayIso } from "../../quotes/schema";
import { readOrgId } from "../org/current";
import { invoiceFromRow, type InvoiceRecord } from "../invoices/store";
import type { Actor } from "../events";
import { archiveFileNames, archiveIndex, assembleArchive, renderArchivePart } from "./archive";
import { fileSlug } from "./csv";
import { exportOrgName, loadInvoices, logExport } from "./load";
import { issuedInvoices } from "./model";
import {
  EXPORT_BUCKET,
  LEASE_SECONDS,
  LINK_SECONDS,
  nextStep,
  outputPath,
  partCount,
  partFiles,
  partPath,
  volumeName,
  type ExportJob,
  type ExportJobFile,
  type ExportJobKind,
  type ExportJobOutput,
} from "./jobs";

// The PDF renderer loads on first use, not with every page that imports this module.
const renderInvoicePdf: typeof import("../../pdf/render-invoice").renderInvoicePdf = async (...args) => (await import("../../pdf/render-invoice")).renderInvoicePdf(...args);

/**
 * Background exports as they are stored (export_jobs and the private bucket
 * "exports", 0030). Members read their organisation's jobs and queue new ones
 * with their own session (RLS); the run itself (processExportJobs) is called
 * by /api/cron/exports with the cron secret and works with the service-role
 * client, each job as its own organisation (asSystem). Demo mode keeps the
 * jobs in memory and the files under uploads/exports/.
 */

type Row = Record<string, unknown>;

const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function fromRow(r: Row): ExportJob {
  return {
    id: String(r.id),
    orgId: String(r.org_id),
    kind: r.kind as ExportJobKind,
    status: r.status as ExportJob["status"],
    filePath: str(r.file_path),
    fileName: str(r.file_name),
    bytes: r.bytes === null || r.bytes === undefined ? null : Number(r.bytes),
    outputs: list<ExportJobOutput>(r.outputs),
    error: str(r.error),
    requestedBy: str(r.requested_by),
    requestedEmail: str(r.requested_email),
    files: list<ExportJobFile>(r.files),
    partsDone: Number(r.parts_done ?? 0),
    lockedUntil: str(r.locked_until),
    createdAt: String(r.created_at),
    startedAt: str(r.started_at),
    finishedAt: str(r.finished_at),
    expiresAt: str(r.expires_at),
  };
}

/** The columns a run changes, by their ExportJob names. */
type JobPatch = Partial<Pick<ExportJob, "status" | "filePath" | "fileName" | "bytes" | "outputs" | "error" | "files" | "partsDone" | "lockedUntil" | "startedAt" | "finishedAt" | "expiresAt">>;

const COLUMN: Record<keyof JobPatch, string> = {
  status: "status",
  filePath: "file_path",
  fileName: "file_name",
  bytes: "bytes",
  outputs: "outputs",
  error: "error",
  files: "files",
  partsDone: "parts_done",
  lockedUntil: "locked_until",
  startedAt: "started_at",
  finishedAt: "finished_at",
  expiresAt: "expires_at",
};

const toColumns = (patch: JobPatch): Row => Object.fromEntries(Object.entries(patch).map(([k, v]) => [COLUMN[k as keyof JobPatch], v]));

const g = globalThis as unknown as { __binaafyExportJobs?: ExportJob[] };
const demoJobs = () => (g.__binaafyExportJobs ??= []);

/* ---------- files ---------- */

const demoPath = (key: string) => path.join(process.cwd(), "uploads", "exports", ...key.split("/"));

async function putFile(key: string, data: Buffer): Promise<void> {
  if (isDemo()) {
    await fs.mkdir(path.dirname(demoPath(key)), { recursive: true });
    await fs.writeFile(demoPath(key), data);
    return;
  }
  const { error } = await createAdminClient().storage.from(EXPORT_BUCKET).upload(key, data, { contentType: "application/zip", upsert: true });
  if (error) throw new Error(`Kunde inte spara ${key.split("/").pop()} i Storage: ${error.message}`);
}

async function getFile(key: string): Promise<Buffer> {
  if (isDemo()) return fs.readFile(demoPath(key));
  const { data, error } = await createAdminClient().storage.from(EXPORT_BUCKET).download(key);
  if (error || !data) throw new Error(`Kunde inte läsa ${key.split("/").pop()} ur Storage: ${error?.message ?? "tom"}`);
  return Buffer.from(await data.arrayBuffer());
}

async function removeFiles(keys: string[]): Promise<void> {
  if (!keys.length) return;
  if (isDemo()) {
    await Promise.all(keys.map((k) => fs.rm(demoPath(k), { force: true })));
    return;
  }
  const { error } = await createAdminClient().storage.from(EXPORT_BUCKET).remove(keys);
  if (error) console.error("[export-jobs] could not remove files:", error.message);
}

/** A finished file in demo mode, for the download route. */
export async function readDemoExportFile(key: string): Promise<Buffer> {
  return fs.readFile(demoPath(key));
}

/* ---------- reads, with the user's session ---------- */

export async function listExportJobs(limit = 5): Promise<ExportJob[]> {
  if (isDemo()) return [...demoJobs()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  const supabase = await getDb();
  const org = await readOrgId();
  let q = supabase.from("export_jobs").select("*");
  if (org) q = q.eq("org_id", org);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Kunde inte hämta exportjobben: ${error.message}`);
  return ((data ?? []) as Row[]).map(fromRow);
}

export async function getExportJob(id: string): Promise<ExportJob | null> {
  if (isDemo()) return demoJobs().find((j) => j.id === id) ?? null;
  const supabase = await getDb();
  const { data, error } = await supabase.from("export_jobs").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Kunde inte hämta exportjobbet: ${error.message}`);
  return data ? fromRow(data as Row) : null;
}

/** Issued invoices and credit notes in the session's organisation: what the archive would hold. */
export async function countArchiveInvoices(): Promise<number> {
  if (isDemo()) return issuedInvoices(await loadInvoices("demo")).length;
  const supabase = await getDb();
  const org = await readOrgId();
  let q = supabase.from("invoices").select("id", { count: "exact", head: true }).neq("status", "draft").not("number", "is", null);
  if (org) q = q.eq("org_id", org);
  const { count, error } = await q;
  if (error) throw new Error(`Kunde inte räkna fakturorna: ${error.message}`);
  return count ?? 0;
}

/**
 * A short-lived link to one of a finished job's files, signed with the
 * user's session so the bucket's policy decides. Demo mode streams the file
 * through the download route instead.
 */
export async function exportFileUrl(job: ExportJob, index: number): Promise<string> {
  const output = job.outputs[index];
  if (!output) throw new Error("Filen finns inte.");
  const supabase = await getDb();
  const { data, error } = await supabase.storage.from(EXPORT_BUCKET).createSignedUrl(output.path, 60 * 10, { download: output.name });
  if (error || !data) throw new Error(`Kunde inte skapa länken: ${error?.message ?? "okänt fel"}`);
  return data.signedUrl;
}

/* ---------- queueing ---------- */

export class ExportJobRunningError extends Error {
  constructor(public job: ExportJob | null) {
    super("Ett arkiv byggs redan. Vänta tills det är klart.");
    this.name = "ExportJobRunningError";
  }
}

/** Queue a job in the user's name. One queued or running job of a kind per organisation (unique index in 0030). */
export async function requestExportJob(kind: ExportJobKind, who: { orgId: string; userId: string | null; email: string | null }): Promise<ExportJob> {
  if (isDemo()) {
    const running = demoJobs().find((j) => j.orgId === who.orgId && j.kind === kind && (j.status === "queued" || j.status === "running"));
    if (running) throw new ExportJobRunningError(running);
    const job: ExportJob = {
      id: crypto.randomUUID(),
      orgId: who.orgId,
      kind,
      status: "queued",
      filePath: null,
      fileName: null,
      bytes: null,
      outputs: [],
      error: null,
      requestedBy: who.userId,
      requestedEmail: who.email,
      files: [],
      partsDone: 0,
      lockedUntil: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      expiresAt: null,
    };
    demoJobs().push(job);
    return job;
  }
  const supabase = await getDb();
  const { data, error } = await supabase
    .from("export_jobs")
    .insert({ org_id: who.orgId, kind, requested_by: who.userId, requested_email: who.email })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      const { data: running } = await supabase.from("export_jobs").select("*").eq("org_id", who.orgId).eq("kind", kind).in("status", ["queued", "running"]).maybeSingle();
      throw new ExportJobRunningError(running ? fromRow(running as Row) : null);
    }
    throw new Error(`Kunde inte köa exporten: ${error.message}`);
  }
  return fromRow(data as Row);
}

/**
 * Start a run of the queue now instead of waiting for the daily cron: a
 * request to /api/cron/exports with the cron secret, which answers at once
 * and works after the response. Demo mode, or a deployment without
 * CRON_SECRET, runs the queue in this process instead (the caller is inside
 * after(), so it has the route's maxDuration). Never throws; a job that is
 * not finished here is picked up by the next run.
 */
export async function kickExportJobs(origin: string | null): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (isDemo() || !secret || !origin) {
    if (!isDemo()) console.warn("[export-jobs] CRON_SECRET or origin missing; running the queue in this request.");
    await processExportJobs().catch((err) => console.error("[export-jobs] run failed:", err));
    return;
  }
  try {
    const res = await fetch(`${origin}/api/cron/exports`, { headers: { authorization: `Bearer ${secret}` }, cache: "no-store" });
    if (!res.ok) console.error(`[export-jobs] kick answered ${res.status}`);
  } catch (err) {
    console.error("[export-jobs] kick failed:", err instanceof Error ? err.message : err);
  }
}

/* ---------- the run, as system ---------- */

type Repo = {
  /** Open jobs nobody holds, oldest first, taken with a lease. */
  claim(now: Date): Promise<ExportJob | null>;
  save(job: ExportJob, patch: JobPatch): Promise<ExportJob>;
  /** Done jobs whose link has expired. */
  expired(now: Date): Promise<ExportJob[]>;
  /** Whether any job is still queued or running. */
  open(): Promise<boolean>;
};

const lease = (now: Date) => new Date(now.getTime() + LEASE_SECONDS * 1000).toISOString();
const free = (j: ExportJob, now: Date) => !j.lockedUntil || new Date(j.lockedUntil) < now;
const isOpen = (j: ExportJob) => j.status === "queued" || j.status === "running";

const demoRepo: Repo = {
  async claim(now) {
    const job = demoJobs()
      .filter((j) => isOpen(j) && free(j, now))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (!job) return null;
    return Object.assign(job, { status: "running", lockedUntil: lease(now) });
  },
  async save(job, patch) {
    return Object.assign(demoJobs().find((j) => j.id === job.id) ?? job, patch);
  },
  async expired(now) {
    return demoJobs().filter((j) => j.status === "done" && j.expiresAt && new Date(j.expiresAt) < now);
  },
  async open() {
    return demoJobs().some(isOpen);
  },
};

const dbRepo: Repo = {
  async claim(now) {
    const db = createAdminClient();
    const at = now.toISOString();
    const { data, error } = await db
      .from("export_jobs")
      .select("id")
      .in("status", ["queued", "running"])
      .or(`locked_until.is.null,locked_until.lt.${at}`)
      .order("created_at")
      .limit(5);
    if (error) throw new Error(`Kunde inte läsa exportkön: ${error.message}`);
    for (const { id } of (data ?? []) as { id: string }[]) {
      // Taken only if still free: two runs never hold the same job.
      const { data: claimed, error: claimError } = await db
        .from("export_jobs")
        .update({ status: "running", locked_until: lease(now) })
        .eq("id", id)
        .in("status", ["queued", "running"])
        .or(`locked_until.is.null,locked_until.lt.${at}`)
        .select("*")
        .maybeSingle();
      if (claimError) throw new Error(`Kunde inte ta exportjobbet: ${claimError.message}`);
      if (claimed) return fromRow(claimed as Row);
    }
    return null;
  },
  async save(job, patch) {
    const { data, error } = await createAdminClient().from("export_jobs").update(toColumns(patch)).eq("id", job.id).select("*").single();
    if (error) throw new Error(`Kunde inte spara exportjobbet: ${error.message}`);
    return fromRow(data as Row);
  },
  async expired(now) {
    const { data, error } = await createAdminClient().from("export_jobs").select("*").eq("status", "done").lt("expires_at", now.toISOString()).limit(100);
    if (error) throw new Error(`Kunde inte läsa exportjobben: ${error.message}`);
    return ((data ?? []) as Row[]).map(fromRow);
  },
  async open() {
    const { count, error } = await createAdminClient().from("export_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "running"]);
    if (error) throw new Error(`Kunde inte läsa exportkön: ${error.message}`);
    return (count ?? 0) > 0;
  },
};

const repo = () => (isDemo() ? demoRepo : dbRepo);

/** These invoices, in the order given. Under asSystem with the job's organisation. */
async function loadInvoicesById(orgId: string, ids: string[]): Promise<InvoiceRecord[]> {
  let found: InvoiceRecord[];
  if (isDemo()) found = (await loadInvoices(orgId)).filter((i) => ids.includes(i.id));
  else {
    const { data, error } = await (await getDb()).from("invoices").select("*").eq("org_id", orgId).in("id", ids);
    if (error) throw new Error(`Kunde inte läsa fakturorna: ${error.message}`);
    found = ((data ?? []) as Row[]).map(invoiceFromRow);
  }
  const byId = new Map(found.map((i) => [i.id, i]));
  return ids.map((id) => {
    const inv = byId.get(id);
    if (!inv) throw new Error("En faktura i arkivet finns inte längre.");
    return inv;
  });
}

const render = (inv: InvoiceRecord) => renderInvoicePdf(inv, { swishQr: false });

/** One step of a job. Returns the job as saved. */
async function step(job: ExportJob, r: Repo): Promise<ExportJob> {
  const now = new Date();
  const s = nextStep(job);
  if (s.kind === "start") {
    // Freeze the archive: these invoices, these names, whatever is issued later.
    const invoices = issuedInvoices(await loadInvoices(job.orgId));
    const names = archiveFileNames(invoices);
    return r.save(job, { files: invoices.map((i) => ({ id: i.id, name: names.get(i.id)! })), startedAt: now.toISOString(), lockedUntil: lease(now) });
  }
  if (s.kind === "part") {
    const files = partFiles(job, s.index);
    const zip = await renderArchivePart(await loadInvoicesById(job.orgId, files.map((f) => f.id)), new Map(files.map((f) => [f.id, f.name])), render);
    await putFile(partPath(job.orgId, job.id, s.index), zip);
    return r.save(job, { partsDone: s.index + 1, lockedUntil: lease(new Date()) });
  }
  if (s.kind === "assemble") return assemble(job, r);
  return job;
}

async function assemble(job: ExportJob, r: Repo): Promise<ExportJob> {
  const parts = partCount(job.files.length);
  const partKeys = Array.from({ length: parts }, (_, k) => partPath(job.orgId, job.id, k));
  const invoices = job.files.length ? await loadInvoicesById(job.orgId, job.files.map((f) => f.id)) : [];
  const index = archiveIndex(invoices, new Map(job.files.map((f) => [f.id, f.name])));
  const partZips: Buffer[] = [];
  for (const key of partKeys) partZips.push(await getFile(key));
  const { zips } = assembleArchive(index, partZips);

  const orgName = await exportOrgName(job.orgId).catch(() => "organisationen");
  const fileName = `${fileSlug(orgName)}-fakturor-pdf-${todayIso()}.zip`;
  const outputs: ExportJobOutput[] = zips.map((zip, k) => {
    const name = volumeName(fileName, k, zips.length);
    return { path: outputPath(job.orgId, job.id, name), name, bytes: zip.length };
  });
  for (let k = 0; k < zips.length; k++) await putFile(outputs[k].path, zips[k]);
  await removeFiles(partKeys);

  const finished = new Date();
  const expiresAt = new Date(finished.getTime() + LINK_SECONDS * 1000).toISOString();
  const bytes = outputs.reduce((n, o) => n + o.bytes, 0);
  const saved = await r.save(job, {
    status: "done",
    outputs,
    filePath: outputs[0].path,
    fileName,
    bytes,
    finishedAt: finished.toISOString(),
    expiresAt,
    lockedUntil: null,
  });

  const actor: Actor = saved.requestedBy ? { kind: "user", id: saved.requestedBy, name: saved.requestedEmail ?? saved.requestedBy } : { kind: "system", name: "export" };
  await logExport(job.orgId, "export.pdf_archive", { invoices: job.files.length, bytes, file: fileName, volumes: outputs.length, job: job.id, background: true }, actor);

  // The archive is done whatever happens to the mail; the export page links it too.
  if (saved.requestedEmail) {
    try {
      const links = await Promise.all(outputs.map(async (o, k) => ({ name: o.name, bytes: o.bytes, url: await signedLink(o.path, o.name, job.id, k) })));
      await exportReadyMail({ to: saved.requestedEmail, orgName, invoices: job.files.length, links, expiresOn: expiresAt.slice(0, 10) });
    } catch (err) {
      console.error(`[export-jobs] mail for job ${job.id} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return saved;
}

/** The link in the mail: signed for LINK_DAYS days with the service role. Demo mode links the download route. */
async function signedLink(key: string, name: string, jobId: string, index: number): Promise<string> {
  if (isDemo()) return `${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "http://localhost:3000"}/admin/ekonomi/export/jobb/${jobId}?del=${index}`;
  const { data, error } = await createAdminClient().storage.from(EXPORT_BUCKET).createSignedUrl(key, LINK_SECONDS, { download: name });
  if (error || !data) throw new Error(`Kunde inte skapa länken: ${error?.message ?? "okänt fel"}`);
  return data.signedUrl;
}

/**
 * Work through the queue until it is empty or the time is up: take a job,
 * do its steps (freeze, parts of 50, join, mail), let it go. A job that fails
 * is marked failed with the reason and its parts are removed; the user can
 * ask again. Returns whether work remains, so the caller can start another
 * run.
 */
export async function processExportJobs(options: { budgetMs?: number } = {}): Promise<{ jobs: { id: string; status: string; partsDone: number; error?: string }[]; remaining: boolean }> {
  const deadline = Date.now() + (options.budgetMs ?? 240_000);
  const r = repo();
  const jobs: { id: string; status: string; partsDone: number; error?: string }[] = [];
  while (Date.now() < deadline) {
    const claimed = await r.claim(new Date());
    if (!claimed) break;
    let job = claimed;
    try {
      job = await asSystem(async () => {
        let j = job;
        while (nextStep(j).kind !== "none" && Date.now() < deadline) j = await step(j, r);
        return j;
      }, job.orgId);
      // Out of time: let the job go so the next run takes it at once.
      if (nextStep(job).kind !== "none") job = await r.save(job, { lockedUntil: null });
      jobs.push({ id: job.id, status: job.status, partsDone: job.partsDone });
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 2000);
      console.error(`[export-jobs] job ${job.id} failed:`, message);
      await removeFiles(Array.from({ length: job.partsDone }, (_, k) => partPath(job.orgId, job.id, k)));
      await r.save(job, { status: "failed", error: message, finishedAt: new Date().toISOString(), lockedUntil: null }).catch(() => {});
      jobs.push({ id: job.id, status: "failed", partsDone: job.partsDone, error: message });
    }
  }
  return { jobs, remaining: await r.open() };
}

/** Remove the files of jobs whose link has expired; the job stays, as 'expired'. Run daily. */
export async function expireExportJobs(): Promise<number> {
  const r = repo();
  const expired = await r.expired(new Date());
  for (const job of expired) {
    await removeFiles(job.outputs.map((o) => o.path));
    await r.save(job, { status: "expired" });
  }
  return expired.length;
}
