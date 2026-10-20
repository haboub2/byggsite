import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { customerCreateSchema, invoiceCreateSchema, paymentCreateSchema, invoiceListQuerySchema } from "./schemas";
import { zodToJsonSchema } from "./zod-json-schema";
import { openApiDocument } from "./openapi";
import { issuesToDetailsPure } from "./validation";

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
  for (const p of ["/customers", "/customers/{id}", "/invoices", "/invoices/{id}", "/invoices/{id}/issue", "/invoices/{id}/payments", "/invoices/{id}/pdf"]) assert.ok(doc.paths[p as keyof typeof doc.paths], p);
  const text = JSON.stringify(doc);
  for (const m of text.matchAll(/"#\/components\/(schemas|responses|parameters)\/(\w+)"/g)) {
    const group = doc.components[m[1] as "schemas"] as Record<string, unknown>;
    assert.ok(group[m[2]], `${m[1]}/${m[2]}`);
  }
  const create = doc.components.schemas.InvoiceCreate as { properties: Record<string, unknown>; required: string[] };
  assert.ok(create.properties.lines);
  assert.deepEqual(create.required, ["lines"]);
});
