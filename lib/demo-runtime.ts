import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDbBinding } from "@/db";
import type { DemoServices } from "./demo";

// Server-only module. Never import runtime secrets into a Client Component.
export function demoServices(): DemoServices {
  return {
    apiKey: env.JEV_DEMO_API_KEY,
    totalLimit: env.JEV_DEMO_TOTAL_LIMIT,
    getDatabase: getDbBinding,
    getUserId: async () => (await getChatGPTUser())?.userId ?? null,
  };
}
