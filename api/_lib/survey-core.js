'use strict';
/*
 * Pure functions for /api/survey-lead: schema validation, normalisation, qualification tags, GHL payload.
 * No I/O, no logging. Files under api/_lib are not routes (Vercel ignores underscore-prefixed paths).
 */

const YES_NO = ['Yes', 'No'];

const CAMPAIGNS = {
  garage: {
    offer: 'free-ac-unit',
    webhookEnv: 'GHL_SURVEY_GARAGE_WEBHOOK_URL',
    questions: {
      conversion_use: ['Home office', 'Bedroom or guest room', 'Living or family room', 'Gym', 'Not sure yet'],
      garage_type: ['Attached to the house', 'Detached', 'Integral', 'Not sure'],
      owns_property: YES_NO,
      in_cornwall: YES_NO,
    },
  },
  kitchen: {
    offer: '1000-appliance-upgrade',
    webhookEnv: 'GHL_SURVEY_KITCHEN_WEBHOOK_URL',
    questions: {
      kitchen_type: ['A full new kitchen', 'A partial refit (doors, worktops)', 'Not sure yet'],
      fitting_timeframe: ['Before Christmas', 'Early 2027', 'Just looking for now'],
      owns_property: YES_NO,
      in_cornwall: YES_NO,
    },
  },
};

const TAG_LOW = 'Low priority';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MOBILE = /^(?:\+44|0044|0)7\d{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const POSTCODE = /^(GIR ?0AA|[A-PR-UWYZ][A-HK-Y]?\d[A-Z\d]? ?\d[ABD-HJLNP-UW-Z]{2})$/i;
const CONTROL = /[\u0000-\u001f\u007f]/;

const TOP_KEYS = ['schema_version', 'submission_id', 'campaign', 'offer', 'lead_source', 'contact', 'answers', 'attribution', 'submission_timestamp'];
const CONTACT_KEYS = ['full_name', 'first_name', 'phone', 'email', 'street_address', 'city', 'postcode'];
const ATTR_KEYS = ['page_url', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'fbp', 'fbc', 'referrer'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function strField(obj, key, { min = 0, max, required = false }, bad) {
  const raw = obj[key];
  if (raw === undefined || raw === null || raw === '') {
    if (required) bad.push(key);
    return '';
  }
  if (typeof raw !== 'string') { bad.push(key); return ''; }
  const v = raw.trim();
  if (CONTROL.test(v) || v.length > max || v.length < min) { bad.push(key); return ''; }
  return v;
}

function normalisePhone(raw) {
  const p = String(raw).replace(/[\s\-().]/g, '');
  if (!MOBILE.test(p)) return null;
  if (p.startsWith('+44')) return '+44' + p.slice(3);
  if (p.startsWith('0044')) return '+44' + p.slice(4);
  return '+44' + p.slice(1);
}

function normalisePostcode(raw) {
  const compact = String(raw).toUpperCase().replace(/\s+/g, '');
  if (!POSTCODE.test(compact)) return null;
  return compact.slice(0, -3) + ' ' + compact.slice(-3);
}

function cleanPageUrl(raw, bad) {
  if (!raw) return '';
  if (typeof raw !== 'string' || raw.length > 300 || CONTROL.test(raw)) { bad.push('attribution.page_url'); return ''; }
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('proto');
    return u.origin + u.pathname; // never keep a query string or hash
  } catch (e) { bad.push('attribution.page_url'); return ''; }
}

/**
 * Validates the schema 1.0 payload. Returns { ok:true, value } or { ok:false, fields:[names only] }.
 * `fields` holds field NAMES only, never submitted values, so it is safe to return and log.
 */
function validatePayload(body) {
  const bad = [];
  if (!isObj(body)) return { ok: false, fields: ['body'] };
  for (const k of Object.keys(body)) if (!TOP_KEYS.includes(k)) bad.push(k);

  if (body.schema_version !== '1.0') bad.push('schema_version');
  if (typeof body.submission_id !== 'string' || !UUID_V4.test(body.submission_id)) bad.push('submission_id');
  const campaign = body.campaign;
  const spec = typeof campaign === 'string' && Object.prototype.hasOwnProperty.call(CAMPAIGNS, campaign) ? CAMPAIGNS[campaign] : null;
  if (!spec) bad.push('campaign');
  if (spec && body.offer !== spec.offer) bad.push('offer');
  if (body.lead_source !== 'Meta') bad.push('lead_source');

  // contact
  const c = isObj(body.contact) ? body.contact : (bad.push('contact'), {});
  for (const k of Object.keys(c)) if (!CONTACT_KEYS.includes(k)) bad.push('contact.' + k);
  const cbad = [];
  const full = strField(c, 'full_name', { min: 2, max: 100, required: true }, cbad).replace(/\s+/g, ' ');
  const street = strField(c, 'street_address', { min: 3, max: 200, required: true }, cbad);
  const city = strField(c, 'city', { min: 2, max: 100, required: true }, cbad);
  const emailRaw = strField(c, 'email', { min: 3, max: 254, required: true }, cbad);
  if (emailRaw && !EMAIL.test(emailRaw)) cbad.push('email');
  const phoneRaw = strField(c, 'phone', { min: 1, max: 40, required: true }, cbad);
  const phone = phoneRaw ? normalisePhone(phoneRaw) : null;
  if (phoneRaw && !phone) cbad.push('phone');
  const pcRaw = strField(c, 'postcode', { min: 1, max: 12, required: true }, cbad);
  const postcode = pcRaw ? normalisePostcode(pcRaw) : null;
  if (pcRaw && !postcode) cbad.push('postcode');
  strField(c, 'first_name', { max: 100 }, cbad); // accepted but ignored: derived server-side from full_name
  cbad.forEach((k) => bad.push('contact.' + k));

  // answers: exactly the campaign's four keys, exact option labels
  const answers = {};
  const a = isObj(body.answers) ? body.answers : (bad.push('answers'), {});
  if (spec) {
    for (const k of Object.keys(a)) if (!(k in spec.questions)) bad.push('answers.' + k);
    for (const [k, opts] of Object.entries(spec.questions)) {
      if (typeof a[k] !== 'string' || !opts.includes(a[k])) bad.push('answers.' + k);
      else answers[k] = a[k];
    }
  }

  // attribution: optional strings, bounded
  const at = body.attribution === undefined ? {} : (isObj(body.attribution) ? body.attribution : (bad.push('attribution'), {}));
  for (const k of Object.keys(at)) if (!ATTR_KEYS.includes(k)) bad.push('attribution.' + k);
  const abad = [];
  const attribution = {
    page_url: cleanPageUrl(at.page_url, bad),
    utm_source: strField(at, 'utm_source', { max: 200 }, abad),
    utm_medium: strField(at, 'utm_medium', { max: 200 }, abad),
    utm_campaign: strField(at, 'utm_campaign', { max: 200 }, abad),
    utm_content: strField(at, 'utm_content', { max: 200 }, abad),
    utm_term: strField(at, 'utm_term', { max: 200 }, abad),
    fbclid: strField(at, 'fbclid', { max: 300 }, abad),
  };
  // fbp, fbc and referrer are validated for shape and then dropped. They are not forwarded to GHL.
  ['fbp', 'fbc', 'referrer'].forEach((k) => strField(at, k, { max: 500 }, abad));
  abad.forEach((k) => bad.push('attribution.' + k));

  // client timestamp: must parse; kept only as a record
  let clientTs = '';
  if (typeof body.submission_timestamp !== 'string' || Number.isNaN(Date.parse(body.submission_timestamp))) bad.push('submission_timestamp');
  else clientTs = new Date(body.submission_timestamp).toISOString();

  if (bad.length) return { ok: false, fields: Array.from(new Set(bad)) };

  const parts = full.split(' ');
  return {
    ok: true,
    value: {
      campaign,
      offer: spec.offer,
      submission_id: body.submission_id.toLowerCase(),
      contact: {
        full_name: full,
        first_name: parts[0],
        last_name: parts.slice(1).join(' '),
        phone,
        email: emailRaw,
        street_address: street,
        city,
        postcode,
      },
      answers,
      attribution,
      client_timestamp: clientTs,
    },
  };
}

/**
 * Qualification boundary. A lead is qualified ONLY when the validated answer is exactly "Yes".
 * Positive match on purpose: anything else (including a value that somehow got past validation) is DQ, never qualified.
 * Out-of-area submissions are never sent to GHL (see api/survey-lead.js).
 */
function isQualified(answers) {
  return !!answers && answers.in_cornwall === 'Yes';
}

/** Qualification is derived ONLY from validated answers, never from client-sent tags. */
function qualify(campaign, answers) {
  const qualified = isQualified(answers);
  const low = campaign === 'kitchen' && answers.fitting_timeframe === 'Just looking for now';
  // owns_property has no business rule: recorded only. DQ leads are not forwarded, so there is no DQ tag.
  return { tags: low ? [TAG_LOW] : [], dq_outside_cornwall: !qualified, low_priority: low, qualified };
}

/**
 * Flat JSON for a GHL inbound-webhook workflow. Key names are ours; the workflow maps them to contact fields.
 * Booleans and tags are both sent so a workflow can branch on a flag and add its static tag.
 */
function buildGhlPayload(v, receivedAtIso) {
  const q = qualify(v.campaign, v.answers);
  // Last line of defence: a DQ lead must never be turned into a GHL payload.
  if (!q.qualified) throw new Error('DQ_NOT_FORWARDABLE');
  const p = {
    first_name: v.contact.first_name,
    last_name: v.contact.last_name,
    full_name: v.contact.full_name,
    phone: v.contact.phone,
    email: v.contact.email,
    address1: v.contact.street_address,
    city: v.contact.city,
    postal_code: v.contact.postcode,
    lead_source: 'Meta',
    survey_campaign: v.campaign,
    survey_offer: v.offer,
    survey_submission_id: v.submission_id,
    survey_submission_timestamp: v.client_timestamp,
    survey_received_at: receivedAtIso,
    survey_page_url: v.attribution.page_url,
    survey_utm_source: v.attribution.utm_source,
    survey_utm_medium: v.attribution.utm_medium,
    survey_utm_campaign: v.attribution.utm_campaign,
    survey_utm_content: v.attribution.utm_content,
    survey_utm_term: v.attribution.utm_term,
    survey_fbclid: v.attribution.fbclid,
    survey_qualified: q.qualified,
    survey_dq_outside_cornwall: q.dq_outside_cornwall,
    survey_low_priority: q.low_priority,
    survey_priority: q.low_priority ? 'Low' : 'Normal',
    tags: q.tags,
    tags_csv: q.tags.join(','),
  };
  for (const [k, val] of Object.entries(v.answers)) p['survey_answer_' + k] = val;
  if (v.answers.kitchen_type) p.survey_kitchen_type = v.answers.kitchen_type;
  if (v.answers.garage_type) p.survey_garage_type = v.answers.garage_type;
  return p;
}

module.exports = { CAMPAIGNS, TAG_LOW, validatePayload, isQualified, qualify, buildGhlPayload, normalisePhone, normalisePostcode };
