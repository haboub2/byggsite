import type { InvoiceRecord } from "../invoices/store";
import { invoiceFileName } from "../../pdf/invoice-file-name";
import { pool } from "../../pool";
import { createZip, type ZipEntry } from "../../zip";
import { invoiceColumns, toCsv, type CsvColumn } from "./csv";
import { issuedInvoices } from "./model";

/**
 * The PDF archive: every issued invoice and credit note in the organisation
 * (never drafts) as the PDF the customer got, named like the e-mail
 * attachment, plus index.csv with the same columns as the invoice CSV and
 * the file each one is in. Rendering is the slow and memory-hungry part, so
 * a few invoices are rendered at a time, as the project report does with
 * its photos.
 */

export const ARCHIVE_CONCURRENCY = 4;

export type RenderPdf = (inv: InvoiceRecord) => Promise<Uint8Array>;

/** Each invoice's file name in the zip; a name that is taken gets the invoice id. */
export function archiveFileNames(invoices: InvoiceRecord[]): Map<string, string> {
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

export async function buildInvoiceArchive(
  all: InvoiceRecord[],
  render: RenderPdf,
  options: { concurrency?: number } = {}
): Promise<{ zip: Buffer; files: string[] }> {
  const invoices = issuedInvoices(all);
  const names = archiveFileNames(invoices);
  const pdfs = await pool(invoices, options.concurrency ?? ARCHIVE_CONCURRENCY, async (inv): Promise<ZipEntry> => ({
    name: names.get(inv.id)!,
    data: await render(inv),
    date: new Date(inv.issuedOn ? `${inv.issuedOn}T12:00:00` : inv.createdAt),
  }));
  const indexColumns: CsvColumn<InvoiceRecord>[] = [
    { header: "Fil", value: (i) => names.get(i.id) ?? "" },
    ...invoiceColumns,
    { header: "Dokumentets SHA-256", value: (i) => i.sha256 ?? "" },
  ];
  const index: ZipEntry = { name: "index.csv", data: Buffer.from(toCsv(indexColumns, invoices), "utf8") };
  return { zip: createZip([index, ...pdfs]), files: [index.name, ...pdfs.map((p) => p.name)] };
}
