import "server-only";
import { randomBytes } from "node:crypto";
import { createClient } from "../../supabase/server";
import { createAdminClient } from "../../supabase/admin";
import { isDemo } from "../../leads";
import { DEMO_ORG_ID } from "./current";
import { companySettingsSchema } from "./settings";
import { REGISTRATION_TOKEN, registrationProblem, type RegistrationInput, type RegistrationProblem } from "./registration";

/**
 * Pending registrations (0033). start_registration runs with the service
 * role (the visitor is not signed in yet; the server action rate-limits per
 * IP first), complete_registration as the signed-in user, so the database
 * checks the address against the session.
 *
 * Demo mode keeps the registrations in memory and "creates" the
 * organisation by writing its details into the demo organisation's
 * settings, so the flow can be tried without Supabase.
 */

export type StartResult = { token: string; status: "created" | "resent" };

type DemoRegistration = RegistrationInput & { token: string; consumedAt: string | null };
const g = globalThis as unknown as { __binaafyRegistrations?: DemoRegistration[]; __binaafyOrgSettings?: Record<string, unknown> };
const demo = () => (g.__binaafyRegistrations ??= []);

export async function startRegistration(input: RegistrationInput, ip: string | null): Promise<StartResult> {
  const token = randomBytes(32).toString("hex");
  if (isDemo()) {
    const open = demo().find((r) => r.email === input.email && !r.consumedAt);
    if (open) {
      Object.assign(open, input, { token });
      return { token, status: "resent" };
    }
    demo().push({ ...input, token, consumedAt: null });
    return { token, status: "created" };
  }
  const { data, error } = await createAdminClient().rpc("start_registration", {
    p_org_name: input.orgName,
    p_org_nr: input.orgNr,
    p_contact_name: input.contactName,
    p_email: input.email,
    p_token: token,
    p_ip: ip,
  });
  if (error) throw new Error(`Kunde inte spara registreringen: ${error.message}`);
  return { token, status: data === "resent" ? "resent" : "created" };
}

export type CompleteResult = { ok: true; orgId: string } | { ok: false; problem: RegistrationProblem };

/** Create the organisation for the registration behind `token`, as the signed-in user. */
export async function completeRegistration(token: string, email: string | null): Promise<CompleteResult> {
  if (!REGISTRATION_TOKEN.test(token)) return { ok: false, problem: "lank" };
  if (isDemo()) {
    const reg = demo().find((r) => r.token === token);
    if (!reg) return { ok: false, problem: "saknas" };
    if (reg.consumedAt) return { ok: false, problem: "anvand" };
    reg.consumedAt = new Date().toISOString();
    // The row create_organization + complete_registration store: only the company group, the rest from defaults.
    (g.__binaafyOrgSettings ??= {})[DEMO_ORG_ID] = {
      company: companySettingsSchema.parse({ legalName: reg.orgName, orgNr: reg.orgNr, email: reg.email, signer: reg.contactName }),
    };
    return { ok: true, orgId: DEMO_ORG_ID };
  }
  if (!email) return { ok: false, problem: "adress" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("complete_registration", { p_token: token });
  if (error) {
    const problem = registrationProblem(error.message);
    if (problem === "fel") console.error("[registration] complete failed:", error.message);
    return { ok: false, problem };
  }
  return { ok: true, orgId: data as string };
}
