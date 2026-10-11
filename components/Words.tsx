/** A heading's text split into words, so they can rise into place one after
 *  another ([data-motion="rise"] in globals.css). The text reads normally to
 *  screen readers and search engines; without JavaScript it is simply shown. */
export default function Words({ text }: { text: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <>
      {words.map((w, i) => (
        <span className="w" key={i}>
          <span style={{ "--i": i } as React.CSSProperties}>{w}</span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}
