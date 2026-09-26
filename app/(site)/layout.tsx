import Header from "@/components/Header";
import Footer from "@/components/Footer";
import StickyCall from "@/components/StickyCall";

export default function SiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <a href="#main" className="skip-link">Hoppa till innehållet</a>
      <Header />
      <main id="main">{children}</main>
      <Footer />
      <StickyCall />
    </>
  );
}
