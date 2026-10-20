import "server-only";
import { createAdminClient } from "../supabase/admin";
import { isDemo } from "../leads";
import { SIGNATURE_HEADER, nextAttemptAt, signWebhook, webhookPayload } from "./webhooks";

/**
 * Delivers the queued webhook_deliveries (made by the trigger
 * events_enqueue_webhooks in 0021, one per active endpoint and event). Runs
 * from the cron route with the service role, across all organisations: each
 * delivery is signed with its own endpoint's secret. A 2xx answer marks it
 * delivered; anything else schedules the next try (lib/api/webhooks.ts) or,
 * after the last one, marks it failed.
 */

export type DeliveryReport = { delivered: number; retried: number; failed: number; results: { id: string; url: string; type: string; status: number | null; ok: boolean }[] };

type DueRow = {
  id: string;
  attempt: number;
  webhook_endpoints: { url: string; secret: string; active: boolean } | null;
  events: { id: string; type: string; created_at: string; data: unknown; aggregate_type: string; aggregate_id: string } | null;
};

export async function deliverDueWebhooks(options: { limit?: number; now?: Date; fetchImpl?: typeof fetch } = {}): Promise<DeliveryReport> {
  const report: DeliveryReport = { delivered: 0, retried: 0, failed: 0, results: [] };
  if (isDemo()) return report;
  const now = options.now ?? new Date();
  const doFetch = options.fetchImpl ?? fetch;
  const db = createAdminClient();
  const { data, error } = await db
    .from("webhook_deliveries")
    .select("id, attempt, webhook_endpoints(url, secret, active), events(id, type, created_at, data, aggregate_type, aggregate_id)")
    .is("delivered_at", null)
    .is("failed_at", null)
    .lte("next_attempt_at", now.toISOString())
    .order("next_attempt_at")
    .limit(options.limit ?? 100);
  if (error) throw new Error(`Kunde inte läsa webhook-köen: ${error.message}`);

  for (const row of (data ?? []) as unknown as DueRow[]) {
    const endpoint = row.webhook_endpoints;
    const event = row.events;
    if (!endpoint || !event || !endpoint.active) {
      await db.from("webhook_deliveries").update({ failed_at: now.toISOString(), response: "Endpointen är borttagen eller avstängd." }).eq("id", row.id);
      report.failed++;
      continue;
    }
    const body = JSON.stringify(webhookPayload(event));
    const attempt = row.attempt + 1;
    let status: number | null = null;
    let text = "";
    try {
      const res = await doFetch(endpoint.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "Binaafy-Webhooks/1",
          [SIGNATURE_HEADER]: signWebhook(endpoint.secret, body, Math.floor(now.getTime() / 1000)),
          "X-Event-Id": event.id,
          "X-Event-Type": event.type,
        },
        body,
        signal: AbortSignal.timeout(10_000),
        redirect: "manual",
      });
      status = res.status;
      text = (await res.text().catch(() => "")).slice(0, 1000);
    } catch (err) {
      text = (err instanceof Error ? err.message : String(err)).slice(0, 1000);
    }
    const ok = status !== null && status >= 200 && status < 300;
    const next = ok ? null : nextAttemptAt(attempt, now);
    await db
      .from("webhook_deliveries")
      .update({
        attempt,
        status,
        response: text,
        ...(ok ? { delivered_at: now.toISOString() } : next ? { next_attempt_at: next.toISOString() } : { failed_at: now.toISOString() }),
      })
      .eq("id", row.id);
    if (ok) report.delivered++;
    else if (next) report.retried++;
    else report.failed++;
    report.results.push({ id: row.id, url: endpoint.url, type: event.type, status, ok });
  }
  return report;
}
