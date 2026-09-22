import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';

const localRequire = createRequire(import.meta.url);
const wranglerRequire = createRequire(localRequire.resolve('wrangler/package.json'));
const { Miniflare } = wranglerRequire('miniflare');
const files = ['lib/i18n.ts', 'lib/context.ts', 'lib/jev.ts', 'lib/api-handlers.ts', 'lib/usage.ts'];
const source = (await Promise.all(files.map(file => readFile(file, 'utf8')))).map(value => value.replace(/^import .* from .*;\n/gm, '')).join('\n');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/^export /gm, '');
const choice = (chosen, options) => ({ type: 'choice', choice: chosen, probabilities: Object.fromEntries(options.map(value => [value, value === chosen ? 1 : 0])) });
const fixture = { model: 'counter-test-fixture', answers: { answer: { type: 'noul', noul: .9 }, form: choice('binary', ['binary', 'open', 'ambiguous']), basis: choice('stable', ['stable', 'supplied', 'current', 'missing', 'calculation']) } };
let upstreamStatus = 200;
let upstreamResponse = fixture;
const directory = await mkdtemp(join(tmpdir(), 'jev-usage-test-'));
const options = {
  modules: true, compatibilityDate: '2026-05-15', d1Databases: { DB: 'usage-counter-test' }, d1Persist: directory,
  script: compiled + `\nexport default { fetch(request, env) {
    if (new URL(request.url).pathname === '/api/usage') return handleUsage(() => env.DB);
    return handleJev(request, data => recordCompletedQuery(env.DB, data));
  } };`,
  outboundService() { return Response.json(upstreamResponse, { status: upstreamStatus }); },
};
let worker = new Miniflare(options);
const body = JSON.stringify({ model: 'jev-latest', state: 'private-marker-that-must-not-be-saved', questions: { answer: { type: 'noul', instructions: 'Test?' } } });
const dispatch = (key = 'test-only-not-a-real-key') => worker.dispatchFetch('https://app.example/api/jev', { method: 'POST', headers: { Origin: 'https://app.example', 'Content-Type': 'application/json', 'X-TypeSafe-Key': key }, body });
const usage = () => worker.dispatchFetch('https://app.example/api/usage');
const total = async () => (await (await usage()).json()).total;

try {
  const database = await worker.getD1Database('DB');
  for (const file of (await readdir('drizzle')).filter(value => value.endsWith('.sql')).sort()) {
    for (const statement of (await readFile(join('drizzle', file), 'utf8')).split('--> statement-breakpoint').filter(value => value.trim())) await database.prepare(statement).run();
  }
  assert.equal(await total(), 0);
  assert.equal(await total(), 0);
  console.log('PASS a new counter starts at zero and page/stat reads do not increment it');

  assert.equal((await dispatch('')).status, 401);
  upstreamStatus = 401;
  assert.equal((await dispatch()).status, 401);
  upstreamStatus = 200; upstreamResponse = { answers: {} };
  assert.equal((await dispatch()).status, 200);
  assert.equal(await total(), 0);
  console.log('PASS missing keys, provider errors and invalid results are not counted');

  upstreamResponse = fixture;
  const response = await dispatch();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), fixture);
  assert.equal(await total(), 1);
  console.log('PASS a valid answer is delivered unchanged and counted once');

  const concurrent = await Promise.all(Array.from({ length: 8 }, () => dispatch()));
  assert.ok(concurrent.every(response => response.status === 200));
  assert.equal(await total(), 9);
  upstreamResponse = { ...fixture, answers: { ...fixture.answers, answer: { type: 'noul', noul: .5 } } };
  await dispatch();
  assert.equal(await total(), 10);
  console.log('PASS concurrent increments are atomic and inconclusive answers also count');

  const columns = await database.prepare('PRAGMA table_info(usage_totals)').all();
  assert.deepEqual(columns.results.map(row => row.name), ['id', 'completed_queries']);
  assert.deepEqual((await database.prepare('SELECT * FROM usage_totals').all()).results, [{ id: 1, completed_queries: 10 }]);
  assert.equal((await usage()).headers.get('Cache-Control'), 'no-store');
  console.log('PASS only a single aggregate number is persisted and reads are not cached');

  await worker.dispose();
  worker = new Miniflare(options);
  assert.equal(await total(), 10);
  console.log('PASS the total survives a Worker restart');

  await (await worker.getD1Database('DB')).prepare('DROP TABLE usage_totals').run();
  const whileUnavailable = await dispatch();
  assert.equal(whileUnavailable.status, 200);
  assert.deepEqual(await whileUnavailable.json(), upstreamResponse);
  const unavailable = await usage();
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).code, 'COUNTER_UNAVAILABLE');
  console.log('PASS a storage outage preserves the Jev answer and reports the counter as unavailable');
} finally {
  await worker.dispose();
  await rm(directory, { recursive: true, force: true });
}
