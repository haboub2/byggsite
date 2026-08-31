"use client";

import { useState } from "react";
import Link from "next/link";
import type { WorkItem } from "@/lib/placeholder";

const TABS: { key: "all" | "bygg" | "01"; label: string }[] = [
  { key: "all", label: "Alla" },
  { key: "bygg", label: "Bygg" },
  { key: "01", label: "01 Mjukvara" },
];

export default function WorkFilter({ items }: { items: WorkItem[] }) {
  const [filter, setFilter] = useState<"all" | "bygg" | "01">("all");
  const shown = filter === "all" ? items : items.filter((i) => i.division === filter);

  return (
    <>
      <div className="work-filter" role="tablist" aria-label="Filtrera arbete">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={filter === t.key}
            className={filter === t.key ? "active" : ""}
            onClick={() => setFilter(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="projects-grid">
        {shown.map((item) => (
          <Link key={item.slug} href={item.href} className="project-card">
            <div className={`project-thumb ${item.thumb}`}>
              <span className={`work-badge work-badge--${item.division}`}>
                {item.division === "bygg" ? "Bygg" : "01"}
              </span>
            </div>
            <div className="project-body">
              <span className="tag">{item.tag}</span>
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
