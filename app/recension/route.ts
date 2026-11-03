import type { NextRequest } from "next/server";

/**
 * Short review link for customers: binaafy.se/recension.
 * Sends them straight to Google's "write a review" form when
 * NEXT_PUBLIC_REVIEW_URL is set, otherwise to our own /omdomen page.
 * A temporary (302) redirect, so the target can change without browsers
 * or crawlers remembering the old one. Disallowed in robots.ts.
 */
function reviewTarget(): string | null {
  const raw = process.env.NEXT_PUBLIC_REVIEW_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function GET(request: NextRequest) {
  const target = reviewTarget() ?? new URL("/omdomen", request.url).toString();
  return new Response(null, {
    status: 302,
    headers: { Location: target, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
