"use client";

import { useState } from "react";
import { EditorForm, TextField } from "../content/EditorForm";
import { addTaxAction } from "@/app/admin/hr-actions";
import { TAX_SOURCES, TAX_SOURCE_LABEL } from "@/lib/core/hr/schema";
import { CheckField, DateField, Segmented, SelectField } from "./fields";

type TaxDraft = {
  kind: "table" | "none";
  tableNo: string;
  columnNo: string;
  mainEmployer: boolean;
  adjustment: "none" | "percent" | "amount";
  adjustmentPercent: string;
  adjustmentMonthlyChange: string;
  adjustmentValidTo: string;
  source: (typeof TAX_SOURCES)[number];
  validFrom: string;
  note: string;
};

/** A new row of tax data from a date; the old rows stay as history. */
export function TaxForm({ employeeId, today, previous }: { employeeId: string; today: string; previous: Partial<TaxDraft> | null }) {
  const initial: TaxDraft = {
    kind: "table",
    tableNo: "",
    columnNo: "1",
    mainEmployer: true,
    adjustment: "none",
    adjustmentPercent: "",
    adjustmentMonthlyChange: "",
    adjustmentValidTo: "",
    source: "a-skattsedel",
    note: "",
    ...previous,
    validFrom: today,
  };
  const [t, setT] = useState<TaxDraft>(initial);
  const set = <K extends keyof TaxDraft>(k: K) => (v: TaxDraft[K]) => setT((prev) => ({ ...prev, [k]: v }));
  return (
    <EditorForm action={addTaxAction} hidden={{ employeeId }} submitLabel="Spara skatteuppgifterna" value={t} initial={initial} savedNote="">
      <fieldset className="efieldset">
        <legend>Skatteavdrag</legend>
        <Segmented label="Sort" value={t.kind} options={[{ value: "table", label: "Skattetabell" }, { value: "none", label: "Inget skatteavdrag (beslut)" }]} onChange={set("kind")} />
        <div className="egrid hr-gap">
          {t.kind === "table" && (
            <>
              <CheckField label="Vi är huvudarbetsgivare" checked={t.mainEmployer} onChange={set("mainEmployer")} hint={t.mainEmployer ? "Tabell och kolumn från A-skattsedeln." : "Sidoinkomst: 30 % om inget jämkningsbeslut finns."} />
              <div />
              <TextField label="Tabell" path="tableNo" inputMode="numeric" value={t.tableNo} onChange={set("tableNo")} placeholder="33" />
              <TextField label="Kolumn" path="columnNo" inputMode="numeric" value={t.columnNo} onChange={set("columnNo")} hint="1 för de flesta; 3 för den som fyllt 66 vid årets början." />
            </>
          )}
          <SelectField label="Källa" path="source" value={t.source} options={TAX_SOURCES.map((s) => ({ value: s, label: TAX_SOURCE_LABEL[s] }))} onChange={set("source")} />
          <DateField label="Gäller från" path="validFrom" value={t.validFrom} onChange={set("validFrom")} />
        </div>
      </fieldset>
      {t.kind === "table" && (
        <fieldset className="efieldset">
          <legend>Jämkning</legend>
          <Segmented
            label="Jämkning"
            value={t.adjustment}
            options={[
              { value: "none", label: "Ingen" },
              { value: "percent", label: "Procent" },
              { value: "amount", label: "Belopp per månad" },
            ]}
            onChange={set("adjustment")}
          />
          {t.adjustment !== "none" && (
            <div className="egrid hr-gap">
              {t.adjustment === "percent" && <TextField label="Skatteavdrag, %" path="adjustmentPercent" inputMode="numeric" value={t.adjustmentPercent} onChange={set("adjustmentPercent")} />}
              {t.adjustment === "amount" && (
                <TextField label="Ändrad månadsinkomst, kr" path="adjustmentMonthlyChange" value={t.adjustmentMonthlyChange} onChange={set("adjustmentMonthlyChange")} hint="Minus för en sänkning, som i beslutet." />
              )}
              <DateField label="Beslutet gäller till" path="adjustmentValidTo" value={t.adjustmentValidTo} onChange={set("adjustmentValidTo")} />
            </div>
          )}
        </fieldset>
      )}
      <fieldset className="efieldset">
        <legend>Anteckning</legend>
        <TextField label="Till exempel beslutets nummer" path="note" value={t.note} onChange={set("note")} wide />
      </fieldset>
    </EditorForm>
  );
}
