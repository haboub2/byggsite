import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceDocumentSchema, newInvoiceDocument, type InvoiceDocument, type InvoiceLine } from "../documents/invoice";
import type { InvoiceRecord } from "../invoices/store";
import { invoiceTotals } from "../invoices/totals";
import { orgSettingsSchema } from "../org/settings";
import { ocrFor } from "../ocr";
import { readStoredZip } from "../../zip";
import { invoiceFileName } from "../../pdf/invoice-file-name";
import { buildInvoiceArchive } from "./archive";
import { CSV_BOM, csvAmount, csvField, csvText, customersCsv, fileSlug, invoicesCsv, paymentsCsv } from "./csv";
import { buildJsonExport, EXPORT_SCHEMA_VERSION, serializeJsonExport } from "./json";
import { inRange, parseDateRange, type ExportCustomer, type ExportData, type ExportPayment } from "./model";

/* ---------- an organisation in memory, issued the way the demo store issues ---------- */

const seller = { name: "Binaafy AB", orgNr: "559000-0000", vatNr: "SE559000000001", street: "Uppstigen 130", postalCode: "412 80", city: "Göteborg", countryCode: "SE", email: "faktura@example.se", phone: "", fSkatt: true };
const anna = { name: "Anna Lindqvist", orgNr: "", vatNr: "", street: "Bräckevägen 12", postalCode: "417 03", city: "Göteborg", countryCode: "SE", email: "anna@example.se", phone: "", type: "privat" as const, customerId: "00000000-0000-4000-8000-0000000000a1", reference: "" };
const bolag = { ...anna, name: 'Bygg; "Söder" AB', orgNr: "556677-8899", type: "foretag" as const, customerId: "00000000-0000-4000-8000-0000000000b2" };

let lineSeq = 0;
const line = (patch: Partial<InvoiceLine>): InvoiceLine => ({
  id: `rad-${++lineSeq}`,
  description: "Rad",
  quantity: 1,
  unit: "st",
  unitPriceOre: 0,
  vatCategory: "S",
  vatRate: 25,
  kind: "other",
  section: "",
  changeOrderId: null,
  ...patch,
});

let seq = 10001;
function invoice(buyer: Omit<typeof anna, "type"> & { type: "privat" | "foretag" }, issueDate: string, lines: InvoiceLine[], opts: { draft?: boolean; credit?: boolean; rot?: boolean; paidOre?: number } = {}): InvoiceRecord {
  const doc: InvoiceDocument = newInvoiceDocument({ issueDate, seller, buyer, paymentMeans: { bankgiro: "5555-1234", termsDays: 14 } });
  doc.lines = lines;
  if (opts.credit) doc.kind = "credit";
  if (opts.rot) doc.se.rot = { buyers: [{ name: buyer.name, personalNumber: "850412-1234", roomOre: null }], property: { kind: "fastighet", designation: "Göteborg Tolered 1:23" }, deductionOre: null };
  const parsed = invoiceDocumentSchema.parse(doc);
  const t = invoiceTotals(parsed);
  const number = opts.draft ? null : String(seq++);
  const ocr = number ? ocrFor(number) : null;
  const paid = opts.paidOre ?? 0;
  return {
    id: `inv-${number ?? "utkast"}`,
    orgId: "demo",
    series: "F",
    number,
    kind: parsed.kind,
    status: opts.draft ? "draft" : opts.credit ? "issued" : paid >= t.payable ? "paid" : paid > 0 ? "partially_paid" : "issued",
    customerId: buyer.customerId,
    quoteId: null,
    projectId: null,
    creditsInvoiceId: null,
    document: number ? { ...parsed, number, paymentMeans: { ...parsed.paymentMeans, ocr } } : parsed,
    totalOre: t.gross,
    vatOre: t.vat,
    rotOre: t.rot?.deduction ?? 0,
    payableOre: t.payable,
    paidOre: paid,
    issuedOn: opts.draft ? null : issueDate,
    dueOn: parsed.dueDate,
    ocr,
    sha256: number ? "ab".repeat(32) : null,
    sentAt: null,
    paidAt: null,
    remindedAt: null,
    reminders: 0,
    publicToken: "secret-token",
    createdBy: "ibrahim@example.se",
    createdAt: `${issueDate}T08:00:00.000Z`,
    updatedAt: `${issueDate}T08:00:00.000Z`,
  };
}

function demoOrg() {
  seq = 10001;
  lineSeq = 0;
  const badrum = invoice(anna, "2026-10-10", [
    line({ description: "Rivning", quantity: 12, unit: "tim", unitPriceOre: 50_000, kind: "labor" }),
    line({ description: "Kakel", unitPriceOre: 2_092_000, kind: "material" }),
  ], { rot: true });
  const kontor = invoice(bolag, "2026-09-02", [line({ description: "Målning", unitPriceOre: 1_000_050 })], { paidOre: 1_250_000 });
  const kredit = invoice(bolag, "2026-09-20", [line({ description: "Kreditering", unitPriceOre: 1_000_000 })], { credit: true });
  const utkast = invoice(anna, "2026-10-18", [line({ unitPriceOre: 100 })], { draft: true });
  const invoices = [utkast, badrum, kontor, kredit];
  const customers: ExportCustomer[] = [
    { id: "00000000-0000-4000-8000-0000000000a1", type: "privat", name: "Anna Lindqvist", company: "", orgNr: "", vatNr: "", email: "anna@example.se", phone: "+46 70 123 45 67", street: "Bräckevägen 12", postalCode: "417 03", city: "Göteborg", reference: "", peppolId: "", defaultTermsDays: 14, notes: 'Ringer "efter" lunch;\nportkod 1234', createdAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-01T10:00:00.000Z", deletedAt: null },
    { id: "00000000-0000-4000-8000-0000000000b2", type: "foretag", name: '=HYPERLINK("http://x")', company: 'Bygg; "Söder" AB', orgNr: "556677-8899", vatNr: "", email: "", phone: "", street: "", postalCode: "", city: "", reference: "", peppolId: "", defaultTermsDays: 30, notes: "", createdAt: "2026-09-01T22:30:00.000Z", updatedAt: "2026-09-01T22:30:00.000Z", deletedAt: "2026-10-01T09:00:00.000Z" },
  ];
  const payments: ExportPayment[] = [
    { id: "p2", amountOre: 1_250_000, currency: "SEK", method: "bankgiro", paidOn: "2026-09-30", reference: kontor.ocr!, note: "", bankTransactionId: null, createdBy: null, createdAt: "2026-09-30T12:00:00.000Z", allocations: [{ invoiceId: kontor.id, amountOre: 1_250_000 }] },
    { id: "p1", amountOre: -5, currency: "SEK", method: "manual", paidOn: "2026-09-05", reference: "", note: "Återbetalt; öresavrundning", bankTransactionId: null, createdBy: null, createdAt: "2026-09-05T12:00:00.000Z", allocations: [] },
  ];
  return { invoices, customers, payments, badrum, kontor, kredit, utkast };
}

/* ---------- CSV ---------- */

test("csv amounts are exact kronor with a decimal comma", () => {
  assert.equal(csvAmount(123_456), "1234,56");
  assert.equal(csvAmount(100), "1,00");
  assert.equal(csvAmount(5), "0,05");
  assert.equal(csvAmount(-5), "-0,05");
  assert.equal(csvAmount(-1_000_000), "-10000,00");
  assert.equal(csvAmount(0), "0,00");
  assert.equal(csvAmount(900_719_925_474_099), "9007199254740,99");
});

test("csv fields are quoted for semicolons, quotes, line breaks and edge spaces", () => {
  assert.equal(csvField("enkel"), "enkel");
  assert.equal(csvField("a;b"), '"a;b"');
  assert.equal(csvField('säger "hej"'), '"säger ""hej"""');
  assert.equal(csvField("rad 1\nrad 2"), '"rad 1\nrad 2"');
  assert.equal(csvField(" kant"), '" kant"');
  assert.equal(csvField("1234,56"), "1234,56");
});

test("csv text that Excel would run as a formula gets an apostrophe; phone numbers do not", () => {
  assert.equal(csvText("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(csvText("@cmd"), "'@cmd");
  assert.equal(csvText("+1+1"), "'+1+1");
  assert.equal(csvText("-2*3"), "'-2*3");
  assert.equal(csvText("+46 70 123 45 67"), "+46 70 123 45 67");
  assert.equal(csvText("Anna"), "Anna");
  assert.equal(csvText(null), "");
});

test("customers csv: BOM, semicolons, CRLF, escaping, removed customers dated", () => {
  const { customers } = demoOrg();
  const csv = customersCsv(customers);
  assert.ok(csv.startsWith(CSV_BOM), "starts with the UTF-8 BOM");
  assert.ok(csv.endsWith("\r\n"));
  const lines = csv.slice(1).split("\r\n");
  assert.equal(lines[0].split(";")[0], "Namn");
  assert.ok(lines[0].includes(";Organisationsnummer;"));
  // Sorted by name: "=HYPERLINK" sorts before "Anna" and is defused.
  assert.ok(lines[1].startsWith(`"'=HYPERLINK(""http://x"")";"Bygg; ""Söder"" AB";Företag;556677-8899;`), lines[1]);
  assert.ok(lines[1].includes(";2026-09-02;2026-10-01;00000000-0000-4000-8000-0000000000b2"), "created date in Swedish time, removed date, id");
  assert.ok(csv.includes('"Ringer ""efter"" lunch;\r\nportkod 1234"') || csv.includes('"Ringer ""efter"" lunch;\nportkod 1234"'));
});

test("invoices csv: issued invoices and credit notes by number, no drafts, net, VAT, ROT", () => {
  const { invoices, badrum } = demoOrg();
  const csv = invoicesCsv(invoices);
  const lines = csv.slice(1).trimEnd().split("\r\n");
  assert.deepEqual(lines[0].split(";").slice(0, 15), ["Fakturanummer", "Typ", "Fakturadatum", "Förfallodag", "Kund", "Organisationsnummer", "Netto", "Moms", "Totalt", "ROT-avdrag", "Att betala", "Betalt", "Kvar", "Status", "OCR"]);
  assert.equal(lines.length, 4, "header and three issued, the draft left out");
  assert.deepEqual(lines.slice(1).map((l) => l.split(";")[0]), ["10001", "10002", "10003"]);
  const first = lines[1].split(";");
  assert.equal(first[1], "Faktura");
  assert.equal(first[2], "2026-10-10");
  assert.equal(first[6], csvAmount(badrum.totalOre - badrum.vatOre));
  assert.equal(first[7], csvAmount(badrum.vatOre));
  assert.equal(first[9], csvAmount(badrum.rotOre));
  assert.ok(badrum.rotOre > 0);
  assert.equal(first[10], csvAmount(badrum.payableOre));
  assert.equal(first[13], "Utfärdad");
  assert.equal(first[14], badrum.ocr);
  // The company's name has a semicolon and quotes: one quoted field.
  assert.ok(lines[2].includes(';"Bygg; ""Söder"" AB";556677-8899;'));
  assert.ok(lines[3].startsWith("10003;Kreditfaktura;"));
  assert.ok(lines[3].includes(";-10000,00;"), "credit note amounts are negative");
  assert.equal(lines[3].split(";")[12], "0,00", "a credit note is never open");
});

test("invoices csv filters on the invoice date", () => {
  const { invoices } = demoOrg();
  const csv = invoicesCsv(invoices, { from: "2026-10-01" });
  assert.deepEqual(csv.slice(1).trimEnd().split("\r\n").slice(1).map((l) => l.split(";")[0]), ["10001"]);
  const none = invoicesCsv(invoices, { from: "2027-01-01" });
  assert.equal(none.slice(1).trimEnd().split("\r\n").length, 1, "only the header");
});

test("payments csv: one line per invoice paid, refunds negative, the source in Swedish", () => {
  const { invoices, payments, kontor } = demoOrg();
  const lines = paymentsCsv(payments, invoices).slice(1).trimEnd().split("\r\n");
  assert.deepEqual(lines[0].split(";").slice(0, 5), ["Betaldatum", "Fakturanummer", "Kund", "Belopp", "Källa"]);
  assert.equal(lines.length, 3);
  assert.ok(lines[1].startsWith('2026-09-05;;;-0,05;Manuell;;"Återbetalt; öresavrundning";SEK;p1;'), lines[1]);
  assert.ok(lines[2].startsWith(`2026-09-30;${kontor.number};"Bygg; ""Söder"" AB";12500,00;Bankgiro;${kontor.ocr};`), lines[2]);
  const october = paymentsCsv(payments, invoices, { from: "2026-09-10", to: "2026-09-30" }).slice(1).trimEnd().split("\r\n");
  assert.equal(october.length, 2);
});

test("date range from the query string ignores what is not a date", () => {
  const q = (s: string) => new URLSearchParams(s);
  assert.deepEqual(parseDateRange(q("fran=2026-01-01&till=2026-12-31")), { from: "2026-01-01", to: "2026-12-31" });
  assert.deepEqual(parseDateRange(q("fran=&till=igår")), { from: undefined, to: undefined });
  assert.equal(inRange("2026-05-05T10:00:00Z", { from: "2026-05-05" }), true);
  assert.equal(inRange(null, { from: "2026-05-05" }), false);
  assert.equal(inRange(null, {}), true);
  assert.equal(fileSlug("Binaafy AB"), "binaafy-ab");
  assert.equal(fileSlug("Åkes Bygg & Måleri"), "akes-bygg-maleri");
});

/* ---------- PDF archive ---------- */

test("the archive holds every issued invoice as a PDF named like the e-mail, and index.csv", async () => {
  const { invoices } = demoOrg();
  let rendering = 0;
  let most = 0;
  const { zip, files } = await buildInvoiceArchive(
    invoices,
    async (inv) => {
      most = Math.max(most, ++rendering);
      await new Promise((r) => setTimeout(r, 5));
      rendering--;
      return new TextEncoder().encode(`%PDF-1.4 ${inv.number}`);
    },
    { concurrency: 2 }
  );
  assert.equal(most, 2, "renders in a pool");
  const entries = readStoredZip(zip);
  assert.deepEqual(
    entries.map((e) => e.name),
    ["index.csv", "Faktura-10001-Binaafy-AB-Anna-Lindqvist.pdf", "Faktura-10002-Binaafy-AB-Bygg-Soder-AB.pdf", "Kreditfaktura-10003-Binaafy-AB-Bygg-Soder-AB.pdf"]
  );
  assert.deepEqual(files, entries.map((e) => e.name));
  assert.ok(entries.every((e) => e.crcOk));
  assert.equal(entries[1].data.toString(), "%PDF-1.4 10001");
  const index = entries[0].data.toString("utf8");
  assert.ok(index.startsWith(`${CSV_BOM}Fil;Fakturanummer;`));
  assert.ok(index.includes("\r\nKreditfaktura-10003-Binaafy-AB-Bygg-Soder-AB.pdf;10003;Kreditfaktura;"));
  assert.ok(!index.includes("utkast"));
});

test("an invoice's file is named after its own seller, not the website's brand", () => {
  const doc = (sellerName: string) => ({ seller: { name: sellerName }, buyer: { name: "Åsa Öberg" } });
  assert.equal(invoiceFileName({ kind: "invoice", number: "1", document: doc("Testbolag AB") }), "Faktura-1-Testbolag-AB-Asa-Oberg.pdf");
  assert.equal(invoiceFileName({ kind: "credit", number: "2", document: doc("Testbolag AB") }), "Kreditfaktura-2-Testbolag-AB-Asa-Oberg.pdf");
  assert.equal(invoiceFileName({ kind: "invoice", number: null, document: doc("") }), "Faktura-utkast-Asa-Oberg.pdf");
});

/* ---------- JSON ---------- */

function exportData(): ExportData {
  const { invoices, customers, payments, badrum } = demoOrg();
  return {
    org: { id: "org-1", name: "Binaafy AB", orgNr: "559000-0000", slug: "binaafy" },
    settings: orgSettingsSchema.parse({}),
    numberSeries: [{ series: "V", perYear: true, start: 1, pad: 0, next: 12 }, { series: "F", perYear: false, start: 10001, pad: 0, next: 10004 }],
    accounts: [{ number: "3001", name: "Försäljning 25 %", active: true }, { number: "1510", name: "Kundfordringar", active: true }],
    customers,
    invoices,
    payments,
    journal: [{ id: "j1", series: "V", fiscalYear: 2026, number: 1, date: "2026-10-10", text: "Faktura 10001", sourceType: "invoice", sourceId: badrum.id, reversedBy: null, createdAt: "2026-10-10T08:00:00.000Z", lines: [{ account: "1510", debit: badrum.payableOre, credit: 0, text: null }] }],
    periodLocks: [{ periodStart: "2026-08-01", periodEnd: "2026-08-31", lockedBy: "ibrahim", lockedAt: "2026-09-02T10:00:00.000Z" }],
    reminders: [],
    recurring: [],
    paymentPlans: [{ id: "plan", projectId: "proj", quoteId: null, kind: "fixed", createdAt: "2026-09-01T10:00:00.000Z", steps: [{ id: "s2", planId: "plan", sort: 1, label: "Resten", phaseId: null, percent: 70, amountOre: null, laborShare: null, dueRule: "on_completion", dueOn: null, invoiceId: null, createdAt: "2026-09-01T10:00:00.000Z" }, { id: "s1", planId: "plan", sort: 0, label: "30 % vid start", phaseId: null, percent: 30, amountOre: null, laborShare: null, dueRule: "on_start", dueOn: null, invoiceId: badrum.id, createdAt: "2026-09-01T10:00:00.000Z" }] }],
    rotClaims: [],
    bankTransactions: [],
    events: [
      { id: "e2", aggregateType: "invoice", aggregateId: badrum.id, type: "invoice.issued", data: { number: "10001" }, actor: { kind: "system", name: "system" }, at: "2026-10-10T08:01:00.000Z" },
      { id: "e1", aggregateType: "invoice", aggregateId: badrum.id, type: "invoice.created", data: {}, actor: { kind: "system", name: "system" }, at: "2026-10-10T08:00:00.000Z" },
    ],
  };
}

test("json export: top level, öre as integers, full documents, sorted and stable", () => {
  const data = exportData();
  const json = buildJsonExport(data, "2026-10-20T12:00:00.000Z");
  assert.equal(json.schemaVersion, EXPORT_SCHEMA_VERSION);
  assert.equal(json.schemaVersion, 1);
  assert.equal(json.exportedAt, "2026-10-20T12:00:00.000Z");
  assert.deepEqual(Object.keys(json), ["exportedAt", "schemaVersion", "format", "org", "customers", "invoices", "payments", "journal", "reminders", "recurringInvoices", "paymentPlans", "rotClaims", "bankTransactions", "events"]);
  assert.equal(json.org.name, "Binaafy AB");
  assert.deepEqual(json.org.numberSeries.map((s) => s.series), ["F", "V"]);
  assert.equal(json.org.settings.fiscalYearStart, "01-01");

  assert.deepEqual(json.invoices.map((i) => i.number), ["10001", "10002", "10003", null], "numbered first, drafts last");
  const badrum = json.invoices[0];
  assert.ok(Number.isInteger(badrum.totalOre) && Number.isInteger(badrum.payableOre) && Number.isInteger(badrum.rotOre));
  assert.equal(badrum.document.lines.length, 2);
  assert.equal(badrum.document.se.rot?.property?.kind, "fastighet");
  assert.equal(badrum.document.number, "10001");
  assert.ok(!("publicToken" in badrum), "the public link's token is not exported");

  assert.equal(json.customers.length, 2, "removed customers too");
  assert.equal(json.customers[1].deletedAt, "2026-10-01T09:00:00.000Z");
  assert.deepEqual(json.payments.map((p) => p.id), ["p1", "p2"]);
  assert.equal(json.payments[1].allocations[0].invoiceNumber, "10002");
  assert.equal(json.payments[0].amountOre, -5);
  assert.deepEqual(json.journal[0].lines[0], { account: "1510", debitOre: data.invoices[1].payableOre, creditOre: 0, text: null });
  assert.deepEqual(json.paymentPlans[0].steps.map((s) => s.id), ["s1", "s2"]);
  assert.deepEqual(json.events.map((e) => e.type), ["invoice.created", "invoice.issued"]);

  // Same data, same file; and every amount survives the round trip as an integer.
  const text = serializeJsonExport(json);
  assert.equal(text, serializeJsonExport(buildJsonExport(exportData(), "2026-10-20T12:00:00.000Z")));
  const back = JSON.parse(text);
  const ore: number[] = [];
  JSON.stringify(back, (k, v) => (/Ore$/.test(k) && typeof v === "number" ? (ore.push(v), v) : v));
  assert.ok(ore.length > 20);
  assert.ok(ore.every(Number.isInteger), "every *Ore field is an integer");
});

test("json export keeps personal numbers masked unless an owner or admin opened them", () => {
  const data = exportData();
  const badrum = data.invoices.find((i) => i.number === "10001")!;
  const rot = badrum.document.se.rot!;
  badrum.document = { ...badrum.document, se: { ...badrum.document.se, rot: { ...rot, buyers: [{ ...rot.buyers[0], personalNumber: "19850412-XXXX", personalNumberSealed: "c2VhbGVk" }] } } };
  data.rotClaims = [
    {
      id: "claim",
      name: "ROT oktober",
      status: "draft",
      sentOn: null,
      decidedOn: null,
      paidOre: 0,
      note: "ROT oktober",
      createdAt: "2026-10-20T10:00:00.000Z",
      items: [{ id: "item", buyerId: "buyer", invoiceId: badrum.id, invoiceNumber: "10001", buyerName: "Anna Lindqvist", personalNumber: "19850412-XXXX", amountOre: badrum.rotOre, workOre: 600_000, paidOn: "2026-10-12", status: "pending", property: { kind: "fastighet", designation: "Göteborg Tolered 1:23" }, category: "Bygg" }],
    },
  ];

  const masked = buildJsonExport(data, "2026-10-20T12:00:00.000Z");
  assert.equal(masked.format.personalNumbers, "masked");
  assert.equal(masked.rotClaims[0].items[0].personalNumber, "19850412-XXXX");
  assert.equal(masked.invoices[0].document.se.rot?.buyers[0].personalNumber, "19850412-XXXX");

  data.personalNumbers = { claimItems: { item: "198504121234" }, invoiceBuyers: { [badrum.id]: ["198504121234"] } };
  const plain = buildJsonExport(data, "2026-10-20T12:00:00.000Z");
  assert.equal(plain.format.personalNumbers, "plain");
  assert.equal(plain.rotClaims[0].items[0].personalNumber, "198504121234");
  const buyer = plain.invoices[0].document.se.rot!.buyers[0];
  assert.equal(buyer.personalNumber, "198504121234");
  assert.ok(!("personalNumberSealed" in buyer), "the ciphertext is left out once the number is open");
  assert.equal(badrum.document.se.rot!.buyers[0].personalNumber, "19850412-XXXX", "the record itself is not changed");
});
