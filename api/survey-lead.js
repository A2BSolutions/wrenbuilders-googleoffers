'use strict';
/*
 * POST /api/survey-lead  (same-origin only)
 * Validates a survey submission and forwards it to the campaign's GHL inbound webhook (BOTH Cornwall answers):
 *   in_cornwall = "Yes": { ok:true, outcome:'accepted', sales_qualified:true, stored_in_ghl:true } after GHL answered 2xx.
 *   in_cornwall = "No":  { ok:true, outcome:'disqualified', reason:'outside_cornwall', sales_qualified:false, stored_in_ghl:true }
 *                        after GHL answered 2xx. The contact is stored with a DQ tag. No sales action, no conversion.
 *   Missing or unexpected in_cornwall: 400 INVALID_PAYLOAD (schema validation), never forwarded.
 * HTTP 2xx from GHL means the webhook was RECEIVED, not that the GHL workflow finished persisting the contact.
 * Any other outcome is non-2xx with ok:false. It fails closed. Clients must read `outcome`, `sales_qualified` and `stored_in_ghl`.
 *
 * Env (server side only, never sent to the browser):
 *   GHL_SURVEY_KITCHEN_WEBHOOK_URL   GHL inbound webhook URL for the kitchen workflow
 *   GHL_SURVEY_GARAGE_WEBHOOK_URL    GHL inbound webhook URL for the garage workflow
 *   SURVEY_ALLOWED_ORIGINS           optional, comma-separated extra origins (default: the request's own host only)
 *   SURVEY_IDEMPOTENCY_STORE         optional, only 'memory' is implemented (default). Anything else fails closed.
 * No PII is ever logged. Logs carry the event code, campaign, submission_id (random UUID) and status only.
 */

const { CAMPAIGNS, validatePayload, buildGhlPayload, isQualified, outcomeBody } = require('./_lib/survey-core');
const { createMemoryStore } = require('./_lib/idempotency');

const MAX_BODY_CHARS = 16 * 1024;
const FORWARD_TIMEOUT_MS = 8000;
const DEFAULT_HOSTS = ['services.leadconnectorhq.com'];

function send(res, status, body, extra) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (extra) for (const k of Object.keys(extra)) res.setHeader(k, extra[k]);
  res.end(JSON.stringify(body));
}

function hostOf(url) { try { return new URL(url).host; } catch (e) { return ''; } }

function originAllowed(req, env) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
  const extra = String(env.SURVEY_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const origin = req.headers.origin;
  const src = origin || req.headers.referer || '';
  if (!src) return false;
  const h = hostOf(src).toLowerCase();
  if (h && h === host) return true;
  const o = origin ? String(origin).toLowerCase() : '';
  return !!o && extra.includes(o);
}

function webhookFor(campaign, env, ghl) {
  const raw = env[CAMPAIGNS[campaign].webhookEnv];
  if (!raw) return null;
  let u;
  try { u = new URL(raw); } catch (e) { return null; }
  if (u.protocol !== 'https:' && !(ghl.allowHttp && u.protocol === 'http:')) return null;
  if (!ghl.allowedHosts.includes(u.hostname)) return null;
  if (!u.pathname.startsWith('/hooks/')) return null;
  return u.toString();
}

async function forward(url, payload, fetchImpl, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'manual', // a redirect is not an acceptance
      signal: ctrl.signal,
    });
    try { if (res.body && res.body.cancel) await res.body.cancel(); } catch (e) { /* ignore */ }
    return res.status >= 200 && res.status < 300 ? { ok: true } : { ok: false, kind: 'UPSTREAM_REJECTED', status: res.status };
  } catch (e) {
    return { ok: false, kind: e && e.name === 'AbortError' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNREACHABLE' };
  } finally {
    clearTimeout(timer);
  }
}

function createHandler(opts = {}) {
  const env = opts.env || process.env;
  const fetchImpl = opts.fetchImpl || fetch;
  const now = opts.now || (() => Date.now());
  const ghl = Object.assign({ allowedHosts: DEFAULT_HOSTS, allowHttp: false }, opts.ghl);
  const forwardTimeoutMs = opts.forwardTimeoutMs || FORWARD_TIMEOUT_MS;
  const storeKind = env.SURVEY_IDEMPOTENCY_STORE || 'memory';
  const store = opts.store || (storeKind === 'memory' ? createMemoryStore() : null);
  // Whitelisted fields only. Never pass request bodies, headers, URLs or error objects here.
  const log = opts.log || ((evt, f) => console.log(JSON.stringify(Object.assign({ evt }, f))));

  return async function handler(req, res) {
    const t0 = now();
    const done = (status, body, evt, f, extra) => {
      log(evt, Object.assign({ status, ms: now() - t0 }, f));
      send(res, status, body, extra);
    };
    try {
      if (req.method !== 'POST') return done(405, { ok: false, error: 'METHOD_NOT_ALLOWED' }, 'rejected', { reason: 'method' }, { Allow: 'POST' });
      if (!originAllowed(req, env)) return done(403, { ok: false, error: 'FORBIDDEN_ORIGIN' }, 'rejected', { reason: 'origin' });
      if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return done(415, { ok: false, error: 'UNSUPPORTED_MEDIA_TYPE' }, 'rejected', { reason: 'content-type' });
      if (Number(req.headers['content-length'] || 0) > MAX_BODY_CHARS * 2) return done(413, { ok: false, error: 'PAYLOAD_TOO_LARGE' }, 'rejected', { reason: 'size' });

      let body = req.body;
      if (Buffer.isBuffer(body)) body = body.toString('utf8');
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { return done(400, { ok: false, error: 'INVALID_JSON' }, 'rejected', { reason: 'json' }); } }
      let size = 0;
      try { size = JSON.stringify(body).length; } catch (e) { size = Infinity; }
      if (size > MAX_BODY_CHARS) return done(413, { ok: false, error: 'PAYLOAD_TOO_LARGE' }, 'rejected', { reason: 'size' });

      const v = validatePayload(body);
      if (!v.ok) return done(400, { ok: false, error: 'INVALID_PAYLOAD', fields: v.fields }, 'rejected', { reason: 'invalid', fields: v.fields });
      const lead = v.value;
      const base = { campaign: lead.campaign, submission_id: lead.submission_id };

      const idem = String(req.headers['idempotency-key'] || '').toLowerCase();
      if (idem !== lead.submission_id) return done(400, { ok: false, error: 'IDEMPOTENCY_MISMATCH' }, 'rejected', Object.assign({ reason: 'idempotency-key' }, base));

      // Both Cornwall answers are forwarded to the campaign's GHL receiver. Only the validated server-side answer decides
      // the outcome. A DQ lead is stored (contact, answers, attribution, DQ tag) but is NOT sales-qualified.
      const qualified = isQualified(lead.answers);

      const url = webhookFor(lead.campaign, env, ghl);
      if (!url || !store) return done(503, { ok: false, error: 'NOT_CONFIGURED' }, 'not_configured', base);

      const key = lead.campaign + ':' + lead.submission_id;
      const claim = await store.begin(key, now());
      if (claim.outcome === 'done') {
        // Best-effort duplicate: answer with what was actually delivered the first time, not with this request's answers.
        const delivered = claim.info && typeof claim.info.qualified === 'boolean' ? claim.info.qualified : qualified;
        return done(200, outcomeBody(delivered, { duplicate: true }), 'duplicate_done', base);
      }
      if (claim.outcome === 'in_progress') return done(409, { ok: false, error: 'IN_PROGRESS' }, 'in_progress', base, { 'Retry-After': '2' });
      if (claim.outcome === 'takeover') log('takeover_in_doubt', Object.assign({ attempts: claim.attempts }, base));

      const result = await forward(url, buildGhlPayload(lead, new Date(now()).toISOString()), fetchImpl, forwardTimeoutMs);
      if (result.ok) {
        await store.complete(key, claim.token, now(), { qualified });
        return done(200, outcomeBody(qualified), qualified ? 'accepted' : 'accepted_dq', base);
      }
      await store.release(key, claim.token);
      const status = result.kind === 'UPSTREAM_TIMEOUT' ? 504 : 502;
      return done(status, { ok: false, error: result.kind }, 'forward_failed', Object.assign({ kind: result.kind, upstream_status: result.status }, base));
    } catch (e) {
      return done(500, { ok: false, error: 'INTERNAL' }, 'internal_error', { name: e && e.name });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
