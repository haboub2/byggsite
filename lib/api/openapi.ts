import { API_VERSION } from "./respond";
import { WEBHOOK_EVENT_TYPES } from "../core/events";
import { zodToJsonSchema } from "./zod-json-schema";
import {
  absenceListQuerySchema,
  absenceResourceSchema,
  employeeListQuerySchema,
  employeeResourceSchema,
  payRunListQuerySchema,
  payRunResourceSchema,
  payslipListQuerySchema,
  payslipResourceSchema,
  timeEntryCreateSchema,
  timeEntryListQuerySchema,
  timeEntryResourceSchema,
  customerCreateSchema,
  customerListQuerySchema,
  customerResourceSchema,
  eventListQuerySchema,
  eventPageSchema,
  eventResourceSchema,
  invoiceCreateSchema,
  invoiceListQuerySchema,
  invoiceResourceSchema,
  issueResultSchema,
  paymentCreateSchema,
  paymentListQuerySchema,
  paymentPlanListQuerySchema,
  paymentPlanResourceSchema,
  paymentResourceSchema,
  paymentResultSchema,
  rotClaimListQuerySchema,
  rotClaimResourceSchema,
} from "./schemas";
import { DEFAULT_RATE_LIMITS } from "./rate-limit";

/**
 * The OpenAPI document served at /api/v1/openapi.json. Request and response
 * schemas are generated from the same zod schemas the routes validate with
 * (lib/api/schemas.ts), so the contract cannot say something the API does
 * not do.
 */

const json = (ref: string) => ({ "application/json": { schema: { $ref: `#/components/schemas/${ref}` } } });
const header = (name: string) => ({ $ref: `#/components/headers/${name}` });
/** Every response has X-Request-Id; once the key is known, also the rate limit headers. */
const requestIdHeader = { "X-Request-Id": header("RequestId") };
const rateHeaders = { ...requestIdHeader, "X-RateLimit-Limit": header("RateLimitLimit"), "X-RateLimit-Remaining": header("RateLimitRemaining"), "X-RateLimit-Reset": header("RateLimitReset") };
const ok = (description: string, ref: string) => ({ description, headers: rateHeaders, content: json(ref) });
const errors = {
  "401": { $ref: "#/components/responses/Unauthorized" },
  "403": { $ref: "#/components/responses/Forbidden" },
  "429": { $ref: "#/components/responses/TooManyRequests" },
};
const notFound = { "404": { $ref: "#/components/responses/NotFound" } };
const readErrors = { ...errors, "422": { $ref: "#/components/responses/ValidationError" } };
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
        `Anropsgränser per nyckel: ${DEFAULT_RATE_LIMITS.perMinute} anrop per minut och ${DEFAULT_RATE_LIMITS.perDay.toLocaleString("sv-SE")} per dygn (UTC) om inget annat är avtalat. Varje svar har X-RateLimit-Limit, X-RateLimit-Remaining och X-RateLimit-Reset (sekunder) för det fönster som ligger närmast sin gräns. Över gränsen: 429 med Retry-After (sekunder). Ett nekat anrop räknas inte.`,
        "Varje svar har X-Request-Id. Ange det när du kontaktar oss om ett anrop; organisationens admin ser samma id under Admin → API → Anrop.",
        "Personnummer (ROT och personal) är alltid maskerade i API:t, ÅÅÅÅMMDD-XXXX, också i fakturans dokument. Personalens bankkonton, adresser och anteckningar lämnar aldrig API:t.",
        "Personal och lön kräver scope payroll, som ingen fakturanyckel har (read och write ger det inte; admin ger allt): /employees, /time-entries (också POST med payroll och write: ett utkast som godkänns i Tid), /absences, /payslips (med PDF för godkända), /pay-runs. Lönekörningen körs i admin, inte via API:t. Webhooks för payslip.approved, payroll.run_approved, payroll.run_closed, time.approved och expense.approved bär id och summor, aldrig dokument.",
        "invoice.corrected kommer två gånger: på originalet (data.correction, data.correctionNumber) och på ändringsfakturan (data.original, data.corrects).",
        `invoice.sent och invoice.reminded har data.to (mottagarna som text) och, när fakturan mejlades, data.recipients med listorna to och cc. Kundens listor sätts med invoiceEmails och ccEmails och fryses in i fakturan (document.se.recipients) när den utfärdas.`,
      ].join("\n\n"),
    },
    servers: [{ url: `${baseUrl}/api/${API_VERSION}` }],
    security: [{ apiKey: [] }],
    tags: [{ name: "Kunder" }, { name: "Fakturor" }, { name: "Betalningar" }, { name: "Betalplaner" }, { name: "ROT" }, { name: "Personal" }, { name: "Tid" }, { name: "Lön" }, { name: "Händelser" }, { name: "Övrigt" }],
    paths: {
      "/health": {
        get: { tags: ["Övrigt"], summary: "Är API:et uppe?", security: [], responses: { "200": { description: "OK", headers: requestIdHeader, content: json("Health") } } },
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
          description: "Bokförs 1930/1510. Negativt belopp är en återbetalning. Idempotent: skicka om med samma Idempotency-Key och kropp så registreras betalningen bara en gång.",
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
          responses: { "200": { description: "PDF", headers: rateHeaders, content: { "application/pdf": { schema: { type: "string", format: "binary" } } } }, "404": { $ref: "#/components/responses/NotFound" }, ...errors },
        },
      },
      "/payments": {
        get: {
          tags: ["Betalningar"],
          summary: "Lista betalningar",
          description: "Senaste betalningsdag först, med vilka fakturor varje betalning gäller. Registrera en betalning med POST /invoices/{id}/payments. Kräver scope read.",
          parameters: queryParams(paymentListQuerySchema),
          responses: { "200": ok("Betalningarna", "PaymentList"), ...readErrors },
        },
      },
      "/payment-plans": {
        get: {
          tags: ["Betalplaner"],
          summary: "Lista betalplaner",
          description: "Hur projektens offerter delas upp i fakturor, nyast först. Kräver scope read.",
          parameters: queryParams(paymentPlanListQuerySchema),
          responses: { "200": ok("Betalplanerna med sina steg", "PaymentPlanList"), ...readErrors },
        },
      },
      "/payment-plans/{id}": {
        get: { tags: ["Betalplaner"], summary: "Hämta en betalplan", parameters: [idParam("Betalplanen")], responses: { "200": ok("Betalplanen", "PaymentPlan"), ...notFound, ...errors } },
      },
      "/rot-claims": {
        get: {
          tags: ["ROT"],
          summary: "Lista ROT-begäranden",
          description: "Begäranden om utbetalning hos Skatteverket, nyast först. Personnummer är alltid maskerade. Kräver scope read.",
          parameters: queryParams(rotClaimListQuerySchema),
          responses: { "200": ok("Begärandena", "RotClaimList"), ...readErrors },
        },
      },
      "/rot-claims/{id}": {
        get: { tags: ["ROT"], summary: "Hämta en ROT-begäran", parameters: [idParam("Begäran")], responses: { "200": ok("Begäran", "RotClaim"), ...notFound, ...errors } },
      },
      "/employees": {
        get: {
          tags: ["Personal"],
          summary: "Lista personal",
          description: "Personerna med anställningsversionen som gäller i dag. Personnummer maskerade; inga bankkonton, adresser eller anteckningar. Kräver scope payroll.",
          parameters: queryParams(employeeListQuerySchema),
          responses: { "200": ok("Personalen, sorterad på namn", "EmployeeList"), ...readErrors },
        },
      },
      "/employees/{id}": {
        get: { tags: ["Personal"], summary: "Hämta en person", parameters: [idParam("Personen")], responses: { "200": ok("Personen", "Employee"), ...notFound, ...errors } },
      },
      "/time-entries": {
        get: {
          tags: ["Tid"],
          summary: "Lista tidsrader",
          description: "Tidsrader per arbetsdatum (from och to krävs), för en person eller ett projekt. Kräver scope payroll.",
          parameters: queryParams(timeEntryListQuerySchema),
          responses: { "200": ok("Tidsraderna, äldst först", "TimeEntryList"), ...readErrors },
        },
        post: {
          tags: ["Tid"],
          summary: "Skapa ett tidsutkast",
          description: "En tidsrad för en person som utkast (källa imported): den skickas in och godkänns i Tid innan en lönekörning kan läsa den. Start och slut med rast, eller bara timmar. Kräver scope payroll och write.",
          parameters: [idempotency],
          requestBody: { required: true, content: json("TimeEntryCreate") },
          responses: { "201": ok("Utkastet", "TimeEntry"), ...notFound, ...writeErrors },
        },
      },
      "/absences": {
        get: {
          tags: ["Tid"],
          summary: "Lista frånvaro",
          description: "Sjuk, VAB, semester, föräldraledighet, tjänstledighet, permission och kompledighet som överlappar perioden. Kräver scope payroll.",
          parameters: queryParams(absenceListQuerySchema),
          responses: { "200": ok("Frånvaron, äldst först", "AbsenceList"), ...readErrors },
        },
      },
      "/payslips": {
        get: {
          tags: ["Lön"],
          summary: "Lista lönebesked",
          description: "Lönebesked per körning, person eller lönemånad: raderna med löneart, belopp, skatteflagga, AGI-ruta och konto, summorna, pension och semesterlöneskuld. status approved är fryst och har PDF. Utan runId eller period: de tolv senaste körningarna. Kräver scope payroll.",
          parameters: queryParams(payslipListQuerySchema),
          responses: { "200": ok("Lönebeskeden, senaste lönedag först", "PayslipList"), ...readErrors },
        },
      },
      "/payslips/{id}": {
        get: { tags: ["Lön"], summary: "Hämta ett lönebesked", parameters: [idParam("Lönebeskedet")], responses: { "200": ok("Lönebeskedet", "Payslip"), ...notFound, ...errors } },
      },
      "/payslips/{id}/pdf": {
        get: {
          tags: ["Lön"],
          summary: "Lönebeskedet som PDF",
          description: "Den frysta PDF:en för ett godkänt lönebesked, kontrollerad mot sin hash. 409 för ett lönebesked som inte är godkänt.",
          parameters: [idParam("Lönebeskedet")],
          responses: { "200": { description: "PDF", headers: rateHeaders, content: { "application/pdf": { schema: { type: "string", format: "binary" } } } }, ...notFound, "409": { $ref: "#/components/responses/Conflict" }, ...errors },
        },
      },
      "/pay-runs": {
        get: {
          tags: ["Lön"],
          summary: "Lista lönekörningar",
          description: "Körningarna med period, lönedag, status och summor, senaste månad först. Bara läsning: körningen skapas, räknas, godkänns och stängs i admin. Kräver scope payroll.",
          parameters: queryParams(payRunListQuerySchema),
          responses: { "200": ok("Körningarna", "PayRunList"), ...readErrors },
        },
      },
      "/pay-runs/{id}": {
        get: { tags: ["Lön"], summary: "Hämta en lönekörning", parameters: [idParam("Körningen")], responses: { "200": ok("Körningen", "PayRun"), ...notFound, ...errors } },
      },
      "/events": {
        get: {
          tags: ["Händelser"],
          summary: "Händelseloggen",
          description:
            "Allt som hänt i organisationen, en sida i taget (cursor-paginering på tid och id). Följ nextCursor tills den är null. Med order=asc kan en integration spara sista cursor och hämta det nya. Samma händelser som webhooks skickar, plus de interna. Kräver scope read.",
          parameters: queryParams(eventListQuerySchema),
          responses: { "200": ok("En sida händelser", "EventPage"), ...readErrors },
        },
      },
    },
    components: {
      securitySchemes: {
        apiKey: { type: "http", scheme: "bearer", description: "API-nyckel, bf_live_… eller bf_test_…, med scope read, write, payroll och/eller admin (Admin → API)." },
      },
      headers: {
        RequestId: { description: "Anropets id, req_ + 24 hex. Finns i organisationens anropslogg.", schema: { type: "string" } },
        RateLimitLimit: { description: "Gränsen för fönstret (minut eller dygn) som ligger närmast sin gräns.", schema: { type: "integer" } },
        RateLimitRemaining: { description: "Anrop kvar i det fönstret.", schema: { type: "integer" } },
        RateLimitReset: { description: "Sekunder tills fönstret börjar om.", schema: { type: "integer" } },
        RetryAfter: { description: "Sekunder att vänta innan nästa anrop.", schema: { type: "integer" } },
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
        Forbidden: { description: "Nyckeln saknar scope (payroll för personal och lön)", content: json("Error") },
        NotFound: { description: "Finns inte i nyckelns organisation", content: json("Error") },
        Conflict: { description: "Går inte i resursens nuvarande status, eller ett anrop med samma Idempotency-Key pågår", content: json("Error") },
        ValidationError: { description: "Fel i anropet; details har fält → meddelande", content: json("Error") },
        TooManyRequests: {
          description: "Över nyckelns anropsgräns. Vänta Retry-After sekunder.",
          headers: { ...rateHeaders, "Retry-After": header("RetryAfter") },
          content: json("Error"),
        },
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
        Payment: zodToJsonSchema(paymentResourceSchema, "output"),
        PaymentList: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Payment" } } }, required: ["data"] },
        PaymentPlan: zodToJsonSchema(paymentPlanResourceSchema, "output"),
        PaymentPlanList: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/PaymentPlan" } } }, required: ["data"] },
        RotClaim: zodToJsonSchema(rotClaimResourceSchema, "output"),
        RotClaimList: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/RotClaim" } } }, required: ["data"] },
        Employee: zodToJsonSchema(employeeResourceSchema, "output"),
        EmployeeList: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Employee" } } }, required: ["data"] },
        TimeEntry: zodToJsonSchema(timeEntryResourceSchema, "output"),
        TimeEntryList: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/TimeEntry" } } }, required: ["data"] },
        TimeEntryCreate: zodToJsonSchema(timeEntryCreateSchema, "input"),
        Absence: zodToJsonSchema(absenceResourceSchema, "output"),
        AbsenceList: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Absence" } } }, required: ["data"] },
        Payslip: zodToJsonSchema(payslipResourceSchema, "output"),
        PayslipList: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Payslip" } } }, required: ["data"] },
        PayRun: zodToJsonSchema(payRunResourceSchema, "output"),
        PayRunList: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/PayRun" } } }, required: ["data"] },
        Event: zodToJsonSchema(eventResourceSchema, "output"),
        EventPage: {
          type: "object",
          properties: { data: { type: "array", items: { $ref: "#/components/schemas/Event" } }, nextCursor: (zodToJsonSchema(eventPageSchema, "output") as { properties: Record<string, unknown> }).properties.nextCursor },
          required: ["data", "nextCursor"],
        },
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
