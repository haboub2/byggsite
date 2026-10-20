import "server-only";
import { getOrgSettings } from "../org/settings-store";
import { DEFAULT_LATE_INTEREST_TEXT, sellerFromSettings, termsDaysFor, type OrgSettings } from "../org/settings";
import type { CustomerType, InvoiceDocument, Seller } from "../documents/invoice";
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
 * The seller block and payment details for a new invoice, from the
 * organisation's settings (org_settings; lib/core/org/settings-store.ts,
 * which falls back to Företaget, Offertuppgifter and SWISH_NUMBER for the
 * first organisation until its settings are saved). Terms follow the
 * customer type when it is known.
 */
export async function getSellerDefaults(customerType?: CustomerType): Promise<{ seller: Seller; paymentMeans: PaymentMeansInput; lateInterestText: string; signer: string; settings: OrgSettings }> {
  const settings = await getOrgSettings();
  return {
    seller: sellerFromSettings(settings),
    paymentMeans: {
      bankgiro: settings.payment.bankgiro,
      plusgiro: settings.payment.plusgiro,
      iban: settings.payment.iban,
      bic: settings.payment.bic,
      swish: settings.payment.swish,
      termsDays: termsDaysFor(settings, customerType),
    },
    lateInterestText: settings.lateInterestText || DEFAULT_LATE_INTEREST_TEXT,
    signer: settings.company.signer || settings.company.legalName,
    settings,
  };
}
