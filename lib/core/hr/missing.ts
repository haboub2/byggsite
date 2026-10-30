/**
 * What is missing for a person before payroll and the law are satisfied
 * (docs/hr-lon.md, section 11: "missing data badges"; section 9 rule 4 is
 * the same list as the pre-run checklist in phase 3). Pure.
 */

import { addDays, type IsoDate } from "../rules/index";
import { inForce, latestVersions, taxOn, type Employee, type EmploymentDocument, type EmploymentVersion, type TaxVersion } from "./schema";

export type MissingBadge = { key: "contract" | "pnr" | "bank" | "tax" | "jamkning" | "signed" | "address"; label: string; tone: "alert" | "warn" };

export function missingData(input: {
  employee: Employee;
  versions: readonly EmploymentVersion[];
  tax: readonly TaxVersion[];
  documents: readonly EmploymentDocument[];
  today: IsoDate;
}): MissingBadge[] {
  const { employee, versions, tax, documents, today } = input;
  const badges: MissingBadge[] = [];
  const latest = latestVersions(versions);
  // Contracts in force now or starting later.
  const active = latest.filter((v) => inForce(v, today) || v.startsOn > today);
  if (employee.endedAt) return badges;
  if (active.length === 0) badges.push({ key: "contract", label: "Ingen gällande anställning", tone: "warn" });
  if (!employee.pnrMasked) badges.push({ key: "pnr", label: "Personnummer saknas", tone: "alert" });
  if (active.length > 0 && !employee.bankAccountMasked) badges.push({ key: "bank", label: "Bankkonto saknas", tone: "alert" });
  const current = taxOn(tax, today) ?? taxOn(tax, addDays(today, 31));
  if (active.length > 0 && !current) badges.push({ key: "tax", label: "Skatteuppgifter saknas", tone: "alert" });
  if (current?.adjustmentValidTo) {
    if (current.adjustmentValidTo < today) badges.push({ key: "jamkning", label: `Jämkningen gick ut ${current.adjustmentValidTo}`, tone: "warn" });
    else if (current.adjustmentValidTo <= addDays(today, 30)) badges.push({ key: "jamkning", label: `Jämkningen går ut ${current.adjustmentValidTo}`, tone: "warn" });
  }
  const signed = new Set(documents.filter((d) => d.signedAt).map((d) => d.employmentId));
  if (active.some((v) => !signed.has(v.id))) badges.push({ key: "signed", label: "Avtal inte signerat", tone: "warn" });
  if (!employee.street || !employee.city) badges.push({ key: "address", label: "Adress saknas", tone: "warn" });
  return badges;
}
