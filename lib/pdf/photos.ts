import "server-only";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { pdfPhotoSource } from "../images";

/**
 * Photos for the quote PDF, loaded before rendering so a slow or missing
 * photo never breaks the document: on any failure the slot is simply left
 * out and the layout falls back to a plain block. Every photo is cropped to
 * the box it fills and re-encoded as a compressed JPEG, so a 6 MB phone photo
 * costs the PDF about as much as the stock one. Kept in memory per server
 * instance, so sending and previewing the same quote loads it once.
 */

export type PdfPhoto = { data: Buffer; format: "jpg" | "png" };
export type PhotoBox = { width: number; height: number };

/** Pixel boxes at about 150 dpi for where the photos sit on an A4 page. */
export const COVER_BOX: PhotoBox = { width: 1240, height: 980 };
export const BAND_BOX: PhotoBox = { width: 1240, height: 258 };

const QUALITY = 62;
const TIMEOUT_MS = 8_000;
const cache = new Map<string, Promise<PdfPhoto | null>>();

type Source = { file: string } | { url: string };

async function load(label: string, source: Source | null, box: PhotoBox): Promise<PdfPhoto | null> {
  if (!source) return null;
  try {
    let raw: Buffer;
    if ("file" in source) {
      raw = await readFile(source.file);
    } else {
      const res = await fetch(source.url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      raw = Buffer.from(await res.arrayBuffer());
    }
    const data = await sharp(raw)
      .rotate() // honour the phone's orientation flag
      .resize(box.width, box.height, { fit: "cover", position: "centre" })
      .jpeg({ quality: QUALITY, mozjpeg: true, progressive: true })
      .toBuffer();
    return { data, format: "jpg" };
  } catch (err) {
    console.warn(`[pdf] photo "${label}" left out:`, err instanceof Error ? err.message : err);
    return null;
  }
}

function cached(key: string, run: () => Promise<PdfPhoto | null>): Promise<PdfPhoto | null> {
  let hit = cache.get(key);
  if (!hit) {
    hit = run();
    cache.set(key, hit);
    // A failure isn't cached: the next render tries again.
    hit.then((photo) => {
      if (!photo) cache.delete(key);
    });
  }
  return hit;
}

/** A slot from lib/images.ts: our own photo, else the stock one. */
export function loadPdfPhoto(slot: string | null, box: PhotoBox): Promise<PdfPhoto | null> {
  if (!slot) return Promise.resolve(null);
  return cached(`${slot}@${box.width}x${box.height}`, () => load(slot, pdfPhotoSource(slot, box), box));
}

/* ---------- the documentation report (lib/portal/report.ts) ---------- */

/** A captioned photo is a figure (longest side about 1 200 px, uncropped);
 *  the rest fill the day's grid of 4:3 cells. The originals stay in the bucket. */
export const FIGURE_SIDE = 1200;
export const GRID_BOX: PhotoBox = { width: 800, height: 600 };

export type SizedPdfPhoto = PdfPhoto & { width: number; height: number };

/** An original from the portal bucket, shrunk and re-encoded for the report. Null if it can't be read. */
export async function compressReportPhoto(raw: Buffer, mode: "figure" | "grid" | "cover"): Promise<SizedPdfPhoto | null> {
  try {
    const img = sharp(raw).rotate();
    const resized =
      mode === "figure"
        ? img.resize(FIGURE_SIDE, FIGURE_SIDE, { fit: "inside", withoutEnlargement: true })
        : img.resize(mode === "grid" ? GRID_BOX.width : COVER_BOX.width, mode === "grid" ? GRID_BOX.height : COVER_BOX.height, { fit: "cover", position: "centre" });
    const { data, info } = await resized.jpeg({ quality: QUALITY, mozjpeg: true, progressive: true }).toBuffer({ resolveWithObject: true });
    return { data, format: "jpg", width: info.width, height: info.height };
  } catch (err) {
    console.warn("[pdf] report photo left out:", err instanceof Error ? err.message : err);
    return null;
  }
}
