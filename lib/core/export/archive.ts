import type { InvoiceRecord } from "../invoices/store";
import { invoiceFileName } from "../../pdf/invoice-file-name";
import { pool } from "../../pool";
import { createZip, readStoredZip, type ZipEntry } from "../../zip";
import { invoiceColumns, toCsv, type CsvColumn } from "./csv";
import { issuedInvoices } from "./model";

/**
 * The PDF archive: every issued invoice and credit note in the organisation
 * (never drafts) as the PDF the customer got, named like the e-mail
 * attachment, plus index.csv with the same columns as the invoice CSV and
 * the file each one is in. Rendering is the slow and memory-hungry part, so
 * a few invoices are rendered at a time, as the project report does with
 * its photos.
 *
 * A small organisation gets the zip in the request (buildInvoiceArchive). A
 * large one gets a background job (lib/core/export/job-store.ts) that renders
 * parts of 50 invoices into part zips (renderArchivePart) and joins them at
 * the end (assembleArchive), split into volumes when the whole would not fit
 * one file in Storage.
 */

export const ARCHIVE_CONCURRENCY = 4;

export type RenderPdf = (inv: InvoiceRecord) => Promise<Uint8Array>;

/** Each invoice's file name in the zip; a name that is taken gets the invoice id. */
export function archiveFileNames(invoices: Pick<InvoiceRecord, "id" | "kind" | "number" | "document">[]): Map<string, string> {
  const names = new Map<string, string>();
  const taken = new Set<string>();
  for (const inv of invoices) {
    let name = invoiceFileName(inv);
    if (taken.has(name.toLowerCase())) name = name.replace(/\.pdf$/, `-${inv.id.slice(0, 8)}.pdf`);
    taken.add(name.toLowerCase());
    names.set(inv.id, name);
  }
  return names;
}

/** index.csv: the invoice CSV's columns with the file each invoice is in and the document's hash first and last. */
export function archiveIndex(invoices: InvoiceRecord[], names: Map<string, string>): ZipEntry {
  const indexColumns: CsvColumn<InvoiceRecord>[] = [
    { header: "Fil", value: (i) => names.get(i.id) ?? "" },
    ...invoiceColumns,
    { header: "Dokumentets SHA-256", value: (i) => i.sha256 ?? "" },
  ];
  return { name: "index.csv", data: Buffer.from(toCsv(indexColumns, invoices), "utf8") };
}

/** The invoices as PDF zip entries, rendered a few at a time, in the given order. */
async function renderEntries(invoices: InvoiceRecord[], names: Map<string, string>, render: RenderPdf, concurrency: number): Promise<ZipEntry[]> {
  return pool(invoices, concurrency, async (inv): Promise<ZipEntry> => ({
    name: names.get(inv.id) ?? invoiceFileName(inv),
    data: await render(inv),
    date: new Date(inv.issuedOn ? `${inv.issuedOn}T12:00:00` : inv.createdAt),
  }));
}

export async function buildInvoiceArchive(
  all: InvoiceRecord[],
  render: RenderPdf,
  options: { concurrency?: number } = {}
): Promise<{ zip: Buffer; files: string[] }> {
  const invoices = issuedInvoices(all);
  const names = archiveFileNames(invoices);
  const pdfs = await renderEntries(invoices, names, render, options.concurrency ?? ARCHIVE_CONCURRENCY);
  const index = archiveIndex(invoices, names);
  return { zip: createZip([index, ...pdfs]), files: [index.name, ...pdfs.map((p) => p.name)] };
}

/** One part of a background archive: these invoices' PDFs, under the names fixed when the job started, as a zip of their own. */
export async function renderArchivePart(
  invoices: InvoiceRecord[],
  names: Map<string, string>,
  render: RenderPdf,
  options: { concurrency?: number } = {}
): Promise<Buffer> {
  return createZip(await renderEntries(invoices, names, render, options.concurrency ?? ARCHIVE_CONCURRENCY));
}

/**
 * Supabase Storage refuses files over the project's upload limit (50 MB on
 * the smaller plans); a volume stays below this so the archive always
 * uploads.
 */
export const MAX_VOLUME_BYTES = 45 * 1024 * 1024;

/**
 * Join the part zips into the archive: index.csv first, then every PDF in
 * part order. When the whole would be larger than `maxBytes`, it is split
 * into volumes that each stay below it (index.csv in the first); a single
 * PDF larger than that gets a volume of its own.
 */
export function assembleArchive(index: ZipEntry, parts: Buffer[], maxBytes = MAX_VOLUME_BYTES): { zips: Buffer[]; files: number } {
  const entries: ZipEntry[] = [index, ...parts.flatMap((p) => readStoredZip(p).map((e) => {
    if (!e.crcOk) throw new Error(`Delen med ${e.name} är trasig.`);
    return { name: e.name, data: e.data, date: e.date };
  }))];
  // Per entry in a stored zip: local header 30 + central record 46 + the name twice; 22 for the end record.
  const cost = (e: ZipEntry) => 76 + 2 * Buffer.byteLength(e.name) + e.data.length;
  const volumes: ZipEntry[][] = [[]];
  let size = 22;
  for (const e of entries) {
    const current = volumes[volumes.length - 1];
    if (current.length > 0 && size + cost(e) > maxBytes) {
      volumes.push([]);
      size = 22;
    }
    volumes[volumes.length - 1].push(e);
    size += cost(e);
  }
  return { zips: volumes.map((v) => createZip(v)), files: entries.length };
}
