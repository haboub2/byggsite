"use client";

import { useState } from "react";
import { EditorForm, TextArea, TextField } from "../content/EditorForm";
import { saveCustomer } from "@/app/admin/customer-actions";
import { CUSTOMER_TYPES, CUSTOMER_TYPE_LABEL, type CustomerType } from "@/lib/core/documents/invoice";
import type { CustomerInput } from "@/lib/core/customers/schema";
import { parseEmailList } from "@/lib/core/invoices/recipients";

export default function CustomerForm({ id, initial }: { id: string | null; initial: CustomerInput }) {
  const [c, setC] = useState(initial);
  const set = <K extends keyof CustomerInput>(k: K) => (v: CustomerInput[K]) => setC((prev) => ({ ...prev, [k]: v }));
  const business = c.type !== "privat";
  // The address lists are typed as text; the record holds the parsed list, the field keeps what was typed.
  const [invoiceEmailsText, setInvoiceEmailsText] = useState(initial.invoiceEmails.join(", "));
  const [ccEmailsText, setCcEmailsText] = useState(initial.ccEmails.join(", "));

  return (
    <EditorForm action={saveCustomer} hidden={{ id: id ?? "" }} submitLabel={id ? "Spara kunden" : "Skapa kunden"} value={c} initial={initial}>
      <fieldset className="efieldset">
        <legend>Kundtyp</legend>
        <div className="calc-seg" role="group" aria-label="Kundtyp">
          {CUSTOMER_TYPES.map((t) => (
            <button key={t} type="button" aria-pressed={c.type === t} onClick={() => set("type")(t as CustomerType)}>
              {CUSTOMER_TYPE_LABEL[t].replace(" (omvänd betalningsskyldighet)", "")}
            </button>
          ))}
        </div>
        <span className="efield-hint" style={{ display: "block", marginTop: 10 }}>
          {c.type === "privat" && "Priser visas inkl. moms. ROT kan dras på arbete."}
          {c.type === "foretag" && "Priser visas exkl. moms med momsrad."}
          {c.type === "byggforetag" && "Byggtjänster faktureras utan moms med texten Omvänd betalningsskyldighet. Momsregistreringsnumret krävs på fakturan."}
        </span>
      </fieldset>

      <fieldset className="efieldset">
        <legend>Uppgifter</legend>
        <div className="egrid">
          {business && (
            <>
              <TextField label="Företag" path="company" value={c.company} onChange={set("company")} placeholder="Bergs Bygg AB" />
              <TextField label="Organisationsnummer" path="orgNr" value={c.orgNr} onChange={set("orgNr")} placeholder="556xxx-xxxx" />
              <TextField label="Momsregistreringsnummer" path="vatNr" value={c.vatNr} onChange={set("vatNr")} placeholder="SE556xxxxxxx01" hint={c.type === "byggforetag" ? "Krävs vid omvänd betalningsskyldighet." : "Valfritt; skrivs på fakturan om det finns."} />
            </>
          )}
          <TextField label={business ? "Kontaktperson" : "Namn"} path="name" value={c.name} onChange={set("name")} placeholder="Anna Lindqvist" />
          {business && <TextField label="Er referens (valfritt)" path="reference" value={c.reference} onChange={set("reference")} hint="Skrivs på fakturan. Lämnas tomt används kontaktpersonen." />}
          {business && (
            <TextField
              label="Peppol-id (e-faktura, valfritt)"
              path="peppolId"
              value={c.peppolId ?? ""}
              onChange={set("peppolId")}
              placeholder="0007:5561234567"
              hint="Kundens adress i Peppol. Lämnas tomt används 0007 och organisationsnumret."
            />
          )}
          <TextField
            label="E-post"
            path="email"
            inputMode="email"
            value={c.email}
            onChange={set("email")}
            hint={c.invoiceEmails.length ? "Kundens adress. Fakturor går till adresserna under Fakturor till." : "Fakturor mejlas hit."}
          />
          <TextArea
            label="Fakturor till (valfritt)"
            path="invoiceEmails"
            value={invoiceEmailsText}
            onChange={(v) => {
              setInvoiceEmailsText(v);
              set("invoiceEmails")(parseEmailList(v));
            }}
            rows={2}
            placeholder="ekonomi@kund.se, inkop@kund.se"
            hint="En eller flera adresser, med komma eller radbrytning emellan. Lämnas tomt går fakturor och påminnelser till e-postadressen ovan."
          />
          <TextArea
            label="Kopia till (valfritt)"
            path="ccEmails"
            value={ccEmailsText}
            onChange={(v) => {
              setCcEmailsText(v);
              set("ccEmails")(parseEmailList(v));
            }}
            rows={2}
            placeholder="projektledare@kund.se"
            hint="Får fakturor och påminnelser som kopia."
          />
          <TextField label="Telefon" path="phone" inputMode="tel" value={c.phone} onChange={set("phone")} />
          <div className="egrid egrid--address efield--wide">
            <TextField label="Gatuadress" path="street" value={c.street} onChange={set("street")} />
            <TextField label="Postnummer" path="postalCode" inputMode="numeric" value={c.postalCode} onChange={set("postalCode")} />
            <TextField label="Ort" path="city" value={c.city} onChange={set("city")} />
          </div>
          <TextField
            label="Betalningsvillkor, dagar"
            path="defaultTermsDays"
            inputMode="numeric"
            value={String(c.defaultTermsDays)}
            onChange={(v) => set("defaultTermsDays")(Number(v.replace(/[^\d]/g, "")) || 0)}
            hint="Förifylls på nya fakturor till kunden."
          />
          <TextArea label="Anteckningar (interna)" path="notes" value={c.notes} onChange={set("notes")} rows={3} />
        </div>
      </fieldset>
    </EditorForm>
  );
}
