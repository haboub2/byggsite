"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { calculateRot, ROT_CAP, ROT_RUT_CAP, type Owner } from "@/lib/rot";
import type { PricePreset } from "@/lib/pricing";

type Preset = PricePreset & { slug: string; service: string };

const MAX = 700_000;
const fmt = (n: number) => `${Math.round(n).toLocaleString("sv-SE")} kr`;
const parse = (v: string) => {
  const n = Number(v.replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? Math.min(n, 5_000_000) : 0;
};

function Amount({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const id = useId();
  return (
    <div className="calc-field">
      <div className="calc-field-head">
        <label htmlFor={id}>{label}</label>
        <span className="calc-input">
          <input
            id={id}
            inputMode="numeric"
            value={value.toLocaleString("sv-SE")}
            onChange={(e) => onChange(parse(e.target.value))}
            aria-describedby={`${id}-hint`}
          />
          kr
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={MAX}
        step={1_000}
        value={Math.min(value, MAX)}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${label}, reglage`}
      />
      <span className="calc-hint" id={`${id}-hint`}>{hint}</span>
    </div>
  );
}

export default function RotCalculator({
  presets,
  initial,
}: {
  presets: Preset[];
  initial?: string;
}) {
  const start = presets.find((p) => p.slug === initial) ?? presets[0];
  const [active, setActive] = useState<string | null>(start?.slug ?? null);
  const [labor, setLabor] = useState(start?.labor ?? 100_000);
  const [material, setMaterial] = useState(start?.material ?? 0);
  const [ownerCount, setOwnerCount] = useState(1);
  const [used, setUsed] = useState<Owner[]>([{}, {}]);
  const [showUsed, setShowUsed] = useState(false);

  const r = useMemo(
    () => calculateRot({ labor, material, owners: used.slice(0, ownerCount) }),
    [labor, material, used, ownerCount]
  );

  const current = presets.find((p) => p.slug === active);
  const offertHref = current
    ? `/bygg/offert?tjanst=${encodeURIComponent(current.service)}`
    : "/bygg/offert";

  function pick(p: Preset) {
    setActive(p.slug);
    setLabor(p.labor);
    setMaterial(p.material);
  }

  function setUsedFor(i: number, key: keyof Owner, n: number) {
    setUsed((prev) => prev.map((o, j) => (j === i ? { ...o, [key]: n } : o)));
  }

  const pct = (n: number) => (r.total > 0 ? `${(n / r.total) * 100}%` : "0%");

  return (
    <div className="calc">
      <div className="calc-inputs">
        <div className="calc-chips" role="group" aria-label="Exempelprojekt">
          {presets.map((p) => (
            <button
              key={p.slug}
              type="button"
              className="calc-chip"
              aria-pressed={active === p.slug}
              onClick={() => pick(p)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <Amount
          label="Arbetskostnad"
          hint="Inkl. moms. Det är bara arbetet som ger ROT-avdrag."
          value={labor}
          onChange={(n) => {
            setActive(null);
            setLabor(n);
          }}
        />
        <Amount
          label="Material och övrigt"
          hint="Material, resor och maskiner ger inget avdrag."
          value={material}
          onChange={(n) => {
            setActive(null);
            setMaterial(n);
          }}
        />

        <div className="calc-owners">
          <span id="owners-label">Hur många äger bostaden och delar på avdraget?</span>
          <div className="calc-seg" role="group" aria-labelledby="owners-label">
            {[1, 2].map((n) => (
              <button key={n} type="button" aria-pressed={ownerCount === n} onClick={() => setOwnerCount(n)}>
                {n === 1 ? "En" : "Två"}
              </button>
            ))}
          </div>
        </div>

        <div className="calc-used">
          <button
            type="button"
            className="calc-used-toggle"
            aria-expanded={showUsed}
            onClick={() => setShowUsed((v) => !v)}
          >
            Har ni redan fått ROT eller RUT i år?
            <span aria-hidden="true">{showUsed ? "−" : "+"}</span>
          </button>
          {showUsed && (
            <div className="calc-used-grid">
              {Array.from({ length: ownerCount }, (_, i) => (
                <fieldset key={i}>
                  <legend>{ownerCount === 1 ? "Redan fått i år" : `Ägare ${i + 1}, redan fått i år`}</legend>
                  <label>
                    ROT
                    <span className="calc-input">
                      <input
                        inputMode="numeric"
                        value={(used[i].usedRot ?? 0).toLocaleString("sv-SE")}
                        onChange={(e) => setUsedFor(i, "usedRot", parse(e.target.value))}
                      />
                      kr
                    </span>
                  </label>
                  <label>
                    RUT
                    <span className="calc-input">
                      <input
                        inputMode="numeric"
                        value={(used[i].usedRut ?? 0).toLocaleString("sv-SE")}
                        onChange={(e) => setUsedFor(i, "usedRut", parse(e.target.value))}
                      />
                      kr
                    </span>
                  </label>
                  <span className="calc-hint">Kvar av ROT-utrymmet i år: {fmt(r.room[i] ?? 0)}</span>
                </fieldset>
              ))}
              <p className="calc-hint">
                RUT räknas in eftersom ROT och RUT tillsammans får vara högst{" "}
                {fmt(ROT_RUT_CAP)} per person och år.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="calc-result" aria-live="polite">
        <dl>
          <div>
            <dt>Arbetskostnad</dt>
            <dd>{fmt(r.labor)}</dd>
          </div>
          <div>
            <dt>Material och övrigt</dt>
            <dd>{fmt(r.material)}</dd>
          </div>
          <div>
            <dt>ROT-avdrag, 30 % av arbetet</dt>
            <dd className="calc-minus">− {fmt(r.deduction)}</dd>
          </div>
        </dl>
        <p className="calc-pay-label">Du betalar</p>
        <p className="calc-pay">{fmt(r.pay)}</p>
        <div className="calc-bar" aria-hidden="true">
          <span style={{ width: pct(r.material), background: "var(--dark-4)" }} />
          <span style={{ width: pct(r.labor - r.deduction), background: "var(--on-dark-3)" }} />
          <span style={{ width: pct(r.deduction), background: "var(--orange)" }} />
        </div>
        <div className="calc-legend" aria-hidden="true">
          <span>Material</span>
          <span>Arbete</span>
          <span className="o">Avdrag</span>
        </div>

        {ownerCount === 2 && r.deduction > 0 && (
          <p className="calc-note">
            Fördelning: {fmt(r.perOwner[0])} och {fmt(r.perOwner[1])}.
          </p>
        )}
        {r.capped && (
          <p className="calc-note calc-note--em">
            Taket styr: 30 % av arbetet vore {fmt(r.uncapped)}, men ROT är högst {fmt(ROT_CAP)} per
            person och år{showUsed ? ", minus det ni redan fått" : ""}.
          </p>
        )}
        <p className="calc-note">
          Avdraget kan inte bli större än den skatt du betalar under året. Vi drar av det direkt på
          fakturan och ansöker hos Skatteverket. Regler för 2026.
        </p>

        <Link href={offertHref} className="btn btn-primary btn-block">
          Få en exakt offert
        </Link>
      </div>
    </div>
  );
}
