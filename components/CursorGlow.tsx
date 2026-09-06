"use client";

import { useEffect } from "react";

export default function CursorGlow() {
  useEffect(() => {
    const motionOk = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pointerFine = window.matchMedia("(pointer: fine)").matches;
    if (!motionOk || !pointerFine) return;

    document.body.classList.add("has-cursor-glow");
    let raf = 0;
    let x = 0;
    let y = 0;
    const paint = () => {
      raf = 0;
      document.documentElement.style.setProperty("--mouse-x", `${x}px`);
      document.documentElement.style.setProperty("--mouse-y", `${y}px`);
    };
    const onMove = (e: MouseEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(paint);
    };
    document.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.body.classList.remove("has-cursor-glow");
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return <div className="cursor-glow" aria-hidden="true" />;
}
