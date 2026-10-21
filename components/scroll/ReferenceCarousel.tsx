"use client";

import Image from "next/image";
import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { Icon } from "../Icons";
import { references, REFERENCE_STAGES } from "@/lib/references";

const AUTOPLAY_MS = 4500;
const RING = 157; // circumference of the progress ring (r = 25)
const pad = (n: number) => String(n).padStart(2, "0");

/** Photos from our own jobs as one sideways carousel, in Före → Montering →
 *  Efter order. It steps on its own while in view (paused on hover, touch,
 *  focus and reduced motion); drag, swipe, arrow keys and the buttons move it
 *  by hand, and a photo opens full size in the same dialog as <Lightbox>. */
export default function ReferenceCarousel({ cta }: { cta: { label: string; href: string } }) {
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const dragged = useRef(false);

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [shown, setShown] = useState(0);
  const indexRef = useRef(0);
  const playingRef = useRef(true);
  const pausedRef = useRef({ hover: false, hidden: true, dialog: false });
  playingRef.current = playing;

  const n = references.length;
  const slides = () => [...(track.current?.querySelectorAll<HTMLElement>("[data-i]") ?? [])];
  const startPad = () => parseFloat(getComputedStyle(track.current!).scrollPaddingLeft) || 0;
  const nearest = (x: number) => {
    let best = 0;
    let d = Infinity;
    slides().forEach((s, i) => {
      const dd = Math.abs(s.offsetLeft - startPad() - x);
      if (dd < d) [d, best] = [dd, i];
    });
    return best;
  };
  const go = (i: number) => {
    const s = slides()[(i + n) % n];
    if (s) track.current?.scrollTo({ left: s.offsetLeft - startPad(), behavior: "smooth" });
  };
  const stop = () => setPlaying(false);

  // Progress bar, current photo and a slight parallax inside each photo.
  useEffect(() => {
    const el = track.current!;
    let raf = 0;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      if (bar.current) bar.current.style.transform = `scaleX(${max > 0 ? el.scrollLeft / max : 0})`;
      const i = max > 0 && el.scrollLeft >= max - 4 ? n - 1 : nearest(el.scrollLeft);
      if (i !== indexRef.current) setIndex((indexRef.current = i));
      const vw = window.innerWidth;
      for (const s of slides()) {
        const r = s.getBoundingClientRect();
        if (r.right < 0 || r.left > vw) continue;
        const k = (r.left + r.width / 2 - vw / 2) / vw;
        s.style.setProperty("--shift", `${-k * 6}%`);
      }
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reveal once, and only step on its own while the track is on screen.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(false);
    const reveal = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        section.current?.classList.add("is-in");
        reveal.disconnect();
      },
      { threshold: 0.15 }
    );
    const inView = new IntersectionObserver(([e]) => (pausedRef.current.hidden = !e.isIntersecting), { threshold: 0.4 });
    reveal.observe(section.current!);
    inView.observe(track.current!);
    return () => {
      reveal.disconnect();
      inView.disconnect();
    };
  }, []);

  // Autoplay: the ring around "next" fills up, then the track steps one photo.
  useEffect(() => {
    let raf = 0;
    let elapsed = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const p = pausedRef.current;
      const active = playingRef.current && !p.hover && !p.hidden && !p.dialog;
      if (active) elapsed += t - last;
      if (!playingRef.current) elapsed = 0;
      last = t;
      if (elapsed >= AUTOPLAY_MS) {
        elapsed = 0;
        go(indexRef.current + 1 >= n ? 0 : indexRef.current + 1);
      }
      if (ring.current) ring.current.style.strokeDashoffset = String(RING * (1 - elapsed / AUTOPLAY_MS));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mouse drag with a little momentum; touch uses native scrolling.
  useEffect(() => {
    const el = track.current!;
    let down = false;
    let sx = 0, sl = 0, vx = 0, lx = 0, lt = 0;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      down = true;
      dragged.current = false;
      sx = lx = e.clientX;
      sl = el.scrollLeft;
      lt = performance.now();
      vx = 0;
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - sx;
      if (!dragged.current && Math.abs(dx) > 5) {
        dragged.current = true;
        el.classList.add("is-drag");
        setPlaying(false);
      }
      if (!dragged.current) return;
      el.scrollLeft = sl - dx;
      const t = performance.now();
      vx = (e.clientX - lx) / Math.max(1, t - lt);
      lx = e.clientX;
      lt = t;
    };
    const onUp = () => {
      if (!down) return;
      down = false;
      if (!dragged.current) return;
      el.classList.remove("is-drag");
      go(nearest(el.scrollLeft - vx * 320));
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Full-size dialog.
  useEffect(() => {
    const el = dialog.current!;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setShown((i) => (i + 1) % n);
      if (e.key === "ArrowLeft") setShown((i) => (i - 1 + n) % n);
    };
    const onClose = () => {
      pausedRef.current.dialog = false;
      opener.current?.focus({ preventScroll: true });
    };
    el.addEventListener("keydown", onKey);
    el.addEventListener("close", onClose);
    return () => {
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("close", onClose);
    };
  }, [n]);

  const open = (i: number, btn: HTMLButtonElement) => {
    if (dragged.current) return;
    opener.current = btn;
    pausedRef.current.dialog = true;
    setShown(i);
    dialog.current?.showModal();
  };

  const stage = references[index].stage;
  const stageIndex = REFERENCE_STAGES.indexOf(stage);
  const current = references[shown];

  return (
    <section ref={section} className="refs on-dark" aria-label="Referenser" aria-roledescription="karusell">
      <div className="container">
        <div className="refs-head">
          <div>
            <span className="eyebrow eyebrow--accent">Referenser</span>
            <h2>
              {["Före,", "under", "och"].map((w, i) => (
                <Fragment key={w}>
                  <span className="refs-w">
                    <span style={{ transitionDelay: `${i * 70}ms` }}>{w}</span>
                  </span>{" "}
                </Fragment>
              ))}
              <span className="refs-w">
                <em style={{ transitionDelay: "210ms" }}>efter.</em>
              </span>
            </h2>
          </div>
          <p>
            Bilder från våra jobb: takbyten, plåttak, solceller, fasad och måleri. Dra, swipa eller låt bilderna bläddra
            själva.
          </p>
        </div>

        <div className="refs-stages" role="group" aria-label="Hoppa till">
          {REFERENCE_STAGES.map((s, i) => (
            <button
              key={s}
              type="button"
              className={i === stageIndex ? "is-now" : i < stageIndex ? "is-done" : undefined}
              aria-current={i === stageIndex ? "step" : undefined}
              onClick={() => {
                stop();
                go(references.findIndex((r) => r.stage === s));
              }}
            >
              <i aria-hidden="true" />
              {s}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={track}
        className="refs-track"
        tabIndex={0}
        aria-label="Bilder, använd piltangenterna"
        onPointerEnter={() => (pausedRef.current.hover = true)}
        onPointerLeave={() => (pausedRef.current.hover = false)}
        onTouchStart={stop}
        onFocus={stop}
        onKeyDown={(e) => {
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          e.preventDefault();
          stop();
          go(indexRef.current + (e.key === "ArrowRight" ? 1 : -1));
        }}
      >
        {references.map((r, i) => (
          <button
            key={r.src}
            type="button"
            data-i={i}
            className="refs-slide"
            style={{ "--ar": r.ratio, transitionDelay: `${Math.min(i, 5) * 90}ms` } as React.CSSProperties}
            aria-label={`${pad(i + 1)} av ${n}, ${r.stage}: ${r.text} Visa större.`}
            onClick={(e) => open(i, e.currentTarget)}
          >
            <Image src={r.src} alt="" fill sizes="(max-width: 700px) 80vw, 600px" draggable={false} />
            <span className="refs-num">{pad(i + 1)}</span>
            <span className="refs-cap">
              <span className="refs-st">{r.stage}</span>
              <span>{r.text}</span>
            </span>
          </button>
        ))}
        <div className="refs-slide refs-end">
          <span className="eyebrow">Ditt jobb nästa?</span>
          <h3>Vi tittar på det och lämnar ett fast pris.</h3>
          <p>ROT-avdraget dras direkt på fakturan.</p>
          <Link href={cta.href} className="btn btn-primary">
            {cta.label}
            <Icon name="arrow" strokeWidth={2} />
          </Link>
        </div>
      </div>

      <div className="container refs-ctrl">
        <span className="refs-count" aria-live="polite">
          <b>{pad(index + 1)}</b> / {pad(n)}
        </span>
        <span className="refs-bar" aria-hidden="true">
          <span ref={bar} />
        </span>
        <button type="button" className="refs-play" aria-pressed={playing} onClick={() => setPlaying((p) => !p)}>
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            {playing ? (
              <>
                <rect x="6" y="5" width="4" height="14" />
                <rect x="14" y="5" width="4" height="14" />
              </>
            ) : (
              <path d="M7 5v14l12-7z" />
            )}
          </svg>
          <span>{playing ? "Pausa" : "Spela"}</span>
        </button>
        <button type="button" className="refs-btn is-prev" aria-label="Föregående bild" onClick={() => (stop(), go(indexRef.current - 1))}>
          <Icon name="arrow" strokeWidth={2} />
        </button>
        <button type="button" className="refs-btn" aria-label="Nästa bild" onClick={() => (stop(), go(indexRef.current + 1))}>
          <svg className="refs-ring" viewBox="0 0 52 52" aria-hidden="true">
            <circle ref={ring} cx="26" cy="26" r="25" />
          </svg>
          <Icon name="arrow" strokeWidth={2} />
        </button>
      </div>

      <dialog
        ref={dialog}
        className="lb"
        aria-label="Bildvisning"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <figure className="lb-figure">
          <div className="lb-frame" key={current.src}>
            <Image src={current.src} alt={current.text} fill sizes="92vw" />
          </div>
          <figcaption>
            <span>
              {current.stage}: {current.text}
            </span>
            <span className="lb-count">
              {shown + 1} / {n}
            </span>
          </figcaption>
        </figure>
        <button type="button" className="lb-nav lb-nav--prev" onClick={() => setShown((i) => (i - 1 + n) % n)} aria-label="Föregående bild">
          ←
        </button>
        <button type="button" className="lb-nav lb-nav--next" onClick={() => setShown((i) => (i + 1) % n)} aria-label="Nästa bild">
          →
        </button>
        <button type="button" className="lb-close" onClick={() => dialog.current?.close()} aria-label="Stäng">
          ×
        </button>
      </dialog>
    </section>
  );
}
