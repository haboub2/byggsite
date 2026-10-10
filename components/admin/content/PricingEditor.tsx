"use client";

import { useState } from "react";
import { EditorForm, type LastSaved, MoneyField, TextField } from "./EditorForm";
import { calculateRot } from "@/lib/rot";
import type { Pricing, PriceItem } from "@/lib/content/schema";

const kr = (n: number) => `${n.toLocaleString("sv-SE")} kr`;

export default function PricingEditor({
  initial,
  services,
  lastSaved,
}: {
  lastSaved?: LastSaved;
  initial: Pricing;
  services: { slug: string; title: string }[];
}) {
  const [p, setP] = useState(initial);
  const set = (slug: string, patch: Partial<PriceItem>) =>
    setP((prev) => ({ services: { ...prev.services, [slug]: { ...prev.services[slug], ...patch } } }));

  return (
    <EditorForm lastSaved={lastSaved} contentKey="pricing" value={p} initial={initial}>
      {services.map(({ slug, title }) => {
        const item = p.services[slug];
        if (!item) return null;
        const rot = calculateRot({ labor: item.labor, material: item.material });
        const path = (f: string) => `services.${slug}.${f}`;
        return (
          <fieldset key={slug} className="efieldset price-edit">
            <legend>{title}</legend>
            <div className="egrid">
              <TextField label="Riktpris" path={path("from")} value={item.from} onChange={(v) => set(slug, { from: v })} placeholder="från 150 000 kr" />
              <TextField label="Förklaring" path={path("note")} value={item.note} onChange={(v) => set(slug, { note: v })} placeholder="5–8 m², helkaklat, 3–5 veckor" />
            </div>

            <label className="etoggle">
              <input type="checkbox" checked={item.example} onChange={(e) => set(slug, { example: e.target.checked })} />
              <span>Visa ett räkneexempel i ROT-kalkylatorn</span>
            </label>

            {item.example && (
              <div className="price-example">
                <div className="egrid egrid--three">
                  <TextField label="Exempelnamn" path={path("exampleLabel")} value={item.exampleLabel} onChange={(v) => set(slug, { exampleLabel: v })} placeholder="Badrum 6 m²" />
                  <MoneyField label="Arbete, kr inkl. moms" path={path("labor")} value={item.labor} onChange={(v) => set(slug, { labor: v })} />
                  <MoneyField label="Material, kr inkl. moms" path={path("material")} value={item.material} onChange={(v) => set(slug, { material: v })} />
                </div>
                <p className="price-preview">
                  Totalt {kr(rot.total)} · ROT-avdrag {kr(rot.deduction)}
                  {rot.capped ? " (taket)" : ""} · <strong>kunden betalar {kr(rot.pay)}</strong>
                </p>
              </div>
            )}
          </fieldset>
        );
      })}
    </EditorForm>
  );
}
