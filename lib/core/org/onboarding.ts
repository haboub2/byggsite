import type { OrgSettings } from "./settings";

/**
 * The start guide (/admin/kom-igang, and the banner in admin until it is
 * done or hidden): what a new organisation fills in before its first real
 * invoice, each step's status read from the data. Pure, so the tests can
 * check every step without a database.
 */

export type OnboardingInput = {
  settings: OrgSettings;
  /** The settings page has been saved, so the terms (30 days by default) have been looked at. */
  termsReviewed: boolean;
  /** The organisation owns the website: its logo is the site's (Offertuppgifter, lib/quotes/profile-store.ts). */
  siteOrg: boolean;
  customerCount: number;
  /** The oldest customer, prefilled on Ny faktura for the trial invoice. */
  firstCustomerId: string | null;
  invoiceCount: number;
};

export type OnboardingStepKey = "company" | "payment" | "terms" | "logo" | "customer" | "invoice";

export type OnboardingStep = {
  key: OnboardingStepKey;
  title: string;
  /** What the step is, or what is still missing. */
  body: string;
  done: boolean;
  href: string;
  action: string;
};

const COMPANY_FIELDS: [keyof OrgSettings["company"], string][] = [
  ["legalName", "namn"],
  ["street", "gatuadress"],
  ["postalCode", "postnummer"],
  ["city", "ort"],
  ["orgNr", "organisationsnummer"],
  ["vatNr", "momsregistreringsnummer"],
];

/** "namn, ort och momsregistreringsnummer" */
function list(words: string[]): string {
  return words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} och ${words[words.length - 1]}`;
}

export function onboardingSteps(input: OnboardingInput): OnboardingStep[] {
  const { settings: s } = input;
  const missing = COMPANY_FIELDS.filter(([k]) => !String(s.company[k] ?? "").trim()).map(([, label]) => label);
  const paid = !!(s.payment.bankgiro || s.payment.swish);
  const logo = input.siteOrg || !!s.branding.logo;

  return [
    {
      key: "company",
      title: "Företagsuppgifter",
      body: missing.length ? `Saknas: ${list(missing)}. Står som säljare på varje faktura.` : `${s.company.legalName}, ${s.company.orgNr}, ${s.company.city}.`,
      done: missing.length === 0,
      href: "/admin/installningar#foretaget",
      action: "Fyll i",
    },
    {
      key: "payment",
      title: "Betalning",
      body: paid
        ? [s.payment.bankgiro && `Bankgiro ${s.payment.bankgiro}`, s.payment.swish && `Swish ${s.payment.swish}`].filter(Boolean).join(" · ")
        : "Bankgiro eller Swish, så kunden kan betala. Swish ger QR-koden på fakturan.",
      done: paid,
      href: "/admin/installningar#betalning",
      action: "Lägg till",
    },
    {
      key: "terms",
      title: "Villkor",
      body: input.termsReviewed
        ? `${s.terms.privat} dagar för privatpersoner, ${s.terms.foretag} för företag.`
        : "Betalningsvillkor (förvalt 30 dagar) och dröjsmålsränta. Granska och spara.",
      done: input.termsReviewed,
      href: "/admin/installningar#villkor",
      action: "Granska",
    },
    {
      key: "logo",
      title: "Logotyp",
      body: input.siteOrg ? "Webbplatsens logotyp står på fakturor och offerter." : s.branding.logo ? "Står överst på fakturor och offerter." : "Står överst på fakturor och offerter. Utan logotyp skrivs företagsnamnet.",
      done: logo,
      href: input.siteOrg ? "/admin/innehall/offert" : "/admin/installningar#logotyp",
      action: "Ladda upp",
    },
    {
      key: "customer",
      title: "Första kunden",
      body: input.customerCount > 0 ? `${input.customerCount} ${input.customerCount === 1 ? "kund" : "kunder"} i registret.` : "Lägg gärna in ert eget företag först, så kan provfakturan gå till dig själv.",
      done: input.customerCount > 0,
      href: "/admin/kunder/ny",
      action: "Lägg till kund",
    },
    {
      key: "invoice",
      title: "Skapa en provfaktura till dig själv",
      body:
        input.invoiceCount > 0
          ? "Klart. Utkast går att ta bort, och en utfärdad faktura rättas med kreditfaktura."
          : "Ett utkast till kunden ovan. Granska PDF:en och mejla den till dig själv innan första riktiga fakturan.",
      done: input.invoiceCount > 0,
      href: input.firstCustomerId ? `/admin/fakturor/ny?kund=${encodeURIComponent(input.firstCustomerId)}` : "/admin/kunder/ny",
      action: input.firstCustomerId ? "Ny faktura" : "Lägg till kund först",
    },
  ];
}

export type OnboardingProgress = { done: number; total: number; complete: boolean; next: OnboardingStep | null };

export function onboardingProgress(steps: OnboardingStep[]): OnboardingProgress {
  const done = steps.filter((s) => s.done).length;
  return { done, total: steps.length, complete: done === steps.length, next: steps.find((s) => !s.done) ?? null };
}
