import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { CollectionLetterPdf, CollectionSummaryPdf, type LetterProps, type SummaryProps } from "./CollectionPdf";

/** An inkassokrav or a reminder copy as PDF bytes (lib/core/collections/store.ts builds the props). */
export function renderCollectionLetterPdf(props: LetterProps): Promise<Buffer> {
  return renderToBuffer(<CollectionLetterPdf {...props} />);
}

/** The summary for the collection agency as PDF bytes. */
export function renderCollectionSummaryPdf(props: SummaryProps): Promise<Buffer> {
  return renderToBuffer(<CollectionSummaryPdf {...props} />);
}
