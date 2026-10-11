import Image from "next/image";
import Link from "next/link";
import { Icon } from "../Icons";

/** A featured project's after-photo sweeping across the before-photo as you
 *  scroll. The drag slider stays on the project page itself. */
export default function ScrollWipe({
  before,
  after,
  title,
  href,
}: {
  before: { url: string; alt: string };
  after: { url: string; alt: string };
  title: string;
  href: string;
}) {
  return (
    <section className="wipe" data-scroll="pin">
      <div className="wipe-stage container">
        <div className="wipe-head">
          <div>
            <span className="eyebrow">Före och efter</span>
            <h2>{title}</h2>
          </div>
          <Link href={href} className="link-arrow">
            Se projektet
            <Icon name="arrow" strokeWidth={2} />
          </Link>
        </div>
        <div className="wipe-frame">
          <Image src={before.url} alt={before.alt} fill sizes="(max-width: 1200px) 100vw, 1140px" className="wipe-img" />
          <div className="wipe-after">
            <Image src={after.url} alt={after.alt} fill sizes="(max-width: 1200px) 100vw, 1140px" className="wipe-img" />
          </div>
          <span className="wipe-seam" aria-hidden="true" />
          <span className="ba-tag ba-tag--before">Före</span>
          <span className="ba-tag ba-tag--after">Efter</span>
        </div>
      </div>
    </section>
  );
}
