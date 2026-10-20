import "server-only";
import { createHash } from "node:crypto";
import { after } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { APPENDIX_PARTS, firstDayAnchor, firstRowAnchor, ReportPdf, type PageMap, type ReportChapter, type ReportData, type ReportPhoto } from "../pdf/ReportPdf";
import { compressReportPhoto } from "../pdf/photos";
import { getQuoteProfile } from "../quotes/profile-store";
import { createZip } from "../zip";
import { pool } from "../pool";
import { documentationTree, plannedPhaseDates, reportFingerprintSource, safeFileName, zipPhotoPaths } from "./documentation";
import { readPortalFile, removePortalFile, resolvePortalFile, writePortalFile } from "./files";
import { todayIso } from "./format";
import type { ProjectBundle, ProjectPhoto } from "./schema";
import { addDocument, getProjectBundle, removeDocument, setArchived, setReportHash } from "./store";

/**
 * Projektdokumentationen as a PDF (docs/kundportal-v3.md, 2).
 *
 * Rendering a report with a hundred photos takes a while, so it never has
 * to happen inside the request that downloads it: every change to the
 * content schedules a fresh render after the response (scheduleReportRefresh,
 * Next's after()), and the PDF is cached in the portal bucket under a name
 * with the fingerprint of the content it shows,
 * projects/{id}/rapport-{fingerprint}.pdf. portal_projects.report_hash names
 * the current one. A download whose fingerprint doesn't match (the
 * background render failed or hasn't finished) renders once and caches.
 * Having the fingerprint in the file name means two renders racing can
 * never leave an old PDF under a new name.
 *
 * "Lås dokumentationen" renders the final version, stores it as a document
 * of kind "report" and sets archived_at; from then on downloads give that
 * file, and the zip (PDF plus the original photos in folders per phase and
 * day) is built in the background.
 */

/** sha256 of what the report prints, 16 hex characters. */
export function reportHash(bundle: ProjectBundle): string {
  return createHash("sha256").update(reportFingerprintSource(bundle)).digest("hex").slice(0, 16);
}

const cacheKey = (projectId: string, hash: string) => `projects/${projectId}/rapport-${hash}.pdf`;
const zipKey = (projectId: string) => `projects/${projectId}/dokumentation.zip`;

/** "Projektdokumentation-Badrumsrenovering.pdf" (ASCII, safe in a header). */
export function reportFileName(bundle: ProjectBundle, ext: "pdf" | "zip" = "pdf"): string {
  const name = bundle.project.title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  return `Projektdokumentation${name ? `-${name}` : ""}.${ext}`;
}

/** The locked report, newest first, if the documentation is archived. */
const lockedDocument = (bundle: ProjectBundle) => (bundle.project.archived_at ? bundle.documents.find((d) => d.kind === "report") ?? null : null);

/* ---------- rendering ---------- */

/** Everything the PDF shows, with every photo read and shrunk. */
async function reportData(bundle: ProjectBundle, opts: { final: boolean; asOf: string }): Promise<ReportData> {
  const { project, phases, updates, photos, shifts, changeOrders, documents } = bundle;
  const tree = documentationTree(phases, updates, photos, { reportOnly: true, withEmpty: true });
  const planned = plannedPhaseDates(project, phases);
  const inReport = tree.flatMap((c) => c.days.flatMap((d) => d.photos));
  const last = inReport.slice().sort((a, b) => a.day.localeCompare(b.day) || a.created_at.localeCompare(b.created_at) || a.sort - b.sort).pop();

  // The sender is the project's organisation, read as the system: the report
  // is also rendered for portal customers and in the background.
  const [{ company, logo }, images, cover] = await Promise.all([
    getQuoteProfile(project.org_id),
    pool(inReport, 6, async (p: ProjectPhoto) => {
      const raw = await readPortalFile(p.path).catch(() => null);
      return [p.id, raw ? await compressReportPhoto(raw, p.caption.trim() ? "figure" : "grid") : null] as const;
    }),
    last ? readPortalFile(last.path).then((raw) => (raw ? compressReportPhoto(raw, "cover") : null)).catch(() => null) : Promise.resolve(null),
  ]);
  const imageOf = new Map(images);
  const photo = (p: ProjectPhoto): ReportPhoto => ({ id: p.id, caption: p.caption.trim(), image: imageOf.get(p.id) ?? null });

  let n = 0;
  const chapters: ReportChapter[] = tree.map((c) => ({
    key: c.phase ? `fas-${c.phase.id}` : "utan-fas",
    number: c.phase ? String(++n).padStart(2, "0") : "",
    title: c.phase ? c.phase.name : "Övrigt från bygget",
    phase: c.phase,
    planned: c.phase ? planned.get(c.phase.id) ?? null : null,
    delays: c.phase ? shifts.filter((s) => s.kind === "delay" && s.phase_id === c.phase!.id) : [],
    order: c.phase?.change_order_id ? changeOrders.find((o) => o.id === c.phase!.change_order_id) ?? null : null,
    days: c.days.map((d) => ({
      day: d.day,
      notes: d.notes.map((x) => x.body),
      figures: d.photos.filter((p) => p.caption.trim()).map(photo),
      grid: d.photos.filter((p) => !p.caption.trim()).map(photo),
    })),
  }));
  const phaseName = new Map(phases.map((p) => [p.id, p.name]));
  return {
    project,
    company,
    logo,
    final: opts.final,
    asOf: opts.asOf,
    cover,
    chapters,
    approvedOrders: changeOrders.filter((o) => o.status === "approved").sort((a, b) => a.number - b.number),
    documents: documents.filter((d) => d.kind !== "report").sort((a, b) => a.created_at.localeCompare(b.created_at)),
    shifts: shifts.map((s) => ({ ...s, phaseName: (s.phase_id && phaseName.get(s.phase_id)) || "" })),
    photoCount: inReport.length,
    dayCount: new Set(tree.flatMap((c) => c.days.map((d) => d.day))).size,
  };
}

/**
 * The report as PDF bytes, rendered until the layout settles (two passes,
 * rarely three or four): each pass reads where everything landed, so the
 * next can print the page numbers in the contents and start on a new page
 * any chapter whose head was left alone at the foot of a page. Chapters
 * only ever gain a page break, so the loop always settles.
 */
export async function renderReport(bundle: ProjectBundle, opts: { final: boolean; asOf?: string }): Promise<Buffer> {
  const data = await reportData(bundle, { final: opts.final, asOf: opts.asOf ?? todayIso() });
  let pages: PageMap = {};
  const breaks = new Set<string>();
  let pdf: Buffer = Buffer.alloc(0);
  for (let pass = 0; pass < 5; pass++) {
    let seen: PageMap = {};
    pdf = await renderToBuffer(<ReportPdf data={data} pages={pages} breakBefore={[...breaks]} onLayout={(p) => (seen = p)} />);
    const before = breaks.size;
    // A chapter head and its first day, an appendix label and its first row:
    // when they landed on different pages, start that part on a new page.
    const pairs: [string, string][] = [
      ...data.chapters.map((c): [string, string] => [c.key, firstDayAnchor(c.key)]),
      ...APPENDIX_PARTS.map((id): [string, string] => [id, firstRowAnchor(id)]),
    ];
    for (const [head, next] of pairs) {
      if (seen[head] !== undefined && seen[next] !== undefined && seen[next] > seen[head]) breaks.add(head);
    }
    const stable = breaks.size === before && JSON.stringify(seen) === JSON.stringify(pages);
    pages = seen;
    if (stable) break;
  }
  return pdf;
}

/* ---------- the cache ---------- */

/**
 * The key of the report a download should get: the locked one, or the
 * cached one for the content as it is now, rendered and stored first if
 * it is missing or stale. `serviceRole` when the caller is a customer.
 */
export async function currentReportKey(bundle: ProjectBundle, opts: { serviceRole?: boolean } = {}): Promise<string> {
  const locked = lockedDocument(bundle);
  if (locked) return locked.path;
  const hash = reportHash(bundle);
  const key = cacheKey(bundle.project.id, hash);
  if (bundle.project.report_hash === hash && (await resolvePortalFile(key))) return key;
  await storeReport(bundle, hash, opts);
  return key;
}

async function storeReport(bundle: ProjectBundle, hash: string, opts: { serviceRole?: boolean }): Promise<void> {
  const pdf = await renderReport(bundle, { final: false });
  const { id, report_hash: previous } = bundle.project;
  await writePortalFile(cacheKey(id, hash), pdf, opts);
  await setReportHash(id, hash, opts);
  if (previous && previous !== hash) await removePortalFile(cacheKey(id, previous), opts).catch(() => undefined);
}

/** Render the cached report again if the content changed. Never throws. */
export async function refreshReport(projectId: string, opts: { serviceRole?: boolean } = {}): Promise<void> {
  try {
    const bundle = await getProjectBundle(projectId);
    if (!bundle || bundle.project.archived_at) return;
    const hash = reportHash(bundle);
    if (bundle.project.report_hash === hash) return;
    await storeReport(bundle, hash, opts);
  } catch (err) {
    console.error(`[report] refresh of ${projectId} failed`, err);
  }
}

/** After the response: bring the cached report up to date. Call it from every action that changes the content. */
export function scheduleReportRefresh(projectId: string, opts: { serviceRole?: boolean } = {}): void {
  after(() => refreshReport(projectId, opts));
}

/* ---------- the archive ---------- */

/**
 * "Lås dokumentationen": the final report is rendered and kept as a
 * document of kind "report", then the documentation is locked. The zip is
 * built after the response.
 */
export async function lockDocumentation(projectId: string): Promise<void> {
  const bundle = await getProjectBundle(projectId);
  if (!bundle) throw new Error("Projektet finns inte.");
  if (bundle.project.archived_at) return;
  if (bundle.project.status === "active") throw new Error("Sätt projektet till Klart innan dokumentationen låses.");
  const at = new Date().toISOString();
  const final = { ...bundle, project: { ...bundle.project, archived_at: at } };
  const pdf = await renderReport(final, { final: true, asOf: todayIso(new Date(at)) });
  const key = `projects/${projectId}/projektdokumentation-${todayIso(new Date(at))}-${crypto.randomUUID().slice(0, 8)}.pdf`;
  await writePortalFile(key, pdf);
  await addDocument(projectId, { kind: "report", title: `Projektdokumentation — ${bundle.project.title}`.slice(0, 120), path: key });
  await setArchived(projectId, at);
  after(() => buildZip(projectId).catch((err) => console.error(`[report] zip of ${projectId} failed`, err)));
}

/** "Lås upp": editable again. The locked report and the zip go; locking again makes new ones. */
export async function unlockDocumentation(projectId: string): Promise<void> {
  const bundle = await getProjectBundle(projectId);
  if (!bundle?.project.archived_at) return;
  await setArchived(projectId, null);
  for (const d of bundle.documents.filter((x) => x.kind === "report")) {
    await removePortalFile(d.path).catch(() => undefined);
    await removeDocument(d.id);
  }
  await removePortalFile(zipKey(projectId)).catch(() => undefined);
  scheduleReportRefresh(projectId);
}

/** The locked PDF plus every original photo, "02 Tätskikt/2026-10-20/01 Duschhörnan.jpg". */
async function buildZip(projectId: string, opts: { serviceRole?: boolean } = {}): Promise<string> {
  const bundle = await getProjectBundle(projectId);
  const locked = bundle && lockedDocument(bundle);
  if (!bundle || !locked) throw new Error("Dokumentationen är inte låst.");
  const pdf = await readPortalFile(locked.path);
  if (!pdf) throw new Error("Den låsta rapporten saknas.");
  const tree = documentationTree(bundle.phases, bundle.updates, bundle.photos);
  const photos = await pool(zipPhotoPaths(tree), 6, async ({ photo, name }) => ({ name, data: await readPortalFile(photo.path).catch(() => null), date: new Date(photo.created_at) }));
  const zip = createZip([
    { name: `${safeFileName(`Projektdokumentation ${bundle.project.title}`, 80)}.pdf`, data: pdf, date: new Date(bundle.project.archived_at!) },
    ...photos.filter((p): p is { name: string; data: Buffer; date: Date } => p.data !== null),
  ]);
  const key = zipKey(projectId);
  await writePortalFile(key, zip, opts);
  return key;
}

/** The zip's key, built now if the background job hasn't made it yet. Only for a locked documentation. */
export async function currentZipKey(bundle: ProjectBundle, opts: { serviceRole?: boolean } = {}): Promise<string | null> {
  if (!lockedDocument(bundle)) return null;
  const key = zipKey(bundle.project.id);
  if (await resolvePortalFile(key)) return key;
  return buildZip(bundle.project.id, opts);
}

/* ---------- downloads ---------- */

/** A stored file as the response: a redirect to a signed URL, or the bytes in demo mode. */
export async function fileResponse(key: string, name: string, download: boolean): Promise<Response> {
  const file = await resolvePortalFile(key, download ? { downloadName: name } : {});
  if (!file) return new Response("Filen finns inte.", { status: 404 });
  if ("redirect" in file) return Response.redirect(file.redirect, 302);
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
