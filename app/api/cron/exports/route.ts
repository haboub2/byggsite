import { after, type NextRequest } from "next/server";
import { kickExportJobs, processExportJobs } from "@/lib/core/export/job-store";
import { isDemo } from "@/lib/leads";

/** A run works for up to four minutes, then hands over to the next. */
export const maxDuration = 300;
const BUDGET_MS = 240_000;

/**
 * The export queue (export_jobs, 0030): answers at once and works after the
 * response, part by part, until the queue is empty or the time is up; then,
 * if work remains, it calls itself again. Started when a member queues a PDF
 * archive and by the daily cron, which picks up anything a broken chain left.
 * Protected by CRON_SECRET like the daily run.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!isDemo() && (!secret || auth !== `Bearer ${secret}`)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const origin = request.nextUrl.origin;
  after(async () => {
    try {
      const run = await processExportJobs({ budgetMs: BUDGET_MS });
      if (run.jobs.length) console.log("[export-jobs]", JSON.stringify(run.jobs));
      if (run.remaining) await kickExportJobs(origin);
    } catch (err) {
      console.error("[export-jobs] run failed:", err instanceof Error ? err.message : err);
    }
  });
  return Response.json({ ok: true, accepted: true }, { status: 202 });
}
