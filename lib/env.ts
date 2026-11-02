/** Public site URL. Tolerates a value set without the scheme ("binaafy.se"),
 *  surrounding spaces or a trailing slash, so a typo in the Vercel env can't
 *  break `new URL(SITE_URL)` and fail the build.
 *
 *  Must be the hostname the site is actually served on. Vercel redirects
 *  binaafy.se -> www.binaafy.se, so every canonical, og:url, sitemap and
 *  JSON-LD URL has to say www too; otherwise Google sees a canonical that
 *  redirects and indexes both hostnames (SEO review 2026-11-01). */
function siteUrl(raw: string | undefined): string {
  const value = raw?.trim().replace(/\/+$/, "");
  if (!value) return "https://www.binaafy.se";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export const SITE_URL = siteUrl(process.env.NEXT_PUBLIC_SITE_URL);
