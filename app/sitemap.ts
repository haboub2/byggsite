import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/env";
import { services } from "@/lib/placeholder";
import { softwareAreas, softwareCases } from "@/lib/software-content";
import { listPublishedProjects } from "@/lib/projects";
import { CONTENT_UPDATED } from "@/lib/seo";
import { guides } from "@/lib/guides";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const projects = await listPublishedProjects();
  // A fixed content date: a lastmod that changes on every build gets ignored.
  const updated = new Date(CONTENT_UPDATED);
  const entry = (
    path: string,
    priority: number,
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] = "monthly"
  ): MetadataRoute.Sitemap[number] => ({
    url: `${SITE_URL}${path}`,
    lastModified: updated,
    changeFrequency,
    priority,
  });

  return [
    entry("/", 1, "weekly"),
    entry("/bygg/tjanster", 0.9, "weekly"),
    ...services.map((s) => entry(`/bygg/tjanster/${s.slug}`, 0.9)),
    ...(projects.length
      ? [entry("/bygg/projekt", 0.7, "weekly"), ...projects.map((p) => entry(`/bygg/projekt/${p.slug}`, 0.7))]
      : []),
    entry("/bygg/offert", 0.8),
    entry("/mjukvara", 0.8, "monthly"),
    entry("/mjukvara/tjanster", 0.7),
    ...softwareAreas.map((a) => entry(`/mjukvara/tjanster/${a.slug}`, 0.7)),
    entry("/mjukvara/case", 0.5),
    ...softwareCases.map((c) => entry(`/mjukvara/case/${c.slug}`, 0.5)),
    entry("/mjukvara/brief", 0.6),
    entry("/guider", 0.7, "weekly"),
    ...guides.map((g) => ({ ...entry(`/guider/${g.slug}`, 0.8), lastModified: new Date(g.updated) })),
    entry("/om-oss", 0.5),
    entry("/kontakt", 0.6),
  ];
}
