import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';

const localRequire = createRequire(import.meta.url);
const { Miniflare } = createRequire(localRequire.resolve('wrangler/package.json'))('miniflare');
const files = ['lib/i18n.ts', 'lib/context.ts', 'lib/jev.ts', 'lib/api-handlers.ts', 'lib/usage.ts', 'lib/demo.ts', 'lib/demo-cookie.ts', 'app/api/demo/route.ts'];
const source = (await Promise.all(files.map(file => readFile(file, 'utf8')))).map(value => value.replace(/^import .* from .*;\n/gm, '')).join('\n');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/^export /gm, '');
const choice = (chosen, options) => ({ type: 'choice', choice: chosen, probabilities: Object.fromEntries(options.map(value => [value, value === chosen ? 1 : 0])) });
const fixture = { model: 'demo-test-fixture', answers: { answer: { type: 'noul', noul: .9 }, form: choice('binary', ['binary', 'open', 'ambiguous']), basis: choice('stable', ['stable', 'supplied', 'current', 'missing', 'calculation']) } };
const ownerKey = 'fake-owner-key-for-isolated-tests';
let upstreamStatus = 200;
let outgoing = [];
const directory = await mkdtemp(join(tmpdir(), 'jev-demo-test-'));
const options = {
  modules: true, compatibilityDate: '2026-05-15', d1Databases: { DB: 'demo-test' }, d1Persist: directory,
  script: compiled + `
  let activeEnv;
  function demoServices(request) {
    return {
      apiKey: request.headers.get('X-Test-Disabled') ? undefined : ${JSON.stringify(ownerKey)},
      totalLimit: request.headers.get('X-Test-Limit') ?? '25',
      getDatabase: () => activeEnv.DB,
      getVisitorId: () => readDemoVisitor(request, ${JSON.stringify(ownerKey)}),
    };
  }
  export default { async fetch(request, env) {
    activeEnv = env;
    const services = demoServices(request);
    if (new URL(request.url).pathname === '/api/demo') return GET(request);
    return handleJev(request, data => recordCompletedQuery(env.DB, data),
      !request.headers.has('x-typesafe-key') && request.headers.get('x-jev-demo') === '1' ? () => reserveDemoKey(request, services) : undefined);
  } };`,
  outboundService(request) {
    outgoing.push({ url: request.url, authorization: request.headers.get('Authorization') });
    return Response.json(upstreamStatus === 200 ? fixture : { error: 'private-provider-error' }, { status: upstreamStatus });
  },
};
let worker = new Miniflare(options);
const body = JSON.stringify({ model: 'jev-latest', state: 'private-question-marker', questions: { answer: { type: 'noul', instructions: 'Test?' } } });
const dispatch = (user, extra = {}, payload = body) => worker.dispatchFetch('https://app.example/api/jev', {
  method: 'POST', headers: { Origin: 'https://app.example', 'Content-Type': 'application/json', ...('X-TypeSafe-Key' in extra ? {} : { 'X-Jev-Demo': '1' }), ...(user ? { Cookie: user } : {}), ...extra }, body: payload,
});
const status = async (user, extra = {}) => (await worker.dispatchFetch('https://app.example/api/demo', { headers: { ...(user ? { Cookie: user } : {}), ...extra } })).json();
const expectCode = async (response, code) => assert.equal((await response.json()).code, code);

try {
  let database = await worker.getD1Database('DB');
  for (const file of (await readdir('drizzle')).filter(value => value.endsWith('.sql')).sort()) {
    if (file.startsWith('0002_')) {
      const legacyHash = createHash('sha256').update('jev-demo-v1:legacy-account').digest('hex');
      await database.prepare('INSERT INTO demo_claims (user_hash) VALUES (?1)').bind(legacyHash).run();
    }
    for (const statement of (await readFile(join('drizzle', file), 'utf8')).split('--> statement-breakpoint').filter(value => value.trim())) await database.prepare(statement).run();
  }
  const session = async () => {
    const response = await worker.dispatchFetch('https://app.example/api/demo');
    assert.deepEqual(await response.json(), { state: 'available', remaining: 10 });
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const cookie = response.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly; Secure; SameSite=Lax; Max-Age=31536000/);
    assert.ok(!cookie.includes(ownerKey));
    return cookie.split(';')[0];
  };
  const browser = await session();
  const again = await worker.dispatchFetch('https://app.example/api/demo', { headers: { Cookie: browser } });
  assert.equal(again.headers.get('set-cookie'), null);
  await expectCode(await dispatch(), 'DEMO_SESSION_REQUIRED');
  await expectCode(await dispatch(browser.slice(0, -1) + (browser.endsWith('a') ? 'b' : 'a')), 'DEMO_SESSION_REQUIRED');
  await expectCode(await dispatch(browser, { Origin: 'https://other.invalid' }), 'ORIGIN_REJECTED');
  await expectCode(await dispatch(browser, { 'X-Test-Disabled': '1' }), 'DEMO_DISABLED');
  await expectCode(await dispatch(browser, {}, '{}'), 'INVALID_REQUEST');
  for (const cap of ['0', '-1', 'invalid', '1001']) await expectCode(await dispatch(browser, { 'X-Test-Limit': cap }), 'DEMO_LIMIT_REACHED');
  assert.equal(outgoing.length, 0);
  console.log('PASS anonymous signed cookie; tampering, missing cookie and invalid requests cannot spend credits');

  assert.equal((await dispatch(browser)).status, 200);
  assert.deepEqual(await status(browser), { state: 'available', remaining: 9 });
  const calls = await Promise.all(Array.from({ length: 15 }, () => dispatch(browser)));
  assert.equal(calls.filter(r => r.status === 200).length, 9);
  assert.equal(calls.filter(r => r.status === 403).length, 6);
  assert.equal(outgoing.length, 10);
  assert.equal(outgoing[0].authorization, `Bearer ${ownerKey}`);
  assert.ok(!(await calls.find(r => r.status === 200).text()).includes(ownerKey));
  assert.deepEqual(await status(browser), { state: 'used', remaining: 0 });
  await worker.dispose(); worker = new Miniflare(options); database = await worker.getD1Database('DB');
  await expectCode(await dispatch(browser), 'DEMO_ALREADY_USED');
  console.log('PASS exactly ten attempts under concurrency; eleventh blocked; refresh/restart preserves quota');

  const browser2 = await session();
  const browser3 = await session();
  const global = await Promise.all(Array.from({ length: 24 }, (_, i) => dispatch(i % 2 ? browser2 : browser3)));
  assert.equal(global.filter(r => r.status === 200).length, 14);
  assert.equal((await database.prepare('SELECT SUM(attempts) AS n FROM demo_claims').first()).n, 25);
  assert.deepEqual(await status(browser3), { state: 'limit', remaining: 0 });
  console.log('PASS independent browser allowances; global cap includes previous account usage and remains atomic');

  assert.equal((await dispatch(null, { 'X-TypeSafe-Key': 'fake-visitor-key' })).status, 200);
  upstreamStatus = 401;
  await expectCode(await dispatch(browser, { 'X-TypeSafe-Key': 'invalid-personal-key' }), 'TYPESAFE_ERROR');
  assert.equal(outgoing.at(-1).authorization, 'Bearer invalid-personal-key');
  const beforeFailure = outgoing.length;
  // New anonymous session after global limit is raised; no real provider calls.
  const response = await worker.dispatchFetch('https://app.example/api/demo', { headers: { 'X-Test-Limit': '100' } });
  const failedBrowser = response.headers.get('set-cookie').split(';')[0];
  for (let i = 0; i < 10; i++) await expectCode(await dispatch(failedBrowser, { 'X-Test-Limit': '100' }), 'DEMO_PROVIDER_ERROR');
  await expectCode(await dispatch(failedBrowser, { 'X-Test-Limit': '100' }), 'DEMO_ALREADY_USED');
  assert.equal(outgoing.length, beforeFailure + 10);
  console.log('PASS personal keys need no cookie; no owner fallback; failed calls consume once without retries');

  const stored = (await database.prepare('SELECT * FROM demo_claims').all()).results;
  assert.equal(stored.reduce((n, row) => n + row.attempts, 0), 35);
  assert.ok(stored.every(row => row.attempts >= 1 && row.attempts <= 10 && /^[a-f0-9]{64}$/.test(row.user_hash)));
  assert.doesNotMatch(JSON.stringify(stored), /browser:|private-question|fake-owner-key/);
  await database.prepare('DROP TABLE demo_claims').run();
  upstreamStatus = 200;
  assert.deepEqual(await status(browser), { state: 'unavailable', remaining: 0 });
  await expectCode(await dispatch(browser), 'DEMO_UNAVAILABLE');
  assert.equal((await dispatch(null, { 'X-TypeSafe-Key': 'fake-visitor-key' })).status, 200);
  console.log('PASS only hashes/counts stored; database outage blocks demos while own keys still work');

} finally {
  await worker.dispose();
  await rm(directory, { recursive: true, force: true });
}
