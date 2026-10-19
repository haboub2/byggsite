import "server-only";
import sharp from "sharp";

/**
 * Demo mode only: the example project's photos (demo-1.jpg …) are drawn the
 * first time they are asked for, so the documentation, the report and the
 * zip have something to show without shipping photos in the repository.
 * Flat construction colours with a label; nothing that looks like a real job.
 */

const LOOKS: [string, string, string][] = [
  ["#c9b79c", "#8d7a62", "Golvskydd"],
  ["#9aa3a8", "#5f686d", "Rivning"],
  ["#a69a8c", "#6e6255", "Betong"],
  ["#b2aca3", "#7a746b", "Rivning"],
  ["#c4c9cc", "#83898d", "Rör i vägg"],
  ["#8f9aa1", "#59646b", "Golvbrunn"],
  ["#d18a5a", "#8f5634", "Golvvärme"],
  ["#c7b9a6", "#8b7d6a", "El"],
  ["#aab4b9", "#6c777c", "VVS"],
];

/** "projects/<id>/demo-3.jpg" → 3, or null for any other key. */
export function demoPhotoNumber(key: string): number | null {
  const m = /\/demo-(\d{1,3})\.jpg$/.exec(key);
  return m ? Number(m[1]) : null;
}

export async function drawDemoPhoto(n: number): Promise<Buffer> {
  const [light, dark, label] = LOOKS[(n - 1) % LOOKS.length];
  const w = 1600;
  const h = 1200;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    ${Array.from({ length: 9 }, (_, i) => `<rect x="${120 + i * 150}" y="${260 + ((i * 97 + n * 53) % 420)}" width="110" height="${380 - ((i * 61 + n * 29) % 200)}" fill="#ffffff" opacity="0.08"/>`).join("")}
    <rect x="0" y="${h - 190}" width="${w}" height="190" fill="#1e2c37" opacity="0.55"/>
    <text x="80" y="${h - 80}" font-family="Arial, Helvetica, sans-serif" font-size="84" font-weight="700" fill="#ffffff">${label}</text>
    <text x="${w - 80}" y="${h - 80}" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="48" fill="#ffffff" opacity="0.8">Exempelfoto ${n}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
}
