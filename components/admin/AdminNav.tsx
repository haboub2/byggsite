"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Access } from "@/lib/core/org/roles";

type NavLink = { href: string; label: string; access: Access; match?: (p: string) => boolean };

// What each role sees; the proxy and every action check the same again.
const LINKS: NavLink[] = [
  { href: "/admin/ekonomi", label: "Ekonomi", access: "read" },
  { href: "/admin", label: "Förfrågningar", access: "write", match: (p: string) => p === "/admin" || p.startsWith("/admin/leads") },
  { href: "/admin/offerter", label: "Offerter", access: "write" },
  { href: "/admin/fakturor", label: "Fakturor", access: "read" },
  { href: "/admin/kunder", label: "Kunder", access: "read" },
  { href: "/admin/rot", label: "ROT", access: "read" },
  { href: "/admin/projekt", label: "Byggprojekt", access: "write" },
  { href: "/admin/installningar", label: "Inställningar", access: "admin" },
  { href: "/admin/organisation", label: "Organisation", access: "read" },
  { href: "/admin/api", label: "API", access: "admin" },
  { href: "/admin/innehall/foretaget", label: "Företaget", access: "admin" },
  { href: "/admin/innehall/priser", label: "Priser", access: "admin" },
  { href: "/admin/innehall/garanti", label: "Garanti", access: "admin" },
  { href: "/admin/innehall/projekt", label: "Projekt", access: "admin" },
  { href: "/admin/innehall/case", label: "Case", access: "admin" },
  { href: "/admin/innehall/team", label: "Team", access: "admin" },
  { href: "/admin/innehall/omdomen", label: "Omdömen", access: "admin" },
  { href: "/admin/innehall/offert", label: "Offertuppgifter", access: "admin" },
];

export default function AdminNav({ access }: { access: Access[] }) {
  const pathname = usePathname();
  return (
    <nav className="admin-nav" aria-label="Admin">
      <div className="container">
        {LINKS.filter((l) => access.includes(l.access)).map((l) => {
          const current = l.match ? l.match(pathname) : pathname.startsWith(l.href);
          return (
            <Link key={l.href} href={l.href} aria-current={current ? "page" : undefined}>
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
