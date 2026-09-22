import { getDbBinding } from "@/db";
import { handleUsage } from "@/lib/usage";

export function GET() {
  return handleUsage(getDbBinding);
}
