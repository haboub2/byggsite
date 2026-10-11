import { ViewTransition } from "react";

/**
 * Page transitions. A template (unlike the layout) remounts on every
 * navigation, so the page's enter/exit animations run each time. The header
 * and footer live in the layout and stay put.
 *
 * Switching between Bygg and Software is tagged "side-switch" (Header,
 * Landing): there the named hero parts crossfade on their own and the page
 * fade is skipped, so the two animations never run on top of each other.
 */
export default function SiteTemplate({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition
      enter={{ "side-switch": "none", default: "page-in" }}
      exit={{ "side-switch": "none", default: "page-out" }}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}
