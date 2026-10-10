"use client";

import { useState } from "react";
import { EditorForm, type LastSaved, TextField } from "./EditorForm";
import type { Warranty, WarrantyBlock } from "@/lib/content/schema";

type Group = { side: "bygg" | "software"; title: string; services: { slug: string; title: string }[] };

function WarrantyFields({
  path,
  value,
  onChange,
}: {
  path: string;
  value: Warranty;
  onChange: (w: Warranty) => void;
}) {
  return (
    <div className="egrid warranty-edit">
      <TextField
        label="Kort (i faktarutan)"
        path={`${path}.short`}
        value={value.short}
        onChange={(v) => onChange({ ...value, short: v })}
        placeholder="5 år"
      />
      <TextField
        label="Mening (i texter)"
        path={`${path}.sentence`}
        value={value.sentence}
        onChange={(v) => onChange({ ...value, sentence: v })}
        placeholder="5 års garanti på hantverket"
      />
    </div>
  );
}

export default function WarrantyEditor({
  initial,
  groups,
  lastSaved,
}: {
  initial: WarrantyBlock;
  groups: Group[];
  lastSaved?: LastSaved;
}) {
  const [w, setW] = useState(initial);
  const setService = (slug: string, v: Warranty) => setW((prev) => ({ ...prev, services: { ...prev.services, [slug]: v } }));

  return (
    <EditorForm lastSaved={lastSaved} contentKey="warranty" value={w} initial={initial}>
      {groups.map((g) => {
        const standard = w[g.side];
        const applyToAll = () =>
          setW((prev) => ({
            ...prev,
            services: { ...prev.services, ...Object.fromEntries(g.services.map((s) => [s.slug, { ...standard }])) },
          }));
        return (
          <section key={g.side} className="warranty-group">
            <fieldset className="efieldset efieldset--accent">
              <legend>{g.title}: standard</legend>
              <p className="efield-hint">
                Används i de allmänna texterna: siffrorna på startsidan, processen, vanliga frågor och Google-data.
              </p>
              <WarrantyFields path={g.side} value={standard} onChange={(v) => setW((prev) => ({ ...prev, [g.side]: v }))} />
              <button type="button" className="btn btn-ghost" onClick={applyToAll}>
                Använd standarden för alla {g.title.toLowerCase()}-tjänster
              </button>
            </fieldset>

            {g.services.map((s) => {
              const v = w.services[s.slug] ?? standard;
              const same = v.short === standard.short && v.sentence === standard.sentence;
              return (
                <fieldset key={s.slug} className="efieldset">
                  <legend>
                    {s.title}
                    {same && <span className="etag">Som standard</span>}
                  </legend>
                  <WarrantyFields path={`services.${s.slug}`} value={v} onChange={(nv) => setService(s.slug, nv)} />
                </fieldset>
              );
            })}
          </section>
        );
      })}
    </EditorForm>
  );
}
