import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { apiUsageLastDay, listApiKeys, listApiRequests, listDeliveries, listWebhooks, type ApiKeyRow } from "@/lib/api/admin-store";
import { API_LOG_RETENTION_DAYS } from "@/lib/api/request-log";
import { WEBHOOK_EVENT_TYPES } from "@/lib/core/events";
import { SCOPE_LABEL, type ApiScope } from "@/lib/api/keys";
import { formatDateTime } from "@/lib/admin-format";
import { revokeApiKeyAction, removeWebhookAction } from "@/app/admin/api-actions";
import { CreateKeyForm, CreateWebhookForm } from "@/components/admin/api/ApiForms";

export const metadata = { title: "API" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const n = (v: number) => v.toLocaleString("sv-SE");
const limits = (k: Pick<ApiKeyRow, "ratePerMinute" | "ratePerDay">) => `${n(k.ratePerMinute)}/min · ${n(k.ratePerDay)}/dygn`;

function deliveryStatus(d: { deliveredAt: string | null; failedAt: string | null; attempt: number; status: number | null; nextAttemptAt: string }): string {
  const code = d.status ? ` (${d.status})` : "";
  if (d.deliveredAt) return `Levererad${code}`;
  if (d.failedAt) return `Gav upp efter ${d.attempt} försök${code}`;
  if (d.attempt) return `Försök ${d.attempt} misslyckades${code}, nästa ${formatDateTime(d.nextAttemptAt)}`;
  return "I kö";
}

/** API keys, webhooks and the request log for the organisation (grundkrav 5). */
export default async function ApiAdminPage({ searchParams }: { searchParams: Promise<{ flik?: string; nyckel?: string }> }) {
  const check = await requireRole("admin");
  if (!check.ok) redirect("/admin/ekonomi");
  const q = await searchParams;
  const tab = q.flik === "anrop" ? "anrop" : "nycklar";
  const [keys, usage] = await Promise.all([listApiKeys(), apiUsageLastDay()]);
  const callsLastDay = usage.reduce((sum, u) => sum + u.calls, 0);

  return (
    <section className="sec sec--tight">
      <div className="container" style={{ maxWidth: 1040 }}>
        <span className="eyebrow">{check.orgName}</span>
        <h1 className="admin-h1">API</h1>
        <p className="admin-intro">
          REST-API för kunder, fakturor, betalningar, betalplaner, ROT och händelseloggen, med nycklar per organisation. Dokumentationen (OpenAPI):{" "}
          <Link href="/api/v1/openapi.json" className="link-quiet" target="_blank">
            /api/v1/openapi.json
          </Link>
          . En nyckel ser och skapar bara det som hör till {check.orgName}.
        </p>

        <nav className="inbox-tabs" aria-label="Flik">
          <Link href="/admin/api" aria-current={tab === "nycklar" ? "page" : undefined}>
            Nycklar och webhooks <span>{keys.filter((k) => !k.revokedAt).length}</span>
          </Link>
          <Link href="/admin/api?flik=anrop" aria-current={tab === "anrop" ? "page" : undefined}>
            Anrop <span>{n(callsLastDay)}</span>
          </Link>
        </nav>

        {tab === "anrop" ? <RequestsTab keys={keys} usage={usage} keyId={q.nyckel && UUID.test(q.nyckel) ? q.nyckel : undefined} /> : <KeysTab keys={keys} />}
      </div>
    </section>
  );
}

async function KeysTab({ keys }: { keys: ApiKeyRow[] }) {
  const [hooks, deliveries] = await Promise.all([listWebhooks(), listDeliveries()]);
  return (
    <>
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
                <td>{k.scopes.includes("admin") ? SCOPE_LABEL.admin : k.scopes.map((s) => SCOPE_LABEL[s as ApiScope] ?? s).join(", ")}</td>
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
    </>
  );
}

async function RequestsTab({ keys, usage, keyId }: { keys: ApiKeyRow[]; usage: Awaited<ReturnType<typeof apiUsageLastDay>>; keyId?: string }) {
  const requests = await listApiRequests({ keyId, limit: 200 });
  const keyName = new Map(keys.map((k) => [k.id, k.name]));
  const usageOf = (id: string) => usage.find((u) => u.keyId === id) ?? { calls: 0, errors: 0, lastAt: null };

  return (
    <>
      <p className="admin-intro" style={{ marginTop: 20 }}>
        Varje anrop med en nyckel loggas med metod, sökväg, status, tid och request id (headern X-Request-Id i svaret), aldrig kroppen eller nyckeln. Loggen
        sparas i {API_LOG_RETENTION_DAYS} dagar. Över gränsen svarar API:t 429 med Retry-After.
      </p>

      {keys.length > 0 && (
        <table className="org-table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Nyckel</th>
              <th>Senaste dygnet</th>
              <th>Gräns</th>
              <th>Fel</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => {
              const u = usageOf(k.id);
              return (
                <tr key={k.id}>
                  <td>
                    <Link href={`/admin/api?flik=anrop&nyckel=${k.id}`} className="link-quiet">
                      {k.name}
                    </Link>{" "}
                    <code>{k.prefix}…</code>
                    {k.revokedAt && " (återkallad)"}
                  </td>
                  <td>
                    {n(u.calls)} anrop{u.lastAt ? `, senast ${formatDateTime(u.lastAt)}` : ""}
                  </td>
                  <td>{limits(k)}</td>
                  <td>{u.errors > 0 ? <strong>{n(u.errors)}</strong> : "0"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <form className="inbox-filters" action="/admin/api" method="get">
        <input type="hidden" name="flik" value="anrop" />
        <label className="sr-only" htmlFor="f-key">
          Nyckel
        </label>
        <select id="f-key" name="nyckel" defaultValue={keyId ?? ""}>
          <option value="">Alla nycklar</option>
          {keys.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name} ({k.prefix}…)
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-dark">
          Visa
        </button>
        {keyId && (
          <Link href="/admin/api?flik=anrop" className="link-quiet">
            Alla
          </Link>
        )}
      </form>

      {requests.length === 0 ? (
        <div className="inbox-empty">Inga anrop {keyId ? "med nyckeln " : ""}ännu.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="org-table">
            <thead>
              <tr>
                <th>Tid</th>
                <th>Anrop</th>
                <th>Nyckel</th>
                <th>Status</th>
                <th>ms</th>
                <th>Request id</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.requestId}>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDateTime(r.createdAt)}</td>
                  <td>
                    <code>
                      {r.method} {r.path}
                    </code>
                    {r.idempotencyKey && <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>Idempotency-Key {r.idempotencyKey}</div>}
                  </td>
                  <td>{r.keyId ? (keyName.get(r.keyId) ?? "Borttagen nyckel") : "Borttagen nyckel"}</td>
                  <td>{r.status >= 400 ? <strong>{r.status}</strong> : r.status}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.durationMs}</td>
                  <td>
                    <code style={{ fontSize: 12 }}>{r.requestId}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
