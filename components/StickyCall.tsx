"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";
import { site } from "@/lib/placeholder";

/** Mobile-only fixed call/WhatsApp bar. Hides while a form is in view so it
 *  never overlaps the thing the user is trying to fill in. Bygg pages only. */
export default function StickyCall() {
  const [hidden, setHidden] = useState(false);
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const forms = Array.from(document.querySelectorAll("form.form"));
    if (!forms.length || !("IntersectionObserver" in window)) return;

    const visible = new Map<Element, boolean>(forms.map((f) => [f, false]));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => visible.set(entry.target, entry.isIntersecting));
        setHidden(Array.from(visible.values()).some(Boolean));
      },
      { threshold: 0.15 }
    );
    forms.forEach((f) => io.observe(f));
    return () => io.disconnect();
  }, []);

  const waNumber = site.contact.phone.replace(/[^\d]/g, "");

  return (
    <div className={`sticky-call${hidden ? " sticky-call--hidden" : ""}`} ref={barRef}>
      <a href={`tel:${site.contact.phone}`} className="sticky-call-btn sticky-call-btn--ring">
        <Icon name="phone" strokeWidth={2} />
        Ring
      </a>
      <a
        href={`https://wa.me/${waNumber}`}
        target="_blank"
        rel="noopener noreferrer"
        className="sticky-call-btn sticky-call-btn--wa"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M17.5 14.4c-.3-.1-1.7-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.1.2-.3.3-.4.1-.2 0-.4 0-.5-.1-.1-.7-1.6-.9-2.2-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1.1 2.8 1.2 3c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3z"/>
          <path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.5A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .9.9-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2z"/>
        </svg>
        WhatsApp
      </a>
    </div>
  );
}
