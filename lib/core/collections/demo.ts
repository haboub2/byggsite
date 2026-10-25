import type { CollectionStatus } from "./collections";

/**
 * The collection_cases table (0031) in memory for demo mode. Its own module
 * without imports from the stores, so the invoice store can close a case
 * when a demo payment settles the invoice, as the trigger does in the
 * database.
 */

export type CollectionCaseRow = {
  id: string;
  org_id: string;
  invoice_id: string;
  reference: string;
  status: CollectionStatus;
  agency: string;
  external_ref: string;
  capital_ore: number;
  interest_ore: number;
  fees_ore: number;
  interest_to: string;
  note: string;
  sent_at: string | null;
  closed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const g = globalThis as unknown as { __binaafyCollections?: CollectionCaseRow[] };

export function demoCollectionCases(): CollectionCaseRow[] {
  return (g.__binaafyCollections ??= []);
}
