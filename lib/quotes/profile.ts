import type { Company, QuoteSettings } from "../content/schema";
import type { OrgSettings } from "../core/org/settings";

/**
 * Who a quote is from: the seller, payment details, terms and signer of the
 * quote's own organisation (org_settings, /admin/installningar), over the
 * default texts per side. Only the organisation that owns the website keeps
 * those texts in Offertuppgifter (content_blocks); any other starts from
 * BLANK_QUOTE_TEXTS and never sees Binaafy's.
 */

export type QuoteCompany = Pick<Company, "legalName" | "orgNr" | "street" | "postalCode" | "city" | "phoneDisplay" | "email">;

export type QuoteProfile = {
  company: QuoteCompany;
  settings: QuoteSettings;
  /** The name in the file name and the mail: the site's brand, or the company name. */
  brand: string;
  /** Logo as a data URI, or null to print the company name instead. */
  logo: string | null;
};

const blankSide = { intro: "", payment: "", warranty: "", excluded: "", notes: "" };

/** Default texts for an organisation without Offertuppgifter. */
export const BLANK_QUOTE_TEXTS: QuoteSettings = {
  bankgiro: "",
  plusgiro: "",
  iban: "",
  bic: "",
  vatNumber: "",
  fSkatt: true,
  insurance: "",
  validDays: 30,
  paymentDays: 30,
  lateInterest: "",
  signerName: "",
  signerTitle: "",
  bygg: blankSide,
  software: blankSide,
};

export function quoteProfile(org: OrgSettings, texts: QuoteSettings, look: { brand: string; logo: string | null }): QuoteProfile {
  const c = org.company;
  const p = org.payment;
  return {
    company: {
      legalName: c.legalName,
      orgNr: c.orgNr,
      street: c.street,
      postalCode: c.postalCode,
      city: c.city,
      phoneDisplay: c.phone,
      email: c.email,
    },
    settings: {
      ...texts,
      bankgiro: p.bankgiro,
      plusgiro: p.plusgiro,
      iban: p.iban,
      bic: p.bic,
      vatNumber: c.vatNr,
      fSkatt: c.fSkatt,
      // A quote is written before the customer type is known; the action sets
      // the terms for the type the quote gets (termsDaysFor).
      paymentDays: org.terms.foretag,
      signerName: c.signer,
      // The title belongs with the website's signer; another signer gets none.
      signerTitle: c.signer && c.signer === texts.signerName ? texts.signerTitle : "",
    },
    brand: look.brand || c.legalName,
    logo: look.logo,
  };
}
