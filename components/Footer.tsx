import Link from "next/link";
import { services } from "@/lib/placeholder";
import { getContent } from "@/lib/content/store";
import type { Company } from "@/lib/content/schema";
import { softwareAreas } from "@/lib/software-content";
import { projectsReady } from "@/lib/projects";
import { PRODUCT_NAME, PRODUCT_PATH } from "@/lib/product";
import CookieSettingsLink from "@/components/CookieSettingsLink";

type Props = {
  /** Passed by the 404 page, which reads them from a cache; otherwise read here. */
  company?: Company;
  /** Momsregistreringsnummer (quote.vatNumber in the content store); read here when not passed. */
  vatNumber?: string;
  showProjects?: boolean;
};

export default async function Footer(props: Props = {}) {
  const year = new Date().getFullYear();
  const content = props.company && props.vatNumber !== undefined ? null : await getContent();
  const company = props.company ?? content!.company;
  const vatNumber = props.vatNumber ?? content!.quote.vatNumber;
  const showProjects = props.showProjects ?? (await projectsReady());

  return (
    <footer className="ftr">
      <div className="container ftr-grid">
        <div className="ftr-brand">
          <img src="/brand/binaafy-light.svg" alt="Binaafy" width={121} height={28} />
          <p>Ett företag, två verksamheter. Vi bygger och renoverar hem i södra och västra Sverige och bygger system för verksamheter i hela Sverige.</p>
        </div>

        <div className="ftr-col">
          <h4>Bygg</h4>
          {services.slice(0, 5).map((s) => (
            <Link key={s.slug} href={`/bygg/tjanster/${s.slug}`}>
              {s.title}
            </Link>
          ))}
          <Link href="/bygg/tjanster">Alla tjänster</Link>
        </div>

        <div className="ftr-col">
          <h4>Software</h4>
          {softwareAreas.map((a) => (
            <Link key={a.slug} href={`/mjukvara/tjanster/${a.slug}`}>
              {a.title}
            </Link>
          ))}
          <Link href="/mjukvara/case">Case</Link>
          <h4>För byggföretag</h4>
          <Link href={PRODUCT_PATH}>{PRODUCT_NAME}</Link>
        </div>

        <div className="ftr-col">
          <h4>Företaget</h4>
          <Link href="/om-oss">Om oss</Link>
          <Link href="/referenser">Referenser</Link>
          <Link href="/omdomen">Omdömen</Link>
          <Link href="/guider">Guider</Link>
          {showProjects && <Link href="/bygg/projekt">Projekt</Link>}
          <Link href="/kontakt">Kontakt</Link>
          <Link href="/bygg/offert">Begär offert</Link>
          <Link href="/mjukvara/brief">Skicka brief</Link>
        </div>

        <div className="ftr-col">
          <h4>Kontakt</h4>
          <a href={`tel:${company.phone}`}>{company.phoneDisplay}</a>
          <a href={`mailto:${company.email}`}>{company.email}</a>
          <span>
            {company.street}, {company.postalCode} {company.city}
          </span>
          <span>{company.hours}</span>
        </div>
      </div>
      <div className="container ftr-bottom">
        {/* E-handelslagen 8 §: name, org.nr and VAT nr next to the address and e-mail above. */}
        <span>
          © {year} {company.legalName}
          {company.orgNr ? `, org.nr ${company.orgNr}` : ""}
          {vatNumber ? `, Momsreg.nr ${vatNumber}` : ""}.
        </span>
        <nav className="ftr-legal" aria-label="Juridik">
          <Link href="/villkor">Villkor</Link>
          <Link href="/integritetspolicy">Integritetspolicy</Link>
          <CookieSettingsLink />
        </nav>
      </div>
    </footer>
  );
}
