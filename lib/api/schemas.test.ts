import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { customerCreateSchema, invoiceCreateSchema, paymentCreateSchema, invoiceListQuerySchema } from "./schemas";
import { zodToJsonSchema } from "./zod-json-schema";
import { openApiDocument } from "./openapi";
import { issuesToDetailsPure } from "./validation";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { WEBHOOK_EVENT_TYPES } from "../core/events";

const line = { id: "1", description: "Rivning", quantity: 8, unit: "tim", unitPriceOre: 52000, vatRate: 25, kind: "labor" };

test("invoice create: a customer id and one line is enough", () => {
  const r = invoiceCreateSchema.safeParse({ customerId: "7c9e6679-7425-40de-944b-e07fc1f90ae7", lines: [line] });
  assert.equal(r.success, true);
});

test("invoice create: needs a customer or a buyer, and lines", () => {
  const r = invoiceCreateSchema.safeParse({ lines: [] });
  assert.equal(r.success, false);
  const details = issuesToDetailsPure((r as { error: z.ZodError }).error);
  assert.ok(details.lines, JSON.stringify(details));
  const r2 = invoiceCreateSchema.safeParse({ lines: [line] });
  assert.equal(r2.success, false);
  assert.equal(issuesToDetailsPure((r2 as { error: z.ZodError }).error).customerId, "Ange customerId eller buyer.");
});

test("invoice create: line errors carry their path and Swedish message", () => {
  const r = invoiceCreateSchema.safeParse({ customerId: "7c9e6679-7425-40de-944b-e07fc1f90ae7", lines: [{ ...line, unitPriceOre: 12.5, vatRate: 20 }] });
  assert.equal(r.success, false);
  const d = issuesToDetailsPure((r as { error: z.ZodError }).error);
  assert.equal(d["lines.0.unitPriceOre"], "Belopp anges i hela öre.");
  assert.equal(d["lines.0.vatRate"], "Moms: 25, 12, 6 eller 0 %.");
});

test("payment: amount in whole öre, never zero, known method", () => {
  assert.equal(paymentCreateSchema.safeParse({ amountOre: 100, method: "bankgiro", paidOn: "2026-10-20" }).success, true);
  assert.equal(paymentCreateSchema.safeParse({ amountOre: 0, method: "bankgiro", paidOn: "2026-10-20" }).success, false);
  assert.equal(paymentCreateSchema.safeParse({ amountOre: 100, method: "rot", paidOn: "2026-10-20" }).success, false);
  assert.equal(paymentCreateSchema.safeParse({ amountOre: 100, method: "swish", paidOn: "20 okt" }).success, false);
});

test("customer create: type and name are required, the rest defaults", () => {
  const r = customerCreateSchema.safeParse({ type: "foretag", name: "Bergs Bygg AB" });
  assert.equal(r.success, true);
  assert.equal(customerCreateSchema.safeParse({ type: "foretag" }).success, false);
  assert.equal(customerCreateSchema.safeParse({ type: "foretag", name: "X", orgNr: "12345" }).success, false);
});

test("customer create: invoice and copy recipients, validated and deduplicated", () => {
  const r = customerCreateSchema.parse({ type: "foretag", name: "Bergs Bygg AB", invoiceEmails: ["ekonomi@bergs.se", " Ekonomi@bergs.se ", "inkop@bergs.se"], ccEmails: ["pl@bergs.se"] });
  assert.deepEqual(r.invoiceEmails, ["ekonomi@bergs.se", "inkop@bergs.se"]);
  assert.deepEqual(r.ccEmails, ["pl@bergs.se"]);
  assert.deepEqual(customerCreateSchema.parse({ type: "privat", name: "Anna" }).invoiceEmails, [], "defaults to an empty list");
  const bad = customerCreateSchema.safeParse({ type: "privat", name: "Anna", invoiceEmails: ["anna@example.se", "inte-en-adress"] });
  assert.equal(bad.success, false);
  assert.match(issuesToDetailsPure((bad as { error: z.ZodError }).error).invoiceEmails, /inte-en-adress/);
  const many = customerCreateSchema.safeParse({ type: "privat", name: "Anna", ccEmails: Array.from({ length: 11 }, (_, i) => `a${i}@example.se`) });
  assert.equal(many.success, false);
});

test("openapi: the customer resource has the recipient lists", () => {
  const doc = openApiDocument("https://example.se") as unknown as { components: { schemas: Record<string, { properties: Record<string, { type: string; maxItems?: number }>; required?: string[] }> } };
  const customer = doc.components.schemas.Customer;
  assert.equal(customer.properties.invoiceEmails.type, "array");
  assert.ok(customer.required?.includes("ccEmails"));
  const create = doc.components.schemas.CustomerCreate;
  assert.equal(create.properties.invoiceEmails.maxItems, 10);
  assert.ok(!create.required?.includes("invoiceEmails"), "optional when creating");
});

test("list query coerces the limit and rejects unknown statuses", () => {
  assert.equal(invoiceListQuerySchema.parse({ limit: "5" }).limit, 5);
  assert.equal(invoiceListQuerySchema.safeParse({ status: "lost" }).success, false);
});

test("zod to JSON schema: strings, numbers, enums, optional vs default, nullable", () => {
  const s = z.object({
    a: z.string().min(2).max(5).regex(/^x/),
    b: z.number().int().min(0),
    c: z.enum(["x", "y"]),
    d: z.string().default("z"),
    e: z.string().optional(),
    f: z.string().nullable(),
    g: z.array(z.boolean()).max(3),
  });
  assert.deepEqual(zodToJsonSchema(s, "input"), {
    type: "object",
    properties: {
      a: { type: "string", minLength: 2, maxLength: 5, pattern: "^x" },
      b: { type: "integer", minimum: 0 },
      c: { type: "string", enum: ["x", "y"] },
      d: { type: "string", default: "z" },
      e: { type: "string" },
      f: { type: ["string", "null"] },
      g: { type: "array", items: { type: "boolean" }, maxItems: 3 },
    },
    required: ["a", "b", "c", "f", "g"],
  });
  assert.deepEqual((zodToJsonSchema(s, "output") as { required: string[] }).required, ["a", "b", "c", "d", "f", "g"]);
});

test("the OpenAPI document has every route and resolvable schema refs", () => {
  const doc = openApiDocument("https://exempel.se");
  for (const p of [
    "/customers",
    "/customers/{id}",
    "/invoices",
    "/invoices/{id}",
    "/invoices/{id}/issue",
    "/invoices/{id}/payments",
    "/invoices/{id}/pdf",
    "/payments",
    "/payment-plans",
    "/payment-plans/{id}",
    "/rot-claims",
    "/rot-claims/{id}",
    "/events",
  ])
    assert.ok(doc.paths[p as keyof typeof doc.paths], p);
  const text = JSON.stringify(doc);
  for (const m of text.matchAll(/"#\/components\/(schemas|responses|parameters)\/(\w+)"/g)) {
    const group = doc.components[m[1] as "schemas"] as Record<string, unknown>;
    assert.ok(group[m[2]], `${m[1]}/${m[2]}`);
  }
  const create = doc.components.schemas.InvoiceCreate as { properties: Record<string, unknown>; required: string[] };
  assert.ok(create.properties.lines);
  assert.deepEqual(create.required, ["lines"]);
});

test("every path in the OpenAPI document has a route, and every authenticated one documents 429 and the headers", () => {
  const doc = openApiDocument("https://exempel.se") as unknown as {
    paths: Record<string, Record<string, { security?: unknown[]; responses: Record<string, { $ref?: string; headers?: Record<string, unknown> }> }>>;
    components: { responses: Record<string, { headers?: Record<string, unknown> }> };
  };
  for (const [path, ops] of Object.entries(doc.paths)) {
    const file = join(process.cwd(), "app/api/v1", ...path.split("/").filter(Boolean).map((seg) => seg.replace("{id}", "[id]")), "route.ts");
    assert.ok(existsSync(file), `${path} → ${file}`);
    for (const [method, op] of Object.entries(ops)) {
      assert.ok(op.responses["200"]?.headers?.["X-Request-Id"] ?? op.responses["201"]?.headers?.["X-Request-Id"], `${method} ${path}: X-Request-Id`);
      if (op.security?.length === 0) continue;
      assert.equal(op.responses["429"]?.$ref, "#/components/responses/TooManyRequests", `${method} ${path}: 429`);
    }
  }
  const tooMany = doc.components.responses.TooManyRequests.headers!;
  for (const h of ["Retry-After", "X-RateLimit-Remaining", "X-Request-Id"]) assert.ok(tooMany[h], h);
});

test("webhooks: invoice.corrected can be subscribed to, and the contract lists it", () => {
  assert.ok((WEBHOOK_EVENT_TYPES as readonly string[]).includes("invoice.corrected"));
  const doc = openApiDocument("https://exempel.se");
  assert.ok((doc.components.schemas.WebhookEvent as { properties: { type: { enum: string[] } } }).properties.type.enum.includes("invoice.corrected"));
});

test("the ROT claim schema only accepts masked personal numbers", () => {
  const doc = openApiDocument("https://exempel.se") as unknown as { components: { schemas: { RotClaim: { properties: { items: { items: { properties: { personalNumber: { pattern: string } } } } } } } } };
  const pattern = new RegExp(doc.components.schemas.RotClaim.properties.items.items.properties.personalNumber.pattern);
  assert.ok(pattern.test("19850412-XXXX"));
  assert.ok(!pattern.test("19850412-1234"));
  assert.ok(!pattern.test("850412-1234"));
});

test("openapi: the HR resources are published with their tags, and the employee never has a bank account", () => {
  const doc = openApiDocument("https://example.se") as unknown as { paths: Record<string, Record<string, { tags: string[] }>>; components: { schemas: Record<string, { properties: Record<string, unknown>; required?: string[] }> } };
  for (const p of ["/employees", "/employees/{id}", "/time-entries", "/absences", "/payslips", "/payslips/{id}", "/payslips/{id}/pdf", "/pay-runs", "/pay-runs/{id}"]) assert.ok(doc.paths[p], p);
  assert.ok(doc.paths["/time-entries"].post);
  assert.equal(doc.paths["/payslips"].get.tags[0], "Lön");
  const employee = doc.components.schemas.Employee;
  assert.ok(employee.properties.personalNumber);
  for (const k of ["bankAccount", "bankClearing", "street", "notes", "userId"]) assert.ok(!(k in employee.properties), k);
  assert.ok(doc.components.schemas.Payslip.required?.includes("lines"));
});
