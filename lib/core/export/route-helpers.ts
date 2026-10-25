import "server-only";
import { requireRole, type AdminCheck } from "../../admin";
import type { Actor } from "../events";

/** Who downloads, for the event. Any member may (requireRole("read")). */
export async function exportCaller(): Promise<{ check: Extract<AdminCheck, { ok: true }>; actor: Actor } | null> {
  const check = await requireRole("read");
  if (!check.ok) return null;
  const actor: Actor = check.userId ? { kind: "user", id: check.userId, name: check.email ?? check.userId } : { kind: "system", name: check.email ?? "admin" };
  return { check, actor };
}

/** Headers for a file download that no cache keeps. */
export function downloadHeaders(contentType: string, fileName: string): HeadersInit {
  return {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${fileName}"`,
    "Cache-Control": "no-store",
  };
}

/** This deployment's origin from the request headers, for calling its own cron route. Null outside a request. */
export async function requestOrigin(): Promise<string | null> {
  const { headers } = await import("next/headers");
  const h = await headers().catch(() => null);
  const host = h?.get("x-forwarded-host") ?? h?.get("host");
  if (!host) return null;
  const proto = h?.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
