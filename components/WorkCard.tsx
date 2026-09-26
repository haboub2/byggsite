import Link from "next/link";
import Photo from "./Photo";

export default function WorkCard({
  href,
  image,
  tag,
  title,
  desc,
}: {
  href: string;
  image: string;
  tag: string;
  title: string;
  desc: string;
}) {
  return (
    <Link href={href} className="work-card">
      <Photo slot={image} ratio="4 / 3" sizes="(max-width: 580px) 100vw, (max-width: 900px) 50vw, 33vw" />
      <span className="work-tag">{tag}</span>
      <h3 className="work-title">{title}</h3>
      <p className="work-desc">{desc}</p>
    </Link>
  );
}
