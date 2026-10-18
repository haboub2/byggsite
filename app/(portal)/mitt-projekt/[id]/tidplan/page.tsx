import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatRange } from "@/lib/portal/format";
import { currentPhase } from "@/lib/portal/schema";
import { getProjectBundle } from "@/lib/portal/store";

export const metadata: Metadata = { title: "Tidplan" };

export default async function PortalTimeline({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getProjectBundle(id);
  if (!bundle) notFound();
  const { phases } = bundle;
  const current = currentPhase(phases);

  return (
    <div className="portal-stack">
      <section className="portal-card">
        <h2>Tidplan</h2>
        {phases.length === 0 ? (
          <p>Tidplanen läggs upp inom kort.</p>
        ) : (
          <ol className="portal-timeline">
            {phases.map((p) => {
              const state = p.done_at ? "done" : p.id === current?.id ? "current" : "todo";
              return (
                <li key={p.id} data-state={state}>
                  <span className="portal-timeline-dot" aria-hidden="true">
                    {state === "done" ? "✓" : ""}
                  </span>
                  <span className="portal-timeline-text">
                    <strong>{p.name}</strong>
                    <span>
                      {state === "done" ? "Klar" : state === "current" ? "Pågår" : "Kommer"}
                      {formatRange(p.starts_on, p.ends_on) ? ` · ${formatRange(p.starts_on, p.ends_on)}` : ""}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        <p className="portal-note">Datumen är planerade och kan flyttas något om till exempel torktider kräver det. Ändras något större hör vi av oss.</p>
      </section>
    </div>
  );
}
