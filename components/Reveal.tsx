"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type ElementType,
  type ReactNode,
} from "react";

type Props = {
  children: ReactNode;
  as?: keyof HTMLElementTagNameMap;
  href?: string;
  className?: string;
  variant?: "up" | "left" | "right" | "scale" | "hero";
  [key: string]: unknown;
};

const variantClass = {
  up: "",
  left: "reveal-left",
  right: "reveal-right",
  scale: "reveal-scale",
  hero: "reveal-hero",
} as const;

export default function Reveal({
  children,
  as,
  href,
  className = "",
  variant = "up",
  ...rest
}: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // prefers-reduced-motion is handled in CSS (forces .reveal visible).
    if (!("IntersectionObserver" in window)) {
      // Ancient browsers: reveal immediately. One-time, intentional.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const classes = ["reveal", variantClass[variant], shown ? "in" : "", className]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <Link
        href={href}
        className={classes}
        ref={ref as React.Ref<HTMLAnchorElement>}
        {...rest}
      >
        {children}
      </Link>
    );
  }

  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag ref={ref} className={classes} {...rest}>
      {children}
    </Tag>
  );
}
