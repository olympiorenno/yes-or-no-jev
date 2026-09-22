export type DemoState = "loading" | "disabled" | "signin" | "available" | "used" | "limit" | "unavailable";
export type DemoServices = {
  apiKey?: string;
  totalLimit?: string;
  getDatabase: () => D1Database;
  getUserId: () => Promise<string | null>;
};

const demoHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", Vary: "Cookie" };
const demoError = (code: string, status: number) => Response.json({ code }, { status, headers: demoHeaders });

function demoKey(services: DemoServices) {
  const key = services.apiKey?.trim() ?? "";
  return /^[^\s]{1,512}$/.test(key) ? key : null;
}

function demoLimit(services: DemoServices) {
  const raw = services.totalLimit ?? "100";
  if (!/^\d{1,4}$/.test(raw)) return 0;
  const limit = Number(raw);
  return limit <= 1000 ? limit : 0;
}

export async function demoUserHash(userId: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`jev-demo-v1:${userId}`));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function getDemoState(services: DemoServices): Promise<DemoState> {
  if (!demoKey(services)) return "disabled";
  const limit = demoLimit(services);
  if (limit === 0) return "limit";
  try {
    const userId = await services.getUserId();
    const userHash = userId ? await demoUserHash(userId) : "";
    const status = await services.getDatabase().prepare(`
      SELECT COUNT(*) AS total, COALESCE(MAX(user_hash = ?1), 0) AS used
      FROM demo_claims
    `).bind(userHash).first<{ total: number; used: number }>();
    if (!status) throw new Error("Missing demo status");
    if (status.used) return "used";
    if (status.total >= limit) return "limit";
    return userId ? "available" : "signin";
  } catch {
    console.error("demo_status_unavailable");
    return "unavailable";
  }
}

export async function reserveDemoKey(request: Request, services: DemoServices): Promise<string | Response> {
  // Only a same-origin browser POST may spend the site's demo allowance.
  if (request.headers.get("origin") !== new URL(request.url).origin) return demoError("ORIGIN_REJECTED", 403);
  const key = demoKey(services);
  if (!key) return demoError("DEMO_DISABLED", 503);
  const limit = demoLimit(services);
  if (limit === 0) return demoError("DEMO_LIMIT_REACHED", 429);
  try {
    const userId = await services.getUserId();
    if (!userId) return demoError("DEMO_SIGN_IN_REQUIRED", 403);
    const userHash = await demoUserHash(userId);
    const database = services.getDatabase();
    // A single atomic statement enforces both limits, including concurrent calls.
    // Reserve before contacting TypeSafe. Never retry or release a potentially
    // billable attempt automatically after an error, timeout or cancellation.
    const claim = await database.prepare(`
      INSERT INTO demo_claims (user_hash)
      SELECT ?1 WHERE (SELECT COUNT(*) FROM demo_claims) < ?2
      ON CONFLICT(user_hash) DO NOTHING
    `).bind(userHash, limit).run();
    if (claim.meta.changes === 1) return key;
    const used = await database.prepare("SELECT 1 AS used FROM demo_claims WHERE user_hash = ?1").bind(userHash).first();
    return used ? demoError("DEMO_ALREADY_USED", 403) : demoError("DEMO_LIMIT_REACHED", 429);
  } catch {
    console.error("demo_reservation_failed");
    return demoError("DEMO_UNAVAILABLE", 503);
  }
}
