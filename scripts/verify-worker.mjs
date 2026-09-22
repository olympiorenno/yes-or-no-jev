import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
const localRequire = createRequire(import.meta.url);
const wranglerRequire = createRequire(localRequire.resolve('wrangler/package.json'));
const { Miniflare } = wranglerRequire('miniflare');
const source = await readFile('lib/api-handlers.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
let upstreamStatus = 200;
let outgoing = [];
const upstreamAnswer = { model: 'isolated-worker-test', answers: { answer: { type: 'noul', noul: .9 } } };
const worker = new Miniflare({
  modules: true, compatibilityDate: '2026-05-15',
  script: compiled + '\nexport default { fetch: request => new URL(request.url).pathname === "/api/references" ? handleReferences(request) : handleJev(request) };',
  outboundService(request) {
    outgoing.push({ url: request.url, authorization: request.headers.get('Authorization') });
    if (new URL(request.url).hostname.endsWith('.wikipedia.org')) return Response.json({query:{pages:[{title:'Example', extract:'Reference fixture', fullurl:`${new URL(request.url).origin}/wiki/Example`}]}});
    if (upstreamStatus === 307) return new Response(null, { status: 307, headers: { Location: 'https://untrusted-redirect.invalid/' } });
    return Response.json(upstreamStatus === 200 ? upstreamAnswer : { error: 'isolated fixture' }, { status: upstreamStatus });
  },
});
const body = JSON.stringify({ model: 'jev-latest', state: 'isolated fixture', questions: { check: { type: 'noul', instructions: 'Is this a test?' } } });
async function dispatch(extra = {}) {
  return worker.dispatchFetch('https://app.example/api/jev', { method: 'POST', headers: { Origin: 'https://app.example', 'Content-Type': 'application/json', 'X-TypeSafe-Key': 'test-only-not-a-real-key', ...extra }, body });
}
try {
  const success = await dispatch();
  assert.equal(success.status, 200);
  assert.deepEqual(await success.json(), upstreamAnswer);
  assert.equal(outgoing[0].url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(outgoing[0].authorization, 'Bearer test-only-not-a-real-key');
  console.log('PASS real Worker runtime reaches the configured TypeSafe endpoint');

  upstreamStatus = 307; outgoing = [];
  const redirect = await dispatch();
  assert.equal(redirect.status, 502);
  assert.equal((await redirect.json()).code, 'UPSTREAM_REDIRECT');
  assert.equal(outgoing.length, 1);
  assert.ok(!outgoing.some(r => r.url.includes('untrusted-redirect')));
  console.log('PASS redirects are rejected without forwarding the key');

  upstreamStatus = 401;
  const denied = await dispatch();
  assert.equal(denied.status, 401);
  assert.equal((await denied.json()).code, 'TYPESAFE_ERROR');
  console.log('PASS provider authentication failure is preserved');

  outgoing = [];
  const wrongOrigin = await dispatch({ Origin: 'https://untrusted.invalid' });
  assert.equal(wrongOrigin.status, 403);
  assert.equal((await wrongOrigin.json()).code, 'ORIGIN_REJECTED');
  assert.equal(outgoing.length, 0);
  console.log('PASS cross-origin requests never reach the provider');

  outgoing = [];
  const references = await worker.dispatchFetch('https://app.example/api/references', {method:'POST', headers:{Origin:'https://app.example', 'Content-Type':'application/json'}, body:JSON.stringify({question:'Is New Zealand in Oceania?', language:'en'})});
  assert.equal(references.status, 200);
  assert.equal(new URL(outgoing[0].url).hostname, 'en.wikipedia.org');
  assert.equal(outgoing[0].authorization, null);
  assert.equal((await references.json()).references[0].url, 'https://en.wikipedia.org/wiki/Example');
  console.log('PASS English reference search uses the fixed English Wikipedia endpoint');

  outgoing = [];
  const invalidLanguage = await worker.dispatchFetch('https://app.example/api/references', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question:'Is this safe?', language:'untrusted.invalid'})});
  assert.equal(invalidLanguage.status, 400); assert.equal(outgoing.length, 0);
  const oversized = await worker.dispatchFetch('https://app.example/api/jev', {method:'POST', headers:{'X-TypeSafe-Key':'test-only'}, body:'x'.repeat(240001)});
  assert.equal(oversized.status, 413); assert.equal(outgoing.length, 0);
  console.log('PASS invalid languages and oversized requests are rejected locally');
} finally { await worker.dispose(); }
