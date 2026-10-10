import Header from "@/components/Header";
import Footer from "@/components/Footer";
import StickyCall from "@/components/StickyCall";
import Motion from "@/components/Motion";
import { projectsReady } from "@/lib/projects";
import { getContent } from "@/lib/content/store";

export default async function SiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { company } = await getContent();
  return (
    <>
      <a href="#main" className="skip-link">Hoppa till innehållet</a>
      <Header showProjects={await projectsReady()} />
      <main id="main">{children}</main>
      <Footer />
      <StickyCall phone={company.phone} />
      <Motion />
    </>
  );
}
