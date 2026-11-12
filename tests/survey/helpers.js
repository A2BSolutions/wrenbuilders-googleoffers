'use strict';
// Test helpers: a mock GHL receiver and a tiny HTTP wrapper that behaves like a Vercel Node function (parsed JSON body).
const http = require('http');

function startReceiver() {
  const state = { calls: [], mode: 'ok', gate: null };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', async () => {
      state.calls.push({ url: req.url, headers: req.headers, body: JSON.parse(raw || '{}') });
      if (state.gate) await state.gate;
      if (state.mode === 'hang') return; // never answers
      if (state.mode === '500') { res.writeHead(500); return res.end('err'); }
      if (state.mode === 'redirect') { res.writeHead(302, { Location: 'http://example.invalid/' }); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"status":"ok"}');
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    resolve({ state, port, url: (p) => `http://127.0.0.1:${port}/hooks/${p}`, close: () => new Promise((r) => { server.closeAllConnections && server.closeAllConnections(); server.close(r); }) });
  }));
}

function startApi(handler) {
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (/application\/json/i.test(req.headers['content-type'] || '')) { try { req.body = JSON.parse(raw); } catch (e) { req.body = raw; } } else req.body = raw;
      handler(req, res);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    const origin = `http://127.0.0.1:${port}`;
    resolve({
      port, origin,
      post(body, headers = {}, raw) {
        const id = body && body.submission_id;
        return fetch(origin + '/api/survey-lead', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json', Origin: origin, 'Idempotency-Key': id || '' }, headers),
          body: raw !== undefined ? raw : JSON.stringify(body),
        }).then(async (r) => ({ status: r.status, headers: r.headers, json: await r.json().catch(() => null) }));
      },
      raw(method, headers) { return fetch(origin + '/api/survey-lead', { method, headers }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) })); },
      close: () => new Promise((r) => { server.closeAllConnections && server.closeAllConnections(); server.close(r); }),
    });
  }));
}

let n = 0;
function uuid() { n += 1; const h = (n.toString(16)).padStart(12, '0'); return `aaaaaaaa-bbbb-4ccc-8ddd-${h}`; }

function kitchen(over = {}) {
  return Object.assign({
    schema_version: '1.0', submission_id: uuid(), campaign: 'kitchen', offer: '1000-appliance-upgrade', lead_source: 'Meta',
    contact: { full_name: 'Alex Tester Jones', first_name: 'Alex', phone: '07700 900123', email: 'alex.tester@example.com', street_address: '12 Secret Lane', city: 'Truro', postcode: 'tr1 2ab' },
    answers: { kitchen_type: 'A full new kitchen', fitting_timeframe: 'Before Christmas', owns_property: 'Yes', in_cornwall: 'Yes' },
    attribution: { page_url: 'https://go.wren-builders.online/survey/kitchen-survey?utm_source=x', utm_source: 'facebook', utm_medium: 'paid', utm_campaign: 'c1', utm_content: '', utm_term: '', fbclid: 'abc', fbp: 'fb.1.2.3', fbc: '', referrer: '' },
    submission_timestamp: '2026-11-10T10:00:00.000Z',
  }, over);
}
function garage(over = {}) {
  return Object.assign({
    schema_version: '1.0', submission_id: uuid(), campaign: 'garage', offer: 'free-ac-unit', lead_source: 'Meta',
    contact: { full_name: 'Gail Garage', first_name: 'Gail', phone: '+44 7700 900456', email: 'gail.garage@example.com', street_address: '5 Hidden Close', city: 'Falmouth', postcode: 'TR11 3AA' },
    answers: { conversion_use: 'Home office', garage_type: 'Attached to the house', owns_property: 'Yes', in_cornwall: 'Yes' },
    attribution: { page_url: 'https://go.wren-builders.online/survey/garage-survey', utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '', fbclid: '', fbp: '', fbc: '', referrer: '' },
    submission_timestamp: '2026-11-10T10:00:00.000Z',
  }, over);
}
const clone = (o) => JSON.parse(JSON.stringify(o));
module.exports = { startReceiver, startApi, kitchen, garage, uuid, clone };
