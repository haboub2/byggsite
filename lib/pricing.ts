/**
 * Guide prices for the Bygg side, incl. VAT and before ROT.
 * EXAMPLE FIGURES — placeholders until the owners supply real prices. Each
 * preset's labour + material adds up to the "from" price it illustrates.
 * Project management isn't ROT-eligible on its own, so it has no preset.
 */

export type PricePreset = { label: string; labor: number; material: number };

export type GuidePrice = {
  slug: string;
  from: string;
  note: string;
  preset?: PricePreset;
};

export const priceGuide: GuidePrice[] = [
  {
    slug: "badrumsrenovering",
    from: "från 150 000 kr",
    note: "5–8 m², helkaklat, 3–5 veckor",
    preset: { label: "Badrum 6 m²", labor: 90_000, material: 60_000 },
  },
  {
    slug: "koksrenovering",
    from: "från 180 000 kr",
    note: "montage, el och VVS, 2–4 veckor",
    preset: { label: "Kök", labor: 70_000, material: 110_000 },
  },
  {
    slug: "golv",
    from: "från 900 kr/m²",
    note: "inkl. avjämning och lister",
    preset: { label: "Golv 20 m²", labor: 8_000, material: 10_000 },
  },
  {
    slug: "maleri",
    from: "från 6 000 kr/rum",
    note: "spackling, grundning och två strykningar",
    preset: { label: "Målning, ett rum", labor: 5_000, material: 1_000 },
  },
  {
    slug: "tak",
    from: "från 1 400 kr/m²",
    note: "omläggning med falsad plåt",
    preset: { label: "Plåttak 150 m²", labor: 110_000, material: 100_000 },
  },
  {
    slug: "el-vvs",
    from: "timpris från 650 kr",
    note: "certifierad elektriker eller rörmokare",
    preset: { label: "El/VVS 20 timmar", labor: 13_000, material: 5_000 },
  },
  {
    slug: "tillbyggnad",
    from: "från 25 000 kr/m²",
    note: "nyckelfärdigt, bygglov ingår",
    preset: { label: "Tillbyggnad 25 m²", labor: 330_000, material: 295_000 },
  },
  {
    slug: "totalrenovering",
    from: "offert efter hembesök",
    note: "lägenhet eller hus",
    preset: { label: "Totalrenovering", labor: 320_000, material: 260_000 },
  },
  {
    slug: "projektledning",
    from: "ingår vid helhetsåtagande",
    note: "annars enligt offert",
  },
];

export function priceFor(slug: string): GuidePrice | undefined {
  return priceGuide.find((p) => p.slug === slug);
}
