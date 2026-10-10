import type { NextRequest } from "next/server";
import { handleLead } from "@/lib/lead-handler";
import { contactSchema } from "@/lib/schema";

export async function POST(request: NextRequest) {
  return handleLead({
    request,
    kind: "kontakt",
    division: "bygg",
    page: "/kontakt",
    schema: contactSchema,
    toLeadFields: (data) => ({
      extra: { Ämne: data.subject },
    }),
  });
}
