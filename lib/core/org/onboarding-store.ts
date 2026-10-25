import "server-only";
import { getDb } from "../db";
import { isDemo } from "../../leads";
import { listCustomers } from "../customers/store";
import { listInvoices } from "../invoices/store";
import { getOrgSettingsRecord } from "./settings-store";
import { onboardingProgress, onboardingSteps, type OnboardingProgress, type OnboardingStep } from "./onboarding";

export type Onboarding = { steps: OnboardingStep[]; progress: OnboardingProgress };

/**
 * The start guide's data for an organisation: its settings, and how many
 * customers and invoices it has (counted, not loaded). Read with the
 * session, so RLS limits it to the member's own organisation.
 */
export async function loadOnboarding(orgId: string, siteOrg: boolean): Promise<Onboarding> {
  // Demo mode's requireRole says "demo"; the demo stores key on the session's organisation.
  const record = await getOrgSettingsRecord(isDemo() ? undefined : orgId);
  // The site's organisation reads its terms from Offertuppgifter until the settings page is saved.
  const termsReviewed = record.savedKeys.includes("terms") || (siteOrg && !record.saved);

  let customerCount = 0;
  let firstCustomerId: string | null = null;
  let invoiceCount = 0;
  if (isDemo()) {
    const [customers, invoices] = await Promise.all([listCustomers(), listInvoices()]);
    customerCount = customers.length;
    firstCustomerId = [...customers].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.id ?? null;
    invoiceCount = invoices.length;
  } else {
    const db = await getDb();
    const [customers, first, invoices] = await Promise.all([
      db.from("customers").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("deleted_at", null),
      db.from("customers").select("id").eq("org_id", orgId).is("deleted_at", null).order("created_at").limit(1).maybeSingle(),
      db.from("invoices").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    ]);
    if (customers.error) throw new Error(`Kunde inte räkna kunderna: ${customers.error.message}`);
    if (invoices.error) throw new Error(`Kunde inte räkna fakturorna: ${invoices.error.message}`);
    customerCount = customers.count ?? 0;
    firstCustomerId = (first.data?.id as string | undefined) ?? null;
    invoiceCount = invoices.count ?? 0;
  }

  const steps = onboardingSteps({ settings: record.settings, termsReviewed, siteOrg, customerCount, firstCustomerId, invoiceCount });
  return { steps, progress: onboardingProgress(steps) };
}
