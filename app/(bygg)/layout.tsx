import type { Viewport } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import DivisionSwitcher from "@/components/DivisionSwitcher";

export const viewport: Viewport = { themeColor: "#24624d" };

export default function ByggLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="division-root" data-division="bygg">
      <Header division="bygg" />
      <DivisionSwitcher active="bygg" />
      <main>{children}</main>
      <Footer division="bygg" />
    </div>
  );
}
