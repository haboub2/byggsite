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
