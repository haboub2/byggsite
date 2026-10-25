/** A project photo's stage is written at the start of its caption in /admin,
 *  e.g. "Före: Rötskadad takfot". No prefix means no stage. */

export const PHOTO_STAGES = ["Före", "Under arbetet", "Efter"] as const;
export type PhotoStage = (typeof PHOTO_STAGES)[number];

export type StagedPhoto = { url: string; alt: string; stage: PhotoStage | null; text: string };

const PREFIX = new RegExp(`^(${PHOTO_STAGES.join("|")})\\s*:\\s*`, "i");

export function splitStage(alt: string): { stage: PhotoStage | null; text: string } {
  const m = alt.match(PREFIX);
  if (!m) return { stage: null, text: alt };
  const stage = PHOTO_STAGES.find((s) => s.toLowerCase() === m[1].toLowerCase()) ?? null;
  return { stage, text: alt.slice(m[0].length) };
}

export const staged = (img: { url: string; alt: string }): StagedPhoto => ({ ...img, ...splitStage(img.alt) });
