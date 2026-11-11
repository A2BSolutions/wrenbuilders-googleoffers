'use strict';
/*
 * HOSTED preview test (real Vercel function -> real GHL receivers). BOTH Cornwall answers are forwarded and stored; only Yes is a conversion.
 * Fictional contacts only. Run this ONLY after the receiver/payload contract has been agreed with Codex.
 *   VERCEL_SHARE=<temporary deployment share secret> BASE=https://<deployment> RUN=<id> OUT=<dir> node tests/survey/hosted-boundary.js
 * The secret comes from the environment only and is never printed. GTM and Meta are stubbed in the browser.
 * Evidence per scenario: typed response, redirect, tracking events, the function's runtime logs ('accepted' / 'accepted_dq' per
 * submission id) and GHL readback (contact, fields, DQ tag, no opportunity). HTTP 2xx from GHL means webhook receipt, not workflow completion.
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const BASE = process.env.BASE; const SHARE = process.env.VERCEL_SHARE; const RUN = process.env.RUN; const OUT = process.env.OUT || '/tmp';
if (!BASE || !SHARE || !RUN) { console.error('BASE, VERCEL_SHARE and RUN must be exported'); process.exit(2); }
const mk = (i, id) => ({ full_name: `ZZ Test ${id} H${RUN}`, phone: `07700 9009${String(i).padStart(2, '0')}`, email: `zz-survey-hosted-${RUN}-${id}@example.com`, street_address: `${i} Hosted Street (fictional)`, city: 'Truro', postcode: 'TR1 2AB' });
const SC = [
  { id: 'h1', c: 'kitchen', a: ['A full new kitchen', 'Before Christmas', 'Yes', 'Yes'], who: mk(1, 'h1'), accepted: true },
  { id: 'h2', c: 'garage', a: ['Home office', 'Attached to the house', 'Yes', 'Yes'], who: mk(2, 'h2'), accepted: true },
  { id: 'h3', c: 'kitchen', a: ['Not sure yet', 'Just looking for now', 'Yes', 'Yes'], who: mk(3, 'h3'), accepted: true },
  { id: 'd1', c: 'kitchen', a: ['A full new kitchen', 'Early 2027', 'Yes', 'No'], who: mk(4, 'd1'), accepted: false },
  { id: 'd2', c: 'garage', a: ['Gym', 'Detached', 'Yes', 'No'], who: mk(5, 'd2'), accepted: false },
  { id: 'd3', c: 'kitchen', a: ['Not sure yet', 'Just looking for now', 'No', 'No'], who: mk(6, 'd3'), accepted: false }, // low priority + DQ
];
(async () => {
  const br = await chromium.launch(); const results = []; let fails = 0;
  for (const s of SC) {
    if (!s.who) { console.log('skip', s.id); continue; }
    const ctx = await br.newContext({ viewport: { width: 390, height: 844 } }); const pg = await ctx.newPage();
    await pg.goto(`${BASE}/?_vercel_share=${SHARE}`).catch(() => {});
    const rec = { id: s.id, campaign: s.c, existingIdentity: !!s.existing, answers: s.a, contact: s.who, api: [], errors: [], startedAt: new Date().toISOString() };
    pg.on('console', (m) => { if (m.type() === 'error') rec.errors.push(m.text().slice(0, 120)); });
    await pg.route('**/api/survey-lead', async (route) => { rec.idem = route.request().headers()['idempotency-key']; const resp = await route.fetch(); let body = null; try { body = await resp.json(); } catch (e) {} rec.api.push({ status: resp.status(), body }); await route.fulfill({ response: resp }); });
    await pg.route(/googletagmanager\.com|connect\.facebook\.net/, (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await pg.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ contentType: 'text/css', body: '' }));
    await pg.goto(`${BASE}/survey/${s.c}-survey?utm_source=wren-hosted&utm_medium=controlled-test&utm_campaign=h${RUN}&utm_content=${s.id}&utm_term=zz&fbclid=H${RUN}${s.id}`, { waitUntil: 'load' });
    for (const q of s.a) { await pg.getByRole('button', { name: q, exact: true }).first().click(); await pg.waitForTimeout(450); }
    for (const [k, v] of Object.entries(s.who)) await pg.fill(`input[name=${k}]`, v);
    await pg.click('button[type=submit]');
    const dest = s.accepted ? 'thank-you' : 'not-in-area';
    await pg.waitForURL(new RegExp(`/survey/${s.c}-${dest}$`), { timeout: 30000 }).catch(() => {});
    await pg.waitForTimeout(1500);
    rec.endedAt = new Date().toISOString(); rec.finalUrl = pg.url().replace(BASE, '');
    rec.leadEvents = (await pg.evaluate(() => (window.dataLayer || []).filter((e) => e.event === 'wren_survey_lead'))).length;
    rec.metaLead = await pg.evaluate(() => (window.fbq && window.fbq.queue ? window.fbq.queue.filter((a) => a[1] === 'Lead').length : 0));
    rec.token = await pg.evaluate(() => sessionStorage.getItem('wren_conversion'));
    if (s.accepted && s.id === 'h1') { await pg.reload({ waitUntil: 'load' }); await pg.waitForTimeout(1200); rec.leadAfterRefresh = await pg.evaluate(() => (window.dataLayer || []).filter((e) => e.event === 'wren_survey_lead').length) + (await pg.evaluate(() => (window.fbq && window.fbq.queue ? window.fbq.queue.filter((a) => a[1] === 'Lead').length : 0))); }
    if (!s.accepted) { await pg.goto(`${BASE}/survey/${s.c}-thank-you`); await pg.waitForTimeout(1200); rec.leadAfterVisitingThankYou = (await pg.evaluate(() => (window.dataLayer || []).filter((e) => e.event === 'wren_survey_lead').length)) + (await pg.evaluate(() => (window.fbq && window.fbq.queue ? window.fbq.queue.filter((a) => a[1] === 'Lead').length : 0))); }
    const a = rec.api[0] || {};
    const apiOk = a.status === 200 && a.body && a.body.ok === true && a.body.stored_in_ghl === true && a.body.sales_qualified === s.accepted && a.body.outcome === (s.accepted ? 'accepted' : 'disqualified') && (s.accepted || a.body.reason === 'outside_cornwall');
    const trackOk = s.accepted ? (rec.leadEvents === 1 && rec.metaLead === 1 && rec.token === null && (rec.leadAfterRefresh === undefined || rec.leadAfterRefresh === 0)) : (rec.leadEvents === 0 && rec.metaLead === 0 && rec.token === null && rec.leadAfterVisitingThankYou === 0);
    const ok = apiOk && rec.finalUrl.endsWith(dest) && trackOk && rec.api.length === 1 && rec.errors.length === 0; if (!ok) fails++;
    results.push(rec); await ctx.close();
    console.log((ok ? 'PASS ' : 'FAIL ') + s.id, s.c, '| response', a.status, JSON.stringify(a.body), '| ->', rec.finalUrl, '| wren_survey_lead', rec.leadEvents, 'Meta Lead', rec.metaLead, s.accepted ? '' : '| DQ (stored, no sales)');
  }
  fs.writeFileSync(path.join(OUT, 'hosted-boundary.json'), JSON.stringify(results, null, 1));
  await br.close(); console.log(fails ? `${fails} FAILED` : 'all hosted scenarios passed'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e.message); process.exit(2); });
