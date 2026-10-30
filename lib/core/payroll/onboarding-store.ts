import "server-only";
import { isDemo } from "../../leads";
import { listMembers } from "../org/members";
import { getOrgSettings } from "../org/settings-store";
import { listNumberSeries } from "../org/settings-store";
import { listEmployees, listEmployments, listTaxVersions } from "../hr/store";
import type { IsoDate } from "../rules/index";
import { getPayrollSettings, listPayItems, listRuns, listTaxTableImports } from "./run-store";
import { payrollOnboarding, type PayrollOnboarding } from "./onboarding";

/**
 * Reads what "Kom igång med lön" judges from (onboarding.ts) with the
 * caller's rights: the decisions, the members, the company, the tax table
 * imports, the people with their contracts, tax rows and bank accounts,
 * the register and series L.
 */
export async function loadPayrollOnboarding(today: IsoDate): Promise<PayrollOnboarding> {
  const [{ settings, confirmed }, members, org, imports, employees, employments, tax, items, series, runs] = await Promise.all([
    getPayrollSettings(),
    listMembers().catch(() => []),
    getOrgSettings(),
    listTaxTableImports(),
    listEmployees(),
    listEmployments(),
    listTaxVersions(),
    listPayItems(),
    isDemo() ? Promise.resolve([{ series: "L" }]) : listNumberSeries().catch(() => []),
    listRuns(),
  ]);
  return payrollOnboarding({
    settings,
    confirmed,
    approverCount: members.filter((m) => m.role === "owner" || m.role === "admin").length,
    hasAccountant: members.some((m) => m.role === "accountant"),
    orgNr: org.company.orgNr,
    taxTableYears: imports.map((i) => i.year),
    people: employees.map((e) => ({
      id: e.id,
      name: e.name,
      hasContract: employments.some((v) => v.employeeId === e.id),
      hasTax: tax.some((t) => t.employeeId === e.id),
      hasBank: Boolean(e.bankAccountMasked),
      ended: e.endedAt !== null && e.endedAt < today,
    })),
    registerCodes: [...new Set(items.map((i) => i.code))],
    hasSeriesL: series.some((s) => s.series === "L"),
    runCount: runs.length,
    today,
  });
}
