/* Phase 1 hardcoded content for the company and the Bygg side. Replaced by
   Supabase reads in Phase 2. Long-form service copy lives in
   lib/services-content.ts; the Software side lives in lib/software-content.ts. */

export const site = {
  brand: "Binaafy",
  legalName: "Binaafy",
  domain: "binaafy.se",
  contact: {
    hours: "Mån–Fre, 07:00–16:00",
    phone: "+46793049737",
    phoneDisplay: "079-304 97 37",
    email: "info@binaafy.se",
    address: "Uppstigen 130, 412 80 Göteborg",
  },
  areasServed: ["Skåne län", "Hallands län", "Västra Götalands län"],
};

export const team = [
  { name: "Mohamed Al Haboub", role: "Byggingenjör", division: "bygg" as const, image: "team-mohamed", email: "haboub@binaafy.se" },
  { name: "Abdulmalek Alnajjar", role: "Byggingenjör", division: "bygg" as const, image: "team-abdulmalek", email: "malek@binaafy.se" },
  { name: "Ibrahim Al Haboub", role: "Dataingenjör", division: "01" as const, image: "team-ibrahim", email: "ibra@binaafy.se" },
];

export const values = [
  { title: "Kvalitet", body: "Vi levererar resultat vi själva skulle godkänna." },
  { title: "Transparens", body: "Tydlig kommunikation och ärliga besked, hela vägen." },
  { title: "I tid", body: "Vi respekterar tidplaner — dina och våra." },
  { title: "En kontakt, ett ansvar", body: "Du har ett avtal med oss, oavsett vem som utför momentet." },
];

/** How the work is split between our own staff and specialists (Bygg). */
export const responsibility = {
  eyebrow: "Ett ansvar – hela vägen",
  title: "Egen personal där vi kan, behöriga specialister där det krävs.",
  /** Phrase in `body` that lights up in orange on scroll. */
  highlight: "en kontaktperson och ett avtal med oss",
  body: "Merparten av arbetet utför vi med egen personal. För specialistmoment som el, VVS och våtrumsarbeten anlitar vi noggrant utvalda och behöriga underentreprenörer som vi har arbetat med länge. Du har alltid en kontaktperson och ett avtal med oss – vi samordnar, kvalitetssäkrar och tar fullt ansvar för helheten, inklusive garantin.",
  points: [
    { title: "Egen personal", body: "Rivning, stomme, snickerier, golv, kakel och montering gör vi själva. Det ger kortare beslutsvägar och en jämn kvalitet." },
    { title: "Behöriga specialister", body: "El- och VVS-arbeten är reglerade yrken. De utförs av behöriga elinstallatörer och auktoriserade VVS-montörer som vi känner och litar på." },
    { title: "Ett avtal, en garanti", body: "Du skriver avtal med oss och får en faktura, en tidplan och en garanti – vi ansvarar för varje moment, oavsett vem som utför det." },
  ],
};

export const trustPoints = ["Fast pris", "ROT-avdrag på fakturan", "5 års garanti"];

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
    title: "Villa från 1970-talet",
    desc: "Genomgående renovering av 1970-talsvilla — nytt kök, två badrum och öppen planlösning.",
  },
  {
    slug: "radhus-vallas",
    image: "projekt-radhus-vallas",
    tag: "Badrum",
    service: "badrumsrenovering",
    title: "Radhus med två våtrum",
    desc: "Två våtrum med tätskikt enligt Säker Vatten, helkaklat och med golvvärme.",
  },
  {
    slug: "tillbyggnad-fyllinge",
    image: "projekt-tillbyggnad-fyllinge",
    tag: "Tillbyggnad",
    service: "tillbyggnad",
    title: "Tillbyggnad på 24 m²",
    desc: "24 m² tillbyggnad med sadeltak, matplats och stora skjutpartier mot trädgården.",
  },
];

export const faq = [
  { q: "Erbjuder ni kostnadsfri offert?", a: "Ja. Vi tar fram en kostnadsfri och detaljerad offert utan förpliktelser. Fyll i formuläret så återkommer vi inom 24 timmar." },
  { q: "Vilka områden arbetar ni i?", a: "Vi utför bygg- och renoveringsprojekt i södra och västra Sverige – i Skåne, Halland och Västra Götaland, från Malmö till Borås. Hör av dig så berättar vi om vi kan ta ditt projekt." },
  { q: "Gör ni allt arbete själva?", a: "Merparten, ja. Rivning, stomme, snickerier, golv, kakel och montering gör vi med egen personal. El- och VVS-arbeten utförs av behöriga specialister som vi har arbetat med länge, eftersom det är reglerade yrken. Du har ändå bara ett avtal och en kontaktperson – vi samordnar arbetet och ansvarar för helheten, inklusive garantin." },
  { q: "Kan jag använda ROT-avdrag?", a: "Ja, för de flesta renoverings- och byggarbeten i hemmet kan du nyttja ROT-avdraget på arbetskostnaden. Vi hjälper dig med uppgifterna och drar av direkt på fakturan." },
  { q: "Hur lång tid tar ett projekt?", a: "Det beror på omfattningen. Ett badrum tar ofta 3–5 veckor, medan en totalrenovering kan ta flera månader. Du får en tydlig tidplan i offerten." },
  { q: "Lämnar ni garanti på arbetet?", a: "Ja, vi lämnar {garanti}." },
  { q: "Vad kostar en renovering?", a: "Priset styrs av material, ytor och arbetets omfattning. Vi arbetar med fast pris och specificerad offert så att du vet exakt vad det kostar innan vi börjar — inga dolda kostnader." },
];
