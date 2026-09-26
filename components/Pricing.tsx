import Link from "next/link";
import RotCalculator from "./RotCalculator";
import { SectionHead } from "./Sections";
import { priceGuide } from "@/lib/pricing";
import { services } from "@/lib/placeholder";

const title = (slug: string) => services.find((s) => s.slug === slug)?.title ?? slug;

function presets() {
  return priceGuide.flatMap((p) =>
    p.preset ? [{ ...p.preset, slug: p.slug, service: title(p.slug) }] : []
  );
}

/** Landing section: ROT calculator plus the guide-price list. */
export function PricingSection() {
  return (
    <section className="sec" id="priser">
      <div className="container">
        <SectionHead
          eyebrow="Vad kostar det?"
          title="Räkna på ditt projekt."
          aside="Välj ett exempel eller fyll i egna belopp. Du ser direkt vad ROT-avdraget blir och vad du själv betalar."
        />
        <RotCalculator presets={presets()} />
        <div className="guide">
          <span className="eyebrow">Riktpriser inkl. moms, före ROT</span>
          <ul>
            {priceGuide.map((p) => (
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
            efter hembesöket — fast pris, specificerat.
          </p>
        </div>
      </div>
    </section>
  );
}

/** Service page variant: the calculator starts on this service's example. */
export function ServicePricing({ slug }: { slug: string }) {
  const guide = priceGuide.find((p) => p.slug === slug);
  if (!guide?.preset) return null;
  return (
    <section className="sec">
      <div className="container">
        <SectionHead
          eyebrow={`Riktpris ${guide.from}`}
          title="Vad kostar det efter ROT?"
          aside={`Exemplet är ${guide.preset.label.toLowerCase()}. Ändra beloppen för att räkna på ditt eget projekt.`}
        />
        <RotCalculator presets={presets()} initial={slug} />
      </div>
    </section>
  );
}
