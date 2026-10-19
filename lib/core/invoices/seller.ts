import "server-only";
import { getContent } from "../../content/store";
import type { InvoiceDocument, Seller } from "../documents/invoice";
import type { PaymentMeansInput } from "./from-quote";

/**
 * The seller block is ours, not the customer's: a draft always carries the
 * settings as they are now, and the issue step freezes them. Payment fields
 * the admin typed on the invoice win over the settings; empty ones are filled.
 */
export function applySellerDefaults(doc: InvoiceDocument, defaults: { seller: Seller; paymentMeans: PaymentMeansInput }): InvoiceDocument {
  const pm = doc.paymentMeans;
  const d = defaults.paymentMeans;
  return {
    ...doc,
    seller: { ...defaults.seller, countryCode: defaults.seller.countryCode || "SE" },
    paymentMeans: {
      ...pm,
      bankgiro: pm.bankgiro || d.bankgiro || "",
      plusgiro: pm.plusgiro || d.plusgiro || "",
      iban: pm.iban || d.iban || "",
      bic: pm.bic || d.bic || "",
      swish: pm.swish || d.swish || "",
    },
  };
}

/**
 * The seller block and payment details for a new invoice, from what the
 * admins already maintain under Företaget and Offertuppgifter. Moves to
 * org_settings when the settings UI is per organisation (fas 5).
 */
export async function getSellerDefaults(): Promise<{ seller: Seller; paymentMeans: PaymentMeansInput; lateInterestText: string; signer: string }> {
  const { company, quote } = await getContent();
  return {
    seller: {
      name: company.legalName,
      orgNr: company.orgNr,
      vatNr: quote.vatNumber,
      street: company.street,
      postalCode: company.postalCode,
      city: company.city,
      countryCode: "SE",
      email: company.email,
      phone: company.phoneDisplay,
      fSkatt: quote.fSkatt,
    },
    paymentMeans: {
      bankgiro: quote.bankgiro,
      plusgiro: quote.plusgiro,
      iban: quote.iban,
      bic: quote.bic,
      swish: "",
      termsDays: quote.paymentDays,
    },
    lateInterestText: quote.lateInterest || "Dröjsmålsränta enligt räntelagen, referensräntan plus 8 procentenheter.",
    signer: quote.signerName || company.legalName,
  };
}
