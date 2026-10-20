import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/admin";
import { isPeriod } from "@/lib/core/ledger/period";
import { sieForPeriod } from "@/lib/core/ledger/sie-export";
import { encodePc8 } from "@/lib/render/sie/sie4";

/** GET ?period=2026-10: the month's verifikationer as a SIE 4 file (PC8), for the bookkeeping. Any member, accountants included. */
export async function GET(request: NextRequest) {
  const check = await requireRole("read");
  if (!check.ok) return new Response("Saknar behörighet.", { status: 403 });
  const period = request.nextUrl.searchParams.get("period");
  if (!isPeriod(period)) return new Response("Ange perioden som ÅÅÅÅ-MM.", { status: 400 });

  let file: Awaited<ReturnType<typeof sieForPeriod>>;
  try {
    file = await sieForPeriod(period);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Kunde inte skapa SIE-filen.", { status: 500 });
  }
  return new Response(encodePc8(file.text) as BodyInit, {
    headers: {
      "Content-Type": "text/plain; charset=IBM437",
      "Content-Disposition": `attachment; filename="${file.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
