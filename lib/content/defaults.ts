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
  quote: {
    bankgiro: "",
    plusgiro: "",
    iban: "",
    bic: "",
    vatNumber: "",
    fSkatt: true,
    insurance: "Ansvarsförsäkring",
    validDays: 30,
    paymentDays: 30,
    lateInterest: "Referensränta + 8 %",
    signerName: team[0].name,
    signerTitle: "Byggingenjör",
    bygg: {
      intro: "Tack för att vi fick komma på hembesök. Nedan följer vår offert enligt det vi gick igenom tillsammans.",
      payment:
        "Faktureras enligt betalplan: 30 % vid start, 40 % vid halva arbetet och 30 % efter godkänd slutbesiktning. ROT-avdraget dras direkt på fakturan när ni lämnat personnummer och fastighetsbeteckning. Tillkommande arbete (ÄTA) utförs först efter ert godkännande och debiteras enligt överenskommelse.",
      warranty: `${byggWarranty.sentence}. Vi innehar F-skattsedel och ansvarsförsäkring.`,
      excluded:
        "Bygglov, anmälan till bostadsrättsförening och arbeten som inte nämns ovan ingår inte. Tillkommande arbete offereras separat innan det påbörjas.",
      notes:
        "Priserna gäller under offertens giltighetstid. Vi kommer gärna förbi igen om något är oklart innan ni bestämmer er.",
    },
    software: {
      intro: "Tack för ett bra möte. Nedan följer vårt förslag på upplägg och pris. Vi arbetar i etapper med fast pris, så att ni alltid vet vad nästa steg kostar.",
      payment: "Varje etapp faktureras när den är godkänd av er. Arbete utanför offerten utförs först efter ert godkännande och debiteras per timme eller enligt separat offert.",
      warranty: `${softwareWarranty.sentence}. Ni äger all kod och allt innehåll vi tar fram.`,
      excluded: "Licenser och tjänster hos tredje part (domän, hosting, betaltjänster) faktureras av respektive leverantör och ingår inte.",
      notes: "Priserna anges exklusive moms och gäller under offertens giltighetstid.",
    },
  },
  warranty: {
    bygg: byggWarranty,
    software: softwareWarranty,
    services: {
      ...Object.fromEntries(services.map((s) => [s.slug, { ...byggWarranty }])),
      ...Object.fromEntries(softwareAreas.map((a) => [a.slug, { ...softwareWarranty }])),
    },
  },
};
