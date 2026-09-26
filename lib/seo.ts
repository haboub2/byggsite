import type { Metadata } from "next";
import { SITE_URL } from "./env";
import { site, services } from "./placeholder";
import { softwareAreas } from "./software-content";

/**
 * SEO helpers: per-page metadata and schema.org JSON-LD.
 * Entities link by @id so search engines and AI answer engines see one
 * company (#org) with two departments: #business (Bygg) and #software.
 */

/** Bump when the site's content meaningfully changes (sitemap lastmod, llms.txt). */
export const CONTENT_UPDATED = "2026-09-26";

export const abs = (path = "/") => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

const ORG = { "@id": abs("/#org") };
const BYGG = { "@id": abs("/#business") };
const SOFTWARE = { "@id": abs("/#software") };

const areasServed = site.areasServed.map((name) => ({ "@type": "AdministrativeArea", name }));

const address = {
  "@type": "PostalAddress",
  streetAddress: "Montörgatan 7",
  postalCode: "302 62",
  addressLocality: "Halmstad",
  addressRegion: "Hallands län",
  addressCountry: "SE",
};

const contactPoint = {
  "@type": "ContactPoint",
  telephone: site.contact.phone,
  email: site.contact.email,
  contactType: "customer service",
  areaServed: "SE",
  availableLanguage: ["Swedish", "English"],
};

/**
 * Page metadata with canonical URL, Open Graph and Twitter card. Next merges
 * openGraph shallowly, so every page sets the full object here.
 */
export function pageMetadata({
  title,
  description,
  path,
  image,
  absoluteTitle = false,
  noindex = false,
  type = "website",
}: {
  title: string;
  description: string;
  path: string;
  /** Absolute URL or site-relative path of a 1200×630-ish image. */
  image?: string;
  absoluteTitle?: boolean;
  noindex?: boolean;
  type?: "website" | "article";
}): Metadata {
  // A page-level openGraph object replaces the root one, so fall back to the
  // site-wide share image explicitly.
  const images = [{ url: image ?? "/opengraph-image.png", width: 1200, height: 630, alt: title }];
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type,
      locale: "sv_SE",
      siteName: site.brand,
      url: path,
      title,
      description,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: images.map((i) => i.url),
    },
    ...(noindex && { robots: { index: false, follow: true } }),
  };
}

/** The company. Rendered on every page from the root layout. */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    ...ORG,
    name: site.brand,
    legalName: site.legalName,
    url: abs("/"),
    logo: { "@type": "ImageObject", url: abs("/brand/binaafy-logo.png"), width: 1200, height: 406 },
    image: abs("/brand/binaafy-mark.png"),
    description:
      "Binaafy är ett företag i Halmstad med två verksamheter: bygg och renovering av hem i Halland, och mjukvara — webb, automation och interna system — för företag i hela Sverige.",
    foundingDate: "2026",
    email: site.contact.email,
    telephone: site.contact.phone,
    address,
    contactPoint,
    areaServed: [...areasServed, { "@type": "Country", name: "Sverige" }],
    knowsLanguage: ["sv", "en"],
    department: [BYGG, SOFTWARE],
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": abs("/#website"),
    name: site.brand,
    url: abs("/"),
    inLanguage: "sv-SE",
    publisher: ORG,
  };
}

/** The construction department as a local business. */
export function businessJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": ["HomeAndConstructionBusiness", "GeneralContractor"],
    ...BYGG,
    name: `${site.brand} Bygg`,
    parentOrganization: ORG,
    description:
      "Bygg- och renoveringsfirma i Halmstad: totalrenovering, badrum, kök, tillbyggnad, tak, golv, måleri samt el och VVS. Kostnadsfri offert, fast pris, ROT-avdrag på fakturan och 5 års garanti.",
    url: abs("/"),
    image: abs("/opengraph-image.png"),
    logo: abs("/brand/binaafy-mark.png"),
    telephone: site.contact.phone,
    email: site.contact.email,
    priceRange: "$$",
    currenciesAccepted: "SEK",
    paymentAccepted: "Faktura, Kort, Swish",
    address,
    geo: { "@type": "GeoCoordinates", latitude: 56.6597, longitude: 12.8569 },
    areaServed: areasServed,
    contactPoint,
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: "07:00",
        closes: "16:00",
      },
    ],
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Bygg och renovering",
      itemListElement: services.map((s) => ({
        "@type": "Offer",
        itemOffered: { "@type": "Service", name: s.title, url: abs(`/bygg/tjanster/${s.slug}`) },
      })),
    },
  };
}

/** The software department. */
export function softwareJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    ...SOFTWARE,
    name: `${site.brand} Software`,
    parentOrganization: ORG,
    description:
      "Webbutveckling, kundportaler, automation, systemintegration och interna verksamhetssystem för företag. Fast pris per etapp och egen kod som kunden äger.",
    url: abs("/mjukvara"),
    image: abs("/opengraph-image.png"),
    logo: abs("/brand/binaafy-mark.png"),
    telephone: site.contact.phone,
    email: site.contact.email,
    address,
    areaServed: { "@type": "Country", name: "Sverige" },
    knowsLanguage: ["sv", "en"],
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Mjukvara",
      itemListElement: softwareAreas.map((a) => ({
        "@type": "Offer",
        itemOffered: { "@type": "Service", name: a.title, url: abs(`/mjukvara/tjanster/${a.slug}`) },
      })),
    },
  };
}

export function serviceJsonLd({
  path,
  title,
  description,
  provider,
  image,
}: {
  path: string;
  title: string;
  description: string;
  provider: "bygg" | "software";
  image?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": abs(`${path}#service`),
    serviceType: title,
    name: title,
    description,
    provider: provider === "bygg" ? BYGG : SOFTWARE,
    areaServed: provider === "bygg" ? areasServed : { "@type": "Country", name: "Sverige" },
    url: abs(path),
    ...(image && { image }),
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
      item: abs(item.path),
    })),
  };
}

export function articleJsonLd({
  path,
  title,
  description,
  published,
  modified,
  image,
  about,
}: {
  path: string;
  title: string;
  description: string;
  published: string;
  modified?: string;
  image?: string;
  about?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": abs(`${path}#article`),
    headline: title,
    description,
    inLanguage: "sv-SE",
    datePublished: published,
    dateModified: modified ?? published,
    author: ORG,
    publisher: ORG,
    mainEntityOfPage: abs(path),
    ...(image && { image }),
    ...(about && { about: { "@type": "Thing", name: about } }),
  };
}
