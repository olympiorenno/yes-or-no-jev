// A server-signed anonymous session, never a provider API key.
const storageKey = "jev-demo-session-v1";
let sessionInMemory: string | null = null;
export function demoSessionHeaders(): Record<string, string> {
  try { sessionInMemory = localStorage.getItem(storageKey) || sessionInMemory; } catch { /* Storage may be disabled; retain this page's session. */ }
  return sessionInMemory ? { "X-Jev-Session": sessionInMemory } : {};
}
export function rememberDemoSession(value: unknown) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(value)) return;
  sessionInMemory = value;
  try { localStorage.setItem(storageKey, value); } catch { /* Continue with the in-memory session. */ }
}
