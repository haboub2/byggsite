import Photo from "../Photo";
import { SectionHead } from "../Sections";

type Step = { n: string; title: string; body: string; slot: string };

/** The process steps pinned on screen; each stretch of scrolling brings the
 *  next step forward with its own photo. Without motion it is a plain list. */
export default function ProcessStory({ eyebrow, title, steps }: { eyebrow: string; title: string; steps: Step[] }) {
  return (
    <section className="story" data-scroll="pin" data-story style={{ "--n": steps.length } as React.CSSProperties}>
      <div className="story-stage container">
        <div className="story-text">
          <SectionHead eyebrow={eyebrow} title={title} />
          <ol className="story-steps">
            {steps.map((s, i) => (
              <li key={s.n} className={`story-step${i === 0 ? " on" : ""}`} data-step data-i={i}>
                <span className="story-n">{s.n}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="story-bar" aria-hidden="true">
            <i />
          </div>
        </div>
        <div className="story-media" aria-hidden="true">
          {steps.map((s, i) => (
            <div key={s.n} className={`story-shot${i === 0 ? " on" : ""}`} data-shot data-i={i}>
              <Photo slot={s.slot} ratio="4 / 5" tone="dark" sizes="(max-width: 900px) 100vw, 45vw" curtain={false} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
