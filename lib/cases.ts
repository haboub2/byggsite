import "server-only";
import { cache } from "react";
import { createClient as createSessionClient } from "./supabase/server";
import { createPublicClient } from "./supabase/public";
import { isSupabaseConfigured } from "./supabase/config";
import { isDemo } from "./leads";
import { resolve, type ResolvedImage } from "./projects";
import { softwareCases } from "./software-content";
import { areaTitle, type Case } from "./case-schema";
import { fromRow, toRow, type Row } from "./case-rows";
import { alenjazCases } from "./alenjaz-cases";

/**
 * Software cases: the `cases` table, edited from /admin (same pattern as
 * lib/projects.ts). Public pages also show the built-in cases from
 * lib/software-content.ts; a case saved in /admin with the same address
 * replaces the built-in one.
 */

const byOrder = (a: Case, b: Case) => a.sort - b.sort || a.title.localeCompare(b.title, "sv");

/* ---------- demo store ---------- */
// Local development without Supabase starts with the imported drafts, so the
// admin has real cases to edit and publish.
// Added once per process, also to a store that survived a hot reload.
const g = globalThis as unknown as { __binaafyCases?: Case[]; __binaafyCasesImported?: boolean };
const demo = () => {
  const list = (g.__binaafyCases ??= []);
  if (!g.__binaafyCasesImported) {
    g.__binaafyCasesImported = true;
    for (const c of alenjazCases) if (!list.some((x) => x.slug === c.slug)) list.push({ ...c });
  }
  return list;
};

/* ---------- public ---------- */

/** What the public pages render, for both saved and built-in cases. */
export type CaseView = {
  slug: string;
  title: string;
  client: string;
  /** Software service area slug, for linking cases from the service pages. */
  area: Case["area"];
  tag: string;
  status: Case["status"];
  platform: Case["platform"];
  country: string;
  year: number | null;
  summary: string;
  situation: string;
  solution: string;
  metrics: { value: string; label: string }[];
  features: string[];
  stack: string[];
  url: string;
  appStore: string;
  playStore: string;
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
    status: c.status,
    platform: c.platform,
    country: c.country,
    year: c.year,
    summary: c.summary,
    situation: c.situation,
    solution: c.solution,
    metrics: c.metrics,
    features: c.features,
    stack: c.stack,
    url: c.url,
    appStore: c.appStore,
    playStore: c.playStore,
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
  status: "live",
  platform: "web",
  country: "Sverige",
  year: null,
  summary: c.summary,
  situation: c.situation,
  solution: c.insats,
  metrics: c.resultat.map((r) => ({ value: r.label, label: r.desc })),
  features: [],
  stack: c.stack,
  url: "",
  appStore: "",
  playStore: "",
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
