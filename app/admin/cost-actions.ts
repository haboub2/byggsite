"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkAdmin } from "@/lib/admin";
import { parseKronor } from "@/lib/core/money";
import { addProjectCost, removeProjectCost } from "@/lib/core/projects/costs";
import { COST_KINDS, type CostKind } from "@/lib/core/projects/economy";
import { todayIso } from "@/lib/quotes/schema";

// vid=kostnader shows the message in the box Ekonomi instead of at the top.
const projectUrl = (id: string, q: Record<string, string>) => `/admin/projekt/${id}?${new URLSearchParams({ ...q, vid: "kostnader" })}#kostnader`;

const kronor = (raw: FormDataEntryValue | null): number | null => {
  const s = String(raw ?? "").trim();
  return s ? parseKronor(s) : null;
};

export async function addCostAction(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) redirect("/admin/login");
  const projectId = String(formData.get("project") ?? "");
  const kind = String(formData.get("kind") ?? "supplier") as CostKind;
  if (!COST_KINDS.includes(kind)) redirect(projectUrl(projectId, { fel: "Okänd kostnadstyp." }));
  try {
    const hoursRaw = String(formData.get("hours") ?? "").trim().replace(",", ".");
    await addProjectCost(
      projectId,
      {
        kind,
        description: String(formData.get("description") ?? ""),
        supplier: String(formData.get("supplier") ?? ""),
        costDate: String(formData.get("costDate") ?? "") || todayIso(),
        amountOre: kind === "hours" ? null : kronor(formData.get("amount")),
        hours: kind === "hours" && hoursRaw ? Number(hoursRaw) : null,
        hourlyRateOre: kind === "hours" ? kronor(formData.get("rate")) : null,
      },
      check.email
    );
  } catch (err) {
    redirect(projectUrl(projectId, { fel: err instanceof Error ? err.message : "Kunde inte spara kostnaden." }));
  }
  revalidatePath(`/admin/projekt/${projectId}`);
  redirect(projectUrl(projectId, { sparat: "kostnad" }));
}

export async function removeCostAction(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) return;
  const projectId = String(formData.get("project") ?? "");
  try {
    await removeProjectCost(projectId, String(formData.get("cost") ?? ""));
  } catch (err) {
    redirect(projectUrl(projectId, { fel: err instanceof Error ? err.message : "Kunde inte ta bort kostnaden." }));
  }
  revalidatePath(`/admin/projekt/${projectId}`);
  redirect(projectUrl(projectId, { sparat: "kostnad-bort" }));
}
