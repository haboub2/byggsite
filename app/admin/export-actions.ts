"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import type { Actor } from "@/lib/core/events";
import { isPeriod, lockProblem } from "@/lib/core/ledger/period";
import { listPeriodLocks, lockPeriod } from "@/lib/core/ledger/store";
import { todayIso } from "@/lib/quotes/schema";

const PAGE = "/admin/ekonomi/export";
const back = (q: Record<string, string>) => `${PAGE}?${new URLSearchParams(q)}`;

/** Lock a month after its SIE file is in the bookkeeping. Only months that have ended. */
export async function lockPeriodAction(formData: FormData): Promise<void> {
  const check = await requireRole("admin");
  if (!check.ok) redirect("/admin/login");
  const period = String(formData.get("period") ?? "");
  if (!isPeriod(period)) redirect(back({ fel: "Okänd period." }));
  const problem = lockProblem(await listPeriodLocks(), period, todayIso());
  if (problem) redirect(back({ period, fel: problem }));
  const actor: Actor = check.email ? { kind: "user", id: check.email, name: check.email } : { kind: "system", name: "admin" };
  try {
    await lockPeriod(period, actor);
  } catch (err) {
    redirect(back({ period, fel: err instanceof Error ? err.message : "Kunde inte låsa perioden." }));
  }
  revalidatePath(PAGE);
  revalidatePath("/admin/ekonomi");
  redirect(back({ period, ok: "last" }));
}
