/**
 * The written contract for an employment version (docs/hr-lon.md, section 2,
 * design consequence 3): what the PDF says, as data, so the law's list can
 * be tested without rendering. lib/pdf/EmploymentContractPdf.tsx only lays
 * it out.
 *
 * LAS 6 c § lists what the employer must give in writing (since 2022-06-30
 * more items): the parties, workplace, duties, start, the form and its end
 * or trial period, notice, pay components and pay day, semester, working
 * time and overtime, the right to training, the social security
 * contributions and insurances, and the collective agreement. A SÄVA also
 * gets the statement that it is one and what that means (the clock), in
 * its own section. A VD-avtal says LAS does not apply (1 §). A board
 * assignment is not an employment: arvode decided by the stämma, no LAS,
 * no semester, no sjuklön unless agreed.
 *
 * Change a text and the template version below changes with it: every
 * frozen PDF records the version it was made from.
 */

import { formatOre } from "../money";
import type { IsoDate } from "../rules/index";
import type { ClockRow } from "./clocks";
import {
  AGREEMENT_LABEL,
  FEE_PERIOD_LABEL,
  FORM_LABEL,
  PENSION_LABEL,
  formatPnr,
  type Agreement,
  type Employee,
  type EmploymentVersion,
} from "./schema";

export const CONTRACT_TEMPLATE_VERSION = "2026-10-30";

export type ContractEmployer = {
  name: string;
  orgNr: string;
  street: string;
  postalCode: string;
  city: string;
  /** Who signs for the employer. */
  signer: string;
};

export type ContractInput = {
  employer: ContractEmployer;
  employee: Pick<Employee, "name" | "street" | "postalCode" | "city" | "agreement">;
  /** Twelve digits; null prints the masked form or nothing. */
  pnr12: string | null;
  employment: EmploymentVersion;
  /** The clock row for the person, to tell a SÄVA how much time is counted so far. */
  clocks?: ClockRow | null;
  /** The day the document is made. */
  today: IsoDate;
};

export type ContractSection = {
  heading: string;
  /** Label and value rows, printed as a two-column table. */
  rows?: [string, string][];
  paragraphs?: string[];
};

export type ContractContent = {
  template: string;
  templateVersion: string;
  title: string;
  /** One line under the title: the form in words. */
  subtitle: string;
  sections: ContractSection[];
  signatures: { employer: string; employee: string };
  /** Short file name part: "Anstallningsavtal" or "Styrelseuppdrag". */
  fileTitle: string;
};

const kr = (ore: number) => formatOre(ore, { decimals: ore % 100 === 0 ? 0 : 2, currency: true });
const sv = (d: IsoDate | null) => (d ? d : "");
const percent = (n: number) => `${n.toLocaleString("sv-SE", { maximumFractionDigits: 2 })} %`;
const address = (p: { street: string; postalCode: string; city: string }) => [p.street, [p.postalCode, p.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");

/** Employer's notice by length of employment, LAS 11 §. */
export const LAS_NOTICE_TEXT =
  "Arbetsgivarens uppsägningstid följer anställningstiden (LAS 11 §): en månad under två år, två månader från två år, tre från fyra, fyra från sex, fem från åtta och sex månader från tio år. Arbetstagarens uppsägningstid är en månad.";

function agreementLine(agreement: Agreement): string {
  return agreement === "none"
    ? "Arbetsgivaren är inte bunden av kollektivavtal för anställningen. Villkoren följer lag och detta avtal."
    : `${AGREEMENT_LABEL[agreement]} gäller för anställningen, i den lydelse som gäller vid varje tid. Där avtalet och kollektivavtalet skiljer sig gäller kollektivavtalet om det är förmånligare för arbetstagaren.`;
}

function overtimeLine(agreement: Agreement): string {
  if (agreement === "byggavtalet") return "Övertid, mertid och obekväm arbetstid ersätts enligt Byggavtalet. Övertid beordras inom arbetstidslagens ramar.";
  if (agreement === "tjanstemannaavtalet") return "Övertid ersätts med pengar eller ledighet enligt Tjänstemannaavtalet. Övertid beordras inom arbetstidslagens ramar.";
  return "Övertid och mertid beordras inom arbetstidslagens ramar (högst 200 timmar övertid per kalenderår) och ersätts med pengar eller ledighet enligt överenskommelse innan arbetet utförs.";
}

function pensionLine(e: EmploymentVersion): string {
  const parts = ["Arbetsgivaren betalar lagstadgade arbetsgivaravgifter på lönen (socialavgiftslagen), vilket ger arbetstagaren skydd i den allmänna socialförsäkringen."];
  if (e.pensionScheme === "saf-lo") parts.push(`Tjänstepension: ${PENSION_LABEL["saf-lo"]}. Arbetsgivaren tecknar också avtalsförsäkringarna genom Fora (AGS, TFA, TGL, AGB och omställningsförsäkring).`);
  else if (e.pensionScheme === "itp1") parts.push(`Tjänstepension: ${PENSION_LABEL.itp1}, med de försäkringar som hör till planen.`);
  else parts.push("Arbetsgivaren betalar ingen tjänstepension utöver den allmänna pensionen, om inte annat avtalats nedan.");
  parts.push("Arbetsskador omfattas av arbetsskadeförsäkringen enligt socialförsäkringsbalken.");
  return parts.join(" ");
}

function payRows(e: EmploymentVersion): [string, string][] {
  const rows: [string, string][] = [];
  if (e.payForm === "monthly" && e.monthlySalaryOre !== null) rows.push(["Månadslön", `${kr(e.monthlySalaryOre)} per månad`]);
  if (e.payForm === "hourly" && e.hourlyRateOre !== null) rows.push(["Timlön", `${kr(e.hourlyRateOre)} per arbetad timme`]);
  if (e.payForm === "fee" && e.feeOre !== null && e.feePeriod) rows.push(["Arvode", `${kr(e.feeOre)} ${FEE_PERIOD_LABEL[e.feePeriod]}`]);
  const day = e.payDay ?? 25;
  rows.push([
    "Lönedag",
    e.payForm === "hourly"
      ? `Den ${day}:e varje månad, för föregående månads arbetade timmar`
      : e.payForm === "fee"
        ? `Den ${day}:e i den månad arvodet avser, eller enligt stämmans beslut`
        : `Den ${day}:e varje månad`,
  ]);
  rows.push(["Betalning", "Till arbetstagarens bankkonto. Ett lönebesked lämnas vid varje utbetalning."]);
  return rows;
}

function workingTime(e: EmploymentVersion, agreement: Agreement): ContractSection {
  const rows: [string, string][] = [["Omfattning", `${percent(e.workingTimePercent)} av heltid`]];
  if (e.weeklyHours) rows.push(["Ordinarie arbetstid", `${e.weeklyHours.toLocaleString("sv-SE")} timmar per vecka, förlagd enligt schema som arbetsgivaren fastställer`]);
  if (e.atfHoursPerYear > 0) rows.push(["Arbetstidsförkortning", `${e.atfHoursPerYear.toLocaleString("sv-SE")} timmar per år`]);
  const paragraphs = [overtimeLine(agreement)];
  if (e.form === "sava" && e.payForm === "hourly") {
    paragraphs.push(
      "Arbete vid behov: varje arbetspass erbjuds och accepteras för sig och är en egen särskild visstidsanställning. Arbetstagaren är inte skyldig att ta ett erbjudet pass. Pass erbjuds för arbete vardagar mellan 06.00 och 18.00 med minst 24 timmars varsel, om inte annat anges under Övriga villkor."
    );
  }
  return { heading: "Arbetstid", rows, paragraphs };
}

function formSection(e: EmploymentVersion): ContractSection {
  const rows: [string, string][] = [
    ["Anställningsform", FORM_LABEL[e.form]],
    ["Tillträde", e.startsOn],
  ];
  const paragraphs: string[] = [];
  switch (e.form) {
    case "tillsvidare":
      paragraphs.push("Anställningen gäller tills vidare.");
      break;
    case "provanstallning":
      rows.push(["Provanställningen slutar", sv(e.probationEndsOn)]);
      paragraphs.push(
        `Anställningen inleds med provanställning (LAS 6 §) till och med ${sv(e.probationEndsOn)}. Den kan avbrytas före prövotidens slut. Vill någon av parterna att anställningen inte ska fortsätta efter prövotiden ska den andra parten få besked om det senast två veckor innan den löper ut; annars övergår anställningen i en tillsvidareanställning dagen efter.`
      );
      break;
    case "vikariat":
      rows.push(["Vikarierar för", e.substituteFor]);
      rows.push(["Slutdag", e.endsOn ? e.endsOn : "När den ersatta personen återgår i arbete, dock senast det datum som meddelas skriftligen"]);
      paragraphs.push(
        "Anställningen är ett vikariat (LAS 5 §). Den upphör utan uppsägning på slutdagen eller när den som ersätts kommer tillbaka. Den som har varit anställd som vikarie hos arbetsgivaren i sammanlagt mer än två år under en femårsperiod får sin anställning omvandlad till en tillsvidareanställning (LAS 5 a §)."
      );
      break;
    case "sava":
      rows.push(["Slutdag", sv(e.endsOn)]);
      paragraphs.push("Anställningen är en särskild visstidsanställning (LAS 5 §). Den upphör utan uppsägning på slutdagen. Se avsnittet Information om särskild visstidsanställning.");
      break;
    case "sasong":
      rows.push(["Slutdag", sv(e.endsOn)]);
      paragraphs.push("Anställningen är en säsongsanställning (LAS 5 §) och upphör utan uppsägning på slutdagen.");
      break;
    case "vd":
      if (e.endsOn) rows.push(["Avtalet gäller till", e.endsOn]);
      paragraphs.push(
        "Arbetstagaren anställs som verkställande direktör. Lagen om anställningsskydd gäller inte för den som har en företagsledande ställning (LAS 1 §); uppsägning och eventuellt avgångsvederlag regleras därför i detta avtal. Ingen provanställning."
      );
      break;
    case "uppdrag":
      break;
  }
  return { heading: "Anställningens form och tid", rows, paragraphs };
}

function noticeSection(e: EmploymentVersion, agreement: Agreement): ContractSection {
  const paragraphs: string[] = [];
  const agreed = e.noticeDays !== null && e.noticeDays !== undefined;
  switch (e.form) {
    case "tillsvidare":
      paragraphs.push(agreed ? `Ömsesidig uppsägningstid ${e.noticeDays} dagar, men aldrig kortare än lagens (LAS 11 §) för arbetsgivaren.` : agreement === "none" ? LAS_NOTICE_TEXT : `Uppsägningstid enligt ${AGREEMENT_LABEL[agreement]}, och annars enligt LAS 11 §. ${LAS_NOTICE_TEXT}`);
      paragraphs.push("Uppsägning från arbetsgivarens sida ska vara sakligt grundad och lämnas skriftligen (LAS 7–8 §§).");
      break;
    case "provanstallning":
      paragraphs.push("Under prövotiden gäller besked enligt avsnittet ovan. Efter övergången till tillsvidareanställning gäller uppsägningstid enligt LAS 11 §" + (agreement === "none" ? "." : ` eller ${AGREEMENT_LABEL[agreement]}.`));
      break;
    case "vikariat":
    case "sava":
    case "sasong":
      paragraphs.push(
        agreed
          ? `Parterna har kommit överens om att anställningen kan sägas upp i förtid med ${e.noticeDays} dagars uppsägningstid (LAS 4 §).`
          : "Anställningen upphör på slutdagen utan uppsägning och kan inte sägas upp i förtid, utom vid avsked."
      );
      break;
    case "vd":
      paragraphs.push(
        agreed
          ? `Ömsesidig uppsägningstid ${e.noticeDays} dagar. Under uppsägningstiden behåller arbetstagaren lön och förmåner.`
          : "Uppsägningstid och avgångsvederlag enligt övriga villkor nedan."
      );
      break;
    case "uppdrag":
      break;
  }
  return { heading: "Uppsägning", paragraphs };
}

function vacationSection(e: EmploymentVersion): ContractSection {
  const rows: [string, string][] = [["Semesterdagar", `${e.vacationDays} dagar per semesterår`]];
  const paragraphs: string[] = [];
  if (e.vacationRule === "sammalon") {
    rows.push(["Semesterlön", "Sammalöneregeln: månadslönen under semestern och semestertillägg enligt semesterlagen eller kollektivavtal"]);
  } else if (e.vacationRule === "procent") {
    rows.push(["Semesterlön", `Procentregeln: ${percent(e.vacationPercent ?? 12)} av semesterlönegrundande lön`]);
    if (e.form === "sava" || e.form === "sasong" || (e.endsOn && e.payForm === "hourly")) {
      paragraphs.push("Semesterersättning betalas ut med lönen för varje månad eller när anställningen upphör, eftersom anställningen är kort eller betalas per timme.");
    }
  }
  paragraphs.push("Semesterår och intjänande enligt semesterlagen om inte kollektivavtal säger annat. Semester förläggs efter samråd; huvudsemestern omfattar minst fyra veckor under juni–augusti om inte annat avtalats.");
  return { heading: "Semester", rows, paragraphs };
}

function savaInformation(clocks: ClockRow | null | undefined): ContractSection {
  const paragraphs = [
    "Det här är skriftlig information om att anställningen är en särskild visstidsanställning (SÄVA) enligt lagen om anställningsskydd.",
    "En särskild visstidsanställning övergår i en tillsvidareanställning när arbetstagaren har varit anställd hos arbetsgivaren i särskild visstidsanställning i sammanlagt mer än tolv månader under en femårsperiod (LAS 5 a §). Har arbetstagaren haft tre eller fler särskilda visstidsanställningar under samma kalendermånad räknas också tiden mellan dem som anställningstid (LAS 3 §).",
    "Arbetsgivaren räknar tiden i personalregistret, månad för månad, och lämnar på begäran besked om hur mycket tid som är intjänad.",
    "Den som har varit anställd i särskild visstidsanställning hos arbetsgivaren i mer än nio månader under de senaste tre åren har företrädesrätt till återanställning (LAS 25 §), om arbetstagaren anmäler anspråk på det.",
  ];
  if (clocks) {
    paragraphs.push(
      `När avtalet skrevs var den räknade tiden i särskild visstidsanställning ${clocks.sava_days} av ${clocks.sava_limit} dagar under de senaste fem åren` +
        (clocks.sava_converts_on ? `; med bokade perioder övergår anställningen i en tillsvidareanställning ${clocks.sava_converts_on}.` : ".")
    );
  }
  return { heading: "Information om särskild visstidsanställning", paragraphs };
}

/** The contract for a board assignment: an agreement about the arvode, not an employment. */
function boardContract(input: ContractInput): ContractContent {
  const { employer, employee, employment: e } = input;
  const sections: ContractSection[] = [
    partiesSection(input, "Bolaget", "Styrelseledamot"),
    {
      heading: "Uppdraget",
      rows: [
        ["Uppdrag", e.title || "Ledamot i styrelsen"],
        ["Från", e.startsOn],
        ...(e.endsOn ? ([["Till", e.endsOn]] as [string, string][]) : []),
        ["Stämmans beslut", e.decisionReference || "–"],
      ],
      paragraphs: [
        `Ledamoten är vald av bolagsstämman i ${employer.name}. Uppdraget gäller från stämmans beslut till slutet av den årsstämma då mandattiden går ut, om stämman inte beslutar annat. Ledamoten kan lämna uppdraget i förtid enligt aktiebolagslagen (8 kap. 14 §).`,
      ],
    },
    {
      heading: "Arvode",
      rows: payRows(e),
      paragraphs: [
        "Arvodet är beslutat av bolagsstämman och ändras bara genom ett nytt stämmobeslut.",
        "Arvodet är inkomst av tjänst. Bolaget gör skatteavdrag (30 procent när bolaget inte är ledamotens huvudarbetsgivare, annars enligt skattetabell eller Skatteverkets beslut om jämkning) och betalar arbetsgivaravgifter, och redovisar arvodet för ledamoten i arbetsgivardeklarationen. Arvodet betalas till ledamoten personligen och kan normalt inte faktureras från ledamotens eget bolag.",
      ],
    },
    {
      heading: "Villkor",
      paragraphs: [
        "Uppdraget är inte en anställning. Lagen om anställningsskydd, semesterlagen och sjuklönelagen gäller inte, och bolaget betalar ingen tjänstepension eller semesterersättning, om inte annat avtalats under Övriga villkor.",
        "Ledamoten har tystnadsplikt om bolagets förhållanden enligt aktiebolagslagen och detta avtal, även efter att uppdraget har upphört.",
      ],
    },
  ];
  if (e.terms.trim()) sections.push({ heading: "Övriga villkor", paragraphs: e.terms.trim().split(/\n{2,}/) });
  return {
    template: "contract-uppdrag",
    templateVersion: CONTRACT_TEMPLATE_VERSION,
    title: "Avtal om styrelseuppdrag",
    subtitle: `${employee.name} · arvode enligt stämmans beslut`,
    sections,
    signatures: { employer: `För ${employer.name}`, employee: "Styrelseledamot" },
    fileTitle: "Styrelseuppdrag",
  };
}

function partiesSection(input: ContractInput, employerLabel: string, employeeLabel: string): ContractSection {
  const { employer, employee, pnr12 } = input;
  return {
    heading: "Parter",
    rows: [
      [employerLabel, `${employer.name}${employer.orgNr ? `, org.nr ${employer.orgNr}` : ""}`],
      ["Adress", address(employer) || "–"],
      [employeeLabel, employee.name],
      ["Personnummer", pnr12 ? formatPnr(pnr12) : "–"],
      ["Adress", address(employee) || "–"],
    ],
  };
}

export function contractContent(input: ContractInput): ContractContent {
  const { employer, employee, employment: e } = input;
  if (e.form === "uppdrag") return boardContract(input);
  const agreement = employee.agreement;
  const sections: ContractSection[] = [
    partiesSection(input, "Arbetsgivare", "Arbetstagare"),
    formSection(e),
    {
      heading: "Arbetsplats och arbetsuppgifter",
      rows: [
        ["Befattning", e.title || "–"],
        ["Arbetsplats", e.workplace || "Arbetsgivarens arbetsplatser och byggarbetsplatser enligt arbetsgivarens anvisningar"],
      ],
      paragraphs: e.workplace ? [] : ["Arbetet utförs på olika platser; arbetsgivaren anger arbetsplatsen för varje uppdrag."],
    },
    workingTime(e, agreement),
    { heading: "Lön", rows: payRows(e), paragraphs: ["Lönen ses över enligt kollektivavtal eller, utan sådant, vid ett årligt lönesamtal. En ändrad lön bekräftas skriftligen."] },
    vacationSection(e),
    {
      heading: "Sjuklön",
      paragraphs: ["Sjuklön betalas enligt sjuklönelagen: 80 procent av lönen dag 1–14 med karensavdrag, och läkarintyg från dag 8."],
    },
    noticeSection(e, agreement),
    {
      heading: "Kompetensutveckling",
      paragraphs: [
        "Arbetstagaren har rätt till den utbildning som arbetsgivaren tillhandahåller för arbetet. Utbildning som arbetsgivaren är skyldig att ge enligt lag eller kollektivavtal, till exempel arbetsmiljö- och säkerhetsutbildning, är kostnadsfri för arbetstagaren och räknas som arbetstid.",
      ],
    },
    { heading: "Socialförsäkring, pension och försäkringar", paragraphs: [pensionLine(e)] },
    { heading: "Kollektivavtal", paragraphs: [agreementLine(agreement)] },
  ];
  if (e.form === "sava") sections.splice(2, 0, savaInformation(input.clocks));
  if (e.terms.trim()) sections.push({ heading: "Övriga villkor", paragraphs: e.terms.trim().split(/\n{2,}/) });
  return {
    template: `contract-${e.form}`,
    templateVersion: CONTRACT_TEMPLATE_VERSION,
    title: e.form === "vd" ? "Anställningsavtal för verkställande direktör" : "Anställningsavtal",
    subtitle: `${FORM_LABEL[e.form]} · ${employee.name}${e.version > 1 ? ` · version ${e.version} från ${e.validFrom}` : ""}`,
    sections,
    signatures: { employer: `För ${employer.name}${employer.signer ? `, ${employer.signer}` : ""}`, employee: "Arbetstagare" },
    fileTitle: "Anstallningsavtal",
  };
}
