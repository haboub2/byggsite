import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fileHref } from "@/lib/portal/files-href";
import { formatLongDay } from "@/lib/portal/format";
import { getProjectBundle } from "@/lib/portal/store";

export const metadata: Metadata = { title: "Foton" };

export default async function PortalDiary({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getProjectBundle(id);
  if (!bundle) notFound();
  const { updates } = bundle;

  return (
    <div className="portal-stack">
      <section className="portal-card">
        <h2>Från bygget</h2>
        {updates.length === 0 ? (
          <p>Inga uppdateringar än. Här kommer korta rapporter och foton medan vi bygger.</p>
        ) : (
          <ul className="portal-diary">
            {updates.map((u) => (
              <li key={u.id}>
                <p className="portal-when">{formatLongDay(u.created_at)}</p>
                {u.body && <p>{u.body}</p>}
                {u.photos.length > 0 && (
                  <ul className="portal-photos">
                    {u.photos.map((p) => (
                      <li key={p}>
                        <a href={fileHref(p)} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={fileHref(p)} alt="" loading="lazy" />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
