/*
 * Wren Builders survey funnels: minimal consent gate for optional tracking.
 *
 * WHAT IT DOES
 *   Nothing from Google or Meta is requested until the visitor clicks Accept. No GTM, no Meta Pixel, no preconnect.
 *   Accept loads Google Tag Manager (GTM-KF4RWHHQ) and tells wren-funnel.js to start the Meta Pixel.
 *   Reject (or no choice) loads nothing. Both buttons look the same. The choice is kept on this device for 12 months.
 *   If browser storage is blocked, the choice lasts for this page only and tracking stays off.
 *
 * WHAT IT IS NOT
 *   It is not a cookie scanner and does not manage any other site. It gates exactly two things: GTM and the Meta Pixel.
 *   The essential storage the survey itself needs (this choice, and session data that carries answers between steps)
 *   is described in the survey Privacy Notice, section 8.
 *
 * MODES
 *   default            survey, thank-you and not-in-area pages: banner while undecided, loads GTM after Accept.
 *   data-mode="manage" privacy page: never loads trackers and never shows the banner. It only renders the Accept and
 *                      Reject controls into #wren-cookie-settings so a visitor can change or withdraw their choice.
 *
 *   REVIEW COPY      /review/* pages (the same pages, served for internal and client review). Never loads GTM or the Pixel, whatever
 *                      choice is stored, shows no cookie banner, and shows a fixed PREVIEW bar instead. See api/survey-review.js.
 *
 * API (window.WrenConsent): state() 'granted'|'denied'|'unset', onGrant(cb), onDeny(cb), accept(), reject().
 */
(function () {
  'use strict';
  if (window.WrenConsent) return;

  var KEY = 'wren_consent_v1';
  var MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
  var GTM_ID = 'GTM-KF4RWHHQ';
  var script = document.currentScript;
  var manage = !!(script && script.getAttribute('data-mode') === 'manage');
  var review = /^\/review(\/|$)/.test(window.location.pathname);

  var memory = null; // used only when storage is blocked: this page only
  var grantCbs = [];
  var denyCbs = [];
  var gtmLoaded = false;
  var banner = null;

  function readRaw() {
    try { var v = window.localStorage.getItem(KEY); if (v !== null) return v; } catch (e) {}
    return memory;
  }
  function writeRaw(v) {
    memory = v;
    try { window.localStorage.setItem(KEY, v); } catch (e) {}
  }

  function state() {
    if (review) return 'denied'; // a review copy never has tracking consent, whatever this browser stored for the live site
    var raw = readRaw();
    if (!raw) return 'unset';
    var o;
    try { o = JSON.parse(raw); } catch (e) { return 'unset'; }
    if (!o || (o.v !== 'granted' && o.v !== 'denied') || typeof o.t !== 'number') return 'unset';
    var age = Date.now() - o.t;
    if (age > MAX_AGE_MS || age < -60000) return 'unset'; // expired, or a clock/forged value from the future
    return o.v;
  }

  function loadGtm() {
    if (manage || review || gtmLoaded) return;
    gtmLoaded = true;
    var w = window, d = document, l = 'dataLayer';
    w[l] = w[l] || [];
    w[l].push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    var f = d.getElementsByTagName('script')[0], j = d.createElement('script');
    j.async = true;
    j.src = 'https://www.googletagmanager.com/gtm.js?id=' + GTM_ID;
    f.parentNode.insertBefore(j, f);
  }

  // Removes the tracking cookies set on this site's own domain. Cookies on other domains are not reachable from here.
  function clearTrackingCookies() {
    var names = document.cookie.split(';').map(function (c) { return c.split('=')[0].trim(); });
    var host = window.location.hostname;
    var parts = host.split('.');
    var domains = ['', host];
    for (var i = 1; i < parts.length - 1; i++) domains.push('.' + parts.slice(i).join('.'));
    names.forEach(function (n) {
      if (!/^(_fbp|_fbc|_ga|_gid|_gat.*|_gcl_.*|_ga_.*|FPLC)$/.test(n)) return;
      domains.forEach(function (dm) {
        document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + (dm ? '; domain=' + dm : '');
      });
    });
  }

  function run(list) { list.slice().forEach(function (cb) { try { cb(); } catch (e) {} }); }

  function set(v) {
    if (review) return;
    var before = state();
    writeRaw(JSON.stringify({ v: v, t: Date.now() }));
    hideBanner();
    render();
    if (v === 'granted') {
      if (before !== 'granted') { loadGtm(); run(grantCbs); }
    } else {
      if (before === 'granted') clearTrackingCookies();
      run(denyCbs);
    }
  }

  function onGrant(cb) {
    if (manage || review) return;
    if (state() === 'granted') { try { cb(); } catch (e) {} return; }
    grantCbs.push(cb);
  }
  function onDeny(cb) {
    if (state() === 'denied') { try { cb(); } catch (e) {} return; }
    denyCbs.push(cb);
  }

  // ---- UI ----
  var CSS =
    '.wc-bar{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;background:#16171a;color:#f7f4ee;border-top:2px solid #b6935a;' +
    'padding:14px 16px calc(14px + env(safe-area-inset-bottom));font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;box-shadow:0 -10px 30px rgba(0,0,0,.35)}' +
    '.wc-in{max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:10px}' +
    '.wc-bar p{margin:0}.wc-bar a{color:#d2b483}' +
    '.wc-row{display:flex;gap:10px}' +
    '.wc-btn{flex:1 1 0;min-height:44px;padding:10px 14px;font:inherit;font-weight:600;color:#16171a;background:#f7f4ee;border:2px solid #b6935a;border-radius:4px;cursor:pointer}' +
    '.wc-btn:hover{background:#fff}.wc-btn:focus-visible{outline:3px solid #d2b483;outline-offset:2px}' +
    '@media(min-width:640px){.wc-in{flex-direction:row;align-items:center;gap:20px}.wc-row{flex:0 0 280px}}' +
    '.wc-set{background:#fff;border:1px solid #e2dacb;border-radius:4px;padding:14px 16px;margin:0 0 14px}' +
    '.wc-set .wc-btn{background:#16171a;color:#f7f4ee;border-color:#16171a}.wc-set .wc-btn:hover{background:#2a2c31}' +
    '.wc-set .wc-btn[aria-pressed="true"]{box-shadow:inset 0 0 0 2px #b6935a}.wc-status{margin:0 0 10px;font-weight:600}';

  function addStyle() {
    if (document.getElementById('wc-style')) return;
    var s = document.createElement('style'); s.id = 'wc-style'; s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  function button(label, fn) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'wc-btn'; b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }

  function showBanner() {
    if (manage || review || banner || state() !== 'unset' || !document.body) return;
    addStyle();
    banner = document.createElement('div');
    banner.className = 'wc-bar'; banner.setAttribute('role', 'region'); banner.setAttribute('aria-label', 'Cookie choices');
    banner.setAttribute('data-wren-consent', 'banner');
    var inner = document.createElement('div'); inner.className = 'wc-in';
    var p = document.createElement('p');
    p.innerHTML = 'We would like to use optional cookies from Google and Meta to measure how well our adverts work. ' +
      'They stay off unless you accept. <a href="/survey/privacy#cookies" target="_blank" rel="noopener">Privacy Notice</a>';
    var row = document.createElement('div'); row.className = 'wc-row';
    row.appendChild(button('Accept', function () { set('granted'); }));
    row.appendChild(button('Reject', function () { set('denied'); }));
    inner.appendChild(p); inner.appendChild(row); banner.appendChild(inner);
    document.body.appendChild(banner);
  }
  function hideBanner() { if (banner && banner.parentNode) banner.parentNode.removeChild(banner); banner = null; }

  var REVIEW_CSS =
    '.wr-bar{position:fixed;left:0;right:0;bottom:0;z-index:2147483001;background:#fff4d6;color:#4a3b00;border-top:3px solid #d9a400;' +
    'padding:10px 16px calc(10px + env(safe-area-inset-bottom));font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;text-align:center}' +
    '.wr-bar b{letter-spacing:.06em}.wr-bar a{color:#4a3b00;font-weight:600;white-space:nowrap}';

  // Review copies only: a fixed bar that says what this is. Nothing typed on a review page is sent or saved.
  function showReviewBar() {
    if (!review || !document.body || document.getElementById('wren-review-bar')) return;
    var st = document.createElement('style'); st.id = 'wren-review-style'; st.textContent = REVIEW_CSS; (document.head || document.documentElement).appendChild(st);
    var what = /privacy/.test(window.location.pathname) ? 'Privacy Notice' : /garage/.test(window.location.pathname) ? 'Garage funnel' : 'Kitchen funnel';
    var bar = document.createElement('div'); bar.id = 'wren-review-bar'; bar.className = 'wr-bar'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Preview notice');
    bar.setAttribute('data-wren-review', 'bar');
    bar.innerHTML = '<b>PREVIEW ONLY</b> · Review copy of the ' + what + '. Not a live campaign page. Nothing you enter is sent or saved, and no tracking runs. <a href="/review">All review pages</a>';
    document.body.appendChild(bar);
    document.body.style.paddingBottom = '84px';
  }

  // Keep reviewers inside the review copy: the notice link points at the review notice.
  if (review) document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var h = a.getAttribute('href') || '';
    if (/^\/survey\/privacy(#.*)?$/.test(h)) a.setAttribute('href', h.replace('/survey/privacy', '/review/privacy'));
  }, true);

  function render() {
    if (review) {
      var rh = document.getElementById('wren-cookie-settings');
      if (rh) { rh.className = ''; rh.innerHTML = '<p class="note">On the live page, two buttons here let a visitor accept or reject optional cookies. They are switched off on this review copy.</p>'; }
      return;
    }
    if (!manage) return;
    var host = document.getElementById('wren-cookie-settings');
    if (!host) return;
    addStyle();
    var st = state();
    host.innerHTML = '';
    host.className = 'wc-set';
    var status = document.createElement('p'); status.className = 'wc-status';
    status.textContent = st === 'granted' ? 'Optional cookies: on' : st === 'denied' ? 'Optional cookies: off' : 'Optional cookies: off (no choice made yet)';
    var row = document.createElement('div'); row.className = 'wc-row';
    var a = button('Accept optional cookies', function () { set('granted'); });
    var r = button('Reject optional cookies', function () { set('denied'); });
    a.setAttribute('aria-pressed', st === 'granted' ? 'true' : 'false');
    r.setAttribute('aria-pressed', st === 'denied' ? 'true' : 'false');
    row.appendChild(a); row.appendChild(r);
    host.appendChild(status); host.appendChild(row);
  }

  window.WrenConsent = { review: review, state: state, onGrant: onGrant, onDeny: onDeny, accept: function () { set('granted'); }, reject: function () { set('denied'); } };

  // Load GTM straight away when consent was already given (same position as the old head snippet). Otherwise load nothing.
  if (state() === 'granted') loadGtm();

  function ready() { showBanner(); showReviewBar(); render(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
