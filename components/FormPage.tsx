import Reveal from "./Reveal";
import LeadForm from "./LeadForm";
import { Crumbs, Checklist } from "./Sections";
import { site } from "@/lib/placeholder";

/** Shared layout for the offert, brief and contact forms. */
export default function FormPage({
  crumbs,
  eyebrow,
  title,
  lead,
  benefits,
  variant,
  defaultService,
  children,
}: {
  crumbs: { label: string; href?: string }[];
  eyebrow: string;
  title: string;
  lead: string;
  benefits?: string[];
  variant: "offert" | "brief" | "kontakt";
  defaultService?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="sec">
      <div className="container">
        <Crumbs items={crumbs} light />
        <div className="form-layout">
          <Reveal className="form-intro">
            <span className="eyebrow eyebrow--accent">{eyebrow}</span>
            <h1>{title}</h1>
            <p>{lead}</p>
          </Reveal>
          <Reveal className="form-main">
            <LeadForm variant={variant} defaultService={defaultService} />
          </Reveal>
          <Reveal className="form-aside">
            {benefits && <Checklist items={benefits} className="benefits" />}
            {children ?? (
              <div className="contact-card">
                <p>Vill du hellre prata?</p>
                <a href={`tel:${site.contact.phone}`} className="big">
                  {site.contact.phoneDisplay}
                </a>
                <a href={`mailto:${site.contact.email}`}>{site.contact.email}</a>
              </div>
            )}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
