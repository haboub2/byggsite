import { API_VERSION } from "./respond";

/**
 * The OpenAPI document served at /api/v1/openapi.json. Grows with every
 * route; the resource schemas are generated from the zod schemas in
 * lib/core when those routes land (fas 1). Fas 0 publishes the contract:
 * authentication, errors, idempotency and the health check.
 */
export function openApiDocument(baseUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Binaafy Faktura API",
      version: API_VERSION,
      description:
        "Fakturering och projektekonomi. Autentisering med API-nyckel per organisation (Bearer). Skrivande anrop tar Idempotency-Key. Belopp är heltal i öre.",
    },
    servers: [{ url: `${baseUrl}/api/${API_VERSION}` }],
    security: [{ apiKey: [] }],
    paths: {
      "/health": {
        get: {
          summary: "Är API:et uppe?",
          security: [],
          responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Health" } } } } },
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
          schema: { type: "string", minLength: 8, maxLength: 128 },
          description: "Klientens eget id för anropet. Samma nyckel ger samma svar.",
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
      },
    },
  };
}
