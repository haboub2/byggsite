import { z } from "zod";
import { projectImageSchema, slugify } from "./project-schema";

/** Software cases as edited in /admin. Shared by the editor (client) and the
 *  server action, so both validate the same way. */

export const CASE_AREAS = [
  { slug: "webb", title: "Webb" },
  { slug: "automation", title: "Automation" },
  { slug: "interna-system", title: "Interna system" },
] as const;

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
    area: z.enum(["webb", "automation", "interna-system"]).nullable(),
    url: z
      .string()
      .trim()
      .max(200, "Länken: högst 200 tecken.")
      .refine((v) => v === "" || /^https?:\/\/\S+\.\S+$/.test(v), "Länken ska börja med https://."),
    summary: z.string().trim().min(10, "Skriv en kort beskrivning.").max(300, "Beskrivning: högst 300 tecken."),
    situation: z.string().trim().max(1200, "Situation: högst 1200 tecken."),
    solution: z.string().trim().max(1600, "Lösning: högst 1600 tecken."),
    metrics: z.array(metric).max(4, "Högst fyra resultat."),
    stack: z.array(z.string().trim().min(1).max(30)).max(12, "Högst 12 tekniker."),
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

export function emptyCase(sort = 0): Case {
  return {
    slug: "",
    title: "",
    client: "",
    area: null,
    url: "",
    summary: "",
    situation: "",
    solution: "",
    metrics: [],
    stack: [],
    testimonial: null,
    cover: null,
    gallery: [],
    featured: true,
    published: false,
    sort,
  };
}
