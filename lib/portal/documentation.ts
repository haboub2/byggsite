import { isIsoDate, isWorkday, addDays, schedule, roundHalf, type WorkCalendar } from "../workdays";
import type { ChangeOrder, PortalProject, ProjectDocument, ProjectPhase, ProjectPhoto, ProjectUpdate, TimelineShift } from "./schema";

/**
 * Dokumentationssystemet (docs/kundportal-v3.md, 2): the project as a book.
 * One chapter per phase in the timeline, inside it one section per day
 * with content, inside that the day's notes and photos. Pure, so the admin
 * tree, the customer's "Per fas", the report PDF and the zip export all
 * read the same structure.
 */

type PhaseLike = Pick<ProjectPhase, "id" | "name" | "sort">;
type NoteLike = Pick<ProjectUpdate, "id" | "body" | "phase_id" | "day" | "created_at">;
type PhotoLike = Pick<ProjectPhoto, "id" | "phase_id" | "day" | "sort" | "in_report" | "created_at">;

export type DocDay<N extends NoteLike = NoteLike, F extends PhotoLike = PhotoLike> = { day: string; notes: N[]; photos: F[] };
export type DocChapter<P extends PhaseLike = PhaseLike, N extends NoteLike = NoteLike, F extends PhotoLike = PhotoLike> = {
  /** null: notes and photos without a phase (posted before the timeline, or the phase was removed). */
  phase: P | null;
  days: DocDay<N, F>[];
};

export type TreeOptions = {
  /** Leave out photos unticked from the report. */
  reportOnly?: boolean;
  /** Keep phases without content (the admin tree); otherwise only chapters with content. */
  withEmpty?: boolean;
};

/**
 * The tree phase → day → notes and photos. Chapters follow the timeline,
 * the phase-less chapter last; days run oldest first; notes in the order
 * they were posted; photos in the order they were taken (post, then place).
 * Notes without text are left out: they were only carriers for photos.
 */
export function documentationTree<P extends PhaseLike, N extends NoteLike, F extends PhotoLike>(
  phases: P[],
  notes: N[],
  photos: F[],
  options: TreeOptions = {}
): DocChapter<P, N, F>[] {
  const known = new Set(phases.map((p) => p.id));
  const key = (phaseId: string | null) => (phaseId && known.has(phaseId) ? phaseId : "");
  const days = new Map<string, Map<string, DocDay<N, F>>>();
  const dayOf = (phaseId: string | null, day: string) => {
    const k = key(phaseId);
    let chapter = days.get(k);
    if (!chapter) days.set(k, (chapter = new Map()));
    let d = chapter.get(day);
    if (!d) chapter.set(day, (d = { day, notes: [], photos: [] }));
    return d;
  };
  for (const n of notes) if (n.body.trim()) dayOf(n.phase_id, n.day).notes.push(n);
  for (const f of photos) if (!options.reportOnly || f.in_report) dayOf(f.phase_id, f.day).photos.push(f);

  const ordered = (k: string) =>
    [...(days.get(k)?.values() ?? [])]
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((d) => ({
        day: d.day,
        notes: d.notes.slice().sort((a, b) => a.created_at.localeCompare(b.created_at)),
        photos: d.photos.slice().sort((a, b) => a.created_at.localeCompare(b.created_at) || a.sort - b.sort),
      }));
  const chapters: DocChapter<P, N, F>[] = phases
    .slice()
    .sort((a, b) => a.sort - b.sort)
    .map((phase) => ({ phase, days: ordered(phase.id) }))
    .filter((c) => options.withEmpty || c.days.length > 0);
  const loose = ordered("");
  if (loose.length) chapters.push({ phase: null, days: loose });
  return chapters;
}

/** Photos in a chapter, all days. */
export const chapterPhotoCount = (c: DocChapter) => c.days.reduce((n, d) => n + d.photos.length, 0);

/* ---------- quality ---------- */

export type DocumentationHealth = {
  /** Days from the start up to today (or the end) on which work was due or photos were taken. */
  daysSoFar: number;
  /** Of those, the days with at least one photo. */
  daysWithPhotos: number;
  /** Phases that must be documented, have started and have no photo. */
  missing: { id: string; name: string }[];
};

/**
 * How well the documentation keeps up, for the admin overview: "foton 6 av
 * 8 dagar" and "Tätskikt saknar foton". A day counts when it is a working
 * day in the project's calendar or when photos were taken on it anyway.
 */
export function documentationHealth(
  project: Pick<PortalProject, "starts_on" | "ends_on" | "works_saturdays">,
  phases: Pick<ProjectPhase, "id" | "name" | "starts_on" | "done_at" | "photo_required">[],
  photos: Pick<ProjectPhoto, "phase_id" | "day">[],
  today: string
): DocumentationHealth {
  const cal: WorkCalendar = { saturdays: project.works_saturdays };
  const photoDays = new Set(photos.map((p) => p.day));
  let daysSoFar = 0;
  let daysWithPhotos = 0;
  if (isIsoDate(project.starts_on) && project.starts_on <= today) {
    const last = isIsoDate(project.ends_on) && project.ends_on < today ? project.ends_on : today;
    // Bounded: a project runs months, not decades; stop after ten years anyway.
    for (let d = project.starts_on, i = 0; d <= last && i < 3660; d = addDays(d, 1), i++) {
      const shot = photoDays.has(d);
      if (shot || isWorkday(d, cal)) daysSoFar++;
      if (shot) daysWithPhotos++;
    }
  }
  const withPhotos = new Set(photos.map((p) => p.phase_id).filter(Boolean));
  const missing = phases
    .filter((p) => p.photo_required && !withPhotos.has(p.id) && (p.done_at || (p.starts_on && p.starts_on <= today)))
    .map((p) => ({ id: p.id, name: p.name }));
  return { daysSoFar, daysWithPhotos, missing };
}

/** Why a phase can't be ticked done yet, or null when it can. */
export function cannotFinishReason(phase: Pick<ProjectPhase, "id" | "name" | "photo_required">, photos: Pick<ProjectPhoto, "phase_id">[]): string | null {
  if (!phase.photo_required || photos.some((p) => p.phase_id === phase.id)) return null;
  return `${phase.name} saknar foton. Ladda upp minst ett foto innan fasen bockas av; fotona före inklädnad är ert bevis vid ett garantiärende.`;
}

/** "Tätskikt saknar foton", "Tätskikt och El och VVS saknar foton". */
export function missingPhotosLine(missing: { name: string }[]): string {
  if (!missing.length) return "";
  const names = missing.map((m) => m.name);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} och ${names[names.length - 1]}`;
  return `${list} saknar foton`;
}

/* ---------- the report ---------- */

/**
 * Each phase's dates as first planned: the original phases (not the ones an
 * ÄTA added) at their planned durations, without delays, from the start.
 * The report shows them next to the dates the job actually got.
 */
export function plannedPhaseDates(
  project: Pick<PortalProject, "starts_on" | "works_saturdays">,
  phases: Pick<ProjectPhase, "id" | "sort" | "duration_days" | "change_order_id">[]
): Map<string, { starts_on: string; ends_on: string }> {
  const out = new Map<string, { starts_on: string; ends_on: string }>();
  if (!isIsoDate(project.starts_on)) return out;
  const original = phases
    .filter((p) => !p.change_order_id)
    .slice()
    .sort((a, b) => a.sort - b.sort);
  const { spans } = schedule(project.starts_on, original.map((p) => roundHalf(p.duration_days)), { saturdays: project.works_saturdays });
  original.forEach((p, i) => out.set(p.id, { starts_on: spans[i].starts_on, ends_on: spans[i].ends_on }));
  return out;
}

/** Everything the report shows, so a change to any of it renders a new one. */
export type ReportInput = {
  project: PortalProject;
  phases: ProjectPhase[];
  updates: ProjectUpdate[];
  photos: ProjectPhoto[];
  documents: ProjectDocument[];
  changeOrders: ChangeOrder[];
  shifts: TimelineShift[];
};

/** Bump when the report's layout changes, so every cached PDF is rendered again.
 *  2: the sender is the project's organisation, no longer always the site's. */
export const REPORT_VERSION = 2;

/**
 * A stable text of the report's content; its hash names the cached PDF. Only
 * what the PDF prints is included, so posting a photo to the diary renders a
 * new report but a project's updated_at alone does not.
 */
export function reportFingerprintSource(input: ReportInput): string {
  const { project: p } = input;
  return JSON.stringify([
    REPORT_VERSION,
    [p.id, p.org_id, p.title, p.address, p.customer_name, p.starts_on, p.ends_on, p.planned_ends_on, p.works_saturdays, p.final_summary, p.quote_id, p.archived_at],
    input.phases.map((x) => [x.id, x.name, x.sort, x.starts_on, x.ends_on, x.duration_days, x.change_order_id, x.done_at, x.summary]),
    input.updates.map((x) => [x.id, x.body, x.phase_id, x.day, x.created_at]),
    input.photos.map((x) => [x.id, x.path, x.phase_id, x.day, x.caption, x.in_report, x.sort]),
    input.documents.filter((d) => d.kind !== "report").map((x) => [x.id, x.kind, x.title, x.created_at]),
    input.changeOrders.map((x) => [x.id, x.number, x.title, x.amount, x.status, x.duration_days, x.answered_name, x.answered_at]),
    input.shifts.map((x) => [x.id, x.kind, x.phase_id, x.days, x.reason, x.created_at]),
  ]);
}

/* ---------- the zip export ---------- */

/** A name that is safe as a folder or file name on Windows, macOS and Linux. */
export function safeFileName(name: string, max = 60): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, max)
    .trim();
  return cleaned || "namnlös";
}

/**
 * Where every original photo goes in the zip: "02 Tätskikt/2026-10-20/03
 * Duschhörnan.jpg", numbered so the folders sort like the timeline and the
 * photos like the day. Photos without a phase go under "Utan fas".
 */
export function zipPhotoPaths<F extends PhotoLike & { path: string; caption: string }>(chapters: DocChapter<PhaseLike, NoteLike, F>[]): { photo: F; name: string }[] {
  const out: { photo: F; name: string }[] = [];
  const width = String(chapters.length).length < 2 ? 2 : String(chapters.length).length;
  chapters.forEach((c, ci) => {
    const folder = c.phase ? `${String(ci + 1).padStart(width, "0")} ${safeFileName(c.phase.name)}` : "Utan fas";
    for (const d of c.days) {
      d.photos.forEach((f, i) => {
        const ext = (/\.([a-z0-9]{2,4})$/i.exec(f.path)?.[1] ?? "jpg").toLowerCase();
        const caption = f.caption.trim() ? ` ${safeFileName(f.caption, 50)}` : "";
        out.push({ photo: f, name: `${folder}/${d.day}/${String(i + 1).padStart(2, "0")}${caption}.${ext}` });
      });
    }
  });
  return out;
}
