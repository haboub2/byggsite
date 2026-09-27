import Image from "next/image";
import { resolveImage, imageAlt } from "@/lib/images";

/**
 * An image slot. Renders public/images/<slot>.* when the file exists, and a
 * labelled blueprint-grid placeholder until it does, so every slot is visible
 * (and named) while photos are still being produced.
 */
export default function Photo({
  slot,
  src: directSrc,
  ratio = "4 / 5",
  tone = "light",
  sizes = "(max-width: 900px) 100vw, 50vw",
  preload = false,
  alt,
  className = "",
  curtain = true,
}: {
  /** Named image slot (lib/images.ts). */
  slot?: string;
  /** Or a direct URL, e.g. a photo uploaded from /admin. */
  src?: string | null;
  ratio?: string;
  tone?: "light" | "dark";
  sizes?: string;
  preload?: boolean;
  alt?: string;
  className?: string;
  /** Reveal the photo behind a curtain the first time it scrolls into view. */
  curtain?: boolean;
}) {
  const src = directSrc ?? (slot ? resolveImage(slot) : null);
  const classes = `photo${tone === "dark" ? " photo--dark" : ""} ${className}`.trim();

  return (
    <div
      className={classes}
      style={{ "--ratio": ratio } as React.CSSProperties}
      data-motion={src && curtain ? "curtain" : undefined}
    >
      {src ? (
        <Image
          src={src}
          alt={alt ?? (slot ? imageAlt[slot] : undefined) ?? ""}
          fill
          sizes={sizes}
          preload={preload}
        />
      ) : (
        <div className="photo-ph" aria-hidden="true">
          <span>{slot ?? "Bild saknas"}</span>
        </div>
      )}
    </div>
  );
}
