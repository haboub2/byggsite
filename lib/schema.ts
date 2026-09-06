import { z } from "zod";

const consent = z
  .string({ message: "Du måste godkänna villkoren." })
  .refine((v) => v === "on", { message: "Du måste godkänna villkoren." });

const base = {
  name: z.string().trim().min(1, "Namn krävs."),
  email: z.string().trim().email("Ange en giltig e-postadress."),
  phone: z.string().trim().optional().default(""),
  message: z.string().trim().min(1, "Meddelande krävs."),
  consent,
};

export const offertSchema = z.object({
  ...base,
  service: z.string().trim().min(1, "Välj en tjänst."),
  budget: z.string().trim().optional().default(""),
  timeline: z.string().trim().optional().default(""),
});

export const contactSchema = z.object({
  ...base,
  subject: z.string().trim().optional().default(""),
});

export const briefSchema = z.object({
  ...base,
  company: z.string().trim().optional().default(""),
  tooling: z.string().trim().optional().default(""),
  service: z.string().trim().min(1, "Välj en typ av projekt."),
  budget: z.string().trim().optional().default(""),
  timeline: z.string().trim().optional().default(""),
});

export type OffertInput = z.infer<typeof offertSchema>;
export type ContactInput = z.infer<typeof contactSchema>;
export type BriefInput = z.infer<typeof briefSchema>;
