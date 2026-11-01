import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptanceProblem, emptyCustomer, withQuoteDefaults, type QuoteData } from "./schema";

const data = (patch: Partial<QuoteData>): QuoteData => withQuoteDefaults({ division: "bygg", title: "T", customer: { ...emptyCustomer, type: "privat" }, items: [], date: "2026-10-01", validDays: 30, ...patch } as QuoteData);

test("older rows get a fast pris and no standard terms", () => {
  const d = withQuoteDefaults({ division: "bygg", title: "T", items: [], date: "2026-10-01" } as unknown as QuoteData);
  assert.equal(d.priceType, "fast");
  assert.equal(d.standardTerms, "none");
});

test("acceptance: only a sent, unexpired quote; a consumer's only once it went out (avtalslagen 2–3 §§, distansavtalslagen)", () => {
  const sent = { status: "sent" as const, sent_at: "2026-10-02T10:00:00Z", data: data({}) };
  assert.equal(acceptanceProblem(sent, "2026-10-20"), null);
  assert.match(acceptanceProblem(sent, "2026-11-01")!, /gick ut 2026-10-31/);
  assert.match(acceptanceProblem({ ...sent, status: "draft" }, "2026-10-20")!, /utkast/i);
  assert.match(acceptanceProblem({ ...sent, status: "accepted" }, "2026-10-20")!, /redan accepterad/);
  assert.match(acceptanceProblem({ ...sent, sent_at: null }, "2026-10-20")!, /privatperson/);
  assert.equal(acceptanceProblem({ ...sent, sent_at: null, data: data({ customer: { ...emptyCustomer, type: "foretag" } }) }, "2026-10-20"), null);
});
