import type { NextRequest } from "next/server";
import { isPeriod, monthRange } from "@/lib/core/ledger/period";
import { sieForPeriod } from "@/lib/core/ledger/sie-export";
import { logExport } from "@/lib/core/export/load";
import { exportCaller } from "@/lib/core/export/route-helpers";
import { encodePc8 } from "@/lib/render/sie/sie4";

/**
 * GET ?period=2026-10: the month's verifikationer as a SIE 4 file (PC8), for
 * the bookkeeping. Any member, accountants included. Logged as export.sie
 * with the period, so the dashboard knows the month has been handed over.
 */
export async function GET(request: NextRequest) {
  const caller = await exportCaller();
  if (!caller) return new Response("Saknar behörighet.", { status: 403 });
  const period = request.nextUrl.searchParams.get("period");
  if (!isPeriod(period)) return new Response("Ange perioden som ÅÅÅÅ-MM.", { status: 400 });

  let file: Awaited<ReturnType<typeof sieForPeriod>>;
  try {
    file = await sieForPeriod(period);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Kunde inte skapa SIE-filen.", { status: 500 });
  }
  const { from, to } = monthRange(period);
  await logExport(caller.check.orgId, "export.sie", { period, from, to, entries: file.entries, locked: false, file: file.fileName }, caller.actor);
  return new Response(encodePc8(file.text) as BodyInit, {
    headers: {
      "Content-Type": "text/plain; charset=IBM437",
      "Content-Disposition": `attachment; filename="${file.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
