import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Binaafy — bygg och software",
    short_name: "Binaafy",
    description: "Bygg och renovering i Halmstad, och system som tar bort dubbelarbete.",
    lang: "sv",
    start_url: "/",
    display: "browser",
    background_color: "#f5f2ed",
    theme_color: "#18232c",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/brand/binaafy-mark.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
