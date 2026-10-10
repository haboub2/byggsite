/* Phase 1 hardcoded content for the company and the Bygg side. Replaced by
   Supabase reads in Phase 2. Long-form service copy lives in
   lib/services-content.ts; the Software side lives in lib/software-content.ts. */

export const site = {
  brand: "Binaafy",
  legalName: "Binaafy",
  domain: "binaafy.se",
  contact: {
    person: "Mohamed Al Haboub",
    hours: "Mån–Fre, 07:00–16:00",
    phone: "+46793049737",
    phoneDisplay: "079-304 97 37",
    email: "info@binaafy.se",
    address: "Montörgatan 7, 302 62 Halmstad",
  },
  areasServed: ["Halmstad", "Laholm", "Falkenberg", "Hallands län"],
};

export const team = [
  { name: "Mohamed Al Haboub", role: "Byggingenjör", division: "bygg" as const, image: "team-mohamed" },
  { name: "Abdulmalek Alnajjar", role: "Byggingenjör", division: "bygg" as const, image: "team-abdulmalek" },
  { name: "Ibrahim Al Haboub", role: "Dataingenjör", division: "01" as const, image: "team-ibrahim" },
];

export const values = [
  { title: "Kvalitet", body: "Vi levererar resultat vi själva skulle godkänna." },
  { title: "Transparens", body: "Tydlig kommunikation och ärliga besked, hela vägen." },
  { title: "I tid", body: "Vi respekterar tidplaner — dina och våra." },
  { title: "Eget hus", body: "Hantverk och kod från samma företag, inga mellanhänder." },
];

export const trustPoints = ["F-skatt", "Ansvarsförsäkring", "ID06", "5 års garanti"];

export const byggStats = [
  { value: "6+", label: "års erfarenhet" },
  { value: "100+", label: "genomförda projekt" },
  { value: "24 h", label: "svarstid på offert" },
  { value: "5 år", label: "garanti på hantverket" },
];

export const services = [
  { slug: "totalrenovering", title: "Totalrenovering", desc: "Kompletta renoveringar av hus och lägenheter, skötta från rivning till sista detaljen." },
  { slug: "badrumsrenovering", title: "Badrum", desc: "Tätskikt, kakel, VVS och moderna inredningar för ett badrum byggt för att hålla." },
  { slug: "koksrenovering", title: "Kök", desc: "Skräddarsydd köksdesign och montering — snickerier, bänkskivor, belysning och vitvaror." },
  { slug: "tillbyggnad", title: "Tillbyggnad", desc: "Skapa mer yta och värde med tillbyggnader, inredda vindar och öppna planlösningar." },
  { slug: "tak", title: "Takarbeten", desc: "Nya tak, reparationer och tätning som håller din fastighet skyddad året runt." },
  { slug: "golv", title: "Golvläggning", desc: "Trä, laminat, klinker och vinyl — fackmannamässigt avjämnat och lagt för perfekt finish." },
  { slug: "maleri", title: "Måleri & puts", desc: "Släta väggar och skarp, hållbar målning inomhus och utomhus med förstklassiga material." },
  { slug: "el-vvs", title: "El & VVS", desc: "Certifierade elektriker och rörmokare för säkra, standardenliga installationer och uppgraderingar." },
  { slug: "projektledning", title: "Projektledning", desc: "En kontaktperson som samordnar yrkesgrupper, tidplaner och budget — så slipper du." },
];

export const processSteps = [
  { n: "01", title: "Förfrågan", body: "Berätta om ditt projekt i formuläret. Det tar två minuter." },
  { n: "02", title: "Hembesök", body: "Vi mäter, lyssnar och tar fram en specificerad offert. Kostnadsfritt." },
  { n: "03", title: "Bygget", body: "Ett dedikerat team, tydliga delmål och veckovis avstämning." },
  { n: "04", title: "Överlämning", body: "Slutbesiktning, städning och {garanti}." },
];

/** Placeholder projects: replace with real jobs and real photos before launch. */
export const featuredProjects = [
  {
    slug: "villa-sondrum",
    image: "projekt-villa-sondrum",
    tag: "Totalrenovering",
    service: "totalrenovering",
    title: "Villa i Söndrum",
    desc: "Genomgående renovering av 1970-talsvilla — nytt kök, två badrum och öppen planlösning.",
  },
  {
    slug: "radhus-vallas",
    image: "projekt-radhus-vallas",
    tag: "Badrum",
    service: "badrumsrenovering",
    title: "Radhus på Vallås",
    desc: "Två våtrum med tätskikt enligt Säker Vatten, helkaklat och med golvvärme.",
  },
  {
    slug: "tillbyggnad-fyllinge",
    image: "projekt-tillbyggnad-fyllinge",
    tag: "Tillbyggnad",
    service: "tillbyggnad",
    title: "Tillbyggnad i Fyllinge",
    desc: "24 m² tillbyggnad med sadeltak, matplats och stora skjutpartier mot trädgården.",
  },
];

export const faq = [
  { q: "Erbjuder ni kostnadsfri offert?", a: "Ja. Vi tar fram en kostnadsfri och detaljerad offert utan förpliktelser. Fyll i formuläret så återkommer vi inom 24 timmar." },
  { q: "Vilka områden arbetar ni i?", a: "Vi utför bygg- och renoveringsprojekt i Halmstad med omnejd, inklusive Laholm, Falkenberg och övriga Hallands län." },
  { q: "Kan jag använda ROT-avdrag?", a: "Ja, för de flesta renoverings- och byggarbeten i hemmet kan du nyttja ROT-avdraget på arbetskostnaden. Vi hjälper dig med uppgifterna och drar av direkt på fakturan." },
  { q: "Hur lång tid tar ett projekt?", a: "Det beror på omfattningen. Ett badrum tar ofta 3–5 veckor, medan en totalrenovering kan ta flera månader. Du får en tydlig tidplan i offerten." },
  { q: "Lämnar ni garanti på arbetet?", a: "Ja, vi lämnar {garanti}. Vi är dessutom licensierade och försäkrade för din trygghet." },
  { q: "Vad kostar en renovering?", a: "Priset styrs av material, ytor och arbetets omfattning. Vi arbetar med fast pris och specificerad offert så att du vet exakt vad det kostar innan vi börjar — inga dolda kostnader." },
];
