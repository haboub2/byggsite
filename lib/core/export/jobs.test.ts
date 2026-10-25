import { test } from "node:test";
import assert from "node:assert/strict";
import { readStoredZip } from "../../zip";
import { assembleArchive, renderArchivePart } from "./archive";
import { isDownloadable, jobStatusText, nextStep, outputPath, PART_SIZE, partCount, partFiles, partPath, QUEUE_THRESHOLD, shouldQueue, volumeName, type ExportJob } from "./jobs";
import type { InvoiceRecord } from "../invoices/store";

const files = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `inv-${i + 1}`, name: `Faktura-${i + 1}.pdf` }));
const job = (patch: Partial<ExportJob>): ExportJob => ({
  id: "job-1",
  orgId: "org-1",
  kind: "pdf_archive",
  status: "queued",
  filePath: null,
  fileName: null,
  bytes: null,
  outputs: [],
  error: null,
  requestedBy: null,
  requestedEmail: null,
  files: [],
  partsDone: 0,
  lockedUntil: null,
  createdAt: "2026-10-25T08:00:00Z",
  startedAt: null,
  finishedAt: null,
  expiresAt: null,
  ...patch,
});

test("export jobs: queue above the threshold or on request", () => {
  assert.equal(QUEUE_THRESHOLD, 300);
  assert.equal(shouldQueue(300), false);
  assert.equal(shouldQueue(301), true);
  assert.equal(shouldQueue(3, true), true);
});

test("export jobs: steps go start, parts of 50, assemble, then nothing", () => {
  assert.equal(PART_SIZE, 50);
  assert.equal(partCount(0), 0);
  assert.equal(partCount(50), 1);
  assert.equal(partCount(301), 7);
  assert.deepEqual(nextStep(job({})), { kind: "start" });
  const started = job({ status: "running", startedAt: "2026-10-25T08:00:01Z", files: files(120) });
  assert.deepEqual(nextStep(started), { kind: "part", index: 0 });
  assert.deepEqual(nextStep({ ...started, partsDone: 2 }), { kind: "part", index: 2 });
  assert.deepEqual(nextStep({ ...started, partsDone: 3 }), { kind: "assemble" });
  // No invoices: straight to the index-only archive.
  assert.deepEqual(nextStep(job({ status: "running", startedAt: "2026-10-25T08:00:01Z" })), { kind: "assemble" });
  for (const status of ["done", "failed", "expired"] as const) assert.deepEqual(nextStep({ ...started, status }), { kind: "none" });
  assert.deepEqual(partFiles(started, 2).map((f) => f.id), Array.from({ length: 20 }, (_, i) => `inv-${101 + i}`));
});

test("export jobs: paths stay under the organisation, volumes are numbered", () => {
  assert.equal(partPath("org-1", "job-1", 0), "org-1/job-1/del-0001.zip");
  assert.equal(outputPath("org-1", "job-1", "a.zip"), "org-1/job-1/a.zip");
  assert.equal(volumeName("acme-fakturor-pdf-2026-10-25.zip", 0, 1), "acme-fakturor-pdf-2026-10-25.zip");
  assert.equal(volumeName("acme-fakturor-pdf-2026-10-25.zip", 1, 3), "acme-fakturor-pdf-2026-10-25-del-2-av-3.zip");
});

test("export jobs: status text and whether the link still works", () => {
  const now = new Date("2026-10-26T12:00:00Z");
  const running = job({ status: "running", startedAt: "x", files: files(120), partsDone: 1 });
  assert.equal(jobStatusText(running, now), "Byggs: 50 av 120 fakturor klara.");
  assert.equal(jobStatusText({ ...running, partsDone: 3 }, now), "Fakturorna är klara, zip-filen sätts ihop.");
  const done = job({ status: "done", outputs: [{ path: "p", name: "a.zip", bytes: 1 }], expiresAt: "2026-11-01T08:00:00Z" });
  assert.equal(jobStatusText(done, now), "Klart. Länken gäller till 2026-11-01.");
  assert.equal(isDownloadable(done, now), true);
  assert.equal(isDownloadable(done, new Date("2026-11-02T00:00:00Z")), false);
  assert.equal(jobStatusText(job({ status: "failed", error: "Storage svarade 500" }), now), "Misslyckades: Storage svarade 500");
});

test("archive parts join into one zip with index.csv first, or into volumes under the limit", async () => {
  const inv = (n: number) => ({ id: `inv-${n}`, issuedOn: "2026-10-01", createdAt: "2026-10-01T10:00:00Z", kind: "invoice", number: String(n) }) as unknown as InvoiceRecord;
  const names = new Map(files(5).map((f) => [f.id, f.name]));
  const pdf = async (i: InvoiceRecord) => new Uint8Array(Buffer.alloc(1000, Number(i.number)));
  const part1 = await renderArchivePart([inv(1), inv(2), inv(3)], names, pdf, { concurrency: 2 });
  const part2 = await renderArchivePart([inv(4), inv(5)], names, pdf);
  const index = { name: "index.csv", data: Buffer.from("Fil\r\n") };

  const one = assembleArchive(index, [part1, part2]);
  assert.equal(one.zips.length, 1);
  assert.equal(one.files, 6);
  const entries = readStoredZip(one.zips[0]);
  assert.deepEqual(entries.map((e) => e.name), ["index.csv", "Faktura-1.pdf", "Faktura-2.pdf", "Faktura-3.pdf", "Faktura-4.pdf", "Faktura-5.pdf"]);
  assert.ok(entries.every((e) => e.crcOk));
  assert.equal(entries[4].data[0], 4);
  assert.equal(entries[1].date.getTime(), new Date("2026-10-01T12:00:00").getTime());

  // A limit that fits two PDFs per volume: index + 1, 2 + 3, 4 + 5, every volume under it.
  const split = assembleArchive(index, [part1, part2], 2300);
  assert.deepEqual(split.zips.map((z) => readStoredZip(z).map((e) => e.name)), [["index.csv", "Faktura-1.pdf"], ["Faktura-2.pdf", "Faktura-3.pdf"], ["Faktura-4.pdf", "Faktura-5.pdf"]]);
  assert.ok(split.zips.every((z) => z.length <= 2300));
});
