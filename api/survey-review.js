'use strict';
/*
 * POST /api/survey-review  (REVIEW COPIES ONLY: /review/kitchen and /review/garage)
 *
 * The review pages reuse the real survey pages, but their submit goes HERE instead of /api/survey-lead.
 * This endpoint can never send anything to GHL, by construction:
 *   - it imports only validatePayload and isQualified (pure functions) from survey-core
 *   - it reads no environment variable, holds no webhook URL, makes no outgoing request, keeps no store
 *   - it keeps and logs nothing from the payload (the log holds only the campaign and the outcome)
 * It validates with the same schema as the real endpoint so reviewers see real validation behaviour, then answers
 * with the typed outcome the page expects, marked review:true and stored_in_ghl:false.
 * The real endpoint separately refuses any request that comes from a /review page (see survey-lead.js).
 * tests/survey/review.test.js and the release gate prove both properties.
 */
const { validatePayload, isQualified } = require('./_lib/survey-core');

const MAX_BODY_CHARS = 20000;

function send(res, status, body, extra) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (extra) for (const k of Object.keys(extra)) res.setHeader(k, extra[k]);
  res.end(JSON.stringify(body));
}

function createHandler(opts = {}) {
  const log = opts.log || ((evt, f) => { try { console.log(JSON.stringify(Object.assign({ evt }, f))); } catch (e) {} });
  return async function handler(req, res) {
    try {
      if (req.method !== 'POST') return send(res, 405, { ok: false, review: true, error: 'METHOD_NOT_ALLOWED' }, { Allow: 'POST' });
      if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return send(res, 415, { ok: false, review: true, error: 'UNSUPPORTED_MEDIA_TYPE' });
      let body = req.body;
      if (Buffer.isBuffer(body)) body = body.toString('utf8');
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { return send(res, 400, { ok: false, review: true, error: 'INVALID_JSON' }); } }
      let size = 0;
      try { size = JSON.stringify(body).length; } catch (e) { size = Infinity; }
      if (size > MAX_BODY_CHARS) return send(res, 413, { ok: false, review: true, error: 'PAYLOAD_TOO_LARGE' });
      const v = validatePayload(body);
      if (!v.ok) return send(res, 400, { ok: false, review: true, error: 'INVALID_PAYLOAD', fields: v.fields });
      const qualified = isQualified(v.value.answers);
      log('review_submit', { campaign: v.value.campaign, outcome: qualified ? 'accepted' : 'disqualified' });
      const b = qualified
        ? { ok: true, outcome: 'accepted', sales_qualified: true }
        : { ok: true, outcome: 'disqualified', reason: 'outside_cornwall', sales_qualified: false };
      return send(res, 200, Object.assign(b, { review: true, stored_in_ghl: false, note: 'Review copy. Nothing was sent or saved.' }));
    } catch (e) {
      return send(res, 500, { ok: false, review: true, error: 'INTERNAL' });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
