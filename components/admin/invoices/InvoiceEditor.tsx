"use client";

import { useId, useState } from "react";
import { EditorForm, TextArea, TextField, useFieldError } from "../content/EditorForm";
import { saveInvoice } from "@/app/admin/invoice-actions";
import { formatOre, grossFromNet, kronorToOre, splitGross } from "@/lib/core/money";
import { rulesAt, addDays } from "@/lib/core/rules";
import {
  CUSTOMER_TYPES,
  CUSTOMER_TYPE_LABEL,
  LINE_KINDS,
  LINE_KIND_LABEL,
  VAT_RATES,
  lineForBuyer,
  reverseChargeFor,
  type CustomerType,
  type InvoiceDocument,
  type InvoiceLine,
  type RotBuyer,
} from "@/lib/core/documents/invoice";
import { invoiceTotals, customerSummary } from "@/lib/core/invoices/totals";

const UNITS = ["st", "tim", "m²", "lpm", "dag", "mån", "kpl"];

/** "12 500", "12500", "1 250,50" → kronor as a number. */
function parseNum(v: string): number {
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
const showKronor = (ore: number) => (ore === 0 ? "" : (ore / 100).toLocaleString("sv-SE", { maximumFractionDigits: 2 }).replace(/ /g, " "));
const showNum = (n: number) => (n === 0 ? "" : String(n).replace(".", ","));
const kr = (ore: number) => formatOre(ore, { decimals: 0, currency: true });
const newLineId = () => Math.random().toString(36).slice(2, 10);

function RowInput({ path, value, onChange, label, placeholder, inputMode, align }: { path: string; value: string; onChange: (v: string) => void; label: string; placeholder?: string; inputMode?: "text" | "decimal"; align?: "right" }) {
  const id = useId();
  const error = useFieldError(path);
  return (
    <div className={`efield${error ? " has-error" : ""}`}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input id={id} value={value} placeholder={placeholder} inputMode={inputMode} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)} title={error} style={align ? { textAlign: align } : undefined} />
    </div>
  );
}

function LineRow({ line, index, count, incl, sum, reverse, onChange, onMove, onRemove }: { line: InvoiceLine; index: number; count: number; incl: boolean; sum: number; reverse: boolean; onChange: (patch: Partial<InvoiceLine>) => void; onMove: (d: number) => void; onRemove: () => void }) {
  const p = `lines.${index}`;
  const shownPrice = incl ? grossFromNet(line.unitPriceOre, line.vatRate) : line.unitPriceOre;
  const setPrice = (v: string) => {
    const typed = kronorToOre(parseNum(v));
    onChange({ unitPriceOre: incl ? splitGross(typed, line.vatRate).net : typed });
  };
  return (
    <li className="qrow">
      <div className="qrow-desc">
        <input className="qrow-step" list="invoice-steps" value={line.section} maxLength={80} aria-label="Moment" placeholder="Moment (valfritt)" title="Rader med samma moment visas ihop på PDF:en" onChange={(e) => onChange({ section: e.target.value })} />
        <RowInput path={`${p}.description`} label="Beskrivning" value={line.description} placeholder="Vad ingår i raden" onChange={(v) => onChange({ description: v })} />
      </div>
      <select aria-label="Typ av rad" title="Arbete ger ROT-avdrag, material inte" value={line.kind} onChange={(e) => onChange({ kind: e.target.value as InvoiceLine["kind"] })} className="qrow-kind">
        {LINE_KINDS.map((k) => (
          <option key={k} value={k}>
            {LINE_KIND_LABEL[k]}
          </option>
        ))}
      </select>
      <RowInput path={`${p}.quantity`} label="Antal" value={showNum(line.quantity)} inputMode="decimal" align="right" placeholder="Antal" onChange={(v) => onChange({ quantity: parseNum(v) })} />
      <div className="efield">
        <label className="sr-only">Enhet</label>
        <input list="invoice-units" value={line.unit} maxLength={8} aria-label="Enhet" placeholder="Enhet" onChange={(e) => onChange({ unit: e.target.value })} />
      </div>
      <RowInput path={`${p}.unitPriceOre`} label={incl ? "à-pris inkl. moms" : "à-pris exkl. moms"} value={showKronor(shownPrice)} inputMode="decimal" align="right" placeholder={incl ? "à-pris inkl." : "à-pris exkl."} onChange={setPrice} />
      {reverse && line.vatCategory === "AE" ? (
        <select aria-label="Moms" value="AE" onChange={(e) => (e.target.value === "S" ? onChange({ vatCategory: "S", vatRate: 25 }) : null)} title="Omvänd betalningsskyldighet. Byt till vanlig moms bara för ren varuförsäljning.">
          <option value="AE">Omvänd</option>
          <option value="S">25 % (vara)</option>
        </select>
      ) : (
        <select aria-label="Moms" value={line.vatCategory === "S" ? line.vatRate : line.vatCategory === "AE" ? "AE" : "E"} onChange={(e) => (e.target.value === "AE" ? onChange({ vatCategory: "AE", vatRate: 0 }) : e.target.value === "E" ? onChange({ vatCategory: "E", vatRate: 0 }) : onChange({ vatCategory: "S", vatRate: Number(e.target.value) }))}>
          {VAT_RATES.filter((r) => r > 0).map((r) => (
            <option key={r} value={r}>
              {r} %
            </option>
          ))}
          <option value="E">Momsfri</option>
          {reverse && <option value="AE">Omvänd</option>}
        </select>
      )}
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

export default function InvoiceEditor({ id, initial }: { id: string; initial: InvoiceDocument }) {
  const [d, setD] = useState(initial);
  const [incl, setIncl] = useState(initial.buyer.type === "privat");
  const set = <K extends keyof InvoiceDocument>(k: K) => (v: InvoiceDocument[K]) => setD((prev) => ({ ...prev, [k]: v }));
  const setBuyer = <K extends keyof InvoiceDocument["buyer"]>(k: K) => (v: InvoiceDocument["buyer"][K]) => setD((prev) => ({ ...prev, buyer: { ...prev.buyer, [k]: v } }));
  const setPm = <K extends keyof InvoiceDocument["paymentMeans"]>(k: K) => (v: InvoiceDocument["paymentMeans"][K]) => setD((prev) => ({ ...prev, paymentMeans: { ...prev.paymentMeans, [k]: v } }));
  const setRef = <K extends keyof InvoiceDocument["references"]>(k: K) => (v: InvoiceDocument["references"][K]) => setD((prev) => ({ ...prev, references: { ...prev.references, [k]: v } }));

  const totals = invoiceTotals(d);
  const sum = customerSummary(d, totals);
  const rules = rulesAt(d.issueDate);
  const isPrivate = d.buyer.type === "privat";
  const reverse = d.se.reverseCharge;
  const isCredit = d.kind === "credit";

  const setCustomerType = (type: CustomerType) =>
    setD((prev) => {
      const rev = reverseChargeFor(type);
      const buyer = { ...prev.buyer, type };
      return {
        ...prev,
        buyer,
        lines: prev.lines.map((l) => lineForBuyer(l, buyer)),
        se: { ...prev.se, reverseCharge: rev, rot: type === "privat" ? prev.se.rot : null },
      };
    });

  const setTerms = (days: number) =>
    setD((prev) => ({ ...prev, paymentMeans: { ...prev.paymentMeans, termsDays: days, termsText: `${days} dagar netto` }, dueDate: addDays(prev.issueDate, days) }));
  const setIssueDate = (date: string) =>
    setD((prev) => ({ ...prev, issueDate: date, dueDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? addDays(date, prev.paymentMeans.termsDays) : prev.dueDate }));

  const updateLine = (i: number, patch: Partial<InvoiceLine>) => setD((prev) => ({ ...prev, lines: prev.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const moveLine = (i: number, dir: number) =>
    setD((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.lines.length) return prev;
      const lines = [...prev.lines];
      [lines[i], lines[j]] = [lines[j], lines[i]];
      return { ...prev, lines };
    });
  const addLine = () =>
    setD((prev) => ({
      ...prev,
      lines: [
        ...prev.lines,
        lineForBuyer({ id: newLineId(), description: "", quantity: 1, unit: "st", unitPriceOre: 0, vatCategory: "S", vatRate: 25, kind: "labor", section: prev.lines.at(-1)?.section ?? "", changeOrderId: null }, prev.buyer),
      ],
    }));

  const rot = d.se.rot;
  const setRot = (patch: Partial<NonNullable<InvoiceDocument["se"]["rot"]>> | null) =>
    setD((prev) => ({ ...prev, se: { ...prev.se, rot: patch === null ? null : { buyers: [{ name: prev.buyer.name, personalNumber: "", roomOre: null }], property: null, deductionOre: null, ...(prev.se.rot ?? {}), ...patch } } }));
  const buyers = rot?.buyers ?? [];
  const setBuyers = (list: RotBuyer[]) => setRot({ buyers: list });
  const setBuyerCount = (n: number) => {
    const list = [...buyers];
    while (list.length < n) list.push({ name: "", personalNumber: "", roomOre: null });
    setBuyers(list.slice(0, n));
  };

  return (
    <EditorForm action={saveInvoice} hidden={{ id }} submitLabel="Spara utkastet" value={d} initial={initial}>
      <datalist id="invoice-steps">
        {[...new Set(d.lines.map((l) => l.section.trim()).filter(Boolean))].map((step) => (
          <option key={step} value={step} />
        ))}
      </datalist>
      <datalist id="invoice-units">
        {UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>

      <fieldset className="efieldset">
        <legend>{isCredit ? "Kreditfakturan" : "Fakturan"}</legend>
        <div className="egrid">
          <TextField label="Rubrik" path="title" value={d.title} onChange={set("title")} placeholder="Badrumsrenovering, Bräckevägen 12" wide />
          <TextField label="Fakturadatum" path="issueDate" value={d.issueDate} onChange={setIssueDate} placeholder="2026-10-10" hint="Numret och låsningen sätts när du utfärdar; datumet går att ändra tills dess." />
          <TextField
            label="Betalningsvillkor, dagar"
            path="paymentMeans.termsDays"
            inputMode="numeric"
            value={String(d.paymentMeans.termsDays)}
            onChange={(v) => setTerms(Number(v.replace(/[^\d]/g, "")) || 0)}
            hint={`Förfaller ${d.dueDate}.`}
          />
          <TextField label="Arbetet utfört (datum eller period, valfritt)" path="deliveryDate" value={d.deliveryDate ?? ""} onChange={(v) => set("deliveryDate")(v || null)} placeholder="2026-10-09" hint="Momslagen vill ha datumet när det skiljer sig från fakturadatumet." />
          <TextField label="Vår referens" path="references.ourReference" value={d.references.ourReference} onChange={setRef("ourReference")} placeholder="Lämnas tomt används undertecknaren." />
          <TextField label="Ert ordernummer (valfritt)" path="references.orderReference" value={d.references.orderReference ?? ""} onChange={(v) => setRef("orderReference")(v.trim() ? v : undefined)} placeholder="Kundens beställnings- eller ordernummer" />
          <TextArea label="Text under rubriken" path="note" value={d.note} onChange={set("note")} rows={3} hint="Till exempel vilken offert och vilket steg i betalplanen fakturan avser." />
        </div>
      </fieldset>

      <fieldset className="efieldset">
        <legend>Kund</legend>
        <div className="calc-seg" role="group" aria-label="Kundtyp" style={{ marginBottom: 14 }}>
          {CUSTOMER_TYPES.map((t) => (
            <button key={t} type="button" aria-pressed={d.buyer.type === t} onClick={() => setCustomerType(t)}>
              {CUSTOMER_TYPE_LABEL[t].replace(" (omvänd betalningsskyldighet)", "")}
            </button>
          ))}
        </div>
        {reverse && (
          <p className="efield-hint" style={{ marginBottom: 12 }}>
            Byggtjänster till ett byggföretag faktureras utan moms, inte heller på materialet, med texten ”{rules.reverseCharge.text}” och köparens momsregistreringsnummer. Bara ren varuförsäljning får vanlig moms.
          </p>
        )}
        <div className="egrid">
          <TextField label={isPrivate ? "Namn" : "Företag"} path="buyer.name" value={d.buyer.name} onChange={setBuyer("name")} />
          {!isPrivate && <TextField label="Organisationsnummer" path="buyer.orgNr" value={d.buyer.orgNr} onChange={setBuyer("orgNr")} placeholder="556xxx-xxxx" />}
          {!isPrivate && <TextField label={reverse ? "Momsregistreringsnummer (krävs)" : "Momsregistreringsnummer"} path="buyer.vatNr" value={d.buyer.vatNr} onChange={setBuyer("vatNr")} placeholder="SE556xxxxxxx01" />}
          {!isPrivate && <TextField label="Er referens" path="buyer.reference" value={d.buyer.reference} onChange={setBuyer("reference")} />}
          <TextField label="E-post" path="buyer.email" inputMode="email" value={d.buyer.email} onChange={setBuyer("email")} hint="Fakturan mejlas hit." />
          <TextField label="Telefon" path="buyer.phone" inputMode="tel" value={d.buyer.phone} onChange={setBuyer("phone")} />
          <div className="egrid egrid--address efield--wide">
            <TextField label="Gatuadress" path="buyer.street" value={d.buyer.street} onChange={setBuyer("street")} />
            <TextField label="Postnummer" path="buyer.postalCode" inputMode="numeric" value={d.buyer.postalCode} onChange={setBuyer("postalCode")} />
            <TextField label="Ort" path="buyer.city" value={d.buyer.city} onChange={setBuyer("city")} />
          </div>
        </div>
      </fieldset>

      <fieldset className="efieldset">
        <legend>Rader</legend>
        <div className="qrows-head">
          <div className="calc-seg" role="group" aria-label="Hur priserna skrivs">
            <button type="button" aria-pressed={incl} onClick={() => setIncl(true)}>
              Inkl. moms
            </button>
            <button type="button" aria-pressed={!incl} onClick={() => setIncl(false)}>
              Exkl. moms
            </button>
          </div>
          <span className="efield-hint">
            Priserna lagras exkl. moms i öre; här skriver du dem {incl ? "inklusive" : "exklusive"} moms. PDF:en visar {isPrivate ? "beloppen inkl. moms och vad kunden betalar" : "beloppen exkl. moms"}. Märk arbete och material: ROT räknas bara på arbete.
          </span>
        </div>
        {d.lines.length > 0 && (
          <ol className="qrows">
            {d.lines.map((line, i) => (
              <LineRow key={line.id} line={line} index={i} count={d.lines.length} incl={incl} reverse={reverse} sum={incl ? totals.lines[line.id].gross : totals.lines[line.id].net} onChange={(patch) => updateLine(i, patch)} onMove={(dir) => moveLine(i, dir)} onRemove={() => setD((prev) => ({ ...prev, lines: prev.lines.filter((_, j) => j !== i) }))} />
            ))}
          </ol>
        )}
        <button type="button" className="btn btn-ghost" onClick={addLine} style={{ marginTop: 12 }}>
          Lägg till rad
        </button>

        {isPrivate && !isCredit && (
          <div className="price-example">
            <label className="etoggle" style={{ marginTop: 0 }}>
              <input type="checkbox" checked={Boolean(rot)} onChange={(e) => setRot(e.target.checked ? {} : null)} />
              <span>
                ROT-avdrag ({Math.round(rules.rot.rate * 100)} % av arbetet inkl. moms, högst {kr(rules.rot.capPerPerson)} per person och år)
              </span>
            </label>
            {rot && (
              <>
                <div className="egrid" style={{ marginTop: 12 }}>
                  <div className="efield">
                    <label htmlFor="rot-count">Antal köpare som delar på avdraget</label>
                    <select id="rot-count" value={Math.max(1, buyers.length)} onChange={(e) => setBuyerCount(Number(e.target.value))}>
                      {[1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="efield">
                    <label htmlFor="rot-prop-kind">Var arbetet utfördes</label>
                    <select
                      id="rot-prop-kind"
                      value={rot.property?.kind ?? ""}
                      onChange={(e) =>
                        setRot({
                          property: e.target.value === "fastighet" ? { kind: "fastighet", designation: "" } : e.target.value === "brf" ? { kind: "brf", orgNr: "", apartmentNumber: "" } : null,
                        })
                      }
                    >
                      <option value="">Välj…</option>
                      <option value="fastighet">Småhus, fastighetsbeteckning</option>
                      <option value="brf">Bostadsrätt, förening och lägenhetsnummer</option>
                    </select>
                  </div>
                  {rot.property?.kind === "fastighet" && (
                    <TextField label="Fastighetsbeteckning" path="se.rot.property.designation" value={rot.property.designation} onChange={(v) => setRot({ property: { kind: "fastighet", designation: v } })} placeholder="Göteborg Tolered 1:23" wide />
                  )}
                  {rot.property?.kind === "brf" && (
                    <>
                      <TextField label="Föreningens organisationsnummer" path="se.rot.property.orgNr" value={rot.property.orgNr} onChange={(v) => setRot({ property: { kind: "brf", orgNr: v, apartmentNumber: (rot.property as { apartmentNumber: string }).apartmentNumber } })} placeholder="769612-3456" />
                      <TextField label="Lägenhetsnummer" path="se.rot.property.apartmentNumber" value={rot.property.apartmentNumber} onChange={(v) => setRot({ property: { kind: "brf", orgNr: (rot.property as { orgNr: string }).orgNr, apartmentNumber: v } })} placeholder="1203" />
                    </>
                  )}
                  {(buyers.length ? buyers : [{ name: "", personalNumber: "", roomOre: null }]).map((b, i) => (
                    <div key={i} className="egrid rot-person efield--wide" style={{ gridTemplateColumns: "1.4fr 1fr 1fr" }}>
                      <TextField label={`Köpare ${i + 1}, namn`} path={`se.rot.buyers.${i}.name`} value={b.name} placeholder={i === 0 ? d.buyer.name : ""} onChange={(v) => setBuyers(buyers.map((x, j) => (j === i ? { ...x, name: v } : x)))} />
                      <TextField label="Personnummer" path={`se.rot.buyers.${i}.personalNumber`} inputMode="numeric" value={b.personalNumber} placeholder="ÅÅMMDD-XXXX" onChange={(v) => setBuyers(buyers.map((x, j) => (j === i ? { ...x, personalNumber: v } : x)))} />
                      <TextField
                        label="Utrymme kvar i år (kr, valfritt)"
                        path={`se.rot.buyers.${i}.roomOre`}
                        inputMode="numeric"
                        value={b.roomOre === null ? "" : showKronor(b.roomOre)}
                        placeholder="Fullt utrymme"
                        onChange={(v) => setBuyers(buyers.map((x, j) => (j === i ? { ...x, roomOre: v.trim() === "" ? null : kronorToOre(parseNum(v)) } : x)))}
                      />
                    </div>
                  ))}
                </div>
                <span className="efield-hint">
                  Personnummer och fastighet krävs för att utfärda. Personnumret krypteras när utkastet sparas och visas sedan som ÅÅÅÅMMDD-XXXX, även på fakturan; skriv ett nytt för att byta. Utrymmet är enligt kundens egen uppgift; Skatteverket avvisar en begäran som överskrider det.
                </span>
              </>
            )}
          </div>
        )}

        <dl className="qsum">
          {sum.byKind.map((k) => (
            <div key={k.kind}>
              <dt>{LINE_KIND_LABEL[k.kind]}</dt>
              <dd>{kr(k.amount)}</dd>
            </div>
          ))}
          <div>
            <dt>{sum.inclVat ? "Summa inkl. moms" : "Summa exkl. moms"}</dt>
            <dd>{kr(sum.subtotal)}</dd>
          </div>
          {totals.vatBreakdown
            .filter((r) => r.vat !== 0)
            .map((r) => (
              <div key={r.rate}>
                <dt>{sum.inclVat ? `varav moms ${r.rate} %` : `Moms ${r.rate} %`}</dt>
                <dd>{kr(r.vat)}</dd>
              </div>
            ))}
          {reverse && (
            <div>
              <dt>Moms</dt>
              <dd>Omvänd betalningsskyldighet</dd>
            </div>
          )}
          {sum.rot !== 0 && (
            <div>
              <dt>ROT-avdrag{totals.rot?.capped ? " (begränsat av utrymmet)" : ""}</dt>
              <dd>{kr(-sum.rot)}</dd>
            </div>
          )}
          <div className="qsum-pay">
            <dt>{isCredit ? "Att återfå" : "Att betala"}</dt>
            <dd>{kr(Math.abs(sum.payable))}</dd>
          </div>
        </dl>
      </fieldset>

      <fieldset className="efieldset">
        <legend>Betalning</legend>
        <div className="egrid egrid--three">
          <TextField label="Bankgiro" path="paymentMeans.bankgiro" value={d.paymentMeans.bankgiro} onChange={setPm("bankgiro")} />
          <TextField label="Swish-nummer (valfritt)" path="paymentMeans.swish" value={d.paymentMeans.swish} onChange={setPm("swish")} hint="Skrivs på fakturan med referensen som meddelande." />
          <TextField label="IBAN (valfritt)" path="paymentMeans.iban" value={d.paymentMeans.iban} onChange={setPm("iban")} />
          <TextArea label="Dröjsmålsränta" path="se.lateInterestText" value={d.se.lateInterestText} onChange={(v) => setD((prev) => ({ ...prev, se: { ...prev.se, lateInterestText: v } }))} rows={2} />
        </div>
        <span className="efield-hint" style={{ display: "block", marginTop: 10 }}>
          Referensen sätts när fakturan utfärdas: fakturanumret, eller OCR-numret (fakturanumret med längd- och kontrollsiffra) om bankgirot har OCR-avtal under Inställningar.
        </span>
      </fieldset>
    </EditorForm>
  );
}
