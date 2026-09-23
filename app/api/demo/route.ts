import { getDemoStatus } from "@/lib/demo";
import { demoServices } from "@/lib/demo-runtime";
import { createDemoVisitor } from "@/lib/demo-cookie";

export async function GET(request: Request) {
  const headers = new Headers({ "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" });
  if (request.headers.get("sec-fetch-site") === "cross-site") return Response.json({ state: "unavailable", remaining: 0 }, { status: 403, headers });
  const services = demoServices(request);
  try {
    if (services.apiKey && !(await services.getVisitorId())) {
      const visitor = await createDemoVisitor(services.apiKey);
      services.getVisitorId = async () => visitor.visitorId;
      headers.set("Set-Cookie", visitor.cookie);
    }
    return Response.json(await getDemoStatus(services), { headers });
  } catch {
    return Response.json({ state: "unavailable", remaining: 0 }, { status: 503, headers });
  }
}
