/**
 * The Peppol access point behind one interface. A real access point
 * (Pagero, Qvalia, Unifiedpost …) is plugged in here later as another
 * PeppolProvider, chosen with the env variable PEPPOL_PROVIDER. Until then
 * the manual provider sends nothing: the user downloads the XML and hands it
 * to their access point by hand.
 *
 * Providers only transport the XML. The caller renders it
 * (lib/render/ubl/peppol-bis-billing-3.ts), validates it, and logs the send
 * as an event with the returned id and status. No database access here.
 */

export type PeppolSendResult = { id: string; status: "queued" | "sent" | "failed" | "logged"; message?: string };

export interface PeppolProvider {
  readonly name: string;
  send(xml: string, meta: { invoiceId: string; number: string; receiver: string }): Promise<PeppolSendResult>;
}

/** Sends nothing. The result tells the caller to offer the file for download. */
export const manualProvider: PeppolProvider = {
  name: "manual",
  async send() {
    return {
      id: crypto.randomUUID(),
      status: "logged",
      message: "Ingen accesspunkt är kopplad; filen laddas ner och skickas för hand.",
    };
  },
};

const PROVIDERS: Record<string, PeppolProvider> = { manual: manualProvider };

/** The configured provider: PEPPOL_PROVIDER, default "manual". */
export function peppolProvider(): PeppolProvider {
  const name = (process.env.PEPPOL_PROVIDER ?? "").trim().toLowerCase() || "manual";
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`Okänd Peppol-accesspunkt "${name}" i PEPPOL_PROVIDER. Tillgängliga: ${Object.keys(PROVIDERS).join(", ")}.`);
  return provider;
}
