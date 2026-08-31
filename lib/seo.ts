import { SITE_URL } from "./env";
import { site } from "./placeholder";

/** GeneralContractor (bygg) — @id {site}/#business */
export function businessJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "GeneralContractor",
    "@id": `${SITE_URL}/#business`,
    name: "Byggly",
    legalName: "Byggly 01",
    slogan: "Kvalitetshantverk i tid och inom budget",
    description:
      "Bygg- och renoveringsfirma i Halmstad som utför totalrenovering, badrum, kök, tillbyggnad, takarbeten, golvläggning, måleri samt el och VVS. Kostnadsfri offert, fast pris och 5 års garanti.",
    url: `${SITE_URL}/bygg`,
    telephone: site.contact.phone,
    email: site.contact.email,
    priceRange: "$$",
    currenciesAccepted: "SEK",
    paymentAccepted: "Faktura, Kort, Swish",
    knowsLanguage: ["sv", "en"],
    foundingDate: "2026",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Montörgatan 7",
      postalCode: "302 62",
      addressLocality: "Halmstad",
      addressRegion: "Hallands län",
      addressCountry: "SE",
    },
    geo: { "@type": "GeoCoordinates", latitude: 56.6597, longitude: 12.8569 },
    areaServed: site.areasServed.map((name) => ({ "@type": "AdministrativeArea", name })),
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "07:00",
        closes: "16:00",
      },
    ],
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Byggly 01",
    url: `${SITE_URL}/`,
    inLanguage: "sv-SE",
  };
}

/** ProfessionalService (01) — @id {site}/#software, department of #org */
export function softwareJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "@id": `${SITE_URL}/#software`,
    name: "01 av Byggly",
    serviceType: "Software development",
    url: `${SITE_URL}/01`,
    parentOrganization: { "@id": `${SITE_URL}/#org` },
    areaServed: "SE",
    knowsLanguage: ["sv", "en"],
  };
}
