'use strict';
/*
 * CONTROLLED live test of the qualification outcome against the REAL GHL webhooks (fictional contacts only).
 * BOTH Cornwall answers are forwarded. Cornwall = No is stored in GHL with a DQ tag but is never a conversion.
 * Needs the dev server in live mode:  SURVEY_DEV_LIVE=1 GHL_SURVEY_*_WEBHOOK_URL=... node tests/survey/dev-server.js 8771
 *   BASE=http://localhost:8771 RUN=<id> OUT=<dir> node tests/survey/live-boundary.js
 * Every outgoing request the endpoint makes is counted by the dev server (GET /__mock/outgoing).
 * Expectation: every submission (Yes or No) = exactly 1 outgoing request. Yes fires one conversion. No fires none.
 * GTM and Meta are stubbed so test traffic never reaches real analytics. The script never reads or prints webhook URLs.
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const BASE = process.env.BASE; const RUN = process.env.RUN; const OUT = process.env.OUT || '/tmp';
const mk = (i, id) => ({ full_name: `ZZ Test ${id} B${RUN}`, phone: `07700 9010${String(i).padStart(2, "0")}`, email: `zz-survey-boundary-${RUN}-${id}@example.com`, street_address: `${i} Boundary Street (fictional)`, city: 'Truro', postcode: 'TR1 2AB' });
const SC = [
  { id: 'l1', c: 'kitchen', a: ['A full new kitchen', 'Before Christmas', 'Yes', 'Yes'], who: mk(1, 'l1'), want: 1, dest: 'thank-you' },
  { id: 'l2', c: 'kitchen', a: ['Not sure yet', 'Just looking for now', 'Yes', 'Yes'], who: mk(2, 'l2'), want: 1, dest: 'thank-you' }, // low priority, Cornwall Yes
  { id: 'l3', c: 'garage', a: ['Home office', 'Attached to the house', 'Yes', 'Yes'], who: mk(3, 'l3'), want: 1, dest: 'thank-you' },
  { id: 'd1', c: 'kitchen', a: ['A full new kitchen', 'Early 2027', 'Yes', 'No'], who: mk(4, 'd1'), want: 1, dest: 'not-in-area', dq: true },
  { id: 'd2', c: 'garage', a: ['Gym', 'Detached', 'Yes', 'No'], who: mk(5, 'd2'), want: 1, dest: 'not-in-area', dq: true },
  { id: 'd3', c: 'kitchen', a: ['Not sure yet', 'Just looking for now', 'No', 'No'], who: mk(6, 'd3'), want: 1, dest: 'not-in-area', dq: true }, // low priority + DQ
];
const out1 = () => fetch(BASE + '/__mock/outgoing').then((r) => r.json()).then((x) => x.n);
(async () => {
  const br = await chromium.launch(); const results = [];
  await fetch(BASE + '/__mock/reset');
  for (const s of SC) {
    if (!s.who) { console.log('skip', s.id, '(no identity supplied)'); continue; }
    const before = await out1();
    const ctx = await br.newContext({ viewport: { width: 390, height: 844 } }); const pg = await ctx.newPage();
    const rec = { id: s.id, campaign: s.c, existingIdentity: !!s.existing, answers: s.a, contact: s.who, api: [], errors: [] };
    pg.on('console', (m) => { if (m.type() === 'error') rec.errors.push(m.text().slice(0, 120)); });
    pg.on('request', (r) => { if (r.url().endsWith('/api/survey-lead')) { rec.idem = r.headers()['idempotency-key']; } });
    pg.on('response', async (r) => { if (r.url().endsWith('/api/survey-lead')) rec.api.push({ status: r.status(), body: await r.json().catch(() => null) }); });
    await pg.route(/googletagmanager\.com|connect\.facebook\.net/, (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await pg.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ contentType: 'text/css', body: '' }));
    await pg.goto(`${BASE}/survey/${s.c}-survey?utm_source=wren-boundary&utm_medium=controlled-test&utm_campaign=b${RUN}&utm_content=${s.id}&utm_term=zz&fbclid=B${RUN}${s.id}`, { waitUntil: 'load' });
    for (const q of s.a) { await pg.getByRole('button', { name: q, exact: true }).first().click(); await pg.waitForTimeout(450); }
    for (const [k, v] of Object.entries(s.who)) await pg.fill(`input[name=${k}]`, v);
    await pg.click('button[type=submit]');
    await pg.waitForURL(new RegExp(`/survey/${s.c}-${s.dest}$`), { timeout: 30000 }).catch(() => {});
    await pg.waitForTimeout(1500);
    rec.finalUrl = pg.url().replace(BASE, ''); rec.outgoingDelta = (await out1()) - before; rec.wantDelta = s.want;
    rec.leadEvents = (await pg.evaluate(() => (window.dataLayer || []).filter((e) => e.event === 'wren_survey_lead'))).length;
    rec.metaLead = (await pg.evaluate(() => (window.fbq && window.fbq.queue ? window.fbq.queue.filter((a) => a[1] === 'Lead').length : 0)));
    rec.token = await pg.evaluate(() => sessionStorage.getItem('wren_conversion'));
    if (s.dq) { // after a DQ, even visiting the thank-you page must fire nothing
      await pg.goto(`${BASE}/survey/${s.c}-thank-you`); await pg.waitForTimeout(1200);
      rec.leadAfterVisitingThankYou = (await pg.evaluate(() => (window.dataLayer || []).filter((e) => e.event === 'wren_survey_lead').length)) + (await pg.evaluate(() => (window.fbq && window.fbq.queue ? window.fbq.queue.filter((a) => a[1] === 'Lead').length : 0)));
    }
    results.push(rec); await ctx.close();
    const body = rec.api[0] && rec.api[0].body;
    const typed = !body || (body.stored_in_ghl === true && body.sales_qualified === !s.dq && body.outcome === (s.dq ? 'disqualified' : 'accepted'));
    const ok = rec.finalUrl.endsWith(s.dest) && rec.outgoingDelta === s.want && typed && (s.dq ? rec.leadEvents === 0 && rec.metaLead === 0 && rec.token === null && rec.leadAfterVisitingThankYou === 0 : rec.leadEvents === 1 && rec.metaLead === 1);
    console.log((ok ? 'PASS ' : 'FAIL ') + s.id, s.c, 'api', JSON.stringify(rec.api.map((a) => a.status + ':' + (a.body && a.body.outcome))), '->', rec.finalUrl, '| outgoing requests', rec.outgoingDelta, '(want ' + s.want + ') | wren_survey_lead', rec.leadEvents, '| Meta Lead', rec.metaLead, s.dq ? '| DQ (stored, no sales)' : '');
  }
  console.log('total outgoing requests this run:', await out1(), '(expected', SC.filter((s) => s.who).reduce((n, s) => n + s.want, 0) + ')');
  fs.writeFileSync(path.join(OUT, 'live-boundary.json'), JSON.stringify(results, null, 1));
  await br.close();
})().catch((e) => { console.error(e.message); process.exit(2); });
