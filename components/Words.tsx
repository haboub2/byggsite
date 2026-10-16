import { Fragment } from "react";

/** A heading's text split into words, so they can rise into place one after
 *  another ([data-motion="rise"] in globals.css). The text reads normally to
 *  screen readers and search engines; without JavaScript it is simply shown. */
export default function Words({ text }: { text: string }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <>
      {words.map((w, i) => (
        <Fragment key={i}>
          {i > 0 && " "}
          {/* The space sits between the boxes: inside an inline-block a trailing space is dropped. */}
          <span className="w">
            <span style={{ "--i": i } as React.CSSProperties}>{w}</span>
          </span>
        </Fragment>
      ))}
    </>
  );
}
