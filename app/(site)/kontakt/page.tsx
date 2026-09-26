import type { Metadata } from "next";
import FormPage from "@/components/FormPage";
import { Icon } from "@/components/Icons";
import { site } from "@/lib/placeholder";

export const metadata: Metadata = {
  title: "Kontakt",
  description: `Kontakta Binaafy i Halmstad — ${site.contact.phoneDisplay}, ${site.contact.email}.`,
  alternates: { canonical: "/kontakt" },
};

export default function KontaktPage() {
  const rows = [
    { icon: "user", label: "Kontaktperson", value: site.contact.person },
    { icon: "phone", label: "Ring oss", value: site.contact.phoneDisplay, href: `tel:${site.contact.phone}` },
    { icon: "mail", label: "Mejla oss", value: site.contact.email, href: `mailto:${site.contact.email}` },
    { icon: "pin", label: "Besök oss", value: site.contact.address },
    { icon: "clock", label: "Öppettider", value: site.contact.hours },
  ];

  return (
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
              {r.href ? <a href={r.href}>{r.value}</a> : <span>{r.value}</span>}
            </div>
          </li>
        ))}
      </ul>
    </FormPage>
  );
}
