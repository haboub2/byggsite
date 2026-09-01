import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";
import { rateLimit } from "./rate-limit";
import { notify, autoreply } from "./mail";
import { isSupabaseConfigured } from "./supabase/config";
import { createAdminClient } from "./supabase/admin";

type LeadKind = "offert" | "kontakt" | "brief";
type Division = "bygg" | "01";

type BaseFields = { name: string; email: string; phone?: string; message: string };

/**
 * Shared POST handler for the three lead forms. Validates -> persists to
 * Supabase (service-role, bypasses RLS) -> notifies -> auto-replies, in that
 * order, per PLAN.md §7.1: a mail failure must never lose a lead, so the
 * insert happens first and mail is best-effort afterwards.
 *
 * Unlike the admin auth scaffold, this does NOT fail open: if Supabase isn't
 * configured yet, the request reports failure rather than silently claiming
 * success while dropping the lead on the floor.
 */
export async function handleLead<T extends BaseFields>({
  request,
  kind,
  division,
  page,
  schema,
  toLeadFields,
}: {
  request: NextRequest;
  kind: LeadKind;
  division: Division;
  page: string;
  schema: ZodType<T>;
  toLeadFields: (data: T) => {
    service?: string;
    budget?: string;
    timeline?: string;
    extra?: Record<string, string | undefined>;
  };
}) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`${kind}:${ip}`)) {
    return NextResponse.json(
      { ok: false, error: "För många förfrågningar. Försök igen om en stund." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Ogiltig förfrågan." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Ogiltiga uppgifter." },
      { status: 400 }
    );
  }
  const data = parsed.data;
  const fields = toLeadFields(data);

  if (!isSupabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(`[leads] Supabase not configured — ${kind} lead from ${data.email} was NOT persisted.`);
    return NextResponse.json(
      { ok: false, error: "Formuläret är inte kopplat till databasen än." },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const source = {
    utm_source: url.searchParams.get("utm_source"),
    utm_medium: url.searchParams.get("utm_medium"),
    utm_campaign: url.searchParams.get("utm_campaign"),
    referrer: request.headers.get("referer"),
    page,
  };

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("leads").insert({
      division,
      kind,
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      service: fields.service || null,
      budget: fields.budget || null,
      timeline: fields.timeline || null,
      message: data.message,
      source,
      status: "new",
    });
    if (error) {
      console.error("[leads] insert failed", error);
      return NextResponse.json({ ok: false, error: "Kunde inte spara förfrågan. Försök igen." }, { status: 500 });
    }
  } catch (err) {
    console.error("[leads] insert threw", err);
    return NextResponse.json({ ok: false, error: "Kunde inte spara förfrågan. Försök igen." }, { status: 500 });
  }

  await notify({
    kind,
    name: data.name,
    email: data.email,
    phone: data.phone,
    message: data.message,
    extra: fields.extra,
  });
  await autoreply({ kind, division, name: data.name, email: data.email });

  return NextResponse.json({ ok: true });
}
