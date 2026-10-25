import { apiGet, ApiProblem } from "@/lib/api/route";
import { apiJson } from "@/lib/api/respond";
import { rotClaimResource } from "@/lib/api/mappers";
import { getClaim } from "@/lib/core/rot/store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/v1/rot-claims/{id} — personal numbers are always masked. */
export const GET = apiGet("read", async ({ params }) => {
  const claim = UUID.test(params.id ?? "") ? await getClaim(params.id) : null;
  if (!claim) throw new ApiProblem("not_found", "ROT-begäran finns inte.");
  return apiJson(rotClaimResource(claim));
});
