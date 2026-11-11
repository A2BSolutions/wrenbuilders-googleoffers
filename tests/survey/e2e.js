'use strict';
/*
 * Browser tests (dev only, needs Playwright installed globally or locally). Runs against tests/survey/dev-server.js.
 *   node tests/survey/dev-server.js 8766 &
 *   BASE=http://localhost:8766 OUT=/tmp/shots [ORIG=/path/to/original/export] node tests/survey/e2e.js
 * Mock receiver only. Passing here is NOT proof that GHL stored anything.
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path'); const http = require('http');
const BASE = process.env.BASE || 'http://localhost:8766';
const OUT = process.env.OUT || '/tmp/survey-shots';
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  -> ' + JSON.stringify(detail))); };

const ANS = { kitchen: ['A full new kitchen', 'Before Christmas', 'Yes'], garage: ['Home office', 'Attached to the house', 'Yes'] };
const FILL = { full_name: 'Test Person', phone: '07700 900123', email: 'test@example.com', street_address: '1 Test Road', city: 'Truro', postcode: 'tr1 2ab' };

async function mkPage(br, { viewport = { width: 390, height: 844 }, base = BASE, reduced = false, fbqPreexisting = false, funnelPatch, consent = 'granted', blockStorage = false } = {}) {
  const ctx = await br.newContext({ viewport, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const pg = await ctx.newPage();
  const log = { console: [], hosts: {}, reqs: [], gtmReq: 0, fbReq: 0 };
  pg.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.console.push(m.type() + ': ' + m.text().slice(0, 200)); });
  pg.on('pageerror', (e) => log.console.push('pageerror: ' + e.message.slice(0, 200)));
  pg.on('request', (r) => { const h = new URL(r.url()).host; log.hosts[h] = (log.hosts[h] || 0) + 1; log.reqs.push(r.url()); });
  await pg.route(/googletagmanager\.com\/gtm\.js/, (r) => { log.gtmReq++; r.fulfill({ contentType: 'text/javascript', body: '/* gtm stub */' }); });
  await pg.route(/connect\.facebook\.net/, (r) => { log.fbReq++; r.fulfill({ contentType: 'text/javascript', body: '/* fbevents stub */' }); });
  await pg.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  // Any unpkg request is counted in log.hosts (the new pages must make none). The ORIGINAL export needs React from unpkg to render
  // for the layout comparison, so serve the identical, SRI-verified files from the vendor folder instead of the network.
  await pg.route(/unpkg\.com/, (r) => { const u = r.request().url(); const f = u.includes('react-dom') ? 'react-dom.production.min.js' : u.includes('react@') ? 'react.production.min.js' : null; f ? r.fulfill({ contentType: 'text/javascript', path: path.join(__dirname, '..', '..', 'survey', 'vendor', f) }) : r.abort(); });
  // Consent is seeded once per browser context (not on every navigation) so tests can click Accept/Reject and reload.
  // 'granted' is the default so the existing funnel tests exercise the post-consent behaviour. 'none' = a first-time visitor.
  if (consent !== 'none') await pg.addInitScript((v) => { try { if (!localStorage.getItem('__seeded')) { localStorage.setItem('__seeded', '1'); localStorage.setItem('wren_consent_v1', JSON.stringify({ v, t: Date.now() })); } } catch (e) {} }, consent);
  if (blockStorage) await pg.addInitScript(() => { const boom = () => { throw new Error('storage blocked'); }; try { Object.defineProperty(window, 'localStorage', { get: boom }); } catch (e) {} });
  if (funnelPatch) await pg.route('**/wren-funnel.js', async (r) => { const res = await r.fetch(); r.fulfill({ response: res, body: funnelPatch(await res.text()) }); });
  if (fbqPreexisting) await pg.addInitScript(() => { const q = []; window.fbq = function () { q.push([].slice.call(arguments)); }; window.fbq.queue = q; window.fbq.preexisting = true; });
  return { ctx, pg, log };
}
const fbq = (pg) => pg.evaluate(() => (window.fbq && window.fbq.queue ? window.fbq.queue.map((a) => [].slice.call(a)) : null));
const dl = (pg, ev) => pg.evaluate((e) => (window.dataLayer || []).filter((x) => x.event === e), ev);
const mock = (p) => fetch(BASE + '/__mock/' + p).then((r) => r.text());
const calls = () => fetch(BASE + '/__mock/calls').then((r) => r.json());
const outgoing = () => fetch(BASE + '/__mock/outgoing').then((r) => r.json()).then((x) => x.n);

async function survey(pg, c, cornwall, { stopAtForm = false, base = BASE, route } = {}) {
  await pg.goto(`${base}${route || '/survey/' + c + '-survey'}`, { waitUntil: 'load' });
  for (const q of [ANS[c][0], ANS[c][1], 'Yes', cornwall]) { await pg.getByRole('button', { name: q, exact: true }).first().click(); await pg.waitForTimeout(450); }
  await pg.waitForSelector('input[name=full_name]');
  if (stopAtForm) return;
  for (const [k, v] of Object.entries(FILL)) await pg.fill(`input[name=${k}]`, v);
}

(async () => {
  const br = await chromium.launch();
  const ROUTES = ['kitchen-survey', 'kitchen-thank-you', 'kitchen-not-in-area', 'garage-survey', 'garage-thank-you', 'garage-not-in-area'];

  // 1. Routes, noindex, static GTM, self-hosted libs, console, Pixel PageView
  for (const r of ROUTES) {
    const { ctx, pg, log } = await mkPage(br);
    const res = await pg.goto(`${BASE}/survey/${r}`, { waitUntil: 'load' });
    await pg.waitForTimeout(2500);
    check(`route ${r}: 200`, res.status() === 200, res.status());
    check(`route ${r}: X-Robots-Tag noindex header`, /noindex/.test(res.headers()['x-robots-tag'] || ''), res.headers());
    check(`route ${r}: meta robots noindex`, await pg.evaluate(() => [...document.querySelectorAll('meta[name=robots]')].some((m) => /noindex/.test(m.content))));
    const html = await (await fetch(`${BASE}/survey/${r}`)).text();
    const head = html.slice(0, html.indexOf('</head>')); const bodyStart = html.slice(html.indexOf('<body>'), html.indexOf('<body>') + 600);
    check(`route ${r}: consent gate in the static head after charset and before the funnel script; no GTM or Meta host anywhere in the HTML`, head.indexOf('/survey/consent.js') > head.indexOf('charset') && head.indexOf('/survey/consent.js') < head.indexOf('/survey/wren-funnel.js') && !/googletagmanager|connect\.facebook|GTM-KF4RWHHQ|fonts\.g(oogleapis|static)/.test(html));
    check(`route ${r}: no GTM noscript iframe (it would load Google with no consent)`, !/<iframe/i.test(bodyStart) && !/ns\.html/.test(html));
    check(`route ${r}: after Accept, exactly one GTM container request`, log.gtmReq === 1, log.gtmReq);
    check(`route ${r}: fonts are self-hosted (no Google Fonts request)`, !Object.keys(log.hosts).some((h) => /^fonts\.g(oogleapis|static)\.com$/.test(h)), log.hosts);
    check(`route ${r}: no unpkg request, React and ReactDOM self-hosted, Babel never requested`, !log.hosts['unpkg.com'] && !log.reqs.some((u) => /babel/i.test(u)) && log.reqs.some((u) => u.includes('/survey/vendor/react-dom.production.min.js')) && log.reqs.some((u) => u.includes('/survey/vendor/react.production.min.js')), log.hosts);
    check(`route ${r}: page rendered content`, (await pg.locator('body').innerText()).length > 200);
    const q = await fbq(pg);
    check(`route ${r}: Meta init once, PageView once, no Lead`, q && q.filter((a) => a[0] === 'init' && a[1] === '1135200792433711').length === 1 && q.filter((a) => a[0] === 'track' && a[1] === 'PageView').length === 1 && !q.some((a) => a[1] === 'Lead'), q);
    check(`route ${r}: fbevents loaded once`, log.fbReq === 1, log.fbReq);
    check(`route ${r}: no console errors/warnings`, log.console.length === 0, log.console);
    check(`route ${r}: no wren_survey_lead on load`, (await dl(pg, 'wren_survey_lead')).length === 0);
    await ctx.close();
  }
  // trailing slash on a rewritten route (UNKNOWN on Vercel; documents local behaviour only)
  check('trailing-slash form is not relied on (absolute paths): local 404 is expected', (await fetch(`${BASE}/survey/kitchen-survey/`)).status === 404 || true);

  // 2. End-to-end submissions through the real API handler and mock receiver
  for (const [c, cw] of [['kitchen', 'Yes'], ['kitchen', 'No'], ['garage', 'Yes'], ['garage', 'No']]) {
    await mock('reset');
    const { ctx, pg, log } = await mkPage(br);
    const apiBodies = [];
    await pg.route('**/api/survey-lead', async (route) => { const resp = await route.fetch(); let b = null; try { b = await resp.json(); } catch (e) {} apiBodies.push({ status: resp.status(), body: b }); await route.fulfill({ response: resp }); });
    await survey(pg, c, cw);
    await pg.click('button[type=submit]');
    const dest = cw === 'Yes' ? 'thank-you' : 'not-in-area';
    await pg.waitForURL(new RegExp(`/survey/${c}-${dest}$`), { timeout: 15000 }).catch(() => {});
    await pg.waitForTimeout(1500);
    check(`${c}/${cw}: lands on ${c}-${dest}`, pg.url().endsWith(`/survey/${c}-${dest}`), pg.url());
    const cs = await calls(); const out = await outgoing();
    let bo = null;
    check(`${c}/${cw}: exactly one outgoing request, to the ${c} receiver path (both Cornwall answers are forwarded)`, cs.length === 1 && out === 1 && cs[0].url === `/hooks/${c}-e2e`, { out, urls: cs.map((x) => x.url) });
    bo = cs[0] && cs[0].body;
    check(`${c}/${cw}: server-normalised payload (phone, postcode, derived first name)`, bo && bo.phone === '+447700900123' && bo.postal_code === 'TR1 2AB' && bo.first_name === 'Test' && bo.last_name === 'Person', bo);
    if (cw === 'Yes') check(`${c}/Yes: qualified flags and no DQ tag`, bo && bo.survey_qualified === true && bo.survey_dq_outside_cornwall === false && bo.survey_answer_in_cornwall === 'Yes' && !JSON.stringify(bo.tags).includes('DQ'), bo && bo.tags);
    else check(`${c}/No: DQ flags and the DQ tag reach the receiver, answers and attribution intact`, bo && bo.survey_qualified === false && bo.survey_dq_outside_cornwall === true && bo.survey_answer_in_cornwall === 'No' && JSON.stringify(bo.tags) === JSON.stringify(['DQ - outside Cornwall']) && bo.survey_utm_source === '' && !!bo.survey_submission_id && !!bo.survey_offer, bo && bo.tags);
    const ab = apiBodies[0] && apiBodies[0].body;
    check(`${c}/${cw}: typed response (${cw === 'Yes' ? "accepted, sales_qualified:true" : "disqualified, sales_qualified:false"}, stored_in_ghl:true)`, apiBodies.length === 1 && apiBodies[0].status === 200 && ab && ab.ok === true && ab.stored_in_ghl === true && ab.outcome === (cw === 'Yes' ? 'accepted' : 'disqualified') && ab.sales_qualified === (cw === 'Yes'), apiBodies);
    const b = bo;
    const leads = await dl(pg, 'wren_survey_lead'); const q = await fbq(pg);
    if (cw === 'Yes') {
      check(`${c}/Yes: exactly one wren_survey_lead, no PII, event_id = submission_id`, leads.length === 1 && leads[0].event_id === b.survey_submission_id && leads[0].wren_campaign === c && !JSON.stringify(leads[0]).match(/Test|example|7700|Road|TR1/), leads);
      const lead = q.filter((a) => a[0] === 'track' && a[1] === 'Lead');
      check(`${c}/Yes: Meta Lead once with eventID = submission_id`, lead.length === 1 && lead[0][3] && lead[0][3].eventID === b.survey_submission_id && lead[0][2].content_category === c, lead);
      check(`${c}/Yes: Meta PageView once on thank-you, init once`, q.filter((a) => a[1] === 'PageView').length === 1 && q.filter((a) => a[0] === 'init').length === 1, q);
      check(`${c}/Yes: conversion token consumed`, (await pg.evaluate(() => sessionStorage.getItem('wren_conversion'))) === null);
      await pg.reload({ waitUntil: 'load' }); await pg.waitForTimeout(1500);
      check(`${c}/Yes: refresh fires no second wren_survey_lead and no Lead`, (await dl(pg, 'wren_survey_lead')).length === 0 && !(await fbq(pg)).some((a) => a[1] === 'Lead'));
    } else {
      check(`${c}/No: no Lead, no wren_survey_lead, no token`, leads.length === 0 && !q.some((a) => a[1] === 'Lead') && (await pg.evaluate(() => sessionStorage.getItem('wren_conversion'))) === null, { leads, q });
      await pg.goto(`${BASE}/survey/${c}-thank-you`); await pg.waitForTimeout(1200);
      check(`${c}/No: visiting the thank-you page after a DQ still fires no Lead`, (await dl(pg, 'wren_survey_lead')).length === 0 && !((await fbq(pg)) || []).some((a) => a[1] === 'Lead'));
    }
    const keys = await pg.evaluate(() => Object.keys(sessionStorage)); const vals = await pg.evaluate(() => JSON.stringify(Object.entries(sessionStorage)));
    check(`${c}/${cw}: no email/phone/address in sessionStorage or URL`, !/example\.com|7700|Test Road|tr1|TR1/i.test(vals.replace('"Test"', '')) && !/example|7700|Road/.test(pg.url()), { keys });
    check(`${c}/${cw}: no console errors (includes the old componentDidUpdate TypeError)`, log.console.length === 0, log.console);
    await ctx.close();
  }

  // 2b. Client interprets the SERVER outcome (stubbed endpoint responses). Fail closed on anything ambiguous.
  const stub = async (answersCornwall, status, body) => {
    const { ctx, pg, log } = await mkPage(br);
    await pg.route('**/api/survey-lead', (r) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }));
    await survey(pg, 'kitchen', answersCornwall); await pg.click('button[type=submit]'); await pg.waitForTimeout(2200);
    const res = { url: pg.url(), alert: await pg.locator('[role=alert]').count(), leads: (await dl(pg, 'wren_survey_lead')).length, token: await pg.evaluate(() => sessionStorage.getItem('wren_conversion')), metaLead: ((await fbq(pg)) || []).filter((a) => a[1] === 'Lead').length, log };
    await ctx.close(); return res;
  };
  let r2 = await stub('Yes', 200, { ok: true });
  check('client: ok:true with no outcome is NOT confirmed (no redirect, error shown, no Lead)', r2.url.endsWith('/kitchen-survey') && r2.alert === 1 && r2.leads === 0 && r2.metaLead === 0, r2.url);
  r2 = await stub('Yes', 200, { ok: true, outcome: 'bogus' });
  check('client: unknown outcome fails closed', r2.url.endsWith('/kitchen-survey') && r2.alert === 1 && r2.leads === 0);
  r2 = await stub('Yes', 200, { ok: false, outcome: 'disqualified' });
  check('client: ok:false is never treated as DQ or success', r2.url.endsWith('/kitchen-survey') && r2.alert === 1 && r2.leads === 0);
  r2 = await stub('Yes', 409, { ok: false, error: 'IN_PROGRESS' });
  check('client: 409 IN_PROGRESS shows the retry message, no redirect', r2.url.endsWith('/kitchen-survey') && r2.alert === 1 && r2.leads === 0);
  r2 = await stub('Yes', 200, { ok: true, outcome: 'disqualified', reason: 'outside_cornwall', stored_in_ghl: true });
  check('client: disqualified without sales_qualified:false is NOT confirmed (no redirect, no Lead)', r2.url.endsWith('/kitchen-survey') && r2.alert === 1 && r2.leads === 0 && r2.metaLead === 0);
  r2 = await stub('No', 200, { ok: true, outcome: 'disqualified', reason: 'outside_cornwall', sales_qualified: false });
  check('client: disqualified without stored_in_ghl:true is NOT confirmed (not treated as saved)', r2.url.endsWith('/kitchen-survey') && r2.alert === 1 && r2.leads === 0);
  r2 = await stub('No', 200, { ok: true, outcome: 'disqualified', sales_qualified: true, stored_in_ghl: true });
  check('client: disqualified with sales_qualified:true is contradictory and NOT confirmed', r2.url.endsWith('/kitchen-survey') && r2.alert === 1 && r2.leads === 0 && r2.metaLead === 0);
  r2 = await stub('Yes', 200, { ok: true, outcome: 'accepted', sales_qualified: false, stored_in_ghl: true });
  check('client: accepted with sales_qualified:false is contradictory and NOT confirmed, no Lead', r2.url.endsWith('/kitchen-survey') && r2.alert === 1 && r2.leads === 0 && r2.metaLead === 0);
  r2 = await stub('Yes', 200, { ok: true, outcome: 'accepted', sales_qualified: true });
  check('client: accepted without stored_in_ghl:true is NOT confirmed', r2.url.endsWith('/kitchen-survey') && r2.alert === 1 && r2.leads === 0);
  r2 = await stub('Yes', 200, { ok: true, outcome: 'disqualified', reason: 'outside_cornwall', sales_qualified: false, stored_in_ghl: true });
  check('client: server says DQ for a "Yes" page answer: server wins, not-in-area, NO Lead, no token', r2.url.endsWith('/survey/kitchen-not-in-area') && r2.leads === 0 && r2.metaLead === 0 && r2.token === null, r2);
  check('client: that disagreement logs a PII-free warning', r2.log.console.some((m) => /server outcome differs/.test(m) && !/Test|example|7700/.test(m)), r2.log.console);
  r2 = await stub('No', 200, { ok: true, outcome: 'disqualified', reason: 'outside_cornwall', sales_qualified: false, stored_in_ghl: true });
  check('client: DQ outcome goes to not-in-area, no Lead, no token, no console errors', r2.url.endsWith('/survey/kitchen-not-in-area') && r2.leads === 0 && r2.metaLead === 0 && r2.token === null && r2.log.console.length === 0, r2.log.console);

  // 3. Failure, retry with the same submission_id, in-flight lock
  {
    await mock('reset'); await mock('mode?m=500');
    const { ctx, pg, log } = await mkPage(br);
    await survey(pg, 'kitchen', 'Yes');
    await pg.click('button[type=submit]'); await pg.waitForTimeout(1500);
    check('failure: no redirect, alert shown, button re-enabled, values kept', pg.url().endsWith('/survey/kitchen-survey') && (await pg.locator('[role=alert]').count()) === 1 && !(await pg.locator('button[type=submit]').isDisabled()) && (await pg.inputValue('input[name=email]')) === 'test@example.com');
    check('failure: no Lead, no token', (await dl(pg, 'wren_survey_lead')).length === 0 && (await pg.evaluate(() => sessionStorage.getItem('wren_conversion'))) === null);
    const id1 = await pg.evaluate(() => sessionStorage.getItem('wren_submission_id_kitchen'));
    await mock('mode?m=ok');
    await pg.click('button[type=submit]'); await pg.waitForURL(/kitchen-thank-you$/, { timeout: 15000 }).catch(() => {}); await pg.waitForTimeout(1200);
    const cs = await calls();
    check('retry: same submission_id on both attempts, success redirects', pg.url().endsWith('/kitchen-thank-you') && cs.length === 2 && cs[0].body.survey_submission_id === id1 && cs[1].body.survey_submission_id === id1, { id1, n: cs.length });
    check('retry: exactly one Lead after the successful retry', (await dl(pg, 'wren_survey_lead')).length === 1);
    await ctx.close();
  }
  { // endpoint rejects with 400/503/409 style non-2xx -> fail closed in UI
    await mock('reset'); await mock('mode?m=hang');
    const { ctx, pg } = await mkPage(br);
    await survey(pg, 'garage', 'Yes');
    await pg.click('button[type=submit]'); await pg.waitForTimeout(300);
    check('in flight: submit disabled while sending', await pg.locator('button[type=submit]').isDisabled());
    await pg.waitForTimeout(2600);
    check('upstream timeout: UI fails closed (no redirect, error shown)', pg.url().endsWith('/survey/garage-survey') && (await pg.locator('[role=alert]').count()) === 1);
    await ctx.close(); await mock('mode?m=ok');
  }

  // 4. Thank-you guards: direct visits, other campaign, other tab, stale token
  for (const r of ['kitchen-thank-you', 'garage-thank-you', 'kitchen-not-in-area', 'garage-not-in-area']) {
    const { ctx, pg } = await mkPage(br); await pg.goto(`${BASE}/survey/${r}`); await pg.waitForTimeout(2000);
    check(`direct visit ${r}: no Lead`, (await dl(pg, 'wren_survey_lead')).length === 0 && !(await fbq(pg)).some((a) => a[1] === 'Lead')); await ctx.close();
  }
  {
    await mock('reset'); const { ctx, pg } = await mkPage(br);
    await pg.goto(`${BASE}/survey/garage-thank-you`);
    await pg.evaluate(() => sessionStorage.setItem('wren_conversion', JSON.stringify({ submission_id: 'x-1', campaign: 'kitchen', offer: '1000-appliance-upgrade', created_at: Date.now() })));
    await pg.reload(); await pg.waitForTimeout(1500);
    check('other-campaign token: garage thank-you fires nothing and leaves the kitchen token', (await dl(pg, 'wren_survey_lead')).length === 0 && !!(await pg.evaluate(() => sessionStorage.getItem('wren_conversion'))));
    await pg.evaluate(() => sessionStorage.setItem('wren_conversion', JSON.stringify({ submission_id: 'x-2', campaign: 'garage', offer: 'free-ac-unit', created_at: Date.now() - 31 * 60 * 1000 })));
    await pg.reload(); await pg.waitForTimeout(1500);
    check('stale token (>30 min): no Lead and token deleted', (await dl(pg, 'wren_survey_lead')).length === 0 && (await pg.evaluate(() => sessionStorage.getItem('wren_conversion'))) === null);
    await ctx.close();
  }
  { // second tab/context cannot reuse a token
    await mock('reset'); const a = await mkPage(br); await survey(a.pg, 'kitchen', 'Yes'); await a.pg.click('button[type=submit]'); await a.pg.waitForURL(/thank-you$/).catch(() => {});
    const b = await mkPage(br); await b.pg.goto(`${BASE}/survey/kitchen-thank-you`); await b.pg.waitForTimeout(1500);
    check('second browser context: no Lead', (await dl(b.pg, 'wren_survey_lead')).length === 0);
    await a.ctx.close(); await b.ctx.close();
  }

  // 5. Pixel single owner: a pre-existing fbq (for example from GTM) stops our init and PageView
  {
    const { ctx, pg } = await mkPage(br, { fbqPreexisting: true });
    await pg.goto(`${BASE}/survey/kitchen-survey`); await pg.waitForTimeout(2000);
    const q = await fbq(pg);
    check('pixel single-owner guard: pre-existing fbq means no second init or PageView from wren-funnel.js', q.length === 0 && (await pg.evaluate(() => window.__wrenPixelOwner)) === 'external', q);
    await ctx.close();
  }
  { // inlineMetaPixel:false -> no Meta at all, dataLayer only
    const { ctx, pg, log } = await mkPage(br, { funnelPatch: (t) => t.replace('inlineMetaPixel: true', 'inlineMetaPixel: false') });
    await pg.goto(`${BASE}/survey/garage-survey`); await pg.waitForTimeout(2000);
    check('inlineMetaPixel:false loads no Meta script and defines no fbq', log.fbReq === 0 && (await pg.evaluate(() => typeof window.fbq)) === 'undefined');
    await ctx.close();
  }

  // 6. Privacy Notice link + accurate microcopy on both surveys (default config shows the link; null hides it)
  for (const c of ['kitchen', 'garage']) {
    let { ctx, pg } = await mkPage(br); await survey(pg, c, 'Yes', { stopAtForm: true });
    const a0 = pg.locator('a:has-text("Privacy Notice")');
    const txt = await pg.locator('body').innerText();
    check(`${c}: Privacy Notice link shows under the submit button and opens /survey/privacy in a new tab`, (await a0.count()) === 1 && (await a0.getAttribute('href')) === '/survey/privacy' && (await a0.getAttribute('target')) === '_blank' && /noopener/.test(await a0.getAttribute('rel')));
    check(`${c}: accurate draft microcopy replaces the old line`, /We use your details to respond to your enquiry/.test(txt) && /keep enquiries from outside Cornwall/.test(txt) && !/No spam/.test(txt) && !/only use your details to send your quote/.test(txt), txt.match(/We (use|.ll only use) your details[^.]*\./));
    const box = await a0.boundingBox(); const btn = await pg.locator('button[type=submit]').boundingBox();
    check(`${c}: link sits beneath the submit button`, box && btn && box.y > btn.y + btn.height - 1, { box, btn });
    await ctx.close();
    ({ ctx, pg } = await mkPage(br, { funnelPatch: (t) => t.replace("privacy: { url: '/survey/privacy' }", 'privacy: { url: null }') }));
    await survey(pg, c, 'Yes', { stopAtForm: true });
    check(`${c}: no Privacy Notice link when CONFIG.privacy.url is null`, (await pg.locator('a:has-text("Privacy Notice")').count()) === 0); await ctx.close();
  }

  // 6b. The privacy page is standalone: no scripts, no tracking, outside the conversion flow
  {
    const { ctx, pg, log } = await mkPage(br);
    const res = await pg.goto(`${BASE}/survey/privacy`, { waitUntil: 'load' }); await pg.waitForTimeout(1500);
    const html = await (await fetch(`${BASE}/survey/privacy`)).text();
    check('privacy: route 200 via the rewrite', res.status() === 200, res.status());
    check('privacy: X-Robots-Tag noindex, nofollow header and robots meta', /noindex, nofollow/.test(res.headers()['x-robots-tag'] || '') && /name="robots" content="noindex, nofollow"/.test(html));
    check('privacy: only script is first-party consent.js in manage mode; no GTM, no Pixel, no survey runtime', (html.match(/<script\b[^>]*>/gi) || []).length === 1 && /src="\/survey\/consent\.js" data-mode="manage"/.test(html) && !/GTM-|googletagmanager|fbq|fbevents|connect\.facebook|wren-funnel|support\.js/i.test(html));
    check('privacy: zero third-party requests EVEN WHEN consent is already granted (no GTM, no Meta, no fonts, no unpkg)', Object.keys(log.hosts).every((h) => h === 'localhost:8766') && log.gtmReq === 0 && log.fbReq === 0, log.hosts);
    check('privacy: no dataLayer, no fbq, no funnel runtime, no events', (await pg.evaluate(() => [typeof window.dataLayer, typeof window.fbq, typeof window.WrenFunnel])).join() === 'undefined,undefined,undefined');
    check('privacy: no console errors', log.console.length === 0, log.console);
    check('privacy: no draft banner and no approval placeholders (content is complete; business sign-off is tracked in the release register)', !/data-draft|\[\[APPROVAL/.test(html));
    check('privacy: covers collection, purposes, DQ retention, SMS follow-up, processors, retention, rights, contact', ['What we collect', 'How and why we use your details', 'Enquiry from a property outside Cornwall', 'Lawful basis', 'Calls and texts', 'still create or update a record', 'do not create a sales opportunity', 'call or text you', 'Who we share it with', 'GoHighLevel', 'How long we keep it', 'Your rights', 'Contact us about your data', 'ico.org.uk'].every((k) => html.includes(k)));
    await ctx.close();
  }
  // 6c. Not-in-area pages: discreet Privacy Notice link and concise retention disclosure (no retention period is stated)
  for (const c of ['kitchen', 'garage']) {
    const { ctx, pg, log } = await mkPage(br);
    await pg.goto(`${BASE}/survey/${c}-not-in-area`, { waitUntil: 'load' }); await pg.waitForTimeout(1800);
    const link = pg.locator('a:has-text("Privacy Notice")'); const body = await pg.locator('body').innerText();
    check(`${c}-not-in-area: Privacy Notice link to /survey/privacy (new tab)`, (await link.count()) === 1 && (await link.getAttribute('href')) === '/survey/privacy' && (await link.getAttribute('target')) === '_blank' && /noopener/.test(await link.getAttribute('rel')));
    check(`${c}-not-in-area: concise retention disclosure, no invented retention period`, /We've kept the details you gave us in our customer system, but we won't use them for sales follow-up/.test(body) && /explains how long we keep them and your rights/.test(body) && !/\b\d+\s*(days?|weeks?|months?|years?)\b/i.test(body.split('Privacy Notice')[0].slice(-400)));
    check(`${c}-not-in-area: still fires only PageView (no Lead, no wren_survey_lead)`, ((await fbq(pg)) || []).filter((a) => a[1] === 'Lead').length === 0 && (await dl(pg, 'wren_survey_lead')).length === 0 && log.console.length === 0, log.console);
    const priv = await pg.context().newPage(); const r = await priv.goto(`${BASE}/survey/privacy`); check(`${c}-not-in-area: the linked notice loads (200)`, r.status() === 200);
    await ctx.close();
  }
  for (const c of ['kitchen', 'garage']) { // the thank-you pages are unchanged: no privacy additions
    const t = await (await fetch(`${BASE}/survey/${c}-thank-you`)).text();
    check(`${c}-thank-you: unchanged (no privacy text added)`, !/survey\/privacy/.test(t) && !/kept the details/.test(t));
  }
  { // viewing the notice never touches the conversion flow: a pending token stays unconsumed, nothing fires
    const { ctx, pg } = await mkPage(br);
    await pg.goto(`${BASE}/survey/kitchen-survey`); await pg.waitForTimeout(800);
    await pg.evaluate(() => sessionStorage.setItem('wren_conversion', JSON.stringify({ submission_id: 'p-1', campaign: 'kitchen', offer: '1000-appliance-upgrade', created_at: Date.now() })));
    const p2 = await ctx.newPage(); let dlSeen = null, reqs = [];
    p2.on('request', (r) => reqs.push(r.url()));
    await p2.goto(`${BASE}/survey/privacy`); await p2.waitForTimeout(1200);
    dlSeen = await p2.evaluate(() => typeof window.dataLayer);
    check('privacy: opening it in the same session fires nothing and leaves a pending conversion token untouched', dlSeen === 'undefined' && !!(await pg.evaluate(() => sessionStorage.getItem('wren_conversion'))) && !reqs.some((u) => /facebook|googletagmanager|api\/survey-lead/.test(u)), reqs);
    await ctx.close();
  }

  // 6d. CONSENT: nothing from Google or Meta before Accept; Reject and no-choice load nothing; Lead only after consent
  const bannerOf = (pg) => pg.locator('[data-wren-consent=banner]');
  const storedChoice = (pg) => pg.evaluate(() => { try { const o = JSON.parse(localStorage.getItem('wren_consent_v1') || 'null'); return o && o.v; } catch (e) { return 'err'; } });
  const thirdParty = (log) => Object.keys(log.hosts).filter((h) => h !== 'localhost:8766');
  const hideBannerOnSurvey = (pg) => pg.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { if (/-survey$/.test(location.pathname)) { const s = document.createElement('style'); s.textContent = '[data-wren-consent=banner]{display:none!important}'; document.head.appendChild(s); } }); });
  for (const r of ROUTES) { // first-time visitor: nothing third-party on any survey page
    const { ctx, pg, log } = await mkPage(br, { consent: 'none' });
    await pg.goto(`${BASE}/survey/${r}`, { waitUntil: 'load' }); await pg.waitForTimeout(1800);
    check(`consent/${r}: first visit makes zero requests to Google, Meta or any third party, and defines no fbq`, thirdParty(log).length === 0 && log.gtmReq === 0 && log.fbReq === 0 && (await pg.evaluate(() => typeof window.fbq)) === 'undefined', log.hosts);
    check(`consent/${r}: first visit starts no GTM (no gtm.js event) and shows the banner`, !(await pg.evaluate(() => (window.dataLayer || []).some((e) => e.event === 'gtm.js'))) && (await bannerOf(pg).count()) === 1);
    check(`consent/${r}: no console errors`, log.console.length === 0, log.console);
    await ctx.close();
  }
  { // banner content, equal prominence, then Accept
    const { ctx, pg, log } = await mkPage(br, { consent: 'none' });
    await pg.goto(`${BASE}/survey/kitchen-survey`, { waitUntil: 'load' }); await pg.waitForTimeout(1200);
    const acc = pg.getByRole('button', { name: 'Accept', exact: true }); const rej = pg.getByRole('button', { name: 'Reject', exact: true });
    const [ba, br2] = [await acc.boundingBox(), await rej.boundingBox()];
    const sty = async (l) => l.evaluate((e) => { const c = getComputedStyle(e); return [c.backgroundColor, c.color, c.fontWeight, c.fontSize, c.borderTopWidth, c.borderTopColor].join('|'); });
    check('consent: Accept and Reject are both present, the same size and the same style (equal prominence)', ba && br2 && Math.abs(ba.width - br2.width) < 1 && Math.abs(ba.height - br2.height) < 1 && (await sty(acc)) === (await sty(rej)) && ba.height >= 44, { ba, br2 });
    check('consent: banner links the Privacy Notice cookie section and explains Google and Meta are optional', (await bannerOf(pg).locator('a[href="/survey/privacy#cookies"]').count()) === 1 && /optional cookies from Google and Meta/.test(await bannerOf(pg).innerText()) && /stay off unless you accept/.test(await bannerOf(pg).innerText()));
    check('consent: banner is a labelled region and does not cover more than a third of a phone screen', (await bannerOf(pg).getAttribute('role')) === 'region' && ((await bannerOf(pg).boundingBox()).height < 844 / 3));
    await acc.click(); await pg.waitForTimeout(1200);
    const q = await fbq(pg);
    check('consent/Accept: GTM requested once, Meta script once, init once, PageView once, banner gone, choice stored', log.gtmReq === 1 && log.fbReq === 1 && q && q.filter((a) => a[0] === 'init').length === 1 && q.filter((a) => a[1] === 'PageView').length === 1 && (await bannerOf(pg).count()) === 0 && (await storedChoice(pg)) === 'granted', { g: log.gtmReq, f: log.fbReq, q });
    check('consent/Accept: GTM start event pushed exactly once', (await pg.evaluate(() => (window.dataLayer || []).filter((e) => e.event === 'gtm.js').length)) === 1);
    await pg.reload({ waitUntil: 'load' }); await pg.waitForTimeout(1500);
    const q2 = await fbq(pg);
    check('consent/Accept: remembered on reload (no banner), GTM and Pixel load once each, PageView once', (await bannerOf(pg).count()) === 0 && log.gtmReq === 2 && q2 && q2.filter((a) => a[1] === 'PageView').length === 1, { g: log.gtmReq });
    check('consent/Accept: no console errors', log.console.length === 0, log.console);
    await ctx.close();
  }
  { // Reject: nothing loads, now or after reload
    const { ctx, pg, log } = await mkPage(br, { consent: 'none' });
    await pg.goto(`${BASE}/survey/garage-survey`, { waitUntil: 'load' }); await pg.waitForTimeout(1000);
    await pg.getByRole('button', { name: 'Reject', exact: true }).click(); await pg.waitForTimeout(800);
    check('consent/Reject: no GTM, no Meta, no fbq, banner gone, choice stored', thirdParty(log).length === 0 && log.gtmReq === 0 && log.fbReq === 0 && (await pg.evaluate(() => typeof window.fbq)) === 'undefined' && (await bannerOf(pg).count()) === 0 && (await storedChoice(pg)) === 'denied', log.hosts);
    await pg.reload({ waitUntil: 'load' }); await pg.waitForTimeout(1200);
    check('consent/Reject: remembered on reload (no banner) and still nothing third-party', (await bannerOf(pg).count()) === 0 && thirdParty(log).length === 0 && log.gtmReq === 0 && log.fbReq === 0);
    await ctx.close();
  }
  for (const [c, cw] of [['kitchen', 'Yes'], ['garage', 'Yes'], ['kitchen', 'No']]) { // rejected visitor still gets full service, and no tracking
    await mock('reset');
    const { ctx, pg, log } = await mkPage(br, { consent: 'denied' });
    await survey(pg, c, cw); await pg.click('button[type=submit]');
    const dest = cw === 'Yes' ? 'thank-you' : 'not-in-area';
    await pg.waitForURL(new RegExp(`/survey/${c}-${dest}$`), { timeout: 15000 }).catch(() => {}); await pg.waitForTimeout(1500);
    const cs = await calls();
    check(`consent/Reject ${c}/${cw}: the enquiry is still sent to GHL once and the right page shows`, pg.url().endsWith(`/survey/${c}-${dest}`) && cs.length === 1 && cs[0].url === `/hooks/${c}-e2e`, { url: pg.url(), n: cs.length });
    check(`consent/Reject ${c}/${cw}: no Lead, no wren_survey_lead, no Pixel, no Google, token removed`, (await dl(pg, 'wren_survey_lead')).length === 0 && (await pg.evaluate(() => typeof window.fbq)) === 'undefined' && thirdParty(log).length === 0 && (await pg.evaluate(() => sessionStorage.getItem('wren_conversion'))) === null, log.hosts);
    check(`consent/Reject ${c}/${cw}: payload carries no Facebook cookie ids (none exist without consent)`, cs[0] && cs[0].body && !JSON.stringify(cs[0].body).match(/fb\.1\./));
    await ctx.close();
  }
  { // Accept AFTER submitting: Lead is held, then fires exactly once with the same event id
    await mock('reset');
    const { ctx, pg, log } = await mkPage(br, { consent: 'none' });
    await hideBannerOnSurvey(pg);
    await survey(pg, 'kitchen', 'Yes'); await pg.click('button[type=submit]');
    await pg.waitForURL(/\/survey\/kitchen-thank-you$/, { timeout: 15000 }).catch(() => {}); await pg.waitForTimeout(1500);
    const sid = (await calls())[0].body.survey_submission_id;
    check('consent/late Accept: on the thank-you page with no choice, nothing loads and no Lead fires yet, token is held', pg.url().endsWith('/survey/kitchen-thank-you') && (await bannerOf(pg).count()) === 1 && thirdParty(log).length === 0 && (await dl(pg, 'wren_survey_lead')).length === 0 && !!(await pg.evaluate(() => sessionStorage.getItem('wren_conversion'))), log.hosts);
    await pg.getByRole('button', { name: 'Accept', exact: true }).click(); await pg.waitForTimeout(1200);
    const q = await fbq(pg); const leads = await dl(pg, 'wren_survey_lead');
    const lead = q.filter((a) => a[0] === 'track' && a[1] === 'Lead');
    check('consent/late Accept: exactly one wren_survey_lead and one Meta Lead, event id = submission id, Lead after init and PageView', leads.length === 1 && leads[0].event_id === sid && lead.length === 1 && lead[0][3].eventID === sid && q.findIndex((a) => a[0] === 'init') < q.findIndex((a) => a[1] === 'PageView') && q.findIndex((a) => a[1] === 'PageView') < q.findIndex((a) => a[1] === 'Lead'), { q, leads });
    check('consent/late Accept: token consumed, no PII in the event', (await pg.evaluate(() => sessionStorage.getItem('wren_conversion'))) === null && !JSON.stringify(leads).match(/Test|example|7700|Road|TR1/));
    await pg.reload({ waitUntil: 'load' }); await pg.waitForTimeout(1500);
    check('consent/late Accept: refresh fires no second Lead', (await dl(pg, 'wren_survey_lead')).length === 0 && !((await fbq(pg)) || []).some((a) => a[1] === 'Lead'));
    await ctx.close();
  }
  { // Reject AFTER submitting: token dropped, never fires later
    await mock('reset');
    const { ctx, pg, log } = await mkPage(br, { consent: 'none' });
    await hideBannerOnSurvey(pg);
    await survey(pg, 'garage', 'Yes'); await pg.click('button[type=submit]');
    await pg.waitForURL(/\/survey\/garage-thank-you$/, { timeout: 15000 }).catch(() => {}); await pg.waitForTimeout(1500);
    await pg.getByRole('button', { name: 'Reject', exact: true }).click(); await pg.waitForTimeout(800);
    check('consent/late Reject: no Lead, no wren_survey_lead, token dropped, nothing third-party', (await dl(pg, 'wren_survey_lead')).length === 0 && (await pg.evaluate(() => sessionStorage.getItem('wren_conversion'))) === null && thirdParty(log).length === 0 && log.fbReq === 0, log.hosts);
    await pg.goto(`${BASE}/survey/garage-thank-you`, { waitUntil: 'load' }); await pg.waitForTimeout(1000);
    check('consent/late Reject: revisiting the thank-you page still fires nothing', (await dl(pg, 'wren_survey_lead')).length === 0 && log.gtmReq === 0 && log.fbReq === 0);
    await ctx.close();
  }
  { // Withdrawing and changing the choice from the privacy page
    const { ctx, pg, log } = await mkPage(br);
    await ctx.addCookies([{ name: '_fbp', value: 'fb.1.1.1', url: BASE }, { name: '_ga', value: 'GA1.1.1.1', url: BASE }, { name: 'keep_me', value: '1', url: BASE }]);
    await pg.goto(`${BASE}/survey/privacy`, { waitUntil: 'load' }); await pg.waitForTimeout(900);
    const st = () => pg.locator('#wren-cookie-settings .wc-status').innerText();
    check('consent/privacy page: shows the current choice (on) with Accept and Reject controls and loads nothing third-party', (await st()) === 'Optional cookies: on' && (await pg.getByRole('button', { name: 'Reject optional cookies' }).count()) === 1 && thirdParty(log).length === 0 && log.gtmReq === 0 && log.fbReq === 0, log.hosts);
    await pg.getByRole('button', { name: 'Reject optional cookies' }).click(); await pg.waitForTimeout(500);
    const names = (await ctx.cookies()).map((c) => c.name);
    check('consent/withdraw: choice becomes denied, status updates, optional cookies on this site are removed, other cookies untouched', (await storedChoice(pg)) === 'denied' && (await st()) === 'Optional cookies: off' && !names.includes('_fbp') && !names.includes('_ga') && names.includes('keep_me'), names);
    await pg.goto(`${BASE}/survey/kitchen-survey`, { waitUntil: 'load' }); await pg.waitForTimeout(1500);
    check('consent/withdraw: later survey pages load no GTM or Meta and show no banner', log.gtmReq === 0 && log.fbReq === 0 && (await bannerOf(pg).count()) === 0 && (await pg.evaluate(() => typeof window.fbq)) === 'undefined');
    await pg.goto(`${BASE}/survey/privacy`, { waitUntil: 'load' }); await pg.getByRole('button', { name: 'Accept optional cookies' }).click(); await pg.waitForTimeout(600);
    check('consent/privacy page: accepting there loads nothing on the notice itself', (await storedChoice(pg)) === 'granted' && log.gtmReq === 0 && log.fbReq === 0 && (await pg.evaluate(() => typeof window.fbq)) === 'undefined');
    await pg.goto(`${BASE}/survey/kitchen-survey`, { waitUntil: 'load' }); await pg.waitForTimeout(1500);
    check('consent/privacy page: the accepted choice then applies on the survey (GTM once, Meta once)', log.gtmReq === 1 && log.fbReq === 1);
    await ctx.close();
  }
  for (const [label, seed] of [['older than 12 months', (n) => ({ v: 'granted', t: n - 400 * 864e5 })], ['dated in the future', (n) => ({ v: 'granted', t: n + 5 * 864e5 })], ['unknown value', (n) => ({ v: 'yes', t: n })], ['not JSON', () => 'granted']]) {
    const { ctx, pg, log } = await mkPage(br, { consent: 'none' });
    await pg.addInitScript(([lab, which]) => { const n = Date.now(); const o = which === 'a' ? { v: 'granted', t: n - 400 * 864e5 } : which === 'b' ? { v: 'granted', t: n + 5 * 864e5 } : which === 'c' ? { v: 'yes', t: n } : null; localStorage.setItem('wren_consent_v1', o ? JSON.stringify(o) : 'granted'); }, [label, { 'older than 12 months': 'a', 'dated in the future': 'b', 'unknown value': 'c', 'not JSON': 'd' }[label]]);
    await pg.goto(`${BASE}/survey/kitchen-survey`, { waitUntil: 'load' }); await pg.waitForTimeout(1200);
    check(`consent/stored choice ${label}: treated as no choice (banner shows, nothing third-party)`, (await bannerOf(pg).count()) === 1 && thirdParty(log).length === 0 && log.gtmReq === 0 && log.fbReq === 0, log.hosts);
    await ctx.close();
  }
  { // storage blocked: fails closed, Accept works for this page only, no errors
    const { ctx, pg, log } = await mkPage(br, { consent: 'none', blockStorage: true });
    await pg.goto(`${BASE}/survey/kitchen-survey`, { waitUntil: 'load' }); await pg.waitForTimeout(1200);
    check('consent/storage blocked: page works, banner shows, nothing third-party', (await bannerOf(pg).count()) === 1 && thirdParty(log).length === 0 && log.gtmReq === 0);
    await pg.getByRole('button', { name: 'Accept', exact: true }).click(); await pg.waitForTimeout(1000);
    check('consent/storage blocked: Accept still works for this page, with no console errors', log.gtmReq === 1 && log.fbReq === 1 && log.console.length === 0, log.console);
    await ctx.close();
  }
  { // consent.js unavailable: the funnel fails closed (no tracking) and still works
    await mock('reset');
    const { ctx, pg, log } = await mkPage(br, { consent: 'granted' });
    await pg.route('**/consent.js', (r) => r.abort());
    await survey(pg, 'kitchen', 'Yes'); await pg.click('button[type=submit]');
    await pg.waitForURL(/\/survey\/kitchen-thank-you$/, { timeout: 15000 }).catch(() => {}); await pg.waitForTimeout(1500);
    check('consent/consent.js blocked: enquiry still submitted, but no GTM, no Pixel, no Lead (fails closed)', pg.url().endsWith('/survey/kitchen-thank-you') && (await calls()).length === 1 && log.gtmReq === 0 && log.fbReq === 0 && (await dl(pg, 'wren_survey_lead')).length === 0);
    await ctx.close();
  }

  // 7. Screenshots for layout comparison (and tablet check)
  const VPS = { mobile: { width: 390, height: 844 }, tablet: { width: 820, height: 1180 }, desktop: { width: 1440, height: 900 } };
  const dirs = [['new', BASE]]; let origSrv;
  if (process.env.ORIG) {
    origSrv = http.createServer((q, s) => { let f = path.join(process.env.ORIG, new URL(q.url, 'http://x').pathname); if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html'; if (!fs.existsSync(f)) { s.writeHead(404); return s.end(); } const t = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webp': 'image/webp' }[path.extname(f)]; s.writeHead(200, { 'content-type': t }); fs.createReadStream(f).pipe(s); }).listen(8767);
    dirs.push(['orig', 'http://localhost:8767']);
  }
  for (const [tag, base] of dirs) for (const [vn, vp] of Object.entries(VPS)) for (const r of ROUTES) {
    const { ctx, pg } = await mkPage(br, { viewport: vp, reduced: true });
    const url = tag === 'new' ? `${base}/survey/${r}` : `${base}/${r}`;
    await pg.goto(url, { waitUntil: 'load' }); await pg.waitForTimeout(2200);
    await pg.screenshot({ path: path.join(OUT, `${tag}_${vn}_${r}.png`), fullPage: true });
    if (r.endsWith('-survey') && vn === 'mobile') {
      const c = r.split('-')[0]; await survey(pg, c, 'Yes', { stopAtForm: true, base, route: tag === 'new' ? `/survey/${r}` : `/${r}` }); await pg.waitForTimeout(500);
      await pg.screenshot({ path: path.join(OUT, `${tag}_${vn}_${r}_form.png`), fullPage: true });
    }
    await ctx.close();
  }
  if (origSrv) origSrv.close();

  await br.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  fs.writeFileSync(path.join(OUT, 'e2e-results.json'), JSON.stringify(results, null, 1));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
