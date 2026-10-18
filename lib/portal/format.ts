/** Dates in the portal, Swedish and short. Safe on client and server. */

const TZ = "Europe/Stockholm";

/** "15 okt" or, in another year, "15 okt 2027". */
export function formatDay(value: string | null | undefined, now = new Date()): string {
  if (!value) return "";
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  const sameYear = d.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }).format(d);
}

/** "15 okt – 3 nov", or just one side when the other is missing. */
export function formatRange(start: string | null | undefined, end: string | null | undefined): string {
  const a = formatDay(start);
  const b = formatDay(end);
  if (a && b) return `${a} – ${b}`;
  return a || b;
}

/** "Måndag 15 oktober" for the diary. */
export function formatLongDay(iso: string): string {
  const s = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
