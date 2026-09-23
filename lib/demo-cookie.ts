// Anonymous browser identity; never contains the API key or personal details.
const COOKIE_NAME = "__Host-jev-demo";
const encoder = new TextEncoder();
async function cookieKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(`jev-demo-cookie-v1:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function readDemoVisitor(request: Request, secret?: string): Promise<string | null> {
  if (!secret) return null;
  const value = request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  if (!value || !/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(value)) return null;
  const [id, signature] = value.split(".");
  const bytes = Uint8Array.from(signature.match(/../g)!, byte => parseInt(byte, 16));
  return await crypto.subtle.verify("HMAC", await cookieKey(secret), bytes, encoder.encode(id)) ? `browser:${id}` : null;
}
export async function createDemoVisitor(secret: string) {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
  const signature = await crypto.subtle.sign("HMAC", await cookieKey(secret), encoder.encode(id));
  const hex = Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, "0")).join("");
  return { visitorId: `browser:${id}`, cookie: `${COOKIE_NAME}=${id}.${hex}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000` };
}
