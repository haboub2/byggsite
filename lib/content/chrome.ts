import "server-only";
import { unstable_cache } from "next/cache";
import { getContent } from "./store";
import { projectsReady } from "../projects";
import type { Company } from "./schema";

/**
 * The header's and footer's data for the 404 page. The root not-found is
 * rendered with every page, admin and portal included (it is the root
 * layout's not-found boundary), so it reads from a cache kept for a few
 * minutes instead of asking the database on each request. A stale phone
 * number on a 404 page for five minutes is harmless.
 */
export const siteChrome = unstable_cache(
  async (): Promise<{ company: Company; vatNumber: string; showProjects: boolean }> => {
    const content = await getContent();
    return { company: content.company, vatNumber: content.quote.vatNumber, showProjects: await projectsReady() };
  },
  ["site-chrome"],
  { revalidate: 300 }
);
