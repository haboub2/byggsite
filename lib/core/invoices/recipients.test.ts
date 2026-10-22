import { test } from "node:test";
import assert from "node:assert/strict";
import { documentRecipients, emailListSchema, eventRecipientsText, invalidEmails, parseEmailList, recipientsText, resolveRecipients, sendRecipients } from "./recipients";
import { customerSchema, emptyCustomer } from "../customers/schema";
import { invoiceDocumentSchema } from "../documents/invoice";

test("parse: commas, semicolons, line breaks and spaces separate; blanks and duplicates go", () => {
  assert.deepEqual(parseEmailList(""), []);
  assert.deepEqual(parseEmailList("  \n , ;"), []);
  assert.deepEqual(parseEmailList("a@x.se, b@x.se"), ["a@x.se", "b@x.se"]);
  assert.deepEqual(parseEmailList("a@x.se\nb@x.se\r\n\nc@x.se;d@x.se e@x.se"), ["a@x.se", "b@x.se", "c@x.se", "d@x.se", "e@x.se"]);
  assert.deepEqual(parseEmailList("Ekonomi@X.se, ekonomi@x.se ,b@x.se,"), ["Ekonomi@X.se", "b@x.se"], "first spelling kept, compared without case");
  assert.deepEqual(parseEmailList("a@x.se, inte en adress"), ["a@x.se", "inte", "en", "adress"], "invalid entries are kept for the validation");
});

test("validate: names the entries that are not addresses", () => {
  assert.deepEqual(invalidEmails(["a@x.se", "ibrahim+a@gmail.com"]), []);
  assert.deepEqual(invalidEmails(["a@x.se", "a@", "x.se", "@x.se"]), ["a@", "x.se", "@x.se"]);
  const schema = emailListSchema("Fakturor till");
  assert.deepEqual(schema.parse(undefined), []);
  assert.deepEqual(schema.parse([" a@x.se ", "A@x.se", "b@x.se"]), ["a@x.se", "b@x.se"]);
  const bad = schema.safeParse(["a@x.se", "fel"]);
  assert.equal(bad.success, false);
  assert.equal(bad.error?.issues[0].message, "Fakturor till: fel är inte en giltig e-postadress.");
  assert.deepEqual(bad.error?.issues[0].path, []);
  assert.equal(schema.safeParse(Array.from({ length: 11 }, (_, i) => `a${i}@x.se`)).success, false, "at most ten");
});

test("customer: the lists default to empty and are checked", () => {
  const c = customerSchema.parse({ ...emptyCustomer, name: "Anna" });
  assert.deepEqual([c.invoiceEmails, c.ccEmails], [[], []]);
  const r = customerSchema.safeParse({ ...emptyCustomer, name: "Anna", ccEmails: ["anna@x.se", "anna(at)x.se"] });
  assert.equal(r.success, false);
  assert.deepEqual(r.error?.issues.map((i) => i.path.join(".")), ["ccEmails"]);
});

test("resolve at issue: empty Fakturor till means the ordinary address", () => {
  const customer = { email: "anna@x.se", invoiceEmails: [], ccEmails: [] };
  assert.deepEqual(resolveRecipients(customer, "anna@x.se"), { to: ["anna@x.se"], cc: [] });
  assert.deepEqual(resolveRecipients(customer, "ny@x.se"), { to: ["ny@x.se"], cc: [] }, "the draft's buyer e-mail wins over the register's");
  assert.deepEqual(resolveRecipients(customer, ""), { to: ["anna@x.se"], cc: [] });
  assert.deepEqual(resolveRecipients(null, "kund@x.se"), { to: ["kund@x.se"], cc: [] }, "a buyer outside the register");
  assert.deepEqual(resolveRecipients(null, ""), { to: [], cc: [] });
});

test("resolve at issue: the lists replace the address, copies never repeat a recipient", () => {
  const customer = { email: "info@bergs.se", invoiceEmails: ["ekonomi@bergs.se", "inkop@bergs.se"], ccEmails: ["pl@bergs.se", "Ekonomi@bergs.se"] };
  assert.deepEqual(resolveRecipients(customer, "info@bergs.se"), { to: ["ekonomi@bergs.se", "inkop@bergs.se"], cc: ["pl@bergs.se"] });
  assert.deepEqual(resolveRecipients({ email: "info@bergs.se", ccEmails: ["pl@bergs.se"] }, "info@bergs.se"), { to: ["info@bergs.se"], cc: ["pl@bergs.se"] }, "copies with the ordinary address");
});

const doc = (se: Record<string, unknown> = {}, email = "anna@x.se") =>
  invoiceDocumentSchema.parse({
    issueDate: "2026-10-22",
    dueDate: "2026-11-21",
    seller: { name: "Binaafy AB", orgNr: "559123-4567", vatNr: "SE559123456701", street: "Gatan 1", postalCode: "111 11", city: "Stockholm" },
    buyer: { type: "privat", name: "Anna", orgNr: "", vatNr: "", street: "Vägen 2", postalCode: "222 22", city: "Göteborg", email },
    lines: [],
    se,
  });

test("document: the frozen list, or the buyer e-mail on documents from before the list", () => {
  assert.deepEqual(documentRecipients(doc()), { to: ["anna@x.se"], cc: [] });
  assert.deepEqual(documentRecipients(doc({}, "")), { to: [], cc: [] });
  const frozen = doc({ recipients: { to: ["a@x.se", "b@x.se"], cc: ["c@x.se"] } });
  assert.deepEqual(frozen.se.recipients, { to: ["a@x.se", "b@x.se"], cc: ["c@x.se"] }, "survives the document schema");
  assert.deepEqual(documentRecipients(frozen), { to: ["a@x.se", "b@x.se"], cc: ["c@x.se"] }, "buyer.email stays the main address but the list decides");
  assert.equal(doc().se.recipients, undefined, "no list is added to old documents");
  assert.equal(invoiceDocumentSchema.safeParse({ ...doc(), se: { recipients: { to: ["fel"], cc: [] } } }).success, false);
});

test("send: to and cc as Resend gets them, with this send's extra addresses", () => {
  const frozen = doc({ recipients: { to: ["ibrahimtorki+a@gmail.com", "ibrahimtorki+b@gmail.com"], cc: ["pl@x.se"] } });
  assert.deepEqual(sendRecipients(frozen), { to: ["ibrahimtorki+a@gmail.com", "ibrahimtorki+b@gmail.com"], cc: ["pl@x.se"] });
  assert.deepEqual(sendRecipients(frozen, ["extra@x.se", "IBRAHIMTORKI+a@gmail.com"]), { to: ["ibrahimtorki+a@gmail.com", "ibrahimtorki+b@gmail.com", "extra@x.se"], cc: ["pl@x.se"] }, "no address twice");
  assert.deepEqual(sendRecipients(frozen, ["pl@x.se"]), { to: ["ibrahimtorki+a@gmail.com", "ibrahimtorki+b@gmail.com", "pl@x.se"], cc: [] }, "an address added as recipient leaves cc");
  assert.deepEqual(sendRecipients(doc({}, ""), ["ny@x.se"]), { to: ["ny@x.se"], cc: [] }, "an extra address is enough when the customer has none");
});

test("text: messages, the reminders table and the timeline", () => {
  assert.equal(recipientsText({ to: ["a@x.se", "b@x.se"], cc: [] }), "a@x.se, b@x.se");
  assert.equal(recipientsText({ to: ["a@x.se"], cc: ["c@x.se", "d@x.se"] }), "a@x.se, kopia c@x.se, d@x.se");
  assert.equal(eventRecipientsText({ number: "10001", to: "a@x.se", recipients: { to: ["a@x.se", "b@x.se"], cc: ["c@x.se"] } }), "a@x.se, b@x.se, kopia c@x.se");
  assert.equal(eventRecipientsText({ number: "10001", to: "post" }), "post", "events from before the list, and marked by hand");
  assert.equal(eventRecipientsText({ number: "10001" }), "");
});
