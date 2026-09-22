const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
function sameOrigin(request: Request) { const origin = request.headers.get("origin"); return !origin || origin === new URL(request.url).origin; }

export async function handleJev(request: Request, onCompleted?: (response: unknown) => Promise<void>) {
  if (!sameOrigin(request)) return json({ code: "ORIGIN_REJECTED" }, 403);
  const authorization = `Bearer ${request.headers.get("x-typesafe-key") || ""}`;
  if (!/^Bearer [^\s]{1,512}$/.test(authorization)) return json({ code: "INVALID_KEY" }, 401);
  if (Number(request.headers.get("content-length") || 0) > 240000) return json({ code: "REQUEST_TOO_LARGE" }, 413);
  let raw: string;
  try {
    raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 240000) return json({ code: "REQUEST_TOO_LARGE" }, 413);
    const payload = JSON.parse(raw);
    if (payload.model !== "jev-latest" || !payload.state || !payload.questions || Object.keys(payload.questions).length > 8) return json({ code: "INVALID_REQUEST" }, 400);
  } catch { return json({ code: "INVALID_REQUEST" }, 400); }
  const timeout = AbortSignal.timeout(32000);
  try {
    // This Worker runtime supports follow/manual, not redirect: error.
    // Never forward the user's credential to a redirected destination.
    const upstream = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { Authorization: authorization, "Content-Type": "application/json" }, body: raw, signal: timeout, redirect: "manual" });
    if (upstream.status >= 300 && upstream.status < 400) return json({ code: "UPSTREAM_REDIRECT" }, 502);
    if (!upstream.ok) return json({ code: "TYPESAFE_ERROR", upstream_status: upstream.status }, upstream.status);
    let data: unknown;
    try { data = await upstream.json(); }
    catch { return json({ code: "UPSTREAM_INVALID_RESPONSE" }, 502); }
    if (onCompleted) {
      try { await onCompleted(data); }
      catch { console.error("usage_counter_write_failed"); }
    }
    return json(data);
  } catch (error) {
    const code = timeout.aborted ? "UPSTREAM_TIMEOUT" : "UPSTREAM_CONNECTION_ERROR";
    // Deliberately exclude keys, question text and raw upstream messages.
    console.error("jev_proxy_failure", { code, type: error instanceof Error ? error.name : "unknown" });
    return json({ code }, timeout.aborted ? 504 : 502);
  }
}

export function referenceQuery(question: string) {
  const stop = new Set("qual quais quem como onde quando porque por que um uma uns umas o a os as de do da dos das em no na nos nas e é são fica ficam tem têm existe existem ser se eu meu minha pode podem para com is are the a an do does did can could should would will has have had of in on at to for and or it this that these those".split(" "));
  return question.replace(/[?!.,;:()[\]{}"“”]/g, " ").split(/\s+/).filter(word => !stop.has(word.toLowerCase())).join(" ").trim().slice(0, 240) || question.slice(0, 240);
}

export async function handleReferences(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Origin not allowed" }, 403);
  try {
    const { question, language = "pt" } = await request.json() as { question: unknown; language?: unknown };
    if (typeof question !== "string" || question.length > 1500) return json({ error: "Invalid question" }, 400);
    if (language !== "pt" && language !== "en") return json({ error: "Invalid language" }, 400);
    const wikiOrigin = language === "en" ? "https://en.wikipedia.org" : "https://pt.wikipedia.org";
    const url = new URL(`${wikiOrigin}/w/api.php`);
    url.search = new URLSearchParams({ action: "query", format: "json", formatversion: "2", generator: "search", gsrsearch: referenceQuery(question), gsrlimit: "3", gsrnamespace: "0", prop: "extracts|info", inprop: "url", exintro: "1", explaintext: "1", exchars: "2400" }).toString();
    const response = await fetch(url, { headers: { "User-Agent": "SimOuNaoJev/1.0 (personal question app)", Accept: "application/json" }, signal: AbortSignal.timeout(7000) });
    if (!response.ok) return json({ error: "Reference service unavailable" }, 502);
    const data = await response.json() as { query?: { pages?: { title: string; extract?: string; fullurl?: string; index?: number }[] } };
    const references = (data.query?.pages || []).sort((a, b) => (a.index || 0) - (b.index || 0)).filter(p => p.extract && p.fullurl?.startsWith(`${wikiOrigin}/wiki/`)).slice(0, 3).map(p => ({ title: p.title, url: p.fullurl, text: p.extract?.slice(0, 2400) }));
    return json({ references });
  } catch { return json({ error: "Reference service unavailable" }, 502); }
}
