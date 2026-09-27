"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Förfrågningar", match: (p: string) => p === "/admin" || p.startsWith("/admin/leads") },
  { href: "/admin/innehall/foretaget", label: "Företaget" },
  { href: "/admin/innehall/priser", label: "Priser" },
  { href: "/admin/innehall/garanti", label: "Garanti" },
  { href: "/admin/innehall/projekt", label: "Projekt" },
  { href: "/admin/innehall/team", label: "Team" },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="admin-nav" aria-label="Admin">
      <div className="container">
        {LINKS.map((l) => {
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
