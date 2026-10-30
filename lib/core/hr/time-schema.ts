/**
 * The forms of Tid, Schema, Frånvaro and /min-tid (docs/hr-lon.md, section
 * 11), as zod schemas the server actions parse through. Pure. Clock times
 * are "HH:MM"; dates ISO.
 */

import { z } from "zod";
import { ABSENCE_EXTENTS, ABSENCE_KINDS } from "./absence";
import { TIME_KINDS, blockHours } from "./time";

const isoDate = (label: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label}: välj ett datum.`);
const optionalDate = (label: string) => z.union([z.literal(""), z.null(), isoDate(label)]).transform((v) => (v ? v : null));
const clock = (label: string) => z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${label}: skriv tiden som TT:MM.`);
const optionalClock = (label: string) => z.union([z.literal(""), z.null(), clock(label)]).transform((v) => (v ? v : null));
const minutes = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    const n = Number(String(v).trim() || "0");
    if (!Number.isInteger(n) || n < 0 || n > 600) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Rasten: hela minuter, 0–600." });
      return z.NEVER;
    }
    return n;
  });
const decimal = (label: string, min: number, max: number) =>
  z
    .union([z.string(), z.number(), z.null()])
    .transform((v, ctx) => {
      const s = v === null ? "" : String(v).trim().replace(",", ".");
      if (s === "") return null;
      const n = Number(s);
      if (!Number.isFinite(n) || n < min || n > max) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label}: ett tal mellan ${min} och ${max}.` });
        return z.NEVER;
      }
      return Math.round(n * 100) / 100;
    });
const uuidOrNull = z.union([z.literal(""), z.null(), z.string().uuid()]).transform((v) => (v ? v : null));

/** One time row: clock times (and a break) or hours. */
export const timeEntryInputSchema = z
  .object({
    date: isoDate("Datum"),
    start: optionalClock("Start"),
    end: optionalClock("Slut"),
    breakMinutes: minutes.default(0),
    hours: decimal("Timmar", 0.25, 24).default(""),
    kind: z.enum(TIME_KINDS).default("work"),
    projectId: uuidOrNull.default(""),
    note: z.string().trim().max(500, "Anteckningen: högst 500 tecken.").default(""),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if ((v.start === null) !== (v.end === null)) issue(v.start ? "end" : "start", "Ange både start och slut, eller bara timmar.");
    if (v.start && v.end && blockHours(v.start, v.end, v.breakMinutes) <= 0) issue("breakMinutes", "Rasten är längre än passet.");
    if (!v.start && v.hours === null) issue("hours", "Ange start och slut, eller antal timmar.");
  })
  .transform((v) => ({ ...v, hours: v.start && v.end ? blockHours(v.start, v.end, v.breakMinutes) : (v.hours as number) }));
export type TimeEntryInput = z.infer<typeof timeEntryInputSchema>;

export const absenceInputSchema = z
  .object({
    kind: z.enum(ABSENCE_KINDS),
    from: isoDate("Från"),
    to: optionalDate("Till").default(""),
    extent: z.union([z.number(), z.string()]).transform((v, ctx) => {
      const n = Number(v);
      if (!(ABSENCE_EXTENTS as readonly number[]).includes(n)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Omfattningen är hel dag, 75 %, halv dag eller 25 %." });
        return z.NEVER;
      }
      return n as (typeof ABSENCE_EXTENTS)[number];
    }).default(1),
    note: z.string().trim().max(500, "Anteckningen: högst 500 tecken.").default(""),
  })
  .superRefine((v, ctx) => {
    if (v.to === null && v.kind !== "sjuk") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "Ange sista dagen." });
    if (v.to && v.to < v.from) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "Sista dagen är före första." });
  });
export type AbsenceInput = z.infer<typeof absenceInputSchema>;

export const shiftOfferSchema = z
  .object({
    date: isoDate("Datum"),
    start: clock("Start"),
    end: clock("Slut"),
    breakMinutes: minutes.default(0),
    projectId: uuidOrNull.default(""),
    /** datetime-local, Swedish time; "" means no deadline. */
    expiresAt: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Svara senast: datum och tid.")]).default(""),
    note: z.string().trim().max(500).default(""),
    employeeIds: z.array(z.string().uuid()).default([]),
  })
  .superRefine((v, ctx) => {
    if (blockHours(v.start, v.end, v.breakMinutes) <= 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["breakMinutes"], message: "Rasten är längre än passet." });
  });
export type ShiftOfferInput = z.infer<typeof shiftOfferSchema>;

const scheduleDay = z.object({
  weekday: z.number().int().min(1).max(7),
  on: z.boolean().default(false),
  start: optionalClock("Start").default(""),
  end: optionalClock("Slut").default(""),
  breakMinutes: minutes.default(0),
});

export const scheduleInputSchema = z
  .object({
    employmentId: z.string().uuid(),
    validFrom: optionalDate("Gäller från").default(""),
    name: z.string().trim().max(80).default(""),
    days: z.array(scheduleDay).length(7),
  })
  .superRefine((v, ctx) => {
    v.days.forEach((d, i) => {
      if (!d.on) return;
      if (!d.start || !d.end) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["days", i, "start"], message: "Ange start och slut." });
      else if (blockHours(d.start, d.end, d.breakMinutes) <= 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["days", i, "breakMinutes"], message: "Rasten är längre än passet." });
    });
    if (!v.days.some((d) => d.on)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["days"], message: "Välj minst en arbetsdag." });
  })
  .transform((v) => ({
    employmentId: v.employmentId,
    validFrom: v.validFrom,
    name: v.name,
    rules: v.days.filter((d) => d.on).map((d) => ({ weekday: d.weekday, start: d.start as string, end: d.end as string, breakMinutes: d.breakMinutes })),
  }));
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;

export const lockInputSchema = z
  .object({ from: isoDate("Från"), to: isoDate("Till"), note: z.string().trim().max(200).default("") })
  .refine((v) => v.to >= v.from, { path: ["to"], message: "Perioden slutar före start." });
