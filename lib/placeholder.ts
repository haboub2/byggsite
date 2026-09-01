/* Phase 1 hardcoded content. Replaced by Supabase reads in Phase 2.
   Values mirror data/content.json + the legacy index.html copy. */

import { images } from "./images";

export const site = {
  brand: "Byggly 01",
  bygg: "Byggly",
  contact: {
    person: "Mohamed Al Haboub",
    hours: "Mån–Fre, 07:00–16:00",
    phone: "+46793049737",
    phoneDisplay: "079-304 97 37",
    email: "info@byggly.se",
    address: "Montörgatan 7, 302 62 Halmstad",
  },
  areasServed: ["Halmstad", "Laholm", "Falkenberg", "Hallands län"],
};

export const team = [
  { name: "Ibrahim Al Haboub", role: "Data ingenjör", division: "01" as const },
  { name: "Abdulmalek Alnajjar", role: "Byggingenjör", division: "bygg" as const },
  { name: "Mohamed Al Haboub", role: "Byggingenjör", division: "bygg" as const },
];

export const heroBygg = {
  eyebrow: "Experter på bygg & renovering",
  titleLead: "Vi bygger, renoverar & ",
  titleHl: "förvandlar",
  titleTail: " ditt hem",
  lead: "Från totalrenoveringar till badrum, kök och tillbyggnader — Byggly levererar hantverk du kan lita på, i tid och inom budget.",
  stats: [
    { value: "6+", label: "Års erfarenhet" },
    { value: "100+", label: "Genomförda projekt" },
    { value: "4,9★", label: "Kundbetyg" },
  ],
};

export const trustPoints = [
  "Kostnadsfria offerter",
  "Fast pris",
  "Certifierat team",
  "5 års garanti",
];

export const services = [
  { slug: "totalrenovering", title: "Totalrenovering", desc: "Kompletta renoveringar av hus och lägenheter, skötta från rivning till sista detaljen." },
  { slug: "badrumsrenovering", title: "Badrum", desc: "Tätskikt, kakel, VVS och moderna inredningar för ett badrum byggt för att hålla." },
  { slug: "koksrenovering", title: "Kök", desc: "Skräddarsydd köksdesign och montering — snickerier, bänkskivor, belysning och vitvaror." },
  { slug: "tillbyggnad", title: "Tillbyggnad", desc: "Skapa mer yta och värde med tillbyggnader, inredda vindar och öppna planlösningar." },
  { slug: "tak", title: "Takarbeten", desc: "Nya tak, reparationer och tätning som håller din fastighet skyddad året runt." },
  { slug: "golv", title: "Golvläggning", desc: "Trä, laminat, klinker och vinyl — fackmannamässigt avjämnat och lagt för perfekt finish." },
  { slug: "maleri", title: "Måleri & Puts", desc: "Släta väggar och skarp, hållbar målning inomhus och utomhus med förstklassiga material." },
  { slug: "el-vvs", title: "El & VVS", desc: "Certifierade elektriker och rörmokare för säkra, standardenliga installationer och uppgraderingar." },
  { slug: "projektledning", title: "Projektledning", desc: "En kontaktperson som samordnar yrkesgrupper, tidplaner och budget — så slipper du." },
];

export const processSteps = [
  { n: "01", title: "Begär en offert", body: "Berätta om ditt projekt via formuläret nedan — det tar två minuter." },
  { n: "02", title: "Kostnadsfritt besök", body: "Vi besöker, mäter och går igenom dina behov, och tar fram en detaljerad offert." },
  { n: "03", title: "Vi sätter igång", body: "Ett dedikerat team genomför ditt projekt med tydliga delmål och uppdateringar." },
  { n: "04", title: "Överlämning & garanti", body: "Slutbesiktning, städning och 5 års garanti på vårt hantverk." },
];

export const featuredProjects = [
  { slug: "villa-soder", image: images.projectKitchen, tag: "Totalrenovering", title: "Villa i Söndrum", desc: "Genomgående renovering av 1970-talsvilla — nytt kök, två badrum och öppen planlösning." },
  { slug: "radhus-vallas", image: images.projectBathroom, tag: "Badrum", title: "Radhus på Vallås", desc: "Två våtrum med tätskikt enligt Säker Vatten, helkaklat och med golvvärme." },
  { slug: "tillbyggnad-fyllinge", image: images.projectLivingRoom, tag: "Tillbyggnad", title: "Tillbyggnad i Fyllinge", desc: "24 m² tillbyggnad med sadeltak, matplats och stora skjutpartier mot trädgården." },
];

export const faq = [
  { q: "Erbjuder ni kostnadsfri offert?", a: "Ja. Vi tar fram en kostnadsfri och detaljerad offert utan förpliktelser. Fyll i formuläret så återkommer vi inom 24 timmar." },
  { q: "Vilka områden arbetar ni i?", a: "Vi utför bygg- och renoveringsprojekt i Halmstad med omnejd, inklusive Laholm, Falkenberg och övriga Hallands län." },
  { q: "Kan jag använda ROT-avdrag?", a: "Ja, för de flesta renoverings- och byggarbeten i hemmet kan du nyttja ROT-avdraget på arbetskostnaden. Vi hjälper dig med uppgifterna och drar av direkt på fakturan." },
  { q: "Hur lång tid tar ett projekt?", a: "Det beror på omfattningen. Ett badrum tar ofta 3–5 veckor, medan en totalrenovering kan ta flera månader. Du får en tydlig tidplan i offerten." },
  { q: "Lämnar ni garanti på arbetet?", a: "Ja, vi lämnar 5 års garanti på vårt hantverk. Vi är dessutom licensierade och försäkrade för din trygghet." },
  { q: "Vad kostar en renovering?", a: "Priset styrs av material, ytor och arbetets omfattning. Vi arbetar med fast pris och specificerad offert så att du vet exakt vad det kostar innan vi börjar — inga dolda kostnader." },
];

export const software01 = {
  eyebrow: "01 — Mjukvara",
  title: "Vi bygger systemen som driver verksamheten",
  lead: "01 är Byggly:s mjukvarugren. Vi bygger webb, automation och interna system som tar bort dubbelarbete — samma hantverkstänk som på byggsidan.",
  stats: [
    { value: "−12 h", label: "admin per vecka" },
    { value: "3 → 1", label: "system, ett gränssnitt" },
    { value: "100 %", label: "egen kod, ingen inlåsning" },
  ],
  triad: [
    { title: "Webb & portaler", body: "Publika sajter och inloggade portaler — snabba, mätbara, byggda för att ändras." },
    { title: "Automation & integrationer", body: "Koppla ihop system som inte pratar med varandra. Bort med manuell överföring." },
    { title: "Interna system", body: "Verktyg för offert, planering och uppföljning — formade efter hur ni faktiskt jobbar." },
  ],
};

/* ===== Hub ("/") — combined landing across both divisions ===== */
export const hub = {
  eyebrow: "Byggly 01",
  title: "Två avdelningar. En vision.",
  lead: "Byggly bygger och renoverar hem i Halmstad. 01 bygger systemen som driver verksamheter. Samma hantverkstänk, två discipliner — ett företag.",
  stats: [
    { value: "100+", label: "Genomförda byggprojekt" },
    { value: "9", label: "Tjänsteområden" },
    { value: "2", label: "Avdelningar" },
    { value: "100 %", label: "Levererat i eget hus" },
  ],
  departments: [
    {
      slug: "bygg",
      href: "/bygg",
      division: "bygg" as const,
      icon: "house",
      title: "Bygg",
      body: "Renovering, nybyggnation och projektledning — badrum, kök, tillbyggnad och tak i Halmstad med omnejd.",
      cta: "Utforska Bygg",
    },
    {
      slug: "01",
      href: "/01",
      division: "01" as const,
      icon: "code",
      title: "01 — Mjukvara",
      body: "Webb & portaler, automation och interna system. Byggt med samma hantverkstänk som på byggsidan.",
      cta: "Utforska 01",
    },
  ],
  values: [
    { title: "Kvalitet", body: "Vi levererar resultat vi själva skulle godkänna." },
    { title: "Transparens", body: "Tydlig kommunikation och ärliga besked, hela vägen." },
    { title: "I tid", body: "Vi respekterar tidplaner — dina och våra." },
    { title: "Eget hus", body: "Hantverk och kod levererat av samma företag, inga underleverantörer i mellanledet." },
  ],
};

export type WorkItem = {
  slug: string;
  href: string;
  division: "bygg" | "01";
  image: string;
  tag: string;
  title: string;
  desc: string;
};

export const combinedWork: WorkItem[] = [
  ...featuredProjects.map((p) => ({
    slug: p.slug,
    href: `/projekt/${p.slug}`,
    division: "bygg" as const,
    image: p.image,
    tag: p.tag,
    title: p.title,
    desc: p.desc,
  })),
  {
    slug: "byggly01-site",
    href: "/01/case/byggly-01-sajten",
    division: "01" as const,
    image: images.dashboardScreen,
    tag: "Webb",
    title: "Byggly 01 — den här sajten",
    desc: "Byggd av 01: Next.js, Supabase och ett gränssnitt de själva kan redigera.",
  },
];
