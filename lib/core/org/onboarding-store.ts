import "server-only";
import { getDb } from "../db";
import { isDemo } from "../../leads";
import { listCustomers } from "../customers/store";
import { listInvoices } from "../invoices/store";
import { getOrgSettingsRecord } from "./settings-store";
import type { OrgSettings } from "./settings";
import { onboardingProgress, onboardingSteps, trialInvoice, type OnboardingProgress, type OnboardingStep, type TrialInvoice } from "./onboarding";

export type Onboarding = { steps: OnboardingStep[]; trial: TrialInvoice; progress: OnboardingProgress; settings: OrgSettings };

/**
 * The start guide's data for an organisation: its settings, and how many
 * customers and invoices it has (counted, not loaded). Read with the
 * session, so RLS limits it to the member's own organisation.
 */
export async function loadOnboarding(orgId: string, siteOrg: boolean): Promise<Onboarding> {
  // Demo mode's requireRole says "demo"; the demo stores key on the session's organisation.
  // The settings and the counts are read side by side.
  const counts = async (): Promise<{ customerCount: number; firstCustomerId: string | null; invoiceCount: number }> => {
    if (isDemo()) {
      const [customers, invoices] = await Promise.all([listCustomers(), listInvoices()]);
      return {
        customerCount: customers.length,
        firstCustomerId: [...customers].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.id ?? null,
        invoiceCount: invoices.length,
      };
    }
    const db = await getDb();
    // The first customer and the total come back in one request (the count rides along with the row).
    const [customers, invoices] = await Promise.all([
      db.from("customers").select("id", { count: "exact" }).eq("org_id", orgId).is("deleted_at", null).order("created_at").limit(1),
      db.from("invoices").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    ]);
    if (customers.error) throw new Error(`Kunde inte räkna kunderna: ${customers.error.message}`);
    if (invoices.error) throw new Error(`Kunde inte räkna fakturorna: ${invoices.error.message}`);
    return {
      customerCount: customers.count ?? 0,
      firstCustomerId: ((customers.data?.[0] as { id: string } | undefined)?.id) ?? null,
      invoiceCount: invoices.count ?? 0,
    };
  };
  const [record, { customerCount, firstCustomerId, invoiceCount }] = await Promise.all([getOrgSettingsRecord(isDemo() ? undefined : orgId), counts()]);
  // The site's organisation reads its terms from Offertuppgifter until the settings page is saved.
  const termsReviewed = record.savedKeys.includes("terms") || (siteOrg && !record.saved);

  const input = { settings: record.settings, termsReviewed, siteOrg, customerCount, firstCustomerId, invoiceCount };
  const steps = onboardingSteps(input);
  const trial = trialInvoice(input, steps);
  return { steps, trial, progress: onboardingProgress(steps, trial), settings: record.settings };
}
