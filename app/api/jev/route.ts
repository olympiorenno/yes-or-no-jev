import { handleJev } from "@/lib/api-handlers";
import { getDbBinding } from "@/db";
import { recordCompletedQuery } from "@/lib/usage";
import { reserveDemoKey } from "@/lib/demo";
import { demoServices } from "@/lib/demo-runtime";

export function POST(request: Request) {
  // A supplied personal key always takes priority, even if it is invalid.
  // Never silently charge the owner after a visitor's key is rejected.
  const resolveServerKey = !request.headers.has("x-typesafe-key") && request.headers.get("x-jev-demo") === "1"
    ? () => reserveDemoKey(request, demoServices(request))
    : undefined;
  return handleJev(request, response => recordCompletedQuery(getDbBinding(), response), resolveServerKey);
}
