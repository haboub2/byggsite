import "server-only";
import { cache } from "react";
import { createClient as createSessionClient } from "./supabase/server";
import { createPublicClient } from "./supabase/public";
import { isSupabaseConfigured } from "./supabase/config";
import { isDemo } from "./leads";
import { publicUrl } from "./storage";
import type { Project, ProjectImage } from "./project-schema";

/**
 * Projects: the `projects` table, edited from /admin. Public pages read with
 * the cookie-less anon client (RLS returns published rows only); the admin
 * reads and writes with its session. Demo mode keeps projects in memory.
 * There are no built-in projects: stock photos never stand in for our work.
 */

type Row = {
  slug: string;
  title: string;
  service_slug: string | null;
  location: string | null;
  year: number | null;
  duration: string | null;
  summary: string | null;
  scope: string[] | null;
  testimonial: { quote?: string; author?: string } | null;
  cover_path: string | null;
  cover_alt: string | null;
  before_path: string | null;
  before_alt: string | null;
  after_path: string | null;
  after_alt: string | null;
  gallery: { path: string; alt?: string }[] | null;
  featured: boolean | null;
  published: boolean | null;
  sort: number | null;
};

const img = (path: string | null, alt: string | null): ProjectImage | null => (path ? { path, alt: alt ?? "" } : null);

function fromRow(r: Row): Project {
  return {
    slug: r.slug,
    title: r.title,
    service: r.service_slug,
    location: r.location ?? "",
    year: r.year,
    duration: r.duration ?? "",
    summary: r.summary ?? "",
    scope: r.scope ?? [],
    testimonial: r.testimonial?.quote ? { quote: r.testimonial.quote, author: r.testimonial.author ?? "" } : null,
    cover: img(r.cover_path, r.cover_alt),
    before: img(r.before_path, r.before_alt),
    after: img(r.after_path, r.after_alt),
    gallery: (r.gallery ?? []).map((g) => ({ path: g.path, alt: g.alt ?? "" })),
    featured: Boolean(r.featured),
    published: Boolean(r.published),
    sort: r.sort ?? 0,
  };
}

function toRow(p: Project): Row {
  return {
    slug: p.slug,
    title: p.title,
    service_slug: p.service,
    location: p.location || null,
    year: p.year,
    duration: p.duration || null,
    summary: p.summary,
    scope: p.scope,
    testimonial: p.testimonial?.quote ? p.testimonial : null,
    cover_path: p.cover?.path ?? null,
    cover_alt: p.cover?.alt ?? null,
    before_path: p.before?.path ?? null,
    before_alt: p.before?.alt ?? null,
    after_path: p.after?.path ?? null,
    after_alt: p.after?.alt ?? null,
    gallery: p.gallery,
    featured: p.featured,
    published: p.published,
    sort: p.sort,
  };
}

/** Image with a ready-to-use URL. */
export type ResolvedImage = { url: string; alt: string };
export const resolve = (i: ProjectImage | null): ResolvedImage | null => {
  const url = publicUrl(i?.path);
  return i && url ? { url, alt: i.alt } : null;
};

const byOrder = (a: Project, b: Project) => a.sort - b.sort || a.title.localeCompare(b.title, "sv");

/* ---------- demo store ---------- */
const g = globalThis as unknown as { __binaafyProjects?: Project[] };
const demo = () => (g.__binaafyProjects ??= []);

/* ---------- public ---------- */

/** Published projects that have a cover photo, in admin order. */
export const listPublishedProjects = cache(async (): Promise<Project[]> => {
  if (isDemo()) return demo().filter((p) => p.published && p.cover).sort(byOrder);
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await createPublicClient()
      .from("projects")
      .select("*")
      .eq("published", true)
      .order("sort", { ascending: true });
    if (error) throw error;
    return (data as Row[]).map(fromRow).filter((p) => p.cover).sort(byOrder);
  } catch (err) {
    console.error("[projects] could not read projects:", err);
    return [];
  }
});

export async function getPublishedProject(slug: string): Promise<Project | null> {
  return (await listPublishedProjects()).find((p) => p.slug === slug) ?? null;
}

/** The projects section is only linked once there is a real project to show. */
export async function projectsReady(): Promise<boolean> {
  return (await listPublishedProjects()).length > 0;
}

/* ---------- admin ---------- */

export async function listAllProjects(): Promise<Project[]> {
  if (isDemo()) return [...demo()].sort(byOrder);
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("projects").select("*").order("sort", { ascending: true });
  if (error) throw new Error(`Kunde inte hämta projekt: ${error.message}`);
  return (data as Row[]).map(fromRow).sort(byOrder);
}

export async function getProjectForAdmin(slug: string): Promise<Project | null> {
  return (await listAllProjects()).find((p) => p.slug === slug) ?? null;
}

/** Create (originalSlug null) or update. Returns an error message for the form. */
export async function storeProject(p: Project, originalSlug: string | null): Promise<string | null> {
  const clash = originalSlug !== p.slug && (await listAllProjects()).some((x) => x.slug === p.slug);
  if (clash) return "Adressen används redan av ett annat projekt.";

  if (isDemo()) {
    const list = demo();
    const i = originalSlug ? list.findIndex((x) => x.slug === originalSlug) : -1;
    if (i >= 0) list[i] = p;
    else list.push(p);
    return null;
  }
  const supabase = await createSessionClient();
  const row = toRow(p);
  const { error } = originalSlug
    ? await supabase.from("projects").update(row).eq("slug", originalSlug)
    : await supabase.from("projects").insert(row);
  return error ? `Kunde inte spara: ${error.message}` : null;
}

export async function removeProject(slug: string): Promise<string | null> {
  if (isDemo()) {
    g.__binaafyProjects = demo().filter((p) => p.slug !== slug);
    return null;
  }
  const supabase = await createSessionClient();
  const { error } = await supabase.from("projects").delete().eq("slug", slug);
  return error ? `Kunde inte ta bort: ${error.message}` : null;
}
