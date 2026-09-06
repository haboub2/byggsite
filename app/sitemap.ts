import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/env";
import { services, featuredProjects } from "@/lib/placeholder";

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
    entry("/bygg", 0.95, "weekly"),
    entry("/tjanster", 0.9, "weekly"),
    ...services.map((s) => entry(`/tjanster/${s.slug}`, 0.9, "monthly")),
    entry("/projekt", 0.7, "weekly"),
    ...featuredProjects.map((p) => entry(`/projekt/${p.slug}`, 0.7)),
    entry("/om-oss", 0.5),
    entry("/offert", 0.8),
    entry("/kontakt", 0.6),
    entry("/integritetspolicy", 0.3, "yearly"),
    entry("/01", 0.7, "monthly"),
    entry("/01/tjanster", 0.6),
    entry("/01/case", 0.5),
    entry("/01/brief", 0.5),
  ];
}
