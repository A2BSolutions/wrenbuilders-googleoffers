'use strict';
// Review copies (/review/*): the endpoint they use cannot reach GHL, and the real endpoint refuses them.
const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('fs'); const path = require('path'); const http = require('http');
const reviewHandler = require('../../api/survey-review');
const { createHandler } = require('../../api/survey-lead');
const { createMemoryStore } = require('../../api/_lib/idempotency');
const { startReceiver, startApi, kitchen, garage } = require('./helpers');

function startReview(handler) {
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (/application\/json/i.test(req.headers['content-type'] || '')) { try { req.body = JSON.parse(raw); } catch (e) { req.body = raw; } } else req.body = raw;
      handler(req, res);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const read = async (r) => ({ status: r.status, headers: r.headers, json: await r.json().catch(() => null) });
    resolve({
      origin,
      post: (body, h = {}, raw) => fetch(origin + '/api/survey-review', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, h), body: raw !== undefined ? raw : JSON.stringify(body) }).then(read),
      get: () => fetch(origin + '/api/survey-review').then(read),
      close: () => new Promise((r) => { server.closeAllConnections && server.closeAllConnections(); server.close(r); }),
    });
  }));
}

test('review endpoint: Cornwall Yes and No both return a typed review body, nothing stored, nothing sent', async () => {
  const rx = await startReceiver(); const realFetch = globalThis.fetch; let outgoing = 0; const saved = { k: process.env.GHL_SURVEY_KITCHEN_WEBHOOK_URL, g: process.env.GHL_SURVEY_GARAGE_WEBHOOK_URL };
  // Canary: real-looking webhook env vars pointing at a live mock receiver. The review endpoint must never read or call them.
  process.env.GHL_SURVEY_KITCHEN_WEBHOOK_URL = rx.url('kitchen-canary'); process.env.GHL_SURVEY_GARAGE_WEBHOOK_URL = rx.url('garage-canary');
  const logs = []; const api = await startReview(reviewHandler.createHandler({ log: (e, f) => logs.push({ e, ...f }) }));
  globalThis.fetch = (u, o) => { if (!String(u).startsWith(api.origin)) outgoing++; return realFetch(u, o); };
  try {
    let r = await api.post(kitchen());
    assert.equal(r.status, 200); assert.equal(r.json.ok, true); assert.equal(r.json.review, true); assert.equal(r.json.stored_in_ghl, false); assert.equal(r.json.outcome, 'accepted'); assert.equal(r.json.sales_qualified, true);
    assert.equal(r.headers.get('cache-control'), 'no-store'); assert.match(r.headers.get('x-robots-tag'), /noindex/);
    const dq = kitchen(); dq.answers.in_cornwall = 'No';
    r = await api.post(dq); assert.equal(r.json.outcome, 'disqualified'); assert.equal(r.json.sales_qualified, false); assert.equal(r.json.stored_in_ghl, false); assert.equal(r.json.review, true);
    r = await api.post(garage()); assert.equal(r.json.outcome, 'accepted');
    const gdq = garage(); gdq.answers.in_cornwall = 'No'; r = await api.post(gdq); assert.equal(r.json.outcome, 'disqualified');
    assert.equal(outgoing, 0, 'no outgoing request'); assert.equal(rx.state.calls.length, 0, 'the receiver saw nothing');
    assert.equal(logs.length, 4); assert.ok(!JSON.stringify(logs).match(/Alex|Tester|example\.com|7700|Secret|tr1|Truro|Gail/i), 'the log holds no personal data');
  } finally { globalThis.fetch = realFetch; for (const [k, v] of [['GHL_SURVEY_KITCHEN_WEBHOOK_URL', saved.k], ['GHL_SURVEY_GARAGE_WEBHOOK_URL', saved.g]]) v === undefined ? delete process.env[k] : (process.env[k] = v); await api.close(); await rx.close(); }
});

test('review endpoint: same validation as the real one, and method and content-type gates', async () => {
  const api = await startReview(reviewHandler);
  try {
    const bad = kitchen(); bad.contact.email = 'not-an-email';
    let r = await api.post(bad); assert.equal(r.status, 400); assert.equal(r.json.error, 'INVALID_PAYLOAD'); assert.equal(r.json.review, true);
    r = await api.post(null, {}, '{not json'); assert.equal(r.status, 400); assert.equal(r.json.error, 'INVALID_JSON');
    r = await api.post(kitchen(), { 'Content-Type': 'text/plain' }); assert.equal(r.status, 415);
    r = await api.get(); assert.equal(r.status, 405);
    r = await api.post({ x: 'y'.repeat(30000) }); assert.equal(r.status, 413);
  } finally { await api.close(); }
});

test('review endpoint source: no environment, no network, no store, no webhook code (by construction)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'api', 'survey-review.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const bad of [/process\.env/, /\bfetch\s*\(/, /leadconnector/i, /GHL_/, /webhook/i, /idempotency/i, /require\(['"](https?|net|node:http|node:https)['"]\)/, /XMLHttpRequest/]) assert.ok(!bad.test(src), `forbidden: ${bad}`);
  const requires = [...src.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
  assert.deepEqual(requires, ['./_lib/survey-core']);
  assert.match(fs.readFileSync(path.join(__dirname, '..', '..', 'api', 'survey-review.js'), 'utf8'), /\{ validatePayload, isQualified \} = require/);
});

async function realSetup() {
  const rx = await startReceiver(); const outgoing = { n: 0 };
  const handler = createHandler({ env: { GHL_SURVEY_KITCHEN_WEBHOOK_URL: rx.url('kitchen-test'), GHL_SURVEY_GARAGE_WEBHOOK_URL: rx.url('garage-test') }, store: createMemoryStore({ leaseMs: 30000 }), fetchImpl: (u, o) => { outgoing.n++; return fetch(u, o); }, forwardTimeoutMs: 400, log: () => {}, ghl: { allowedHosts: ['127.0.0.1'], allowHttp: true } });
  const api = await startApi(handler);
  return { rx, api, outgoing, close: async () => { await api.close(); await rx.close(); } };
}

test('REAL endpoint refuses a request from a /review page (server-side backstop), sends nothing, still serves live pages', async () => {
  const t = await realSetup();
  try {
    for (const ref of ['/review/kitchen', '/review/garage/thank-you', '/review']) {
      const r = await t.api.post(kitchen(), { Referer: t.api.origin + ref });
      assert.equal(r.status, 403, ref); assert.equal(r.json.error, 'REVIEW_COPY_CANNOT_SUBMIT');
    }
    let r = await t.api.post(garage(), { 'X-Wren-Review': '1' }); assert.equal(r.status, 403);
    assert.equal(t.outgoing.n, 0); assert.equal(t.rx.state.calls.length, 0);
    // control: a live page referer is unaffected
    r = await t.api.post(kitchen(), { Referer: t.api.origin + '/survey/kitchen-survey' }); assert.equal(r.status, 200); assert.equal(r.json.stored_in_ghl, true);
    assert.equal(t.outgoing.n, 1);
    // a path that only starts with the word is not a review page
    r = await t.api.post(kitchen(), { Referer: t.api.origin + '/reviews-of-us' }); assert.equal(r.status, 200);
  } finally { await t.close(); }
});
