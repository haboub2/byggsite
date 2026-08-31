import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import { SITE_URL } from "@/lib/env";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Byggly 01 — bygg & mjukvara i Halmstad",
    template: "%s | Byggly 01",
  },
  description:
    "Byggly 01 är ett företag, två avdelningar: Byggly renoverar och bygger hem i Halmstad, 01 bygger systemen som driver verksamheter.",
  openGraph: {
    type: "website",
    locale: "sv_SE",
    siteName: "Byggly 01",
    url: SITE_URL,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv" className={`${jakarta.variable} ${grotesk.variable}`}>
      <body>{children}</body>
    </html>
  );
}
