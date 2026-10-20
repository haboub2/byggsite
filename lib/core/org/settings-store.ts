import "server-only";
import { getDb } from "../db";
import { isDemo } from "../../leads";
import { getContent } from "../../content/store";
import { currentOrgId } from "./current";
import type { ChartOfAccounts } from "../ledger/posting";
import { chartFromSettings, overrideAccounts, resolveOrgSettings, settingsFromContent, orgSettingsSchema, type OrgSettings } from "./settings";
import type { Actor } from "../events";

/**
 * org_settings as the rest of the core reads it. The first organisation
 * (Binaafy, default_org()) falls back to the website's Företaget and
 * Offertuppgifter plus the environment until its row is saved; any other
 * organisation starts from what create_organization stored and the schema
 * defaults, never from another company's details.
 */

const g = globalThis as unknown as { __binaafyOrgSettings?: Record<string, unknown> };

async function contentFallback(): Promise<OrgSettings> {
  const { company, quote } = await getContent();
  return settingsFromContent({ company, quote, env: process.env });
}

export type StoredSettings = { orgId: string; settings: OrgSettings; saved: boolean; updatedAt: string | null };

export async function getOrgSettingsRecord(orgId?: string): Promise<StoredSettings> {
  const org = orgId ?? (await currentOrgId());
  const fallback = await contentFallback();
  if (isDemo()) {
    const data = g.__binaafyOrgSettings?.[org];
    return { orgId: org, settings: resolveOrgSettings(data, () => fallback), saved: !!data, updatedAt: null };
  }
  const supabase = await getDb();
  const [{ data, error }, { data: first }] = await Promise.all([
    supabase.from("org_settings").select("data, updated_at").eq("org_id", org).maybeSingle(),
    // default_org() is security definer: the oldest organisation of all, not of those the user can see.
    supabase.rpc("default_org"),
  ]);
  if (error) throw new Error(`Kunde inte läsa inställningarna: ${error.message}`);
  const isFirst = first === org;
  const stored = data?.data ?? {};
  return {
    orgId: org,
    settings: resolveOrgSettings(stored, isFirst ? () => fallback : undefined),
    saved: !!data && Object.keys(stored as object).length > 0,
    updatedAt: (data?.updated_at as string | undefined) ?? null,
  };
}

export async function getOrgSettings(orgId?: string): Promise<OrgSettings> {
  return (await getOrgSettingsRecord(orgId)).settings;
}

/** Save the whole settings object. Owner/admin only (RLS org_settings_admin_write). */
export async function saveOrgSettings(input: unknown, actor: Actor): Promise<OrgSettings> {
  const settings = orgSettingsSchema.parse(input);
  const org = await currentOrgId();
  if (isDemo()) {
    (g.__binaafyOrgSettings ??= {})[org] = settings;
    return settings;
  }
  const supabase = await getDb();
  // Accounts an override points at must exist (journal_lines references accounts).
  const extra = overrideAccounts(settings);
  if (extra.length) {
    const { error } = await supabase.from("accounts").upsert(extra.map((a) => ({ org_id: org, number: a.number, name: a.name })), { onConflict: "org_id,number", ignoreDuplicates: true });
    if (error) throw new Error(`Kunde inte lägga till kontona: ${error.message}`);
  }
  const { error } = await supabase.from("org_settings").upsert({ org_id: org, data: settings }, { onConflict: "org_id" });
  if (error) throw new Error(`Kunde inte spara inställningarna: ${error.message}`);
  // Organisation name and org nr follow the invoice details, so the switcher shows the same.
  if (settings.company.legalName) {
    await supabase.from("organizations").update({ name: settings.company.legalName, org_nr: settings.company.orgNr }).eq("id", org);
  }
  await supabase.from("events").insert({ org_id: org, aggregate_type: "organization", aggregate_id: org, type: "settings.updated", data: {}, actor });
  return settings;
}

export type NumberSeries = { series: string; perYear: boolean; start: number; pad: number; next: number | null };

/** The number series (number_series) with the next number each will give. */
export async function listNumberSeries(orgId?: string): Promise<NumberSeries[]> {
  if (isDemo()) return [{ series: "F", perYear: false, start: 10001, pad: 0, next: null }, { series: "V", perYear: true, start: 1, pad: 0, next: null }];
  const org = orgId ?? (await currentOrgId());
  const supabase = await getDb();
  const [{ data: series, error }, { data: counters }] = await Promise.all([
    supabase.from("number_series").select("series, per_year, start, pad").eq("org_id", org).order("series"),
    supabase.from("number_counters").select("series, year, next").eq("org_id", org),
  ]);
  if (error) throw new Error(`Kunde inte läsa nummerserierna: ${error.message}`);
  const year = new Date().getFullYear();
  return (series ?? []).map((s) => {
    const c = (counters ?? []).find((x) => x.series === s.series && x.year === (s.per_year ? year : 0));
    return { series: s.series as string, perYear: s.per_year as boolean, start: s.start as number, pad: s.pad as number, next: c ? (c.next as number) : null };
  });
}

/** BAS with the organisation's overrides, for the postings. */
export async function currentChart(): Promise<ChartOfAccounts> {
  return chartFromSettings(await getOrgSettings());
}
