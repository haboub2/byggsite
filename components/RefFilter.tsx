"use client";

import { useState } from "react";

const FILTERS = [
  { key: "alla", label: "Alla" },
  { key: "bygg", label: "Bygg" },
  { key: "software", label: "Software" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

/** Bygg / Software filter for /referenser. Cards carry data-side; without
 *  JavaScript every card is simply shown. */
export default function RefFilter({ children }: { children: React.ReactNode }) {
  const [filter, setFilter] = useState<Filter>("alla");
  return (
    <div className="refs" data-filter={filter}>
      <div className="ref-filter" role="group" aria-label="Visa referenser">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
