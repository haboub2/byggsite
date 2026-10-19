/**
 * Skatteverket's "Begäran om utbetalning" for ROT as XML, schema version 6
 * (Begaran.xsd + BegaranCOMPONENT.xsd, namespaces below). The file is
 * uploaded in the e-service "Rot och rut – företag"; there is no API.
 *
 * Facts from the schema, checked 2026-10-19:
 *  - amounts are whole kronor (xs:long), never öre
 *  - the buyer is a 12-digit personal number
 *  - PrisForArbete = labour cost incl. VAT (min 2), BetaltBelopp = what the
 *    buyer paid for the labour, BegartBelopp = the deduction claimed
 *  - a property is Fastighetsbeteckning (max 40) OR LagenhetsNr + BrfOrgNr
 *  - UtfortArbete lists hours and material cost per category (Bygg, El,
 *    GlasPlatarbete, MarkDraneringarbete, Murning, MalningTapetsering, Vvs);
 *    when hours or material are given, Ovrigkostnad must be given too
 *  - one file holds ROT only (RotBegaran); RUT is a separate file
 *  - NamnPaBegaran is at most 16 characters
 */

export const ROT_CATEGORIES = ["Bygg", "El", "GlasPlatarbete", "MarkDraneringarbete", "Murning", "MalningTapetsering", "Vvs"] as const;
export type RotCategory = (typeof ROT_CATEGORIES)[number];
export const ROT_CATEGORY_LABEL: Record<RotCategory, string> = {
  Bygg: "Bygg",
  El: "El",
  GlasPlatarbete: "Glas och plåt",
  MarkDraneringarbete: "Mark och dränering",
  Murning: "Murning",
  MalningTapetsering: "Målning och tapetsering",
  Vvs: "VVS",
};

export const BEGARAN_NS = "http://xmls.skatteverket.se/se/skatteverket/ht/begaran/6.0";
export const KOMPONENT_NS = "http://xmls.skatteverket.se/se/skatteverket/ht/komponent/begaran/6.0";

export type RotClaimXmlItem = {
  /** 12 digits, see toTwelveDigitPersonalNumber. */
  personalNumber: string;
  /** The day the buyer paid, YYYY-MM-DD. */
  paidOn: string;
  /** Labour cost incl. VAT, kronor. */
  workPriceKr: number;
  /** What the buyer paid for the labour, kronor (workPrice − requested). */
  paidKr: number;
  /** The deduction claimed, kronor. */
  requestedKr: number;
  invoiceNumber: string;
  property: { kind: "fastighet"; designation: string } | { kind: "brf"; orgNr: string; apartmentNumber: string };
  work: { category: RotCategory; hours: number | null; materialKr: number }[];
  /** Other costs (travel, machines …), kronor. Required when work lines carry hours or material. */
  otherCostKr: number;
};

export type RotClaimXml = {
  /** "Ditt namn på begäran", max 16 chars. */
  name: string;
  items: RotClaimXmlItem[];
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
const int = (n: number, label: string) => {
  if (!Number.isInteger(n)) throw new RangeError(`${label} måste vara hela kronor, fick ${n}.`);
  return String(n);
};

/**
 * "850412-1234" or "8504121234" → "198504121234". The century is chosen so
 * the person is between 18 and 118 years old at `today` (Skatteverket
 * rejects buyers under 18). Already 12 digits: returned as is.
 */
export function toTwelveDigitPersonalNumber(input: string, today: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 12) return digits;
  if (digits.length !== 10) throw new RangeError(`Personnummer måste ha 10 eller 12 siffror, fick "${input}".`);
  const yy = Number(digits.slice(0, 2));
  const year = Number(today.slice(0, 4));
  const thisCentury = Math.floor(year / 100) * 100;
  const candidate = thisCentury + yy;
  const century = year - candidate >= 18 ? thisCentury : thisCentury - 100;
  return `${century + yy}${digits.slice(2)}`;
}

export function validateRotClaim(claim: RotClaimXml): string[] {
  const errors: string[] = [];
  if (!claim.name.trim() || claim.name.length > 16) errors.push("Namnet på begäran ska vara 1–16 tecken.");
  if (claim.items.length === 0) errors.push("Begäran behöver minst ett ärende.");
  if (claim.items.length > 100) errors.push("Högst 100 köpare per fil.");
  claim.items.forEach((it, i) => {
    const who = `Ärende ${i + 1} (faktura ${it.invoiceNumber || "?"})`;
    if (!/^\d{12}$/.test(it.personalNumber)) errors.push(`${who}: personnumret ska ha 12 siffror.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(it.paidOn) || it.paidOn < "2009-07-01") errors.push(`${who}: betaldatum saknas.`);
    if (it.workPriceKr < 2) errors.push(`${who}: arbetskostnaden måste vara minst 2 kr.`);
    if (it.requestedKr < 0 || it.paidKr < 0) errors.push(`${who}: belopp kan inte vara negativa.`);
    if (it.requestedKr + it.paidKr > it.workPriceKr) errors.push(`${who}: begärt plus betalt överstiger arbetskostnaden.`);
    if (it.invoiceNumber.length > 20) errors.push(`${who}: fakturanumret får vara högst 20 tecken.`);
    if (it.property.kind === "fastighet") {
      if (!it.property.designation.trim() || it.property.designation.length > 40) errors.push(`${who}: fastighetsbeteckning saknas eller är för lång (max 40).`);
    } else {
      if (!/^[\d-]{0,12}$/.test(it.property.orgNr)) errors.push(`${who}: föreningens organisationsnummer får bara ha siffror och bindestreck.`);
      if (!it.property.apartmentNumber.trim() || it.property.apartmentNumber.length > 25) errors.push(`${who}: lägenhetsnummer saknas.`);
    }
    for (const w of it.work) {
      if (w.hours !== null && (w.hours < 0 || w.hours > 999)) errors.push(`${who}: timmar ska vara 0–999.`);
      if (w.materialKr < 0 || w.materialKr > 9_999_999) errors.push(`${who}: materialkostnaden är utanför tillåtet intervall.`);
    }
    if (it.otherCostKr < 0 || it.otherCostKr > 9_999_999) errors.push(`${who}: övrig kostnad är utanför tillåtet intervall.`);
  });
  return errors;
}

/** The XML document. Throws on validation errors; validate first to show them. */
export function renderRotClaimXml(claim: RotClaimXml): string {
  const errors = validateRotClaim(claim);
  if (errors.length) throw new Error(errors.join(" "));
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push(`<Begaran xmlns="${BEGARAN_NS}" xmlns:htko="${KOMPONENT_NS}">`);
  out.push(`  <NamnPaBegaran>${esc(claim.name)}</NamnPaBegaran>`);
  out.push("  <RotBegaran>");
  for (const it of claim.items) {
    out.push("    <Arenden>");
    out.push(`      <Kopare>${it.personalNumber}</Kopare>`);
    out.push(`      <BetalningsDatum>${it.paidOn}</BetalningsDatum>`);
    out.push(`      <PrisForArbete>${int(it.workPriceKr, "Pris för arbete")}</PrisForArbete>`);
    out.push(`      <BetaltBelopp>${int(it.paidKr, "Betalt belopp")}</BetaltBelopp>`);
    out.push(`      <BegartBelopp>${int(it.requestedKr, "Begärt belopp")}</BegartBelopp>`);
    if (it.invoiceNumber) out.push(`      <FakturaNr>${esc(it.invoiceNumber)}</FakturaNr>`);
    const hasWork = it.work.some((w) => w.hours !== null || w.materialKr > 0);
    if (hasWork || it.otherCostKr > 0) out.push(`      <Ovrigkostnad>${int(it.otherCostKr, "Övrig kostnad")}</Ovrigkostnad>`);
    if (it.property.kind === "fastighet") {
      out.push(`      <Fastighetsbeteckning>${esc(it.property.designation.trim())}</Fastighetsbeteckning>`);
    } else {
      out.push(`      <LagenhetsNr>${esc(it.property.apartmentNumber.trim())}</LagenhetsNr>`);
      out.push(`      <BrfOrgNr>${esc(it.property.orgNr)}</BrfOrgNr>`);
    }
    if (it.work.length > 0) {
      out.push("      <UtfortArbete>");
      // The schema fixes the category order.
      for (const cat of ROT_CATEGORIES) {
        const w = it.work.find((x) => x.category === cat);
        if (!w) continue;
        out.push(`        <${cat}>`);
        if (w.hours !== null) out.push(`          <AntalTimmar>${int(w.hours, "Antal timmar")}</AntalTimmar>`);
        out.push(`          <Materialkostnad>${int(w.materialKr, "Materialkostnad")}</Materialkostnad>`);
        out.push(`        </${cat}>`);
      }
      out.push("      </UtfortArbete>");
    }
    out.push("    </Arenden>");
  }
  out.push("  </RotBegaran>");
  out.push("</Begaran>");
  return out.join("\n") + "\n";
}

/** File name Skatteverket's e-service accepts: letters, digits, dash. */
export function rotClaimFileName(name: string, date: string): string {
  const safe = name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "rot";
  return `rot-begaran-${safe}-${date}.xml`;
}
