"use client";

import { useState } from "react";
import { EditorForm, TextArea, TextField } from "../content/EditorForm";
import { addEmploymentAction } from "@/app/admin/hr-actions";
import { applyFormPreset, type EmploymentDraft } from "@/lib/core/hr/draft";
import {
  EMPLOYMENT_FORMS,
  FEE_PERIODS,
  FEE_PERIOD_LABEL,
  FORM_HINT,
  FORM_SHORT,
  PAY_FORM_LABEL,
  PENSION_LABEL,
  PENSION_SCHEMES,
  VACATION_RULE_LABEL,
  maxProbationEnd,
  type Agreement,
} from "@/lib/core/hr/schema";
import { DateField, Segmented, SelectField } from "./fields";

const FORM_OPTIONS = EMPLOYMENT_FORMS.map((f) => ({ value: f, label: FORM_SHORT[f] }));
const PAY_OPTIONS = (["monthly", "hourly"] as const).map((p) => ({ value: p, label: PAY_FORM_LABEL[p] }));
const VACATION_OPTIONS = (["sammalon", "procent"] as const).map((v) => ({ value: v, label: VACATION_RULE_LABEL[v] }));
const PENSION_OPTIONS = PENSION_SCHEMES.map((p) => ({ value: p, label: PENSION_LABEL[p] }));
const FEE_OPTIONS = [{ value: "" as const, label: "Välj" }, ...FEE_PERIODS.map((p) => ({ value: p, label: FEE_PERIOD_LABEL[p] }))];

/**
 * A new contract, or (with `initial.contractId`) a new version of one:
 * pay rise, extension, new form. The fields follow the form; the presets
 * come from lib/core/hr/draft.ts and the person's collective agreement.
 */
export function EmploymentForm({ employeeId, agreement, initial }: { employeeId: string; agreement: Agreement; initial: EmploymentDraft }) {
  const [d, setD] = useState<EmploymentDraft>(initial);
  const set = <K extends keyof EmploymentDraft>(k: K) => (v: EmploymentDraft[K]) => setD((prev) => ({ ...prev, [k]: v }));
  const version = initial.contractId !== null;
  const board = d.form === "uppdrag";
  const fixedTerm = d.form === "vikariat" || d.form === "sava" || d.form === "sasong";

  return (
    <EditorForm action={addEmploymentAction} hidden={{ employeeId }} submitLabel={version ? "Spara den nya versionen" : "Spara anställningen"} value={d} initial={initial} savedNote="">
      <fieldset className="efieldset">
        <legend>{version ? "Ny version av avtalet" : "Anställningsform"}</legend>
        <Segmented label="Anställningsform" value={d.form} options={FORM_OPTIONS} onChange={(f) => setD((prev) => applyFormPreset(prev, f, agreement))} />
        <p className="efield-hint hr-hint">{FORM_HINT[d.form]}</p>
        <div className="egrid">
          {version && (
            <>
              <DateField label="Gäller från" path="validFrom" value={d.validFrom} onChange={set("validFrom")} hint="Den förra versionen stängs dagen före. Den ändras aldrig." />
              <TextField label="Skäl till ändringen" path="changeReason" value={d.changeReason} onChange={set("changeReason")} placeholder="Lönerevision, förlängning, ny omfattning…" />
            </>
          )}
          <DateField label={board ? "Från (stämmans beslut)" : "Tillträde"} path="startsOn" value={d.startsOn} onChange={set("startsOn")} />
          {d.form !== "tillsvidare" && d.form !== "provanstallning" && (
            <DateField
              label={fixedTerm ? "Slutdag" : "Slutdag (valfritt)"}
              path="endsOn"
              value={d.endsOn}
              onChange={set("endsOn")}
              hint={d.form === "vikariat" ? "Lämna tomt om vikariatet gäller tills personen kommer tillbaka." : undefined}
            />
          )}
          {d.form === "provanstallning" && (
            <DateField
              label="Provanställningen slutar"
              path="probationEndsOn"
              value={d.probationEndsOn}
              onChange={set("probationEndsOn")}
              hint={/^\d{4}-\d{2}-\d{2}$/.test(d.startsOn) ? `Högst sex månader: senast ${maxProbationEnd(d.startsOn)}.` : undefined}
            />
          )}
          {d.form === "vikariat" && <TextField label="Vikarierar för" path="substituteFor" value={d.substituteFor} onChange={set("substituteFor")} placeholder="Namn och skäl, eller vilken vakant tjänst" />}
          {board && <TextField label="Stämmans beslut" path="decisionReference" value={d.decisionReference} onChange={set("decisionReference")} placeholder="Årsstämma 2026-05-20, § 9" />}
        </div>
      </fieldset>

      <fieldset className="efieldset">
        <legend>{board ? "Arvode" : "Lön"}</legend>
        <div className="egrid">
          {!board && <Segmented label="Löneform" value={d.payForm === "fee" ? "monthly" : d.payForm} options={PAY_OPTIONS} onChange={set("payForm")} />}
          {!board && <div />}
          {d.payForm === "monthly" && <TextField label="Månadslön, kr" path="monthlySalary" inputMode="numeric" value={d.monthlySalary} onChange={set("monthlySalary")} placeholder="35 000" />}
          {d.payForm === "hourly" && <TextField label="Timlön, kr" path="hourlyRate" inputMode="numeric" value={d.hourlyRate} onChange={set("hourlyRate")} placeholder="185,50" />}
          {board && <TextField label="Arvode, kr" path="fee" inputMode="numeric" value={d.fee} onChange={set("fee")} placeholder="20 000" />}
          {board && <SelectField label="Per" path="feePeriod" value={d.feePeriod} options={FEE_OPTIONS} onChange={set("feePeriod")} />}
          <TextField label="Lönedag" path="payDay" inputMode="numeric" value={d.payDay} onChange={set("payDay")} hint="Dag i månaden." />
        </div>
      </fieldset>

      {!board && (
        <fieldset className="efieldset">
          <legend>Arbete och tid</legend>
          <div className="egrid">
            <TextField label="Befattning" path="title" value={d.title} onChange={set("title")} placeholder="Snickare, projektledare…" />
            <TextField label="Arbetsplats" path="workplace" value={d.workplace} onChange={set("workplace")} hint="Tomt: arbetsgivarens byggarbetsplatser." />
            <TextField label="Omfattning, % av heltid" path="workingTimePercent" inputMode="numeric" value={d.workingTimePercent} onChange={set("workingTimePercent")} />
            <TextField label="Timmar per vecka" path="weeklyHours" inputMode="numeric" value={d.weeklyHours} onChange={set("weeklyHours")} />
            <TextField label="Arbetstidsförkortning, timmar per år" path="atfHoursPerYear" inputMode="numeric" value={d.atfHoursPerYear} onChange={set("atfHoursPerYear")} />
            <TextField
              label="Uppsägningstid, dagar (valfritt)"
              path="noticeDays"
              inputMode="numeric"
              value={d.noticeDays}
              onChange={set("noticeDays")}
              hint={fixedTerm ? "Bara om ni avtalat att den kan sägas upp i förtid." : d.form === "vd" ? "Ömsesidig, enligt VD-avtalet." : "Tomt: LAS 11 § eller kollektivavtalet."}
            />
          </div>
        </fieldset>
      )}

      {!board && (
        <fieldset className="efieldset">
          <legend>Semester och pension</legend>
          <div className="egrid">
            <Segmented label="Semesterlön" value={d.vacationRule === "none" ? "sammalon" : d.vacationRule} options={VACATION_OPTIONS} onChange={set("vacationRule")} />
            <div />
            <TextField label="Semesterdagar" path="vacationDays" inputMode="numeric" value={d.vacationDays} onChange={set("vacationDays")} />
            {d.vacationRule === "procent" && <TextField label="Semesterlön, %" path="vacationPercent" inputMode="numeric" value={d.vacationPercent} onChange={set("vacationPercent")} hint="12 % enligt lagen, 13 % i Byggavtalet." />}
            <SelectField label="Tjänstepension" path="pensionScheme" value={d.pensionScheme} options={PENSION_OPTIONS} onChange={set("pensionScheme")} />
          </div>
        </fieldset>
      )}

      <fieldset className="efieldset">
        <legend>Övriga villkor</legend>
        <TextArea label="Skrivs i avtalet" path="terms" value={d.terms} onChange={set("terms")} rows={3} placeholder={d.form === "vd" ? "Avgångsvederlag, bil, konkurrensklausul…" : "Tjänstebil, mobil, särskilda villkor…"} />
      </fieldset>
    </EditorForm>
  );
}
