/**
 * Development aid: with SUPABASE_TRACE=1 in .env.local, `next dev` logs every
 * request to Supabase (method, path, time) so the round trips per page view
 * can be counted (docs/fakturering.md, "Läge: prestanda i admin"). Never
 * active in production; logs paths only, never headers or bodies.
 */
export function register() {
  if (process.env.NODE_ENV !== "development" || process.env.SUPABASE_TRACE !== "1") return;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return;
  type Traced = typeof fetch & { __supabaseTrace?: true };
  if ((globalThis.fetch as Traced).__supabaseTrace) return;
  console.log("[supabase] tracing every request (SUPABASE_TRACE=1)");

  // Which route made the call (Next's internal store; dev aid only, so best effort).
  let routeOf = (): string => "-";
  import("next/dist/server/app-render/work-async-storage.external")
    .then((m) => {
      // The proxy runs under the page "/"; the site's start page is "/(site)/page".
      routeOf = () => {
        const page = m.workAsyncStorage.getStore()?.page;
        return !page || page === "/" ? "proxy" : page;
      };
    })
    .catch(() => {});

  const original = globalThis.fetch;
  let n = 0;
  const traced: Traced = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(base)) return original(input, init);
    const id = ++n;
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const path = new URL(url).pathname;
    const route = routeOf();
    const started = performance.now();
    try {
      return await original(input, init);
    } finally {
      console.log(`[supabase #${id}] ${route} ${method} ${path} ${Math.round(performance.now() - started)}ms`);
    }
  };
  traced.__supabaseTrace = true;
  globalThis.fetch = traced;
}
