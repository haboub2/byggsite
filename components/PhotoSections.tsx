import Photo from "./Photo";
import Reveal from "./Reveal";

/** Dark section: a short statement on the left, three detail photos on the
 *  right, the middle one set lower so the row reads as a sequence. */
export function Craft({
  title,
  body,
  images,
}: {
  title: string;
  body: string;
  images: { slot: string; caption: string }[];
}) {
  return (
    <section className="sec on-dark craft">
      <div className="container craft-grid">
        <Reveal className="craft-text">
          <span className="eyebrow">Hantverket</span>
          <h2>{title}</h2>
          <p>{body}</p>
        </Reveal>
        <div className="craft-images reveal-group">
          {images.map((img, i) => (
            <Reveal key={img.slot} className="craft-item">
              <Photo slot={img.slot} ratio="3 / 4" tone="dark" sizes="(max-width: 900px) 33vw, 18vw" />
              <span className="craft-cap">
                <span>{String(i + 1).padStart(2, "0")}</span>
                {img.caption}
              </span>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Full-bleed photograph with one statement set in a solid panel. */
export function PhotoBand({
  slot,
  statement,
  caption,
}: {
  slot: string;
  statement: string;
  caption: string;
}) {
  return (
    <section className="band">
      <Photo slot={slot} ratio="auto" tone="dark" sizes="100vw" className="band-photo" />
      <div className="container band-inner">
        <Reveal className="band-panel">
          <p className="band-statement">{statement}</p>
          <span className="band-cap">{caption}</span>
        </Reveal>
      </div>
    </section>
  );
}
