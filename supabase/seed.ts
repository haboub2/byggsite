/**
 * One-time migration: data/content.json + data/gallery.json + uploads/*
 * → Supabase (content_blocks, services, projects, gallery_images, Storage).
 * Mirrors PLAN.md §5.5. Idempotent — safe to re-run (upserts on primary key).
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server-only,
 * bypasses RLS). Until a Supabase project exists, running this just prints
 * what it would have done and exits — nothing here needs a live project to write.
 *
 * Usage: npm run db:seed
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { site, heroBygg, trustPoints, processSteps, faq, featuredProjects, services as placeholderServices } from "../lib/placeholder";
import { iconPaths } from "../components/Icons";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type LegacyContent = {
  brand?: string;
  contact?: {
    person?: string;
    hours?: string;
    phone?: string;
    phoneDisplay?: string;
    email?: string;
    address?: string;
  };
};

type GalleryItem = { id: string; url: string; caption?: string };

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function main() {
  const legacyContent = readJson<LegacyContent>(
    path.join(ROOT, "data", "content.json"),
    {}
  );
  const gallery = readJson<GalleryItem[]>(
    path.join(ROOT, "data", "gallery.json"),
    []
  );

  const siteBlock = {
    company: {
      brand: "Byggly",
      wordmark: "Byggly 01",
      legalName: "Byggly 01",
      orgNr: null,
      foundedYear: 2026,
      fSkatt: null,
      insurance: null,
      id06: null,
      certs: [] as string[],
    },
    contact: {
      person: legacyContent.contact?.person ?? site.contact.person,
      hours: legacyContent.contact?.hours ?? site.contact.hours,
      phone: legacyContent.contact?.phone ?? site.contact.phone,
      phoneDisplay: legacyContent.contact?.phoneDisplay ?? site.contact.phoneDisplay,
      email: legacyContent.contact?.email ?? site.contact.email,
      address: legacyContent.contact?.address ?? site.contact.address,
      country: "SE",
    },
    areasServed: site.areasServed,
    social: { facebook: "", instagram: "", linkedin: "", gbp: "" },
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://byggly.se",
  };

  const byggBlock = {
    hero: heroBygg,
    trustPoints,
    process: processSteps,
    faq,
    featuredProjectSlugs: featuredProjects.map((p) => p.slug),
  };

  const serviceRows = placeholderServices.map((s, i) => ({
    slug: s.slug,
    division: "bygg",
    title: s.title,
    short_desc: s.desc,
    hero_lead: null,
    icon: iconPaths[s.slug] ?? null,
    price_from: null,
    duration: null,
    areas: site.areasServed,
    faq: [],
    sort: i,
    published: true,
  }));

  const projectRows = featuredProjects.map((p, i) => ({
    slug: p.slug,
    title: p.title,
    service_slug: null,
    location: "Halmstad",
    year: new Date().getFullYear(),
    summary: p.desc,
    scope: [],
    duration: null,
    testimonial: null,
    cover_path: null,
    before_path: null,
    after_path: null,
    gallery: [],
    featured: true,
    sort: i,
    published: true,
  }));

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.log(
      "No Supabase project configured yet (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset)."
    );
    console.log("Dry run — this is what `npm run db:seed` would write once a project exists:\n");
    console.log(`content_blocks: site, bygg`);
    console.log(`services: ${serviceRows.length} rows (${serviceRows.map((s) => s.slug).join(", ")})`);
    console.log(`projects: ${projectRows.length} rows (${projectRows.map((p) => p.slug).join(", ")})`);
    console.log(`gallery_images: ${gallery.length} rows from data/gallery.json`);
    console.log("\nSet the two env vars (see .env.example) and re-run to actually seed.");
    return;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  console.log("Seeding content_blocks…");
  const { error: siteErr } = await supabase
    .from("content_blocks")
    .upsert({ key: "site", data: siteBlock }, { onConflict: "key" });
  if (siteErr) throw siteErr;
  const { error: byggErr } = await supabase
    .from("content_blocks")
    .upsert({ key: "bygg", data: byggBlock }, { onConflict: "key" });
  if (byggErr) throw byggErr;

  console.log(`Seeding ${serviceRows.length} services…`);
  const { error: servicesErr } = await supabase
    .from("services")
    .upsert(serviceRows, { onConflict: "slug" });
  if (servicesErr) throw servicesErr;

  console.log(`Seeding ${projectRows.length} projects…`);
  const { error: projectsErr } = await supabase
    .from("projects")
    .upsert(projectRows, { onConflict: "slug" });
  if (projectsErr) throw projectsErr;

  console.log(`Uploading ${gallery.length} gallery images…`);
  for (const item of gallery) {
    const localPath = path.join(ROOT, item.url.replace(/^\//, ""));
    if (!fs.existsSync(localPath)) {
      console.warn(`  skip ${item.id}: ${localPath} not found`);
      continue;
    }
    const ext = path.extname(localPath) || ".jpg";
    const storagePath = `gallery/${item.id}${ext}`;
    const file = fs.readFileSync(localPath);
    const { error: uploadErr } = await supabase.storage
      .from("gallery")
      .upload(storagePath, file, { upsert: true });
    if (uploadErr) throw uploadErr;

    const { error: rowErr } = await supabase.from("gallery_images").upsert(
      {
        id: item.id,
        path: storagePath,
        alt: item.caption ?? null,
        division: "bygg",
        sort: 0,
      },
      { onConflict: "id" }
    );
    if (rowErr) throw rowErr;
  }

  console.log("\nDone. Verify in the Supabase dashboard, then remove data/*.json + uploads/* per PLAN.md §5.5.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
