import type { NextRequest } from "next/server";
import { asSystem } from "@/lib/core/db";
import { runDueRecurring } from "@/lib/core/invoices/recurring";
import { listDueReminders, reminderSettings, sendReminder } from "@/lib/core/reminders/store";
import { deliverDueWebhooks } from "@/lib/api/webhook-delivery";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDemo } from "@/lib/leads";
import { todayIso } from "@/lib/quotes/schema";

/**
 * The daily run (vercel.json: 06:00 UTC). For every organisation, as that
 * organisation: turns the recurring invoices that are due into drafts (or
 * issued invoices when auto-issue is set), then finds the reminders that are
 * due and, when the organisation's settings say so, sends them; otherwise it
 * only reports, and the dashboard shows them under Att göra. Last, it
 * delivers the queued webhooks of all organisations.
 * Protected by CRON_SECRET, which Vercel sends as a bearer token.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!isDemo() && (!secret || auth !== `Bearer ${secret}`)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const today = todayIso();
  const actor = { kind: "system" as const, name: "cron" };
  const orgs = isDemo() ? [{ id: undefined as string | undefined, name: "Demo" }] : await listOrganizations();

  const perOrg = [];
  for (const org of orgs) {
    perOrg.push(
      await asSystem(async () => {
        const recurring = await runDueRecurring(today, actor).catch((err) => ({
          created: [],
          failed: [{ recurring: "", name: "alla", error: err instanceof Error ? err.message : String(err) }],
        }));
        const settings = await reminderSettings();
        const due = await listDueReminders(today);
        const sent: { invoice: string; level: number; to: string }[] = [];
        const failed: { invoice: string; error: string }[] = [];
        if (settings.auto) {
          for (const { invoice } of due) {
            try {
              const { plan, sentTo } = await sendReminder(invoice.id, actor, { mail: true, today });
              sent.push({ invoice: invoice.number ?? invoice.id, level: plan.level, to: sentTo });
            } catch (err) {
              failed.push({ invoice: invoice.number ?? invoice.id, error: err instanceof Error ? err.message : String(err) });
            }
          }
        }
        return {
          org: org.name,
          recurring,
          auto: settings.auto,
          due: due.map(({ invoice, plan }) => ({ invoice: invoice.number, level: plan.level, daysOverdue: plan.daysOverdue, remainingOre: plan.remainingOre })),
          sent,
          failed,
        };
      }, org.id).catch((err) => ({ org: org.name, error: err instanceof Error ? err.message : String(err) }))
    );
  }

  const webhooks = await deliverDueWebhooks().catch((err) => ({ error: err instanceof Error ? err.message : String(err) }));
  return Response.json({ ok: true, today, organizations: perOrg, webhooks });
}

async function listOrganizations(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await createAdminClient().from("organizations").select("id, name").order("created_at");
  if (error) throw new Error(`Kunde inte läsa organisationerna: ${error.message}`);
  return (data ?? []) as { id: string; name: string }[];
}
