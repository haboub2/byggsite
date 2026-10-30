import Link from "next/link";
import { formatWhen } from "@/lib/admin-format";
import { formatOre } from "@/lib/core/money";
import { monthLabel } from "@/lib/core/payroll/format";
import { AGI_BOX_LABEL, AGI_AMOUNT_BOXES, agiFileName, type AgiBox, type AgiTick } from "@/lib/core/payroll/agi";
import { AGI_FORMAT, FORA_FORMAT } from "@/lib/core/rules/agi-format";
import { agiDueFor, type PayrollSettings } from "@/lib/core/payroll/settings";
import { foraDueDate } from "@/lib/core/payroll/fora";
import {
  AGI_STATUS_LABEL,
  foraLines,
  listAgiDeclarations,
  listPensionReports,
  listRepayments,
  listVaxaClaims,
  previewAgi,
  previewYearEnd,
  storedAgiDiff,
  vaxaStodFor,
} from "@/lib/core/payroll/authorities-store";
import {
  addRepaymentAction,
  closeYearAction,
  markAgiFiledAction,
  markForaFiledAction,
  storeAgiAction,
  storeForaAction,
  storeVaxaAction,
} from "@/app/admin/authorities-actions";

/**
 * Lönerapporter's phase 4 sections (docs/hr-lon.md, sections 8 and 11):
 * the AGI per month with its versions and the diff before a refile, Fora,
 * växa-stöd and the year-end. Server components; the actions are
 * owner/admin, the accountant sees everything but the buttons. A section
 * whose data cannot be read (a migration not yet applied) says so instead
 * of taking the page down.
 */

const kr = (ore: number) => formatOre(ore, { decimals: 0, currency: true });
const days = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

function Unavailable({ what, error }: { what: string; error: unknown }) {
  return (
    <p className="hr-muted">
      {what} kan inte visas: {error instanceof Error ? error.message : "okänt fel"}
    </p>
  );
}

/** A month picker that keeps the other query parameters. */
function MonthPicker({ name, value, months, keep }: { name: string; value: string; months: readonly string[]; keep: Record<string, string> }) {
  return (
    <form method="get" className="hr-inline">
      {Object.entries(keep).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <select name={name} defaultValue={value} className="tg-select" aria-label="Månad">
        {[...new Set([value, ...months])].sort().reverse().map((m) => (
          <option key={m} value={m}>
            {monthLabel(m)}
          </option>
        ))}
      </select>
      <button className="btn btn-ghost hr-btn-small" type="submit">
        Visa
      </button>
    </form>
  );
}

const boxValue = (code: AgiBox | AgiTick, v: number | boolean | null) => (v === null ? "–" : typeof v === "boolean" ? (v ? "ja" : "nej") : kr(v));

/* ---------- AGI ---------- */

export async function AgiSection({ period, months, settings, canApprove, keep }: { period: string; months: readonly string[]; settings: PayrollSettings; canApprove: boolean; keep: Record<string, string> }) {
  let data;
  try {
    const [preview, declarations, repayments] = await Promise.all([previewAgi(period), listAgiDeclarations(), listRepayments(period)]);
    const versions = declarations.filter((d) => d.period === period);
    const diffs = await Promise.all(versions.map((v) => storedAgiDiff(v.id)));
    data = { preview, versions, repayments, diffs };
  } catch (err) {
    return (
      <div className="hr-card" id="agi">
        <h2 className="hr-h2">Arbetsgivardeklaration (AGI)</h2>
        <Unavailable what="Arbetsgivardeklarationen" error={err} />
      </div>
    );
  }
  const { preview, versions, repayments, diffs } = data;
  const { build, latest, records, diff, unchanged } = preview;
  const due = agiDueFor(period, settings);
  const nextVersion = (latest?.version ?? 0) + 1;
  const bySpec = new Map(records.map((r) => [r.employeeId, r]));
  const shown: AgiBox[] = AGI_AMOUNT_BOXES.filter((b) => b === "001" || b === "011" || build.totals.boxes[b] !== 0);
  return (
    <div className="hr-card" id="agi">
      <div className="hr-card-head">
        <h2 className="hr-h2">Arbetsgivardeklaration (AGI)</h2>
        <MonthPicker name="agi" value={period} months={months} keep={keep} />
      </div>
      <p className="hr-muted">
        Lön som betalades ut i {monthLabel(period)} ({build.runIds.length === 1 ? "en stängd körning" : `${build.runIds.length} stängda körningar`}), ur de frysta lönebeskeden. Lämnas och betalas senast{" "}
        <strong>{due.declareBy}</strong>
        {due.payBy !== due.declareBy ? ` (betalningen senast ${due.payBy})` : ""}. Filen följer Skatteverkets schema {AGI_FORMAT.schemaVersion} (teknisk beskrivning {AGI_FORMAT.technicalDescription}); den skickas aldrig härifrån utan laddas upp och signeras i Skatteverkets e-tjänst.
      </p>
      {build.problems.length > 0 && (
        <ul className="lon-checks">
          {build.problems.map((p) => (
            <li key={p} data-level="block">
              {p}
            </li>
          ))}
        </ul>
      )}
      {build.people.length === 0 ? (
        <p className="hr-muted">Ingen stängd körning med lönedag i {monthLabel(period)}. En månad utan lön ska ändå deklareras (nolldeklaration) om du är registrerad som arbetsgivare.</p>
      ) : (
        <div className="hr-table-wrap">
          <table className="org-table">
            <thead>
              <tr>
                <th>Person</th>
                <th className="tg-num">Spec.nr</th>
                {shown.map((b) => (
                  <th key={b} className="tg-num" title={AGI_BOX_LABEL[b]}>
                    {b} {AGI_BOX_LABEL[b].toLowerCase()}
                  </th>
                ))}
                <th>050/051</th>
                <th>Avgift</th>
              </tr>
            </thead>
            <tbody>
              {build.people.map((p) => (
                <tr key={p.employeeId}>
                  <td>
                    <Link href={`/admin/personal/${p.employeeId}?flik=lon`}>{p.name}</Link>
                    <small className="hr-muted"> {bySpec.get(p.employeeId)?.pnrMasked}</small>
                  </td>
                  <td className="tg-num">{bySpec.get(p.employeeId)?.specNo}</td>
                  {shown.map((b) => (
                    <td key={b} className="tg-num">
                      {kr(p.boxes[b])}
                    </td>
                  ))}
                  <td>{[p.ticks["050"] && "bilers.", p.ticks["051"] && "trakt."].filter(Boolean).join(", ")}</td>
                  <td>
                    {p.contributions.map((c) => `${String(c.ratePercent).replace(".", ",")} %`).join(" + ") || "ingen"}
                    {p.repaymentIds.length ? " · återbetalt" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={2}>Summa</th>
                {shown.map((b) => (
                  <th key={b} className="tg-num">
                    {kr(build.totals.boxes[b])}
                  </th>
                ))}
                <th colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p>
        Ruta 487 arbetsgivaravgifter <strong>{kr(build.totals.contributionsOre)}</strong>
        {build.totals.contributionRows.length > 0 && (
          <span className="hr-muted">
            {" "}
            ({build.totals.contributionRows.map((r) => `${kr(r.baseOre)} × ${String(r.ratePercent).replace(".", ",")} % = ${kr(r.amountOre)}`).join("; ")})
          </span>
        )}
        , ruta 497 skatteavdrag <strong>{kr(build.totals.taxOre)}</strong>. Till skattekontot: <strong>{kr(build.totals.contributionsOre + build.totals.taxOre)}</strong>.
      </p>

      {latest && (
        <div className="hr-stack">
          <h3 className="hr-h3">{unchanged ? `Ingenting har ändrats sedan version ${latest.version}` : `Ändringar mot version ${latest.version} (${AGI_STATUS_LABEL[latest.status].toLowerCase()})`}</h3>
          {!unchanged &&
            (diff.length === 0 ? (
              <p className="hr-muted">Bara summorna har ändrats.</p>
            ) : (
              <table className="org-table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Ändring</th>
                    <th>Ruta</th>
                    <th className="tg-num">Före</th>
                    <th className="tg-num">Efter</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.flatMap((d) =>
                    (d.fields.length ? d.fields : [null]).map((f, i) => (
                      <tr key={`${d.employeeId}-${f?.code ?? i}`}>
                        <td>{i === 0 ? `${d.name} (${d.specNo})` : ""}</td>
                        <td>{i === 0 ? { added: "Ny", removed: "Borttag", changed: "Ändrad" }[d.change] : ""}</td>
                        <td>{f ? `${f.code} ${AGI_BOX_LABEL[f.code].toLowerCase()}` : ""}</td>
                        <td className="tg-num">{f ? boxValue(f.code, f.before) : ""}</td>
                        <td className="tg-num">{f ? boxValue(f.code, f.after) : ""}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            ))}
        </div>
      )}

      {canApprove && (
        <form action={storeAgiAction} className="hr-inline">
          <input type="hidden" name="period" value={period} />
          <button className="btn btn-primary hr-btn-small" type="submit" disabled={unchanged || build.problems.length > 0}>
            {latest ? `Skapa version ${nextVersion} (omprövning)` : "Skapa AGI-filen"}
          </button>
          <span className="hr-muted">Filen fryses med sin SHA-256 och personnumren läses fram (loggas per person).</span>
        </form>
      )}

      {versions.length > 0 && (
        <div className="hr-table-wrap">
          <table className="org-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Skapad</th>
                <th>Status</th>
                <th className="tg-num">487</th>
                <th className="tg-num">497</th>
                <th>Ändrade</th>
                <th>SHA-256</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {versions.map((v, i) => (
                <tr key={v.id}>
                  <td>{v.version}</td>
                  <td>{formatWhen(v.createdAt)}</td>
                  <td>
                    {AGI_STATUS_LABEL[v.status]}
                    {v.status === "corrected" && !v.filedAt ? " (aldrig lämnad)" : ""}
                    {v.filedAt ? ` ${formatWhen(v.filedAt)}` : ""}
                  </td>
                  <td className="tg-num">{kr(v.contributionsOre)}</td>
                  <td className="tg-num">{kr(v.taxOre)}</td>
                  <td>{v.version === 1 ? "–" : diffs[i].length ? diffs[i].map((d) => d.name).join(", ") : "summor"}</td>
                  <td>
                    <code>{v.sha256.slice(0, 12)}…</code>
                  </td>
                  <td className="hr-inline">
                    {canApprove && (
                      <a className="btn btn-ghost hr-btn-small" href={`/admin/rapporter/agi/${v.id}`}>
                        {agiFileName(v.period, v.version)}
                      </a>
                    )}
                    {canApprove && v.status === "draft" && (
                      <form action={markAgiFiledAction}>
                        <input type="hidden" name="id" value={v.id} />
                        <button className="btn btn-ghost hr-btn-small" type="submit">
                          Markera som lämnad
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {repayments.length > 0 && (
        <ul className="hr-history">
          {repayments.map((r) => (
            <li key={r.id}>
              {build.people.find((p) => p.employeeId === r.employeeId)?.name ?? "Person"}: {kr(r.amountOre)} återbetalt {r.repaidOn}
              <small>{r.reason} · sänker ruta 011 och avgifterna för {monthLabel(r.period)}, inte skatten</small>
            </li>
          ))}
        </ul>
      )}
      {canApprove && build.people.length > 0 && (
        <details className="hr-details">
          <summary>Registrera återbetald lön (återkrav)</summary>
          <form action={addRepaymentAction} className="tg-fields hr-gap">
            <div className="efield">
              <label htmlFor="rp-slip">Person</label>
              <select id="rp-slip" name="payslipId" className="tg-select" required>
                {build.people.map((p) => (
                  <option key={p.employeeId} value={p.payslipIds[0]}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="efield">
              <label htmlFor="rp-amount">Brutto som betalats tillbaka (kr)</label>
              <input id="rp-amount" name="amount" inputMode="decimal" required />
            </div>
            <div className="efield">
              <label htmlFor="rp-date">Betalt tillbaka</label>
              <input id="rp-date" name="repaidOn" type="date" required />
            </div>
            <div className="efield tg-wide">
              <label htmlFor="rp-reason">Varför</label>
              <input id="rp-reason" name="reason" required minLength={3} />
            </div>
            <button className="btn btn-ghost hr-btn-small" type="submit">
              Registrera
            </button>
          </form>
        </details>
      )}
      <p className="hr-muted">
        Lön redovisas den månad den betalas ut: en rättelse i en senare körning (retroaktiv lön, eller för mycket utbetalt som dras av på en senare lön) hamnar i den månadens AGI och den här månaden ändras inte. Bara lön som den
        anställde betalar tillbaka rättar den månad den betalades: ruta 011 och avgifterna sänks, skatten (001) står kvar och regleras i den anställdes deklaration (Skatteverket, &quot;Rätta en arbetsgivardeklaration&quot;). Avgifterna räknar Skatteverket själv ur
        individuppgifterna; 487 och 497 är summorna de jämför med. Filen kan provas i <a href={AGI_FORMAT.testService}>Skatteverkets testtjänst</a> före den riktiga uppladdningen.
      </p>
    </div>
  );
}

/* ---------- Fora ---------- */

export async function ForaSection({ period, months, settings, canApprove, keep }: { period: string; months: readonly string[]; settings: PayrollSettings; canApprove: boolean; keep: Record<string, string> }) {
  let data;
  try {
    const [lines, reports] = await Promise.all([foraLines(period), listPensionReports()]);
    data = { lines, reports: reports.filter((r) => r.period === period && r.scheme === "fora") };
  } catch (err) {
    return (
      <div className="hr-card" id="fora">
        <h2 className="hr-h2">Fora (Avtalspension SAF-LO)</h2>
        <Unavailable what="Fora-underlaget" error={err} />
      </div>
    );
  }
  const { lines, reports } = data;
  const total = lines.reduce((s, l) => s + l.payOre, 0);
  const fok = settings.pension.foraFokId;
  return (
    <div className="hr-card" id="fora">
      <div className="hr-card-head">
        <h2 className="hr-h2">Fora (Avtalspension SAF-LO)</h2>
        <MonthPicker name="fora" value={period} months={months} keep={keep} />
      </div>
      <p className="hr-muted">
        Arbetarnas kontanta bruttolön utbetald i {monthLabel(period)} (lön, sjuklön, semesterlön, OB och övertid; inte förmåner, bilersättning eller traktamente), rapporteras senast <strong>{foraDueDate(period)}</strong> på Foras Mina sidor.
        {settings.pension.foraCustomerNo ? ` Kundnummer ${settings.pension.foraCustomerNo}.` : ""}
      </p>
      {!fok && (
        <p className="hr-badge" data-tone="alert">
          FOK-ID saknas: fyll i det i <Link href="/admin/installningar/lon#pension">Inställningar › Lön</Link>.
        </p>
      )}
      {lines.length === 0 ? (
        <p className="hr-muted">Ingen med SAF-LO fick lön utbetald i {monthLabel(period)} i en stängd körning.</p>
      ) : (
        <table className="org-table">
          <thead>
            <tr>
              <th>Arbetare</th>
              <th className="tg-num">Bruttolön</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.employeeId}>
                <td>{l.name}</td>
                <td className="tg-num">{kr(l.payOre)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>Summa</th>
              <th className="tg-num">{kr(total)}</th>
            </tr>
          </tfoot>
        </table>
      )}
      {canApprove && lines.length > 0 && (
        <form action={storeForaAction} className="hr-inline">
          <input type="hidden" name="period" value={period} />
          <button className="btn btn-primary hr-btn-small" type="submit" disabled={!fok}>
            {reports.length ? `Skapa version ${reports[0].version + 1}` : "Skapa Fora-underlaget"}
          </button>
        </form>
      )}
      {reports.length > 0 && (
        <ul className="hr-history">
          {reports.map((r) => (
            <li key={r.id}>
              Version {r.version}: {kr(r.totalOre)}, {AGI_STATUS_LABEL[r.status].toLowerCase()}
              {r.filedAt ? ` ${formatWhen(r.filedAt)}` : ""}{" "}
              {canApprove && (
                <span className="hr-inline">
                  <a className="btn btn-ghost hr-btn-small" href={`/admin/rapporter/fora/${r.id}`}>
                    Ladda ner
                  </a>
                  {r.status === "draft" && (
                    <form action={markForaFiledAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="btn btn-ghost hr-btn-small" type="submit">
                        Markera som rapporterad
                      </button>
                    </form>
                  )}
                </span>
              )}
              <small>SHA-256 {r.sha256.slice(0, 12)}… · skapad {formatWhen(r.createdAt)}</small>
            </li>
          ))}
        </ul>
      )}
      <p className="hr-muted">
        Foras egen filuppladdning är en JSON-fil enligt en specifikation som bara lönesystemens leverantörer får; filen här är en lista med det den manuella inmatningen frågar efter ({FORA_FORMAT.columns.join(", ")}). Lön som hör till andra månader (bonus, ackord, sparad semester vid slutet) delas inte upp.
      </p>
    </div>
  );
}

/* ---------- växa-stöd ---------- */

export async function VaxaSection({ period, months, canApprove, keep }: { period: string; months: readonly string[]; canApprove: boolean; keep: Record<string, string> }) {
  let data;
  try {
    const [basis, claims, declarations] = await Promise.all([vaxaStodFor(period), listVaxaClaims(), listAgiDeclarations()]);
    data = { basis, claims: claims.filter((c) => c.period === period), filed: declarations.some((d) => d.period === period && d.status === "filed") };
  } catch (err) {
    return (
      <div className="hr-card" id="vaxa">
        <h2 className="hr-h2">Växa-stöd</h2>
        <Unavailable what="Växa-stödets underlag" error={err} />
      </div>
    );
  }
  const { basis, claims, filed } = data;
  const open = basis.rows.filter((r) => r.eligible && !claims.some((c) => c.employeeId === r.employeeId));
  return (
    <div className="hr-card" id="vaxa">
      <div className="hr-card-head">
        <h2 className="hr-h2">Växa-stöd</h2>
        <MonthPicker name="vaxa" value={period} months={months} keep={keep} />
      </div>
      <p className="hr-muted">
        Från 2026 betalar lönen full avgift och du ansöker i efterhand per månad i Skatteverkets e-tjänst &quot;Ansök om växa-stöd&quot;, efter att månadens AGI är lämnad och senast <strong>{basis.applyBy}</strong>. Vilka som räknas som de första
        anställda väljer du i <Link href="/admin/installningar/lon#vaxaStod">Inställningar › Lön</Link>; villkoren om företaget, närstående och stöd av mindre betydelse intygar du i e-tjänsten.
      </p>
      {basis.rows.length === 0 ? (
        <p className="hr-muted">Ingen vald och ingen lön i {monthLabel(period)}.</p>
      ) : (
        <table className="org-table">
          <thead>
            <tr>
              <th>Person</th>
              <th className="tg-num">Månad</th>
              <th className="tg-num">Avgiftsunderlag</th>
              <th className="tg-num">Tak</th>
              <th className="tg-num">Återbetalning</th>
              <th>Rätt till stöd</th>
            </tr>
          </thead>
          <tbody>
            {basis.rows.map((r) => (
              <tr key={r.employeeId}>
                <td>{r.name}</td>
                <td className="tg-num">{r.monthNo ?? "–"}</td>
                <td className="tg-num">{kr(r.baseOre)}</td>
                <td className="tg-num">{kr(r.capOre)}</td>
                <td className="tg-num">{r.eligible ? kr(r.refundOre) : "–"}</td>
                <td>{r.eligible ? (claims.some((c) => c.employeeId === r.employeeId) ? "Ja, ansökt" : "Ja") : `Nej: ${r.reasons.join("; ")}`}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={4}>Att ansöka om (21,21 % av underlaget upp till taket, ören bort)</th>
              <th className="tg-num">{kr(basis.totalRefundOre)}</th>
              <th />
            </tr>
          </tfoot>
        </table>
      )}
      {canApprove && open.length > 0 && (
        <form action={storeVaxaAction} className="hr-inline">
          <input type="hidden" name="period" value={period} />
          <button className="btn btn-ghost hr-btn-small" type="submit" disabled={!filed}>
            Registrera att ansökan är gjord
          </button>
          {!filed && <span className="hr-muted">Lämna månadens AGI först.</span>}
        </form>
      )}
    </div>
  );
}

/* ---------- årsskiftet ---------- */

export async function YearEndSection({ year, today, canApprove, keep }: { year: number; today: string; canApprove: boolean; keep: Record<string, string> }) {
  let p;
  try {
    p = await previewYearEnd(year, today);
  } catch (err) {
    return (
      <div className="hr-card" id="arsskifte">
        <h2 className="hr-h2">Årsskiftet</h2>
        <Unavailable what="Årsskiftet" error={err} />
      </div>
    );
  }
  const thisYear = Number(today.slice(0, 4));
  const rows = p.closed ? p.closed.semester : p.rows;
  const summary = p.closed ? p.closed.summary : p.summary;
  return (
    <div className="hr-card" id="arsskifte">
      <div className="hr-card-head">
        <h2 className="hr-h2">Årsskiftet {year}</h2>
        <form method="get" className="hr-inline">
          {Object.entries(keep).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <select name="ar" defaultValue={String(year)} className="tg-select" aria-label="År">
            {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button className="btn btn-ghost hr-btn-small" type="submit">
            Visa
          </button>
        </form>
      </div>
      <h3 className="hr-h3">
        Semester: {p.closing.from} – {p.closing.to} stängs, {p.opening.from} – {p.opening.to} öppnas
      </h3>
      {rows.length === 0 ? (
        <p className="hr-muted">Ingen hade semester det semesteråret.</p>
      ) : (
        <div className="hr-table-wrap">
          <table className="org-table">
            <thead>
              <tr>
                <th>Person</th>
                <th className="tg-num">Intjänade</th>
                <th className="tg-num">Uttagna</th>
                <th className="tg-num">Sparas</th>
                <th className="tg-num">Förfaller (ej uttagna)</th>
                <th className="tg-num">Sparade som gick ut</th>
                <th className="tg-num">Nytt år: betalda dagar</th>
                <th className="tg-num">Nytt år: sparade</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employeeId}>
                  <td>{r.name}</td>
                  <td className="tg-num">{days(r.closing.earnedDays)}</td>
                  <td className="tg-num">
                    {days(r.closing.takenDays)}
                    {r.closing.takenFromSavedDays ? ` (${days(r.closing.takenFromSavedDays)} sparade)` : ""}
                  </td>
                  <td className="tg-num">{days(r.closing.savedDays)}</td>
                  <td className="tg-num">{r.lapsedDays ? days(r.lapsedDays) : ""}</td>
                  <td className="tg-num">{r.expiredDays ? days(r.expiredDays) : ""}</td>
                  <td className="tg-num">{r.opening ? days(r.opening.earnedDays) : "slutat"}</td>
                  <td className="tg-num">{r.opening ? days(r.opening.savedInDays) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="hr-muted">Sparade dagar: bara dagar över 20, bara ej uttagna, och inga ett år då sparade dagar tagits ut (semesterlagen 18 §); sparade dagar gäller i fem år.</p>

      <h3 className="hr-h3">Årssammanställning per person {p.closed ? `(sparad vid årsskiftet ${formatWhen(p.closed.closedAt)})` : year >= thisYear ? "(hittills i år)" : ""}</h3>
      {summary.length === 0 ? (
        <p className="hr-muted">Inga lönebesked i stängda körningar med lönedag {year}.</p>
      ) : (
        <div className="hr-table-wrap">
          <table className="org-table">
            <thead>
              <tr>
                <th>Person</th>
                <th className="tg-num">Lönebesked</th>
                <th className="tg-num">Bruttolön</th>
                <th className="tg-num">Förmåner</th>
                <th className="tg-num">Skattefritt</th>
                <th className="tg-num">Skatt</th>
                <th className="tg-num">Netto</th>
                <th className="tg-num">Avgifter</th>
                <th>Årsbesked</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((r) => (
                <tr key={r.employeeId}>
                  <td>{r.name}</td>
                  <td className="tg-num">{r.payslips}</td>
                  <td className="tg-num">{kr(r.cashGrossOre)}</td>
                  <td className="tg-num">{kr(r.benefitOre)}</td>
                  <td className="tg-num">{kr(r.taxFreeReimbursementOre)}</td>
                  <td className="tg-num">{kr(r.taxOre)}</td>
                  <td className="tg-num">{kr(r.netOre)}</td>
                  <td className="tg-num">{kr(r.employerContributionOre)}</td>
                  <td>
                    <a href={`/admin/rapporter/arsbesked/${year}?person=${r.employeeId}`} target="_blank" rel="noreferrer">
                      PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            <a href={`/admin/rapporter/arsbesked/${year}`} target="_blank" rel="noreferrer">
              Alla årsbesked {year} (PDF)
            </a>
          </p>
        </div>
      )}
      {canApprove &&
        (p.closed ? (
          <p className="hr-muted">Årsskiftet {year} är gjort; det görs en gång.</p>
        ) : (
          <form action={closeYearAction} className="hr-inline">
            <input type="hidden" name="year" value={year} />
            <button className="btn btn-primary hr-btn-small" type="submit" disabled={!p.semesterEnded}>
              Gör årsskiftet {year}
            </button>
            <span className="hr-muted">{p.semesterEnded ? "Semesteråret stängs och låses, årssammanställningen sparas. Det görs en gång." : `Semesteråret slutar ${p.closing.to}.`}</span>
          </form>
        ))}
    </div>
  );
}
