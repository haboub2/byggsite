import { createHash, createHmac, randomUUID, timingSafeEqual, X509Certificate } from "node:crypto";
import { Agent, request as httpsRequest } from "node:https";

/**
 * Swish Handel (the Swish Commerce API): we send a payment request, the
 * customer approves it in the Swish app, and Swish calls our callback the
 * second the money has moved. The QR in lib/core/payments/swish.ts needs no
 * agreement; this needs the bank's Swish Handel agreement and a client
 * certificate per Swish number (mTLS).
 *
 * Checked against developer.swish.nu on 2026-10-25 (docs/fakturering.md,
 * "Swish Handel"):
 *   PUT   {base}/swish-cpcapi/api/v2/paymentrequests/{instructionUUID}  create, 201 + Location (+ PaymentRequestToken for m-commerce)
 *   GET   {base}/swish-cpcapi/api/v1/paymentrequests/{id}               status
 *   PATCH {base}/swish-cpcapi/api/v1/paymentrequests/{id}               cancel (application/json-patch+json)
 * base: https://cpc.getswish.net (prod), https://mss.cpc.getswish.net (Merchant Swish Simulator).
 * The callback is an HTTPS POST to callbackUrl (port 443) with the payment
 * request object as body and our callbackIdentifier echoed as a header.
 *
 * Nothing here touches the database; lib/core/payments/swish-store.ts does.
 * The transport is injectable so the tests run against recorded simulator
 * responses without certificates or network.
 */

export type SwishEnvironment = "test" | "prod";
export type SwishStatus = "CREATED" | "PAID" | "DECLINED" | "ERROR" | "CANCELLED";
export type SwishFlow = "mcommerce" | "ecommerce";
export const SWISH_STATUSES: readonly SwishStatus[] = ["CREATED", "PAID", "DECLINED", "ERROR", "CANCELLED"];
export const SWISH_FINAL: readonly SwishStatus[] = ["PAID", "DECLINED", "ERROR", "CANCELLED"];
export const SWISH_STATUS_LABEL: Record<SwishStatus, string> = { CREATED: "Väntar på kunden", PAID: "Betald", DECLINED: "Avböjd", ERROR: "Misslyckades", CANCELLED: "Avbruten" };

export const SWISH_BASE_URL: Record<SwishEnvironment, string> = {
  test: "https://mss.cpc.getswish.net",
  prod: "https://cpc.getswish.net",
};
const API = "/swish-cpcapi/api";

/** Swish's limits on amount: 0.01 to 999 999 999 999.99 SEK. */
const MIN_ORE = 1;
const MAX_ORE = 99_999_999_999_999;

/* ---------- credentials ---------- */

export type SwishCredentials = {
  environment: SwishEnvironment;
  cert: string;
  key: string;
  /** Swish's TLS root; without it Node's own CA list is used (works for prod, DigiCert). */
  ca?: string;
  passphrase?: string;
  /** Where they came from, e.g. "env:SWISH" or "vault:swish_acme". Shown in admin, never the content. */
  source: string;
};

/** A PEM block as given in an environment variable: plain PEM (with real or escaped newlines) or base64 of the PEM. */
export function decodePem(value: string | undefined | null): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (v.includes("-----BEGIN")) return v.replace(/\\n/g, "\n");
  try {
    const decoded = Buffer.from(v, "base64").toString("utf8");
    return decoded.includes("-----BEGIN") ? decoded : null;
  } catch {
    return null;
  }
}

export type CredentialRef = { kind: "env"; prefix: string } | { kind: "vault"; name: string };

/**
 * org_settings.payment.swishCommerce.credentials: "env:SWISH" reads
 * SWISH_CERT_PEM, SWISH_KEY_PEM, SWISH_CA_PEM, SWISH_ENV (and
 * SWISH_KEY_PASSPHRASE); "vault:swish_acme" reads that Vault secret, a JSON
 * object {cert, key, ca?, passphrase?, environment}.
 */
export function parseCredentialRef(ref: string | undefined | null): CredentialRef | null {
  const r = (ref ?? "").trim();
  const env = /^env:([A-Z][A-Z0-9_]{0,40})$/.exec(r);
  if (env) return { kind: "env", prefix: env[1] };
  const vault = /^vault:(swish_[a-z0-9_]{1,60})$/.exec(r);
  if (vault) return { kind: "vault", name: vault[1] };
  return null;
}

export function credentialsFromEnv(env: Record<string, string | undefined>, prefix = "SWISH"): SwishCredentials | null {
  const cert = decodePem(env[`${prefix}_CERT_PEM`]);
  const key = decodePem(env[`${prefix}_KEY_PEM`]);
  if (!cert || !key) return null;
  return {
    environment: env[`${prefix}_ENV`] === "prod" ? "prod" : "test",
    cert,
    key,
    ca: decodePem(env[`${prefix}_CA_PEM`]) ?? undefined,
    passphrase: env[`${prefix}_KEY_PASSPHRASE`] || undefined,
    source: `env:${prefix}`,
  };
}

export function credentialsFromSecret(secret: string | null | undefined, source: string): SwishCredentials | null {
  if (!secret) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(secret) as Record<string, unknown>;
  } catch {
    return null;
  }
  const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : undefined);
  const cert = decodePem(str("cert"));
  const key = decodePem(str("key"));
  if (!cert || !key) return null;
  return { environment: str("environment") === "prod" ? "prod" : "test", cert, key, ca: decodePem(str("ca")) ?? undefined, passphrase: str("passphrase") || undefined, source };
}

/** What admin may see about a certificate: the Swish number it was issued to and how long it is valid. */
export function describeCertificate(pem: string): { subject: string; swishNumber: string | null; validTo: string; expired: boolean } | null {
  try {
    const x = new X509Certificate(pem);
    const cn = /CN=([^,\n]+)/.exec(x.subject)?.[1]?.trim() ?? "";
    const validTo = new Date(x.validTo);
    return { subject: cn, swishNumber: /^\d{10}$/.test(cn) ? cn : null, validTo: validTo.toISOString().slice(0, 10), expired: validTo.getTime() < Date.now() };
  } catch {
    return null;
  }
}

/* ---------- values ---------- */

/** Öre to the amount Swish takes: kronor with two decimals and a period, "1234.50". */
export function swishAmount(amountOre: number): string {
  if (!Number.isSafeInteger(amountOre)) throw new RangeError(`Beloppet måste vara ett heltal i öre, fick ${amountOre}.`);
  if (amountOre < MIN_ORE) throw new RangeError("Swish tar emot minst 0,01 kr.");
  if (amountOre > MAX_ORE) throw new RangeError("Beloppet är större än Swish tillåter.");
  return `${Math.floor(amountOre / 100)}.${String(amountOre % 100).padStart(2, "0")}`;
}

/** An amount from Swish (number 100.5 or string "100.50") back to öre, without floating-point drift. */
export function oreFromSwishAmount(value: unknown): number | null {
  const s = typeof value === "number" ? (Number.isFinite(value) ? value.toFixed(2) : "") : typeof value === "string" ? value.trim() : "";
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
}

/** Swish's message: max 50 characters, letters a–ö, digits, space and !?(),.-:; */
export function swishMessage(text: string): string {
  return text
    .replace(/[^a-zA-ZåäöÅÄÖéÉüÜ0-9 !?(),.\-:;]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50)
    .trim();
}

/** payeePaymentReference: 1–35 of a-z A-Z 0-9 and "-". */
export function swishReference(value: string): string {
  const r = value.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 35);
  return r || "faktura";
}

/**
 * The payer's mobile number as Swish wants it: country code without "+" or
 * leading zero, 8–15 digits. "070-123 45 67" → "46701234567". Null when it
 * cannot be a number Swish knows.
 */
export function normalizePayerAlias(input: string): string | null {
  let d = input.trim().replace(/[\s\-()]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (/^0\d/.test(d)) d = `46${d.slice(1)}`;
  if (!/^\d{8,15}$/.test(d)) return null;
  // A Swedish number must be a mobile number: 46 7x xxx xx xx.
  if (d.startsWith("46") && !/^467\d{8}$/.test(d)) return null;
  return d;
}

/** The payer's number as we store and show it: country code and the first digit, then stars, then the last two. */
export function maskPayerAlias(alias: string | null | undefined): string {
  const d = (alias ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length <= 6) return "*".repeat(d.length);
  return `${d.slice(0, 4)}${"*".repeat(d.length - 6)}${d.slice(-2)}`;
}

/** instructionUUID: 32 upper-case hex digits. */
export function newInstructionId(): string {
  return randomUUID().replace(/-/g, "").toUpperCase();
}

export function isInstructionId(value: string): boolean {
  return /^[0-9A-F]{32}$/.test(value);
}

/* ---------- our callback URL ---------- */

/** The token in our callback URL: HMAC-SHA256 of the request id with SWISH_CALLBACK_SECRET. */
export function callbackSignature(swishId: string, secret: string): string {
  return createHmac("sha256", secret).update(`swish-callback:${swishId}`).digest("hex");
}

export function verifyCallbackSignature(swishId: string, signature: string, secret: string): boolean {
  if (!secret || !/^[0-9a-f]{64}$/.test(signature)) return false;
  const expected = Buffer.from(callbackSignature(swishId, secret), "hex");
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

export function callbackUrl(baseUrl: string, swishId: string, secret: string): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}/api/swish/callback?id=${swishId}&sig=${callbackSignature(swishId, secret)}`;
}

/** callbackIdentifier is echoed by Swish as a header; we keep only its hash. */
export function hashCallbackIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/* ---------- request and result ---------- */

export type SwishPaymentRequestBody = {
  payeePaymentReference: string;
  callbackUrl: string;
  payeeAlias: string;
  payerAlias?: string;
  amount: string;
  currency: "SEK";
  message: string;
  callbackIdentifier: string;
};

export type SwishInvoiceRef = { id: string; number: string | null };

export type CreatePaymentRequestOptions = {
  callbackUrl: string;
  /** Set: e-commerce, Swish pushes the request to this number. Unset: m-commerce, we open the app with the token. */
  payerAlias?: string | null;
  instructionId?: string;
  callbackIdentifier?: string;
};

export function buildPaymentRequestBody(input: {
  payeeAlias: string;
  amountOre: number;
  message: string;
  reference: string;
  callbackUrl: string;
  callbackIdentifier: string;
  payerAlias?: string | null;
}): SwishPaymentRequestBody {
  const payee = input.payeeAlias.replace(/\D/g, "");
  if (!/^\d{10,11}$/.test(payee)) throw new SwishInputError("Swish-numret för betalningsmottagaren saknas eller är ogiltigt.");
  if (!/^https:\/\//.test(input.callbackUrl)) throw new SwishInputError("Swish kräver en callback-adress med https.");
  if (!/^[0-9a-zA-Z-]{32,36}$/.test(input.callbackIdentifier)) throw new SwishInputError("Ogiltig callbackIdentifier.");
  let payer: string | undefined;
  if (input.payerAlias) {
    const n = normalizePayerAlias(input.payerAlias);
    if (!n) throw new SwishInputError("Ange ett mobilnummer som är kopplat till Swish, t.ex. 070-123 45 67.");
    payer = n;
  }
  return {
    payeePaymentReference: swishReference(input.reference),
    callbackUrl: input.callbackUrl,
    payeeAlias: payee,
    ...(payer ? { payerAlias: payer } : {}),
    amount: swishAmount(input.amountOre),
    currency: "SEK",
    message: swishMessage(input.message),
    callbackIdentifier: input.callbackIdentifier,
  };
}

/** A payment request object as Swish returns it (GET and callback), normalised. */
export type SwishResult = {
  id: string;
  status: SwishStatus;
  payeePaymentReference: string | null;
  paymentReference: string | null;
  payerAlias: string | null;
  payeeAlias: string | null;
  amountOre: number | null;
  message: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  datePaid: string | null;
};

const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);

/** Parse and validate a payment request object (callback body or GET response). Throws on anything that is not one. */
export function parseSwishResult(body: unknown): SwishResult {
  const o = typeof body === "string" ? safeJson(body) : body;
  if (!o || typeof o !== "object" || Array.isArray(o)) throw new SwishInputError("Svaret från Swish är inte ett betalningsobjekt.");
  const r = o as Record<string, unknown>;
  const id = str(r.id);
  if (!id || !/^[0-9A-Fa-f]{32}$/.test(id)) throw new SwishInputError("Svaret från Swish saknar giltigt id.");
  const status = str(r.status)?.toUpperCase() as SwishStatus | undefined;
  if (!status || !SWISH_STATUSES.includes(status)) throw new SwishInputError(`Okänd status från Swish: ${String(r.status)}.`);
  return {
    id: id.toUpperCase(),
    status,
    payeePaymentReference: str(r.payeePaymentReference),
    paymentReference: str(r.paymentReference),
    payerAlias: str(r.payerAlias),
    payeeAlias: str(r.payeeAlias),
    amountOre: oreFromSwishAmount(r.amount),
    message: str(r.message),
    errorCode: str(r.errorCode),
    errorMessage: str(r.errorMessage),
    datePaid: str(r.datePaid),
  };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** What the customer reads when Swish says no. Codes from developer.swish.nu (payment request and MSS). */
export const SWISH_ERROR_TEXT: Record<string, string> = {
  RF07: "Betalningen nekades. Kontrollera beloppsgränsen för Swish och saldot med din bank.",
  BANKIDCL: "Signeringen med BankID avbröts.",
  TM01: "Tiden för att godkänna betalningen gick ut.",
  DS24: "Swish fick inget svar från banken. Kontrollera med din bank om pengarna har dragits innan du betalar igen.",
  FF10: "Banken kunde inte genomföra betalningen just nu. Försök igen om en stund.",
  ACMT03: "Numret är inte anslutet till Swish.",
  ACMT01: "Mottagaren är inte aktiverad i Swish.",
  ACMT07: "Mottagaren är inte ansluten till Swish.",
  BE18: "Mobilnumret är ogiltigt.",
  RP06: "Det finns redan en pågående Swish-betalning för numret. Avsluta den i appen först.",
  VR01: "Betalaren uppfyller inte åldersgränsen.",
  VR02: "Numret är inte registrerat på det personnumret.",
  AM02: "Beloppet är för stort för Swish.",
  AM06: "Beloppet är för litet för Swish.",
};

export function swishErrorText(code: string | null | undefined, fallback?: string | null): string {
  return (code && SWISH_ERROR_TEXT[code]) || fallback || "Swish kunde inte genomföra betalningen.";
}

export class SwishInputError extends Error {}

export class SwishApiError extends Error {
  constructor(
    readonly status: number,
    readonly errors: { errorCode: string; errorMessage: string }[],
    message?: string
  ) {
    super(message ?? (errors[0] ? `${errors[0].errorCode}: ${errors[0].errorMessage}` : `Swish svarade ${status}.`));
  }
  get code(): string | null {
    return this.errors[0]?.errorCode ?? null;
  }
}

/* ---------- transport ---------- */

export type SwishHttpRequest = { method: "GET" | "PUT" | "PATCH"; url: string; headers: Record<string, string>; body?: string };
export type SwishHttpResponse = { status: number; headers: Record<string, string | undefined>; body: string };
export type SwishTransport = (req: SwishHttpRequest) => Promise<SwishHttpResponse>;

/** mTLS with the merchant's client certificate, TLS 1.2 or later, ten seconds per call. */
export function httpsTransport(creds: SwishCredentials, timeoutMs = 10_000): SwishTransport {
  const agent = new Agent({ cert: creds.cert, key: creds.key, ca: creds.ca, passphrase: creds.passphrase, minVersion: "TLSv1.2", keepAlive: true });
  return (req) =>
    new Promise((resolve, reject) => {
      const r = httpsRequest(req.url, { method: req.method, agent, headers: req.headers, timeout: timeoutMs }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const headers: Record<string, string | undefined> = {};
          for (const [k, v] of Object.entries(res.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : v;
          resolve({ status: res.statusCode ?? 0, headers, body: Buffer.concat(chunks).toString("utf8") });
        });
      });
      r.on("timeout", () => r.destroy(new Error("Swish svarade inte i tid.")));
      r.on("error", reject);
      if (req.body) r.write(req.body);
      r.end();
    });
}

/* ---------- the provider ---------- */

export type CreatedPaymentRequest = {
  id: string;
  flow: SwishFlow;
  /** m-commerce: opens the app, swish://paymentrequest?token=…&callbackurl=… */
  token: string | null;
  location: string | null;
  callbackIdentifier: string;
  body: SwishPaymentRequestBody;
};

/**
 * A provider of instant payments that settle an invoice by callback. Swish
 * is the first; a card or open-banking provider would implement the same.
 */
export interface InstantPaymentProvider {
  readonly name: string;
  createPaymentRequest(invoice: SwishInvoiceRef, amountOre: number, message: string, options: CreatePaymentRequestOptions): Promise<CreatedPaymentRequest>;
  getStatus(id: string): Promise<SwishResult>;
  cancel(id: string): Promise<SwishResult>;
  handleCallback(body: unknown): SwishResult;
}

export class SwishProvider implements InstantPaymentProvider {
  readonly name = "swish";
  readonly environment: SwishEnvironment;
  private readonly payeeAlias: string;
  private readonly transport: SwishTransport;
  private readonly baseUrl: string;

  constructor(opts: { environment: SwishEnvironment; payeeAlias: string; transport: SwishTransport; baseUrl?: string }) {
    this.environment = opts.environment;
    this.payeeAlias = opts.payeeAlias;
    this.transport = opts.transport;
    this.baseUrl = (opts.baseUrl ?? SWISH_BASE_URL[opts.environment]).replace(/\/$/, "");
  }

  static fromCredentials(creds: SwishCredentials, payeeAlias: string): SwishProvider {
    return new SwishProvider({ environment: creds.environment, payeeAlias, transport: httpsTransport(creds) });
  }

  /** PUT a payment request with our instructionUUID; the message is the invoice's OCR or reference. */
  async createPaymentRequest(invoice: SwishInvoiceRef, amountOre: number, message: string, options: CreatePaymentRequestOptions): Promise<CreatedPaymentRequest> {
    const id = options.instructionId ?? newInstructionId();
    if (!isInstructionId(id)) throw new SwishInputError("Ogiltigt instructionUUID.");
    const callbackIdentifier = options.callbackIdentifier ?? newInstructionId();
    const body = buildPaymentRequestBody({
      payeeAlias: this.payeeAlias,
      amountOre,
      message,
      reference: invoice.number ? `F${invoice.number}` : invoice.id.slice(0, 8),
      callbackUrl: options.callbackUrl,
      callbackIdentifier,
      payerAlias: options.payerAlias,
    });
    const res = await this.transport({
      method: "PUT",
      url: `${this.baseUrl}${API}/v2/paymentrequests/${id}`,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status !== 201) throw apiError(res);
    return {
      id,
      flow: body.payerAlias ? "ecommerce" : "mcommerce",
      token: res.headers["paymentrequesttoken"] ?? null,
      location: res.headers["location"] ?? null,
      callbackIdentifier,
      body,
    };
  }

  async getStatus(id: string): Promise<SwishResult> {
    if (!isInstructionId(id)) throw new SwishInputError("Ogiltigt id.");
    const res = await this.transport({ method: "GET", url: `${this.baseUrl}${API}/v1/paymentrequests/${id}`, headers: { Accept: "application/json" } });
    if (res.status !== 200) throw apiError(res);
    return parseSwishResult(res.body);
  }

  /** Withdraw a request the payer has not signed yet. Swish answers RP07 when it is too late. */
  async cancel(id: string): Promise<SwishResult> {
    if (!isInstructionId(id)) throw new SwishInputError("Ogiltigt id.");
    const res = await this.transport({
      method: "PATCH",
      url: `${this.baseUrl}${API}/v1/paymentrequests/${id}`,
      headers: { "Content-Type": "application/json-patch+json" },
      body: JSON.stringify([{ op: "replace", path: "/status", value: "cancelled" }]),
    });
    if (res.status !== 200) throw apiError(res);
    return parseSwishResult(res.body);
  }

  /** The callback body, validated. Authenticity (URL token, callbackIdentifier) is checked by the route before this. */
  handleCallback(body: unknown): SwishResult {
    return parseSwishResult(body);
  }
}

function apiError(res: SwishHttpResponse): SwishApiError {
  const parsed = safeJson(res.body);
  const errors = Array.isArray(parsed)
    ? parsed
        .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
        .map((e) => ({ errorCode: String(e.errorCode ?? ""), errorMessage: String(e.errorMessage ?? "") }))
    : [];
  const fallback =
    res.status === 401
      ? "Swish godkände inte certifikatet (401)."
      : res.status === 403
        ? "Swish-numret stämmer inte med certifikatet (403)."
        : res.status === 429
          ? "Swish har fått för många anrop just nu (429)."
          : undefined;
  return new SwishApiError(res.status, errors, errors.length ? undefined : fallback);
}

/* ---------- callback and settlement rules ---------- */

export class SwishCallbackError extends Error {
  constructor(
    readonly httpStatus: number,
    message: string
  ) {
    super(message);
  }
}

/**
 * Check a callback before anything is applied: the URL token is our HMAC of
 * the request id, the callbackIdentifier header matches the one sent with
 * that request (we keep its hash), and the body is that same request.
 */
export function verifySwishCallback(input: {
  id: string | null;
  sig: string | null;
  callbackIdentifier: string | null;
  body: unknown;
  secret: string;
  request: { swishId: string; callbackIdentifierHash: string } | null;
}): SwishResult {
  const id = input.id ?? "";
  if (!input.secret || !verifyCallbackSignature(id, input.sig ?? "", input.secret)) throw new SwishCallbackError(403, "Ogiltig callback-token.");
  if (!input.request) throw new SwishCallbackError(404, "Okänd Swish-begäran.");
  const hash = input.request.callbackIdentifierHash;
  if (hash && (!input.callbackIdentifier || hashCallbackIdentifier(input.callbackIdentifier) !== hash)) throw new SwishCallbackError(403, "callbackIdentifier stämmer inte.");
  let result: SwishResult;
  try {
    result = parseSwishResult(input.body);
  } catch (err) {
    throw new SwishCallbackError(400, err instanceof Error ? err.message : "Ogiltig callback.");
  }
  if (result.id !== input.request.swishId) throw new SwishCallbackError(400, "Callbacken gäller en annan begäran.");
  return result;
}

/** What a final result means for the request row and the books. */
export type Settlement = {
  status: Exclude<SwishStatus, "CREATED">;
  paymentReference: string | null;
  amountOre: number;
  payerMasked: string;
  error: string | null;
  /** The Swedish date of the payment (Europe/Stockholm). */
  paidOn: string;
};

export function settlementFor(result: SwishResult, requestedOre: number, now = new Date()): Settlement | null {
  if (result.status === "CREATED") return null;
  const d = result.datePaid ? new Date(result.datePaid) : now;
  const paidOn = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(Number.isNaN(d.getTime()) ? now : d);
  const error =
    result.status === "PAID"
      ? null
      : result.errorCode
        ? `${result.errorCode}: ${swishErrorText(result.errorCode, result.errorMessage)}`
        : result.status === "DECLINED"
          ? "Betalaren avböjde."
          : result.status === "CANCELLED"
            ? "Avbruten."
            : (result.errorMessage ?? "Swish kunde inte genomföra betalningen.");
  return { status: result.status, paymentReference: result.paymentReference, amountOre: result.amountOre ?? requestedOre, payerMasked: maskPayerAlias(result.payerAlias), error, paidOn };
}

/**
 * The rules settle_swish_payment (0032) applies, as a pure function for
 * demo mode and the tests: a request is settled once; a PAID result books a
 * payment unless that Swish reference is already booked.
 */
export function nextSettlementStep(
  request: { status: SwishStatus; amountOre: number; paymentId: string | null },
  s: Settlement,
  bookedReferences: ReadonlySet<string>
): { action: "duplicate" } | { action: "update"; status: Settlement["status"]; error: string | null } | { action: "book" | "already-booked"; reference: string; amountOre: number; note: string | null } {
  if (request.status !== "CREATED") return { action: "duplicate" };
  if (s.status !== "PAID") return { action: "update", status: s.status, error: s.error };
  if (!s.paymentReference) throw new SwishInputError("En betald Swish-begäran saknar betalningsreferens.");
  if (s.amountOre <= 0) throw new SwishInputError("Beloppet från Swish är ogiltigt.");
  const note = s.amountOre !== request.amountOre ? `Swish betalade ${s.amountOre} öre, begäran gällde ${request.amountOre} öre.` : null;
  return { action: bookedReferences.has(s.paymentReference) ? "already-booked" : "book", reference: s.paymentReference, amountOre: s.amountOre, note };
}

/** The deep link that opens the Swish app on the phone. The callback URL brings the customer back to the invoice. */
export function swishAppUrl(token: string, returnUrl: string): string {
  return `swish://paymentrequest?token=${encodeURIComponent(token)}&callbackurl=${encodeURIComponent(returnUrl)}`;
}
