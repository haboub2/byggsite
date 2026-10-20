import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { listApiKeys, listDeliveries, listWebhooks } from "@/lib/api/admin-store";
import { WEBHOOK_EVENT_TYPES } from "@/lib/core/events";
import { formatDateTime } from "@/lib/admin-format";
import { revokeApiKeyAction, removeWebhookAction } from "@/app/admin/api-actions";
import { CreateKeyForm, CreateWebhookForm } from "@/components/admin/api/ApiForms";

export const metadata = { title: "API" };

function deliveryStatus(d: { deliveredAt: string | null; failedAt: string | null; attempt: number; status: number | null; nextAttemptAt: string }): string {
  const code = d.status ? ` (${d.status})` : "";
  if (d.deliveredAt) return `Levererad${code}`;
  if (d.failedAt) return `Gav upp efter ${d.attempt} försök${code}`;
  if (d.attempt) return `Försök ${d.attempt} misslyckades${code}, nästa ${formatDateTime(d.nextAttemptAt)}`;
  return "I kö";
}

/** API keys and webhooks for the organisation (grundkrav 5). */
export default async function ApiAdminPage() {
  const check = await requireRole("admin");
  if (!check.ok) redirect("/admin/ekonomi");
  const [keys, hooks, deliveries] = await Promise.all([listApiKeys(), listWebhooks(), listDeliveries()]);
  return (
    <section className="sec sec--tight">
      <div className="container" style={{ maxWidth: 1040 }}>
        <span className="eyebrow">{check.orgName}</span>
        <h1 className="admin-h1">API</h1>
        <p className="admin-intro">
          REST-API för kunder och fakturor med nycklar per organisation. Kontraktet:{" "}
          <Link href="/api/v1/openapi.json" className="link-quiet" target="_blank">
            /api/v1/openapi.json
          </Link>
          . En nyckel ser och skapar bara det som hör till {check.orgName}.
        </p>

        <h2 style={{ marginTop: 32, fontSize: 22 }}>Nycklar</h2>
        <CreateKeyForm />
        {keys.length > 0 && (
          <table className="org-table" style={{ marginTop: 20 }}>
            <thead>
              <tr>
                <th>Namn</th>
                <th>Nyckel</th>
                <th>Behörighet</th>
                <th>Senast använd</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td>
                  <td>
                    <code>{k.prefix}…</code>
                  </td>
                  <td>{k.scopes.includes("write") ? "Läsa och skriva" : "Läsa"}</td>
                  <td>{k.revokedAt ? `Återkallad ${formatDateTime(k.revokedAt)}` : k.lastUsedAt ? formatDateTime(k.lastUsedAt) : "Aldrig"}</td>
                  <td>
                    {!k.revokedAt && (
                      <form action={revokeApiKeyAction}>
                        <input type="hidden" name="id" value={k.id} />
                        <button type="submit" className="btn btn-ghost">
                          Återkalla
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2 style={{ marginTop: 40, fontSize: 22 }}>Webhooks</h2>
        <p className="admin-intro">
          Händelsen skickas som JSON med POST till adressen. Headern X-Signature är t=&lt;unix&gt;,v1=&lt;HMAC-SHA256 av &quot;t.kropp&quot; med hemligheten&gt;.
          Misslyckade leveranser försöks igen med växande väntan, upp till 8 gånger, när den dagliga körningen går.
        </p>
        <CreateWebhookForm types={WEBHOOK_EVENT_TYPES} />
        {hooks.length > 0 && (
          <table className="org-table" style={{ marginTop: 20 }}>
            <thead>
              <tr>
                <th>Adress</th>
                <th>Händelser</th>
                <th>Hemlighet</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {hooks.map((h) => (
                <tr key={h.id}>
                  <td style={{ wordBreak: "break-all" }}>{h.url}</td>
                  <td>{h.events.length ? h.events.join(", ") : "Alla"}</td>
                  <td>
                    <code>{h.secretHint}</code>
                  </td>
                  <td>
                    <form action={removeWebhookAction}>
                      <input type="hidden" name="id" value={h.id} />
                      <button type="submit" className="btn btn-ghost">
                        Ta bort
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {deliveries.length > 0 && (
          <>
            <h3 style={{ marginTop: 32, fontSize: 18 }}>Senaste leveranserna</h3>
            <table className="org-table">
              <thead>
                <tr>
                  <th>Händelse</th>
                  <th>Adress</th>
                  <th>Status</th>
                  <th>Skapad</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id}>
                    <td>{d.type}</td>
                    <td style={{ wordBreak: "break-all" }}>{d.url}</td>
                    <td>{deliveryStatus(d)}</td>
                    <td>{formatDateTime(d.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </section>
  );
}
