'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePayload, qualify, isQualified, buildGhlPayload, normalisePhone, normalisePostcode, TAG_LOW } = require('../../api/_lib/survey-core');
const { kitchen, garage, clone } = require('./helpers');

const bad = (p) => { const r = validatePayload(p); assert.equal(r.ok, false); return r.fields; };

test('valid kitchen and garage payloads pass and normalise', () => {
  const k = validatePayload(kitchen()); assert.equal(k.ok, true);
  assert.equal(k.value.contact.phone, '+447700900123');
  assert.equal(k.value.contact.postcode, 'TR1 2AB');
  assert.equal(k.value.contact.first_name, 'Alex');
  assert.equal(k.value.contact.last_name, 'Tester Jones');
  assert.equal(k.value.attribution.page_url, 'https://go.wren-builders.online/survey/kitchen-survey'); // query stripped
  const g = validatePayload(garage()); assert.equal(g.ok, true);
  assert.equal(g.value.contact.phone, '+447700900456');
});

test('phone: UK mobiles only, all accepted prefixes normalise to +44', () => {
  for (const p of ['07700 900123', '07700900123', '+44 7700 900123', '0044 7700 900123', '(07700) 900-123', '07700.900.123']) assert.equal(normalisePhone(p), '+447700900123', p);
  for (const p of ['01872 613608', '02071234567', '07700 90012', '0770090012345', '+44 1872 613608', 'abc', '']) assert.equal(normalisePhone(p), null, p);
});

test('postcode normalises and rejects junk', () => {
  assert.equal(normalisePostcode('tr12ab'), 'TR1 2AB');
  assert.equal(normalisePostcode(' TR11   3aa '), 'TR11 3AA');
  assert.equal(normalisePostcode('GIR0AA'), 'GIR 0AA');
  for (const p of ['ZZ99 9ZZ', '12345', 'TR1', 'TR1 2A']) assert.equal(normalisePostcode(p), null, p);
});

test('field rules match the client validation', () => {
  let p = kitchen(); p.contact.full_name = 'A'; assert.ok(bad(p).includes('contact.full_name'));
  p = kitchen(); p.contact.street_address = 'ab'; assert.ok(bad(p).includes('contact.street_address'));
  p = kitchen(); p.contact.city = 'x'; assert.ok(bad(p).includes('contact.city'));
  p = kitchen(); p.contact.email = 'nope'; assert.ok(bad(p).includes('contact.email'));
  p = kitchen(); p.contact.phone = '01872 613608'; assert.ok(bad(p).includes('contact.phone'));
  p = kitchen(); p.contact.postcode = 'ZZ99 9ZZ'; assert.ok(bad(p).includes('contact.postcode'));
  p = kitchen(); delete p.contact.email; assert.ok(bad(p).includes('contact.email'));
  p = kitchen(); p.contact.city = 'Tru\u0000ro'; assert.ok(bad(p).includes('contact.city'));
  p = kitchen(); p.contact.full_name = 'x'.repeat(101); assert.ok(bad(p).includes('contact.full_name'));
});

test('campaign and offer are verified, not trusted', () => {
  let p = garage(); p.offer = '1000-appliance-upgrade'; assert.ok(bad(p).includes('offer'));
  p = kitchen(); p.offer = 'free-ac-unit'; assert.ok(bad(p).includes('offer'));
  p = kitchen(); p.campaign = 'bathroom'; assert.ok(bad(p).includes('campaign'));
  p = kitchen(); p.campaign = '__proto__'; assert.ok(bad(p).includes('campaign'));
  p = kitchen(); p.lead_source = 'Google'; assert.ok(bad(p).includes('lead_source'));
  p = kitchen(); p.schema_version = '2.0'; assert.ok(bad(p).includes('schema_version'));
  p = kitchen(); p.submission_id = 'not-a-uuid'; assert.ok(bad(p).includes('submission_id'));
  p = kitchen(); p.submission_timestamp = 'yesterday'; assert.ok(bad(p).includes('submission_timestamp'));
});

test('answers: exact labels, exact keys per campaign', () => {
  let p = kitchen(); p.answers.kitchen_type = 'A new kitchen'; assert.ok(bad(p).includes('answers.kitchen_type'));
  p = kitchen(); delete p.answers.in_cornwall; assert.ok(bad(p).includes('answers.in_cornwall'));
  p = kitchen(); p.answers.conversion_use = 'Gym'; assert.ok(bad(p).includes('answers.conversion_use'));
  p = garage(); p.answers.fitting_timeframe = 'Early 2027'; assert.ok(bad(p).includes('answers.fitting_timeframe'));
  p = garage(); p.answers.garage_type = 'Shed'; assert.ok(bad(p).includes('answers.garage_type'));
  p = garage(); p.answers.owns_property = 'Maybe'; assert.ok(bad(p).includes('answers.owns_property'));
});

test('unknown keys are rejected, client-sent tags and first_name are not trusted', () => {
  let p = kitchen(); p.tags = ['VIP']; assert.ok(bad(p).includes('tags'));
  p = kitchen(); p.contact.role = 'admin'; assert.ok(bad(p).includes('contact.role'));
  p = kitchen(); p.attribution.extra = 'x'; assert.ok(bad(p).includes('attribution.extra'));
  p = kitchen(); p.contact.first_name = 'Hacker'; const r = validatePayload(p); assert.equal(r.ok, true); assert.equal(r.value.contact.first_name, 'Alex');
  assert.deepEqual(validatePayload(null), { ok: false, fields: ['body'] });
  assert.deepEqual(validatePayload([]), { ok: false, fields: ['body'] });
});

test('invalid-field report holds names only, never submitted values', () => {
  const p = kitchen(); p.contact.email = 'secret-value@bad'; p.contact.phone = '0123SECRET';
  const f = bad(p); assert.ok(!JSON.stringify(f).includes('secret') && !JSON.stringify(f).includes('SECRET'));
});

test('qualification boundary: qualified ONLY when the answer is exactly "Yes" (positive match)', () => {
  assert.equal(isQualified({ in_cornwall: 'Yes' }), true);
  for (const v of ['No', 'yes', 'YES', ' Yes', 'Yes ', '', null, undefined, true, 1, ['Yes'], {}]) assert.equal(isQualified({ in_cornwall: v }), false, JSON.stringify(v));
  assert.equal(isQualified({}), false); assert.equal(isQualified(null), false); assert.equal(isQualified(undefined), false);
});

test('qualification flags: kitchen low priority only applies to forwardable (Cornwall Yes) leads', () => {
  assert.deepEqual(qualify('kitchen', { in_cornwall: 'Yes', fitting_timeframe: 'Before Christmas', owns_property: 'Yes' }).tags, []);
  assert.deepEqual(qualify('kitchen', { in_cornwall: 'Yes', fitting_timeframe: 'Just looking for now', owns_property: 'Yes' }).tags, [TAG_LOW]);
  assert.equal(qualify('kitchen', { in_cornwall: 'No', fitting_timeframe: 'Early 2027', owns_property: 'Yes' }).qualified, false);
  assert.equal(qualify('garage', { in_cornwall: 'No', owns_property: 'Yes' }).qualified, false);
  assert.deepEqual(qualify('garage', { in_cornwall: 'Yes', owns_property: 'No' }).tags, []); // owns_property: record only
  assert.equal(qualify('garage', { in_cornwall: 'Yes', fitting_timeframe: 'Just looking for now' }).low_priority, false);
  assert.equal(TAG_LOW, 'Low priority');
});

test('a DQ lead can never be turned into a GHL payload (last line of defence)', () => {
  const k = kitchen(); k.answers.in_cornwall = 'No';
  assert.throws(() => buildGhlPayload(validatePayload(k).value, 't'), /DQ_NOT_FORWARDABLE/);
  const g = garage(); g.answers.in_cornwall = 'No';
  assert.throws(() => buildGhlPayload(validatePayload(g).value, 't'), /DQ_NOT_FORWARDABLE/);
});

test('GHL payload (qualified only): flat, normalised, flags, no Meta cookies, no referrer', () => {
  const k = kitchen(); k.answers.fitting_timeframe = 'Just looking for now';
  const v = validatePayload(k).value; const g = buildGhlPayload(v, '2026-11-10T10:00:01.000Z');
  assert.equal(g.phone, '+447700900123'); assert.equal(g.postal_code, 'TR1 2AB'); assert.equal(g.address1, '12 Secret Lane');
  assert.equal(g.survey_campaign, 'kitchen'); assert.equal(g.survey_offer, '1000-appliance-upgrade');
  assert.equal(g.survey_submission_id, v.submission_id); assert.equal(g.survey_received_at, '2026-11-10T10:00:01.000Z');
  assert.equal(g.survey_kitchen_type, 'A full new kitchen'); assert.equal(g.survey_answer_fitting_timeframe, 'Just looking for now');
  assert.equal(g.survey_answer_in_cornwall, 'Yes');
  assert.equal(g.survey_qualified, true); assert.equal(g.survey_dq_outside_cornwall, false); assert.equal(g.survey_low_priority, true);
  assert.deepEqual(g.tags, ['Low priority']); assert.equal(g.tags_csv, 'Low priority');
  assert.equal(g.survey_utm_source, 'facebook'); assert.equal(g.survey_fbclid, 'abc');
  assert.ok(!('fbp' in g) && !('fbc' in g) && !('referrer' in g) && !JSON.stringify(g).includes('fb.1.2.3'));
  for (const val of Object.values(g)) assert.ok(typeof val !== 'object' || Array.isArray(val), 'payload must be flat');
  const gg = buildGhlPayload(validatePayload(garage()).value, 'x');
  assert.equal(gg.survey_garage_type, 'Attached to the house'); assert.ok(!('survey_kitchen_type' in gg)); assert.equal(gg.survey_priority, 'Normal');
});
