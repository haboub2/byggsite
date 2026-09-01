"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Division = "bygg" | "01" | "hub";

const NAV: Record<Division, { href: string; label: string }[]> = {
  bygg: [
    { href: "/tjanster", label: "Tjänster" },
    { href: "/projekt", label: "Projekt" },
    { href: "/om-oss", label: "Om oss" },
    { href: "/kontakt", label: "Kontakt" },
  ],
  "01": [
    { href: "/01/tjanster", label: "Tjänster" },
    { href: "/01/case", label: "Case" },
    { href: "/01/brief", label: "Brief" },
  ],
  hub: [
    { href: "/bygg", label: "Bygg" },
    { href: "/01", label: "01 Mjukvara" },
    { href: "/om-oss", label: "Om oss" },
    { href: "/kontakt", label: "Kontakt" },
  ],
};

const HOME: Record<Division, string> = { bygg: "/bygg", "01": "/01", hub: "/" };

const CTA: Record<Division, { href: string; label: string }> = {
  bygg: { href: "/offert", label: "Få offert" },
  "01": { href: "/01/brief", label: "Starta projekt" },
  hub: { href: "/kontakt", label: "Kom i kontakt" },
};

export default function Header({
  division,
  dark = false,
}: {
  division: Division;
  /** Force dark/translucent chrome regardless of the division's tokens — for pages with a dark photo hero under the nav (e.g. the hub landing page). */
  dark?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const home = HOME[division];
  const cta = CTA[division];

  return (
    <header
      className={`site-header${scrolled ? " scrolled" : ""}${dark ? " site-header--dark" : ""}`}
      id="top"
    >
      <div className="container header-inner">
        <Link href={home} className="logo" aria-label="Byggly 01 hem">
          <span className="logo-badge">
            <img src="/brand/logo.png" alt="" />
          </span>
        </Link>

        <nav
          className={`main-nav${open ? " open" : ""}`}
          id="mainNav"
          aria-label="Huvudmeny"
          onClick={(e) => {
            if ((e.target as HTMLElement).tagName === "A") setOpen(false);
          }}
        >
          {division === "01" && (
            <Link href="/bygg" className="nav-cross">
              ← Byggly Bygg
            </Link>
          )}
          {NAV[division].map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
          {division === "bygg" && (
            <Link href="/01" className="nav-cross">
              01 Mjukvara →
            </Link>
          )}
          <Link href={cta.href} className="nav-cta">
            {cta.label}
          </Link>
        </nav>

        <button
          className="nav-toggle"
          id="navToggle"
          aria-label="Växla meny"
          aria-expanded={open}
          aria-controls="mainNav"
          onClick={() => setOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
    </header>
  );
}
