import Link from "next/link";
import { createHash } from "node:crypto";
import { restoreContentVersion } from "@/app/admin/content-actions";
import { listHistory } from "@/lib/content/store";
import { formatDateTime } from "@/lib/admin-format";
import type { ContentKey } from "@/lib/content/schema";

/** Shell for a content editor: heading, where it shows on the site, the
 *  editor itself and the version history with restore. */
export default async function ContentPage({
  contentKey,
  title,
  intro,
  shownOn,
  data,
  children,
}: {
  contentKey: ContentKey;
  title: string;
  intro: string;
  shownOn: { label: string; href: string }[];
  /** Current saved content; the editor remounts when it changes (e.g. after restore). */
  data: unknown;
  children: (key: string, lastSaved: { at: string; by: string | null } | undefined) => React.ReactNode;
}) {
  const history = await listHistory(contentKey);
  const version = createHash("sha1").update(JSON.stringify(data)).digest("hex").slice(0, 12);

  return (
    <section className="sec sec--tight">
      <div className="container content-page">
        <div>
          <span className="eyebrow">Innehåll</span>
          <h1 className="admin-h1">{title}</h1>
          <p className="admin-intro">{intro}</p>
          <p className="admin-shown">
            Visas på:{" "}
            {shownOn.map((s, i) => (
              <span key={s.href}>
                {i > 0 && ", "}
                <Link href={s.href} target="_blank" className="link-quiet">
                  {s.label}
                </Link>
              </span>
            ))}
          </p>
          {children(version, history[0] ? { at: history[0].savedAt, by: history[0].savedBy } : undefined)}
        </div>

        <aside className="history">
          <h2 className="lead-h2">Tidigare versioner</h2>
          {history.length === 0 ? (
            <p className="efield-hint">Inga sparade versioner än. Varje gång du sparar hamnar en version här.</p>
          ) : (
            <ol>
              {history.map((h, i) => (
                <li key={h.id}>
                  <span>
                    {formatDateTime(h.savedAt)}
                    <small>{h.savedBy ?? "okänd"}</small>
                  </span>
                  {i === 0 ? (
                    <em>Nuvarande</em>
                  ) : (
                    <form action={restoreContentVersion}>
                      <input type="hidden" name="key" value={contentKey} />
                      <input type="hidden" name="id" value={h.id} />
                      <button type="submit" className="link-quiet">
                        Återställ
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </section>
  );
}
