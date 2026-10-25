import { apiGet, parseOrThrow, queryObject } from "@/lib/api/route";
import { apiJson } from "@/lib/api/respond";
import { rotClaimListQuerySchema } from "@/lib/api/schemas";
import { rotClaimResource } from "@/lib/api/mappers";
import { listClaims } from "@/lib/core/rot/store";

/** GET /api/v1/rot-claims?status=&limit= — newest first. Personal numbers are always masked. */
export const GET = apiGet("read", async ({ request }) => {
  const query = parseOrThrow(rotClaimListQuerySchema, queryObject(request));
  const claims = (await listClaims()).filter((c) => !query.status || c.status === query.status);
  return apiJson({ data: claims.slice(0, query.limit).map((c) => rotClaimResource(c)) });
});
