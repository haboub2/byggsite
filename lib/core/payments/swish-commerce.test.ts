import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SwishApiError,
  SwishCallbackError,
  SwishInputError,
  SwishProvider,
  buildPaymentRequestBody,
  callbackSignature,
  callbackUrl,
  credentialsFromEnv,
  credentialsFromSecret,
  decodePem,
  describeCertificate,
  hashCallbackIdentifier,
  maskPayerAlias,
  newInstructionId,
  nextSettlementStep,
  normalizePayerAlias,
  oreFromSwishAmount,
  parseCredentialRef,
  parseSwishResult,
  settlementFor,
  swishAmount,
  swishAppUrl,
  swishMessage,
  verifyCallbackSignature,
  verifySwishCallback,
  type SwishHttpRequest,
  type SwishHttpResponse,
} from "./swish-commerce";
import { SWISH_CREDENTIAL_REF, orgSettingsSchema } from "../org/settings";

// A throwaway self-signed certificate (EC P-256, CN = a Swish number), only for parsing.
const DUMMY_CERT = `-----BEGIN CERTIFICATE-----
MIIBwjCCAWmgAwIBAgIUdkTcEL91ecrO9gCp662Q4Ou7KYIwCgYIKoZIzj0EAwIw
NzELMAkGA1UEBhMCU0UxEzARBgNVBAoMCjU1NjAwMDAwMDAxEzARBgNVBAMMCjEy
MzExODExODkwHhcNMjYxMDI1MDExNTU4WhcNMzYxMDIyMDExNTU4WjA3MQswCQYD
VQQGEwJTRTETMBEGA1UECgwKNTU2MDAwMDAwMDETMBEGA1UEAwwKMTIzMTE4MTE4
OTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABMTAcz5Ny+zDbm2X4g4pgYJwfeu2
Voel9ocay9SThC4aLV3SgfEWvLnzHluD0d5KzIm84gmF06Bkhh1CxLN/8hKjUzBR
MB0GA1UdDgQWBBS9uM1MaCtZXCKHyNMK7n+9YQgCnDAfBgNVHSMEGDAWgBS9uM1M
aCtZXCKHyNMK7n+9YQgCnDAPBgNVHRMBAf8EBTADAQH/MAoGCCqGSM49BAMCA0cA
MEQCIDNSX6/VlbWWzkjmrXeWIcVROroEBNlkfgLGL/VqDAQdAiAlRF78wXZlHhVK
wF9UG2VSgFkGYCHNfi4XM8lt4fj69Q==
-----END CERTIFICATE-----`;
const DUMMY_KEY = "-----BEGIN PRIVATE KEY-----\nnot-a-real-key\n-----END PRIVATE KEY-----";

const SECRET = "test-secret-that-is-at-least-32-characters-long";
const ID = "50B42C15740F40419B2A496DA2192D56";
const CB_ID = "8F0C2C86A4A44A55B1C3D2E1F0A9B8C7";

/**
 * Responses recorded from the Merchant Swish Simulator on 2026-10-25 with
 * Swish's test certificate (Swish_Merchant_TestCertificate_1234679304),
 * PUT /api/v2/paymentrequests/{id} then GET /api/v1/paymentrequests/{id}.
 * MSS answers CREATED first and PAID about four seconds later, with a new
 * paymentReference at that point; message "RF07" gives ERROR, "BE18" a 422.
 */
const MSS = {
  created201: { status: 201, headers: { location: `https://mss.cpc.getswish.net/swish-cpcapi/api/v1/paymentrequests/${ID}`, paymentrequesttoken: "781856a9b1f14ff2b8efe84edc0e76eb" }, body: "" },
  ecommerce201: { status: 201, headers: { location: `https://mss.cpc.getswish.net/swish-cpcapi/api/v1/paymentrequests/${ID}` }, body: "" },
  getCreated: {
    status: 200,
    headers: { "content-type": "application/json;charset=UTF-8" },
    body: `{"id":"${ID}","payeePaymentReference":"F10022","paymentReference":"5F45DC4679CB459889D5E4CBA6938DC0","callbackUrl":"https://example.com/api/swish/callback","payerAlias":"46464646464","payeeAlias":"1234679304","amount":100.50,"currency":"SEK","message":"OCR 100226","status":"CREATED","dateCreated":"2026-10-25T01:02:51.367Z","datePaid":null,"errorCode":null,"errorMessage":null}`,
  },
  getPaid: {
    status: 200,
    headers: { "content-type": "application/json;charset=UTF-8" },
    body: `{"id":"${ID}","payeePaymentReference":"F10022","paymentReference":"AF8A887568C14DCC9BFA2AB49D71680D","callbackUrl":"https://example.com/api/swish/callback","payerAlias":"46464646464","payeeAlias":"1234679304","amount":100.50,"currency":"SEK","message":"OCR 100226","status":"PAID","dateCreated":"2026-10-25T01:02:51.367Z","datePaid":"2026-10-25T01:02:55.368Z","errorCode":null,"errorMessage":null}`,
  },
  getRf07: {
    status: 200,
    headers: {},
    body: `{"id":"${ID}","payeePaymentReference":"F10022","paymentReference":"507F6DE5B05A412DAC73C375A6EAD84C","callbackUrl":"https://example.com/api/swish/callback","payerAlias":"46701234567","payeeAlias":"1234679304","amount":100.50,"currency":"SEK","message":"RF07","status":"ERROR","dateCreated":"2026-10-25T01:03:09.140Z","datePaid":null,"errorCode":"RF07","errorMessage":"Transaction declined"}`,
  },
  be18: { status: 422, headers: {}, body: `[{"errorCode":"BE18","errorMessage":"Payer alias is invalid","additionalInformation":null}]` },
  notFound: { status: 404, headers: {}, body: `[{"errorCode":"RP04","errorMessage":"No payment request found related to a token","additionalInformation":null}]` },
} satisfies Record<string, SwishHttpResponse>;

/** A transport that answers from a script and records what was sent. */
function recorded(...responses: SwishHttpResponse[]) {
  const sent: SwishHttpRequest[] = [];
  const transport = async (req: SwishHttpRequest) => {
    sent.push(req);
    const next = responses.shift();
    if (!next) throw new Error("No recorded response left.");
    return next;
  };
  return { sent, provider: new SwishProvider({ environment: "test", payeeAlias: "1234679304", transport }) };
}

/* ---------- amounts ---------- */

test("amounts go to Swish as kronor with two decimals and come back as exact öre", () => {
  assert.equal(swishAmount(10050), "100.50");
  assert.equal(swishAmount(1), "0.01");
  assert.equal(swishAmount(100), "1.00");
  assert.equal(swishAmount(1234567), "12345.67");
  assert.equal(swishAmount(99_999_999_999_999), "999999999999.99");
  assert.throws(() => swishAmount(0), RangeError);
  assert.throws(() => swishAmount(-500), RangeError);
  assert.throws(() => swishAmount(10.5), RangeError);
  assert.throws(() => swishAmount(100_000_000_000_000), RangeError);

  // Swish returns a JSON number (100.50 → 100.5) or a string; no float drift.
  assert.equal(oreFromSwishAmount(100.5), 10050);
  assert.equal(oreFromSwishAmount(0.29), 29);
  assert.equal(oreFromSwishAmount(1234.56), 123456);
  assert.equal(oreFromSwishAmount("100"), 10000);
  assert.equal(oreFromSwishAmount("100.5"), 10050);
  assert.equal(oreFromSwishAmount("100.50"), 10050);
  assert.equal(oreFromSwishAmount("100.505"), null);
  assert.equal(oreFromSwishAmount("1e3"), null);
  assert.equal(oreFromSwishAmount(-1), null);
  assert.equal(oreFromSwishAmount(null), null);
  for (const ore of [1, 29, 99, 10050, 333333, 125000]) assert.equal(oreFromSwishAmount(swishAmount(ore)), ore);
});

/* ---------- payer number ---------- */

test("the payer's number is normalised to country code and masked when stored", () => {
  assert.equal(normalizePayerAlias("070-123 45 67"), "46701234567");
  assert.equal(normalizePayerAlias("+46 70 123 45 67"), "46701234567");
  assert.equal(normalizePayerAlias("0046701234567"), "46701234567");
  assert.equal(normalizePayerAlias("46701234567"), "46701234567");
  assert.equal(normalizePayerAlias("08-123 456 78"), null, "a Swedish landline is not a Swish number");
  assert.equal(normalizePayerAlias("0701"), null);
  assert.equal(normalizePayerAlias("abc"), null);
  assert.equal(normalizePayerAlias("4512345678"), "4512345678", "a foreign mobile number passes as given");

  assert.equal(maskPayerAlias("46701234567"), "4670*****67");
  assert.equal(maskPayerAlias("4671234768"), "4671****68");
  assert.equal(maskPayerAlias("123"), "***");
  assert.equal(maskPayerAlias(""), "");
  assert.equal(maskPayerAlias(null), "");
  // Never more than four leading and two trailing digits in the clear.
  for (const n of ["46701234567", "467012345678901", "4512345678"]) {
    const m = maskPayerAlias(n);
    assert.equal(m.length, n.length);
    assert.equal(m.replace(/\*/g, "").length, 6);
    assert.doesNotMatch(m, /\d{7,}/);
  }
});

/* ---------- payload ---------- */

test("the payment request body follows Swish's rules: OCR message, exact remaining amount, https callback", () => {
  const body = buildPaymentRequestBody({
    payeeAlias: "123 467 93 04",
    amountOre: 1234550,
    message: "1002270",
    reference: "F10022",
    callbackUrl: callbackUrl("https://binaafy.se/", ID, SECRET),
    callbackIdentifier: CB_ID,
  });
  assert.deepEqual(Object.keys(body).sort(), ["amount", "callbackIdentifier", "callbackUrl", "currency", "message", "payeeAlias", "payeePaymentReference"]);
  assert.equal(body.payeeAlias, "1234679304");
  assert.equal(body.amount, "12345.50");
  assert.equal(body.currency, "SEK");
  assert.equal(body.message, "1002270");
  assert.equal(body.payeePaymentReference, "F10022");
  assert.equal(body.callbackUrl, `https://binaafy.se/api/swish/callback?id=${ID}&sig=${callbackSignature(ID, SECRET)}`);
  assert.equal("payerAlias" in body, false, "no payer: m-commerce");

  const e = buildPaymentRequestBody({ payeeAlias: "1234679304", amountOre: 100, message: "x", reference: "F1", callbackUrl: "https://a.se/cb", callbackIdentifier: CB_ID, payerAlias: "070-123 45 67" });
  assert.equal(e.payerAlias, "46701234567", "payer: e-commerce");

  assert.throws(() => buildPaymentRequestBody({ payeeAlias: "1234679304", amountOre: 100, message: "", reference: "", callbackUrl: "http://a.se/cb", callbackIdentifier: CB_ID }), SwishInputError);
  assert.throws(() => buildPaymentRequestBody({ payeeAlias: "", amountOre: 100, message: "", reference: "", callbackUrl: "https://a.se/cb", callbackIdentifier: CB_ID }), SwishInputError);
  assert.throws(() => buildPaymentRequestBody({ payeeAlias: "1234679304", amountOre: 100, message: "", reference: "", callbackUrl: "https://a.se/cb", callbackIdentifier: CB_ID, payerAlias: "08-1234567" }), /mobilnummer/);
});

test("message and reference are cut to what Swish accepts", () => {
  assert.equal(swishMessage("Faktura 10022 – Åkesson & Söner <AB>"), "Faktura 10022 Åkesson Söner AB");
  assert.equal(swishMessage("x".repeat(80)).length, 50);
  assert.equal(swishMessage("Betalning: rad 1, (ROT)!?"), "Betalning: rad 1, (ROT)!?");
  const body = buildPaymentRequestBody({ payeeAlias: "1234679304", amountOre: 100, message: "", reference: "F 10/022 ö", callbackUrl: "https://a.se", callbackIdentifier: CB_ID });
  assert.equal(body.payeePaymentReference, "F10022");
});

test("instruction ids are 32 upper-case hex and unique", () => {
  const ids = new Set(Array.from({ length: 200 }, () => newInstructionId()));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.match(id, /^[0-9A-F]{32}$/);
});

/* ---------- the provider against recorded simulator responses ---------- */

test("m-commerce: PUT with our instructionUUID, token from the PaymentRequestToken header", async () => {
  const { sent, provider } = recorded(MSS.created201);
  const created = await provider.createPaymentRequest({ id: "inv-1", number: "10022" }, 10050, "OCR 100226", { callbackUrl: "https://example.com/api/swish/callback", instructionId: ID, callbackIdentifier: CB_ID });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].method, "PUT");
  assert.equal(sent[0].url, `https://mss.cpc.getswish.net/swish-cpcapi/api/v2/paymentrequests/${ID}`);
  assert.equal(sent[0].headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(sent[0].body!), {
    payeePaymentReference: "F10022",
    callbackUrl: "https://example.com/api/swish/callback",
    payeeAlias: "1234679304",
    amount: "100.50",
    currency: "SEK",
    message: "OCR 100226",
    callbackIdentifier: CB_ID,
  });
  assert.equal(created.id, ID);
  assert.equal(created.flow, "mcommerce");
  assert.equal(created.token, "781856a9b1f14ff2b8efe84edc0e76eb");
  assert.match(created.location!, /paymentrequests\/50B42C15/);
  assert.equal(swishAppUrl(created.token!, "https://binaafy.se/faktura/abc?swish=1"), "swish://paymentrequest?token=781856a9b1f14ff2b8efe84edc0e76eb&callbackurl=https%3A%2F%2Fbinaafy.se%2Ffaktura%2Fabc%3Fswish%3D1");
});

test("e-commerce: payer number in the body, no token", async () => {
  const { sent, provider } = recorded(MSS.ecommerce201);
  const created = await provider.createPaymentRequest({ id: "inv-1", number: "10022" }, 10050, "OCR 100226", { callbackUrl: "https://example.com/cb", payerAlias: "0701234567", instructionId: ID, callbackIdentifier: CB_ID });
  assert.equal(JSON.parse(sent[0].body!).payerAlias, "46701234567");
  assert.equal(created.flow, "ecommerce");
  assert.equal(created.token, null);
});

test("status: CREATED, then PAID with amount in öre; ERROR carries the code", async () => {
  const { sent, provider } = recorded(MSS.getCreated, MSS.getPaid, MSS.getRf07);
  const first = await provider.getStatus(ID);
  assert.equal(sent[0].method, "GET");
  assert.equal(sent[0].url, `https://mss.cpc.getswish.net/swish-cpcapi/api/v1/paymentrequests/${ID}`);
  assert.equal(first.status, "CREATED");
  const paid = await provider.getStatus(ID);
  assert.equal(paid.status, "PAID");
  assert.equal(paid.amountOre, 10050);
  assert.equal(paid.paymentReference, "AF8A887568C14DCC9BFA2AB49D71680D");
  assert.equal(paid.datePaid, "2026-10-25T01:02:55.368Z");
  const err = await provider.getStatus(ID);
  assert.equal(err.status, "ERROR");
  assert.equal(err.errorCode, "RF07");
});

test("Swish's 422 becomes a SwishApiError with the code; 401 gets a readable message", async () => {
  const { provider } = recorded(MSS.be18, { status: 401, headers: {}, body: "" }, MSS.notFound);
  await assert.rejects(
    provider.createPaymentRequest({ id: "i", number: "1" }, 100, "x", { callbackUrl: "https://a.se", payerAlias: "0701234567" }),
    (e: unknown) => e instanceof SwishApiError && e.status === 422 && e.code === "BE18"
  );
  await assert.rejects(provider.getStatus(ID), (e: unknown) => e instanceof SwishApiError && /certifikatet/.test(e.message));
  await assert.rejects(provider.getStatus(ID), (e: unknown) => e instanceof SwishApiError && e.code === "RP04");
});

test("cancel sends the JSON patch Swish requires", async () => {
  const { sent, provider } = recorded({ ...MSS.getCreated, body: MSS.getCreated.body.replace('"CREATED"', '"CANCELLED"') });
  const r = await provider.cancel(ID);
  assert.equal(sent[0].method, "PATCH");
  assert.equal(sent[0].headers["Content-Type"], "application/json-patch+json");
  assert.deepEqual(JSON.parse(sent[0].body!), [{ op: "replace", path: "/status", value: "cancelled" }]);
  assert.equal(r.status, "CANCELLED");
});

test("parseSwishResult refuses what is not a payment request object", () => {
  assert.throws(() => parseSwishResult("not json"), SwishInputError);
  assert.throws(() => parseSwishResult([]), SwishInputError);
  assert.throws(() => parseSwishResult({ id: "x", status: "PAID" }), SwishInputError);
  assert.throws(() => parseSwishResult({ id: ID, status: "MAYBE" }), SwishInputError);
  assert.equal(parseSwishResult({ id: ID.toLowerCase(), status: "paid" }).id, ID);
});

/* ---------- callback ---------- */

function callbackInput(overrides: Partial<Parameters<typeof verifySwishCallback>[0]> = {}) {
  return {
    id: ID,
    sig: callbackSignature(ID, SECRET),
    callbackIdentifier: CB_ID,
    body: JSON.parse(MSS.getPaid.body),
    secret: SECRET,
    request: { swishId: ID, callbackIdentifierHash: hashCallbackIdentifier(CB_ID) },
    ...overrides,
  };
}

test("callback URL token: only our HMAC of that id passes", () => {
  const sig = callbackSignature(ID, SECRET);
  assert.match(sig, /^[0-9a-f]{64}$/);
  assert.equal(verifyCallbackSignature(ID, sig, SECRET), true);
  assert.equal(verifyCallbackSignature(ID, sig, "another-secret-another-secret-xx"), false);
  assert.equal(verifyCallbackSignature("60B42C15740F40419B2A496DA2192D56", sig, SECRET), false);
  assert.equal(verifyCallbackSignature(ID, "", SECRET), false);
  assert.equal(verifyCallbackSignature(ID, sig, ""), false);
});

test("callback PAID: verified and turned into a settlement with the Swedish payment date", () => {
  const result = verifySwishCallback(callbackInput());
  const s = settlementFor(result, 10050)!;
  assert.equal(s.status, "PAID");
  assert.equal(s.amountOre, 10050);
  assert.equal(s.paymentReference, "AF8A887568C14DCC9BFA2AB49D71680D");
  assert.equal(s.payerMasked, "4646*****64");
  assert.equal(s.error, null);
  assert.equal(s.paidOn, "2026-10-25");
  // 23:30 UTC on 31 Dec is already 1 Jan in Stockholm.
  assert.equal(settlementFor({ ...result, datePaid: "2026-12-31T23:30:00Z" }, 10050)!.paidOn, "2027-01-01");
  assert.deepEqual(nextSettlementStep({ status: "CREATED", amountOre: 10050, paymentId: null }, s, new Set()), { action: "book", reference: "AF8A887568C14DCC9BFA2AB49D71680D", amountOre: 10050, note: null });
});

test("callback DECLINED and ERROR: the request is closed with a reason, nothing is booked", () => {
  const declined = settlementFor(verifySwishCallback(callbackInput({ body: { ...JSON.parse(MSS.getPaid.body), status: "DECLINED", paymentReference: null, datePaid: null } })), 10050)!;
  assert.equal(declined.status, "DECLINED");
  assert.equal(declined.error, "Betalaren avböjde.");
  assert.deepEqual(nextSettlementStep({ status: "CREATED", amountOre: 10050, paymentId: null }, declined, new Set()), { action: "update", status: "DECLINED", error: "Betalaren avböjde." });

  const error = settlementFor(verifySwishCallback(callbackInput({ body: JSON.parse(MSS.getRf07.body) })), 10050)!;
  assert.equal(error.status, "ERROR");
  assert.match(error.error!, /^RF07: Betalningen nekades/);
  assert.equal(nextSettlementStep({ status: "CREATED", amountOre: 10050, paymentId: null }, error, new Set()).action, "update");

  const cancelled = settlementFor({ ...parseSwishResult(MSS.getPaid.body), status: "CANCELLED" }, 10050)!;
  assert.equal(cancelled.error, "Avbruten.");
  assert.equal(settlementFor(parseSwishResult(MSS.getCreated.body), 10050), null, "CREATED is not final");
});

test("duplicates are harmless: a settled request or a booked reference books nothing more", () => {
  const s = settlementFor(parseSwishResult(MSS.getPaid.body), 10050)!;
  // The same callback again after the first was applied.
  assert.deepEqual(nextSettlementStep({ status: "PAID", amountOre: 10050, paymentId: "p1" }, s, new Set(["AF8A887568C14DCC9BFA2AB49D71680D"])), { action: "duplicate" });
  // A late DECLINED after PAID changes nothing either.
  assert.deepEqual(nextSettlementStep({ status: "PAID", amountOre: 10050, paymentId: "p1" }, { ...s, status: "DECLINED" }, new Set()), { action: "duplicate" });
  // Another request reporting a reference that is already booked.
  assert.equal(nextSettlementStep({ status: "CREATED", amountOre: 10050, paymentId: null }, s, new Set(["AF8A887568C14DCC9BFA2AB49D71680D"])).action, "already-booked");
  // Paid, but a different amount than asked: booked as paid, with a note.
  const step = nextSettlementStep({ status: "CREATED", amountOre: 20000, paymentId: null }, s, new Set());
  assert.equal(step.action, "book");
  assert.match((step as { note: string }).note, /10050 öre, begäran gällde 20000/);
  assert.throws(() => nextSettlementStep({ status: "CREATED", amountOre: 10050, paymentId: null }, { ...s, paymentReference: null }, new Set()), /betalningsreferens/);
});

test("callback refused: wrong token, unknown request, wrong callbackIdentifier, other request in the body, bad body", () => {
  const status = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      assert.ok(e instanceof SwishCallbackError);
      return e.httpStatus;
    }
    return 200;
  };
  assert.equal(status(() => verifySwishCallback(callbackInput({ sig: callbackSignature(ID, "wrong-secret-wrong-secret-wrong-sec") }))), 403);
  assert.equal(status(() => verifySwishCallback(callbackInput({ sig: null }))), 403);
  assert.equal(status(() => verifySwishCallback(callbackInput({ secret: "" }))), 403);
  assert.equal(status(() => verifySwishCallback(callbackInput({ request: null }))), 404);
  assert.equal(status(() => verifySwishCallback(callbackInput({ callbackIdentifier: "11111111111111111111111111111111" }))), 403);
  assert.equal(status(() => verifySwishCallback(callbackInput({ callbackIdentifier: null }))), 403);
  assert.equal(status(() => verifySwishCallback(callbackInput({ body: { ...JSON.parse(MSS.getPaid.body), id: "60B42C15740F40419B2A496DA2192D56" } }))), 400);
  assert.equal(status(() => verifySwishCallback(callbackInput({ body: { status: "PAID" } }))), 400);
  assert.equal(status(() => verifySwishCallback(callbackInput())), 200);
});

/* ---------- credentials ---------- */

test("certificates from the environment: PEM, PEM with escaped newlines, or base64", () => {
  assert.equal(decodePem(DUMMY_CERT), DUMMY_CERT);
  assert.equal(decodePem(DUMMY_CERT.replace(/\n/g, "\\n")), DUMMY_CERT);
  assert.equal(decodePem(Buffer.from(DUMMY_CERT).toString("base64")), DUMMY_CERT);
  assert.equal(decodePem("bm90IGEgcGVt"), null);
  assert.equal(decodePem(""), null);
  assert.equal(decodePem(undefined), null);

  const env = { SWISH_CERT_PEM: Buffer.from(DUMMY_CERT).toString("base64"), SWISH_KEY_PEM: DUMMY_KEY, SWISH_ENV: "prod" };
  const c = credentialsFromEnv(env)!;
  assert.equal(c.environment, "prod");
  assert.equal(c.source, "env:SWISH");
  assert.equal(c.ca, undefined);
  assert.equal(credentialsFromEnv({ ...env, SWISH_ENV: "" })!.environment, "test", "test unless prod is said");
  assert.equal(credentialsFromEnv({ SWISH_CERT_PEM: DUMMY_CERT }), null, "no key, no credentials");
  assert.equal(credentialsFromEnv({ ACME_CERT_PEM: DUMMY_CERT, ACME_KEY_PEM: DUMMY_KEY }, "ACME")!.source, "env:ACME");

  const v = credentialsFromSecret(JSON.stringify({ cert: DUMMY_CERT, key: DUMMY_KEY, environment: "prod" }), "vault:swish_acme")!;
  assert.equal(v.environment, "prod");
  assert.equal(credentialsFromSecret("{", "vault:x"), null);
  assert.equal(credentialsFromSecret(null, "vault:x"), null);
});

test("credential references name a source, never contain one", () => {
  assert.deepEqual(parseCredentialRef("env:SWISH"), { kind: "env", prefix: "SWISH" });
  assert.deepEqual(parseCredentialRef("env:SWISH_ACME"), { kind: "env", prefix: "SWISH_ACME" });
  assert.deepEqual(parseCredentialRef("vault:swish_acme"), { kind: "vault", name: "swish_acme" });
  assert.equal(parseCredentialRef("vault:rot_pnr_key"), null, "only swish_ secrets");
  assert.equal(parseCredentialRef("env:swish"), null);
  assert.equal(parseCredentialRef(DUMMY_CERT), null);
  assert.equal(parseCredentialRef(""), null);
});

test("admin sees the certificate's Swish number and expiry, nothing secret", () => {
  const d = describeCertificate(DUMMY_CERT)!;
  assert.equal(d.subject, "1231181189");
  assert.equal(d.swishNumber, "1231181189");
  assert.equal(d.validTo, "2036-10-22");
  assert.equal(d.expired, false);
  assert.equal(describeCertificate("garbage"), null);
});

test("the settings field takes a reference, the same rule as the provider", () => {
  for (const ref of ["env:SWISH", "env:SWISH_ACME", "vault:swish_acme", "vault:rot_pnr_key", "env:swish", DUMMY_CERT, "x"]) {
    assert.equal(SWISH_CREDENTIAL_REF.test(ref), parseCredentialRef(ref) !== null, ref);
  }
  assert.equal(orgSettingsSchema.parse({}).payment.swishCommerce.credentials, "");
  assert.equal(orgSettingsSchema.safeParse({ payment: { swishCommerce: { credentials: "vault:swish_acme" } } }).success, true);
  assert.equal(orgSettingsSchema.safeParse({ payment: { swishCommerce: { credentials: DUMMY_CERT } } }).success, false, "a certificate is never stored in the settings");
});
