"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/admin";
import { createApiKey, createWebhook, removeWebhook, revokeApiKey } from "@/lib/api/admin-store";
import type { ApiScope } from "@/lib/api/keys";
import type { Actor } from "@/lib/core/events";

/** API keys and webhooks: owner/admin only, here and in RLS. */

export type ApiAdminState = { ok?: boolean; error?: string; message?: string; secret?: string };

const PAGE = "/admin/api";
const actorOf = (email: string | null): Actor => (email ? { kind: "user", id: email, name: email } : { kind: "system", name: "admin" });

export async function createApiKeyAction(_prev: ApiAdminState, formData: FormData): Promise<ApiAdminState> {
  const check = await requireRole("admin");
  if (!check.ok) return { error: "Bara ägare och administratörer hanterar API-nycklar." };
  const access = String(formData.get("access") ?? "read");
  // "payroll" is never implied by read or write: an invoicing key sees no salaries (lib/api/keys.ts).
  const SCOPES: Record<string, ApiScope[]> = { read: ["read"], write: ["read", "write"], payroll: ["payroll"], "payroll-write": ["payroll", "write"], all: ["read", "write", "payroll"] };
  const scopes: ApiScope[] = SCOPES[access] ?? ["read"];
  try {
    const { token } = await createApiKey(String(formData.get("name") ?? ""), scopes, actorOf(check.email));
    revalidatePath(PAGE);
    return { ok: true, message: "Nyckeln är skapad. Kopiera den nu: den visas inte igen.", secret: token };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte skapa nyckeln." };
  }
}

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  const check = await requireRole("admin");
  if (!check.ok) return;
  await revokeApiKey(String(formData.get("id") ?? ""), actorOf(check.email)).catch((err) => console.error("[api] revoke:", err));
  revalidatePath(PAGE);
}

export async function createWebhookAction(_prev: ApiAdminState, formData: FormData): Promise<ApiAdminState> {
  const check = await requireRole("admin");
  if (!check.ok) return { error: "Bara ägare och administratörer hanterar webhooks." };
  try {
    const { secret } = await createWebhook(String(formData.get("url") ?? ""), formData.getAll("events").map(String), actorOf(check.email));
    revalidatePath(PAGE);
    return { ok: true, message: "Webhooken är registrerad. Hemligheten för att kontrollera X-Signature visas bara nu:", secret };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte registrera webhooken." };
  }
}

export async function removeWebhookAction(formData: FormData): Promise<void> {
  const check = await requireRole("admin");
  if (!check.ok) return;
  await removeWebhook(String(formData.get("id") ?? ""), actorOf(check.email)).catch((err) => console.error("[api] remove webhook:", err));
  revalidatePath(PAGE);
}
