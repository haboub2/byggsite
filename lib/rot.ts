/**
 * ROT deduction for private customers, invoice model ("fakturamodellen").
 * Rules for 2026, checked against Skatteverket (rot och rut – privat):
 *   - ROT: 30 % of the labour cost incl. VAT. Material, travel and other
 *     costs never qualify.
 *   - ROT is capped at 50 000 kr per person and year.
 *   - ROT and RUT together are capped at 75 000 kr per person and year, so
 *     RUT already used this year can shrink the room left for ROT.
 *   - The deduction can never exceed the tax the person pays; that part
 *     can't be known here and is shown as a caveat, not calculated.
 * The temporary 50 % rate applied only in 2025. Update the constants if the
 * rules change.
 */

export const ROT_RATE = 0.3;
export const ROT_CAP = 50_000;
export const ROT_RUT_CAP = 75_000;
/** RUT: 50 % of the labour cost incl. VAT. RUT has no cap of its own below
 *  the shared ROT+RUT cap of 75 000 kr per person and year. */
export const RUT_RATE = 0.5;
export const RUT_CAP = ROT_RUT_CAP;

export type DeductionKind = "rot" | "rut";

export type Owner = {
  /** ROT already received this calendar year, kr. */
  usedRot?: number;
  /** RUT already received this calendar year, kr. */
  usedRut?: number;
};

export type RotResult = {
  labor: number;
  material: number;
  total: number;
  /** 30 % of the labour cost, before any cap. */
  uncapped: number;
  /** ROT room left per owner this year. */
  room: number[];
  /** The deduction actually applied, whole kronor. */
  deduction: number;
  /** How the deduction is split between owners (sums to `deduction`). */
  perOwner: number[];
  /** What the customer pays on the invoice. */
  pay: number;
  /** True when the yearly caps, not 30 %, decided the deduction. */
  capped: boolean;
};

const kr = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/** RUT room one person has left this year: what ROT and RUT have not used of the shared cap. */
export function rutRoom({ usedRot = 0, usedRut = 0 }: Owner): number {
  return Math.max(0, ROT_RUT_CAP - kr(usedRot) - kr(usedRut));
}

/** ROT room one person has left this year. */
export function rotRoom({ usedRot = 0, usedRut = 0 }: Owner): number {
  const rot = kr(usedRot);
  const rut = kr(usedRut);
  return Math.max(0, Math.min(ROT_CAP - rot, ROT_RUT_CAP - rot - rut));
}

export function calculateRot({
  labor,
  material = 0,
  owners = [{}],
  kind = "rot",
}: {
  /** "rut" uses the RUT rate and the room left under the shared cap. */
  kind?: DeductionKind;
  labor: number;
  material?: number;
  owners?: Owner[];
}): RotResult {
  const l = kr(labor);
  const m = kr(material);
  const list = owners.length > 0 ? owners : [{}];

  const uncapped = Math.floor(l * (kind === "rut" ? RUT_RATE : ROT_RATE));
  const room = list.map(kind === "rut" ? rutRoom : rotRoom);
  const deduction = Math.min(uncapped, room.reduce((a, b) => a + b, 0));

  // Split as evenly as possible, never above anyone's room. Owners with the
  // least room are filled first; whatever they can't take moves on.
  const perOwner = new Array<number>(list.length).fill(0);
  let left = deduction;
  const order = room.map((r, i) => ({ r, i })).sort((a, b) => a.r - b.r);
  order.forEach(({ r, i }, k) => {
    const fair = Math.floor(left / (order.length - k));
    const take = Math.min(r, fair);
    perOwner[i] = take;
    left -= take;
  });
  // Rounding remainder (at most a few kronor) goes to whoever still has room.
  for (const { r, i } of order) {
    if (left <= 0) break;
    const extra = Math.min(r - perOwner[i], left);
    perOwner[i] += extra;
    left -= extra;
  }

  return {
    labor: l,
    material: m,
    total: l + m,
    uncapped,
    room,
    deduction,
    perOwner,
    pay: l + m - deduction,
    capped: deduction < uncapped,
  };
}

/** Labour cost at which one person reaches the ROT cap (≈ 166 667 kr). */
export const LABOR_FOR_FULL_ROT = Math.ceil(ROT_CAP / ROT_RATE);
