import type { NextRequest } from "next/server";
import { handleLead } from "@/lib/lead-handler";
import { offertSchema } from "@/lib/schema";

export async function POST(request: NextRequest) {
  return handleLead({
    request,
    kind: "offert",
    division: "bygg",
    page: "/offert",
    schema: offertSchema,
    toLeadFields: (data) => ({
      service: data.service,
      budget: data.budget,
      timeline: data.timeline,
    }),
  });
}
