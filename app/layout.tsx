import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Analytics from "@/components/Analytics";
import CookieConsent from "@/components/CookieConsent";
import JsonLd from "@/components/JsonLd";
import { SITE_URL } from "@/lib/env";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo";
import { getContent } from "@/lib/content/store";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Binaafy — bygg och software i Halmstad",
    template: "%s | Binaafy",
  },
  description:
    "Binaafy är ett företag med två verksamheter: vi bygger och renoverar hem i Halmstad, och vi bygger system som tar bort dubbelarbete.",
  applicationName: "Binaafy",
  openGraph: {
    type: "website",
    locale: "sv_SE",
    siteName: "Binaafy",
    url: SITE_URL,
  },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
  // Search Console / Bing Webmaster verification, set once the domain is live.
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION }
      : undefined,
  },
};

export const viewport: Viewport = { themeColor: "#18232c" };

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { company } = await getContent();
  return (
    <html lang="sv" className={jakarta.variable}>
      <body>
        <JsonLd data={[organizationJsonLd(company), websiteJsonLd()]} />
        {children}
        <CookieConsent />
        <Analytics />
      </body>
    </html>
  );
}
