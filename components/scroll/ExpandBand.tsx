import Photo from "../Photo";

/** A framed photo that opens up to fill the screen as you scroll, while the
 *  statement fades in over it. Replaces the static photo band. */
export default function ExpandBand({ slot, statement, caption }: { slot: string; statement: string; caption: string }) {
  return (
    <section className="xp" data-scroll="pin">
      <div className="xp-stage">
        <div className="xp-photo">
          <Photo slot={slot} ratio="auto" tone="dark" sizes="100vw" curtain={false} />
        </div>
        <div className="container xp-copy">
          <div className="band-panel">
            <p className="band-statement">{statement}</p>
            <span className="band-cap">{caption}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
