import "server-only";
import { getDb } from "../db";
import { isDemo } from "../../leads";
import { COST_KINDS, hoursAmount, type CostKind } from "./economy";

/**
 * Project costs (project_costs in 0020): supplier invoices, own hours,
 * material and other, excl. VAT. Internal figures for the margin, read and
 * written with the admin's session so RLS keeps them from customers. Not
 * bookkeeping, so rows can be removed.
 */

export type ProjectCost = {
  id: string;
  projectId: string;
  kind: CostKind;
  description: string;
  amountOre: number;
  costDate: string;
  hours: number | null;
  hourlyRateOre: number | null;
  supplier: string;
  createdBy: string | null;
  createdAt: string;
};

export type ProjectCostInput = {
  kind: CostKind;
  description: string;
  costDate: string;
  supplier?: string;
  /** For every kind but hours. */
  amountOre?: number | null;
  /** For hours: the amount is hours × rate. */
  hours?: number | null;
  hourlyRateOre?: number | null;
};

type Row = {
  id: string;
  project_id: string;
  kind: CostKind;
  description: string;
  amount_ore: number;
  cost_date: string;
  hours: number | string | null;
  hourly_rate_ore: number | null;
  supplier: string;
  created_by: string | null;
  created_at: string;
};

const fromRow = (r: Row): ProjectCost => ({
  id: r.id,
  projectId: r.project_id,
  kind: COST_KINDS.includes(r.kind) ? r.kind : "other",
  description: r.description,
  amountOre: Number(r.amount_ore),
  costDate: r.cost_date,
  hours: r.hours === null ? null : Number(r.hours),
  hourlyRateOre: r.hourly_rate_ore === null ? null : Number(r.hourly_rate_ore),
  supplier: r.supplier,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

const g = globalThis as unknown as { __binaafyProjectCosts?: Row[] };
const demo = () => (g.__binaafyProjectCosts ??= []);

/** The row to store, checked: an hours row gets its amount from hours × rate. */
export function costRow(projectId: string, input: ProjectCostInput, createdBy: string | null): Omit<Row, "id" | "created_at"> {
  if (!COST_KINDS.includes(input.kind)) throw new Error("Okänd kostnadstyp.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.costDate)) throw new Error("Ange datum.");
  const description = input.description.trim().slice(0, 400);
  const supplier = (input.supplier ?? "").trim().slice(0, 120);
  if (input.kind === "hours") {
    const hours = input.hours ?? null;
    const rate = input.hourlyRateOre ?? null;
    if (hours === null || rate === null || hours <= 0) throw new Error("Ange antal timmar och timpris.");
    return { project_id: projectId, kind: input.kind, description: description || "Arbetade timmar", amount_ore: hoursAmount(hours, rate), cost_date: input.costDate, hours, hourly_rate_ore: rate, supplier, created_by: createdBy };
  }
  const amount = input.amountOre ?? null;
  if (amount === null || !Number.isSafeInteger(amount) || amount === 0) throw new Error("Ange beloppet exkl. moms.");
  if (!description && !supplier) throw new Error("Skriv vad kostnaden gäller eller vilken leverantör.");
  return { project_id: projectId, kind: input.kind, description, amount_ore: amount, cost_date: input.costDate, hours: null, hourly_rate_ore: null, supplier, created_by: createdBy };
}

export class CostsTableMissingError extends Error {
  constructor() {
    super("Tabellen project_costs saknas. Kör supabase/migrations/0020_project_costs.sql i Supabase.");
    this.name = "CostsTableMissingError";
  }
}

export async function listProjectCosts(projectId: string): Promise<ProjectCost[]> {
  if (isDemo()) return demo().filter((r) => r.project_id === projectId).map(fromRow).sort((a, b) => b.costDate.localeCompare(a.costDate));
  const supabase = await getDb();
  const { data, error } = await supabase.from("project_costs").select("*").eq("project_id", projectId).order("cost_date", { ascending: false }).order("created_at", { ascending: false });
  if (error) {
    // Before 0020 is run the table is missing; the page shows the box without costs.
    if (error.code === "42P01" || error.code === "PGRST205") throw new CostsTableMissingError();
    throw new Error(`Kunde inte hämta kostnaderna: ${error.message}`);
  }
  return ((data ?? []) as Row[]).map(fromRow);
}

export async function addProjectCost(projectId: string, input: ProjectCostInput, createdBy: string | null): Promise<string> {
  const row = costRow(projectId, input, createdBy);
  if (isDemo()) {
    const id = crypto.randomUUID();
    demo().push({ id, ...row, created_at: new Date().toISOString() });
    return id;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.from("project_costs").insert(row).select("id").single();
  if (error) throw new Error(`Kunde inte spara kostnaden: ${error.message}`);
  return data.id as string;
}

export async function removeProjectCost(projectId: string, id: string): Promise<void> {
  if (isDemo()) {
    g.__binaafyProjectCosts = demo().filter((r) => !(r.id === id && r.project_id === projectId));
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.from("project_costs").delete().eq("id", id).eq("project_id", projectId);
  if (error) throw new Error(`Kunde inte ta bort kostnaden: ${error.message}`);
}
