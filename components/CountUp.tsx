"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Numbers in a stat ("6–10 v", "100 %", "4,8") count up from zero the first
 *  time they scroll into view. Text without numbers ("Fast pris") is left as
 *  is. The server renders the final value, so it is right without JS. */
const NUM = /\d+(?:[.,]\d+)?/g;
const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;

function render(value: string, t: number): string {
  return value.replace(NUM, (m) => {
    const decimals = m.includes(",") || m.includes(".") ? m.split(/[.,]/)[1].length : 0;
    const n = Number(m.replace(",", ".")) * t;
    const s = decimals ? n.toFixed(decimals) : String(Math.round(n));
    return m.includes(",") ? s.replace(".", ",") : s;
  });
}

export default function CountUp({ value, className }: { value: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  const animate = /\d/.test(value);

  useIso(() => {
    if (!animate || !ref.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const el = ref.current;
    // Start at zero before first paint, so the final value never flashes.
    setShown(render(value, 0));
    let raf = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const dur = 1100;
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / dur);
          setShown(render(value, 1 - Math.pow(1 - p, 3)));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, animate]);

  return (
    <span ref={ref} className={className} aria-label={value}>
      <span aria-hidden="true">{shown}</span>
    </span>
  );
}
