import WorkCard from "../WorkCard";

type Work = React.ComponentProps<typeof WorkCard>;

/** Featured work sliding in sideways while the page scrolls down. Used when
 *  there are four or more items; fewer look better as the normal grid. */
export default function WorkStrip({ title, aside, items }: { title: React.ReactNode; aside?: React.ReactNode; items: Work[] }) {
  return (
    <section className="strip" data-scroll="pin" data-strip>
      <div className="strip-stage">
        <div className="container strip-head">
          {title}
          {aside}
        </div>
        <div className="strip-track" data-strip-track>
          {items.map((w) => (
            <div className="strip-card" key={w.href}>
              <WorkCard {...w} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
