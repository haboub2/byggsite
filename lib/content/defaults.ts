import type { ContentMap } from "./schema";
import { site, services, byggStats, team } from "../placeholder";
import { softwareAreas, softwareStats } from "../software-content";
import { priceGuide } from "../pricing";

/**
 * What the site shows until something is saved from /admin, and the fallback
 * if the database can't be reached. Built from the original content modules,
 * so the site looks exactly the same before and after the store is wired in.
 */

const byggWarranty = { short: "5 år", sentence: "5 års garanti på hantverket" };
// Example until the owners decide the Software terms.
const softwareWarranty = { short: "3 mån", sentence: "3 månaders garanti: fel i det vi byggt rättas utan kostnad" };

export const defaultContent: ContentMap = {
  company: {
    legalName: site.legalName,
    orgNr: "",
    street: "Uppstigen 130",
    postalCode: "412 80",
    city: "Göteborg",
    phone: site.contact.phone,
    phoneDisplay: site.contact.phoneDisplay,
    email: site.contact.email,
    hours: site.contact.hours,
    areasServed: [...site.areasServed],
    // The fourth figure on each landing page is the warranty.
    byggStats: byggStats.filter((s) => !s.label.includes("garanti")).slice(0, 3),
    softwareStats: softwareStats.filter((s) => s.value !== "0"),
  },
  pricing: {
    services: Object.fromEntries(
      priceGuide.map((p) => [
        p.slug,
        {
          from: p.from,
          note: p.note,
          example: Boolean(p.preset),
          exampleLabel: p.preset?.label ?? "",
          labor: p.preset?.labor ?? 0,
          material: p.preset?.material ?? 0,
        },
      ])
    ),
  },
  team: {
    members: team.map((m) => ({
      name: m.name,
      role: m.role,
      side: m.division === "01" ? ("software" as const) : ("bygg" as const),
      email: m.email,
      phone: "",
      photo: null,
    })),
  },
  // Empty until the owners add their platforms in /admin: no invented scores.
  reviews: { platforms: [], quotes: [], trustbox: { businessUnitId: "", templateId: "" } },
  warranty: {
    bygg: byggWarranty,
    software: softwareWarranty,
    services: {
      ...Object.fromEntries(services.map((s) => [s.slug, { ...byggWarranty }])),
      ...Object.fromEntries(softwareAreas.map((a) => [a.slug, { ...softwareWarranty }])),
    },
  },
};
