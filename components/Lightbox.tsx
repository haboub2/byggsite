"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import Reveal from "./Reveal";

type Img = { url: string; alt: string };

/** Photo grid where each photo opens full size in a dialog. Arrow keys step
 *  through, Esc closes, and focus returns to the photo that was opened. */
export default function Lightbox({ images }: { images: Img[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const [index, setIndex] = useState(0);

  const open = (i: number, btn: HTMLButtonElement) => {
    opener.current = btn;
    setIndex(i);
    dialog.current?.showModal();
  };
  const step = (d: number) => setIndex((i) => (i + d + images.length) % images.length);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    const onClose = () => opener.current?.focus();
    el.addEventListener("keydown", onKey);
    el.addEventListener("close", onClose);
    return () => {
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("close", onClose);
    };
    // step only depends on images.length, which never changes for a mounted gallery
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = images[index];
  return (
    <>
      <div className="work reveal-group">
        {images.map((g, i) => (
          <Reveal key={g.url}>
            <button type="button" className="lb-thumb" onClick={(e) => open(i, e.currentTarget)} aria-label={`Visa större: ${g.alt}`}>
              {/* Same markup as <Photo>, which is server-only (it checks public/images on disk). */}
              <div className="photo" style={{ "--ratio": "4 / 3" } as React.CSSProperties} data-motion="curtain">
                <Image src={g.url} alt={g.alt} fill sizes="(max-width: 580px) 100vw, (max-width: 900px) 50vw, 33vw" />
              </div>
            </button>
          </Reveal>
        ))}
      </div>
      <dialog
        ref={dialog}
        className="lb"
        aria-label="Bildvisning"
        onClick={(e) => {
          // A click on the backdrop (the dialog itself) closes it.
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        {current && (
          <figure className="lb-figure">
            <div className="lb-frame" key={current.url}>
              <Image src={current.url} alt={current.alt} fill sizes="92vw" />
            </div>
            <figcaption>
              <span>{current.alt}</span>
              <span className="lb-count">
                {index + 1} / {images.length}
              </span>
            </figcaption>
          </figure>
        )}
        {images.length > 1 && (
          <>
            <button type="button" className="lb-nav lb-nav--prev" onClick={() => step(-1)} aria-label="Föregående bild">
              ←
            </button>
            <button type="button" className="lb-nav lb-nav--next" onClick={() => step(1)} aria-label="Nästa bild">
              →
            </button>
          </>
        )}
        <button type="button" className="lb-close" onClick={() => dialog.current?.close()} aria-label="Stäng">
          ×
        </button>
      </dialog>
    </>
  );
}
