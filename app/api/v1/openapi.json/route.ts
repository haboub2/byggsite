import type { NextRequest } from "next/server";
import { openApiDocument } from "@/lib/api/openapi";
import { apiJson } from "@/lib/api/respond";

/** GET /api/v1/openapi.json — the API contract, for tooling and the developer pages. */
export async function GET(request: NextRequest) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  return apiJson(openApiDocument(base.replace(/\/$/, "")), { headers: { "cache-control": "public, max-age=300" } });
}
