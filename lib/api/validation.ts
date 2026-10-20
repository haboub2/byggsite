import type { z } from "zod";

/** zod issues as { "dotted.path": message }, the `details` of a validation_error. */
export function issuesToDetailsPure(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "(body)";
    if (!out[path]) out[path] = issue.message;
  }
  return out;
}
