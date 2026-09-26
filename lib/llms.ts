import { site, services, byggStats, faq as byggFaq, processSteps } from "./placeholder";
import { servicesContent, serviceSeo } from "./services-content";
import { softwareAreas, softwareFaq, softwareProcess } from "./software-content";
import { guides } from "./guides";
import { abs, CONTENT_UPDATED } from "./seo";

/**
 * /llms.txt and /llms-full.txt: the site as plain Markdown for AI assistants
 * and answer engines (llmstxt.org). Built from the same content modules as
 * the pages, so they never drift apart. Example prices are left out on
 * purpose until the owners confirm real ones.
 */

const facts = [
  `Företag: ${site.brand}, ${site.contact.address}.`,
  `Verksamheter: ${site.brand} Bygg (bygg och renovering) och ${site.brand} Software (webb, automation och interna system).`,
  `Område för bygg: ${site.areasServed.join(", ")}. Software: hela Sverige.`,
  `Kontakt: ${site.contact.phoneDisplay}, ${site.contact.email}. ${site.contact.hours}.`,
  "Bygg: kostnadsfri offert och hembesök, fast pris, ROT-avdrag direkt på fakturan, 5 års garanti på hantverket.",
  "Software: fast pris per etapp, kunden äger kod och data, samma team från brief till drift.",
];

export function llmsTxt(): string {
  const lines = [
    `# ${site.brand}`,
    "",
    `> ${site.brand} är ett företag i Halmstad med två verksamheter: bygg och renovering av hem i Halland, och mjukvara — webbplatser, kundportaler, automation och interna system — för företag i hela Sverige.`,
    "",
    ...facts.map((f) => `- ${f}`),
    "",
    "## Bygg och renovering",
    "",
    `- [Alla byggtjänster](${abs("/bygg/tjanster")}): översikt över nio tjänster.`,
    ...services.map((s) => `- [${serviceSeo[s.slug]?.title ?? s.title}](${abs(`/bygg/tjanster/${s.slug}`)}): ${s.desc}`),
    `- [Begär offert](${abs("/bygg/offert")}): kostnadsfri offert, svar inom 24 timmar.`,
    "",
    "## Software",
    "",
    `- [Software](${abs("/mjukvara")}): översikt.`,
    ...softwareAreas.map((a) => `- [${a.seo.title}](${abs(`/mjukvara/tjanster/${a.slug}`)}): ${a.seo.description}`),
    `- [Skicka brief](${abs("/mjukvara/brief")}): svar inom två arbetsdagar.`,
    "",
    "## Guider",
    "",
    ...guides.map((g) => `- [${g.title}](${abs(`/guider/${g.slug}`)}): ${g.answer}`),
    "",
    "## Företaget",
    "",
    `- [Om oss](${abs("/om-oss")})`,
    `- [Kontakt](${abs("/kontakt")})`,
    "",
    "## Optional",
    "",
    `- [Allt innehåll i en fil](${abs("/llms-full.txt")})`,
    "",
    `Senast uppdaterad: ${CONTENT_UPDATED}`,
    "",
  ];
  return lines.join("\n");
}

export function llmsFullTxt(): string {
  const out: string[] = [llmsTxt(), "---", ""];

  out.push("# Bygg och renovering — tjänster", "");
  out.push("## Så går det till", "", ...processSteps.map((p) => `${p.n}. ${p.title}: ${p.body}`), "");
  for (const s of services) {
    const c = servicesContent[s.slug];
    out.push(`## ${serviceSeo[s.slug]?.title ?? s.title}`, "", `URL: ${abs(`/bygg/tjanster/${s.slug}`)}`, "");
    if (c) {
      out.push(c.lead, "");
      for (const sec of c.sections) out.push(`### ${sec.heading}`, "", sec.body, "");
      out.push("### Vanliga frågor", "");
      for (const f of c.faq) out.push(`**${f.q}**`, "", f.a, "");
    }
  }
  out.push("## Vanliga frågor om bygg", "");
  for (const f of byggFaq) out.push(`**${f.q}**`, "", f.a, "");
  out.push(`Nyckeltal: ${byggStats.map((s) => `${s.value} ${s.label}`).join(", ")}.`, "");

  out.push("# Software — tjänster", "");
  out.push("## Så går det till", "", ...softwareProcess.map((p) => `${p.n}. ${p.title}: ${p.body}`), "");
  for (const a of softwareAreas) {
    out.push(`## ${a.seo.title}`, "", `URL: ${abs(`/mjukvara/tjanster/${a.slug}`)}`, "", a.body, "");
    out.push("Passar er om:", ...a.fitsIf.map((f) => `- ${f}`), "");
    out.push(`Typiskt upplägg: ${a.engagement.label}. ${a.engagement.body}`, "");
    out.push("Det här ingår:", ...a.included.map((i) => `- ${i}`), "");
    for (const f of a.faq) out.push(`**${f.q}**`, "", f.a, "");
  }
  out.push("## Vanliga frågor om Software", "");
  for (const f of softwareFaq) out.push(`**${f.q}**`, "", f.a, "");

  out.push("# Guider", "");
  for (const g of guides) {
    out.push(`## ${g.title}`, "", `URL: ${abs(`/guider/${g.slug}`)} — uppdaterad ${g.updated}`, "", `Kort svar: ${g.answer}`, "");
    for (const sec of g.sections) {
      out.push(`### ${sec.heading}`, "", ...sec.paragraphs.flatMap((p) => [p, ""]));
      if (sec.list) out.push(...sec.list.map((l) => `- ${l}`), "");
    }
    for (const f of g.faq) out.push(`**${f.q}**`, "", f.a, "");
    if (g.sources) out.push("Källor:", ...g.sources.map((s) => `- ${s.label}: ${s.href}`), "");
  }
  return out.join("\n");
}
