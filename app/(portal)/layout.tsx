import type { Metadata, Viewport } from "next";

/** The customer portal: its own shell, no site header or footer, never indexed. */
export const metadata: Metadata = {
  title: { default: "Mitt projekt", template: "%s · Mitt projekt | Binaafy" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#18232c", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function PortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="portal">{children}</div>;
}
