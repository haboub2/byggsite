/**
 * "Kom igång med lön" (docs/hr-lon.md, section 12, "Before the first real
 * payroll", and phase 6): the steps a new organisation goes through before
 * its first run, each read from the data, so a second organisation can run
 * a payroll without us. Pure; the store reads the rows (onboarding-store.ts
 * does for the invoicing guide). The decisions are the PAYROLL_DECISIONS
 * of settings.ts; a decision counts as done when it is confirmed, and some
 * need a value too (the bank account, the register's preset, the AGI's
 * contact). The people step needs at least one person with a contract, a
 * tax row and a bank account; the tables step the year's import.
 */

import type { IsoDate } from "../rules/index";
import type { PayItemPreset } from "./pay-item-presets";
import { DECISION_LABEL, type PayrollConfirmed, type PayrollSettings } from "./settings";

export type PayrollOnboardingInput = {
  settings: PayrollSettings;
  confirmed: PayrollConfirmed;
  /** Owners and admins apart from the one who will compute (two are needed for four eyes), and whether an accountant is a member. */
  approverCount: number;
  hasAccountant: boolean;
  /** The organisation's number in Inställningar › Företaget (the AGI's identity). */
  orgNr: string;
  /** Tax table years imported and finished. */
  taxTableYears: readonly number[];
  people: readonly { id: string; name: string; hasContract: boolean; hasTax: boolean; hasBank: boolean; ended: boolean }[];
  /** The register has 1830 (drivmedelsförmån), so 0043's seed has run for this organisation. */
  registerCodes: readonly string[];
  hasSeriesL: boolean;
  runCount: number;
  today: IsoDate;
};

export type PayrollOnboardingStep = {
  key: string;
  n: number;
  title: string;
  body: string;
  done: boolean;
  href: string;
  action: string;
  /** "decision" steps are saved on Inställningar › Lön. */
  kind: "setup" | "decision" | "data";
};

export type PayrollOnboarding = {
  steps: PayrollOnboardingStep[];
  done: number;
  total: number;
  complete: boolean;
  /** The first step not done. */
  next: PayrollOnboardingStep | null;
};

const PRESET_TEXT: Record<PayItemPreset, string> = {
  none: "inget kollektivavtal",
  byggavtalet: "Byggavtalet",
  tjanstemannaavtalet: "Tjänstemannaavtalet",
  both: "Byggavtalet och Tjänstemannaavtalet",
};

export function payrollOnboarding(input: PayrollOnboardingInput): PayrollOnboarding {
  const { settings: s, confirmed: c } = input;
  const year = Number(input.today.slice(0, 4));
  const active = input.people.filter((p) => !p.ended);
  const ready = active.filter((p) => p.hasContract && p.hasTax && p.hasBank);
  const missing = active.filter((p) => !(p.hasContract && p.hasTax && p.hasBank));
  const seeded = input.hasSeriesL && input.registerCodes.includes("1010") && input.registerCodes.includes("1830");
  const decision = (key: keyof PayrollConfirmed, href: string, body: { done: string; todo: string }, extra = true): Omit<PayrollOnboardingStep, "n"> => {
    const done = Boolean(c[key]) && extra;
    return { key, title: DECISION_LABEL[key], body: done ? body.done : body.todo, done, href, action: "Bestäm", kind: "decision" };
  };

  const steps: Omit<PayrollOnboardingStep, "n">[] = [
    {
      key: "register",
      title: "Löneartsregistret, kontona och serien L",
      body: seeded
        ? `${input.registerCodes.length} lönearter, lönekontona i kontoplanen och lönebeskedens serie L finns.`
        : "Registret, kontona och serien L läggs upp när organisationen skapas och när den första körningen skapas; saknas de har migrationen 0043 inte körts.",
      done: seeded,
      href: "/admin/installningar/lon#register",
      action: "Visa",
      kind: "setup",
    },
    decision(
      "agreement",
      "/admin/installningar/lon#agreement",
      {
        done: `${PRESET_TEXT[s.agreement]}; registret följer förvalet ${s.payItemPreset ? PRESET_TEXT[s.payItemPreset] : "(inte tillämpat)"}.`,
        todo: "Byggavtalet, Tjänstemannaavtalet, båda eller inget. Styr semester 12 eller 13 %, OB- och övertidstabellerna, Fora och Collectum, och vilket förval löneartsregistret får.",
      },
      s.payItemPreset === s.agreement
    ),
    decision("period", "/admin/installningar/lon#period", {
      done: s.variablePeriod === "previous" ? "Månadslön för innevarande månad, tid och frånvaro för månaden före." : "Allt för samma månad.",
      todo: "Månadslön för innevarande månad och timlön, tillägg och frånvaro för månaden före är det vanliga.",
    }),
    decision("payDay", "/admin/installningar/lon#payDay", { done: `Den ${s.payDay}:e, bankdagen före om det är helg.`, todo: "Den 25:e är det vanliga; en helgdag flyttas till bankdagen före." }),
    decision("vacationYear", "/admin/installningar/lon#vacationYear", {
      done: s.vacationYear === "law" ? "1 april–31 mars (semesterlagen)." : "Kalenderår.",
      todo: "Semesterlagens 1 april–31 mars, eller kalenderår.",
    }),
    {
      key: "approvers",
      title: "Vem räknar och vem godkänner",
      body:
        input.approverCount >= 2 || (input.approverCount >= 1 && input.hasAccountant)
          ? `${input.approverCount} ägare eller administratörer${input.hasAccountant ? " och en redovisningskonsult" : ""}: den som räknar kan inte godkänna, så två personer behövs.${c.approvers ? "" : " Godkännarna är inte bekräftade (alla ägare och administratörer får godkänna)."}`
          : "Den som räknar lönen kan inte godkänna den (fyra ögon). Bjud in en till ägare eller administratör, eller redovisningskonsulten som räknar, under Organisation.",
      done: input.approverCount >= 2 || (input.approverCount >= 1 && input.hasAccountant),
      href: "/admin/organisation",
      action: "Bjud in",
      kind: "setup",
    },
    decision("bank", "/admin/installningar/lon#bank", { done: `Lönekontot ${s.bank.iban.replace(/(.{4})/g, "$1 ").trim()}.`, todo: "Kontot lönefilen (ISO 20022 pain.001) dras från. Utan det kan bankfilen inte skapas." }, Boolean(s.bank.iban)),
    decision("accounts", "/admin/installningar/lon#accounts", { done: "Konteringen är granskad och bekräftad.", todo: "BAS 2026 enligt docs/hr-lon.md avsnitt 7; låt redovisningskonsulten titta på den." }),
    decision("pension", "/admin/installningar/lon#pension", {
      done: [s.pension.foraCustomerNo && `Fora ${s.pension.foraCustomerNo}`, s.pension.foraFokId, s.pension.collectumCustomerNo && `Collectum ${s.pension.collectumCustomerNo}`].filter(Boolean).join(", ") || "Ingen Fora eller Collectum.",
      todo: "Kundnummer hos Fora (SAF-LO) och FOK-ID, och hos Collectum (ITP 1), om avtalet kräver det. Utan dem periodiseras premierna men ingen rapport görs.",
    }),
    {
      key: "agi",
      title: "Arbetsgivardeklarationen",
      body: input.orgNr
        ? `Arbetsgivare ${input.orgNr}; ${c.agi ? "deklarationsdag och kontaktperson bekräftade." : "deklarationsdagen och kontaktpersonen är inte bekräftade."}`
        : "Organisationsnumret saknas under Inställningar › Företaget; AGI-filen behöver arbetsgivarens identitet. Registrera företaget som arbetsgivare hos Skatteverket om det inte är gjort.",
      done: Boolean(input.orgNr) && Boolean(c.agi),
      href: input.orgNr ? "/admin/installningar/lon#agi" : "/admin/installningar#foretaget",
      action: input.orgNr ? "Bestäm" : "Fyll i",
      kind: "decision",
    },
    {
      key: "tax-tables",
      title: `Skattetabellerna för ${year}`,
      body: input.taxTableYears.includes(year)
        ? `Tabellerna för ${year} är importerade och kontrollerade mot Skatteverkets kontrollvektorer.`
        : `Importera årets tabeller: npm run tax-tables:import -- ${year} --out tabeller.json och npm run tax-tables:load -- tabeller.json (service role). Körningen vägrar utan dem.`,
      done: input.taxTableYears.includes(year),
      href: "/admin/installningar/lon#tables",
      action: "Visa",
      kind: "data",
    },
    {
      key: "people",
      title: "Personalen",
      body:
        active.length === 0
          ? "Lägg in varje person med anställningsavtal, skattetabell och kolumn (A-skattsedeln) och bankkonto."
          : missing.length === 0
            ? `${ready.length} ${ready.length === 1 ? "person" : "personer"} med avtal, skatteuppgifter och bankkonto.`
            : `${ready.length} av ${active.length} klara. Saknas: ${missing
                .slice(0, 4)
                .map((p) => `${p.name} (${[!p.hasContract && "avtal", !p.hasTax && "skatt", !p.hasBank && "bankkonto"].filter(Boolean).join(", ")})`)
                .join("; ")}${missing.length > 4 ? ` och ${missing.length - 4} till` : ""}.`,
      done: active.length > 0 && missing.length === 0,
      href: active.length === 0 ? "/admin/personal/ny" : "/admin/personal",
      action: active.length === 0 ? "Lägg till" : "Komplettera",
      kind: "data",
    },
  ];
  const numbered = steps.map((s, i) => ({ ...s, n: i + 1 }));
  const done = numbered.filter((s) => s.done).length;
  return { steps: numbered, done, total: numbered.length, complete: done === numbered.length, next: numbered.find((s) => !s.done) ?? null };
}
