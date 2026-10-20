import { API_VERSION } from "./respond";
import { WEBHOOK_EVENT_TYPES } from "../core/events";
import { zodToJsonSchema } from "./zod-json-schema";
import {
  customerCreateSchema,
  customerListQuerySchema,
  customerResourceSchema,
  invoiceCreateSchema,
  invoiceListQuerySchema,
  invoiceResourceSchema,
  issueResultSchema,
  paymentCreateSchema,
  paymentResultSchema,
} from "./schemas";

/**
 * The OpenAPI document served at /api/v1/openapi.json. Request and response
 * schemas are generated from the same zod schemas the routes validate with
 * (lib/api/schemas.ts), so the contract cannot say something the API does
 * not do.
 */

const json = (ref: string) => ({ "application/json": { schema: { $ref: `#/components/schemas/${ref}` } } });
const ok = (description: string, ref: string) => ({ description, content: json(ref) });
const errors = {
  "401": { $ref: "#/components/responses/Unauthorized" },
  "403": { $ref: "#/components/responses/Forbidden" },
};
const writeErrors = {
  ...errors,
  "409": { $ref: "#/components/responses/Conflict" },
  "422": { $ref: "#/components/responses/ValidationError" },
};
const idParam = (what: string) => ({ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" }, description: `${what}s id.` });
const idempotency = { $ref: "#/components/parameters/IdempotencyKey" };

/** Query parameters from a zod object (all optional on the wire). */
function queryParams(schema: { shape: Record<string, import("zod").ZodTypeAny> }) {
  return Object.entries(schema.shape).map(([name, s]) => ({ name, in: "query", required: false, schema: zodToJsonSchema(s, "input") }));
}

export function openApiDocument(baseUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Binaafy Faktura API",
      version: API_VERSION,
      description: [
        "Fakturering och projektekonomi. Autentisering med API-nyckel per organisation (Bearer); nyckeln skapas under Admin → API och visas en gång.",
        "Allt en nyckel ser och skapar hör till dess organisation. Belopp är heltal i öre. Datum ÅÅÅÅ-MM-DD.",
        "Skrivande anrop kräver Idempotency-Key: samma nyckel och kropp ger samma svar (headern Idempotent-Replayed: true), samma nyckel med annan kropp ger 422.",
        `Webhooks: POST med JSON till registrerade adresser för ${WEBHOOK_EVENT_TYPES.join(", ")}. Headern X-Signature är "t=<unix>,v1=<hex HMAC-SHA256 av "<t>.<kropp>" med endpointens hemlighet>". Upp till 8 försök med exponentiell väntan.`,
      ].join("\n\n"),
    },
    servers: [{ url: `${baseUrl}/api/${API_VERSION}` }],
    security: [{ apiKey: [] }],
    tags: [{ name: "Kunder" }, { name: "Fakturor" }, { name: "Övrigt" }],
    paths: {
      "/health": {
        get: { tags: ["Övrigt"], summary: "Är API:et uppe?", security: [], responses: { "200": ok("OK", "Health") } },
      },
      "/customers": {
        get: {
          tags: ["Kunder"],
          summary: "Lista kunder",
          description: "Kräver scope read.",
          parameters: queryParams(customerListQuerySchema),
          responses: { "200": ok("Kunderna, sorterade på namn", "CustomerList"), ...errors },
        },
        post: {
          tags: ["Kunder"],
          summary: "Skapa en kund",
          description: "Kräver scope write.",
          parameters: [idempotency],
          requestBody: { required: true, content: json("CustomerCreate") },
          responses: { "201": ok("Kunden", "Customer"), ...writeErrors },
        },
      },
      "/customers/{id}": {
        get: { tags: ["Kunder"], summary: "Hämta en kund", parameters: [idParam("Kunden")], responses: { "200": ok("Kunden", "Customer"), "404": { $ref: "#/components/responses/NotFound" }, ...errors } },
      },
      "/invoices": {
        get: {
          tags: ["Fakturor"],
          summary: "Lista fakturor",
          description: "Senast ändrade först. Kräver scope read.",
          parameters: queryParams(invoiceListQuerySchema),
          responses: { "200": ok("Fakturorna", "InvoiceList"), ...errors },
        },
        post: {
          tags: ["Fakturor"],
          summary: "Skapa ett utkast",
          description: "Säljare, betalningsuppgifter och villkor hämtas från organisationens inställningar; köparen från kundregistret (customerId) eller buyer. Raderna anpassas till kundtypen (omvänd betalningsskyldighet för byggföretag). Utfärda med POST /invoices/{id}/issue.",
          parameters: [idempotency],
          requestBody: { required: true, content: json("InvoiceCreate") },
          responses: { "201": ok("Utkastet", "Invoice"), ...writeErrors },
        },
      },
      "/invoices/{id}": {
        get: { tags: ["Fakturor"], summary: "Hämta en faktura med dokumentet", parameters: [idParam("Fakturan")], responses: { "200": ok("Fakturan", "Invoice"), "404": { $ref: "#/components/responses/NotFound" }, ...errors } },
      },
      "/invoices/{id}/issue": {
        post: {
          tags: ["Fakturor"],
          summary: "Utfärda",
          description: "Nummer ur serien, fryst dokument, OCR, verifikation och händelsen invoice.issued i en transaktion. 422 med details.problems när utkastet inte är komplett.",
          parameters: [idParam("Fakturan"), idempotency],
          responses: { "200": ok("Utfärdad", "IssueResult"), "404": { $ref: "#/components/responses/NotFound" }, ...writeErrors },
        },
      },
      "/invoices/{id}/payments": {
        post: {
          tags: ["Fakturor"],
          summary: "Registrera en betalning",
          description: "Bokförs 1930/1510. Negativt belopp är en återbetalning.",
          parameters: [idParam("Fakturan"), idempotency],
          requestBody: { required: true, content: json("PaymentCreate") },
          responses: { "201": ok("Betalningen är registrerad", "PaymentResult"), "404": { $ref: "#/components/responses/NotFound" }, ...writeErrors },
        },
      },
      "/invoices/{id}/pdf": {
        get: {
          tags: ["Fakturor"],
          summary: "Fakturan som PDF",
          parameters: [idParam("Fakturan")],
          responses: { "200": { description: "PDF", content: { "application/pdf": { schema: { type: "string", format: "binary" } } } }, "404": { $ref: "#/components/responses/NotFound" }, ...errors },
        },
      },
    },
    components: {
      securitySchemes: {
        apiKey: { type: "http", scheme: "bearer", description: "API-nyckel, bf_live_… eller bf_test_…" },
      },
      parameters: {
        IdempotencyKey: {
          name: "Idempotency-Key",
          in: "header",
          required: true,
          schema: { type: "string", minLength: 8, maxLength: 128, pattern: "^[A-Za-z0-9_\\-:.]+$" },
          description: "Klientens eget id för anropet. Samma nyckel ger samma svar.",
        },
      },
      responses: {
        Unauthorized: { description: "Nyckeln saknas, är fel eller återkallad", content: json("Error") },
        Forbidden: { description: "Nyckeln saknar scope", content: json("Error") },
        NotFound: { description: "Finns inte i nyckelns organisation", content: json("Error") },
        Conflict: { description: "Går inte i resursens nuvarande status, eller ett anrop med samma Idempotency-Key pågår", content: json("Error") },
        ValidationError: { description: "Fel i anropet; details har fält → meddelande", content: json("Error") },
      },
      schemas: {
        Health: {
          type: "object",
          properties: { ok: { type: "boolean" }, api: { type: "string" }, time: { type: "string", format: "date-time" } },
          required: ["ok", "api", "time"],
        },
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: {
                  type: "string",
                  enum: ["unauthorized", "forbidden", "not_found", "validation_error", "idempotency_conflict", "rate_limited", "conflict", "internal"],
                },
                message: { type: "string" },
                details: {},
              },
              required: ["code", "message"],
            },
          },
          required: ["error"],
        },
        Money: { type: "integer", format: "int64", description: "Belopp i öre. 68 000 kr = 6800000." },
        Customer: zodToJsonSchema(customerResourceSchema, "output"),
        CustomerList: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Customer" } } }, required: ["data"] },
        CustomerCreate: zodToJsonSchema(customerCreateSchema, "input"),
        Invoice: zodToJsonSchema(invoiceResourceSchema, "output"),
        InvoiceList: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Invoice" } } }, required: ["data"] },
        InvoiceCreate: zodToJsonSchema(invoiceCreateSchema, "input"),
        IssueResult: zodToJsonSchema(issueResultSchema, "output"),
        PaymentCreate: zodToJsonSchema(paymentCreateSchema, "input"),
        PaymentResult: zodToJsonSchema(paymentResultSchema, "output"),
        WebhookEvent: {
          type: "object",
          description: "Kroppen i en webhook-leverans.",
          properties: {
            id: { type: "string", format: "uuid" },
            type: { type: "string", enum: [...WEBHOOK_EVENT_TYPES] },
            created_at: { type: "string", format: "date-time" },
            data: { type: "object" },
            aggregate: { type: "object", properties: { type: { type: "string" }, id: { type: "string", format: "uuid" } }, required: ["type", "id"] },
          },
          required: ["id", "type", "created_at", "data", "aggregate"],
        },
      },
    },
  };
}
