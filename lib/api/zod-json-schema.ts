import { z } from "zod";

/**
 * zod (v3) → JSON Schema (draft 2020-12, as OpenAPI 3.1 uses), for the
 * schemas the API validates with. Covers the zod types lib/core and
 * lib/api use; anything else becomes `{}` (any) rather than failing, so a
 * new field never breaks /openapi.json. `io: "input"` describes what a
 * client may send (defaults make fields optional); "output" what we return.
 */

type Json = Record<string, unknown>;
export type JsonSchemaIo = "input" | "output";

export function zodToJsonSchema(schema: z.ZodTypeAny, io: JsonSchemaIo = "output"): Json {
  const def = schema._def as { typeName: string; description?: string } & Record<string, unknown>;
  const out = convert(schema, io);
  if (def.description && !out.description) out.description = def.description;
  return out;
}

function convert(schema: z.ZodTypeAny, io: JsonSchemaIo): Json {
  if (schema instanceof z.ZodString) {
    const s: Json = { type: "string" };
    for (const c of schema._def.checks) {
      if (c.kind === "min") s.minLength = c.value;
      else if (c.kind === "max") s.maxLength = c.value;
      else if (c.kind === "length") s.minLength = s.maxLength = c.value;
      else if (c.kind === "email") s.format = "email";
      else if (c.kind === "uuid") s.format = "uuid";
      else if (c.kind === "url") s.format = "uri";
      else if (c.kind === "datetime") s.format = "date-time";
      else if (c.kind === "regex") s.pattern = c.regex.source;
    }
    return s;
  }
  if (schema instanceof z.ZodNumber) {
    const s: Json = { type: "number" };
    for (const c of schema._def.checks) {
      if (c.kind === "int") s.type = "integer";
      else if (c.kind === "min") s[c.inclusive ? "minimum" : "exclusiveMinimum"] = c.value;
      else if (c.kind === "max") s[c.inclusive ? "maximum" : "exclusiveMaximum"] = c.value;
    }
    return s;
  }
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };
  if (schema instanceof z.ZodLiteral) {
    const v = schema._def.value;
    return { const: v, type: typeof v === "number" ? (Number.isInteger(v) ? "integer" : "number") : typeof v };
  }
  if (schema instanceof z.ZodEnum) return { type: "string", enum: [...schema._def.values] };
  if (schema instanceof z.ZodNativeEnum) return { enum: Object.values(schema._def.values) };
  if (schema instanceof z.ZodArray) {
    const s: Json = { type: "array", items: zodToJsonSchema(schema._def.type, io) };
    if (schema._def.minLength) s.minItems = schema._def.minLength.value;
    if (schema._def.maxLength) s.maxItems = schema._def.maxLength.value;
    if (schema._def.exactLength) s.minItems = s.maxItems = schema._def.exactLength.value;
    return s;
  }
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Json = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value, io);
      if (!isOptional(value, io)) required.push(key);
    }
    const s: Json = { type: "object", properties };
    if (required.length) s.required = required;
    if (schema._def.unknownKeys === "strict") s.additionalProperties = false;
    return s;
  }
  if (schema instanceof z.ZodOptional) return zodToJsonSchema(schema._def.innerType, io);
  if (schema instanceof z.ZodNullable) {
    const inner = zodToJsonSchema(schema._def.innerType, io);
    return typeof inner.type === "string" && !inner.enum && !inner.const ? { ...inner, type: [inner.type, "null"] } : { anyOf: [inner, { type: "null" }] };
  }
  if (schema instanceof z.ZodDefault) {
    const inner = zodToJsonSchema(schema._def.innerType, io);
    const d = schema._def.defaultValue();
    return d !== undefined && (typeof d !== "object" || d === null || Array.isArray(d)) ? { ...inner, default: d } : inner;
  }
  if (schema instanceof z.ZodEffects) return zodToJsonSchema(schema._def.schema, io);
  if (schema instanceof z.ZodPipeline) return zodToJsonSchema(io === "input" ? schema._def.in : schema._def.out, io);
  if (schema instanceof z.ZodCatch) return zodToJsonSchema(schema._def.innerType, io);
  if (schema instanceof z.ZodBranded) return zodToJsonSchema(schema._def.type, io);
  if (schema instanceof z.ZodLazy) return {};
  if (schema instanceof z.ZodUnion) {
    const options = (schema._def.options as z.ZodTypeAny[]).map((o) => zodToJsonSchema(o, io));
    // A union of a literal "" and a string is how optional text is written in lib/core.
    return { anyOf: options };
  }
  if (schema instanceof z.ZodDiscriminatedUnion) {
    return { oneOf: [...(schema._def.options as z.ZodTypeAny[])].map((o) => zodToJsonSchema(o, io)), discriminator: { propertyName: schema._def.discriminator } };
  }
  if (schema instanceof z.ZodRecord) return { type: "object", additionalProperties: zodToJsonSchema(schema._def.valueType, io) };
  if (schema instanceof z.ZodNull) return { type: "null" };
  return {};
}

/** Whether a property may be left out: optional always; a default only when describing input. */
function isOptional(schema: z.ZodTypeAny, io: JsonSchemaIo): boolean {
  if (schema instanceof z.ZodOptional) return true;
  if (schema instanceof z.ZodDefault) return io === "input";
  if (schema instanceof z.ZodEffects) return isOptional(schema._def.schema, io);
  return false;
}
