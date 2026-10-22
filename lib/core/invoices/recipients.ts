import { z } from "zod";

/**
 * Who an invoice and its reminders are mailed to. The customer register
 * holds two lists, invoiceEmails ("Fakturor till") and ccEmails ("Kopia
 * till"); an empty invoiceEmails means the customer's ordinary e-mail
 * address. At issue the lists are frozen into the document
 * (se.recipients), so a later mailing of an old invoice goes to the
 * addresses that applied when it was issued. Pure functions, shared by the
 * forms, the store, the mailers and the tests.
 */

export type Recipients = { to: string[]; cc: string[] };

/** At most this many addresses per list (Resend takes 50 per field; nobody needs that many). */
export const MAX_RECIPIENTS = 10;

const emailCheck = z.string().email();

export function isEmail(v: string): boolean {
  return emailCheck.safeParse(v).success;
}

/** Same addresses, first spelling kept, compared without case. */
export function uniqueEmails(list: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const v = raw.trim();
    const key = v.toLowerCase();
    if (!v || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/**
 * Addresses typed into one field: separated by commas, semicolons, line
 * breaks or spaces (an address never contains any of them). Trimmed, empty
 * entries dropped, duplicates removed. Invalid entries are kept so the
 * validation can name them.
 */
export function parseEmailList(text: string): string[] {
  return uniqueEmails(text.split(/[\s,;]+/));
}

/** The entries of a list that are not e-mail addresses. */
export function invalidEmails(list: readonly string[]): string[] {
  return list.filter((v) => !isEmail(v.trim()));
}

/** A list of addresses as stored on the customer: valid, unique, at most MAX_RECIPIENTS. */
export const emailListSchema = (label: string) =>
  z
    .array(z.string().trim().max(254, `${label}: en adress är för lång.`))
    .max(MAX_RECIPIENTS, `${label}: högst ${MAX_RECIPIENTS} adresser.`)
    .default([])
    .transform((list) => uniqueEmails(list))
    .superRefine((list, ctx) => {
      const bad = invalidEmails(list);
      if (bad.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label}: ${bad.join(", ")} är inte ${bad.length === 1 ? "en giltig e-postadress" : "giltiga e-postadresser"}.` });
    });

/** Recipients as frozen in the document. Stored lists are already clean; this is the shape check. */
export const recipientsSchema = z.object({
  to: z.array(z.string().trim().email()).max(MAX_RECIPIENTS),
  cc: z.array(z.string().trim().email()).max(MAX_RECIPIENTS).default([]),
});

/** cc without anything already in to. */
function withoutTo(r: Recipients): Recipients {
  const to = uniqueEmails(r.to);
  const inTo = new Set(to.map((v) => v.toLowerCase()));
  return { to, cc: uniqueEmails(r.cc).filter((v) => !inTo.has(v.toLowerCase())) };
}

/**
 * What to freeze into a document at issue. `invoiceEmails` empty: the
 * buyer's e-mail on the document (copied from the customer, maybe edited in
 * the draft), else the customer's. No customer in the register: the buyer's
 * e-mail alone.
 */
export function resolveRecipients(
  customer: { email: string; invoiceEmails?: readonly string[]; ccEmails?: readonly string[] } | null,
  buyerEmail: string
): Recipients {
  const main = buyerEmail.trim() || customer?.email.trim() || "";
  const listed = uniqueEmails(customer?.invoiceEmails ?? []);
  return withoutTo({ to: listed.length ? listed : main ? [main] : [], cc: [...(customer?.ccEmails ?? [])] });
}

/** Who the document goes to: its frozen list, or the buyer's e-mail on documents issued before the list existed. */
export function documentRecipients(doc: { buyer: { email: string }; se?: { recipients?: Recipients } }): Recipients {
  const frozen = doc.se?.recipients;
  if (frozen && frozen.to.length) return withoutTo(frozen);
  return withoutTo({ to: doc.buyer.email ? [doc.buyer.email] : [], cc: frozen?.cc ?? [] });
}

/** One mailing: the document's recipients plus the addresses added for just this send. */
export function sendRecipients(doc: Parameters<typeof documentRecipients>[0], extra: readonly string[] = []): Recipients {
  const base = documentRecipients(doc);
  return withoutTo({ to: [...base.to, ...extra], cc: base.cc });
}

/** "a@x.se, b@x.se, kopia c@x.se", for messages, the event log and the reminders table. */
export function recipientsText(r: Recipients): string {
  return [r.to.join(", "), r.cc.length ? `kopia ${r.cc.join(", ")}` : ""].filter(Boolean).join(", ");
}

/** The recipients an invoice.sent or invoice.reminded event names: the structured list, else the old `to` text. */
export function eventRecipientsText(data: Record<string, unknown>): string {
  const r = data.recipients as Partial<Recipients> | undefined;
  if (r && Array.isArray(r.to)) return recipientsText({ to: r.to, cc: Array.isArray(r.cc) ? r.cc : [] });
  return typeof data.to === "string" ? data.to : "";
}
