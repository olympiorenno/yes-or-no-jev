import { handleJev } from "@/lib/api-handlers";
import { getDbBinding } from "@/db";
import { recordCompletedQuery } from "@/lib/usage";

export function POST(request: Request) {
  return handleJev(request, response => recordCompletedQuery(getDbBinding(), response));
}
