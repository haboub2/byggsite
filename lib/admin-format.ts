/** Date formatting for the admin, always in Swedish time. */

const TZ = "Europe/Stockholm";

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** "i dag 14:05", "i går 09:12", or a date for anything older. */
export function formatWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const day = (x: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, dateStyle: "short" }).format(x);
  const time = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
  if (day(d) === day(now)) return `i dag ${time}`;
  if (day(d) === day(new Date(now.getTime() - 86_400_000))) return `i går ${time}`;
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, day: "numeric", month: "short" }).format(d);
}
