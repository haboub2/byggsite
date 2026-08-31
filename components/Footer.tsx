import Link from "next/link";
import { Icon } from "./Icons";
import { site } from "@/lib/placeholder";

type Division = "bygg" | "01" | "hub";

const HOME: Record<Division, string> = { bygg: "/bygg", "01": "/01", hub: "/" };

export default function Footer({ division }: { division: Division }) {
  const year = new Date().getFullYear();
  const tel = `tel:${site.contact.phone}`;

  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <Link href={HOME[division]} className="logo logo--light">
            <span className="logo-mark" aria-hidden="true">
              <Icon name="house" strokeWidth={2} />
            </span>
            <span className="logo-text">
              Byggly<strong>&nbsp;01</strong>
            </span>
          </Link>
          <p>
            Bygg &amp; renovering gjort på rätt sätt — kvalitetshantverk du kan lita på.
            01 är mjukvarugrenen i samma företag.
          </p>
        </div>

        <div className="footer-col">
          <h4>Tjänster</h4>
          <Link href="/tjanster/totalrenovering">Totalrenovering</Link>
          <Link href="/tjanster/badrumsrenovering">Badrum</Link>
          <Link href="/tjanster/koksrenovering">Kök</Link>
          <Link href="/tjanster/tillbyggnad">Tillbyggnad</Link>
        </div>

        <div className="footer-col">
          <h4>Företag</h4>
          <Link href="/om-oss">Om oss</Link>
          <Link href="/projekt">Projekt</Link>
          <Link href="/kontakt">Kontakt</Link>
          <Link href="/offert">Begär offert</Link>
          <Link href="/01">01 Mjukvara</Link>
        </div>

        <div className="footer-col">
          <h4>Kontakt</h4>
          <a href={tel}>{site.contact.phoneDisplay}</a>
          <a href={`mailto:${site.contact.email}`}>{site.contact.email}</a>
          <span>{site.contact.address}</span>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {year} Byggly 01. Alla rättigheter förbehållna.</span>
        <span>
          Licensierad &amp; försäkrad · <Link href="/integritetspolicy">Integritetspolicy</Link>
        </span>
      </div>
    </footer>
  );
}
