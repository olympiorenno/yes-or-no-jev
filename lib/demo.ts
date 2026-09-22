export type DemoState = "loading" | "disabled" | "signin" | "available" | "used" | "limit" | "unavailable";
export type DemoStatus = { state: Exclude<DemoState, "loading">; remaining: number };
const DEMO_ACCOUNT_LIMIT = 3;
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

export async function getDemoStatus(services: DemoServices): Promise<DemoStatus> {
  if (!demoKey(services)) return { state: "disabled", remaining: 0 };
  const limit = demoLimit(services);
  if (limit === 0) return { state: "limit", remaining: 0 };
  try {
    const userId = await services.getUserId();
    const userHash = userId ? await demoUserHash(userId) : "";
    const status = await services.getDatabase().prepare(`
      SELECT COALESCE(SUM(attempts), 0) AS total,
        COALESCE(MAX(CASE WHEN user_hash = ?1 THEN attempts ELSE 0 END), 0) AS used
      FROM demo_claims
    `).bind(userHash).first<{ total: number; used: number }>();
    if (!status) throw new Error("Missing demo status");
    if (status.used >= DEMO_ACCOUNT_LIMIT) return { state: "used", remaining: 0 };
    if (status.total >= limit) return { state: "limit", remaining: 0 };
    return userId
      ? { state: "available", remaining: Math.min(DEMO_ACCOUNT_LIMIT - status.used, limit - status.total) }
      : { state: "signin", remaining: 0 };
  } catch {
    console.error("demo_status_unavailable");
    return { state: "unavailable", remaining: 0 };
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
      INSERT INTO demo_claims (user_hash, attempts)
      SELECT ?1, 1 WHERE (SELECT COALESCE(SUM(attempts), 0) FROM demo_claims) < ?2
      ON CONFLICT(user_hash) DO UPDATE SET attempts = demo_claims.attempts + 1
      WHERE demo_claims.attempts < ?3
    `).bind(userHash, limit, DEMO_ACCOUNT_LIMIT).run();
    if (claim.meta.changes === 1) return key;
    const used = await database.prepare("SELECT attempts FROM demo_claims WHERE user_hash = ?1").bind(userHash).first<{ attempts: number }>();
    return used && used.attempts >= DEMO_ACCOUNT_LIMIT ? demoError("DEMO_ALREADY_USED", 403) : demoError("DEMO_LIMIT_REACHED", 429);
  } catch {
    console.error("demo_reservation_failed");
    return demoError("DEMO_UNAVAILABLE", 503);
  }
}
