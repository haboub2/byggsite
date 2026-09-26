import type { Metadata } from "next";
import FormPage from "@/components/FormPage";
import JsonLd from "@/components/JsonLd";
import { breadcrumbJsonLd, pageMetadata, abs } from "@/lib/seo";
import { Icon } from "@/components/Icons";
import { site } from "@/lib/placeholder";

export const metadata: Metadata = pageMetadata({
  title: "Kontakta Binaafy i Halmstad",
  description: `Kontakta Binaafy i Halmstad om bygg, renovering eller mjukvara. Ring ${site.contact.phoneDisplay} eller mejla ${site.contact.email}. Vardagar 07–16.`,
  path: "/kontakt",
});

export default function KontaktPage() {
  const rows = [
    { icon: "user", label: "Kontaktperson", value: site.contact.person },
    {
      icon: "phone",
      label: "Ring oss",
      value: site.contact.phoneDisplay,
      href: `tel:${site.contact.phone}`,
    },
    {
      icon: "mail",
      label: "Mejla oss",
      value: site.contact.email,
      href: `mailto:${site.contact.email}`,
    },
    { icon: "pin", label: "Besök oss", value: site.contact.address },
    { icon: "clock", label: "Öppettider", value: site.contact.hours },
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
