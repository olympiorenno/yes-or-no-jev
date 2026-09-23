import { env } from "cloudflare:workers";
import { readDemoVisitor } from "./demo-cookie";
import { getDbBinding } from "@/db";
import type { DemoServices } from "./demo";

// Server-only module. Never import runtime secrets into a Client Component.
export function demoServices(request: Request): DemoServices {
  return {
    apiKey: env.JEV_DEMO_API_KEY,
    totalLimit: env.JEV_DEMO_TOTAL_LIMIT,
    getDatabase: getDbBinding,
    getVisitorId: () => readDemoVisitor(request, env.JEV_DEMO_API_KEY),
  };
}
