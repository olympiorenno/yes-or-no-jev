import { chatGPTSignInPath } from "@/app/chatgpt-auth";
import { getDemoStatus } from "@/lib/demo";
import { demoServices } from "@/lib/demo-runtime";

export async function GET() {
  const status = await getDemoStatus(demoServices());
  return Response.json({ ...status, signInPath: chatGPTSignInPath("/") }, {
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" },
  });
}
