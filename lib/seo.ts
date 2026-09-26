import { SITE_URL } from "./env";
import { site } from "./placeholder";

/** GeneralContractor (bygg) — @id {site}/#business */
export function businessJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "GeneralContractor",
    "@id": `${SITE_URL}/#business`,
    name: "Binaafy Bygg",
    legalName: site.legalName,
    parentOrganization: { "@id": `${SITE_URL}/#org` },
    slogan: "Kvalitetshantverk i tid och inom budget",
    description:
      "Bygg- och renoveringsfirma i Halmstad som utför totalrenovering, badrum, kök, tillbyggnad, takarbeten, golvläggning, måleri samt el och VVS. Kostnadsfri offert, fast pris och 5 års garanti.",
    url: `${SITE_URL}/`,
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
    name: site.brand,
    url: `${SITE_URL}/`,
    inLanguage: "sv-SE",
  };
}

/** Service — per service page on either side */
export function serviceJsonLd({
  path,
  title,
  description,
  provider,
}: {
  path: string;
  title: string;
  description: string;
  provider: "bygg" | "software";
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    serviceType: title,
    name: title,
    description,
    provider: { "@id": `${SITE_URL}/${provider === "bygg" ? "#business" : "#software"}` },
    areaServed:
      provider === "bygg"
        ? site.areasServed.map((name) => ({ "@type": "AdministrativeArea", name }))
        : { "@type": "Country", name: "Sverige" },
    url: `${SITE_URL}${path}`,
  };
}

export function faqJsonLd(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}

/** ProfessionalService (Software) — @id {site}/#software, department of #org */
export function softwareJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "@id": `${SITE_URL}/#software`,
    name: "Binaafy Software",
    serviceType: "Software development",
    url: `${SITE_URL}/mjukvara`,
    parentOrganization: { "@id": `${SITE_URL}/#org` },
    areaServed: "SE",
    knowsLanguage: ["sv", "en"],
  };
}

/** The company itself — both sides are departments of it. */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#org`,
    name: site.brand,
    legalName: site.legalName,
    foundingDate: "2026",
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/brand/binaafy.svg`,
    email: site.contact.email,
    telephone: site.contact.phone,
    department: [{ "@id": `${SITE_URL}/#business` }, { "@id": `${SITE_URL}/#software` }],
  };
}
