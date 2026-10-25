import "server-only";
import { asSystem } from "../core/db";
import { currentOrgId } from "../core/org/current";
import { getOrgSettings } from "../core/org/settings-store";
import { isSiteOrg } from "../core/org/site";
import { getContent } from "../content/store";
import { LOGO_DATA_URI } from "../pdf/logo";
import { site } from "../placeholder";
import { BLANK_QUOTE_TEXTS, quoteProfile, type QuoteProfile } from "./profile";

/**
 * The profile of the given organisation (a quote's org_id), or of the
 * session's. Read as the system: the quote PDF is also rendered for portal
 * customers, who may not read org_settings, and the caller has already been
 * allowed to see the quote it is for.
 */
export async function getQuoteProfile(orgId?: string | null): Promise<QuoteProfile> {
  const org = orgId || (await currentOrgId());
  const [settings, isSite] = await asSystem(() => Promise.all([getOrgSettings(org), isSiteOrg(org)]), org);
  if (!isSite) return quoteProfile(settings, BLANK_QUOTE_TEXTS, { brand: settings.company.legalName, logo: settings.branding.logo || null });
  const { quote } = await getContent();
  return quoteProfile(settings, quote, { brand: site.brand, logo: LOGO_DATA_URI });
}
