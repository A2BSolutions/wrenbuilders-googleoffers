/*
 * Wren Builders survey funnels (garage + kitchen): shared config, submission and tracking.
 * Loaded by all 6 pages. This is the ONLY file that should need editing to integrate.
 *
 * INTEGRATION BOUNDARIES (for Claude Code):
 *   1. CONFIG.submitEndpoint  - same-origin server endpoint. Null on purpose: submissions FAIL VISIBLY until set.
 *   2. CONFIG.routes          - thank-you / not-in-area destinations per campaign.
 *   3. CONFIG.tracking        - inline Meta Pixel switch. Set inlineMetaPixel:false once GTM-KF4RWHHQ owns the Pixel.
 * No secrets, API keys or GHL credentials belong in this file. GHL webhooks are called server-side only.
 */
(function () {
  'use strict';
  if (window.WrenFunnel) return; // guard against double execution (prevents duplicate Pixel init)

  var CONFIG = {
    schemaVersion: '1.0',

    // Same-origin endpoint (Vercel Function, api/survey-lead.js). The GHL webhook URLs live only in server env vars.
    // If this is null or the endpoint is down, every submission shows the error message and does NOT redirect.
    submitEndpoint: '/api/survey-lead',
    submitTimeoutMs: 15000,

    // Absolute routes (vercel.json rewrites map each to its .html file). Absolute so a stray trailing slash cannot break them.
    routes: {
      garage:  { thankYou: '/survey/garage-thank-you',  notInArea: '/survey/garage-not-in-area' },
      kitchen: { thankYou: '/survey/kitchen-thank-you', notInArea: '/survey/kitchen-not-in-area' }
    },

    // Survey-specific Privacy Notice (standalone page, no scripts or tracking, never part of the conversion flow).
    // The link shows under the submit button on both survey pages and opens in a new tab so answers are kept.
    // Set url to null to hide the link. The notice content is a DRAFT until docs/SURVEY-PRIVACY-NOTICE-APPROVAL.md is signed off.
    privacy: { url: '/survey/privacy' },

    tracking: {
      // true  = this file is the ONLY owner of Meta Pixel 1135200792433711: it loads it, fires PageView, and fires
      //         a validated Lead on thank-you pages. It skips init if another fbq already exists on the page.
      // false = GTM-KF4RWHHQ owns the Pixel; this file only pushes dataLayer events. Never run both.
      // Verified 10 Nov 2026: the PUBLISHED GTM-KF4RWHHQ version contains no Meta Pixel. Re-check the active
      // workspace before go-live; if a Meta tag exists there, set this to false.
      inlineMetaPixel: true,
      metaPixelId: '1135200792433711',
      conversionMaxAgeMs: 30 * 60 * 1000
    }
  };

  var KEY_SUBMISSION_ID = 'wren_submission_id_';
  var KEY_CONVERSION = 'wren_conversion';

  function ss(op, k, v) {
    try {
      if (op === 'get') return window.sessionStorage.getItem(k);
      if (op === 'set') window.sessionStorage.setItem(k, v);
      if (op === 'del') window.sessionStorage.removeItem(k);
    } catch (e) {}
    return null;
  }

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    var b = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x + 0x100).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  function fail(code, message, extra) {
    var e = new Error(message || code);
    e.code = code;
    if (extra) for (var k in extra) e[k] = extra[k];
    return e;
  }

  function cookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  // Stable per campaign until a successful submission, so retries reuse the same id (server should dedupe on it).
  function getSubmissionId(campaign) {
    var k = KEY_SUBMISSION_ID + campaign;
    var id = ss('get', k);
    if (!id) { id = uuid(); ss('set', k, id); }
    return id;
  }

  function route(campaign, which) {
    var r = CONFIG.routes[campaign] && CONFIG.routes[campaign][which];
    if (!r) throw fail('ROUTE_NOT_CONFIGURED', 'No ' + which + ' route for campaign "' + campaign + '"');
    return r;
  }

  function endpointUrl() {
    if (!CONFIG.submitEndpoint) throw fail('ENDPOINT_NOT_CONFIGURED', 'CONFIG.submitEndpoint is not set in wren-funnel.js');
    var u = new URL(CONFIG.submitEndpoint, window.location.href);
    if (u.origin !== window.location.origin) throw fail('ENDPOINT_NOT_SAME_ORIGIN', 'submitEndpoint must be same-origin');
    return u.toString();
  }

  // Resolves only on HTTP 2xx with a fully typed body. Anything else rejects (fail closed). The SERVER decides, not the page.
  //   accepted     = { ok:true, outcome:'accepted',     sales_qualified:true,  stored_in_ghl:true }  Cornwall = Yes. Thank-you page, conversion allowed.
  //   disqualified = { ok:true, outcome:'disqualified', sales_qualified:false, stored_in_ghl:true }  Outside Cornwall. Stored in GHL (DQ tag).
  //                  Not-in-area page, NEVER a conversion. A disqualified body without stored_in_ghl:true is NOT_CONFIRMED.
  // stored_in_ghl means the GHL receiver acknowledged the webhook (HTTP 2xx), not that the workflow finished.
  function submitLead(payload) {
    var url;
    try { url = endpointUrl(); } catch (e) { return Promise.reject(e); }
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, CONFIG.submitTimeoutMs) : null;
    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Idempotency-Key': payload.submission_id },
      body: JSON.stringify(payload),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (body) {
        if (!res.ok) throw fail('HTTP_' + res.status, 'Endpoint returned ' + res.status, { body: body });
        var typed = body && body.ok === true && body.stored_in_ghl === true &&
          ((body.outcome === 'accepted' && body.sales_qualified === true) || (body.outcome === 'disqualified' && body.sales_qualified === false));
        if (!typed) throw fail('NOT_CONFIRMED', 'Endpoint did not confirm a typed outcome', { body: body });
        return body;
      });
    }, function (err) {
      throw fail(err && err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK', err && err.message);
    }).then(function (b) { if (timer) clearTimeout(timer); return b; }, function (e) { if (timer) clearTimeout(timer); throw e; });
  }

  // Call ONLY after submitLead() resolves. Clears the submission id. Leaves a one-time conversion token for the matching
  // thank-you page ONLY when the server's outcome is 'accepted' (sales-qualified). A disqualified outcome never creates a token.
  function completeSubmission(info) {
    ss('del', KEY_SUBMISSION_ID + info.campaign);
    if (info.outcome === 'accepted') {
      ss('set', KEY_CONVERSION, JSON.stringify({
        submission_id: info.submission_id, campaign: info.campaign, offer: info.offer, created_at: Date.now()
      }));
    }
  }

  function attributionExtras() {
    return { fbp: cookie('_fbp'), fbc: cookie('_fbc'), referrer: document.referrer || '' };
  }

  // ---- Tracking ----
  window.dataLayer = window.dataLayer || [];

  function loadPixel() {
    if (!CONFIG.tracking.inlineMetaPixel) return;
    // Single-owner guard: if a Pixel is already on the page (for example loaded by GTM), do not init it a second time.
    // A second init would double-count PageView. Lead still fires through the existing fbq in onThankYou().
    if (typeof window.fbq === 'function') { window.__wrenPixelOwner = window.__wrenPixelOwner || 'external'; return; }
    window.__wrenPixelOwner = 'wren-funnel';
    /* Meta Pixel base code (ID below). Remove this block if GTM-KF4RWHHQ loads the Pixel. */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', CONFIG.tracking.metaPixelId);
    window.fbq('track', 'PageView');
  }

  // Thank-you pages only. Fires Lead once per successful, qualified submission for THIS campaign.
  // A refresh, direct visit or other-campaign token fires nothing.
  function onThankYou(campaign) {
    var raw = ss('get', KEY_CONVERSION);
    if (!raw) return;
    var t = null;
    try { t = JSON.parse(raw); } catch (e) {}
    if (!t || t.campaign !== campaign || !t.submission_id) return;
    ss('del', KEY_CONVERSION);
    if (Date.now() - (t.created_at || 0) > CONFIG.tracking.conversionMaxAgeMs) return;
    window.dataLayer.push({
      event: 'wren_survey_lead',
      event_id: t.submission_id,
      wren_submission_id: t.submission_id,
      wren_campaign: t.campaign,
      wren_offer: t.offer
    });
    if (CONFIG.tracking.inlineMetaPixel && typeof window.fbq === 'function') {
      window.fbq('track', 'Lead', { content_name: t.offer, content_category: t.campaign }, { eventID: t.submission_id });
    }
  }

  window.WrenFunnel = {
    config: CONFIG,
    getSubmissionId: getSubmissionId,
    route: route,
    submitLead: submitLead,
    completeSubmission: completeSubmission,
    attributionExtras: attributionExtras,
    onThankYou: onThankYou
  };

  loadPixel();

  // Command queue: pages push ['thankYou', campaign] whether or not this file has loaded yet.
  var queued = window.WrenFunnelQueue || [];
  function run(cmd) { if (cmd && cmd[0] === 'thankYou') onThankYou(cmd[1]); }
  window.WrenFunnelQueue = { push: run };
  for (var i = 0; i < queued.length; i++) run(queued[i]);
})();
