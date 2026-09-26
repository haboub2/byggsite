"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SIDES, sideFromPath, counterpartPath } from "@/lib/sides";

const SHARED_NAV = [
  { label: "Bygg", href: "/" },
  { label: "Software", href: "/mjukvara" },
  { label: "Om oss", href: "/om-oss" },
  { label: "Kontakt", href: "/kontakt" },
];

export default function Header({ showProjects = false }: { showProjects?: boolean }) {
  const pathname = usePathname();
  const side = sideFromPath(pathname);
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);

  // Close the mobile menu whenever the route changes.
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const cfg = side ? SIDES[side] : null;
  const nav = (cfg ? cfg.nav : SHARED_NAV).filter((n) => showProjects || n.href !== "/bygg/projekt");
  const cta = cfg ? cfg.cta : { label: "Kontakta oss", href: "/kontakt" };
  const isCurrent = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="hdr">
      <div className="container hdr-inner">
        <Link href={cfg ? cfg.home : "/"} className="hdr-logo" aria-label="Binaafy — startsida">
          <img src="/brand/binaafy-light.svg" alt="Binaafy" width={112} height={26} />
        </Link>

        <nav className="side-marker" aria-label="Välj verksamhet">
          <Link
            href={counterpartPath(pathname, "bygg", showProjects)}
            aria-current={side === "bygg" ? "true" : undefined}
          >
            Bygg
          </Link>
          <span className="dot" aria-hidden="true">·</span>
          <Link
            href={counterpartPath(pathname, "mjukvara")}
            aria-current={side === "mjukvara" ? "true" : undefined}
          >
            Software
          </Link>
        </nav>

        <nav id="hdr-nav" className={`hdr-nav${open ? " open" : ""}`} aria-label="Huvudmeny">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isCurrent(item.href) ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
          <Link href={cta.href} className="btn btn-primary">
            {cta.label}
          </Link>
        </nav>

        <button
          type="button"
          className="hdr-toggle"
          aria-label="Meny"
          aria-expanded={open}
          aria-controls="hdr-nav"
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
