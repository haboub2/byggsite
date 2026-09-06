"use client";

import { useEffect } from "react";

const PULL_X = 0.28;
const PULL_Y = 0.35;

export default function MagneticButtons() {
  useEffect(() => {
    const motionOk = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pointerFine = window.matchMedia("(pointer: fine)").matches;
    if (!motionOk || !pointerFine) return;

    let active: HTMLElement | null = null;

    const onMove = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest<HTMLElement>(".btn-primary");
      if (!target) {
        if (active) {
          active.style.transform = "";
          active = null;
        }
        return;
      }
      active = target;
      const r = target.getBoundingClientRect();
      const dx = (e.clientX - r.left - r.width / 2) * PULL_X;
      const dy = (e.clientY - r.top - r.height / 2) * PULL_Y;
      target.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    const onLeave = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest<HTMLElement>(".btn-primary");
      if (target) target.style.transform = "";
      if (active === target) active = null;
    };

    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseout", onLeave, { passive: true });
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseout", onLeave);
      if (active) active.style.transform = "";
    };
  }, []);

  return null;
}
