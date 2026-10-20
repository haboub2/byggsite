import type { NextRequest } from "next/server";
import { asSystem } from "@/lib/core/db";
import { runDueRecurring } from "@/lib/core/invoices/recurring";
import { listDueReminders, reminderSettings, sendReminder } from "@/lib/core/reminders/store";
import { isDemo } from "@/lib/leads";
import { todayIso } from "@/lib/quotes/schema";

/**
 * The daily run (vercel.json: 06:00 UTC). Turns the recurring invoices that
 * are due into drafts (or issued invoices when auto-issue is set), then finds
 * the reminders that are due and, when REMINDERS_AUTO=1, sends them;
 * otherwise it only reports, and the dashboard shows them under Att göra.
 * Protected by CRON_SECRET, which Vercel sends as a bearer token.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!isDemo() && (!secret || auth !== `Bearer ${secret}`)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const today = todayIso();
  const settings = reminderSettings();
  return asSystem(async () => {
    const recurring = await runDueRecurring(today, { kind: "system", name: "cron" }).catch((err) => ({
      created: [],
      failed: [{ recurring: "", name: "alla", error: err instanceof Error ? err.message : String(err) }],
    }));

    const due = await listDueReminders(today);
    const sent: { invoice: string; level: number; to: string }[] = [];
    const failed: { invoice: string; error: string }[] = [];
    if (settings.auto) {
      for (const { invoice } of due) {
        try {
          const { plan, sentTo } = await sendReminder(invoice.id, { kind: "system", name: "cron" }, { mail: true, today });
          sent.push({ invoice: invoice.number ?? invoice.id, level: plan.level, to: sentTo });
        } catch (err) {
          failed.push({ invoice: invoice.number ?? invoice.id, error: err instanceof Error ? err.message : String(err) });
        }
      }
    }
    return Response.json({
      ok: true,
      today,
      recurring,
      auto: settings.auto,
      due: due.map(({ invoice, plan }) => ({ invoice: invoice.number, level: plan.level, daysOverdue: plan.daysOverdue, remainingOre: plan.remainingOre })),
      sent,
      failed,
    });
  });
}
