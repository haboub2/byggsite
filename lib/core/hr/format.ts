/** How the Personal pages say a contract's pay, period and state. Pure. */

import { formatOre } from "../money";
import type { IsoDate } from "../rules/index";
import { FEE_PERIOD_LABEL, type EmploymentVersion } from "./schema";

const kr = (ore: number) => formatOre(ore, { decimals: ore % 100 === 0 ? 0 : 2, currency: true });

export function payLabel(v: EmploymentVersion): string {
  if (v.payForm === "monthly" && v.monthlySalaryOre !== null) return `${kr(v.monthlySalaryOre)}/mån`;
  if (v.payForm === "hourly" && v.hourlyRateOre !== null) return `${kr(v.hourlyRateOre)}/tim`;
  if (v.payForm === "fee" && v.feeOre !== null) return `${kr(v.feeOre)} ${v.feePeriod ? FEE_PERIOD_LABEL[v.feePeriod] : ""}`.trim();
  return "–";
}

export function periodLabel(v: Pick<EmploymentVersion, "startsOn" | "endsOn" | "form" | "probationEndsOn">): string {
  if (v.form === "provanstallning") return `${v.startsOn} – ${v.probationEndsOn ?? "?"} (prov)`;
  if (v.endsOn) return `${v.startsOn} – ${v.endsOn}`;
  if (v.form === "vikariat") return `${v.startsOn} – tills den ersatta återgår`;
  if (v.form === "uppdrag") return `${v.startsOn} – tills stämman beslutar annat`;
  return `${v.startsOn} – tills vidare`;
}

export type ContractState = "current" | "upcoming" | "ended";
export const CONTRACT_STATE_LABEL: Record<ContractState, string> = { current: "Pågår", upcoming: "Kommande", ended: "Avslutad" };

export function contractState(v: Pick<EmploymentVersion, "startsOn" | "endsOn">, today: IsoDate): ContractState {
  if (v.startsOn > today) return "upcoming";
  if (v.endsOn && v.endsOn < today) return "ended";
  return "current";
}

/** "1 jan 2026–31 mar 2026" style range for a version's validity. */
export function validityLabel(v: Pick<EmploymentVersion, "validFrom" | "validTo">): string {
  return `${v.validFrom} – ${v.validTo ?? "nu"}`;
}
