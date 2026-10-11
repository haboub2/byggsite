/** Five stars filled to `rating` (e.g. 4.6), with the number for screen readers. */
export default function Stars({ rating, size = 18 }: { rating: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
  const row = (
    <>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
          <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
        </svg>
      ))}
    </>
  );
  return (
    <span className="stars" role="img" aria-label={`${rating.toLocaleString("sv-SE")} av 5 stjärnor`}>
      <span className="stars-base">{row}</span>
      <span className="stars-fill" style={{ width: `${pct}%` }}>
        {row}
      </span>
    </span>
  );
}
