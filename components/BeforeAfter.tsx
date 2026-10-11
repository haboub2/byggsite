"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * Before/after comparison: the "after" photo sits on top, clipped at the
 * handle. Drag anywhere (mouse or touch) or use the arrow keys; the control
 * is a native range input, so it is accessible without extra code.
 */
export default function BeforeAfter({
  before,
  after,
}: {
  before: { url: string; alt: string };
  after: { url: string; alt: string };
}) {
  const [pos, setPos] = useState(50);
  return (
    <div className="ba" style={{ "--pos": `${pos}%` } as React.CSSProperties}>
      <Image src={before.url} alt={before.alt} fill sizes="(max-width: 900px) 100vw, 1100px" className="ba-img" />
      <div className="ba-after" aria-hidden="true">
        <Image src={after.url} alt="" fill sizes="(max-width: 900px) 100vw, 1100px" className="ba-img" />
      </div>
      <span className="ba-tag ba-tag--before">Före</span>
      <span className="ba-tag ba-tag--after">Efter</span>
      <span className="ba-handle" aria-hidden="true">
        <span />
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={0.5}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        className="ba-range"
        aria-label={`Jämför före och efter. Efter: ${after.alt}`}
      />
    </div>
  );
}
