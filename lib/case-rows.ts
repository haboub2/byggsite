import { CASE_AREAS, type Case } from "./case-schema";
import type { ProjectImage } from "./project-schema";

/** The `cases` table row and its mapping to the editor's Case shape. Kept out
 *  of lib/cases.ts (server-only) so scripts like supabase/import-cases.ts can use it. */

export type Row = {
  slug: string;
  title: string;
  client: string | null;
  area: string | null;
  status: string | null;
  platform: string | null;
  country: string | null;
  year: number | null;
  url: string | null;
  summary: string | null;
  situation: string | null;
  solution: string | null;
  metrics: { value?: string; label?: string }[] | null;
  features: string[] | null;
  stack: string[] | null;
  app_store_url: string | null;
  play_store_url: string | null;
  testimonial: { quote?: string; author?: string } | null;
  cover_path: string | null;
  cover_alt: string | null;
  gallery: { path: string; alt?: string }[] | null;
  featured: boolean | null;
  published: boolean | null;
  sort: number | null;
};

const AREAS: readonly string[] = CASE_AREAS.map((a) => a.slug);
const img = (path: string | null, alt: string | null): ProjectImage | null => (path ? { path, alt: alt ?? "" } : null);

export function fromRow(r: Row): Case {
  return {
    slug: r.slug,
    title: r.title,
    client: r.client ?? "",
    area: AREAS.includes(r.area ?? "") ? (r.area as Case["area"]) : null,
    status: r.status === "dev" ? "dev" : "live",
    platform: r.platform === "app" || r.platform === "both" ? r.platform : "web",
    country: r.country ?? "",
    year: r.year ?? null,
    url: r.url ?? "",
    summary: r.summary ?? "",
    situation: r.situation ?? "",
    solution: r.solution ?? "",
    metrics: (r.metrics ?? []).map((m) => ({ value: m.value ?? "", label: m.label ?? "" })),
    features: r.features ?? [],
    stack: r.stack ?? [],
    appStore: r.app_store_url ?? "",
    playStore: r.play_store_url ?? "",
    testimonial: r.testimonial?.quote ? { quote: r.testimonial.quote, author: r.testimonial.author ?? "" } : null,
    cover: img(r.cover_path, r.cover_alt),
    gallery: (r.gallery ?? []).map((g) => ({ path: g.path, alt: g.alt ?? "" })),
    featured: Boolean(r.featured),
    published: Boolean(r.published),
    sort: r.sort ?? 0,
  };
}

export function toRow(c: Case): Row {
  return {
    slug: c.slug,
    title: c.title,
    client: c.client,
    area: c.area,
    status: c.status,
    platform: c.platform,
    country: c.country || null,
    year: c.year,
    url: c.url || null,
    summary: c.summary,
    situation: c.situation || null,
    solution: c.solution || null,
    metrics: c.metrics,
    features: c.features,
    stack: c.stack,
    app_store_url: c.appStore || null,
    play_store_url: c.playStore || null,
    testimonial: c.testimonial?.quote ? c.testimonial : null,
    cover_path: c.cover?.path ?? null,
    cover_alt: c.cover?.alt ?? null,
    gallery: c.gallery,
    featured: c.featured,
    published: c.published,
    sort: c.sort,
  };
}
