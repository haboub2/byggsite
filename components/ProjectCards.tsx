"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type ProjectCard = {
  href: string;
  title: string;
  /** Service title, used as the card tag and the filter. */
  category: string | null;
  summary: string;
  photos: number;
  after: { url: string; alt: string };
  before: { url: string; alt: string } | null;
};

/** Finished jobs as cards, the first one large. Moving the pointer (or a
 *  finger) across a photo wipes in the "before" photo; the first card shows
 *  the gesture once when it scrolls into view. Filter buttons appear when the
 *  cards span two or more services. */
export default function ProjectCards({ items }: { items: ProjectCard[] }) {
  const categories = [...new Set(items.map((p) => p.category).filter((c): c is string => Boolean(c)))];
  const [filter, setFilter] = useState<string | null>(null);
  const shown = filter ? items.filter((p) => p.category === filter) : items;

  return (
    <>
      {categories.length > 1 && (
        <div className="pc-chips" role="group" aria-label="Visa projekt">
          {[null, ...categories].map((c) => (
            <button key={c ?? "alla"} type="button" aria-pressed={filter === c} onClick={() => setFilter(c)}>
              {c ?? "Alla"}
              <sup>{c ? items.filter((p) => p.category === c).length : items.length}</sup>
            </button>
          ))}
        </div>
      )}
      {/* Pick a layout the cards fill: one large card plus two beside it for 3, 5 or 6;
          two columns for 2 or 4, so no card is left alone on a row. */}
      <div className={`pc-grid${shown.length === 2 || shown.length === 4 ? " pc-grid--2" : ""}`} key={filter ?? "alla"}>
        {shown.map((p, i) => (
          <Card key={p.href} p={p} big={i === 0 && (shown.length === 3 || shown.length >= 5)} teach={i === 0 && !filter} />
        ))}
      </div>
    </>
  );
}

function Card({ p, big, teach }: { p: ProjectCard; big: boolean; teach: boolean }) {
  const media = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [active, setActive] = useState(false);
  const [glide, setGlide] = useState(false);
  const two = Boolean(p.before);

  // Show the gesture once: wipe to "före" and back when the card comes into view.
  useEffect(() => {
    const el = media.current;
    if (!teach || !two || !el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timers: number[] = [];
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        timers.push(window.setTimeout(() => (setGlide(true), setActive(true), setX(62)), 500));
        timers.push(window.setTimeout(() => setX(0), 1900));
        timers.push(window.setTimeout(() => (setActive(false), setGlide(false)), 2600));
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [teach, two]);

  const at = (e: React.PointerEvent) => {
    const r = media.current!.getBoundingClientRect();
    return Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
  };
  const sizes = big ? "(max-width: 600px) 100vw, (max-width: 900px) 100vw, 66vw" : "(max-width: 600px) 100vw, (max-width: 900px) 50vw, 33vw";

  return (
    <Link href={p.href} className={`pc-card${big ? " is-big" : ""}`}>
      <div
        ref={media}
        className={`pc-media${two ? " is-two" : ""}${active ? " is-on" : ""}${glide ? " is-glide" : ""}`}
        style={{ "--x": `${x}%` } as React.CSSProperties}
        onPointerEnter={
          two
            ? (e) => {
                setGlide(true);
                setActive(true);
                setX(at(e));
                window.setTimeout(() => setGlide(false), 300);
              }
            : undefined
        }
        onPointerMove={two ? (e) => setX(at(e)) : undefined}
        onPointerLeave={
          two
            ? () => {
                setGlide(true);
                setActive(false);
                setX(0);
              }
            : undefined
        }
      >
        <Image src={p.after.url} alt={p.after.alt} fill sizes={sizes} />
        {p.before && (
          <>
            <Image src={p.before.url} alt="" fill sizes={sizes} className="pc-before" />
            <span className="pc-line" aria-hidden="true" />
            <span className="pc-pill pc-pill--l">Före</span>
            <span className="pc-hint" aria-hidden="true">
              Dra för att se före
            </span>
          </>
        )}
        <span className="pc-pill pc-pill--r">Efter</span>
      </div>
      <div className="pc-info">
        <div>
          <span className="pc-tag">{p.category ?? "Projekt"}</span>
          <h3>{p.title}</h3>
        </div>
        <span className="pc-count">{p.photos} bilder</span>
      </div>
      {big && <p className="pc-sum">{p.summary}</p>}
    </Link>
  );
}
