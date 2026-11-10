'use strict';
/*
 * Local stand-in for Vercel, for tests only. Applies the real vercel.json redirects, rewrites and headers,
 * serves static files, and mounts api/survey-lead.js against a MOCK GHL receiver. Not a proof of GHL persistence.
 * Usage: node tests/survey/dev-server.js [port]
 * Mock control: GET /__mock/reset, GET /__mock/mode?m=ok|500|redirect|hang, GET /__mock/calls
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const { createHandler } = require('../../api/survey-lead');
const { startReceiver } = require('./helpers');

const MT = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.md': 'text/markdown', '.json': 'application/json' };
const toRe = (src) => new RegExp('^' + src.split('(.*)').map((x) => x.replace(/[.+?^${}|[\]\\()]/g, '\\$&')).join('(.*)') + '$');

async function main() {
  const port = Number(process.argv[2] || 8766);
  // SURVEY_DEV_LIVE=1: use the REAL webhook env vars (GHL_SURVEY_*_WEBHOOK_URL) and the production URL rules. Controlled tests only.
  // /__mock/failnext?n=1 makes the next n upstream deliveries fail with a network error (to test failure and safe retry).
  const live = process.env.SURVEY_DEV_LIVE === '1';
  const rx = await startReceiver();
  let failNext = 0;
  const outgoing = { n: 0 }; // request instrumentation: EVERY upstream request the endpoint makes (GET /__mock/outgoing)
  const fetchImpl = async (u, o) => { outgoing.n++; if (failNext > 0) { failNext--; throw new TypeError('simulated network failure'); } return fetch(u, o); };
  const handler = live
    ? createHandler({ env: process.env, fetchImpl }) // default log: whitelisted JSON, no PII
    : createHandler({
      env: { GHL_SURVEY_KITCHEN_WEBHOOK_URL: rx.url('kitchen-e2e'), GHL_SURVEY_GARAGE_WEBHOOK_URL: rx.url('garage-e2e') },
      forwardTimeoutMs: 1500, fetchImpl, ghl: { allowedHosts: ['127.0.0.1'], allowHttp: true }, log: () => {},
    });
  http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); const p = u.pathname;
    if (p === '/__mock/reset') { rx.state.calls.length = 0; rx.state.mode = 'ok'; outgoing.n = 0; failNext = 0; return res.end('ok'); }
    if (p === '/__mock/outgoing') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ n: outgoing.n })); }
    if (p === '/__mock/mode') { rx.state.mode = u.searchParams.get('m'); return res.end('ok'); }
    if (p === '/__mock/failnext') { failNext = Number(u.searchParams.get('n') || 1); return res.end('ok'); }
    if (p === '/__mock/calls') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(rx.state.calls)); }
    if (p === '/api/survey-lead') {
      let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
        if (/application\/json/i.test(req.headers['content-type'] || '')) { try { req.body = JSON.parse(raw); } catch (e) { req.body = raw; } } else req.body = raw;
        handler(req, res);
      }); return;
    }
    for (const r of cfg.redirects || []) if (toRe(r.source).test(p)) { res.writeHead(r.permanent ? 308 : 307, { Location: r.destination + u.search }); return res.end(); }
    let file = p;
    for (const r of cfg.rewrites || []) if (toRe(r.source).test(p)) { file = r.destination; break; }
    let f = path.join(root, decodeURIComponent(file));
    if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    const headers = {};
    for (const h of cfg.headers || []) if (toRe(h.source).test(p)) for (const kv of h.headers) headers[kv.key] = kv.value;
    if (!fs.existsSync(f)) { res.writeHead(404, headers); return res.end('not found'); }
    headers['content-type'] = MT[path.extname(f)] || 'application/octet-stream';
    res.writeHead(200, headers); fs.createReadStream(f).pipe(res);
  }).listen(port, () => console.log('dev server on ' + port));
}
main();
