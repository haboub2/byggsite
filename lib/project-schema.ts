import { z } from "zod";

/** Projects as edited in /admin. Shared by the editor (client) and the
 *  server action, so both validate the same way. */

export const projectImageSchema = z.object({
  path: z.string().min(1),
  alt: z.string().trim().max(160, "Bildtext: högst 160 tecken."),
});
export type ProjectImage = z.infer<typeof projectImageSchema>;

const year = new Date().getFullYear();

export const projectSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(2, "Adressen behöver minst två tecken.")
      .max(60, "Adressen: högst 60 tecken.")
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Adressen: bara a–z, 0–9 och bindestreck.")
      .refine((v) => v !== "ny", "Adressen ”ny” är reserverad. Välj en annan."),
    title: z.string().trim().min(2, "Titel krävs.").max(80, "Titel: högst 80 tecken."),
    service: z.string().nullable(),
    location: z.string().trim().max(60, "Ort: högst 60 tecken."),
    year: z.number().int().min(1990, "Kontrollera året.").max(year + 1, "Kontrollera året.").nullable(),
    duration: z.string().trim().max(40, "Tid: högst 40 tecken."),
    summary: z.string().trim().min(10, "Skriv en kort beskrivning.").max(300, "Beskrivning: högst 300 tecken."),
    scope: z.array(z.string().trim().min(1).max(60)).max(12, "Högst 12 punkter."),
    testimonial: z
      .object({
        quote: z.string().trim().max(400, "Citat: högst 400 tecken."),
        author: z.string().trim().max(80, "Namn: högst 80 tecken."),
      })
      .nullable(),
    cover: projectImageSchema.nullable(),
    before: projectImageSchema.nullable(),
    after: projectImageSchema.nullable(),
    gallery: z.array(projectImageSchema).max(24, "Högst 24 bilder i galleriet."),
    featured: z.boolean(),
    published: z.boolean(),
    sort: z.number().int(),
  })
  .superRefine((p, ctx) => {
    if (p.published && !p.cover) {
      ctx.addIssue({ code: "custom", path: ["cover"], message: "Lägg till en omslagsbild innan projektet publiceras." });
    }
    for (const key of ["cover", "before", "after"] as const) {
      if (p[key] && !p[key]!.alt) {
        ctx.addIssue({ code: "custom", path: [key, "alt"], message: "Beskriv bilden i en mening." });
      }
    }
    p.gallery.forEach((g, i) => {
      if (!g.alt) ctx.addIssue({ code: "custom", path: ["gallery", i, "alt"], message: "Beskriv bilden i en mening." });
    });
    if (p.testimonial && p.testimonial.quote && !p.testimonial.author) {
      ctx.addIssue({ code: "custom", path: ["testimonial", "author"], message: "Vem sa det?" });
    }
  });

export type Project = z.infer<typeof projectSchema>;

/** "Villa i Söndrum" → "villa-i-sondrum" */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/å|ä/g, "a")
    .replace(/ö/g, "o")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function emptyProject(sort = 0): Project {
  return {
    slug: "",
    title: "",
    service: null,
    location: "Halmstad",
    year: new Date().getFullYear(),
    duration: "",
    summary: "",
    scope: [],
    testimonial: null,
    cover: null,
    before: null,
    after: null,
    gallery: [],
    featured: true,
    published: false,
    sort,
  };
}
