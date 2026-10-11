import { ViewTransition } from "react";

/**
 * Page transitions. A template (unlike the layout) remounts on every
 * navigation, so the page's enter/exit animations run each time. The header
 * and footer live in the layout and stay put; the named hero parts on the two
 * landing pages keep their own crossfade (components/Landing.tsx).
 */
export default function SiteTemplate({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-in" exit="page-out" default="none">
      {children}
    </ViewTransition>
  );
}
