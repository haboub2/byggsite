import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import type { InvoicePdfProps } from "./InvoicePdf";
import { LOGO_DATA_URI } from "./logo";
import { invoiceDocumentSchema, newInvoiceDocument, type InvoiceDocument, type InvoiceLine } from "../core/documents/invoice";

const seller = {
  name: "Binaafy AB",
  orgNr: "559000-0000",
  vatNr: "SE559000000001",
  street: "Uppstigen 130",
  postalCode: "412 80",
  city: "Göteborg",
  countryCode: "SE",
  email: "faktura@example.se",
  phone: "031-123 45 67",
  fSkatt: true,
};

const buyer = (type: "privat" | "foretag" | "byggforetag") => ({
  name: type === "privat" ? "Anna Lindqvist" : "Bygg Söder AB",
  orgNr: type === "privat" ? "" : "556000-0000",
  vatNr: type === "privat" ? "" : "SE556000000001",
  street: "Bräckevägen 12",
  postalCode: "417 03",
  city: "Göteborg",
  countryCode: "SE",
  email: "kund@example.se",
  phone: "",
  type,
  customerId: null,
  reference: type === "privat" ? "" : "Lisa Berg",
});

const line = (n: number, patch: Partial<InvoiceLine> = {}): InvoiceLine => ({
  id: `l${n}`,
  description: `Rad ${n}`,
  quantity: 1,
  unit: "st",
  unitPriceOre: 15_000,
  vatCategory: "S",
  vatRate: 25,
  kind: "other",
  section: "",
  changeOrderId: null,
  ...patch,
});

function invoice(type: "privat" | "foretag" | "byggforetag", patch: (doc: InvoiceDocument) => void = () => {}): InvoiceDocument {
  const doc = newInvoiceDocument({ issueDate: "2026-10-10", seller, buyer: buyer(type), paymentMeans: { bankgiro: "5555-1234", termsDays: 30 } });
  doc.number = "10001";
  doc.paymentMeans.ocr = "1000175";
  doc.se.lateInterestText = "Dröjsmålsränta enligt räntelagen, referensräntan plus 8 procentenheter.";
  doc.lines = [line(1, { description: "Block", unitPriceOre: 15_000 }), line(2, { description: "Snickeri", quantity: 6, unit: "tim", unitPriceOre: 55_000, kind: "labor" })];
  patch(doc);
  return invoiceDocumentSchema.parse(doc);
}

const credit = () =>
  invoice("foretag", (doc) => {
    doc.kind = "credit";
    doc.number = "10002";
    doc.references.precedingInvoiceNumber = "10001";
  });

const rot = () =>
  invoice("privat", (doc) => {
    doc.number = "10005";
    doc.se.rot = {
      buyers: [{ name: "Anna Lindqvist", personalNumber: "19850412-XXXX", personalNumberSealed: "x", roomOre: null }],
      property: { kind: "fastighet", designation: "Göteborg Tolered 1:23" },
      deductionOre: null,
    };
  });

const reverseCharge = () =>
  invoice("byggforetag", (doc) => {
    doc.lines = doc.lines.map((l) => ({ ...l, vatCategory: "AE", vatRate: 0 }));
  });

const long = () =>
  invoice("foretag", (doc) => {
    doc.lines = Array.from({ length: 40 }, (_, i) => line(i + 1, { description: `Rad ${i + 1}, material och arbete` }));
  });

/**
 * @react-pdf is ESM only, with import-only package exports, and the tests run
 * as CommonJS under tsx, where InvoicePdf's static import becomes a require
 * that cannot resolve them. Import the renderer as ESM and put that module in
 * require's cache before InvoicePdf loads.
 */
async function load() {
  const renderer = await import("@react-pdf/renderer");
  const require = createRequire(__filename);
  const path = require.resolve("@react-pdf/renderer");
  require.cache[path] ??= { id: path, filename: path, loaded: true, exports: renderer } as NodeJS.Module;
  return { renderToBuffer: renderer.renderToBuffer, ...(await import("./InvoicePdf")) };
}

const props = (document: InvoiceDocument): InvoicePdfProps => ({ document, signer: "Ibrahim Al Haboub" });

/** Every string the element tree prints, function components expanded. */
function texts(node: ReactNode): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return [];
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap(texts);
  if (!isValidElement(node)) return [];
  const el = node as ReactElement<{ children?: ReactNode }>;
  if (typeof el.type === "function") return texts((el.type as (p: unknown) => ReactNode)(el.props));
  // One <Text> is one string, however its children are split.
  if (el.type === "TEXT") return [texts(el.props.children).join("")];
  return texts(el.props.children);
}

async function textOf(document: InvoiceDocument): Promise<string> {
  const { InvoicePdf } = await load();
  return texts(createElement(InvoicePdf, props(document))).join("\n");
}

async function render(name: string, document: InvoiceDocument, extra: Partial<InvoicePdfProps> = {}): Promise<Buffer> {
  const { InvoicePdf, renderToBuffer } = await load();
  const pdf = await renderToBuffer(createElement(InvoicePdf, { ...props(document), ...extra }) as Parameters<typeof renderToBuffer>[0]);
  // INVOICE_PDF_OUT=<dir> keeps the files for a look at the layout.
  if (process.env.INVOICE_PDF_OUT) writeFileSync(join(process.env.INVOICE_PDF_OUT, `${name}.pdf`), pdf);
  return pdf;
}

const pages = (pdf: Buffer) => pdf.toString("latin1").match(/\/Type \/Page\b(?!s)/g)?.length ?? 0;

// A 1×1 PNG standing in for Swish's QR code.
const QR = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

test("invoice, credit note, ROT and reverse charge render to a one-page PDF", async () => {
  const swish = invoice("privat", (doc) => {
    doc.paymentMeans.swish = "123 456 78 90";
  });
  for (const [name, doc, extra] of [
    ["faktura", invoice("foretag"), {}],
    ["kredit", credit(), {}],
    ["rot", rot(), {}],
    ["omvand", reverseCharge(), {}],
    ["logo-swish", swish, { logo: LOGO_DATA_URI, swishQr: QR }],
  ] as const) {
    const pdf = await render(name, doc, extra);
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-", name);
    assert.equal(pages(pdf), 1, name);
  }
});

test("an invoice prints the amount to pay with bankgiro and OCR", async () => {
  const t = await textOf(invoice("foretag"));
  assert.match(t, /^Faktura$/m);
  assert.match(t, /ATT BETALA/);
  assert.match(t, /Betalas till bankgiro 5555-1234, ange OCR 1000175/);
  assert.match(t, /^4 313,00$/m); // 150 + 6 × 550 = 3 450 net + 862,50 VAT, rounded up 0,50
  assert.match(t, /Moms 25 % 862,50 \(3 450,00\)/);
  assert.match(t, /Enligt räntelagen, referensränta \+ 8 %/);
  assert.match(t, /Godkänd för F-skatt/);
  assert.doesNotMatch(t, /ROT-avdrag/);
});

test("a credit note has its own heading, negative amounts and no OCR", async () => {
  const t = await textOf(credit());
  assert.match(t, /^Kreditfaktura$/m);
  assert.match(t, /Krediterar faktura 10001/);
  assert.match(t, /ATT BETALA/);
  assert.match(t, /^-4 313,00$/m);
  assert.doesNotMatch(t, /OCR/);
});

test("a ROT invoice shows the deduction before the amount to pay", async () => {
  const t = await textOf(rot());
  assert.match(t, /^ROT-avdrag$/m);
  assert.match(t, /Skatteverkets godkännande/);
  assert.match(t, /19850412-XXXX/);
  assert.match(t, /Göteborg Tolered 1:23/);
  assert.match(t, /ange OCR 1000175/);
});

test("reverse charge prints the sentence and the buyer's VAT number, with no VAT", async () => {
  const t = await textOf(reverseCharge());
  assert.match(t, /Omvänd betalningsskyldighet för byggtjänster gäller/);
  assert.match(t, /SE556000000001/);
  assert.match(t, /Omvänd moms 0,00 \(3 450,00\)/);
});

test("40 lines continue on a second page", async () => {
  assert.equal(pages(await render("lang", long())), 2);
});

test("late interest reads as a value in the terms column", async () => {
  const { lateInterestValue } = await load();
  assert.equal(lateInterestValue(""), "Enligt räntelagen");
  assert.equal(lateInterestValue("Dröjsmålsränta enligt räntelagen, referensräntan plus 8 procentenheter."), "Enligt räntelagen, referensränta + 8 %");
  assert.equal(lateInterestValue("10 %"), "10 %");
});
