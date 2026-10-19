import Link from "next/link";
import { ignoreTransactionAction, importBankFileAction, registerMatchAction } from "@/app/admin/bank-actions";
import { formatOre } from "@/lib/core/money";
import { isOpen, listInvoices } from "@/lib/core/invoices/store";
import { listBankTransactions, suggestMatches } from "@/lib/core/payments/store";

const kr = (ore: number) => formatOre(ore, { decimals: 0, currency: true });
const CONF: Record<string, string> = { ocr: "OCR stämmer", number: "Fakturanumret står i meddelandet", "amount+name": "Belopp och namn stämmer", amount: "Bara beloppet stämmer" };

/** Bankgiro Inbetalningar: read the bank's camt.054 file, confirm the matches. */
export default async function BankPage({ searchParams }: { searchParams: Promise<{ fel?: string; ok?: string }> }) {
  const { fel, ok } = await searchParams;
  const [suggestions, handled, openInvoices] = await Promise.all([suggestMatches(), listBankTransactions("matched"), listInvoices({ tab: "open" })]);
  const open = openInvoices.filter(isOpen);

  return (
    <section className="sec sec--tight">
      <div className="container">
        <Link href="/admin/fakturor" className="link-quiet">
          ← Alla fakturor
        </Link>
        <div className="inbox-head" style={{ marginTop: 16 }}>
          <div>
            <span className="eyebrow">Fakturor</span>
            <h1 className="admin-h1">Inbetalningar från banken</h1>
            <p className="admin-intro">
              Hämta rapportfilen för Bankgiro Inbetalningar i internetbanken (ISO 20022 camt.054, formatet som ersätter BgMax efter 27 november 2026) och läs in den här. Varje inbetalning får ett förslag, säkrast när OCR-numret stämmer; inget bokförs förrän du klickar Registrera.
            </p>
          </div>
        </div>
        {fel && (
          <p className="form-feedback error" role="alert" style={{ marginTop: 14 }}>
            {fel}
          </p>
        )}
        {ok && <p className="admin-flash">{ok}</p>}

        <form action={importBankFileAction} className="portal-phase-add" encType="multipart/form-data" style={{ marginTop: 20 }}>
          <input type="file" name="file" accept=".xml,application/xml,text/xml" required aria-label="camt.054-fil" />
          <button type="submit" className="btn btn-primary">
            Läs in filen
          </button>
        </form>

        <h2 className="admin-h2" style={{ marginTop: 32 }}>
          Att matcha
        </h2>
        {suggestions.length === 0 ? (
          <div className="inbox-empty">
            <p>Inga omatchade inbetalningar. Läs in nästa fil från banken när den kommer.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Bokförd</th>
                  <th>Från</th>
                  <th>Referens</th>
                  <th style={{ textAlign: "right" }}>Belopp</th>
                  <th>Förslag</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map(({ tx, match, invoice }) => (
                  <tr key={tx.id}>
                    <td>{tx.bookedOn}</td>
                    <td>
                      {tx.counterpart || <span className="inv-muted">okänd</span>}
                      {tx.message ? <div className="inv-muted" style={{ fontSize: 12.5 }}>{tx.message}</div> : null}
                    </td>
                    <td>{tx.reference || <span className="inv-muted">–</span>}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{kr(tx.amountOre)}</td>
                    <td>
                      {match && invoice ? (
                        <>
                          <Link href={`/admin/fakturor/${invoice.id}`} className="link-quiet">
                            Faktura {invoice.number}
                          </Link>{" "}
                          · {invoice.buyerName}
                          <div className="inv-muted" style={{ fontSize: 12.5 }}>
                            {CONF[match.confidence]}
                            {match.differenceOre < 0 ? ` · delbetalning, ${kr(-match.differenceOre)} kvar` : match.differenceOre > 0 ? ` · ${kr(match.differenceOre)} för mycket` : ""}
                          </div>
                        </>
                      ) : (
                        <span className="inv-muted">Inget förslag</span>
                      )}
                    </td>
                    <td>
                      <form action={registerMatchAction} className="chips-add" style={{ marginTop: 0, flexWrap: "wrap" }}>
                        <input type="hidden" name="tx" value={tx.id} />
                        <select name="invoice" defaultValue={match?.invoiceId ?? ""} aria-label="Faktura" style={{ minHeight: 38, fontSize: 13.5 }}>
                          <option value="">Välj faktura…</option>
                          {open.map((inv) => (
                            <option key={inv.id} value={inv.id}>
                              {inv.number} · {inv.document.buyer.name} · {kr(inv.payableOre - inv.paidOre)}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className={`btn ${match ? "btn-primary" : "btn-ghost"}`} style={{ minHeight: 38, fontSize: 13.5 }}>
                          Registrera
                        </button>
                      </form>
                      <form action={ignoreTransactionAction} style={{ marginTop: 6 }}>
                        <input type="hidden" name="tx" value={tx.id} />
                        <button type="submit" className="link-quiet" style={{ fontSize: 13 }}>
                          Inte en faktura
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {handled.length > 0 && (
          <>
            <h2 className="admin-h2" style={{ marginTop: 36 }}>
              Matchade
            </h2>
            <ul className="inv-list">
              {handled.slice(0, 30).map((tx) => (
                <li key={tx.id}>
                  <span>
                    {tx.bookedOn} · {tx.counterpart || "okänd"}
                    {tx.reference ? ` · ${tx.reference}` : ""}
                  </span>
                  <strong>{kr(tx.amountOre)}</strong>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
