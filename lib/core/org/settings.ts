import { z } from "zod";
import { ORG_NR, VAT_NR, CUSTOMER_TYPES, type CustomerType, type Seller } from "../documents/invoice";
import { DEFAULT_CHART, DEFAULT_ACCOUNT_NAMES, type ChartOfAccounts } from "../ledger/posting";
import { DEFAULT_REMINDER_SETTINGS, type ReminderSettings } from "../reminders/reminders";

/**
 * What an organisation configures (org_settings.data, 0014). The jsonb
 * column is free-form in the database; this schema is its shape. Every field
 * has a default so an old or partial row always parses, and a new field
 * never needs a migration.
 *
 * Number series are not here: they live in number_series and are read from
 * there. The resolver below falls back to the website's content blocks
 * (Företaget, Offertuppgifter) and the environment for the first
 * organisation while its org_settings row is still empty, so nothing
 * changes for Binaafy until someone saves the settings page.
 */

const text = (max: number, label: string) => z.string().trim().max(max, `${label}: högst ${max} tecken.`);
const days = (label: string) =>
  z.coerce.number({ message: `${label}: ange ett antal dagar.` }).int(`${label}: hela dagar.`).min(0, `${label}: minst 0.`).max(120, `${label}: högst 120.`);
const account = z.string().trim().regex(/^\d{4}$/, "Konto: fyra siffror.");

export const companySettingsSchema = z.object({
  legalName: text(120, "Företagsnamn").default(""),
  orgNr: text(13, "Organisationsnummer").refine((v) => v === "" || ORG_NR.test(v), "Organisationsnummer skrivs 559123-4567.").default(""),
  vatNr: text(16, "Momsregistreringsnummer").refine((v) => v === "" || VAT_NR.test(v), "Momsregistreringsnummer skrivs SE559123456701.").default(""),
  street: text(120, "Gatuadress").default(""),
  postalCode: text(10, "Postnummer").default(""),
  city: text(60, "Ort").default(""),
  email: z.union([z.literal(""), z.string().trim().email("Ange en giltig e-postadress.")]).default(""),
  phone: text(30, "Telefon").default(""),
  fSkatt: z.boolean().default(true),
  /** Who signs reminders and is printed as "Vår referens" when nothing else is set. */
  signer: text(80, "Undertecknare").default(""),
});

export const paymentSettingsSchema = z.object({
  bankgiro: text(12, "Bankgiro").refine((v) => v === "" || /^\d{3,4}-?\d{4}$/.test(v), "Bankgiro skrivs 123-4567 eller 1234-5678.").default(""),
  plusgiro: text(12, "Plusgiro").refine((v) => v === "" || /^\d{1,7}-?\d$/.test(v), "Plusgiro skrivs 12 34 56-7 utan mellanslag, t.ex. 123456-7.").default(""),
  iban: text(34, "IBAN")
    .transform((v) => v.replace(/\s/g, "").toUpperCase())
    .refine((v) => v === "" || /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v), "IBAN skrivs SE45 5000 0000 0583 9825 7466.")
    .default(""),
  bic: text(11, "BIC")
    .transform((v) => v.toUpperCase())
    .refine((v) => v === "" || /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v), "BIC är 8 eller 11 tecken, t.ex. ESSESESS.")
    .default(""),
  swish: text(15, "Swish-nummer")
    .transform((v) => v.replace(/\s/g, ""))
    .refine((v) => v === "" || /^123\d{7}$/.test(v), "Swish-nummer för företag är tio siffror och börjar med 123.")
    .default(""),
});

export const termsSettingsSchema = z.object({
  privat: days("Villkor privatpersoner").default(30),
  foretag: days("Villkor företag").default(30),
  byggforetag: days("Villkor byggföretag").default(30),
});

export const reminderSettingsSchema = z.object({
  /** Days after the due date before the first reminder is due. */
  graceDays: days("Dagar innan första påminnelsen").default(DEFAULT_REMINDER_SETTINGS.graceDays),
  /** Days between reminders. */
  daysBetween: days("Dagar mellan påminnelser").default(DEFAULT_REMINDER_SETTINGS.daysBetween),
  /** Charge the reminder fee to private persons too (only when the terms say so). */
  feeToConsumers: z.boolean().default(DEFAULT_REMINDER_SETTINGS.feeToConsumers),
  /** The daily run sends due reminders by itself. */
  auto: z.boolean().default(false),
});

/** Overrides of the BAS accounts the core posts to (lib/core/ledger/posting.ts). Empty = BAS. */
export const CHART_KEYS = [
  "receivables",
  "rotReceivable",
  "bank",
  "sales25",
  "sales12",
  "sales6",
  "sales0",
  "salesReverseCharge",
  "vat25",
  "vat12",
  "vat6",
  "rounding",
  "reminderFee",
  "lateInterest",
] as const;
export type ChartKey = (typeof CHART_KEYS)[number];

export const CHART_KEY_LABEL: Record<ChartKey, string> = {
  receivables: "Kundfordringar",
  rotReceivable: "ROT-fordran, Skatteverket",
  bank: "Bank",
  sales25: "Försäljning 25 %",
  sales12: "Försäljning 12 %",
  sales6: "Försäljning 6 %",
  sales0: "Försäljning momsfri",
  salesReverseCharge: "Försäljning byggtjänster, omvänd",
  vat25: "Utgående moms 25 %",
  vat12: "Utgående moms 12 %",
  vat6: "Utgående moms 6 %",
  rounding: "Öresutjämning",
  reminderFee: "Påminnelseavgifter",
  lateInterest: "Ränteintäkter kundfordringar",
};

const chartAccount = z.union([z.literal(""), account]).default("");
export const chartSettingsSchema = z.object({
  receivables: chartAccount,
  rotReceivable: chartAccount,
  bank: chartAccount,
  sales25: chartAccount,
  sales12: chartAccount,
  sales6: chartAccount,
  sales0: chartAccount,
  salesReverseCharge: chartAccount,
  vat25: chartAccount,
  vat12: chartAccount,
  vat6: chartAccount,
  rounding: chartAccount,
  reminderFee: chartAccount,
  lateInterest: chartAccount,
});

export const orgSettingsSchema = z.object({
  company: companySettingsSchema.default({}),
  payment: paymentSettingsSchema.default({}),
  /** Payment terms in days per customer type, for new invoices. */
  terms: termsSettingsSchema.default({}),
  lateInterestText: text(200, "Dröjsmålsränta").default(""),
  reminders: reminderSettingsSchema.default({}),
  /** First day of the fiscal year, MM-DD. "01-01" = calendar year. */
  fiscalYearStart: z
    .string()
    .regex(/^(0[1-9]|1[0-2])-01$/, "Räkenskapsåret börjar den första i en månad, MM-01.")
    .default("01-01"),
  chart: chartSettingsSchema.default({}),
});
export type OrgSettings = z.infer<typeof orgSettingsSchema>;

export const DEFAULT_LATE_INTEREST_TEXT = "Dröjsmålsränta enligt räntelagen, referensräntan plus 8 procentenheter.";

/** An empty row (`{}`) or one that has never been saved. */
export function isEmptySettings(data: unknown): boolean {
  return !data || typeof data !== "object" || Object.keys(data as object).length === 0;
}

/**
 * The settings in force: the stored row when there is one, otherwise the
 * fallback (only given for the first organisation: content blocks and
 * environment). A stored row is authoritative as a whole once saved, so
 * clearing a field on the settings page really clears it.
 */
export function resolveOrgSettings(stored: unknown, fallback?: () => OrgSettings): OrgSettings {
  if (isEmptySettings(stored)) return fallback ? fallback() : orgSettingsSchema.parse({});
  const parsed = orgSettingsSchema.safeParse(stored);
  // A row that no longer validates (a rule got stricter) still yields what it can.
  return parsed.success ? parsed.data : orgSettingsSchema.parse(lenient(stored));
}

/** Drop values that fail validation, keeping the rest. */
function lenient(stored: unknown): unknown {
  if (!stored || typeof stored !== "object") return {};
  const out: Record<string, unknown> = {};
  const shape = orgSettingsSchema.shape;
  for (const [k, v] of Object.entries(stored as Record<string, unknown>)) {
    const field = shape[k as keyof typeof shape];
    if (!field) continue;
    if (field.safeParse(v).success) out[k] = v;
    else if (v && typeof v === "object") {
      const inner: Record<string, unknown> = {};
      for (const [ik, iv] of Object.entries(v as Record<string, unknown>)) {
        if (field.safeParse({ [ik]: iv }).success) inner[ik] = iv;
      }
      out[k] = inner;
    }
  }
  return out;
}

/** The seller block of an invoice document. */
export function sellerFromSettings(s: OrgSettings): Seller {
  return {
    name: s.company.legalName,
    orgNr: s.company.orgNr,
    vatNr: s.company.vatNr,
    street: s.company.street,
    postalCode: s.company.postalCode,
    city: s.company.city,
    countryCode: "SE",
    email: s.company.email,
    phone: s.company.phone,
    fSkatt: s.company.fSkatt,
  };
}

export function termsDaysFor(s: OrgSettings, type: CustomerType | undefined): number {
  return s.terms[type && (CUSTOMER_TYPES as readonly string[]).includes(type) ? type : "foretag"];
}

export function reminderSettingsFrom(s: OrgSettings): ReminderSettings & { auto: boolean } {
  return { ...DEFAULT_REMINDER_SETTINGS, graceDays: s.reminders.graceDays, daysBetween: s.reminders.daysBetween, feeToConsumers: s.reminders.feeToConsumers, auto: s.reminders.auto };
}

/** The chart of accounts the postings use: BAS with this organisation's overrides. */
export function chartFromSettings(s: OrgSettings): ChartOfAccounts {
  const c = s.chart;
  const pick = (v: string, d: string) => v || d;
  return {
    receivables: pick(c.receivables, DEFAULT_CHART.receivables),
    rotReceivable: pick(c.rotReceivable, DEFAULT_CHART.rotReceivable),
    bank: pick(c.bank, DEFAULT_CHART.bank),
    sales: {
      25: pick(c.sales25, DEFAULT_CHART.sales[25]),
      12: pick(c.sales12, DEFAULT_CHART.sales[12]),
      6: pick(c.sales6, DEFAULT_CHART.sales[6]),
      0: pick(c.sales0, DEFAULT_CHART.sales[0]),
    },
    salesReverseCharge: pick(c.salesReverseCharge, DEFAULT_CHART.salesReverseCharge),
    vat: { 25: pick(c.vat25, DEFAULT_CHART.vat[25]), 12: pick(c.vat12, DEFAULT_CHART.vat[12]), 6: pick(c.vat6, DEFAULT_CHART.vat[6]) },
    rounding: pick(c.rounding, DEFAULT_CHART.rounding),
    reminderFee: pick(c.reminderFee, DEFAULT_CHART.reminderFee),
    lateInterest: pick(c.lateInterest, DEFAULT_CHART.lateInterest),
  };
}

/** The BAS account each chart key stands for by default, e.g. sales25 → 3001. */
export function defaultAccountFor(key: ChartKey): string {
  const flat: Record<ChartKey, string> = {
    receivables: DEFAULT_CHART.receivables,
    rotReceivable: DEFAULT_CHART.rotReceivable,
    bank: DEFAULT_CHART.bank,
    sales25: DEFAULT_CHART.sales[25],
    sales12: DEFAULT_CHART.sales[12],
    sales6: DEFAULT_CHART.sales[6],
    sales0: DEFAULT_CHART.sales[0],
    salesReverseCharge: DEFAULT_CHART.salesReverseCharge,
    vat25: DEFAULT_CHART.vat[25],
    vat12: DEFAULT_CHART.vat[12],
    vat6: DEFAULT_CHART.vat[6],
    rounding: DEFAULT_CHART.rounding,
    reminderFee: DEFAULT_CHART.reminderFee,
    lateInterest: DEFAULT_CHART.lateInterest,
  };
  return flat[key];
}

/** Accounts an override points at that must exist in the organisation's chart, with a name for each. */
export function overrideAccounts(s: OrgSettings): { number: string; name: string }[] {
  return CHART_KEYS.filter((k) => s.chart[k]).map((k) => ({ number: s.chart[k], name: DEFAULT_ACCOUNT_NAMES[defaultAccountFor(k)] ?? CHART_KEY_LABEL[k] }));
}

/** The fiscal year a date falls in, given the first month (MM-01). */
export function fiscalYearFor(date: string, fiscalYearStart = "01-01"): { start: string; end: string } {
  const month = Number(fiscalYearStart.slice(0, 2));
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const startYear = m >= month ? y : y - 1;
  const start = `${startYear}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(startYear + 1, month - 1, 0));
  return { start, end: endDate.toISOString().slice(0, 10) };
}

/** The settings, filled from Företaget and Offertuppgifter (the first organisation before org_settings is saved). */
export function settingsFromContent(input: {
  company: { legalName: string; orgNr: string; street: string; postalCode: string; city: string; email: string; phoneDisplay: string };
  quote: { vatNumber: string; fSkatt: boolean; bankgiro: string; plusgiro: string; iban: string; bic: string; paymentDays: number; lateInterest: string; signerName: string };
  env: Record<string, string | undefined>;
}): OrgSettings {
  const { company, quote, env } = input;
  const n = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
  // Built field by field without validation: the content blocks have their own
  // rules, and an invoice draft must open even if one of them is off.
  const base = orgSettingsSchema.parse({});
  return {
    ...base,
    company: {
      legalName: company.legalName,
      orgNr: company.orgNr,
      vatNr: quote.vatNumber,
      street: company.street,
      postalCode: company.postalCode,
      city: company.city,
      email: company.email,
      phone: company.phoneDisplay,
      fSkatt: quote.fSkatt,
      signer: quote.signerName,
    },
    payment: {
      bankgiro: quote.bankgiro,
      plusgiro: quote.plusgiro,
      iban: quote.iban,
      bic: quote.bic,
      swish: (env.SWISH_NUMBER ?? "").replace(/\s/g, ""),
    },
    terms: { privat: quote.paymentDays, foretag: quote.paymentDays, byggforetag: quote.paymentDays },
    lateInterestText: quote.lateInterest || DEFAULT_LATE_INTEREST_TEXT,
    reminders: {
      graceDays: n(env.REMINDERS_GRACE_DAYS, DEFAULT_REMINDER_SETTINGS.graceDays),
      daysBetween: n(env.REMINDERS_DAYS_BETWEEN, DEFAULT_REMINDER_SETTINGS.daysBetween),
      feeToConsumers: env.REMINDERS_FEE_TO_CONSUMERS === "1",
      auto: env.REMINDERS_AUTO === "1",
    },
  };
}
