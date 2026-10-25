/**
 * Background exports (export_jobs, 0030): the rules the job store and the
 * export page share, as pure functions. Today there is one kind, the PDF
 * archive; an organisation with more issued invoices than QUEUE_THRESHOLD
 * (or anyone who asks) gets it as a job instead of in the request. The job
 * freezes the invoices and their file names when it starts, renders them in
 * parts of PART_SIZE, joins the parts into the archive, and mails a link that
 * works for LINK_DAYS days.
 */

export const QUEUE_THRESHOLD = 300;
export const PART_SIZE = 50;
export const LINK_DAYS = 7;
export const LINK_SECONDS = LINK_DAYS * 24 * 60 * 60;
/** How long one run holds a job. Longer than a part takes, shorter than a run may last. */
export const LEASE_SECONDS = 330;
export const EXPORT_BUCKET = "exports";

export type ExportJobKind = "pdf_archive";
export type ExportJobStatus = "queued" | "running" | "done" | "failed" | "expired";

/** An invoice in the archive and the file it gets, frozen when the job starts. */
export type ExportJobFile = { id: string; name: string };
/** A finished file in Storage: one, or several volumes when the archive is large. */
export type ExportJobOutput = { path: string; name: string; bytes: number };

export type ExportJob = {
  id: string;
  orgId: string;
  kind: ExportJobKind;
  status: ExportJobStatus;
  filePath: string | null;
  fileName: string | null;
  bytes: number | null;
  outputs: ExportJobOutput[];
  error: string | null;
  requestedBy: string | null;
  requestedEmail: string | null;
  files: ExportJobFile[];
  partsDone: number;
  lockedUntil: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  expiresAt: string | null;
};

/** The request gets the zip unless the organisation is large or the user asked for the job. */
export function shouldQueue(issuedCount: number, requested = false): boolean {
  return requested || issuedCount > QUEUE_THRESHOLD;
}

export function partCount(files: number): number {
  return Math.ceil(files / PART_SIZE);
}

/** The invoices of part `index` (0-based). */
export function partFiles(job: Pick<ExportJob, "files">, index: number): ExportJobFile[] {
  return job.files.slice(index * PART_SIZE, (index + 1) * PART_SIZE);
}

export type ExportJobStep = { kind: "start" } | { kind: "part"; index: number } | { kind: "assemble" } | { kind: "none" };

/**
 * What a run does next with a job: freeze the invoices, render the next
 * part, or join the parts. A job that has started with no invoices goes
 * straight to joining (the archive is then index.csv alone).
 */
export function nextStep(job: Pick<ExportJob, "status" | "files" | "partsDone" | "startedAt">): ExportJobStep {
  if (job.status !== "queued" && job.status !== "running") return { kind: "none" };
  if (!job.startedAt) return { kind: "start" };
  if (job.partsDone < partCount(job.files.length)) return { kind: "part", index: job.partsDone };
  return { kind: "assemble" };
}

/** Where a job's files go in the bucket: <org>/<job>/…, so the bucket's policy can check the organisation. */
export function partPath(orgId: string, jobId: string, index: number): string {
  return `${orgId}/${jobId}/del-${String(index + 1).padStart(4, "0")}.zip`;
}

export function outputPath(orgId: string, jobId: string, fileName: string): string {
  return `${orgId}/${jobId}/${fileName}`;
}

/** "acme-fakturor-pdf-2026-10-25.zip", or with -del-2-av-3 when the archive is split. */
export function volumeName(fileName: string, index: number, count: number): string {
  return count <= 1 ? fileName : fileName.replace(/\.zip$/, `-del-${index + 1}-av-${count}.zip`);
}

/** The job's state for the export page, in Swedish. */
export function jobStatusText(job: Pick<ExportJob, "status" | "files" | "partsDone" | "startedAt" | "error" | "expiresAt">, now: Date = new Date()): string {
  const parts = partCount(job.files.length);
  switch (job.status) {
    case "queued":
      return "I kö. Arkivet byggs inom kort.";
    case "running":
      if (!job.startedAt) return "Startar.";
      if (job.partsDone < parts) return `Byggs: ${Math.min(job.partsDone * PART_SIZE, job.files.length)} av ${job.files.length} fakturor klara.`;
      return "Fakturorna är klara, zip-filen sätts ihop.";
    case "done":
      return job.expiresAt && new Date(job.expiresAt) <= now ? "Länken har gått ut." : `Klart. Länken gäller till ${job.expiresAt?.slice(0, 10) ?? "–"}.`;
    case "failed":
      return `Misslyckades: ${job.error ?? "okänt fel"}`;
    case "expired":
      return "Länken har gått ut och filen är borttagen.";
  }
}

/** A done job whose link still works. */
export function isDownloadable(job: Pick<ExportJob, "status" | "outputs" | "expiresAt">, now: Date = new Date()): boolean {
  return job.status === "done" && job.outputs.length > 0 && (!job.expiresAt || new Date(job.expiresAt) > now);
}
