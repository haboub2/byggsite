"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Plays the one-shot entrance animations: photos behind a curtain
 * ([data-motion="curtain"]) and blueprint marks that draw themselves
 * ([data-motion="draw"]). Each element animates once, when it first scrolls
 * into view. The CSS only hides anything under @media (scripting: enabled),
 * so without JavaScript everything is simply visible.
 *
 * After the first page has settled, `data-settled` goes on <html>. The landing
 * hero is marked data-motion-nav="instant": when you switch between Bygg and
 * Software it crossfades (view transition) instead of replaying the curtain.
 */
export default function Motion() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    const pending = Array.from(document.querySelectorAll<HTMLElement>("[data-motion]:not(.in)"));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce || !("IntersectionObserver" in window)) {
      pending.forEach((el) => el.classList.add("in"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
    );
    pending.forEach((el) => io.observe(el));

    const settle = root.dataset.settled ? undefined : window.setTimeout(() => (root.dataset.settled = "1"), 1800);
    const stopParallax = parallax();
    const stopMagnetic = magnetic();
    const stopScrollFx = scrollFx();
    return () => {
      io.disconnect();
      stopParallax();
      stopMagnetic();
      stopScrollFx();
      if (settle) window.clearTimeout(settle);
    };
  }, [pathname]);

  return null;
}

/** Large photos ([data-parallax]) drift a little against the scroll. Sets
 *  --py, which the CSS applies with `translate` so it never fights the
 *  curtain's `transform`. Photos in the first screen of the page (heroes)
 *  follow the scroll position, so they sit at exactly 0 at the top and never
 *  jump on arrival; photos further down drift as they cross the screen. */
function parallax(): () => void {
  const els = Array.from(document.querySelectorAll<HTMLElement>("[data-parallax]"));
  if (!els.length) return () => {};
  const MAX = 36;
  let raf = 0;
  const update = () => {
    raf = 0;
    const vh = window.innerHeight;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) continue;
      const inFirstScreen = r.top + window.scrollY < vh;
      const py = inFirstScreen
        ? Math.min(MAX, window.scrollY * 0.08)
        : ((r.top + r.height / 2 - vh / 2) / vh) * -MAX; // -1 … 1 across the screen
      el.style.setProperty("--py", `${py.toFixed(1)}px`);
    }
  };
  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(update);
  };
  update();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    cancelAnimationFrame(raf);
  };
}

/** Primary buttons marked [data-magnetic] lean a few pixels toward the
 *  cursor. Mouse and trackpad only. */
function magnetic(): () => void {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return () => {};
  const PULL = 0.18;
  const MAX = 6;
  const onMove = (e: PointerEvent) => {
    const el = (e.target as Element | null)?.closest<HTMLElement>("[data-magnetic]");
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = Math.max(-MAX, Math.min(MAX, (e.clientX - (r.left + r.width / 2)) * PULL));
    const dy = Math.max(-MAX, Math.min(MAX, (e.clientY - (r.top + r.height / 2)) * PULL));
    el.style.translate = `${dx.toFixed(1)}px ${dy.toFixed(1)}px`;
  };
  const onOut = (e: PointerEvent) => {
    const el = (e.target as Element | null)?.closest<HTMLElement>("[data-magnetic]");
    if (el && !el.contains(e.relatedTarget as Node | null)) el.style.translate = "";
  };
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerout", onOut);
  return () => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerout", onOut);
  };
}

/**
 * Scroll-driven sections (components/scroll/*). Each sets CSS variables the
 * stylesheet animates; nothing here touches layout except the strip's height.
 *
 * - [data-scroll="pin"]   --p 0 → 1 while a tall section scrolls past its sticky stage
 * - [data-scroll="cross"] --p 0 → 1 while an element crosses the screen
 * - [data-story]          marks the active step (.on) from its --p
 * - [data-strip]          sideways track: measures --dist and sizes the section
 * - [data-stack]          cards get --cover as the next card slides over them
 * - [data-marquee]        drifts sideways, faster while the page scrolls
 */
function scrollFx(): () => void {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const pins = Array.from(document.querySelectorAll<HTMLElement>('[data-scroll="pin"]'));
  const crosses = Array.from(document.querySelectorAll<HTMLElement>('[data-scroll="cross"]'));
  const stories = Array.from(document.querySelectorAll<HTMLElement>("[data-story]"));
  const strips = Array.from(document.querySelectorAll<HTMLElement>("[data-strip]"));
  const stacks = Array.from(document.querySelectorAll<HTMLElement>("[data-stack]"));
  const marquees = Array.from(document.querySelectorAll<HTMLElement>("[data-marquee]"));
  if (!pins.length && !crosses.length && !stacks.length && !marquees.length) return () => {};

  const sizeStrips = () => {
    for (const s of strips) {
      const track = s.querySelector<HTMLElement>("[data-strip-track]");
      if (!track) continue;
      const stage = s.firstElementChild as HTMLElement | null;
      const dist = Math.max(0, track.scrollWidth - window.innerWidth + 40);
      s.style.setProperty("--dist", `${dist}px`);
      s.style.height = `${(stage?.offsetHeight ?? window.innerHeight) + dist}px`;
    }
  };
  sizeStrips();

  let raf = 0;
  const update = () => {
    raf = 0;
    const vh = window.innerHeight;
    for (const el of pins) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -vh || r.top > 2 * vh) continue;
      // The sticky stage sits under the header: progress runs from the moment
      // it sticks until the section's end pushes it up again.
      const stage = el.firstElementChild as HTMLElement | null;
      const top = stage ? parseFloat(getComputedStyle(stage).top) || 0 : 0;
      const run = r.height - (stage ? stage.offsetHeight : vh);
      el.style.setProperty("--p", (run > 0 ? clamp((top - r.top) / run) : 0).toFixed(4));
    }
    for (const el of crosses) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -vh || r.top > 2 * vh) continue;
      el.style.setProperty("--p", clamp((vh * 0.88 - r.top) / (vh * 0.5 + r.height * 0.5)).toFixed(4));
    }
    for (const el of stories) {
      const steps = el.querySelectorAll("[data-step]");
      const p = Number(el.style.getPropertyValue("--p") || 0);
      const active = Math.min(steps.length - 1, Math.floor(p * steps.length));
      el.querySelectorAll("[data-step], [data-shot]").forEach((n) => n.classList.toggle("on", Number((n as HTMLElement).dataset.i) === active));
    }
    for (const el of stacks) {
      const cards = Array.from(el.querySelectorAll<HTMLElement>("[data-stack-card]"));
      cards.forEach((c, i) => {
        const next = cards[i + 1];
        if (!next) return;
        const cr = c.getBoundingClientRect();
        const nr = next.getBoundingClientRect();
        c.style.setProperty("--cover", clamp(1 - (nr.top - cr.top) / cr.height).toFixed(3));
      });
    }
  };
  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(update);
  };
  const onResize = () => {
    sizeStrips();
    onScroll();
  };
  update();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);

  // Marquee: only animates while on screen.
  let mraf = 0;
  let lastY = window.scrollY;
  let speed = 0;
  const visible = new Set<HTMLElement>();
  const offsets = new Map<HTMLElement, number>();
  const mio = new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? visible.add(e.target as HTMLElement) : visible.delete(e.target as HTMLElement)));
    if (visible.size && !mraf) mraf = requestAnimationFrame(loop);
  });
  const loop = () => {
    mraf = 0;
    const dy = Math.abs(window.scrollY - lastY);
    lastY = window.scrollY;
    speed += (Math.min(dy, 60) - speed) * 0.08;
    for (const m of visible) {
      const row = m.querySelector<HTMLElement>("[data-marquee-row]");
      if (!row) continue;
      const half = row.scrollWidth / 2;
      let x = (offsets.get(m) ?? 0) - (0.35 + speed * 0.3);
      if (-x > half) x += half;
      offsets.set(m, x);
      row.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
    }
    if (visible.size) mraf = requestAnimationFrame(loop);
  };
  marquees.forEach((m) => mio.observe(m));

  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
    cancelAnimationFrame(raf);
    cancelAnimationFrame(mraf);
    mio.disconnect();
    strips.forEach((s) => (s.style.height = ""));
  };
}
