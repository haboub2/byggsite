"use server";

import { headers } from "next/headers";
import { rateLimit } from "@/lib/rate-limit";
import { HONEYPOT } from "@/lib/schema";
import { interestFromForm, interestRows, interestSchema, type InterestSource } from "@/lib/interest-schema";
import { saveInterest } from "@/lib/interest";
import { productInterestMail } from "@/lib/mail";
import { PRODUCT_NAME, PRODUCT_PATH } from "@/lib/product";

export type InterestState = {
  status: "idle" | "error" | "done";
  message?: string;
  /** What the visitor typed, so a failed attempt doesn't empty the form. */
  values?: Record<string, string>;
  /** The fault is ours: offer the company's address as a way round it. */
  offerMail?: boolean;
  /** Bumped per attempt; the form remounts with `values` as its defaults. */
  attempt: number;
};

const text = (form: FormData, key: string, max = 300) => {
  const v = form.get(key);
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
};

/**
 * The interest form on /fakturering. Validates, saves (the row must not be
 * lost to a mail failure, so the insert comes first), then mails the team.
 */
export async function submitInterest(prev: InterestState, form: FormData): Promise<InterestState> {
  const attempt = prev.attempt + 1;
  const raw = interestFromForm(form);
  const values = Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string"));

  // Bots fill every field, including the hidden one. Pretend it worked and drop it.
  if (text(form, HONEYPOT)) return { status: "done", attempt };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`interest:${ip}`)) {
    return { status: "error", message: "För många anmälningar härifrån. Försök igen om en stund.", values, attempt };
  }

  const parsed = interestSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Kontrollera uppgifterna.", values, attempt };
  }
  const data = parsed.data;

  const source: InterestSource = {
    page: text(form, "src_page") ?? PRODUCT_PATH,
    referrer: text(form, "src_referrer") ?? h.get("referer"),
    utm_source: text(form, "src_utm_source"),
    utm_medium: text(form, "src_utm_medium"),
    utm_campaign: text(form, "src_utm_campaign"),
  };

  try {
    await saveInterest(data, source);
  } catch (err) {
    console.error("[interest] save failed", err);
    return {
      status: "error",
      message: "Anmälan kunde inte sparas just nu. Försök igen om en stund, eller mejla oss direkt:",
      offerMail: true,
      values,
      attempt,
    };
  }

  await productInterestMail({ product: PRODUCT_NAME, company: data.company, email: data.email, rows: interestRows(data) });
  return { status: "done", attempt };
}
