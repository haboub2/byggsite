import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/env";
import { services, featuredProjects } from "@/lib/placeholder";
import { softwareAreas, softwareCases } from "@/lib/software-content";
import { projectsReady } from "@/lib/projects";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entry = (
    path: string,
    priority: number,
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] = "monthly"
  ): MetadataRoute.Sitemap[number] => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  });

  return [
    entry("/", 1, "weekly"),
    entry("/bygg/tjanster", 0.9, "weekly"),
    ...services.map((s) => entry(`/bygg/tjanster/${s.slug}`, 0.9)),
    ...(projectsReady()
      ? [entry("/bygg/projekt", 0.7, "weekly"), ...featuredProjects.map((p) => entry(`/bygg/projekt/${p.slug}`, 0.6))]
      : []),
    entry("/bygg/offert", 0.8),
    entry("/mjukvara", 0.8, "monthly"),
    entry("/mjukvara/tjanster", 0.7),
    ...softwareAreas.map((a) => entry(`/mjukvara/tjanster/${a.slug}`, 0.7)),
    entry("/mjukvara/case", 0.5),
    ...softwareCases.map((c) => entry(`/mjukvara/case/${c.slug}`, 0.5)),
    entry("/mjukvara/brief", 0.6),
    entry("/om-oss", 0.5),
    entry("/kontakt", 0.6),
  ];
}
