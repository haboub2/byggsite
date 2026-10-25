"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import type { Actor } from "@/lib/core/events";
import { isPeriod, lockProblem } from "@/lib/core/ledger/period";
import { listPeriodLocks, lockPeriod } from "@/lib/core/ledger/store";
import { todayIso } from "@/lib/quotes/schema";
import { ExportJobRunningError, kickExportJobs, requestExportJob } from "@/lib/core/export/job-store";
import { requestOrigin } from "@/lib/core/export/route-helpers";

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

/**
 * Queue the PDF archive as a background job (lib/core/export/job-store.ts):
 * built in parts and mailed as a link to the member who asks. Any member
 * may, as with the download. The queue starts right after the response.
 */
export async function requestPdfArchiveAction(): Promise<void> {
  const check = await requireRole("read");
  if (!check.ok) redirect("/admin/login");
  try {
    await requestExportJob("pdf_archive", { orgId: check.orgId, userId: check.userId, email: check.email });
  } catch (err) {
    if (err instanceof ExportJobRunningError) redirect(`${back({ fel: err.message })}#full-export`);
    redirect(`${back({ fel: err instanceof Error ? err.message : "Kunde inte köa arkivet." })}#full-export`);
  }
  const origin = await requestOrigin();
  after(() => kickExportJobs(origin));
  revalidatePath(PAGE);
  redirect(`${back({ ok: "arkiv" })}#full-export`);
}
