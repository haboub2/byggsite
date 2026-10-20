import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { hasAccess } from "@/lib/core/org/roles";
import { listLeads } from "@/lib/leads";
import { listQuotes } from "@/lib/quotes/store";
import { listProjects } from "@/lib/portal/store";
import { listInvoices } from "@/lib/core/invoices/store";
import { listCustomers } from "@/lib/core/customers/store";
import { formatOre } from "@/lib/core/money";

export const metadata: Metadata = { title: "Sök" };

const LIMIT = 8;

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

/** One search across the admin: what Ctrl K opens. Each group shows only what the role may see. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const check = await requireRole("read");
  if (!check.ok) redirect("/admin/login");
  const canWrite = hasAccess(check.role, "write", check.site);
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);
  const needle = q.toLowerCase();

  const [leads, quotes, projects, invoices, customers] = q
    ? await Promise.all([
        canWrite ? safe(() => listLeads({ q }, { limit: LIMIT }).then((r) => r.leads), []) : [],
        canWrite ? safe(() => listQuotes({ q }).then((r) => r.slice(0, LIMIT)), []) : [],
        canWrite
          ? safe(
              () =>
                listProjects().then((all) =>
                  all.filter((p) => [p.title, p.customer_name, p.address].join(" ").toLowerCase().includes(needle)).slice(0, LIMIT)
                ),
              []
            )
          : [],
        safe(() => listInvoices({ q }).then((r) => r.slice(0, LIMIT)), []),
        safe(() => listCustomers(q).then((r) => r.slice(0, LIMIT)), []),
      ])
    : [[], [], [], [], []];
  const total = leads.length + quotes.length + projects.length + invoices.length + customers.length;

  return (
    <section className="idag" style={{ maxWidth: 880 }}>
      <form className="sok-form" role="search" action="/admin/sok">
        <label htmlFor="sok-q" className="sr-only">
          Sök
        </label>
        <input id="sok-q" name="q" defaultValue={q} placeholder="Namn, adress, offertnummer, fakturanummer" autoFocus />
        <button type="submit" className="btn btn-primary">
          Sök
        </button>
      </form>

      {q && total === 0 && <p className="idag-empty" style={{ padding: "18px 0" }}>Inget hittades för ”{q}”.</p>}

      {customers.length > 0 && (
        <Group title="Kunder">
          {customers.map((c) => (
            <Link key={c.id} href={`/admin/kunder/${c.id}`}>
              <strong>{c.name}</strong>
              <span>{[c.orgNr, c.email, c.phone].filter(Boolean).join(" · ")}</span>
            </Link>
          ))}
        </Group>
      )}
      {leads.length > 0 && (
        <Group title="Förfrågningar">
          {leads.map((l) => (
            <Link key={l.id} href={`/admin/leads/${l.id}`}>
              <strong>{l.name || l.email || "Förfrågan"}</strong>
              <span>{[l.service, l.email, l.phone].filter(Boolean).join(" · ")}</span>
            </Link>
          ))}
        </Group>
      )}
      {quotes.length > 0 && (
        <Group title="Offerter">
          {quotes.map((x) => (
            <Link key={x.id} href={`/admin/offerter/${x.id}`}>
              <strong>
                Offert {x.number}, {x.data.title || "utan rubrik"}
              </strong>
              <span>{x.data.customer.company || x.data.customer.name}</span>
            </Link>
          ))}
        </Group>
      )}
      {projects.length > 0 && (
        <Group title="Projekt">
          {projects.map((p) => (
            <Link key={p.id} href={`/admin/projekt/${p.id}`}>
              <strong>{p.title}</strong>
              <span>{[p.customer_name, p.address].filter(Boolean).join(" · ")}</span>
            </Link>
          ))}
        </Group>
      )}
      {invoices.length > 0 && (
        <Group title="Fakturor">
          {invoices.map((i) => (
            <Link key={i.id} href={`/admin/fakturor/${i.id}`}>
              <strong>
                Faktura {i.number ?? "utkast"}, {i.document.buyer.name}
              </strong>
              <span>{formatOre(i.payableOre, { decimals: 0, currency: true })}</span>
            </Link>
          ))}
        </Group>
      )}
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="idag-card sok-group">
      <h2 className="idag-label">{title}</h2>
      <div>{children}</div>
    </section>
  );
}
