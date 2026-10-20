"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Access } from "@/lib/core/org/roles";
import { signOut } from "@/app/admin/actions";
import OrgSwitcher from "./OrgSwitcher";

/**
 * The admin's one bar: the daily work first (Idag, Inkorg, Offerter,
 * Projekt, Fakturor), money under Ekonomi, everything set up once under the
 * gear. "Ny" creates anything in two clicks, and Ctrl K searches. On a phone
 * the links move to a tab bar at the bottom. What each role sees follows
 * `access`; the proxy and every page check again.
 */

type Item = { href: string; label: string; access: Access; match?: (p: string) => boolean; count?: number; alert?: boolean };

export type AdminTopBarProps = {
  access: Access[];
  counts: { inbox: number; projects: number; invoices: number };
  orgName: string;
  orgId: string;
  orgs: { id: string; name: string }[];
  email: string | null;
  roleLabel: string;
  demo: boolean;
};

const has = (access: Access[], a: Access) => access.includes(a);

export default function AdminTopBar(p: AdminTopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const bar = useRef<HTMLElement>(null);

  // Ctrl K / Cmd K opens the search from anywhere in admin; Escape closes it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === "Escape") {
        setSearchOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!searchOpen) return;
    bar.current?.querySelectorAll("details[open]").forEach((d) => d.removeAttribute("open"));
    input.current?.focus();
  }, [searchOpen]);

  // Close the search and open menus when the page changes.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setSearchOpen(false);
  }
  useEffect(() => {
    bar.current?.querySelectorAll("details[open]").forEach((d) => d.removeAttribute("open"));
  }, [pathname]);

  const main: Item[] = [
    { href: "/admin/idag", label: "Idag", access: "read" },
    { href: "/admin", label: "Inkorg", access: "write", match: (x: string) => x === "/admin" || x.startsWith("/admin/leads"), count: p.counts.inbox },
    { href: "/admin/offerter", label: "Offerter", access: "write" },
    { href: "/admin/projekt", label: "Projekt", access: "write", count: p.counts.projects },
    { href: "/admin/fakturor", label: "Fakturor", access: "read", count: p.counts.invoices, alert: true },
  ].filter((i) => has(p.access, i.access as Access)) as Item[];

  const money: Item[] = [
    { href: "/admin/ekonomi", label: "Översikt", access: "read" },
    { href: "/admin/kunder", label: "Kunder", access: "read" },
    { href: "/admin/rot", label: "ROT och RUT", access: "read" },
    { href: "/admin/fakturor/aterkommande", label: "Återkommande fakturor", access: "write" },
    { href: "/admin/fakturor/bank", label: "Bankfil", access: "write" },
    { href: "/admin/ekonomi/export", label: "Export och bokföring", access: "read" },
  ].filter((i) => has(p.access, i.access as Access)) as Item[];

  const create: Item[] = [
    { href: "/admin/offerter/ny", label: "Offert", access: "write" },
    { href: "/admin/projekt/ny", label: "Projekt", access: "write" },
    { href: "/admin/fakturor/ny", label: "Faktura", access: "write" },
    { href: "/admin/kunder/ny", label: "Kund", access: "write" },
  ].filter((i) => has(p.access, i.access as Access)) as Item[];

  const setup: Item[] = [
    { href: "/admin/innehall/foretaget", label: "Webbplatsen: företaget", access: "site" },
    { href: "/admin/innehall/priser", label: "Webbplatsen: priser", access: "site" },
    { href: "/admin/innehall/projekt", label: "Webbplatsen: projekt", access: "site" },
    { href: "/admin/innehall/case", label: "Webbplatsen: case", access: "site" },
    { href: "/admin/innehall/team", label: "Webbplatsen: team", access: "site" },
    { href: "/admin/innehall/omdomen", label: "Webbplatsen: omdömen", access: "site" },
    { href: "/admin/innehall/garanti", label: "Webbplatsen: garanti", access: "site" },
    { href: "/admin/innehall/offert", label: "Offertuppgifter", access: "site" },
    { href: "/admin/installningar", label: "Inställningar", access: "admin" },
    { href: "/admin/organisation", label: "Organisation och roller", access: "read" },
    { href: "/admin/api", label: "API", access: "admin" },
  ].filter((i) => has(p.access, i.access as Access)) as Item[];

  const isOn = (i: Item) => (i.match ? i.match(pathname) : pathname === i.href || pathname.startsWith(`${i.href}/`));
  const moneyOn = money.some(isOn);

  function search(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/admin/sok?q=${encodeURIComponent(term)}` : "/admin/sok");
  }

  return (
    <>
      <header className="atb" ref={bar}>
        <div className="atb-row">
          <Link href="/admin/idag" className="atb-logo" aria-label="Idag">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/binaafy-light.svg" alt="Binaafy" width={95} height={22} />
          </Link>

          <nav className="atb-nav" aria-label="Admin">
            {main.map((i) => (
              <Link key={i.href} href={i.href} aria-current={isOn(i) ? "page" : undefined}>
                {i.label}
                {i.count ? <span className={i.alert ? "atb-count atb-count--alert" : "atb-count"}>{i.count}</span> : null}
              </Link>
            ))}
            {money.length > 0 && (
              <details className="atb-menu">
                <summary aria-current={moneyOn ? "page" : undefined}>Ekonomi</summary>
                <div className="atb-pop">
                  {money.map((i) => (
                    <Link key={i.href} href={i.href} aria-current={isOn(i) ? "page" : undefined}>
                      {i.label}
                    </Link>
                  ))}
                </div>
              </details>
            )}
          </nav>

          <div className="atb-right">
            <button type="button" className="atb-search" onClick={() => setSearchOpen(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <span className="atb-search-text">Sök kund, offert, projekt</span>
              <kbd>Ctrl K</kbd>
            </button>

            {create.length > 0 && (
              <details className="atb-menu atb-menu--right">
                <summary className="atb-new">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Ny
                </summary>
                <div className="atb-pop">
                  {create.map((i) => (
                    <Link key={i.href} href={i.href}>
                      {i.label}
                    </Link>
                  ))}
                </div>
              </details>
            )}

            <details className="atb-menu atb-menu--right">
              <summary className="atb-gear" aria-label="Inställningar och konto">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.1z" />
                </svg>
              </summary>
              <div className="atb-pop atb-pop--wide">
                <p className="atb-who">
                  <strong>{p.orgName}</strong>
                  <span>
                    {p.email} · {p.roleLabel}
                  </span>
                </p>
                {p.orgs.length > 1 && <OrgSwitcher current={p.orgId} orgs={p.orgs} />}
                {setup.map((i) => (
                  <Link key={i.href} href={i.href} aria-current={isOn(i) ? "page" : undefined}>
                    {i.label}
                  </Link>
                ))}
                {!p.demo && (
                  <form action={signOut}>
                    <button type="submit" className="atb-signout">
                      Logga ut
                    </button>
                  </form>
                )}
              </div>
            </details>
          </div>
        </div>
      </header>

      {searchOpen && (
        <div className="atb-overlay" onClick={() => setSearchOpen(false)}>
          <form className="atb-palette" role="search" onSubmit={search} onClick={(e) => e.stopPropagation()}>
            <label htmlFor="atb-q" className="sr-only">
              Sök
            </label>
            <input id="atb-q" ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Namn, adress, offertnummer, fakturanummer" autoComplete="off" />
            <p className="atb-palette-hint">Enter söker i förfrågningar, offerter, projekt, fakturor och kunder.</p>
            <div className="atb-palette-quick">
              {create.map((i) => (
                <Link key={i.href} href={i.href} onClick={() => setSearchOpen(false)}>
                  Ny {i.label.toLowerCase()}
                </Link>
              ))}
            </div>
          </form>
        </div>
      )}

      {/* Phones: the work links as a tab bar at the bottom. */}
      <nav className="atb-tabs" aria-label="Admin, flikar">
        {main.slice(0, 4).map((i) => (
          <Link key={i.href} href={i.href} aria-current={isOn(i) ? "page" : undefined}>
            <span className="atb-tab-label">{i.label}</span>
            {i.count ? <span className={i.alert ? "atb-count atb-count--alert" : "atb-count"}>{i.count}</span> : null}
          </Link>
        ))}
        {create.length > 0 && (
          <Link href="/admin/projekt" className="atb-tab-photo">
            <span className="atb-tab-label">Foto</span>
          </Link>
        )}
      </nav>
    </>
  );
}
