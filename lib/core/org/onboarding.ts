import type { OrgSettings } from "./settings";

/**
 * The start guide (/admin/kom-igang, and the banner in admin until it is
 * done or hidden): five steps a new organisation fills in before its first
 * real invoice, each step's status read from the data, then a trial invoice
 * to oneself that unlocks when all five are done. Pure, so the tests can
 * check every step without a database.
 */

export type OnboardingInput = {
  settings: OrgSettings;
  /** The settings page (or "Godkänn förvalet") has saved the terms, so they have been looked at. */
  termsReviewed: boolean;
  /** The organisation owns the website: its logo is the site's (Offertuppgifter, lib/quotes/profile-store.ts). */
  siteOrg: boolean;
  customerCount: number;
  /** The oldest customer, prefilled on Ny faktura for the trial invoice. */
  firstCustomerId: string | null;
  invoiceCount: number;
};

export type OnboardingStepKey = "company" | "payment" | "terms" | "logo" | "customer";

export type OnboardingStep = {
  key: OnboardingStepKey;
  /** 1–5, the order on the page. */
  n: number;
  title: string;
  /** What is filled in, or what the step is about. */
  body: string;
  done: boolean;
  href: string;
  /** The button on a step that is not done. "approve-terms" is the form that saves the default terms. */
  action: string;
};

export type TrialInvoice = {
  /** All five steps are done. */
  unlocked: boolean;
  /** The organisation has an invoice (a draft counts). */
  done: boolean;
  /** Numbers of the steps still left, for "Låst tills steg 3–5 är klara". */
  waitingFor: number[];
  href: string;
};

function joinAnd(words: string[]): string {
  return words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} och ${words[words.length - 1]}`;
}

/** "3–5", "3 och 5", "4" */
export function stepRange(ns: number[]): string {
  if (ns.length > 2 && ns.every((n, i) => i === 0 || n === ns[i - 1] + 1)) return `${ns[0]}–${ns[ns.length - 1]}`;
  return joinAnd(ns.map(String));
}

export function onboardingSteps(input: OnboardingInput): OnboardingStep[] {
  const { settings: s } = input;
  const c = s.company;
  const companyDone = [c.legalName, c.street, c.postalCode, c.city, c.orgNr, c.vatNr].every((v) => String(v ?? "").trim());
  const address = [c.street, [c.postalCode, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const paid = !!(s.payment.bankgiro || s.payment.swish);
  const sameTerms = s.terms.privat === s.terms.foretag;

  return [
    {
      key: "company",
      n: 1,
      title: "Företaget på fakturan",
      body: companyDone
        ? [c.legalName, c.orgNr, c.vatNr, address].filter(Boolean).join(" · ")
        : "Namn, adress, organisationsnummer och momsregistreringsnummer. Står som säljare på varje faktura.",
      done: companyDone,
      href: "/admin/installningar#foretaget",
      action: "Fyll i",
    },
    {
      key: "payment",
      n: 2,
      title: "Betalning",
      body: paid
        ? [
            s.payment.bankgiro ? `Bankgiro ${s.payment.bankgiro}` : "Bankgiro saknas",
            s.payment.swish ? `Swish ${s.payment.swish}` : "Swish saknas",
            s.payment.bankgiro ? (s.payment.ocrAgreement ? "OCR-avtal" : "OCR-avtal ej kryssat ännu") : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : "Bankgiro eller Swish, så kunden kan betala. Swish ger QR-koden på fakturan.",
      done: paid,
      href: "/admin/installningar#betalning",
      action: "Lägg till",
    },
    {
      key: "terms",
      n: 3,
      title: "Villkor och påminnelser",
      body: `${sameTerms ? `${s.terms.privat} dagar till privatpersoner och företag` : `${s.terms.privat} dagar till privatpersoner, ${s.terms.foretag} till företag`}${input.termsReviewed ? "" : " är förvalt"}. Dröjsmålsränta enligt räntelagen, påminnelseavgift 60 kr till företag.`,
      done: input.termsReviewed,
      href: "/admin/installningar#villkor",
      action: "approve-terms",
    },
    {
      key: "logo",
      n: 4,
      title: "Logotyp",
      body: input.siteOrg
        ? "Webbplatsens logotyp står på faktura, offert och projektrapport."
        : s.branding.logo
          ? "Står på faktura, offert och projektrapport."
          : "Utan logotyp skrivs företagsnamnet på fakturan. PNG eller SVG, visas på faktura, offert och projektrapport.",
      done: input.siteOrg || !!s.branding.logo,
      href: input.siteOrg ? "/admin/innehall/offert" : "/admin/installningar#logotyp",
      action: "Ladda upp",
    },
    {
      key: "customer",
      n: 5,
      title: "Första kunden",
      body:
        input.customerCount > 0
          ? `${input.customerCount} ${input.customerCount === 1 ? "kund" : "kunder"} i registret.`
          : "Privatperson, företag eller byggföretag med omvänd moms. Flera fakturamottagare per kund går bra.",
      done: input.customerCount > 0,
      href: "/admin/kunder/ny",
      action: "Lägg till kund",
    },
  ];
}

/** The last box: a trial invoice to oneself, locked until the five steps are done. */
export function trialInvoice(input: OnboardingInput, steps = onboardingSteps(input)): TrialInvoice {
  const waitingFor = steps.filter((s) => !s.done).map((s) => s.n);
  return {
    unlocked: waitingFor.length === 0,
    done: input.invoiceCount > 0,
    waitingFor,
    href: input.firstCustomerId ? `/admin/fakturor/ny?kund=${encodeURIComponent(input.firstCustomerId)}` : "/admin/fakturor/ny",
  };
}

export type OnboardingProgress = {
  done: number;
  total: number;
  /** Five steps and the trial invoice: the guide and its banner are finished. */
  complete: boolean;
  /** What to do next: a step's title, or the trial invoice. */
  next: { title: string; href: string } | null;
};

export function onboardingProgress(steps: OnboardingStep[], trial: TrialInvoice): OnboardingProgress {
  const done = steps.filter((s) => s.done).length;
  const step = steps.find((s) => !s.done);
  const next = step ? { title: step.title, href: step.action === "approve-terms" ? "/admin/kom-igang" : step.href } : trial.done ? null : { title: "Provfakturan", href: trial.href };
  return { done, total: steps.length, complete: done === steps.length && trial.done, next };
}
