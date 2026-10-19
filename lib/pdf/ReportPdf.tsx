import { Document, Font, Image, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { Company } from "../content/schema";
import type { ChangeOrder, PortalProject, ProjectDocument, ProjectPhase, TimelineShift } from "../portal/schema";
import { DOCUMENT_KIND_LABEL, formatKr } from "../portal/schema";
import { formatDays } from "../workdays";
import { LOGO_DATA_URI } from "./logo";
import { JAKARTA_BOLD, JAKARTA_ITALIC, JAKARTA_MEDIUM, JAKARTA_REGULAR } from "./fonts";
import type { PdfPhoto } from "./photos";

/**
 * Projektdokumentationen (docs/kundportal-v3.md, 2) as an A4 PDF in the
 * quote's look (lib/pdf/QuotePdf.tsx): Plus Jakarta Sans, anthracite ink,
 * one orange accent, cream panels. A photo cover, the table of contents,
 * one chapter per phase in the timeline (planned and actual dates, delays,
 * the team's summary, then each day with notes and photos), the final
 * summary and the appendices. No marketing: this is the job's record.
 *
 * The same react-pdf quirks as the quote apply: the running header sits in
 * the flow (images are left out of absolutely positioned fixed elements),
 * line height is set on Text only, and always together with a font size.
 */

Font.register({
  family: "Jakarta",
  fonts: [
    { src: JAKARTA_REGULAR, fontWeight: 400 },
    { src: JAKARTA_ITALIC, fontWeight: 400, fontStyle: "italic" },
    { src: JAKARTA_MEDIUM, fontWeight: 500 },
    { src: JAKARTA_BOLD, fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

const INK = "#1e2c37";
const INK2 = "#4b5763";
const INK3 = "#6b7680";
const ORANGE = "#f7802e";
const ORANGE_SOFT = "#fdebdd";
const LINE = "#e3e0d9";
const PAPER = "#f6f4ef";
const WHITE = "#ffffff";
const X = 46;
const CONTENT_W = 595.28 - 2 * X;
const GRID_GAP = 8;
const GRID_W = (CONTENT_W - 2 * GRID_GAP) / 3;
const NO_LIGATURES = { liga: false, clig: false };

const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 64, paddingHorizontal: X, fontFamily: "Jakarta", fontFeatureSettings: NO_LIGATURES, fontSize: 9.5, color: INK },
  p: { fontSize: 9.5, lineHeight: 1.55, color: INK2 },
  pMuted: { fontSize: 9, lineHeight: 1.5, color: INK3 },
  small: { fontSize: 8, lineHeight: 1.45, color: INK3 },
  label: { fontSize: 7, lineHeight: 1.3, letterSpacing: 1.4, textTransform: "uppercase", color: INK3 },

  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, paddingBottom: 9, borderBottomWidth: 0.6, borderBottomColor: LINE },
  headLogo: { width: 76, height: 24, objectFit: "contain", objectPosition: "left top" },
  headRight: { alignItems: "flex-end", paddingTop: 8 },
  headText: { fontSize: 8, color: INK3 },
  foot: { position: "absolute", bottom: 26, left: X, right: X, flexDirection: "row", justifyContent: "space-between", paddingTop: 8, borderTopWidth: 0.6, borderTopColor: LINE },
  footText: { fontSize: 7.5, lineHeight: 1.2, color: INK3 },

  section: { marginTop: 26 },
  h2Row: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  h2Dash: { width: 14, height: 2, backgroundColor: ORANGE, marginRight: 8 },
  h2: { fontSize: 13, lineHeight: 1.2, fontWeight: 700, letterSpacing: -0.2 },

  // Table of contents and overview
  eyebrow: { fontSize: 7.5, lineHeight: 1.2, letterSpacing: 1.8, color: ORANGE, fontWeight: 700, marginBottom: 6 },
  h1: { fontSize: 22, lineHeight: 1.15, fontWeight: 700, letterSpacing: -0.5 },
  facts: { flexDirection: "row", flexWrap: "wrap", marginTop: 14, paddingTop: 10, borderTopWidth: 0.6, borderTopColor: LINE },
  fact: { width: "25%", paddingRight: 8, marginBottom: 8 },
  factV: { fontSize: 9.5, lineHeight: 1.3, fontWeight: 500, marginTop: 3 },
  tocRow: { flexDirection: "row", alignItems: "baseline", paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: LINE, textDecoration: "none", color: INK },
  tocNo: { width: 26, fontSize: 9, lineHeight: 1.3, fontWeight: 700, color: ORANGE },
  tocName: { flex: 1, fontSize: 9.5, lineHeight: 1.3, fontWeight: 500 },
  tocMeta: { width: 150, fontSize: 8, lineHeight: 1.3, color: INK3, textAlign: "right", paddingRight: 10 },
  tocPage: { width: 24, fontSize: 9, lineHeight: 1.3, color: INK2, textAlign: "right" },
  notice: { marginTop: 14, padding: 10, backgroundColor: PAPER, borderRadius: 4 },

  // Chapters
  chapter: { marginTop: 30 },
  chapterNo: { fontSize: 7.5, lineHeight: 1.2, letterSpacing: 1.8, color: ORANGE, fontWeight: 700 },
  chapterTitle: { fontSize: 17, lineHeight: 1.2, fontWeight: 700, letterSpacing: -0.4, marginTop: 4 },
  ataTag: { fontSize: 8, lineHeight: 1.3, color: INK2, marginTop: 3 },
  dates: { flexDirection: "row", marginTop: 10, backgroundColor: PAPER, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 12 },
  datesCell: { flex: 1 },
  datesV: { fontSize: 9, lineHeight: 1.35, fontWeight: 500, marginTop: 2 },
  delay: { marginTop: 6, paddingVertical: 6, paddingHorizontal: 10, borderLeftWidth: 2, borderLeftColor: ORANGE, backgroundColor: ORANGE_SOFT },
  delayText: { fontSize: 8.5, lineHeight: 1.45, color: INK },
  summary: { marginTop: 12 },
  day: { marginTop: 16 },
  dayHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingBottom: 4, marginBottom: 6, borderBottomWidth: 0.6, borderBottomColor: LINE },
  dayTitle: { fontSize: 10, lineHeight: 1.3, fontWeight: 700 },
  dayMeta: { fontSize: 7.5, lineHeight: 1.3, color: INK3 },
  note: { fontSize: 9.5, lineHeight: 1.55, color: INK2, marginBottom: 6 },
  figure: { marginTop: 6, marginBottom: 8 },
  figureImg: { borderRadius: 3, objectFit: "contain", objectPosition: "left top" },
  caption: { fontSize: 8, lineHeight: 1.4, color: INK2, fontStyle: "italic", marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  gridCell: { width: GRID_W, height: GRID_W * 0.75, marginBottom: GRID_GAP, borderRadius: 3, objectFit: "cover", backgroundColor: PAPER },
  missing: { width: GRID_W, height: GRID_W * 0.75, marginBottom: GRID_GAP, borderRadius: 3, backgroundColor: PAPER, alignItems: "center", justifyContent: "center" },
  empty: { marginTop: 10, fontSize: 9, lineHeight: 1.45, color: INK3, fontStyle: "italic" },

  // Appendices
  th: { flexDirection: "row", paddingBottom: 5, borderBottomWidth: 0.8, borderBottomColor: INK },
  thText: { fontSize: 7, lineHeight: 1.2, letterSpacing: 1.2, textTransform: "uppercase", color: INK3 },
  tr: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: LINE, alignItems: "flex-start" },
  cell: { fontSize: 8.5, lineHeight: 1.4 },
  cellMuted: { fontSize: 7.5, lineHeight: 1.35, color: INK3, marginTop: 1 },
  total: { flexDirection: "row", justifyContent: "space-between", paddingTop: 8 },

  // Cover
  cover: { fontFamily: "Jakarta", fontFeatureSettings: NO_LIGATURES, color: INK, backgroundColor: WHITE },
  coverPhoto: { width: "100%", height: 470, objectFit: "cover" },
  coverBlock: { width: "100%", height: 470, backgroundColor: INK },
  coverBody: { paddingHorizontal: X, paddingTop: 34 },
  accent: { width: 36, height: 3, backgroundColor: ORANGE, marginBottom: 12 },
  coverLabel: { fontSize: 8, lineHeight: 1.2, letterSpacing: 2.4, color: INK3, marginBottom: 8 },
  coverTitle: { fontSize: 32, lineHeight: 1.12, fontWeight: 700, letterSpacing: -0.9, marginBottom: 10 },
  coverFor: { fontSize: 11, lineHeight: 1.45, color: INK2 },
  coverFacts: { flexDirection: "row", marginTop: 26, borderTopWidth: 0.6, borderTopColor: LINE, paddingTop: 12 },
  coverFact: { flex: 1 },
  coverFactV: { fontSize: 12.5, lineHeight: 1.2, fontWeight: 700, marginTop: 4 },
  coverState: { marginTop: 18, fontSize: 8.5, lineHeight: 1.45, color: INK3 },
  coverFoot: { position: "absolute", left: X, right: X, bottom: 34, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  coverLogo: { width: 104, height: 34, objectFit: "contain", objectPosition: "left bottom" },
  coverContact: { fontSize: 8, lineHeight: 1.5, color: INK3, textAlign: "right" },
});

/* ------------------------------------------------------------ data */

export type ReportImage = PdfPhoto & { width: number; height: number };
export type ReportPhoto = { id: string; caption: string; image: ReportImage | null };
export type ReportDay = { day: string; notes: string[]; figures: ReportPhoto[]; grid: ReportPhoto[] };
export type ReportChapter = {
  /** Anchor for the table of contents. */
  key: string;
  /** "01", or "" for the chapter of content without a phase. */
  number: string;
  title: string;
  phase: ProjectPhase | null;
  planned: { starts_on: string; ends_on: string } | null;
  delays: TimelineShift[];
  /** The ÄTA that added this phase. */
  order: ChangeOrder | null;
  days: ReportDay[];
};

export type ReportData = {
  project: PortalProject;
  company: Company;
  /** Locked: the final version handed to the customer. */
  final: boolean;
  /** "2026-10-19": the day the PDF shows as its date. */
  asOf: string;
  cover: PdfPhoto | null;
  chapters: ReportChapter[];
  approvedOrders: ChangeOrder[];
  documents: ProjectDocument[];
  shifts: (TimelineShift & { phaseName: string })[];
  photoCount: number;
  dayCount: number;
};

/** Page numbers of the chapters and sections (as the header counts, without the cover), from a first render. */
export type PageMap = Record<string, number>;

/* ------------------------------------------------------------ helpers */

const clean = (t: string) => t.replace(/(\d)[  ]+(%|kr\b|dagar?\b|m²)/g, "$1 $2");

const TZ = "Europe/Stockholm";
const day = (iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }) => {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, ...opts }).format(d);
};
const short = (iso: string | null | undefined) => day(iso, { day: "numeric", month: "short", year: "numeric" }).replace(/\./g, "");
const longDay = (iso: string) => {
  const t = day(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const span = (a: string | null | undefined, b: string | null | undefined) => (!a ? "–" : !b || a === b ? short(a) : `${short(a)} – ${short(b)}`);

function Paragraphs({ text, style }: { text: string; style: (typeof s)[keyof typeof s] }) {
  return (
    <>
      {clean(text)
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line, i) => (
          <Text key={i} style={style}>
            {line}
          </Text>
        ))}
    </>
  );
}

function Heading({ children, keep = 120 }: { children: string; keep?: number }) {
  return (
    <View style={s.h2Row} minPresenceAhead={keep}>
      <View style={s.h2Dash} />
      <Text style={s.h2}>{children}</Text>
    </View>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <View style={s.fact}>
      <Text style={s.label}>{k}</Text>
      <Text style={s.factV}>{clean(v)}</Text>
    </View>
  );
}

/* ------------------------------------------------------------ cover */

function CoverPage({ data }: { data: ReportData }) {
  const { project, company } = data;
  const address = [company.street, [company.postalCode, company.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const done = project.status !== "active";
  return (
    <Page size="A4" style={s.cover}>
      {data.cover ? (
        // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf images take no alt
        <Image src={data.cover} style={s.coverPhoto} />
      ) : (
        <View style={s.coverBlock} />
      )}
      <View style={s.coverBody}>
        <View style={s.accent} />
        <Text style={s.coverLabel}>PROJEKTDOKUMENTATION</Text>
        <Text style={s.coverTitle}>{clean(project.title)}</Text>
        {project.customer_name ? <Text style={s.coverFor}>För {clean(project.customer_name)}</Text> : null}
        {project.address ? <Text style={s.coverFor}>{clean(project.address)}</Text> : null}
        <View style={s.coverFacts}>
          <View style={s.coverFact}>
            <Text style={s.label}>Start</Text>
            <Text style={s.coverFactV}>{short(project.starts_on) || "–"}</Text>
          </View>
          <View style={s.coverFact}>
            <Text style={s.label}>{done ? "Klart" : "Beräknat klart"}</Text>
            <Text style={s.coverFactV}>{short(project.ends_on) || "–"}</Text>
          </View>
          <View style={s.coverFact}>
            <Text style={s.label}>Faser</Text>
            <Text style={s.coverFactV}>{data.chapters.filter((c) => c.phase).length}</Text>
          </View>
          <View style={s.coverFact}>
            <Text style={s.label}>Foton</Text>
            <Text style={s.coverFactV}>{data.photoCount}</Text>
          </View>
        </View>
        <Text style={s.coverState}>
          {data.final
            ? `Slutversion, låst ${day(project.archived_at ?? data.asOf)}.`
            : `Dokumentationen hittills, per ${day(data.asOf)}. Slutversionen lämnas när projektet är klart.`}
        </Text>
      </View>
      <View style={s.coverFoot}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf images take no alt */}
        <Image src={LOGO_DATA_URI} style={s.coverLogo} />
        <View>
          <Text style={s.coverContact}>{clean([company.legalName, address].filter(Boolean).join(" · "))}</Text>
          <Text style={s.coverContact}>{clean([company.phoneDisplay, company.email].filter(Boolean).join(" · "))}</Text>
        </View>
      </View>
    </Page>
  );
}

/* ------------------------------------------------------------ contents */

function Contents({ data, pages }: { data: ReportData; pages: PageMap }) {
  const { project } = data;
  const moved = project.planned_ends_on && project.ends_on && project.planned_ends_on !== project.ends_on;
  const shiftDays = data.shifts.reduce((n, x) => n + x.days, 0);
  const rows: { key: string; no: string; name: string; meta: string }[] = [
    ...data.chapters.map((c) => ({
      key: c.key,
      no: c.number,
      name: c.title,
      meta: c.phase ? `${span(c.phase.starts_on, c.phase.ends_on)}` : `${c.days.length} ${c.days.length === 1 ? "dag" : "dagar"}`,
    })),
    { key: "slut", no: "", name: "Slutdokumentation", meta: "" },
    { key: "bilagor", no: "", name: "Bilagor", meta: "ÄTA, dokument, förskjutningar" },
  ];
  return (
    <View>
      <Text style={s.eyebrow}>PROJEKTDOKUMENTATION</Text>
      <Text style={s.h1}>{clean(project.title)}</Text>
      <View style={s.facts}>
        <Fact k="Kund" v={project.customer_name || "–"} />
        <Fact k="Adress" v={project.address || "–"} />
        <Fact k="Start" v={short(project.starts_on) || "–"} />
        <Fact k={project.status === "active" ? "Beräknat klart" : "Klart"} v={short(project.ends_on) || "–"} />
        <Fact k="Ursprungligt slut" v={short(project.planned_ends_on) || "–"} />
        <Fact k="Förskjutningar" v={data.shifts.length ? `${data.shifts.length} st, ${formatDays(shiftDays)}` : "Inga"} />
        <Fact k="Dagar med innehåll" v={String(data.dayCount)} />
        <Fact k="Foton i rapporten" v={String(data.photoCount)} />
      </View>
      {moved ? (
        <Text style={[s.small, { marginTop: 2 }]}>
          Slutdatumet flyttades från {short(project.planned_ends_on)} till {short(project.ends_on)}. Varje förskjutning och orsaken står i bilaga C.
        </Text>
      ) : null}

      <View style={s.section}>
        <Heading keep={160}>Innehåll</Heading>
        {rows.map((r) => (
          <Link key={r.key} src={`#${r.key}`} style={s.tocRow}>
            <Text style={s.tocNo}>{r.no}</Text>
            <Text style={s.tocName}>{clean(r.name)}</Text>
            <Text style={s.tocMeta}>{r.meta}</Text>
            <Text style={s.tocPage}>{pages[r.key] ? String(pages[r.key]) : ""}</Text>
          </Link>
        ))}
      </View>
      {!data.final ? (
        <View style={s.notice}>
          <Text style={s.pMuted}>
            Det här är dokumentationen så långt bygget har kommit. Den fylls på med foton och anteckningar varje arbetsdag och lämnas i en låst slutversion när projektet
            är klart.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------ chapters */

/** `grouped`: already inside an unbreakable block, so not one itself (react-pdf squeezes nested ones). */
function Photo({ photo, figure, grouped = false }: { photo: ReportPhoto; figure: boolean; grouped?: boolean }) {
  if (!photo.image) {
    return (
      <View style={s.missing}>
        <Text style={s.small}>Fotot kunde inte läsas</Text>
      </View>
    );
  }
  if (!figure) {
    // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf images take no alt
    return <Image src={photo.image} style={s.gridCell} />;
  }
  // A captioned photo is a figure: as wide as the page allows, at most 300 pt high.
  const ratio = photo.image.width / Math.max(1, photo.image.height);
  const height = Math.min(300, CONTENT_W / ratio);
  return (
    <View style={s.figure} wrap={grouped ? undefined : false}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf images take no alt */}
      <Image src={photo.image} style={[s.figureImg, { width: height * ratio, height }]} />
      <Text style={s.caption}>{clean(photo.caption)}</Text>
    </View>
  );
}

function GridRow({ row, grouped = false }: { row: ReportPhoto[]; grouped?: boolean }) {
  return (
    <View style={s.grid} wrap={grouped ? undefined : false}>
      {row.map((f, j) => (
        <View key={f.id} style={{ marginRight: j < 2 ? GRID_GAP : 0 }}>
          <Photo photo={f} figure={false} />
        </View>
      ))}
    </View>
  );
}

/** Notes this short travel with the day's heading and first photo onto one page. */
const SHORT_NOTES = 700;

/** `anchor`: an id on the day's opening block, so the layout tells where it landed. */
function Day({ d, anchor }: { d: ReportDay; anchor?: string }) {
  const count = d.figures.length + d.grid.length;
  const rows: ReportPhoto[][] = [];
  for (let i = 0; i < d.grid.length; i += 3) rows.push(d.grid.slice(i, i + 3));
  const short = d.notes.join("").length <= SHORT_NOTES;
  // The first photo sits in the day's unbreakable opening when the notes are short.
  const photoItems = [
    ...d.figures.map((f, i) => <Photo key={f.id} photo={f} figure grouped={short && i === 0} />),
    ...rows.map((row, i) => <GridRow key={row[0].id} row={row} grouped={short && i === 0 && d.figures.length === 0} />),
  ];
  const head = (
    <View style={s.dayHead}>
      <Text style={s.dayTitle}>{longDay(d.day)}</Text>
      <Text style={s.dayMeta}>{count ? `${count} ${count === 1 ? "foto" : "foton"}` : ""}</Text>
    </View>
  );
  const notes = d.notes.map((n, i) => <Paragraphs key={i} text={n} style={s.note} />);
  // The heading never ends a page alone: with short notes it is kept with
  // them and the first photo; long notes may break, so the heading only
  // asks for room for a few lines.
  return (
    <View style={s.day}>
      {short ? (
        <View wrap={false} id={anchor}>
          {head}
          {notes}
          {photoItems[0]}
        </View>
      ) : (
        <>
          <View minPresenceAhead={60} id={anchor}>
            {head}
          </View>
          {notes}
          {photoItems[0]}
        </>
      )}
      {photoItems.slice(1)}
    </View>
  );
}

/** The id of a chapter's first day block, next to the chapter's own id (its key). */
export const firstDayAnchor = (key: string) => `${key}-dag`;

function Chapter({ c, breakBefore }: { c: ReportChapter; breakBefore: boolean }) {
  const p = c.phase;
  const actualEnd = p?.done_at ? p.done_at.slice(0, 10) : p?.ends_on;
  const state = !p ? "" : p.done_at ? `Klar ${short(p.done_at)}` : "Pågår eller kommer";
  const label = c.number ? `KAPITEL ${c.number}` : "UTAN FAS";
  return (
    <View style={s.chapter} id={c.key} break={breakBefore}>
      {/* The head stays in one piece and only starts where the first day's opening fits after it. */}
      <View wrap={false}>
        <Text style={s.chapterNo}>{label}</Text>
        <Text style={s.chapterTitle}>{clean(c.title)}</Text>
        {c.order ? (
          <Text style={s.ataTag}>
            Tillkom genom ÄTA {c.order.number}, godkänd {c.order.answered_name ? `av ${clean(c.order.answered_name)} ` : ""}
            {short(c.order.answered_at)}.
          </Text>
        ) : null}
        {p ? (
          <View style={s.dates}>
            <View style={s.datesCell}>
              <Text style={s.label}>Planerat</Text>
              <Text style={s.datesV}>{c.planned ? span(c.planned.starts_on, c.planned.ends_on) : c.order ? "Ingick inte i planen" : "–"}</Text>
            </View>
            <View style={s.datesCell}>
              <Text style={s.label}>{p.done_at ? "Utfört" : "Beräknat"}</Text>
              <Text style={s.datesV}>{span(p.starts_on, actualEnd)}</Text>
            </View>
            <View style={s.datesCell}>
              <Text style={s.label}>Längd</Text>
              <Text style={s.datesV}>{formatDays(p.duration_days + c.delays.reduce((n, x) => n + x.days, 0))}</Text>
            </View>
            <View style={s.datesCell}>
              <Text style={s.label}>Status</Text>
              <Text style={s.datesV}>{state}</Text>
            </View>
          </View>
        ) : null}
      </View>
      {c.delays.map((x) => (
        <View key={x.id} style={s.delay} wrap={false}>
          <Text style={s.delayText}>
            Försening {formatDays(x.days)}, rapporterad {short(x.created_at)}: {clean(x.reason)}
          </Text>
        </View>
      ))}
      {p?.summary.trim() ? (
        <View style={s.summary}>
          <Paragraphs text={p.summary} style={s.p} />
        </View>
      ) : null}
      {c.days.length === 0 ? <Text style={s.empty}>{p?.done_at || !p ? "Inga anteckningar eller foton för den här fasen." : "Inga anteckningar eller foton än."}</Text> : null}
      {c.days.map((d, i) => (
        <Day key={d.day} d={d} anchor={i === 0 ? firstDayAnchor(c.key) : undefined} />
      ))}
    </View>
  );
}

/* ------------------------------------------------------------ appendices */

/** The id of the first row after a label or heading with id `id`: the pair the renderer keeps on one page. */
export const firstRowAnchor = (id: string) => `${id}-rad`;

/**
 * One appendix list. Each row is unbreakable; the label is kept with the
 * first row by the renderer (lib/portal/report.tsx), which starts the part
 * on a new page when the layout shows the label left alone. (An unbreakable
 * label-plus-row block is squeezed by react-pdf at a page end instead.)
 */
function Part({
  id,
  label,
  lead,
  rows,
  after,
  empty,
  first = false,
  breakBefore,
}: {
  id: string;
  label: string;
  lead?: ReactNode;
  rows: ReactNode[];
  after?: ReactNode;
  empty: string;
  first?: boolean;
  breakBefore: string[];
}) {
  return (
    <View id={id} break={breakBefore.includes(id)}>
      {lead}
      <Text style={[s.label, { marginTop: first ? 4 : 22, marginBottom: 6 }]}>{label}</Text>
      {rows.length ? (
        rows.map((row, i) => (
          <View key={i} wrap={false} id={i === 0 ? firstRowAnchor(id) : undefined}>
            {row}
          </View>
        ))
      ) : (
        <Text style={s.pMuted} id={firstRowAnchor(id)}>
          {empty}
        </Text>
      )}
      {rows.length ? after : null}
    </View>
  );
}

/** Label and first row pairs the renderer keeps on one page. */
export const APPENDIX_PARTS = ["bilaga-a", "bilaga-b", "bilaga-c"];

function Appendices({ data, breakBefore }: { data: ReportData; breakBefore: string[] }) {
  const total = data.approvedOrders.reduce((n, o) => n + o.amount, 0);
  const orderHead = (
    <View style={s.th}>
      <Text style={[s.thText, { width: 44 }]}>Nr</Text>
      <Text style={[s.thText, { flex: 1 }]}>Arbete</Text>
      <Text style={[s.thText, { width: 64, textAlign: "right" }]}>Tid</Text>
      <Text style={[s.thText, { width: 130, paddingLeft: 10 }]}>Godkänd</Text>
      <Text style={[s.thText, { width: 70, textAlign: "right" }]}>Pris</Text>
    </View>
  );
  const orders = data.approvedOrders.map((o, i) => (
    <View key={o.id}>
      {i === 0 ? orderHead : null}
      <View style={s.tr}>
        <Text style={[s.cell, { width: 44 }]}>ÄTA {o.number}</Text>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={s.cell}>{clean(o.title)}</Text>
          {o.description ? <Text style={s.cellMuted}>{clean(o.description)}</Text> : null}
        </View>
        <Text style={[s.cell, { width: 64, textAlign: "right" }]}>{o.duration_days > 0 ? `+${formatDays(o.duration_days)}` : "Ingen"}</Text>
        <Text style={[s.cell, { width: 130, paddingLeft: 10 }]}>{clean([o.answered_name ?? "", short(o.answered_at)].filter(Boolean).join(", "))}</Text>
        <Text style={[s.cell, { width: 70, textAlign: "right" }]}>{clean(formatKr(o.amount))}</Text>
      </View>
    </View>
  ));
  const documents = data.documents.map((d) => (
    <View key={d.id} style={s.tr}>
      <Text style={[s.cell, { width: 110, color: INK3 }]}>{DOCUMENT_KIND_LABEL[d.kind]}</Text>
      <Text style={[s.cell, { flex: 1 }]}>{clean(d.title)}</Text>
      <Text style={[s.cell, { width: 80, textAlign: "right", color: INK3 }]}>{short(d.created_at)}</Text>
    </View>
  ));
  const shifts = data.shifts.map((x) => (
    <View key={x.id} style={s.tr}>
      <Text style={[s.cell, { width: 80, color: INK3 }]}>{short(x.created_at)}</Text>
      <Text style={[s.cell, { width: 60, fontWeight: 700 }]}>+{formatDays(x.days)}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.cell}>{clean(x.reason || (x.kind === "delay" ? "Försening" : "ÄTA"))}</Text>
        <Text style={s.cellMuted}>
          {x.kind === "delay" ? "Försening" : "Godkänd ÄTA"}
          {x.phaseName ? ` · ${clean(x.phaseName)}` : ""}
        </Text>
      </View>
    </View>
  ));
  return (
    <View style={s.section} id="bilagor">
      <Part
        id="bilaga-a"
        breakBefore={breakBefore}
        first
        lead={<Heading>Bilagor</Heading>}
        label="A. Godkända ÄTA"
        rows={orders}
        empty="Inga ändrings- eller tilläggsarbeten."
        after={
          <View style={s.total} wrap={false}>
            <Text style={[s.cell, { fontWeight: 700 }]}>Summa godkända ÄTA, inkl. moms</Text>
            <Text style={[s.cell, { fontWeight: 700 }]}>{clean(formatKr(total))}</Text>
          </View>
        }
      />
      <Part
        id="bilaga-b"
        breakBefore={breakBefore}
        label="B. Dokument"
        rows={documents}
        empty="Inga dokument."
        after={<Text style={[s.small, { marginTop: 6 }]}>Dokumenten finns att ladda ner under Dokument i kundportalen.</Text>}
      />
      <Part
        id="bilaga-c"
        breakBefore={breakBefore}
        label="C. Förskjutningar av slutdatumet"
        rows={shifts}
        empty="Slutdatumet har inte flyttats."
        after={
          <Text style={[s.small, { marginTop: 6 }]}>
            Ursprungligt slut {short(data.project.planned_ends_on) || "–"}, {data.project.status === "active" ? "beräknat slut" : "klart"} {short(data.project.ends_on) || "–"}.
          </Text>
        }
      />
    </View>
  );
}

/* ------------------------------------------------------------ document */

/**
 * Where each anchor (a View with an id) landed, from the layout react-pdf
 * hands Document's onRender. That layout is internal to react-pdf: if it
 * ever changes shape the map comes back empty and the contents simply have
 * no page numbers. (Text `render` callbacks would give the page too, but
 * in flowing content they break the layout in react-pdf 4.)
 */
type LayoutNode = { props?: { id?: unknown }; children?: LayoutNode[] };
export function pageMapFromLayout(layout: unknown): PageMap {
  const pages: PageMap = {};
  const docPages = (layout as LayoutNode | undefined)?.children;
  if (!Array.isArray(docPages)) return pages;
  const walk = (node: LayoutNode, page: number) => {
    const id = node.props?.id;
    if (typeof id === "string" && !(id in pages)) pages[id] = page;
    if (Array.isArray(node.children)) for (const child of node.children) walk(child, page);
  };
  // Page 0 is the cover, which the header doesn't count.
  docPages.forEach((page, i) => walk(page, i));
  return pages;
}

/**
 * `breakBefore`: chapters that start on a new page. A chapter's head and
 * its first day's opening (an unbreakable block) can't be tied together in
 * react-pdf without it squeezing content, so the renderer looks at where
 * they landed and, if the head was left alone at the foot of a page, starts
 * that chapter on a new page in the next pass (lib/portal/report.tsx).
 */
export function ReportPdf({
  data,
  pages = {},
  breakBefore = [],
  onLayout,
}: {
  data: ReportData;
  pages?: PageMap;
  breakBefore?: string[];
  onLayout?: (pages: PageMap) => void;
}) {
  const { project, company } = data;
  const footLine = [company.legalName, company.orgNr ? `Org.nr ${company.orgNr}` : "", company.phoneDisplay, company.email].filter(Boolean).join("  ·  ");
  return (
    <Document
      title={`Projektdokumentation – ${project.title}`}
      author={company.legalName}
      subject={project.address}
      language="sv-SE"
      onRender={onLayout ? (r: object) => onLayout(pageMapFromLayout((r as { _INTERNAL__LAYOUT__DATA_?: unknown })._INTERNAL__LAYOUT__DATA_)) : undefined}
    >
      <CoverPage data={data} />
      <Page size="A4" style={s.page}>
        <View style={s.head} fixed>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf images take no alt */}
          <Image src={LOGO_DATA_URI} style={s.headLogo} />
          <View style={s.headRight}>
            {/* The cover is not counted. */}
            <Text style={s.headText} render={({ pageNumber, totalPages }) => `Projektdokumentation  ·  Sida ${pageNumber - 1} av ${totalPages - 1}`} />
          </View>
        </View>
        <View style={s.foot} fixed>
          <Text style={s.footText}>{clean(footLine)}</Text>
          <Text style={s.footText}>{clean(project.title)}</Text>
        </View>

        <Contents data={data} pages={pages} />
        {data.chapters.map((c) => (
          <Chapter key={c.key} c={c} breakBefore={breakBefore.includes(c.key)} />
        ))}

        <View style={s.section} id="slut">
          <Heading keep={100}>
            Slutdokumentation
          </Heading>
          {project.final_summary.trim() ? (
            <Paragraphs text={project.final_summary} style={[s.p, { marginBottom: 6 }] as unknown as (typeof s)["p"]} />
          ) : (
            <Text style={s.empty}>{data.final ? "Ingen slutdokumentation skrevs." : "Skrivs när projektet är klart."}</Text>
          )}
        </View>

        <Appendices data={data} breakBefore={breakBefore} />
      </Page>
    </Document>
  );
}
