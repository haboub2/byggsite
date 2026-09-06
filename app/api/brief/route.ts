import type { NextRequest } from "next/server";
import { handleLead } from "@/lib/lead-handler";
import { briefSchema } from "@/lib/schema";

export async function POST(request: NextRequest) {
  return handleLead({
    request,
    kind: "brief",
    division: "01",
    page: "/01/brief",
    schema: briefSchema,
    toLeadFields: (data) => ({
      service: data.service,
      budget: data.budget,
      timeline: data.timeline,
      extra: { Företag: data.company, "Nuvarande verktyg": data.tooling },
    }),
  });
}
