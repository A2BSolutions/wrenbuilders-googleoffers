'use strict';
const test = require('node:test'); const assert = require('node:assert');
const { evaluate, loadFiles } = require('./privacy-approval');
const clone = () => JSON.parse(JSON.stringify(loadFiles()));
const confirmAll = (f) => { const r = JSON.parse(f.register); r.items.forEach((i) => { i.status = 'confirmed'; i.confirmed_by = 'Test Approver'; i.confirmed_on = '2026-11-12'; }); f.register = JSON.stringify(r); return f; };

test('real repo: no build problems, approvals outstanding, so the gate blocks', () => {
  const r = evaluate(loadFiles());
  assert.deepStrictEqual(r.problems, []);
  assert.ok(r.pending.length >= 8, 'blocking approvals must be pending until the business confirms');
});
test('fully confirmed register and clean build passes', () => {
  const r = evaluate(confirmAll(clone()));
  assert.deepStrictEqual(r.problems, []); assert.strictEqual(r.pending.length, 0);
});
test('every item has a type and the 8 blocking items split into 5 factual and 3 compliance', () => {
  const r = evaluate(loadFiles());
  assert.strictEqual(r.pending.filter((i) => i.type === 'factual').length, 5);
  assert.strictEqual(r.pending.filter((i) => i.type === 'compliance').length, 3);
});
test('an item without a valid type is rejected', () => {
  const f = clone(); const r = JSON.parse(f.register); delete r.items[0].type; f.register = JSON.stringify(r);
  assert.ok(evaluate(f).problems.some((p) => /malformed/.test(p)));
});
test('a confirmation without who and when is rejected', () => {
  const f = clone(); const r = JSON.parse(f.register); r.items.forEach((i) => { i.status = 'confirmed'; }); f.register = JSON.stringify(r);
  assert.ok(evaluate(f).problems.some((p) => /without confirmed_by/.test(p)));
});
test('recorded facts never clear the gate and unknown monitoring cannot be skipped', () => {
  const f = clone(); const r = JSON.parse(f.register); r.recorded_facts.forEach((x) => { if (x.status === 'unknown') x.status = 'confirmed_by_user'; });
  r.items = r.items.filter((i) => i.id !== 'privacy_mailbox_monitored'); f.register = JSON.stringify(r);
  assert.ok(evaluate(f).pending.length >= 7);
  const g = clone(); const q = JSON.parse(g.register); q.items = q.items.filter((i) => i.id !== 'privacy_mailbox_monitored'); g.register = JSON.stringify(q);
  assert.ok(evaluate(g).problems.some((p) => /mailbox monitoring is UNKNOWN/.test(p)));
});
test('monitoring stays UNKNOWN and the privacy contact is confirmed with Codex provenance', () => {
  const r = JSON.parse(loadFiles().register); const by = (id) => r.recorded_facts.find((x) => x.id === id);
  assert.strictEqual(by('mailbox_monitoring').status, 'unknown');
  assert.strictEqual(by('privacy_contact_email').status, 'confirmed_by_user');
  assert.ok(/Business Profile/.test(by('privacy_contact_email').provenance));
  assert.ok(/hello@email\.wren-builders\.online/.test(by('automation_sender').statement));
});
test('privacy contact is confirmed, matches the notice, and monitoring stays pending', () => {
  const r = evaluate(loadFiles());
  assert.ok(!r.pending.some((i) => i.id === 'privacy_contact_selected'));
  assert.ok(r.pending.some((i) => i.id === 'privacy_mailbox_monitored'));
  assert.strictEqual(r.facts.find((x) => x.id === 'privacy_contact_email').status, 'confirmed_by_user');
  assert.ok(/hello@email\.wren-builders\.online/.test(JSON.stringify(JSON.parse(loadFiles().register).recorded_facts)));
});
test('changing the notice email away from the confirmed contact is caught', () => {
  const f = confirmAll(clone()); f.privacy = f.privacy.split('mailto:info@wren-builders.com').join('mailto:other@example.com');
  assert.ok(evaluate(f).problems.length > 0);
});
test('non-blocking items never block', () => {
  const f = confirmAll(clone()); const r = JSON.parse(f.register); r.items.filter((i) => !i.blocking).forEach((i) => { i.status = 'pending'; i.confirmed_by = ''; i.confirmed_on = ''; }); f.register = JSON.stringify(r);
  const e = evaluate(f); assert.strictEqual(e.pending.length, 0); assert.deepStrictEqual(e.problems, []);
});
const mutations = {
  'placeholder left in notice': (f) => { f.privacy = f.privacy.replace('Last updated: 11 November 2026', 'Last updated: [[APPROVAL NEEDED: date]]'); },
  'draft banner returns': (f) => { f.privacy = f.privacy.replace('<main>', '<div data-draft="true"></div><main>'); },
  'invented numeric retention period': (f) => { f.privacy = f.privacy.replace('while we deal with your enquiry and any project that follows.', 'for 6 years.'); },
  'invented ICO number': (f) => { f.privacy = f.privacy.replace('Last updated:', 'ICO registration number: ZA123456. Last updated:'); },
  'outside-Cornwall rule removed': (f) => { f.privacy = f.privacy.replace('do not create a sales opportunity', 'may create a sales opportunity'); },
  'privacy page gains a tracker': (f) => { f.privacy = f.privacy.replace('</body>', '<script src="https://www.googletagmanager.com/gtm.js?id=GTM-X"></script></body>'); },
  'privacy page script not manage mode': (f) => { f.privacy = f.privacy.replace(' data-mode="manage"', ''); },
  'GTM snippet back in a page head': (f) => { f.pages['kitchen-survey'] += "<script>j.src='https://www.googletagmanager.com/gtm.js'</script>"; },
  'Meta preconnect back before consent': (f) => { f.pages['garage-thank-you'] += '<link rel="preconnect" href="https://connect.facebook.net">'; },
  'Google Fonts back before consent': (f) => { f.pages['garage-survey'] += '<link href="https://fonts.googleapis.com/css2?family=X" rel="stylesheet">'; },
  'consent.js removed from a page': (f) => { f.pages['kitchen-not-in-area'] = f.pages['kitchen-not-in-area'].replace('<script src="/survey/consent.js"></script>', ''); },
  'consent.js loaded after the funnel': (f) => { const p = 'garage-survey'; f.pages[p] = f.pages[p].replace('<script src="/survey/consent.js"></script>', '').replace('<script src="/survey/wren-funnel.js"></script>', '<script src="/survey/wren-funnel.js"></script><script src="/survey/consent.js"></script>'); },
  'pixel started without consent': (f) => { f.funnel = f.funnel.replace("if (window.WrenConsent) window.WrenConsent.onGrant(loadPixel);", 'loadPixel();'); },
  'funnel no longer fails closed': (f) => { f.funnel = f.funnel.replace("C ? C.state() : 'denied'", "C ? C.state() : 'granted'"); },
  'GTM loads without a consent check': (f) => { f.consent = f.consent.replace("if (state() === 'granted') loadGtm()", 'loadGtm()'); },
  'not-in-area link removed': (f) => { f.pages['garage-not-in-area'] = f.pages['garage-not-in-area'].replace('href="/survey/privacy"', 'href="#"'); },
  'survey link switched off': (f) => { f.funnel = f.funnel.replace("privacy: { url: '/survey/privacy' }", 'privacy: { url: null }'); },
  'notice drops the privacy-request email': (f) => { f.privacy = f.privacy.replace('For any privacy request or question', 'For general questions'); },
  'register unreadable': (f) => { f.register = '{not json'; }
};
for (const [name, mut] of Object.entries(mutations)) {
  test(`gate catches: ${name}`, () => {
    const f = confirmAll(clone()); mut(f);
    const r = evaluate(f);
    assert.ok(r.problems.length > 0, `mutation "${name}" was not detected`);
  });
}
