import Link from "next/link";
import { site, services } from "@/lib/placeholder";
import { softwareAreas } from "@/lib/software-content";
import { projectsReady } from "@/lib/projects";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="ftr">
      <div className="container ftr-grid">
        <div className="ftr-brand">
          <img src="/brand/binaafy-light.svg" alt="Binaafy" width={121} height={28} />
          <p>Ett företag, två verksamheter. Vi bygger hus i Halland och system för verksamheter i hela Sverige.</p>
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
        </div>

        <div className="ftr-col">
          <h4>Företaget</h4>
          <Link href="/om-oss">Om oss</Link>
          <Link href="/guider">Guider</Link>
          {projectsReady() && <Link href="/bygg/projekt">Projekt</Link>}
          <Link href="/kontakt">Kontakt</Link>
          <Link href="/bygg/offert">Begär offert</Link>
          <Link href="/mjukvara/brief">Skicka brief</Link>
        </div>

        <div className="ftr-col">
          <h4>Kontakt</h4>
          <a href={`tel:${site.contact.phone}`}>{site.contact.phoneDisplay}</a>
          <a href={`mailto:${site.contact.email}`}>{site.contact.email}</a>
          <span>{site.contact.address}</span>
          <span>{site.contact.hours}</span>
        </div>
      </div>
      <div className="container ftr-bottom">
        <span>© {year} {site.brand}. F-skatt, ansvarsförsäkring och ID06.</span>
        <Link href="/integritetspolicy">Integritetspolicy</Link>
      </div>
    </footer>
  );
}
