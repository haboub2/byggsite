/** Public site URL. Tolerates a value set without the scheme ("binaafy.se"),
 *  surrounding spaces or a trailing slash, so a typo in the Vercel env can't
 *  break `new URL(SITE_URL)` and fail the build. */
function siteUrl(raw: string | undefined): string {
  const value = raw?.trim().replace(/\/+$/, "");
  if (!value) return "https://binaafy.se";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export const SITE_URL = siteUrl(process.env.NEXT_PUBLIC_SITE_URL);
