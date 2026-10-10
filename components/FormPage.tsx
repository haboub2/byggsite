import Reveal from "./Reveal";
import LeadForm from "./LeadForm";
import { Crumbs, Checklist } from "./Sections";
import { getContent } from "@/lib/content/store";

/** Shared layout for the offert, brief and contact forms. */
export default async function FormPage({
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
  const { company } = await getContent();
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
            <LeadForm
              variant={variant}
              defaultService={defaultService}
              contact={{ phoneDisplay: company.phoneDisplay, email: company.email }}
            />
          </Reveal>
          <Reveal className="form-aside">
            {benefits && <Checklist items={benefits} className="benefits" />}
            {children ?? (
              <div className="contact-card">
                <p>Vill du hellre prata?</p>
                <a href={`tel:${company.phone}`} className="big">
                  {company.phoneDisplay}
                </a>
                <a href={`mailto:${company.email}`}>{company.email}</a>
              </div>
            )}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
