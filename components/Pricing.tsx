import Link from "next/link";
import RotCalculator from "./RotCalculator";
import { SectionHead } from "./Sections";
import { services } from "@/lib/placeholder";
import { getContent } from "@/lib/content/store";

const title = (slug: string) => services.find((s) => s.slug === slug)?.title ?? slug;

/** Guide prices in service order, from the content store (Priser in /admin). */
async function priceList() {
  const { pricing } = await getContent();
  return services.flatMap((s) => {
    const p = pricing.services[s.slug];
    return p ? [{ slug: s.slug, ...p }] : [];
  });
}

/** ROT calculator presets: the services that have an example project. */
export async function presets() {
  return (await priceList())
    .filter((p) => p.example && p.labor + p.material > 0)
    .map((p) => ({
      slug: p.slug,
      service: title(p.slug),
      label: p.exampleLabel || title(p.slug),
      labor: p.labor,
      material: p.material,
    }));
}

/** Landing section: ROT calculator plus the guide-price list. */
export async function PricingSection() {
  const list = await priceList();
  return (
    <section className="sec" id="priser">
      <div className="container">
        <SectionHead
          eyebrow="Vad kostar det?"
          title="Räkna på ditt projekt."
          aside="Välj ett exempel eller fyll i egna belopp. Du ser direkt vad ROT-avdraget blir och vad du själv betalar."
        />
        <RotCalculator presets={await presets()} />
        <div className="guide">
          <span className="eyebrow">Riktpriser inkl. moms, före ROT</span>
          <ul>
            {list.map((p) => (
              <li key={p.slug}>
                <Link href={`/bygg/tjanster/${p.slug}`}>
                  <span className="guide-title">{title(p.slug)}</span>
                  <span className="guide-note">{p.note}</span>
                  <span className="guide-from">{p.from}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="guide-foot">
            Riktpriserna visar var ett normalt projekt brukar landa. Ditt pris får du i offerten
            efter hembesöket — fast pris, specificerat.{" "}
            <Link href="/guider/rot-avdrag-2026" className="link-quiet">
              Så fungerar ROT-avdraget 2026
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}

/** Service page variant: the calculator starts on this service's example. */
export async function ServicePricing({ slug }: { slug: string }) {
  const p = (await priceList()).find((x) => x.slug === slug);
  if (!p || !p.example) return null;
  return (
    <section className="sec">
      <div className="container">
        <SectionHead
          eyebrow={`Riktpris ${p.from}`}
          title="Vad kostar det efter ROT?"
          aside={`Exemplet är ${(p.exampleLabel || title(slug)).toLowerCase()}. Ändra beloppen för att räkna på ditt eget projekt.`}
        />
        <RotCalculator presets={await presets()} initial={slug} />
      </div>
    </section>
  );
}
