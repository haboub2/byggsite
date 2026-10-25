import { z } from "zod";
import { ORG_NR } from "../documents/invoice";

/**
 * Self-registration (/registrera, 0033): a new company signs itself up, gets
 * a sign-in link, and the link creates the organisation with the visitor as
 * owner. Pure: shared by the server action, the landing and the tests. The
 * database (start_registration) checks the same rules again.
 */

/** The token in the link: 32 random bytes as hex. Only its sha256 is stored. */
export const REGISTRATION_TOKEN = /^[a-f0-9]{64}$/;

/** Where the sign-in link lands after the callback has made the session. */
export const REGISTRATION_DONE_PATH = "/admin/registrera/klar";

export function registrationDonePath(token: string): string {
  return `${REGISTRATION_DONE_PATH}?r=${token}`;
}

/** "5591234567" → "559123-4567"; anything else as typed. */
export function normaliseOrgNr(v: string): string {
  const t = v.replace(/\s/g, "");
  return /^\d{10}$/.test(t) ? `${t.slice(0, 6)}-${t.slice(6)}` : t;
}

export const registrationSchema = z.object({
  orgName: z.string().trim().min(2, "Ange företagets namn.").max(120, "Företagsnamnet får vara högst 120 tecken."),
  // Same rule as company.orgNr in lib/core/org/settings.ts, but required here.
  orgNr: z
    .string()
    .trim()
    .transform(normaliseOrgNr)
    .refine((v) => v !== "", "Ange organisationsnumret.")
    .refine((v) => v === "" || ORG_NR.test(v), "Organisationsnummer skrivs 559123-4567."),
  contactName: z.string().trim().min(1, "Ange ditt namn.").max(120, "Namnet får vara högst 120 tecken."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(320, "E-postadressen är för lång.")
    .email("Ange en giltig e-postadress."),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;

/** The form's fields from FormData; unknown keys are ignored. */
export function registrationFromForm(form: FormData): Record<string, string | undefined> {
  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : undefined;
  };
  return { orgName: get("orgName"), orgNr: get("orgNr"), contactName: get("contactName"), email: get("email") };
}

/** Why the landing could not finish, as /admin/registrera?fel=… shows it. */
export const REGISTRATION_PROBLEMS = {
  lank: "Länken saknar sin kod. Öppna länken i mejlet igen, hela adressen.",
  saknas: "Registreringen finns inte, eller så har en nyare länk skickats. Öppna länken i det senaste mejlet.",
  anvand: "Registreringen är redan slutförd. Logga in som vanligt.",
  utgangen: "Länken har gått ut. Registrera företaget igen så får du en ny.",
  adress: "Du är inloggad med en annan e-postadress än den som registrerade företaget. Logga ut och öppna länken igen.",
  fel: "Organisationen kunde inte skapas just nu. Försök igen om en stund.",
} as const;
export type RegistrationProblem = keyof typeof REGISTRATION_PROBLEMS;

/** Map a database message from complete_registration (0033) to a problem code. */
export function registrationProblem(message: string): RegistrationProblem {
  if (/finns inte/i.test(message)) return "saknas";
  if (/redan slutförd/i.test(message)) return "anvand";
  if (/gått ut/i.test(message)) return "utgangen";
  if (/inloggad som/i.test(message)) return "adress";
  return "fel";
}
