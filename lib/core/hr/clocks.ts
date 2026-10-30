/**
 * The LAS clocks for people in the register (docs/hr-lon.md, section 2,
 * design consequence 2). The database counts them (employment_clocks() in
 * supabase/migrations/0035_hr.sql); this file holds what both sides share:
 * how a person's employment versions become periods (employment_periods()
 * there, `employmentPeriods` here), the clock row's shape, and what the
 * list and Idag say about a row. Demo mode counts with the reference,
 * lib/core/payroll/employment-clocks.ts.
 */

import { addDays, daysBetween, type IsoDate } from "../rules/index";
import { employmentClocks, type Clocks, type EmploymentPeriod } from "../payroll/employment-clocks";
import type { PayrollRuleSet } from "../rules/payroll";
import { inForce, latestVersions, type EmploymentForm, type EmploymentVersion } from "./schema";

/** las_clocks()'s row, with the database's column names. */
export type ClockRow = {
  sava_days: number;
  sava_limit: number;
  sava_days_left: number;
  sava_converted: boolean;
  sava_converts_on: string | null;
  vikariat_days: number;
  vikariat_limit: number;
  vikariat_days_left: number;
  vikariat_converted: boolean;
  vikariat_converts_on: string | null;
  probation_starts_on: string | null;
  probation_ends_on: string | null;
  probation_notice_by: string | null;
  probation_days_left: number | null;
  probation_converts_on: string | null;
};

export type EmployeeClockRow = ClockRow & { employee_id: string };

export function clockRow(c: Clocks): ClockRow {
  return {
    sava_days: c.sava.daysInWindow,
    sava_limit: c.sava.limitDays,
    sava_days_left: c.sava.daysLeft,
    sava_converted: c.sava.converted,
    sava_converts_on: c.sava.convertsOn,
    vikariat_days: c.vikariat.daysInWindow,
    vikariat_limit: c.vikariat.limitDays,
    vikariat_days_left: c.vikariat.daysLeft,
    vikariat_converted: c.vikariat.converted,
    vikariat_converts_on: c.vikariat.convertsOn,
    probation_starts_on: c.probation?.startsOn ?? null,
    probation_ends_on: c.probation?.endsOn ?? null,
    probation_notice_by: c.probation?.noticeBy ?? null,
    probation_days_left: c.probation?.daysLeft ?? null,
    probation_converts_on: c.probation?.convertsOn ?? null,
  };
}

/**
 * A person's periods from their employment versions: each version applies
 * from max(startsOn, validFrom) to min(endsOn, validTo), a
 * provanställning at most to its probationEndsOn; versions that
 * follow each other in one contract with the same form are one period, so
 * a pay rise during a provanställning does not move its start.
 */
export function employmentPeriods(versions: readonly EmploymentVersion[]): EmploymentPeriod[] {
  const byContract = new Map<string, EmploymentVersion[]>();
  for (const v of versions) byContract.set(v.contractId, [...(byContract.get(v.contractId) ?? []), v]);
  const periods: EmploymentPeriod[] = [];
  for (const list of byContract.values()) {
    let current: EmploymentPeriod | null = null;
    for (const v of [...list].sort((a, b) => a.version - b.version)) {
      const from = v.startsOn > v.validFrom ? v.startsOn : v.validFrom;
      const ends = [v.endsOn, v.validTo, v.form === "provanstallning" ? v.probationEndsOn : null].filter((d): d is string => d !== null).sort();
      const to = ends.length ? ends[0] : null;
      if (to !== null && to < from) continue; // replaced before it took effect
      if (current && current.form === v.form) {
        current.startsOn = current.startsOn < from ? current.startsOn : from;
        current.endsOn = current.endsOn === null || to === null ? null : current.endsOn > to ? current.endsOn : to;
      } else {
        current = { form: v.form, startsOn: from, endsOn: to };
        periods.push(current);
      }
    }
  }
  return periods.sort((a, b) => a.startsOn.localeCompare(b.startsOn));
}

/** The reference's clocks for a person's versions (demo mode, tests). */
export function clocksForVersions(versions: readonly EmploymentVersion[], asOf: IsoDate, rules: PayrollRuleSet): ClockRow {
  return clockRow(employmentClocks(employmentPeriods(versions), asOf, rules));
}

export type ClockAlert = {
  kind: "sava" | "vikariat" | "probation";
  /** The day something happens: conversion, or the end of the provanställning. */
  on: IsoDate;
  daysUntil: number;
  /** "SÄVA 300 av 360 dagar" */
  label: string;
  /** "blir tillsvidare 2027-01-01 (om 63 dagar)" */
  detail: string;
  converted: boolean;
  /** alert: act now (converts within 30 days, provanställning within 14, or passed while the person still holds the form); done: history. */
  tone: "alert" | "done" | "info";
};

/** The forms a person holds today: the latest version of each contract in force. */
export function heldForms(versions: readonly EmploymentVersion[], today: IsoDate): Set<EmploymentForm> {
  return new Set(latestVersions(versions).filter((v) => inForce(v, today)).map((v) => v.form));
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const CLOCK_ALERT_DAYS = 30;
export const PROBATION_ALERT_DAYS = 14;

/**
 * What a clock row says, for the Personal list, the person page and Idag.
 * A clock that has passed its limit while the person still holds that form
 * means the employment already is tillsvidare (LAS 5 a §): an alert, not
 * history.
 */
export function clockAlerts(row: ClockRow, today: IsoDate, held: ReadonlySet<EmploymentForm> = new Set()): ClockAlert[] {
  const alerts: ClockAlert[] = [];
  const timed = (kind: "sava" | "vikariat", days: number, limit: number, on: string | null, converted: boolean, name: string) => {
    if (days === 0 && !on) return;
    const label = `${name} ${days} av ${limit} dagar`;
    if (converted) {
      const holds = held.has(kind);
      alerts.push({
        kind,
        on: on ?? today,
        daysUntil: on ? daysBetween(today, on) : 0,
        label,
        detail: holds
          ? `passerade gränsen ${on ?? ""}: anställningen gäller som tillsvidare (LAS 5 a §)`
          : `passerade gränsen ${on ?? ""}`,
        converted: true,
        tone: holds ? "alert" : "done",
      });
    } else if (on) {
      const until = daysBetween(today, on);
      alerts.push({ kind, on, daysUntil: until, label, detail: `blir tillsvidare ${on} (om ${plural(until, "dag", "dagar")})`, converted: false, tone: until <= CLOCK_ALERT_DAYS ? "alert" : "info" });
    } else {
      alerts.push({ kind, on: addDays(today, 100_000), daysUntil: Infinity, label, detail: `${plural(limit - days, "dag", "dagar")} kvar till gränsen; bokade perioder når den inte`, converted: false, tone: "info" });
    }
  };
  timed("sava", row.sava_days, row.sava_limit, row.sava_converts_on, row.sava_converted, "SÄVA");
  timed("vikariat", row.vikariat_days, row.vikariat_limit, row.vikariat_converts_on, row.vikariat_converted, "Vikariat");
  if (row.probation_ends_on && row.probation_notice_by && row.probation_days_left !== null) {
    alerts.push({
      kind: "probation",
      on: row.probation_ends_on,
      daysUntil: row.probation_days_left,
      label: `Provanställning till ${row.probation_ends_on}`,
      detail: `besked senast ${row.probation_notice_by}, annars tillsvidare ${row.probation_converts_on}`,
      converted: false,
      tone: row.probation_days_left <= PROBATION_ALERT_DAYS ? "alert" : "info",
    });
  }
  return alerts;
}
