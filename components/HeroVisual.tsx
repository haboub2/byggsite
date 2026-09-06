"use client";

import { useEffect, useRef } from "react";
import { Icon } from "./Icons";

type Props = {
  image: string;
  mainIcon?: string;
  mainLabel?: string;
  badgeTitle?: string;
  badgeBody?: string;
  toolsLabel?: string;
};

export default function HeroVisual({
  image,
  mainIcon = "house",
  mainLabel = "Kvalitetshantverk",
  badgeTitle = "I tid",
  badgeBody = "98 % av projekten i tid",
  toolsLabel = "Licensierad & försäkrad",
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const visual = ref.current;
    if (!visual) return;
    const motionOk = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pointerFine = window.matchMedia("(pointer: fine)").matches;
    if (!motionOk || !pointerFine) return;

    visual.setAttribute("data-tilt-active", "");
    const cards = Array.from(
      visual.querySelectorAll<HTMLElement>("[data-depth]")
    );
    let raf = 0;
    let tx = 0;
    let ty = 0;

    const apply = () => {
      raf = 0;
      cards.forEach((card) => {
        const depth = Number(card.getAttribute("data-depth")) || 12;
        card.style.transform = `translate3d(${tx * depth * 0.04}px, ${ty * depth * 0.04}px, 0)`;
      });
    };
    const onMove = (e: MouseEvent) => {
      const r = visual.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width - 0.5;
      ty = (e.clientY - r.top) / r.height - 0.5;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    visual.addEventListener("mousemove", onMove);
    visual.addEventListener("mouseleave", onLeave);
    return () => {
      visual.removeEventListener("mousemove", onMove);
      visual.removeEventListener("mouseleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="hero-visual" aria-hidden="true" ref={ref}>
      <div
        className="hero-card hero-card--main float"
        data-depth="18"
        style={{ backgroundImage: `url(${image})` }}
      >
        <Icon name={mainIcon} strokeWidth={1.6} />
        <span>{mainLabel}</span>
      </div>
      <div className="hero-card hero-card--badge float float-delay-1" data-depth="30">
        <strong>{badgeTitle}</strong>
        <span>{badgeBody}</span>
      </div>
      <div className="hero-card hero-card--tools float float-delay-2" data-depth="24">
        <Icon name="tools" strokeWidth={1.6} />
        <span>{toolsLabel}</span>
      </div>
    </div>
  );
}
