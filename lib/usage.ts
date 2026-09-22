import { interpretResponse } from "./jev";

export async function recordCompletedQuery(database: D1Database, response: unknown) {
  // Count only a usable Jev response, including inconclusive answers.
  // Reuse the UI's validation without keeping any of the response or input.
  try { interpretResponse(response as Parameters<typeof interpretResponse>[0], [], ""); }
  catch { return; }
  await database.prepare(`
    INSERT INTO usage_totals (id, completed_queries) VALUES (1, 1)
    ON CONFLICT(id) DO UPDATE SET completed_queries = completed_queries + 1
  `).run();
}

export async function handleUsage(getDatabase: () => D1Database) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const total = await getDatabase().prepare("SELECT completed_queries FROM usage_totals WHERE id = 1").first<number>("completed_queries") ?? 0;
    return Response.json({ total }, { headers });
  } catch {
    console.error("usage_counter_read_failed");
    return Response.json({ code: "COUNTER_UNAVAILABLE" }, { status: 503, headers });
  }
}
