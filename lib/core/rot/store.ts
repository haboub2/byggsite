import "server-only";
import { getDb } from "../db";
import { currentOrgId, readOrgId } from "../org/current";
import { currentChart } from "../org/settings-store";
import { isDemo } from "../../leads";
import { todayIso } from "../../quotes/schema";
import { postPayment, type Posting } from "../ledger/posting";
import { makeEvent, type Actor } from "../events";
import { invoiceTotals } from "../invoices/totals";
import { demoJournalEntries, listInvoices, type InvoiceRecord } from "../invoices/store";
import { rulesAt } from "../rules";
import { toTwelveDigitPersonalNumber, type RotCategory, type RotClaimXml, type RotClaimXmlItem } from "./claim-xml";

/**
 * ROT claims (rot_claims, rot_claim_items in 0014; payout and rejection in
 * 0016). A claim is a set of paid invoices with ROT, turned into one XML
 * file for Skatteverket. Demo mode keeps claims in memory.
 */

export type RotClaimStatus = "draft" | "sent" | "paid" | "rejected";
export const ROT_CLAIM_STATUS_LABEL: Record<RotClaimStatus, string> = { draft: "Utkast", sent: "Skickad", paid: "Utbetald", rejected: "Avvisad" };

export type RotClaimItem = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  buyerName: string;
  personalNumber: string;
  amountOre: number;
  workOre: number;
  paidOn: string;
  status: "pending" | "paid" | "rejected";
  property: RotClaimXmlItem["property"];
  category: RotCategory;
};

export type RotClaim = {
  id: string;
  name: string;
  status: RotClaimStatus;
  sentOn: string | null;
  decidedOn: string | null;
  paidOre: number;
  note: string;
  createdAt: string;
  items: RotClaimItem[];
};

/** An invoice's ROT, ready to claim: paid in full, has ROT, not in a claim yet. */
export type RotCandidate = {
  invoice: InvoiceRecord;
  paidOn: string;
  buyers: { name: string; personalNumber: string; amountOre: number }[];
  workOre: number;
  materialOre: number;
  otherOre: number;
  hours: number | null;
  property: RotClaimXmlItem["property"] | null;
  problems: string[];
};

type DemoState = { claims: RotClaim[] };
const g = globalThis as unknown as { __binaafyRot?: DemoState };
const demo = (): DemoState => (g.__binaafyRot ??= { claims: [] });

/** Invoices whose ROT can be claimed, and the ones that are paid but still incomplete. */
export async function listRotCandidates(): Promise<RotCandidate[]> {
  const claimed = new Set((await listClaims()).flatMap((c) => (c.status === "rejected" ? [] : c.items.map((i) => i.invoiceId))));
  const invoices = (await listInvoices()).filter((inv) => inv.kind === "invoice" && inv.rotOre > 0 && inv.status === "paid" && !claimed.has(inv.id));
  const out: RotCandidate[] = [];
  for (const inv of invoices) {
    const t = invoiceTotals(inv.document);
    const rot = inv.document.se.rot;
    const problems: string[] = [];
    if (!rot) continue;
    if (!rot.property) problems.push("Fastighet eller lägenhet saknas.");
    const hours = inv.document.lines.filter((l) => l.kind === "labor" && /^tim/i.test(l.unit)).reduce((s, l) => s + l.quantity, 0);
    const byKind = { labor: 0, material: 0, other: 0 };
    for (const l of inv.document.lines) byKind[l.kind] += t.lines[l.id]?.gross ?? 0;
    const buyers = rot.buyers.map((b, i) => ({ name: b.name, personalNumber: b.personalNumber, amountOre: t.rot?.perBuyer[i] ?? 0 }));
    for (const b of buyers) if (!/^(\d{2})?\d{6}-?\d{4}$/.test(b.personalNumber)) problems.push(`Personnummer saknas för ${b.name || "en köpare"}.`);
    out.push({ invoice: inv, paidOn: (inv.paidAt ?? inv.updatedAt).slice(0, 10), buyers, workOre: byKind.labor, materialOre: byKind.material, otherOre: byKind.other, hours: hours > 0 ? Math.round(hours) : null, property: rot.property, problems });
  }
  return out.sort((a, b) => a.paidOn.localeCompare(b.paidOn));
}

export async function listClaims(): Promise<RotClaim[]> {
  if (isDemo()) return [...demo().claims].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const supabase = await getDb();
  const org = await readOrgId();
  let q = supabase.from("rot_claims").select("*");
  if (org) q = q.eq("org_id", org);
  const { data: claims, error } = await q.order("created_at", { ascending: false });
  if (error) throw new Error(`Kunde inte hämta ROT-begäran: ${error.message}`);
  const ids = (claims ?? []).map((c) => c.id as string);
  if (ids.length === 0) return [];
  const { data: items, error: e2 } = await supabase
    .from("rot_claim_items")
    .select("id, claim_id, invoice_id, amount_ore, work_ore, paid_on, status, rot_buyers(name, personal_number, property, category), invoices(number)")
    .in("claim_id", ids);
  if (e2) throw new Error(`Kunde inte hämta ROT-ärenden: ${e2.message}`);
  type ItemRow = { id: string; claim_id: string; invoice_id: string; amount_ore: number; work_ore: number; paid_on: string; status: RotClaimItem["status"]; rot_buyers: { name: string; personal_number: string; property: RotClaimXmlItem["property"]; category: RotCategory } | null; invoices: { number: string } | null };
  return (claims ?? []).map((c) => ({
    id: c.id as string,
    name: (c.note as string)?.split("\n")[0] || "ROT-begäran",
    status: c.status as RotClaimStatus,
    sentOn: c.sent_on as string | null,
    decidedOn: c.decided_on as string | null,
    paidOre: Number(c.paid_ore),
    note: c.note as string,
    createdAt: c.created_at as string,
    items: ((items ?? []) as unknown as ItemRow[])
      .filter((i) => i.claim_id === c.id)
      .map((i) => ({
        id: i.id,
        invoiceId: i.invoice_id,
        invoiceNumber: i.invoices?.number ?? "",
        buyerName: i.rot_buyers?.name ?? "",
        personalNumber: i.rot_buyers?.personal_number ?? "",
        amountOre: Number(i.amount_ore),
        workOre: Number(i.work_ore),
        paidOn: i.paid_on,
        status: i.status,
        property: i.rot_buyers?.property ?? { kind: "fastighet", designation: "" },
        category: i.rot_buyers?.category ?? "Bygg",
      })),
  }));
}

export async function getClaim(id: string): Promise<RotClaim | null> {
  return (await listClaims()).find((c) => c.id === id) ?? null;
}

/** A claim from the chosen candidates. Only complete ones are accepted. */
export async function createClaim(name: string, invoiceIds: string[], category: RotCategory, actor: Actor): Promise<string> {
  const candidates = (await listRotCandidates()).filter((c) => invoiceIds.includes(c.invoice.id));
  if (candidates.length === 0) throw new Error("Välj minst en faktura.");
  const incomplete = candidates.filter((c) => c.problems.length);
  if (incomplete.length) throw new Error(`Komplettera först: ${incomplete.map((c) => `faktura ${c.invoice.number}`).join(", ")}.`);
  const items = candidates.flatMap((c) =>
    c.buyers.map((b) => ({
      invoiceId: c.invoice.id,
      invoiceNumber: c.invoice.number ?? "",
      buyerName: b.name,
      personalNumber: b.personalNumber,
      amountOre: b.amountOre,
      workOre: c.workOre,
      paidOn: c.paidOn,
      property: c.property!,
      category,
    }))
  );
  if (items.length > 100) throw new Error("Högst 100 köpare per fil. Dela upp begäran.");

  if (isDemo()) {
    const claim: RotClaim = {
      id: crypto.randomUUID(),
      name,
      status: "draft",
      sentOn: null,
      decidedOn: null,
      paidOre: 0,
      note: name,
      createdAt: new Date().toISOString(),
      items: items.map((i) => ({ id: crypto.randomUUID(), status: "pending", ...i })),
    };
    demo().claims.push(claim);
    demoEvent("rot_claim", claim.id, "rot_claim.created", { name, invoices: items.length }, actor);
    return claim.id;
  }
  const supabase = await getDb();
  const org = await currentOrgId();
  const { data: claim, error } = await supabase.from("rot_claims").insert({ org_id: org, status: "draft", note: name, created_by: actor.kind === "user" ? actor.name : null }).select("id, org_id").single();
  if (error) throw new Error(`Kunde inte skapa begäran: ${error.message}`);
  for (const it of items) {
    const { data: buyer, error: e1 } = await supabase
      .from("rot_buyers")
      .insert({ org_id: org, invoice_id: it.invoiceId, name: it.buyerName, personal_number: it.personalNumber, share_ore: it.amountOre, property: it.property, category: it.category })
      .select("id")
      .single();
    if (e1) throw new Error(`Kunde inte spara köparen: ${e1.message}`);
    const { error: e2 } = await supabase.from("rot_claim_items").insert({ org_id: org, claim_id: claim.id, invoice_id: it.invoiceId, buyer_id: buyer.id, amount_ore: it.amountOre, work_ore: it.workOre, paid_on: it.paidOn });
    if (e2) throw new Error(`Kunde inte spara ärendet: ${e2.message}`);
  }
  await supabase.from("events").insert({ org_id: claim.org_id, aggregate_type: "rot_claim", aggregate_id: claim.id, type: "rot_claim.created", data: { name, invoices: items.length }, actor });
  return claim.id as string;
}

/** The XML input for a claim; the admin downloads the rendered file. */
export function claimToXml(claim: RotClaim, today = todayIso()): RotClaimXml {
  return {
    name: claim.name.slice(0, 16),
    items: claim.items.map((it) => {
      const inv = null;
      void inv;
      const workKr = Math.round(it.workOre / 100);
      const requestedKr = Math.round(it.amountOre / 100);
      return {
        personalNumber: toTwelveDigitPersonalNumber(it.personalNumber, today),
        paidOn: it.paidOn,
        workPriceKr: workKr,
        paidKr: Math.max(0, workKr - requestedKr),
        requestedKr,
        invoiceNumber: it.invoiceNumber,
        property: it.property,
        work: [{ category: it.category, hours: null, materialKr: 0 }],
        otherCostKr: 0,
      };
    }),
  };
}

/** Richer XML input when the invoices are at hand: hours, material and other costs per case. */
export async function claimToXmlWithInvoices(claim: RotClaim, today = todayIso()): Promise<RotClaimXml> {
  const invoices = await listInvoices();
  const base = claimToXml(claim, today);
  base.items = base.items.map((item, i) => {
    const inv = invoices.find((x) => x.id === claim.items[i].invoiceId);
    if (!inv) return item;
    const t = invoiceTotals(inv.document);
    const byKind = { labor: 0, material: 0, other: 0 };
    for (const l of inv.document.lines) byKind[l.kind] += t.lines[l.id]?.gross ?? 0;
    const hours = inv.document.lines.filter((l) => l.kind === "labor" && /^tim/i.test(l.unit)).reduce((s, l) => s + l.quantity, 0);
    const buyers = claim.items.filter((x) => x.invoiceId === inv.id).length;
    // Material and other costs are per invoice; with several buyers they are split evenly.
    return {
      ...item,
      work: [{ category: claim.items[i].category, hours: hours > 0 ? Math.round(hours / buyers) : null, materialKr: Math.round(byKind.material / 100 / buyers) }],
      otherCostKr: Math.round(byKind.other / 100 / buyers),
      workPriceKr: Math.round(byKind.labor / 100 / buyers),
      paidKr: Math.max(0, Math.round(byKind.labor / 100 / buyers) - item.requestedKr),
    };
  });
  return base;
}

export async function markClaimSent(id: string, actor: Actor): Promise<void> {
  if (isDemo()) {
    const c = demo().claims.find((x) => x.id === id);
    if (!c) throw new Error("Begäran finns inte.");
    c.status = "sent";
    c.sentOn = todayIso();
    demoEvent("rot_claim", id, "rot_claim.sent", { items: c.items.length }, actor);
    for (const it of c.items) demoEvent("invoice", it.invoiceId, "rot_claim.sent", { claim: id, amount: it.amountOre }, actor);
    return;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.from("rot_claims").update({ status: "sent", sent_on: todayIso() }).eq("id", id).eq("org_id", await currentOrgId()).eq("status", "draft").select("org_id");
  if (error) throw new Error(`Kunde inte markera som skickad: ${error.message}`);
  if (!data?.length) throw new Error("Begäran är redan skickad eller finns inte.");
  const claim = await getClaim(id);
  const rows = [{ org_id: data[0].org_id, aggregate_type: "rot_claim", aggregate_id: id, type: "rot_claim.sent", data: { items: claim?.items.length ?? 0 }, actor }];
  for (const it of claim?.items ?? []) rows.push({ org_id: data[0].org_id, aggregate_type: "invoice", aggregate_id: it.invoiceId, type: "rot_claim.sent", data: { claim: id, amount: it.amountOre } as never, actor });
  await supabase.from("events").insert(rows);
}

export async function registerClaimPayout(id: string, amountOre: number, paidOn: string, actor: Actor): Promise<void> {
  const claim = await getClaim(id);
  if (!claim) throw new Error("Begäran finns inte.");
  if (claim.status !== "sent") throw new Error(`Begäran är ${ROT_CLAIM_STATUS_LABEL[claim.status].toLowerCase()}, inte skickad.`);
  const posting: Posting = postPayment({ paymentId: id, amount: amountOre, method: "rot", date: paidOn, text: `Utbetalning ROT från Skatteverket, ${claim.name}` }, isDemo() ? undefined : await currentChart());
  if (isDemo()) {
    const c = demo().claims.find((x) => x.id === id)!;
    c.status = "paid";
    c.decidedOn = paidOn;
    c.paidOre = amountOre;
    for (const it of c.items) it.status = "paid";
    demoEvent("rot_claim", id, "rot_claim.paid", { amount: amountOre, paidOn }, actor);
    for (const it of c.items) demoEvent("invoice", it.invoiceId, "rot_claim.paid", { claim: id, amount: it.amountOre, paidOn }, actor);
    demoJournalEntries().push({ id: crypto.randomUUID(), number: `${paidOn.slice(0, 4)}-rot`, ...posting });
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.rpc("register_rot_payout", { p_claim: id, p_amount: amountOre, p_paid_on: paidOn, p_posting: posting, p_note: "", p_actor: actor });
  if (error) throw new Error(`Kunde inte registrera utbetalningen: ${error.message}`);
}

export async function rejectClaim(id: string, note: string, actor: Actor): Promise<void> {
  if (isDemo()) {
    const c = demo().claims.find((x) => x.id === id);
    if (!c) throw new Error("Begäran finns inte.");
    c.status = "rejected";
    c.decidedOn = todayIso();
    c.note = note;
    for (const it of c.items) it.status = "rejected";
    demoEvent("rot_claim", id, "rot_claim.rejected", { note }, actor);
    for (const it of c.items) demoEvent("invoice", it.invoiceId, "rot_claim.rejected", { claim: id, amount: it.amountOre, note }, actor);
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.rpc("reject_rot_claim", { p_claim: id, p_note: note, p_actor: actor });
  if (error) throw new Error(`Kunde inte markera som avvisad: ${error.message}`);
}

/** Sums for the dashboard and the invoice list: claimed and waiting, and claimable now. */
export async function rotSummary(): Promise<{ sentOre: number; claimableOre: number; claimableCount: number; nextDeadline: string | null }> {
  const [claims, candidates] = await Promise.all([listClaims(), listRotCandidates()]);
  const sentOre = claims.filter((c) => c.status === "sent").reduce((s, c) => s + c.items.reduce((x, i) => x + i.amountOre, 0), 0);
  const ready = candidates.filter((c) => c.problems.length === 0);
  const years = [...new Set(ready.map((c) => c.paidOn.slice(0, 4)))].sort();
  const nextDeadline = years.length ? `${Number(years[0]) + 1}-${rulesAt(todayIso()).rotClaim.deadlineMonthDay}` : null;
  return { sentOre, claimableOre: ready.reduce((s, c) => s + c.invoice.rotOre, 0), claimableCount: ready.length, nextDeadline };
}

function demoEvent(aggregateType: "rot_claim" | "invoice", aggregateId: string, type: "rot_claim.created" | "rot_claim.sent" | "rot_claim.paid" | "rot_claim.rejected", data: Record<string, string | number | boolean | null>, actor: Actor) {
  const g2 = globalThis as unknown as { __binaafyInvoices?: { events: unknown[] } };
  g2.__binaafyInvoices?.events.push({ id: crypto.randomUUID(), ...makeEvent({ orgId: "demo", aggregateType, aggregateId, type, data, actor }) });
}
