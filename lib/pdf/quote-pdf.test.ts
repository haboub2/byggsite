import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { BLANK_QUOTE_TEXTS, type QuoteCompany } from "../quotes/profile";
import { emptyCustomer, emptyTerms, type Quote, type QuoteData } from "../quotes/schema";

const company: QuoteCompany = { legalName: "Testbolag AB", orgNr: "556677-8899", street: "Provgatan 1", postalCode: "411 01", city: "Göteborg", phoneDisplay: "031-12 34 56", email: "info@testbolag.se" };
const settings = { ...BLANK_QUOTE_TEXTS, fSkatt: true, vatNumber: "SE556677889901" };

function quote(patch: Partial<QuoteData> = {}): Quote {
  const data: QuoteData = {
    division: "bygg",
    title: "Renovering av badrum",
    intro: "Tack för att vi fick komma på hembesök.",
    customer: { ...emptyCustomer, type: "privat", name: "Anna Lindqvist", street: "Bräckevägen 12", postalCode: "417 03", city: "Göteborg", email: "anna@example.se" },
    items: [
      { id: "a", description: "Rivning och nytt tätskikt", qty: 1, unit: "kpl", unitPrice: 110_000, vatRate: 25, kind: "labor", section: "" },
      { id: "m", description: "Kakel och klinker", qty: 1, unit: "kpl", unitPrice: 58_000, vatRate: 25, kind: "material", section: "" },
    ],
    pricesInclVat: true,
    rot: true,
    deductionType: "rot",
    show: { process: true, band: false },
    rotPersons: [{ name: "Anna Lindqvist", personalNumber: "19850412-XXXX", personalNumberSealed: "x" }],
    validDays: 30,
    paymentDays: 30,
    priceType: "fast",
    standardTerms: "hantverkarformularet17",
    terms: { ...emptyTerms, payment: "30 % vid start, resten vid slutbesiktning." },
    date: "2026-10-15",
    leadId: null,
    cover: "none",
    ...patch,
  };
  return { id: "q1", orgId: null, number: 1042, status: "sent", created_at: "", updated_at: "", sent_at: "2026-10-15T10:00:00Z", sent_hash: null, acceptance: null, created_by: null, data };
}

/** @react-pdf is ESM only; load it as ESM and seed require's cache before QuotePdf loads (see invoice-pdf.test.ts). */
async function load() {
  const renderer = await import("@react-pdf/renderer");
  const require = createRequire(__filename);
  const path = require.resolve("@react-pdf/renderer");
  require.cache[path] ??= { id: path, filename: path, loaded: true, exports: renderer } as NodeJS.Module;
  return { renderToBuffer: renderer.renderToBuffer, ...(await import("./QuotePdf")) };
}

function texts(node: ReactNode): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return [];
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap(texts);
  if (!isValidElement(node)) return [];
  const el = node as ReactElement<{ children?: ReactNode }>;
  if (typeof el.type === "function") return texts((el.type as (p: unknown) => ReactNode)(el.props));
  if (el.type === "TEXT") return [texts(el.props.children).join("")];
  return texts(el.props.children);
}

async function textOf(q: Quote): Promise<string> {
  const { QuotePdf } = await load();
  return texts(createElement(QuotePdf, { quote: q, company, settings, logo: null })).join("\n");
}

async function render(name: string, q: Quote): Promise<Buffer> {
  const { QuotePdf, renderToBuffer } = await load();
  const pdf = await renderToBuffer(createElement(QuotePdf, { quote: q, company, settings, logo: null }) as Parameters<typeof renderToBuffer>[0]);
  if (process.env.INVOICE_PDF_OUT) writeFileSync(join(process.env.INVOICE_PDF_OUT, `${name}.pdf`), pdf);
  return pdf;
}

const pages = (pdf: Buffer) => pdf.toString("latin1").match(/\/Type \/Page\b(?!s)/g)?.length ?? 0;

test("a consumer's quote renders with the price incl. VAT first, ROT as preliminary, the ångerrätt and the ångerblankett on its own page", async () => {
  const q = quote();
  const pdf = await render("offert-privat", q);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pages(pdf) >= 2, "the blankett is a page of its own");
  const t = await textOf(q);
  assert.match(t, /Fast pris inkl\. moms\n168 000[ \u00a0]kr/);
  assert.match(t, /Efter ROT-avdrag, preliminärt\n135 000[ \u00a0]kr/);
  assert.match(t, /ROT-avdrag, preliminärt/);
  assert.match(t, /Att betala efter ROT, preliminärt/);
  assert.match(t, /Ångerrätt/);
  assert.match(t, /14 dagar/);
  assert.match(t, /Ångerblankett/);
  assert.match(t, /frånträder mitt\/vårt avtal/);
  assert.match(t, /Hantverkarformuläret 17/);
  assert.match(t, /Jag begär att arbetet påbörjas under ångerfristen/);
  assert.doesNotMatch(t, /19850412-1234/);
});

test("an approximate price says so with the 15 % rule; a business quote has no ångerrätt and shows the price excl. VAT", async () => {
  const approx = await textOf(quote({ priceType: "ungefarlig", rot: false }));
  assert.match(approx, /Ungefärligt pris inkl\. moms/);
  assert.match(approx, /15 procent/);
  const business = quote({ customer: { ...emptyCustomer, type: "foretag", name: "Lisa Berg", company: "Bygg Söder AB", orgNr: "556000-0000", street: "Gatan 1", postalCode: "411 01", city: "Göteborg" }, rot: false, pricesInclVat: false, standardTerms: "ab04", priceType: "lopande" });
  const pdf = await render("offert-foretag", business);
  // The same quote to a private person gets the ångerrätt card and the blankett page on top.
  const privat = await render("offert-privat-jamfor", quote({ rot: false, pricesInclVat: false, standardTerms: "ab04", priceType: "lopande" }));
  assert.ok(pages(privat) >= pages(pdf) + 1, `${pages(privat)} vs ${pages(pdf)}`);
  const t = await textOf(business);
  assert.match(t, /Uppskattad kostnad exkl\. moms/);
  assert.match(t, /Löpande räkning/);
  assert.match(t, /AB 04/);
  assert.doesNotMatch(t, /Ångerrätt/);
  assert.doesNotMatch(t, /Ångerblankett/);
});
