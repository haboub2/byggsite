/** A slow band of words that drifts sideways and speeds up while the page
 *  scrolls. Decorative: the same words are links elsewhere on the page.
 *  The list is rendered twice so the loop is seamless. */
export default function Marquee({ words }: { words: string[] }) {
  return (
    <div className="marquee" data-marquee aria-hidden="true">
      <div className="marquee-row" data-marquee-row>
        {[...words, ...words].map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>
    </div>
  );
}
