"use client";

import { useId, useState } from "react";
import { EditorForm, TextArea, TextField, useFieldError } from "../content/EditorForm";
import { saveQuote } from "@/app/admin/quote-actions";
import { kr, quoteTotals, rotApplies, validUntil, ROT_CAP, ROT_RATE } from "@/lib/quotes/math";
import {
  ITEM_KINDS,
  ITEM_KIND_LABEL,
  UNITS,
  VAT_RATES,
  newItemId,
  type QuoteCustomer,
  type QuoteData,
  type QuoteItem,
  type RotPerson,
} from "@/lib/quotes/schema";

/** A number typed the Swedish way: "12 500", "12500", "1 250,50". */
function parseNum(v: string): number {
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
const showNum = (n: number) => (n === 0 ? "" : String(n).replace(".", ","));

function RowInput({
  path,
  value,
  onChange,
  label,
  placeholder,
  inputMode,
  align,
}: {
  path: string;
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
  inputMode?: "text" | "decimal";
  align?: "right";
}) {
  const id = useId();
  const error = useFieldError(path);
  return (
    <div className={`efield${error ? " has-error" : ""}`}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        title={error}
        style={align ? { textAlign: align } : undefined}
      />
    </div>
  );
}

function ItemRow({
  item,
  index,
  count,
  incl,
  sum,
  showKind,
  onChange,
  onMove,
  onRemove,
}: {
  item: QuoteItem;
  index: number;
  count: number;
  incl: boolean;
  sum: number;
  showKind: boolean;
  onChange: (patch: Partial<QuoteItem>) => void;
  onMove: (d: number) => void;
  onRemove: () => void;
}) {
  const p = `items.${index}`;
  return (
    <li className="qrow">
      <div className="qrow-desc">
        <RowInput
          path={`${p}.description`}
          label="Beskrivning"
          value={item.description}
          placeholder="Vad ingår i raden"
          onChange={(v) => onChange({ description: v })}
        />
      </div>
      <select
        aria-label="Typ av rad"
        title={showKind ? "Arbete ger ROT-avdrag, material inte" : "Typ av rad"}
        value={item.kind}
        onChange={(e) => onChange({ kind: e.target.value as QuoteItem["kind"] })}
        className="qrow-kind"
      >
        {ITEM_KINDS.map((k) => (
          <option key={k} value={k}>
            {ITEM_KIND_LABEL[k]}
          </option>
        ))}
      </select>
      <RowInput path={`${p}.qty`} label="Antal" value={showNum(item.qty)} inputMode="decimal" align="right" placeholder="Antal" onChange={(v) => onChange({ qty: parseNum(v) })} />
      <div className="efield">
        <label className="sr-only">Enhet</label>
        <input list="quote-units" value={item.unit} maxLength={8} aria-label="Enhet" placeholder="Enhet" onChange={(e) => onChange({ unit: e.target.value })} />
      </div>
      <RowInput
        path={`${p}.unitPrice`}
        label={incl ? "à-pris inkl. moms" : "à-pris exkl. moms"}
        value={showNum(item.unitPrice)}
        inputMode="decimal"
        align="right"
        placeholder={incl ? "à-pris inkl." : "à-pris exkl."}
        onChange={(v) => onChange({ unitPrice: parseNum(v) })}
      />
      <select aria-label="Moms" value={item.vatRate} onChange={(e) => onChange({ vatRate: Number(e.target.value) })}>
        {VAT_RATES.map((r) => (
          <option key={r} value={r}>
            {r} %
          </option>
        ))}
      </select>
      <span className="qrow-sum">{kr(sum)}</span>
      <span className="gallery-tools">
        <button type="button" aria-label="Flytta upp" onClick={() => onMove(-1)} disabled={index === 0}>
          ↑
        </button>
        <button type="button" aria-label="Flytta ner" onClick={() => onMove(1)} disabled={index === count - 1}>
          ↓
        </button>
        <button type="button" aria-label="Ta bort raden" onClick={onRemove}>
          ×
        </button>
      </span>
    </li>
  );
}

export default function QuoteEditor({ id, initial }: { id: string; initial: QuoteData }) {
  const [q, setQ] = useState(initial);
  const set = <K extends keyof QuoteData>(k: K) => (v: QuoteData[K]) => setQ((prev) => ({ ...prev, [k]: v }));
  const setCustomer = <K extends keyof QuoteCustomer>(k: K) => (v: QuoteCustomer[K]) =>
    setQ((prev) => ({ ...prev, customer: { ...prev.customer, [k]: v } }));
  const setTerm = (k: keyof QuoteData["terms"]) => (v: string) =>
    setQ((prev) => ({ ...prev, terms: { ...prev.terms, [k]: v } }));

  const t = quoteTotals(q);
  const isBygg = q.division === "bygg";
  const persons = q.rotPersons.length > 0 ? q.rotPersons : [{ name: "", personalNumber: "" }];
  const setPersonCount = (n: number) =>
    setQ((prev) => {
      const list = [...persons];
      while (list.length < n) list.push({ name: "", personalNumber: "" });
      return { ...prev, rotPersons: list.slice(0, n) };
    });
  const setPerson = (i: number, patch: Partial<RotPerson>) =>
    setQ((prev) => ({ ...prev, rotPersons: persons.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const isBusiness = q.customer.type === "foretag";
  const incl = q.pricesInclVat;

  const updateItem = (i: number, patch: Partial<QuoteItem>) =>
    setQ((prev) => ({ ...prev, items: prev.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));
  const moveItem = (i: number, d: number) =>
    setQ((prev) => {
      const j = i + d;
      if (j < 0 || j >= prev.items.length) return prev;
      const items = [...prev.items];
      [items[i], items[j]] = [items[j], items[i]];
      return { ...prev, items };
    });
  const addItem = () =>
    setQ((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { id: newItemId(), description: "", qty: 1, unit: isBygg ? "kpl" : "st", unitPrice: 0, vatRate: 25, kind: isBygg ? "labor" : "other" },
      ],
    }));

  /** Switching how prices are typed converts them, so the totals don't move. */
  const togglePrices = (nextIncl: boolean) =>
    setQ((prev) => ({
      ...prev,
      pricesInclVat: nextIncl,
      items: prev.items.map((it) => {
        const f = 1 + it.vatRate / 100;
        const price = nextIncl ? it.unitPrice * f : it.unitPrice / f;
        return { ...it, unitPrice: Math.round(price * 100) / 100 };
      }),
    }));

  return (
    <EditorForm action={saveQuote} hidden={{ id }} submitLabel="Spara offerten" value={q} initial={initial}>
      <datalist id="quote-units">
        {UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <fieldset className="efieldset">
        <legend>Offerten</legend>
        <div className="egrid">
          <TextField label="Rubrik" path="title" value={q.title} onChange={set("title")} placeholder={isBygg ? "Renovering av badrum" : "Ny webbplats"} wide />
          <TextField label="Datum" path="date" value={q.date} onChange={set("date")} placeholder="2026-10-15" />
          <TextField
            label="Giltig antal dagar"
            path="validDays"
            inputMode="numeric"
            value={q.validDays ? String(q.validDays) : ""}
            onChange={(v) => set("validDays")(Number(v.replace(/[^\d]/g, "")) || 0)}
            hint={q.date && q.validDays ? `Gäller till ${validUntil(q.date, q.validDays)}.` : undefined}
          />
          <TextField
            label="Betalningsvillkor, dagar"
            path="paymentDays"
            inputMode="numeric"
            value={String(q.paymentDays)}
            onChange={(v) => set("paymentDays")(Number(v.replace(/[^\d]/g, "")) || 0)}
            hint="Skrivs som ”30 dagar” i faktarutan. Betalplanen beskrivs under Villkor."
          />
          <TextArea label="Inledning" path="intro" value={q.intro} onChange={set("intro")} rows={4} hint="Några rader om vad ni gick igenom och vad offerten omfattar. Visas under rubriken." />
        </div>
      </fieldset>

      <fieldset className="efieldset">
        <legend>Kund</legend>
        <div className="calc-seg" role="group" aria-label="Kundtyp" style={{ marginBottom: 14 }}>
          <button type="button" aria-pressed={!isBusiness} onClick={() => setCustomer("type")("privat")}>
            Privatperson
          </button>
          <button type="button" aria-pressed={isBusiness} onClick={() => setCustomer("type")("foretag")}>
            Företag
          </button>
        </div>
        <div className="egrid">
          {isBusiness && (
            <>
              <TextField label="Företag" path="customer.company" value={q.customer.company} onChange={setCustomer("company")} placeholder="Bergs Bygg AB" />
              <TextField label="Organisationsnummer" path="customer.orgNr" value={q.customer.orgNr} onChange={setCustomer("orgNr")} placeholder="556xxx-xxxx" />
            </>
          )}
          <TextField label={isBusiness ? "Kontaktperson" : "Namn"} path="customer.name" value={q.customer.name} onChange={setCustomer("name")} placeholder="Anna Lindqvist" />
          {isBusiness && (
            <TextField label="Er referens (valfritt)" path="customer.reference" value={q.customer.reference} onChange={setCustomer("reference")} />
          )}
          <TextField label="E-post" path="customer.email" inputMode="email" value={q.customer.email} onChange={setCustomer("email")} hint="Behövs för att mejla offerten härifrån." />
          <TextField label="Telefon" path="customer.phone" inputMode="tel" value={q.customer.phone} onChange={setCustomer("phone")} />
          <div className="egrid egrid--address efield--wide">
            <TextField label={isBygg ? "Adress (där arbetet utförs)" : "Adress"} path="customer.street" value={q.customer.street} onChange={setCustomer("street")} />
            <TextField label="Postnummer" path="customer.postalCode" inputMode="numeric" value={q.customer.postalCode} onChange={setCustomer("postalCode")} />
            <TextField label="Ort" path="customer.city" value={q.customer.city} onChange={setCustomer("city")} />
          </div>
        </div>
      </fieldset>

      <fieldset className="efieldset">
        <legend>Rader</legend>
        <div className="qrows-head">
          <div className="calc-seg" role="group" aria-label="Hur priserna skrivs">
            <button type="button" aria-pressed={incl} onClick={() => !incl && togglePrices(true)}>
              Inkl. moms
            </button>
            <button type="button" aria-pressed={!incl} onClick={() => incl && togglePrices(false)}>
              Exkl. moms
            </button>
          </div>
          <span className="efield-hint">
            {incl ? "Priserna skrivs och visas inklusive moms, som privatpersoner är vana vid." : "Priserna skrivs och visas exklusive moms, som företag är vana vid."}
            {isBygg ? " Märk arbete och material: ROT räknas bara på arbete." : ""}
          </span>
        </div>
        {q.items.length > 0 && (
          <ol className="qrows">
            {q.items.map((it, i) => (
              <ItemRow
                key={it.id}
                item={it}
                index={i}
                count={q.items.length}
                incl={incl}
                showKind={isBygg}
                sum={incl ? t.lines[it.id].gross : t.lines[it.id].net}
                onChange={(patch) => updateItem(i, patch)}
                onMove={(d) => moveItem(i, d)}
                onRemove={() => setQ((prev) => ({ ...prev, items: prev.items.filter((_, j) => j !== i) }))}
              />
            ))}
          </ol>
        )}
        <button type="button" className="btn btn-ghost" onClick={addItem} style={{ marginTop: 12 }}>
          Lägg till rad
        </button>

        {isBygg && !isBusiness && (
          <div className="price-example">
            <label className="etoggle" style={{ marginTop: 0 }}>
              <input type="checkbox" checked={q.rot} onChange={(e) => set("rot")(e.target.checked)} />
              <span>Visa ROT-avdrag på offerten ({Math.round(ROT_RATE * 100)} % av arbetskostnaden, högst {kr(ROT_CAP)} per person och år)</span>
            </label>
            {q.rot && (
              <>
                <div className="efield" style={{ marginTop: 12, maxWidth: 280 }}>
                  <label htmlFor="rot-owners">Antal personer som delar på avdraget</label>
                  <select id="rot-owners" value={persons.length} onChange={(e) => setPersonCount(Number(e.target.value))}>
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="egrid" style={{ marginTop: 12 }}>
                  {persons.map((person, i) => (
                    <div key={i} className="egrid rot-person">
                      <TextField
                        label={`Person ${i + 1}, namn`}
                        path={`rotPersons.${i}.name`}
                        value={person.name}
                        placeholder={i === 0 ? q.customer.name : ""}
                        onChange={(v) => setPerson(i, { name: v })}
                      />
                      <TextField
                        label="Personnummer (valfritt)"
                        path={`rotPersons.${i}.personalNumber`}
                        inputMode="numeric"
                        value={person.personalNumber}
                        placeholder="ÅÅMMDD-XXXX"
                        onChange={(v) => setPerson(i, { personalNumber: v })}
                      />
                    </div>
                  ))}
                </div>
                <span className="efield-hint">
                  Varje person får sin del av avdraget på offerten. Personnumret behövs först när vi begär utbetalningen
                  från Skatteverket; lämna tomt tills kunden har godkänt.
                </span>
              </>
            )}
          </div>
        )}

        <dl className="qsum">
          <div>
            <dt>Summa exkl. moms</dt>
            <dd>{kr(t.net)}</dd>
          </div>
          {t.vatByRate.map((v) => (
            <div key={v.rate}>
              <dt>Moms {v.rate} %</dt>
              <dd>{kr(v.amount)}</dd>
            </div>
          ))}
          <div>
            <dt>Summa inkl. moms</dt>
            <dd>{kr(t.gross)}</dd>
          </div>
          {t.rot && (
            <div>
              <dt>ROT-avdrag{t.rot.capped ? " (begränsat av årstaket)" : ""}</dt>
              <dd>−{kr(t.rot.deduction)}</dd>
            </div>
          )}
          <div className="qsum-pay">
            <dt>{rotApplies(q) ? "Att betala efter ROT" : "Att betala"}</dt>
            <dd>{kr(t.pay)}</dd>
          </div>
        </dl>
      </fieldset>

      <fieldset className="efieldset">
        <legend>Villkor</legend>
        <p className="efield-hint">Förifyllt från Offertuppgifter och mallen. Tomma fält tas inte med på PDF:en.</p>
        <div className="egrid">
          <TextArea label="Betalning" path="terms.payment" value={q.terms.payment} onChange={setTerm("payment")} rows={3} />
          <TextArea label="Start och leverans" path="terms.start" value={q.terms.start} onChange={setTerm("start")} rows={2} placeholder="Preliminär start v. 46. Byggtid cirka 4 veckor." />
          <TextArea label="Garanti och försäkring" path="terms.warranty" value={q.terms.warranty} onChange={setTerm("warranty")} rows={2} />
          <TextArea label="Ingår inte" path="terms.excluded" value={q.terms.excluded} onChange={setTerm("excluded")} rows={3} />
          <TextArea label="Övrigt" path="terms.notes" value={q.terms.notes} onChange={setTerm("notes")} rows={3} />
        </div>
      </fieldset>
    </EditorForm>
  );
}
