import { chatGPTSignInPath } from "@/app/chatgpt-auth";
import { getDemoState } from "@/lib/demo";
import { demoServices } from "@/lib/demo-runtime";

export async function GET() {
  const state = await getDemoState(demoServices());
  return Response.json({ state, signInPath: chatGPTSignInPath("/") }, {
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" },
  });
}
