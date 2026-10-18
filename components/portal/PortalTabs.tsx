"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { seg: "", label: "Översikt", icon: "M3 11 12 3l9 8M5 10v10h14V10" },
  { seg: "tidplan", label: "Tidplan", icon: "M4 6h16M4 12h10M4 18h7" },
  { seg: "foton", label: "Foton", icon: "M4 7h3l2-3h6l2 3h3v12H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" },
  { seg: "dokument", label: "Dokument", icon: "M7 3h7l5 5v13H7zM14 3v5h5M9 13h6M9 17h6" },
];

/** The four tabs: a row at the bottom on phones (like an app), a side menu on desktop. */
export default function PortalTabs({ id }: { id: string }) {
  const pathname = usePathname();
  const base = `/mitt-projekt/${id}`;
  return (
    <nav className="portal-tabs" aria-label="Projektet">
      {TABS.map((t) => {
        const href = t.seg ? `${base}/${t.seg}` : base;
        const current = t.seg ? pathname.startsWith(href) : pathname === base;
        return (
          <Link key={t.seg} href={href} aria-current={current ? "page" : undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={t.icon} />
            </svg>
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
