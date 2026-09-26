import type { Metadata } from "next";
import FormPage from "@/components/FormPage";
import JsonLd from "@/components/JsonLd";
import { breadcrumbJsonLd, pageMetadata, abs } from "@/lib/seo";
import { Icon } from "@/components/Icons";
import { getContent } from "@/lib/content/store";

export async function generateMetadata(): Promise<Metadata> {
  const { company } = await getContent();
  return pageMetadata({
    title: "Kontakta Binaafy i Halmstad",
    description: `Kontakta Binaafy i Halmstad om bygg, renovering eller mjukvara. Ring ${company.phoneDisplay} eller mejla ${company.email}. ${company.hours}.`,
    path: "/kontakt",
  });
}

export default async function KontaktPage() {
  const { company } = await getContent();
  const rows = [
    { icon: "user", label: "Kontaktperson", value: company.contactPerson },
    {
      icon: "phone",
      label: "Ring oss",
      value: company.phoneDisplay,
      href: `tel:${company.phone}`,
    },
    {
      icon: "mail",
      label: "Mejla oss",
      value: company.email,
      href: `mailto:${company.email}`,
    },
    { icon: "pin", label: "Besök oss", value: `${company.street}, ${company.postalCode} ${company.city}` },
    { icon: "clock", label: "Öppettider", value: company.hours },
  ];

  return (
    <>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "ContactPage",
            url: abs("/kontakt"),
            about: { "@id": abs("/#org") },
          },
          breadcrumbJsonLd([{ name: "Kontakt", path: "/kontakt" }]),
        ]}
      />
      <FormPage
        crumbs={[{ label: "Kontakt" }]}
        eyebrow="Hör av dig"
        title="Bygg, system eller båda?"
        lead="Frågor om ett projekt eller våra tjänster? Skriv till oss så svarar vi snart. Vet du redan vad du vill ha, gå direkt till offert eller brief."
        variant="kontakt"
      >
        <ul className="contact-list">
          {rows.map((r) => (
            <li key={r.label}>
              <Icon name={r.icon} strokeWidth={1.7} />
              <div>
                <strong>{r.label}</strong>
                {r.href ? (
                  <a href={r.href}>{r.value}</a>
                ) : (
                  <span>{r.value}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </FormPage>
    </>
  );
}
