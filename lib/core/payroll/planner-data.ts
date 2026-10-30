import "server-only";
import { listEmployees, listEmployments } from "../hr/store";
import { inForce, type Employee } from "../hr/schema";
import type { IsoDate } from "../rules/index";
import { listApprovedPayslipSummaries } from "./run-store";
import { listPlannerSnapshots, type PlannerSnapshot } from "./benefits-store";
import { ownerPlanner, restOfYear, type PlannerInput, type PlannerResult } from "./owner-planner";

export type OwnerPlan = { owner: Employee; input: PlannerInput; result: PlannerResult; plannedMonthlyOre: number; saved: PlannerSnapshot | null; wageYtdOre: number };

/**
 * The planner's numbers for every owner (owner-planner.ts): last year's and
 * this year's cash pay from the approved payslips (by pay day), the
 * owner's planned monthly salary for the rest of the year (saved, or the
 * current månadslön), the company's wage sum for the rest of the year at
 * this year's monthly average, and the ownership share (saved, or split
 * evenly between the owners).
 */
export async function ownerPlans(today: IsoDate, override?: { employeeId: string; ownershipPercent: number; plannedMonthlyOre: number }): Promise<OwnerPlan[]> {
  const year = Number(today.slice(0, 4));
  const [employees, versions, lastYear, thisYear, snapshots] = await Promise.all([
    listEmployees(),
    listEmployments(),
    listApprovedPayslipSummaries({ from: `${year - 1}-01-01`, to: `${year - 1}-12-31` }),
    listApprovedPayslipSummaries({ from: `${year}-01-01`, to: `${year}-12-31` }),
    listPlannerSnapshots().catch((): PlannerSnapshot[] => []),
  ]);
  const owners = employees.filter((e) => e.isOwner);
  const sum = (list: typeof lastYear, employeeId?: string) => list.filter((p) => !employeeId || p.employeeId === employeeId).reduce((s, p) => s + p.grossOre, 0);
  const wageLast = sum(lastYear);
  const wageYtd = sum(thisYear);
  const monthsPaid = new Set(thisYear.map((p) => p.run.payDate.slice(0, 7))).size;
  const lastPaidMonth = thisYear.reduce((m, p) => Math.max(m, Number(p.run.payDate.slice(5, 7))), 0);
  const monthsLeft = 12 - (lastPaidMonth || Number(today.slice(5, 7)));
  const wageRest = monthsPaid ? restOfYear(Math.round(wageYtd / monthsPaid), monthsLeft) : 0;
  return owners.map((o) => {
    const saved = snapshots.find((s) => s.employeeId === o.id && s.year === year) ?? null;
    const current = versions.filter((v) => v.employeeId === o.id && v.payForm === "monthly" && inForce(v, today))[0];
    const mine = override?.employeeId === o.id ? override : null;
    const plannedMonthlyOre = mine?.plannedMonthlyOre ?? (typeof saved?.inputs.plannedMonthlyOre === "number" ? saved.inputs.plannedMonthlyOre : (current?.monthlySalaryOre ?? 0));
    const share = mine?.ownershipPercent ?? (typeof saved?.inputs.ownershipPercent === "number" ? saved.inputs.ownershipPercent : Math.round((100 / owners.length) * 100) / 100);
    const input: PlannerInput = {
      year,
      ownershipPercent: share,
      ownPayLastYearOre: sum(lastYear, o.id),
      wageSumLastYearOre: wageLast,
      ownPayYearToDateOre: sum(thisYear, o.id),
      ownPayProjectedRestOre: restOfYear(plannedMonthlyOre, monthsLeft),
      wageSumYearToDateOre: wageYtd,
      wageSumProjectedRestOre: wageRest,
    };
    return { owner: o, input, result: ownerPlanner(input), plannedMonthlyOre, saved, wageYtdOre: wageYtd };
  });
}
