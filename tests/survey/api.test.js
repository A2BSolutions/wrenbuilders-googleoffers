'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('../../api/survey-lead');
const { createMemoryStore } = require('../../api/_lib/idempotency');
const { startReceiver, startApi, kitchen, garage, uuid } = require('./helpers');

async function setup(over = {}) {
  const rx = await startReceiver();
  const logs = [];
  const clock = { t: Date.parse('2026-11-10T10:00:00Z') };
  const env = Object.assign({
    GHL_SURVEY_KITCHEN_WEBHOOK_URL: rx.url('kitchen-test'),
    GHL_SURVEY_GARAGE_WEBHOOK_URL: rx.url('garage-test'),
  }, over.env);
  const store = over.store || createMemoryStore({ leaseMs: 30000 });
  const handler = createHandler({ env, store, now: () => clock.t, forwardTimeoutMs: over.timeout || 400, log: (e, f) => logs.push({ evt: e, ...f }), ghl: { allowedHosts: ['127.0.0.1'], allowHttp: true } });
  const api = await startApi(handler);
  return { rx, api, logs, clock, close: async () => { await api.close(); await rx.close(); } };
}

test('success: kitchen forwards once to the kitchen webhook and returns ok:true', async () => {
  const t = await setup();
  const r = await t.api.post(kitchen());
  assert.equal(r.status, 200); assert.deepEqual(r.json, { ok: true });
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(t.rx.state.calls.length, 1);
  assert.equal(t.rx.state.calls[0].url, '/hooks/kitchen-test');
  assert.equal(t.rx.state.calls[0].body.survey_campaign, 'kitchen');
  assert.equal(t.rx.state.calls[0].body.phone, '+447700900123');
  await t.close();
});

test('success: garage goes to the garage webhook, qualified and out of area', async () => {
  const t = await setup();
  const q = await t.api.post(garage());
  assert.equal(q.status, 200);
  const o = garage(); o.answers.in_cornwall = 'No';
  const r = await t.api.post(o); assert.equal(r.status, 200);
  assert.equal(t.rx.state.calls.length, 2);
  assert.ok(t.rx.state.calls.every((c) => c.url === '/hooks/garage-test'));
  assert.deepEqual(t.rx.state.calls[0].body.tags, []);
  assert.deepEqual(t.rx.state.calls[1].body.tags, ['DQ - outside Cornwall']);
  assert.equal(t.rx.state.calls[1].body.survey_qualified, false);
  await t.close();
});

test('kitchen low priority and combined tags reach the receiver', async () => {
  const t = await setup();
  const a = kitchen(); a.answers.fitting_timeframe = 'Just looking for now';
  const b = kitchen(); b.answers.fitting_timeframe = 'Just looking for now'; b.answers.in_cornwall = 'No';
  assert.equal((await t.api.post(a)).status, 200); assert.equal((await t.api.post(b)).status, 200);
  assert.deepEqual(t.rx.state.calls[0].body.tags, ['Low priority']);
  assert.deepEqual(t.rx.state.calls[1].body.tags, ['DQ - outside Cornwall', 'Low priority']);
  await t.close();
});

test('request gates: method, origin, content-type, json, size, invalid payload, idempotency header', async () => {
  const t = await setup();
  assert.equal((await t.api.raw('GET', {})).status, 405);
  assert.equal((await t.api.post(kitchen(), { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await t.api.post(kitchen(), { Origin: '' })).status, 403);
  assert.equal((await t.api.post(kitchen(), { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await t.api.post(kitchen(), {}, '{not json')).status, 400);
  const big = kitchen(); big.contact.street_address = 'x'.repeat(200); big.attribution.referrer = 'y'.repeat(500);
  big.attribution.utm_source = 'z'.repeat(20000);
  assert.equal((await t.api.post(big)).status, 413);
  const inv = kitchen(); inv.contact.email = 'private-value@bad'; inv.contact.phone = 'PRIVATE';
  const r = await t.api.post(inv); assert.equal(r.status, 400); assert.equal(r.json.error, 'INVALID_PAYLOAD');
  assert.ok(!JSON.stringify(r.json).includes('private') && !JSON.stringify(r.json).includes('PRIVATE'));
  assert.equal((await t.api.post(kitchen(), { 'Idempotency-Key': uuid() })).json.error, 'IDEMPOTENCY_MISMATCH');
  assert.equal((await t.api.post(kitchen(), { 'Idempotency-Key': '' })).json.error, 'IDEMPOTENCY_MISMATCH');
  assert.equal(t.rx.state.calls.length, 0, 'nothing may reach GHL for rejected requests');
  await t.close();
});

test('fail closed: webhook not configured or not allowed returns 503 and forwards nothing', async () => {
  let t = await setup({ env: { GHL_SURVEY_KITCHEN_WEBHOOK_URL: '' } });
  let r = await t.api.post(kitchen()); assert.equal(r.status, 503); assert.equal(r.json.ok, false); assert.equal(r.json.error, 'NOT_CONFIGURED');
  assert.equal((await t.api.post(garage())).status, 200, 'garage still configured');
  await t.close();
  t = await setup({ env: { GHL_SURVEY_KITCHEN_WEBHOOK_URL: 'https://evil.example/hooks/x' } });
  r = await t.api.post(kitchen()); assert.equal(r.status, 503); assert.equal(t.rx.state.calls.length, 0);
  await t.close();
  t = await setup({ env: { GHL_SURVEY_KITCHEN_WEBHOOK_URL: 'not a url' } });
  assert.equal((await t.api.post(kitchen())).status, 503); await t.close();
  t = await setup({ env: { SURVEY_IDEMPOTENCY_STORE: 'redis' }, store: null });
  // unknown store kind with no injected store must fail closed
  const h = createHandler({ env: { SURVEY_IDEMPOTENCY_STORE: 'redis', GHL_SURVEY_KITCHEN_WEBHOOK_URL: t.rx.url('k') }, ghl: { allowedHosts: ['127.0.0.1'], allowHttp: true }, log: () => {} });
  const api2 = await startApi(h); assert.equal((await api2.post(kitchen())).status, 503); await api2.close(); await t.close();
});

test('real default config rejects a non-https or non-LeadConnector URL', async () => {
  const rx = await startReceiver();
  const h = createHandler({ env: { GHL_SURVEY_KITCHEN_WEBHOOK_URL: rx.url('k') }, log: () => {} }); // default ghl: https + services.leadconnectorhq.com only
  const api = await startApi(h);
  assert.equal((await api.post(kitchen())).status, 503); assert.equal(rx.state.calls.length, 0);
  await api.close(); await rx.close();
});

test('GHL 500, redirect, unreachable and timeout all fail closed; same submission_id then succeeds on retry', async () => {
  const t = await setup();
  const p = kitchen();
  t.rx.state.mode = '500';
  let r = await t.api.post(p); assert.equal(r.status, 502); assert.equal(r.json.ok, false); assert.equal(r.json.error, 'UPSTREAM_REJECTED');
  t.rx.state.mode = 'redirect';
  r = await t.api.post(p); assert.equal(r.status, 502); assert.equal(r.json.ok, false);
  t.rx.state.mode = 'hang';
  r = await t.api.post(p); assert.equal(r.status, 504); assert.equal(r.json.error, 'UPSTREAM_TIMEOUT');
  t.rx.state.mode = 'ok';
  r = await t.api.post(p); assert.equal(r.status, 200); assert.deepEqual(r.json, { ok: true });
  assert.equal(t.rx.state.calls.length, 4, '3 failed attempts + 1 success');
  assert.ok(t.rx.state.calls.every((c) => c.body.survey_submission_id === p.submission_id), 'submission_id stable across retries');
  await t.close();
  // unreachable receiver
  const t2 = await setup(); await t2.rx.close();
  r = await t2.api.post(kitchen()); assert.equal(r.status, 502); assert.equal(r.json.error, 'UPSTREAM_UNREACHABLE'); assert.equal(r.json.ok, false);
  await t2.api.close();
});

test('duplicate after success: ok:true, GHL is not called again', async () => {
  const t = await setup();
  const p = kitchen();
  assert.deepEqual((await t.api.post(p)).json, { ok: true });
  const r = await t.api.post(p); assert.equal(r.status, 200); assert.equal(r.json.ok, true); assert.equal(r.json.duplicate, true);
  assert.equal(t.rx.state.calls.length, 1);
  // same id on the other campaign key is a different submission
  await t.close();
});

test('concurrent duplicate while the first is in flight returns 409 IN_PROGRESS, then only one lead is sent', async () => {
  const t = await setup({ timeout: 3000 });
  let open; t.rx.state.gate = new Promise((r) => (open = r));
  const p = kitchen();
  const first = t.api.post(p);
  await new Promise((r) => setTimeout(r, 150));
  const second = await t.api.post(p);
  assert.equal(second.status, 409); assert.equal(second.json.ok, false); assert.equal(second.json.error, 'IN_PROGRESS'); assert.equal(second.headers.get('retry-after'), '2');
  open(); const f = await first; assert.equal(f.status, 200);
  assert.equal(t.rx.state.calls.length, 1);
  assert.equal((await t.api.post(p)).json.duplicate, true);
  await t.close();
});

test('lease expiry after a lost attempt: takeover re-forwards (at-least-once, in doubt) and is logged', async () => {
  const t = await setup({ timeout: 5000 });
  t.rx.state.mode = 'hang';
  const p = kitchen();
  const lost = t.api.post(p).catch(() => null); // first attempt never answered
  await new Promise((r) => setTimeout(r, 150));
  t.rx.state.mode = 'ok';
  t.clock.t += 31000; // lease (30s) has expired
  const r = await t.api.post(p);
  assert.equal(r.status, 200); assert.equal(t.rx.state.calls.length, 2);
  assert.ok(t.logs.some((l) => l.evt === 'takeover_in_doubt'));
  assert.equal((await t.api.post(p)).json.duplicate, true);
  await t.rx.close(); await t.api.close(); await lost;
});

test('no PII in logs or in error responses', async () => {
  const t = await setup();
  const out = []; const orig = console.log; console.log = (...a) => out.push(a.join(' '));
  try {
    const p = kitchen(); await t.api.post(p);
    t.rx.state.mode = '500'; await t.api.post(kitchen());
    const bad = kitchen(); bad.contact.email = 'leak-me@bad'; await t.api.post(bad);
  } finally { console.log = orig; }
  const all = JSON.stringify(t.logs);
  for (const secret of ['alex.tester', 'Alex', 'Tester', '07700', '447700', 'Secret Lane', 'TR1 2', 'tr1 2ab', 'leak-me', 'fb.1.2.3', 'abc', 'hooks/kitchen-test', '127.0.0.1:']) assert.ok(!all.includes(secret), 'log leaked: ' + secret);
  assert.ok(t.logs.every((l) => Object.keys(l).every((k) => ['evt', 'status', 'ms', 'campaign', 'submission_id', 'reason', 'fields', 'kind', 'upstream_status', 'attempts', 'name'].includes(k))), 'only whitelisted log keys');
  await t.close();
});

test('memory store state machine', async () => {
  const s = createMemoryStore({ leaseMs: 1000, doneTtlMs: 5000 });
  const a = await s.begin('k', 0); assert.equal(a.outcome, 'claimed');
  assert.equal((await s.begin('k', 500)).outcome, 'in_progress');
  const b = await s.begin('k', 1500); assert.equal(b.outcome, 'takeover'); assert.equal(b.attempts, 2);
  await s.release('k', a.token); // stale owner must not release the new lease
  assert.equal((await s.begin('k', 1600)).outcome, 'in_progress');
  await s.complete('k', b.token, 1700); assert.equal((await s.begin('k', 1800)).outcome, 'done');
  assert.equal((await s.begin('k', 7000)).outcome, 'claimed', 'done record expires');
  const c = await s.begin('z', 0); await s.release('z', c.token); assert.equal((await s.begin('z', 1)).outcome, 'claimed');
  assert.equal(s.durable, false);
});
