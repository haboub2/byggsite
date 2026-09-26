import Header from "@/components/Header";
import Footer from "@/components/Footer";
import StickyCall from "@/components/StickyCall";
import Motion from "@/components/Motion";
import { projectsReady } from "@/lib/projects";

export default function SiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <a href="#main" className="skip-link">Hoppa till innehållet</a>
      <Header showProjects={projectsReady()} />
      <main id="main">{children}</main>
      <Footer />
      <StickyCall />
      <Motion />
    </>
  );
}
