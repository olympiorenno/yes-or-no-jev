import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';

const localRequire = createRequire(import.meta.url);
const { Miniflare } = createRequire(localRequire.resolve('wrangler/package.json'))('miniflare');
const files = ['lib/i18n.ts', 'lib/context.ts', 'lib/jev.ts', 'lib/api-handlers.ts', 'lib/usage.ts', 'lib/demo.ts'];
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
  // Test-only dependency injection. Production reads the trusted Sites identity,
  // never these test headers, and secrets are supplied by the runtime environment.
  script: compiled + `\nexport default { async fetch(request, env) {
    const services = {
      apiKey: request.headers.get('X-Test-Disabled') ? undefined : ${JSON.stringify(ownerKey)},
      totalLimit: request.headers.get('X-Test-Limit') ?? '3',
      getDatabase: () => env.DB,
      getUserId: async () => request.headers.get('X-Test-User'),
    };
    if (new URL(request.url).pathname === '/api/demo') return Response.json({state: await getDemoState(services)});
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
  method: 'POST', headers: { Origin: 'https://app.example', 'Content-Type': 'application/json', ...('X-TypeSafe-Key' in extra ? {} : { 'X-Jev-Demo': '1' }), ...(user ? { 'X-Test-User': user } : {}), ...extra }, body: payload,
});
const status = async (user, extra = {}) => (await worker.dispatchFetch('https://app.example/api/demo', { headers: { ...(user ? { 'X-Test-User': user } : {}), ...extra } })).json();
const expectCode = async (response, code) => assert.equal((await response.json()).code, code);

try {
  let database = await worker.getD1Database('DB');
  for (const file of (await readdir('drizzle')).filter(value => value.endsWith('.sql')).sort()) {
    for (const statement of (await readFile(join('drizzle', file), 'utf8')).split('--> statement-breakpoint').filter(value => value.trim())) await database.prepare(statement).run();
  }
  assert.deepEqual(await status(), { state: 'signin' });
  assert.deepEqual(await status('account-a'), { state: 'available' });
  assert.deepEqual(await status('account-a', { 'X-Test-Disabled': '1' }), { state: 'disabled' });
  await expectCode(await dispatch('account-a', { 'X-Test-Disabled': '1' }), 'DEMO_DISABLED');
  await expectCode(await dispatch(), 'DEMO_SIGN_IN_REQUIRED');
  await expectCode(await dispatch('account-a', { Origin: '' }), 'ORIGIN_REJECTED');
  await expectCode(await dispatch('account-a', { Origin: 'https://other.invalid' }), 'ORIGIN_REJECTED');
  await expectCode(await dispatch('account-a', {}, '{}'), 'INVALID_REQUEST');
  await expectCode(await dispatch('account-a', {}, 'x'.repeat(240001)), 'REQUEST_TOO_LARGE');
  for (const cap of ['0', '-1', 'invalid', '1001']) await expectCode(await dispatch('account-a', { 'X-Test-Limit': cap }), 'DEMO_LIMIT_REACHED');
  assert.equal(outgoing.length, 0);
  assert.equal((await database.prepare('SELECT COUNT(*) AS n FROM demo_claims').first()).n, 0);
  console.log('PASS missing secrets, anonymous/cross-origin requests, bad inputs and disabled limits cannot spend owner credits');

  const sameAccount = await Promise.all(Array.from({ length: 12 }, () => dispatch('account-a')));
  assert.equal(sameAccount.filter(response => response.status === 200).length, 1);
  assert.equal(sameAccount.filter(response => response.status === 403).length, 11);
  assert.equal(outgoing.length, 1);
  assert.equal(outgoing[0].authorization, `Bearer ${ownerKey}`);
  const result = await sameAccount.find(response => response.status === 200).text();
  assert.deepEqual(JSON.parse(result), fixture);
  assert.ok(!result.includes(ownerKey));
  assert.deepEqual(await status('account-a'), { state: 'used' });
  console.log('PASS twelve simultaneous attempts by one account produce exactly one upstream call without exposing the secret');

  await worker.dispose(); worker = new Miniflare(options); database = await worker.getD1Database('DB');
  await expectCode(await dispatch('account-a'), 'DEMO_ALREADY_USED');
  assert.equal(outgoing.length, 1);
  console.log('PASS the allowance survives a Worker restart and cannot be reset by refreshing');

  const otherAccounts = await Promise.all(Array.from({ length: 12 }, (_, index) => dispatch(`account-${index}`)));
  assert.equal(otherAccounts.filter(response => response.status === 200).length, 2);
  assert.equal(otherAccounts.filter(response => response.status === 429).length, 10);
  assert.equal(outgoing.length, 3);
  assert.deepEqual(await status('new-account'), { state: 'limit' });
  assert.equal((await database.prepare('SELECT COUNT(*) AS n FROM demo_claims').first()).n, 3);
  console.log('PASS competing accounts cannot exceed the site-wide cap');

  assert.equal((await dispatch(null, { 'X-TypeSafe-Key': 'fake-visitor-key' })).status, 200);
  assert.equal(outgoing.at(-1).authorization, 'Bearer fake-visitor-key');
  assert.equal((await dispatch('account-a', { 'X-TypeSafe-Key': 'fake-visitor-key' })).status, 200);
  const beforeInvalid = outgoing.length;
  await expectCode(await dispatch('account-a', { 'X-TypeSafe-Key': '' }), 'INVALID_KEY');
  assert.equal(outgoing.length, beforeInvalid);
  upstreamStatus = 401;
  await expectCode(await dispatch('account-a', { 'X-TypeSafe-Key': 'invalid-personal-key' }), 'TYPESAFE_ERROR');
  assert.equal(outgoing.at(-1).authorization, 'Bearer invalid-personal-key');
  assert.equal(outgoing.length, beforeInvalid + 1);
  assert.equal((await database.prepare('SELECT COUNT(*) AS n FROM demo_claims').first()).n, 3);
  console.log('PASS personal keys work without sign-in and after demo exhaustion; invalid personal keys never fall back to the owner');

  const failedDemo = await dispatch('failed-account', { 'X-Test-Limit': '4' });
  assert.equal(failedDemo.status, 503);
  await expectCode(failedDemo, 'DEMO_PROVIDER_ERROR');
  const afterFailure = outgoing.length;
  await expectCode(await dispatch('failed-account', { 'X-Test-Limit': '4' }), 'DEMO_ALREADY_USED');
  assert.equal(outgoing.length, afterFailure);
  assert.deepEqual(await status('failed-account', { 'X-Test-Limit': '4' }), { state: 'used' });
  console.log('PASS provider errors consume the reserved attempt and never trigger an automatic retry');

  const columns = await database.prepare('PRAGMA table_info(demo_claims)').all();
  assert.deepEqual(columns.results.map(row => row.name), ['user_hash']);
  const stored = (await database.prepare('SELECT * FROM demo_claims').all()).results;
  assert.equal(stored.length, 4);
  assert.ok(stored.every(row => /^[a-f0-9]{64}$/.test(row.user_hash)));
  assert.doesNotMatch(JSON.stringify(stored), /account-|private-question|fake-owner-key/);
  console.log('PASS quota storage contains only pseudonymous hashes, without questions, identities or credentials');

  await database.prepare('DROP TABLE demo_claims').run();
  upstreamStatus = 200;
  assert.deepEqual(await status('new-account'), { state: 'unavailable' });
  await expectCode(await dispatch('new-account'), 'DEMO_UNAVAILABLE');
  assert.equal(outgoing.length, afterFailure);
  assert.equal((await dispatch(null, { 'X-TypeSafe-Key': 'fake-visitor-key' })).status, 200);
  assert.equal(outgoing.at(-1).authorization, 'Bearer fake-visitor-key');
  console.log('PASS a quota-storage outage blocks sponsored calls while personal-key queries remain usable');
} finally {
  await worker.dispose();
  await rm(directory, { recursive: true, force: true });
}
