import { Icon } from "./Icons";

const BADGES = [
  { label: "F-skatt" },
  { label: "Ansvarsförsäkring" },
  { label: "ID06" },
  { label: "5 års garanti" },
];

export default function TrustBadges({ className = "" }: { className?: string }) {
  return (
    <div className={`trust-badges ${className}`.trim()}>
      {BADGES.map((b) => (
        <span key={b.label} className="trust-badge">
          <Icon name="check" strokeWidth={2.4} />
          {b.label}
        </span>
      ))}
    </div>
  );
}
