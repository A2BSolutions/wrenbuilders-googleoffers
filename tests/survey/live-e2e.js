'use strict';
/*
 * CONTROLLED live test: real endpoint code -> real GHL inbound webhooks, with clearly fictional contacts.
 * Needs: node tests/survey/dev-server.js (started with SURVEY_DEV_LIVE=1 and GHL_SURVEY_*_WEBHOOK_URL in its env).
 *   BASE=http://localhost:8771 RUN=<short id> OUT=<dir> node tests/survey/live-e2e.js
 * GTM and Meta are STUBBED so test traffic never reaches real GA4, Ads or Meta. Webhook URLs are never read or printed here.
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const BASE = process.env.BASE; const RUN = process.env.RUN; const OUT = process.env.OUT || '/tmp';
if (!BASE || !RUN) throw new Error('BASE and RUN required');
const SC = [
  { id: 's1', c: 'kitchen', a: ['A full new kitchen', 'Before Christmas', 'Yes', 'Yes'], tags: [] },
  { id: 's2', c: 'kitchen', a: ['A partial refit (doors, worktops)', 'Early 2027', 'No', 'No'], tags: ['DQ - outside Cornwall'] },
  { id: 's3', c: 'kitchen', a: ['Not sure yet', 'Just looking for now', 'Yes', 'Yes'], tags: ['Low priority'] },
  { id: 's4', c: 'kitchen', a: ['A full new kitchen', 'Just looking for now', 'Yes', 'No'], tags: ['DQ - outside Cornwall', 'Low priority'] },
  { id: 's5', c: 'garage', a: ['Home office', 'Attached to the house', 'Yes', 'Yes'], tags: [] },
  { id: 's6', c: 'garage', a: ['Gym', 'Detached', 'No', 'No'], tags: ['DQ - outside Cornwall'] },
  { id: 's7', c: 'kitchen', a: ['A full new kitchen', 'Early 2027', 'Yes', 'Yes'], tags: [], failFirst: true },
  // owns_property = No with Cornwall = Yes: no business rule, no tag. Disambiguates the owns vs Cornwall field mapping.
  { id: 's8', c: 'garage', a: ['Bedroom or guest room', 'Integral', 'No', 'Yes'], tags: [] },
  { id: 's9', c: 'kitchen', a: ['A partial refit (doors, worktops)', 'Before Christmas', 'No', 'Yes'], tags: [] },
];
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
// Hosted preview is protected. VERCEL_SHARE is a temporary, deployment-scoped share secret supplied via env only.
const auth = async (pg) => { if (process.env.VERCEL_SHARE) await pg.goto(`${BASE}/?_vercel_share=${process.env.VERCEL_SHARE}`).catch(() => {}); };
const who = (s, i) => ({
  full_name: `ZZ Test ${s.id.toUpperCase()} E2E${RUN}`,
  phone: `07700 9007${String(i).padStart(2, '0')}`,
  email: `zz-survey-e2e-${RUN}-${s.id}@example.com`,
  street_address: `${i + 1} Test Street (fictional)`,
  city: 'Truro',
  postcode: 'TR1 2AB',
});

(async () => {
  const br = await chromium.launch();
  const out = [];
  for (let i = 0; i < SC.length; i++) {
    if (ONLY.length && !ONLY.includes(SC[i].id)) continue;
    const s = SC[i]; const f = who(s, i + 1);
    const ctx = await br.newContext({ viewport: { width: 390, height: 844 } });
    const pg = await ctx.newPage();
    await auth(pg);
    const rec = { id: s.id, campaign: s.c, answers: s.a, expectedTags: s.tags, contact: f, api: [], consoleErrors: [] };
    pg.on('console', (m) => { if (m.type() === 'error') rec.consoleErrors.push(m.text().slice(0, 160)); });
    pg.on('pageerror', (e) => rec.consoleErrors.push('pageerror ' + e.message.slice(0, 160)));
    pg.on('request', (r) => { if (r.url().endsWith('/api/survey-lead')) { rec.requestBody = r.postData(); rec.idemHeader = r.headers()['idempotency-key']; } });
    pg.on('response', async (r) => { if (r.url().endsWith('/api/survey-lead')) rec.api.push({ status: r.status(), body: await r.json().catch(() => null) }); });
    await pg.route(/googletagmanager\.com/, (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await pg.route(/connect\.facebook\.net/, (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await pg.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ contentType: 'text/css', body: '' }));
    const utm = `?utm_source=wren-e2e&utm_medium=controlled-test&utm_campaign=run${RUN}&utm_content=${s.id}&utm_term=zz&fbclid=E2E${RUN}${s.id}`;
    if (s.failFirst) await fetch(BASE + '/__mock/failnext?n=1');
    await pg.goto(`${BASE}/survey/${s.c}-survey${utm}`, { waitUntil: 'load' });
    for (const q of s.a) { await pg.getByRole('button', { name: q, exact: true }).first().click(); await pg.waitForTimeout(450); }
    for (const [k, v] of Object.entries(f)) await pg.fill(`input[name=${k}]`, v);
    await pg.click('button[type=submit]');
    const dest = s.a[3] === 'Yes' ? 'thank-you' : 'not-in-area';
    if (s.failFirst) {
      await pg.waitForTimeout(2500);
      rec.afterFailUrl = pg.url(); rec.afterFailAlert = await pg.locator('[role=alert]').count();
      rec.afterFailLead = await pg.evaluate(() => (window.dataLayer || []).filter((e) => e.event === 'wren_survey_lead').length);
      rec.idAfterFail = await pg.evaluate((c) => sessionStorage.getItem('wren_submission_id_' + c), s.c);
      await pg.click('button[type=submit]');
    }
    await pg.waitForURL(new RegExp(`/survey/${s.c}-${dest}$`), { timeout: 30000 }).catch(() => {});
    await pg.waitForTimeout(1500);
    rec.finalUrl = pg.url(); rec.expectedDest = `/survey/${s.c}-${dest}`;
    rec.leadEvents = await pg.evaluate(() => (window.dataLayer || []).filter((e) => e.event === 'wren_survey_lead'));
    rec.metaLead = await pg.evaluate(() => (window.fbq && window.fbq.queue ? window.fbq.queue.map((a) => [].slice.call(a)).filter((a) => a[1] === 'Lead') : []));
    if (s.id === 's1' || s.id === 's5') {
      await pg.reload({ waitUntil: 'load' }); await pg.waitForTimeout(1500);
      rec.leadAfterRefresh = await pg.evaluate(() => (window.dataLayer || []).filter((e) => e.event === 'wren_survey_lead').length);
      rec.metaLeadAfterRefresh = await pg.evaluate(() => (window.fbq && window.fbq.queue ? window.fbq.queue.filter((a) => a[1] === 'Lead').length : 0));
    }
    if (s.id === 's1') { // direct visit in a fresh context
      const c2 = await br.newContext(); const p2 = await c2.newPage();
      await auth(p2);
      await p2.route(/googletagmanager\.com|connect\.facebook\.net|fonts\./, (r) => r.fulfill({ body: '' }));
      await p2.goto(`${BASE}/survey/kitchen-thank-you`); await p2.waitForTimeout(1500);
      rec.leadOnDirectVisit = await p2.evaluate(() => (window.dataLayer || []).filter((e) => e.event === 'wren_survey_lead').length);
      await c2.close();
    }
    rec.submissionId = rec.idemHeader;
    out.push(rec); await ctx.close();
    console.log(s.id, s.c, 'api', JSON.stringify(rec.api.map((a) => a.status)), '->', rec.finalUrl.replace(BASE, ''), 'leads', rec.leadEvents.length, 'metaLead', rec.metaLead.length);
  }
  await br.close();
  fs.writeFileSync(path.join(OUT, ONLY.length ? 'live-results-extra.json' : 'live-results.json'), JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e); process.exit(2); });
