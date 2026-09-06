import Link from "next/link";
import { Icon } from "./Icons";

export default function DivisionSwitcher({ active }: { active: "bygg" | "01" }) {
  return (
    <div className="division-switcher">
      <div className="container division-switcher-inner">
        <Link
          href="/01"
          className={`division-switcher-item${active === "01" ? " active" : ""}`}
        >
          <Icon name="code" strokeWidth={1.8} />
          <span>Mjukvara</span>
        </Link>

        <Link href="/" className="division-switcher-center" aria-label="Byggly 01 — startsida">
          <Icon name={active === "bygg" ? "house" : "code"} strokeWidth={1.6} />
        </Link>

        <Link
          href="/bygg"
          className={`division-switcher-item${active === "bygg" ? " active" : ""}`}
        >
          <Icon name="house" strokeWidth={1.8} />
          <span>Bygg</span>
        </Link>
      </div>
    </div>
  );
}
