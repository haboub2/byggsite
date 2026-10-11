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
    return () => {
      io.disconnect();
      stopParallax();
      stopMagnetic();
      if (settle) window.clearTimeout(settle);
    };
  }, [pathname]);

  return null;
}

/** Large photos ([data-parallax]) drift a little against the scroll. Sets
 *  --py, which the CSS applies with `translate` so it never fights the
 *  curtain's `transform`. */
function parallax(): () => void {
  const els = Array.from(document.querySelectorAll<HTMLElement>("[data-parallax]"));
  if (!els.length) return () => {};
  let raf = 0;
  const update = () => {
    raf = 0;
    const vh = window.innerHeight;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) continue;
      const progress = (r.top + r.height / 2 - vh / 2) / vh; // -1 … 1 across the screen
      el.style.setProperty("--py", `${(progress * -36).toFixed(1)}px`);
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
