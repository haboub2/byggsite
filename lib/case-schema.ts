import { z } from "zod";
import { projectImageSchema, slugify } from "./project-schema";

/** Software cases as edited in /admin. Shared by the editor (client) and the
 *  server action, so both validate the same way. */

export const CASE_AREAS = [
  { slug: "webb", title: "Webb" },
  { slug: "automation", title: "Automation" },
  { slug: "interna-system", title: "Interna system" },
  { slug: "plattformar", title: "Appar & plattformar" },
] as const;

export const CASE_STATUSES = [
  { slug: "live", title: "I drift" },
  { slug: "dev", title: "Under utveckling" },
] as const;

/** What was built, so the card and hero can say "app" or "webb" at a glance. */
export const CASE_PLATFORMS = [
  { slug: "web", title: "Webb" },
  { slug: "app", title: "App (iOS och Android)" },
  { slug: "both", title: "Webb och app" },
] as const;

const optionalUrl = (store: string) =>
  z
    .string()
    .trim()
    .max(300, "Länken: högst 300 tecken.")
    .refine((v) => v === "" || /^https:\/\/\S+\.\S+$/.test(v), `Länken till ${store} ska börja med https://.`);

const metric = z.object({
  value: z.string().trim().min(1, "Siffra krävs.").max(14, "Siffra: högst 14 tecken."),
  label: z.string().trim().min(1, "Text krävs.").max(60, "Text: högst 60 tecken."),
});

export const caseSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(2, "Adressen behöver minst två tecken.")
      .max(60, "Adressen: högst 60 tecken.")
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Adressen: bara a–z, 0–9 och bindestreck.")
      .refine((v) => v !== "ny", "Adressen ”ny” är reserverad. Välj en annan."),
    title: z.string().trim().min(2, "Titel krävs.").max(80, "Titel: högst 80 tecken."),
    client: z.string().trim().min(1, "Kund krävs.").max(80, "Kund: högst 80 tecken."),
    area: z.enum(["webb", "automation", "interna-system", "plattformar"]).nullable(),
    status: z.enum(["live", "dev"]),
    platform: z.enum(["web", "app", "both"]),
    country: z.string().trim().max(40, "Land: högst 40 tecken."),
    year: z.number().int().min(2000, "Året ser fel ut.").max(2100, "Året ser fel ut.").nullable(),
    url: z
      .string()
      .trim()
      .max(200, "Länken: högst 200 tecken.")
      .refine((v) => v === "" || /^https?:\/\/\S+\.\S+$/.test(v), "Länken ska börja med https://."),
    summary: z.string().trim().min(10, "Skriv en kort beskrivning.").max(300, "Beskrivning: högst 300 tecken."),
    situation: z.string().trim().max(1200, "Situation: högst 1200 tecken."),
    solution: z.string().trim().max(1600, "Lösning: högst 1600 tecken."),
    metrics: z.array(metric).max(4, "Högst fyra resultat."),
    features: z.array(z.string().trim().min(1).max(80, "Punkt: högst 80 tecken.")).max(10, "Högst tio punkter."),
    stack: z.array(z.string().trim().min(1).max(30)).max(12, "Högst 12 tekniker."),
    appStore: optionalUrl("App Store"),
    playStore: optionalUrl("Google Play"),
    testimonial: z
      .object({
        quote: z.string().trim().max(400, "Citat: högst 400 tecken."),
        author: z.string().trim().max(80, "Namn: högst 80 tecken."),
      })
      .nullable(),
    cover: projectImageSchema.nullable(),
    gallery: z.array(projectImageSchema).max(24, "Högst 24 bilder i galleriet."),
    featured: z.boolean(),
    published: z.boolean(),
    sort: z.number().int(),
  })
  .superRefine((c, ctx) => {
    if (c.published && c.solution.length < 40) {
      ctx.addIssue({ code: "custom", path: ["solution"], message: "Beskriv vad ni byggde innan caset publiceras." });
    }
    if (c.cover && !c.cover.alt) {
      ctx.addIssue({ code: "custom", path: ["cover", "alt"], message: "Beskriv bilden i en mening." });
    }
    c.gallery.forEach((g, i) => {
      if (!g.alt) ctx.addIssue({ code: "custom", path: ["gallery", i, "alt"], message: "Beskriv bilden i en mening." });
    });
    if (c.testimonial && c.testimonial.quote && !c.testimonial.author) {
      ctx.addIssue({ code: "custom", path: ["testimonial", "author"], message: "Vem sa det?" });
    }
  });

export type Case = z.infer<typeof caseSchema>;

export { slugify };

export function areaTitle(area: Case["area"]): string | null {
  return CASE_AREAS.find((a) => a.slug === area)?.title ?? null;
}

export function statusTitle(status: Case["status"]): string {
  return CASE_STATUSES.find((s) => s.slug === status)?.title ?? "";
}

export function emptyCase(sort = 0): Case {
  return {
    slug: "",
    title: "",
    client: "",
    area: null,
    status: "live",
    platform: "web",
    country: "",
    year: null,
    url: "",
    summary: "",
    situation: "",
    solution: "",
    metrics: [],
    features: [],
    stack: [],
    appStore: "",
    playStore: "",
    testimonial: null,
    cover: null,
    gallery: [],
    featured: true,
    published: false,
    sort,
  };
}
