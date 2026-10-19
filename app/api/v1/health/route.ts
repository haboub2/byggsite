import { apiJson, API_VERSION } from "@/lib/api/respond";

/** GET /api/v1/health — no auth. Lets an integrator check the base URL. */
export async function GET() {
  return apiJson({ ok: true, api: API_VERSION, time: new Date().toISOString() });
}
