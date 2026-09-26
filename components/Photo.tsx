import Image from "next/image";
import { resolveImage, imageAlt } from "@/lib/images";

/**
 * An image slot. Renders public/images/<slot>.* when the file exists, and a
 * labelled blueprint-grid placeholder until it does, so every slot is visible
 * (and named) while photos are still being produced.
 */
export default function Photo({
  slot,
  ratio = "4 / 5",
  tone = "light",
  sizes = "(max-width: 900px) 100vw, 50vw",
  preload = false,
  alt,
  className = "",
  curtain = true,
}: {
  slot: string;
  ratio?: string;
  tone?: "light" | "dark";
  sizes?: string;
  preload?: boolean;
  alt?: string;
  className?: string;
  /** Reveal the photo behind a curtain the first time it scrolls into view. */
  curtain?: boolean;
}) {
  const src = resolveImage(slot);
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
          alt={alt ?? imageAlt[slot] ?? ""}
          fill
          sizes={sizes}
          preload={preload}
        />
      ) : (
        <div className="photo-ph" aria-hidden="true">
          <span>{slot}</span>
        </div>
      )}
    </div>
  );
}
