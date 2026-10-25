"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";
import type { StagedPhoto } from "@/lib/project-photos";

export type SpotlightProject = { href: string; title: string; category: string | null; thumb: string; current: boolean };

/** One project's photos in a large stage: a Före/Efter switch when the job
 *  has both, a strip of every photo (with its stage) to step through, and the
 *  other projects in a list to move on to. Arrow keys step through the photos. */
export default function ProjectSpotlight({
  photos,
  start,
  beforeIndex,
  afterIndex,
  projects,
}: {
  photos: StagedPhoto[];
  start: number;
  beforeIndex: number | null;
  afterIndex: number | null;
  projects: SpotlightProject[];
}) {
  const [index, setIndex] = useState(start);
  const strip = useRef<HTMLDivElement>(null);
  const n = photos.length;
  const current = photos[index];
  const compare = beforeIndex !== null && afterIndex !== null && beforeIndex !== afterIndex;
  const showingBefore = compare && (index === beforeIndex || (current.stage === "Före" && index !== afterIndex));

  // Keep the photo shown centred in the strip. Scrolls the strip only, never the page.
  const centre = (i: number, behavior: ScrollBehavior) => {
    const el = strip.current;
    const item = el?.children[i] as HTMLElement | undefined;
    if (el && item) el.scrollTo({ left: item.offsetLeft - (el.clientWidth - item.offsetWidth) / 2, behavior });
  };
  useEffect(() => centre(start, "instant"), [start]);

  const go = (i: number) => {
    const next = (i + n) % n;
    setIndex(next);
    centre(next, "smooth");
  };

  return (
    <div className={`ps${projects.length > 1 ? "" : " ps--single"}`}>
      {projects.length > 1 && (
        <nav className="ps-list" aria-label="Fler projekt">
          {projects.map((p) => (
            <Link key={p.href} href={p.href} aria-current={p.current ? "page" : undefined} scroll={false}>
              <Image src={p.thumb} alt="" width={64} height={48} />
              <span>
                <small>{p.category ?? "Projekt"}</small>
                <b>{p.title}</b>
              </span>
            </Link>
          ))}
        </nav>
      )}

      <div className="ps-main">
        <div
          className="ps-stage"
          tabIndex={0}
          aria-label="Bilder, använd piltangenterna"
          onKeyDown={(e) => {
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
            e.preventDefault();
            go(index + (e.key === "ArrowRight" ? 1 : -1));
          }}
        >
          {/* Only the photo shown and its neighbours are mounted, so stepping is instant
              without downloading the whole gallery up front. */}
          {photos.map((p, i) =>
            Math.abs(i - index) <= 1 || Math.abs(i - index) === n - 1 ? (
              <Image
                key={p.url}
                src={p.url}
                alt={i === index ? p.alt : ""}
                fill
                sizes="(max-width: 900px) 100vw, 860px"
                className={i === index ? "is-on" : undefined}
              />
            ) : null
          )}
          {compare && (
            <div className="ps-seg" role="group" aria-label="Visa">
              <span className="ps-seg-pill" data-side={showingBefore ? "before" : "after"} aria-hidden="true" />
              <button type="button" aria-pressed={showingBefore} onClick={() => go(beforeIndex!)}>
                Före
              </button>
              <button type="button" aria-pressed={!showingBefore} onClick={() => go(afterIndex!)}>
                Efter
              </button>
            </div>
          )}
          {n > 1 && (
            <div className="ps-arrows">
              <button type="button" className="is-prev" aria-label="Föregående bild" onClick={() => go(index - 1)}>
                <Icon name="arrow" strokeWidth={2} />
              </button>
              <button type="button" aria-label="Nästa bild" onClick={() => go(index + 1)}>
                <Icon name="arrow" strokeWidth={2} />
              </button>
            </div>
          )}
        </div>

        <p className="ps-cap" aria-live="polite">
          <span className="ps-num">
            {String(index + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}
          </span>
          {current.stage && <b>{current.stage}</b>}
          {current.text}
        </p>

        {n > 1 && (
          <div className="ps-strip" ref={strip}>
            {photos.map((p, i) => (
              <button
                key={p.url}
                type="button"
                aria-current={i === index}
                aria-label={`Bild ${i + 1}${p.stage ? `, ${p.stage}` : ""}`}
                onClick={() => go(i)}
              >
                <Image src={p.url} alt="" width={120} height={90} />
                {p.stage && <i>{p.stage === "Under arbetet" ? "Under" : p.stage}</i>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
