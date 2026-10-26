import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Analytics as VercelAnalytics } from "@vercel/analytics/next";
import Analytics from "@/components/Analytics";
import CookieConsent from "@/components/CookieConsent";
import { SITE_URL } from "@/lib/env";
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
    default: "Binaafy — bygg och software under ett tak",
    template: "%s | Binaafy",
  },
  description:
    "Binaafy är ett företag med två verksamheter: vi bygger och renoverar hem i södra och västra Sverige, och vi bygger system som tar bort dubbelarbete.",
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

// The website's content (and its JSON-LD) is read in app/(site)/layout.tsx,
// so admin and portal pages do not wait for it.
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv" className={jakarta.variable}>
      <body>
        {children}
        <CookieConsent />
        <Analytics />
        <VercelAnalytics />
      </body>
    </html>
  );
}
