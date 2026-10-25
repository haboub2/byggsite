import { apiGet, parseOrThrow, queryObject } from "@/lib/api/route";
import { apiJson } from "@/lib/api/respond";
import { eventListQuerySchema } from "@/lib/api/schemas";
import { eventResource } from "@/lib/api/mappers";
import { listEventsPage } from "@/lib/api/read-store";

/**
 * GET /api/v1/events?aggregateType=&aggregateId=&type=&order=&cursor=&limit=
 * — the organisation's event log, a page at a time. Follow nextCursor until
 * it is null; with order=asc a client can store the last cursor and poll
 * for what is new.
 */
export const GET = apiGet("read", async ({ request }) => {
  const query = parseOrThrow(eventListQuerySchema, queryObject(request));
  const { events, nextCursor } = await listEventsPage(query);
  return apiJson({ data: events.map(eventResource), nextCursor });
});
