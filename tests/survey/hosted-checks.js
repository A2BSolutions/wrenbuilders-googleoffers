'use strict';
/*
 * Checks against a HOSTED Vercel preview (routes, headers, API gates). Nothing here reaches GHL.
 *   VERCEL_SHARE=<temporary deployment share secret> BASE=https://<deployment> node tests/survey/hosted-checks.js
 * The secret comes from the environment only and is never printed.
 */
const { chromium } = require('playwright');
const BASE = process.env.BASE; const SHARE = process.env.VERCEL_SHARE;
const res = []; const check = (n, ok, d) => { res.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : '  -> ' + JSON.stringify(d))); };
const ROUTES = ['kitchen-survey', 'kitchen-thank-you', 'kitchen-not-in-area', 'garage-survey', 'garage-thank-you', 'garage-not-in-area'];
const good = () => ({ schema_version: '1.0', submission_id: 'aaaaaaaa-bbbb-4ccc-8ddd-000000000001', campaign: 'kitchen', offer: '1000-appliance-upgrade', lead_source: 'Meta',
  contact: { full_name: 'ZZ Gate Test', first_name: 'ZZ', phone: '07700 900799', email: 'zz-gate@example.com', street_address: '1 Gate Street', city: 'Truro', postcode: 'TR1 2AB' },
  answers: { kitchen_type: 'A full new kitchen', fitting_timeframe: 'Before Christmas', owns_property: 'Yes', in_cornwall: 'Yes' }, attribution: {}, submission_timestamp: new Date().toISOString() });
(async () => {
  const br = await chromium.launch(); const ctx = await br.newContext(); const pg = await ctx.newPage();
  await pg.goto(`${BASE}/?_vercel_share=${SHARE}`).catch(() => {});
  const get = (p, o) => ctx.request.get(BASE + p, Object.assign({ maxRedirects: 0 }, o));
  const origin = BASE; const api = BASE + '/api/survey-lead';
  const post = (body, h, raw) => ctx.request.post(api, { headers: Object.assign({ 'Content-Type': 'application/json', Origin: origin, 'Idempotency-Key': body && body.submission_id || '' }, h), data: raw !== undefined ? raw : JSON.stringify(body), maxRedirects: 0 });

  for (const r of ROUTES) {
    const x = await get('/survey/' + r); const t = await x.text();
    check(`hosted route /survey/${r}: 200`, x.status() === 200, x.status());
    check(`hosted route /survey/${r}: X-Robots-Tag noindex, nofollow`, /noindex, nofollow/.test(x.headers()['x-robots-tag'] || ''), x.headers()['x-robots-tag']);
    check(`hosted route /survey/${r}: meta noindex + GTM-KF4RWHHQ + absolute asset paths`, /name="robots" content="noindex, nofollow"/.test(t) && t.includes('GTM-KF4RWHHQ') && !/src="assets\//.test(t));
  }
  for (const f of ['/survey/vendor/react.production.min.js', '/survey/vendor/react-dom.production.min.js', '/survey/wren-funnel.js', '/survey/support.js', '/survey/assets/kitchen-hero.webp']) { const x = await get(f); check(`hosted asset ${f}: 200`, x.status() === 200, x.status()); }
  const ts = await get('/survey/kitchen-survey/'); console.log('INFO trailing-slash /survey/kitchen-survey/ ->', ts.status());
  const dot = await get('/survey/kitchen-survey.html'); console.log('INFO /survey/kitchen-survey.html ->', dot.status(), dot.headers()['x-robots-tag'] || '');

  // existing funnels: behaviour unchanged
  const k = await get('/kitchen'); check('regression /kitchen 200', k.status() === 200, k.status());
  const g = await get('/garage-conversion'); check('regression /garage-conversion 307 -> /garage-conversion/', g.status() === 307 && g.headers().location === '/garage-conversion/', [g.status(), g.headers().location]);
  const g2 = await get('/garage-conversion/'); check('regression /garage-conversion/ 200', g2.status() === 200, g2.status());
  for (const p of ['/kitchen/thank-you', '/kitchen/thank-you/', '/garage-conversion/thank-you', '/garage-conversion/thank-you/']) { const x = await get(p); check(`regression ${p}: 200/307 and X-Robots-Tag noindex`, [200, 307].includes(x.status()) && /^noindex$/.test(x.headers()['x-robots-tag'] || ''), [x.status(), x.headers()['x-robots-tag']]); }
  const root = await get('/'); check('regression / is 404 (no root page)', root.status() === 404, root.status());

  // API gates (none reach GHL)
  let x = await ctx.request.get(api, { headers: { Origin: origin } }); check('api GET -> 405', x.status() === 405, x.status());
  x = await post(good(), { Origin: '' }); check('api POST without Origin -> 403', x.status() === 403, x.status());
  x = await post(good(), { Origin: 'https://evil.example' }); check('api POST foreign Origin -> 403', x.status() === 403, x.status());
  x = await post(good(), { 'Content-Type': 'text/plain' }); check('api POST text/plain -> 415', x.status() === 415, x.status());
  x = await post(null, {}, '{not json'); check('api POST invalid JSON -> 400', x.status() === 400, x.status());
  const bad = good(); bad.contact.phone = '01872 613608'; bad.contact.email = 'private-value@bad';
  x = await post(bad); let j = await x.json(); check('api POST invalid payload -> 400, field names only', x.status() === 400 && j.error === 'INVALID_PAYLOAD' && !JSON.stringify(j).includes('private-value'), [x.status(), j]);
  const off = good(); off.offer = 'free-ac-unit'; x = await post(off); check('api POST offer/campaign mismatch -> 400', x.status() === 400, x.status());
  x = await post(good(), { 'Idempotency-Key': 'aaaaaaaa-bbbb-4ccc-8ddd-000000000002' }); j = await x.json(); check('api POST idempotency mismatch -> 400', x.status() === 400 && j.error === 'IDEMPOTENCY_MISMATCH', [x.status(), j]);
  // Qualification boundary on the hosted function: invalid Cornwall values fail closed (400), valid submissions of either answer are exercised by hosted-boundary.js (they reach GHL).
  const BADS = [undefined, null, '', 'yes', 'YES', ' Yes', 'Yes ', 'no', 'NO', 'No ', 'Maybe', 'true', true, false, 1, ['Yes'], ['No'], {}];
  let allBad = true; const badDetail = [];
  for (const v of BADS) {
    const p = good(); if (v === undefined) delete p.answers.in_cornwall; else p.answers.in_cornwall = v;
    const r = await post(p); const j = await r.json().catch(() => ({}));
    const ok = r.status() === 400 && j.ok === false && j.error === 'INVALID_PAYLOAD' && j.outcome === undefined && (j.fields || []).includes('answers.in_cornwall');
    if (!ok) { allBad = false; badDetail.push([JSON.stringify(v), r.status(), j.error]); }
  }
  check(`api invalid or missing Cornwall value (${BADS.length} variants) -> 400 INVALID_PAYLOAD, never accepted or disqualified`, allBad, badDetail);
  // Valid Cornwall = No is NOT posted here: it is forwarded to GHL and would create a contact. See hosted-boundary.js.
  check('api responses are no-store', (await ctx.request.get(api)).headers()['cache-control'] === 'no-store');
  await br.close();
  const bad2 = res.filter((r) => !r).length; console.log(`\n${res.length - bad2}/${res.length} hosted checks passed`); process.exit(bad2 ? 1 : 0);
})().catch((e) => { console.error(e.message); process.exit(2); });
