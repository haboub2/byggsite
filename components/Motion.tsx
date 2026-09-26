"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Plays the one-shot entrance animations: photos behind a curtain
 * ([data-motion="curtain"]) and blueprint marks that draw themselves
 * ([data-motion="draw"]). Each element animates once, when it first scrolls
 * into view; the CSS only hides anything while <html> has the `js` class, so
 * without JavaScript everything is simply visible.
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
    return () => {
      io.disconnect();
      if (settle) window.clearTimeout(settle);
    };
  }, [pathname]);

  return null;
}
