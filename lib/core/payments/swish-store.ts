import "server-only";
import { createAdminClient } from "../../supabase/admin";
import { isDemo } from "../../leads";
import { asSystem, getDb } from "../db";
import { DEMO_ORG_ID, readOrgId } from "../org/current";
import { currentChart, getOrgSettings } from "../org/settings-store";
import { isSiteOrg } from "../org/site";
import { postPayment } from "../ledger/posting";
import { paymentReference } from "../documents/invoice";
import { getInvoice, invoiceLabel, isOpen, registerPayment, type InvoiceRecord } from "../invoices/store";
import {
  SWISH_FINAL,
  SwishApiError,
  SwishCallbackError,
  SwishInputError,
  SwishProvider,
  callbackUrl,
  credentialsFromEnv,
  credentialsFromSecret,
  describeCertificate,
  hashCallbackIdentifier,
  maskPayerAlias,
  nextSettlementStep,
  settlementFor,
  verifySwishCallback,
  newInstructionId,
  normalizePayerAlias,
  parseCredentialRef,
  swishErrorText,
  verifyCallbackSignature,
  type Settlement,
  type SwishCredentials,
  type SwishEnvironment,
  type SwishFlow,
  type SwishResult,
  type SwishStatus,
} from "./swish-commerce";

/**
 * Swish Handel against the database: which certificate an organisation
 * uses, the payment requests (swish_payment_requests, 0032) and turning a
 * PAID callback into a payment on the invoice (settle_swish_payment, which
 * calls register_payment as the system). Everything that talks to Swish or
 * writes runs with the service role: the customer paying has no session in
 * the organisation.
 */

export type SwishRequestRecord = {
  id: string;
  orgId: string;
  invoiceId: string;
  swishId: string;
  environment: SwishEnvironment;
  flow: SwishFlow;
  amountOre: number;
  message: string;
  status: SwishStatus;
  payerAlias: string;
  paymentReference: string | null;
  paymentId: string | null;
  error: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
};

type Row = {
  id: string;
  org_id: string;
  invoice_id: string;
  swish_id: string;
  environment: SwishEnvironment;
  flow: SwishFlow;
  amount_ore: number | string;
  message: string;
  status: SwishStatus;
  payer_alias: string;
  payment_reference: string | null;
  callback_identifier_hash: string;
  payment_id: string | null;
  error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
};

const fromRow = (r: Row): SwishRequestRecord => ({
  id: r.id,
  orgId: r.org_id,
  invoiceId: r.invoice_id,
  swishId: r.swish_id,
  environment: r.environment,
  flow: r.flow,
  amountOre: Number(r.amount_ore),
  message: r.message,
  status: r.status,
  payerAlias: r.payer_alias,
  paymentReference: r.payment_reference,
  paymentId: r.payment_id,
  error: r.error,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  paidAt: r.paid_at,
});

const g = globalThis as unknown as { __binaafySwish?: Row[] };
const demo = () => (g.__binaafySwish ??= []);

/* ---------- configuration ---------- */

export type SwishSetup = {
  /** Everything needed to send a request is in place. */
  ready: boolean;
  problems: string[];
  /** Where the certificate is looked for, e.g. "env:SWISH". Null: none configured. */
  source: string | null;
  /** True when the source is the website organisation's fallback, not a saved setting. */
  fallback: boolean;
  environment: SwishEnvironment | null;
  payee: string;
  certificate: { subject: string; swishNumber: string | null; validTo: string; expired: boolean } | null;
  hasCa: boolean;
  callbackSecret: boolean;
  callbackBase: string | null;
};

type Resolved = SwishSetup & { credentials: SwishCredentials | null; secret: string };

async function loadCredentials(source: string | null): Promise<SwishCredentials | null> {
  const ref = parseCredentialRef(source);
  if (!ref) return null;
  if (ref.kind === "env") return credentialsFromEnv(process.env, ref.prefix);
  if (isDemo()) return null;
  const { data, error } = await createAdminClient().rpc("swish_secret", { p_name: ref.name });
  if (error) {
    console.error("[swish] vault secret could not be read:", error.message);
    return null;
  }
  return credentialsFromSecret(data as string | null, source!);
}

/** The callback base: SWISH_CALLBACK_BASE_URL (a tunnel when testing locally) or the site URL. */
function callbackBase(): string | null {
  const base = (process.env.SWISH_CALLBACK_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/$/, "");
  return base || null;
}

async function resolve(orgIdIn: string): Promise<Resolved> {
  // Demo invoices carry no org_id; they belong to the demo organisation.
  const orgId = orgIdIn || (isDemo() ? DEMO_ORG_ID : orgIdIn);
  const settings = await asSystem(() => getOrgSettings(orgId), orgId);
  const saved = settings.payment.swishCommerce?.credentials ?? "";
  const fallback = !saved && (await isSiteOrg(orgId));
  const source = saved || (fallback ? "env:SWISH" : null);
  const credentials = await loadCredentials(source);
  const secret = process.env.SWISH_CALLBACK_SECRET ?? "";
  const base = callbackBase();
  const payee = settings.payment.swish;
  const certificate = credentials ? describeCertificate(credentials.cert) : null;

  const problems: string[] = [];
  if (!source) problems.push("Inget certifikat är angivet.");
  else if (!credentials) problems.push(parseCredentialRef(source)?.kind === "vault" ? `Vault-hemligheten ${source.slice(6)} saknas eller är ogiltig.` : `Miljövariablerna ${source.slice(4)}_CERT_PEM och ${source.slice(4)}_KEY_PEM saknas eller är ogiltiga.`);
  if (credentials && !certificate) problems.push("Certifikatet går inte att läsa.");
  if (certificate?.expired) problems.push(`Certifikatet gick ut ${certificate.validTo}.`);
  if (!payee) problems.push("Swish-nummer saknas under Betalning.");
  if (credentials?.environment === "prod" && certificate?.swishNumber && payee && certificate.swishNumber !== payee)
    problems.push(`Certifikatet är utfärdat för ${certificate.swishNumber}, inte ${payee}.`);
  if (secret.length < 32) problems.push("SWISH_CALLBACK_SECRET saknas eller är kortare än 32 tecken.");
  if (!base || !base.startsWith("https://")) problems.push("Callback-adressen måste vara https (NEXT_PUBLIC_SITE_URL eller SWISH_CALLBACK_BASE_URL).");

  return {
    ready: problems.length === 0,
    problems,
    source,
    fallback,
    environment: credentials?.environment ?? null,
    payee,
    certificate,
    hasCa: !!credentials?.ca,
    callbackSecret: secret.length >= 32,
    callbackBase: base,
    credentials,
    secret,
  };
}

/** For the settings page: what is configured, without any secret. */
export async function getSwishSetup(orgId: string): Promise<SwishSetup> {
  const { credentials, secret, ...setup } = await resolve(orgId);
  void credentials;
  void secret;
  return setup;
}

/** Whether the "Betala med Swish" button should show for an invoice. */
export async function swishCommerceReady(orgId: string): Promise<boolean> {
  try {
    return (await resolve(orgId)).ready;
  } catch (err) {
    console.error("[swish] setup failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

/* ---------- reading ---------- */

/** The requests on an invoice, newest first, for the admin invoice page (RLS: members of the organisation). */
export async function listSwishRequests(invoiceId: string): Promise<SwishRequestRecord[]> {
  if (isDemo()) return demo().filter((r) => r.invoice_id === invoiceId).map(fromRow).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const supabase = await getDb();
  const org = await readOrgId();
  let q = supabase.from("swish_payment_requests").select("*").eq("invoice_id", invoiceId);
  if (org) q = q.eq("org_id", org);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(50);
  // Before 0032 is run the table does not exist; the invoice page should still open.
  if (error) {
    console.error("[swish] requests could not be read:", error.message);
    return [];
  }
  return (data as Row[]).map(fromRow);
}

async function findRow(swishId: string): Promise<Row | null> {
  if (isDemo()) return demo().find((r) => r.swish_id === swishId) ?? null;
  const { data, error } = await createAdminClient().from("swish_payment_requests").select("*").eq("swish_id", swishId).maybeSingle();
  if (error) throw new Error(`Kunde inte läsa Swish-begäran: ${error.message}`);
  return (data as Row | null) ?? null;
}

async function updateRow(swishId: string, patch: Partial<Row>): Promise<void> {
  const values = { ...patch, updated_at: new Date().toISOString() };
  if (isDemo()) {
    const r = demo().find((x) => x.swish_id === swishId);
    if (r) Object.assign(r, values);
    return;
  }
  const { error } = await createAdminClient().from("swish_payment_requests").update(values).eq("swish_id", swishId);
  if (error) throw new Error(`Kunde inte uppdatera Swish-begäran: ${error.message}`);
}

/* ---------- starting a payment ---------- */

/** At most this many requests per invoice in ten minutes: the button cannot be used to spam a phone number. */
const MAX_RECENT = 5;

export type StartedSwishPayment = { swishId: string; flow: SwishFlow; token: string | null; amountOre: number; environment: SwishEnvironment };

/**
 * Send a payment request for what is left to pay on an invoice. The caller
 * has already checked that the person may pay it (the public token or the
 * portal membership). payerAlias given: e-commerce (Swish pushes it to that
 * phone); otherwise m-commerce (the page opens the app with the token).
 */
export async function startSwishPayment(inv: InvoiceRecord, input: { payerAlias?: string | null; createdBy: string }): Promise<StartedSwishPayment> {
  if (!isOpen(inv)) throw new SwishInputError(`${invoiceLabel(inv)} tar inte emot betalningar.`);
  const remaining = inv.payableOre - inv.paidOre;
  if (remaining <= 0) throw new SwishInputError(`${invoiceLabel(inv)} är redan betald.`);

  const payer = input.payerAlias ? normalizePayerAlias(input.payerAlias) : null;
  if (input.payerAlias && !payer) throw new SwishInputError("Ange ett mobilnummer som är kopplat till Swish, t.ex. 070-123 45 67.");

  const setup = await resolve(inv.orgId);
  if (!setup.ready || !setup.credentials) throw new SwishInputError("Swish-betalning är inte påslagen för den här fakturan.");

  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const recent = isDemo()
    ? demo().filter((r) => r.invoice_id === inv.id && r.created_at >= since).length
    : ((await createAdminClient().from("swish_payment_requests").select("id", { count: "exact", head: true }).eq("invoice_id", inv.id).gte("created_at", since)).count ?? 0);
  if (recent >= MAX_RECENT) throw new SwishInputError("För många Swish-försök på kort tid. Vänta några minuter och försök igen.");

  const provider = SwishProvider.fromCredentials(setup.credentials, setup.payee);
  const swishId = newInstructionId();
  const callbackIdentifier = newInstructionId();
  const message = paymentReference(inv.document).value || inv.number || "";
  const flow: SwishFlow = payer ? "ecommerce" : "mcommerce";
  const now = new Date().toISOString();
  // The row is written before Swish is called, so a callback that arrives
  // within a second always finds it.
  const row: Row = {
    id: crypto.randomUUID(),
    org_id: inv.orgId,
    invoice_id: inv.id,
    swish_id: swishId,
    environment: setup.credentials.environment,
    flow,
    amount_ore: remaining,
    message,
    status: "CREATED",
    payer_alias: maskPayerAlias(payer),
    payment_reference: null,
    callback_identifier_hash: hashCallbackIdentifier(callbackIdentifier),
    payment_id: null,
    error: null,
    created_by: input.createdBy,
    created_at: now,
    updated_at: now,
    paid_at: null,
  };
  if (isDemo()) demo().push(row);
  else {
    const { error } = await createAdminClient().from("swish_payment_requests").insert(row);
    if (error) throw new Error(`Kunde inte spara Swish-begäran: ${error.message}`);
  }

  try {
    const created = await provider.createPaymentRequest(inv, remaining, message, {
      callbackUrl: callbackUrl(setup.callbackBase!, swishId, setup.secret),
      payerAlias: payer,
      instructionId: swishId,
      callbackIdentifier,
    });
    return { swishId, flow: created.flow, token: created.token, amountOre: remaining, environment: setup.credentials.environment };
  } catch (err) {
    const text = err instanceof SwishApiError ? swishErrorText(err.code, err.message) : err instanceof Error ? err.message : String(err);
    await updateRow(swishId, { status: "ERROR", error: err instanceof SwishApiError && err.code ? `${err.code}: ${text}` : text }).catch(() => {});
    if (err instanceof SwishApiError || err instanceof SwishInputError) throw new SwishInputError(text);
    console.error("[swish] create failed:", err);
    throw new Error("Swish kunde inte nås. Försök igen om en stund.");
  }
}

/* ---------- settling ---------- */

export type SettleOutcome = { outcome: "paid" | "updated" | "duplicate" | "unbooked"; status: SwishStatus; paymentId: string | null };

/**
 * Apply a final result from Swish (callback or status poll) to the request
 * and, when PAID, to the invoice. Safe to call twice with the same result.
 */
export async function settleSwishResult(row: Row, result: SwishResult): Promise<SettleOutcome> {
  const s = settlementFor(result, Number(row.amount_ore));
  if (!s) return { outcome: "duplicate", status: row.status, paymentId: row.payment_id };
  if (isDemo()) return settleDemo(row, s);

  return asSystem(async () => {
    const inv = await getInvoice(row.invoice_id);
    const posting = postPayment(
      {
        paymentId: row.id,
        amount: s.amountOre,
        method: "swish",
        date: s.paidOn,
        text: inv ? `Inbetalning Swish ${invoiceLabel(inv).toLowerCase()} ${inv.document.buyer.name}` : "Inbetalning Swish",
        dimensions: { projectId: inv?.projectId ?? null, customerId: inv?.customerId ?? null },
      },
      await currentChart()
    );
    const { data, error } = await createAdminClient().rpc("settle_swish_payment", {
      p_swish_id: row.swish_id,
      p_status: s.status,
      p_payment_reference: s.paymentReference ?? "",
      p_amount: s.amountOre,
      p_payer_masked: s.payerMasked,
      p_error: s.error ?? "",
      p_paid_on: s.paidOn,
      p_posting: posting,
    });
    if (error) throw new Error(`Swish-betalningen kunde inte kvitteras: ${error.message}`);
    const r = data as { outcome: SettleOutcome["outcome"]; status: SwishStatus; paymentId: string | null; error?: string };
    if (r.outcome === "unbooked") console.error("[swish] paid but not booked:", row.swish_id, r.error);
    return { outcome: r.outcome, status: r.status, paymentId: r.paymentId };
  }, row.org_id);
}

/** settle_swish_payment for demo mode, with the same rules (nextSettlementStep). */
async function settleDemo(row: Row, s: Settlement): Promise<SettleOutcome> {
  const r = demo().find((x) => x.swish_id === row.swish_id)!;
  const booked = new Map(demo().filter((x) => x.payment_reference && x.payment_id && x.environment === r.environment).map((x) => [x.payment_reference!, x.payment_id!]));
  const step = nextSettlementStep({ status: r.status, amountOre: Number(r.amount_ore), paymentId: r.payment_id }, s, new Set(booked.keys()));
  const now = new Date().toISOString();
  if (step.action === "duplicate") return { outcome: "duplicate", status: r.status, paymentId: r.payment_id };
  if (step.action === "update") {
    Object.assign(r, { status: step.status, error: step.error, payer_alias: s.payerMasked || r.payer_alias, updated_at: now });
    return { outcome: "updated", status: step.status, paymentId: null };
  }
  let paymentId = booked.get(step.reference) ?? null;
  let bookError: string | null = null;
  if (step.action === "book") {
    try {
      await registerPayment(r.invoice_id, { amountOre: step.amountOre, method: "swish", paidOn: s.paidOn, reference: step.reference, note: `Swish Handel ${r.swish_id}` }, { kind: "system", name: "Swish" });
      const pg = globalThis as unknown as { __binaafyInvoices?: { payments: { id: string; invoiceId: string; reference: string }[] } };
      paymentId = [...(pg.__binaafyInvoices?.payments ?? [])].reverse().find((p) => p.invoiceId === r.invoice_id && p.reference === step.reference)?.id ?? null;
    } catch (err) {
      bookError = `Betald hos Swish men inte bokförd: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  Object.assign(r, { status: "PAID", payment_reference: step.reference, payer_alias: s.payerMasked || r.payer_alias, payment_id: paymentId, error: bookError ?? step.note, paid_at: now, updated_at: now });
  return { outcome: bookError ? "unbooked" : step.action === "book" ? "paid" : "duplicate", status: "PAID", paymentId };
}

/* ---------- callback and polling ---------- */

/**
 * Swish's callback: POST /api/swish/callback?id=<instructionUUID>&sig=<hmac>.
 * Verified by verifySwishCallback (URL token, callbackIdentifier, same
 * request); a PAID result is confirmed with Swish before it is applied.
 */
export async function handleSwishCallback(input: { id: string | null; sig: string | null; callbackIdentifier: string | null; body: unknown }): Promise<SettleOutcome> {
  const secret = process.env.SWISH_CALLBACK_SECRET ?? "";
  // The signature is checked before the database is touched.
  if (!secret || !verifyCallbackSignature(input.id ?? "", input.sig ?? "", secret)) throw new SwishCallbackError(403, "Ogiltig callback-token.");
  const row = await findRow(input.id!);
  let result = verifySwishCallback({ ...input, secret, request: row ? { swishId: row.swish_id, callbackIdentifierHash: row.callback_identifier_hash } : null });
  // Money is only booked on Swish's own word: a PAID callback is confirmed
  // with a status call over mTLS. If Swish cannot be reached, the verified
  // callback (URL token and callbackIdentifier) stands.
  if (result.status === "PAID" && row!.status === "CREATED") {
    try {
      const setup = await resolve(row!.org_id);
      if (setup.credentials) {
        const confirmed = await SwishProvider.fromCredentials(setup.credentials, setup.payee).getStatus(row!.swish_id);
        if (confirmed.status !== "PAID") {
          console.warn("[swish] PAID callback not confirmed by Swish:", row!.swish_id, confirmed.status);
          if (!SWISH_FINAL.includes(confirmed.status)) return { outcome: "duplicate", status: row!.status, paymentId: null };
        }
        result = confirmed;
      }
    } catch (err) {
      console.error("[swish] could not confirm PAID callback, using the verified callback:", err instanceof Error ? err.message : err);
    }
  }
  return settleSwishResult(row!, result);
}

export type PublicSwishStatus = { status: SwishStatus; message: string | null; invoicePaid: boolean };

/** Seconds before the status route also asks Swish itself (the callback may not reach us, e.g. locally). */
const POLL_AFTER_MS = 4_000;

/**
 * What the waiting page polls: /api/swish/status?id=… The id (128 random
 * bits) is the key; the answer holds no personal data. When the callback has
 * not arrived after a few seconds, Swish is asked directly and the result is
 * applied the same way.
 */
export async function getSwishStatus(swishId: string): Promise<PublicSwishStatus | null> {
  let row = await findRow(swishId);
  if (!row) return null;
  if (row.status === "CREATED" && Date.now() - new Date(row.created_at).getTime() > POLL_AFTER_MS) {
    try {
      const setup = await resolve(row.org_id);
      if (setup.credentials) {
        const result = await SwishProvider.fromCredentials(setup.credentials, setup.payee).getStatus(row.swish_id);
        if (SWISH_FINAL.includes(result.status)) {
          await settleSwishResult(row, result);
          row = (await findRow(swishId)) ?? row;
        }
      }
    } catch (err) {
      console.error("[swish] status poll failed:", err instanceof Error ? err.message : err);
    }
  }
  const message = row.status === "PAID" ? null : row.status === "CREATED" ? null : (row.error?.replace(/^[A-Z0-9]+: /, "") ?? null);
  return { status: row.status, message, invoicePaid: row.status === "PAID" && !!row.payment_id };
}

/** Cancel an unsigned request (the customer pressed "Avbryt"). */
export async function cancelSwishPayment(swishId: string): Promise<void> {
  const row = await findRow(swishId);
  if (!row || row.status !== "CREATED") return;
  const setup = await resolve(row.org_id);
  if (!setup.credentials) return;
  try {
    const result = await SwishProvider.fromCredentials(setup.credentials, setup.payee).cancel(swishId);
    await settleSwishResult(row, result);
  } catch (err) {
    // RP07: already signed or finished; the callback or the next poll settles it.
    if (!(err instanceof SwishApiError && err.code === "RP07")) throw err;
  }
}
