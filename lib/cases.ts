import "server-only";
import { cache } from "react";
import { createClient as createSessionClient } from "./supabase/server";
import { createPublicClient } from "./supabase/public";
import { isSupabaseConfigured } from "./supabase/config";
import { isDemo } from "./leads";
import { resolve, type ResolvedImage } from "./projects";
import { softwareCases } from "./software-content";
import { areaTitle, type Case } from "./case-schema";
import type { ProjectImage } from "./project-schema";

/**
 * Software cases: the `cases` table, edited from /admin (same pattern as
 * lib/projects.ts). Public pages also show the built-in cases from
 * lib/software-content.ts; a case saved in /admin with the same address
 * replaces the built-in one.
 */

type Row = {
  slug: string;
  title: string;
  client: string | null;
  area: string | null;
  url: string | null;
  summary: string | null;
  situation: string | null;
  solution: string | null;
  metrics: { value?: string; label?: string }[] | null;
  stack: string[] | null;
  testimonial: { quote?: string; author?: string } | null;
  cover_path: string | null;
  cover_alt: string | null;
  gallery: { path: string; alt?: string }[] | null;
  featured: boolean | null;
  published: boolean | null;
  sort: number | null;
};

const AREAS = ["webb", "automation", "interna-system"] as const;
const img = (path: string | null, alt: string | null): ProjectImage | null => (path ? { path, alt: alt ?? "" } : null);

function fromRow(r: Row): Case {
  return {
    slug: r.slug,
    title: r.title,
    client: r.client ?? "",
    area: (AREAS as readonly string[]).includes(r.area ?? "") ? (r.area as Case["area"]) : null,
    url: r.url ?? "",
    summary: r.summary ?? "",
    situation: r.situation ?? "",
    solution: r.solution ?? "",
    metrics: (r.metrics ?? []).map((m) => ({ value: m.value ?? "", label: m.label ?? "" })),
    stack: r.stack ?? [],
    testimonial: r.testimonial?.quote ? { quote: r.testimonial.quote, author: r.testimonial.author ?? "" } : null,
    cover: img(r.cover_path, r.cover_alt),
    gallery: (r.gallery ?? []).map((g) => ({ path: g.path, alt: g.alt ?? "" })),
    featured: Boolean(r.featured),
    published: Boolean(r.published),
    sort: r.sort ?? 0,
  };
}

function toRow(c: Case): Row {
  return {
    slug: c.slug,
    title: c.title,
    client: c.client,
    area: c.area,
    url: c.url || null,
    summary: c.summary,
    situation: c.situation || null,
    solution: c.solution || null,
    metrics: c.metrics,
    stack: c.stack,
    testimonial: c.testimonial?.quote ? c.testimonial : null,
    cover_path: c.cover?.path ?? null,
    cover_alt: c.cover?.alt ?? null,
    gallery: c.gallery,
    featured: c.featured,
    published: c.published,
    sort: c.sort,
  };
}

const byOrder = (a: Case, b: Case) => a.sort - b.sort || a.title.localeCompare(b.title, "sv");

/* ---------- demo store ---------- */
const g = globalThis as unknown as { __binaafyCases?: Case[] };
const demo = () => (g.__binaafyCases ??= []);

/* ---------- public ---------- */

/** What the public pages render, for both saved and built-in cases. */
export type CaseView = {
  slug: string;
  title: string;
  client: string;
  /** Software service area slug, for linking cases from the service pages. */
  area: Case["area"];
  tag: string;
  summary: string;
  situation: string;
  solution: string;
  metrics: { value: string; label: string }[];
  stack: string[];
  url: string;
  featured: boolean;
  /** Image slot (built-in cases) or an uploaded cover. */
  image?: string;
  cover: ResolvedImage | null;
  gallery: ResolvedImage[];
  testimonial: { quote: string; author: string } | null;
};

function viewOf(c: Case): CaseView {
  return {
    slug: c.slug,
    title: c.title,
    client: c.client,
    area: c.area,
    tag: areaTitle(c.area) ?? "Software",
    summary: c.summary,
    situation: c.situation,
    solution: c.solution,
    metrics: c.metrics,
    stack: c.stack,
    url: c.url,
    featured: c.featured,
    cover: resolve(c.cover),
    gallery: c.gallery.map(resolve).filter((x): x is ResolvedImage => x !== null),
    testimonial: c.testimonial,
  };
}

const builtIn: CaseView[] = softwareCases.map((c) => ({
  slug: c.slug,
  title: c.title,
  client: c.client,
  area: "webb",
  tag: c.tag,
  summary: c.summary,
  situation: c.situation,
  solution: c.insats,
  metrics: c.resultat.map((r) => ({ value: r.label, label: r.desc })),
  stack: c.stack,
  url: "",
  featured: true,
  image: c.image,
  cover: null,
  gallery: [],
  testimonial: null,
}));

async function readPublished(): Promise<Case[]> {
  if (isDemo()) return demo().filter((c) => c.published);
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await createPublicClient()
      .from("cases")
      .select("*")
      .eq("published", true)
      .order("sort", { ascending: true });
    if (error) throw error;
    return (data as Row[]).map(fromRow);
  } catch (err) {
    console.error("[cases] could not read cases:", err);
    return [];
  }
}

/** Published cases in admin order, then the built-in ones not replaced by a saved case. */
export const listPublishedCases = cache(async (): Promise<CaseView[]> => {
  const saved = (await readPublished()).sort(byOrder).map(viewOf);
  const taken = new Set(saved.map((c) => c.slug));
  return [...saved, ...builtIn.filter((c) => !taken.has(c.slug))];
});

export async function getPublishedCase(slug: string): Promise<CaseView | null> {
  return (await listPublishedCases()).find((c) => c.slug === slug) ?? null;
}

/* ---------- admin ---------- */

export async function listAllCases(): Promise<Case[]> {
  if (isDemo()) return [...demo()].sort(byOrder);
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("cases").select("*").order("sort", { ascending: true });
  if (error) throw new Error(`Kunde inte hämta case: ${error.message}`);
  return (data as Row[]).map(fromRow).sort(byOrder);
}

export async function getCaseForAdmin(slug: string): Promise<Case | null> {
  return (await listAllCases()).find((c) => c.slug === slug) ?? null;
}

/** Create (originalSlug null) or update. Returns an error message for the form. */
export async function storeCase(c: Case, originalSlug: string | null): Promise<string | null> {
  const clash = originalSlug !== c.slug && (await listAllCases()).some((x) => x.slug === c.slug);
  if (clash) return "Adressen används redan av ett annat case.";

  if (isDemo()) {
    const list = demo();
    const i = originalSlug ? list.findIndex((x) => x.slug === originalSlug) : -1;
    if (i >= 0) list[i] = c;
    else list.push(c);
    return null;
  }
  const supabase = await createSessionClient();
  const row = toRow(c);
  const { error } = originalSlug
    ? await supabase.from("cases").update(row).eq("slug", originalSlug)
    : await supabase.from("cases").insert(row);
  return error ? `Kunde inte spara: ${error.message}` : null;
}

export async function removeCase(slug: string): Promise<string | null> {
  if (isDemo()) {
    g.__binaafyCases = demo().filter((c) => c.slug !== slug);
    return null;
  }
  const supabase = await createSessionClient();
  const { error } = await supabase.from("cases").delete().eq("slug", slug);
  return error ? `Kunde inte ta bort: ${error.message}` : null;
}

/** Built-in case addresses, so the admin can say which one a saved case replaces. */
export const BUILT_IN_CASE_SLUGS = softwareCases.map((c) => c.slug);
