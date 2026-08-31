import type { Viewport } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import DivisionSwitcher from "@/components/DivisionSwitcher";

export const viewport: Viewport = { themeColor: "#2e6bff" };

export default function SoftwareLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="division-root" data-division="01">
      <Header division="01" />
      <DivisionSwitcher active="01" />
      <main>{children}</main>
      <Footer division="01" />
    </div>
  );
}
