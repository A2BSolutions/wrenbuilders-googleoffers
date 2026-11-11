'use strict';
/*
 * RELEASE GATE for the Kitchen and Garage survey funnels (privacy, consent and business approvals).
 *   node tests/survey/privacy-approval.js          exit 0 = clear to release, exit 1 = blocked
 *
 * It checks two different things and reports them separately:
 *   A. BUILD PROBLEMS  (Claude Code can fix): the notice is complete and accurate against the code, no third-party tool can
 *      load before consent, the notice is linked where details are collected or kept, nothing unverified is published.
 *   B. OUTSTANDING APPROVALS (only the business can clear): every blocking item in docs/survey-release-register.json must be
 *      status "confirmed" with confirmed_by and confirmed_on. Code never edits that file to pass the gate.
 */
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const PAGES = ['kitchen-survey', 'kitchen-thank-you', 'kitchen-not-in-area', 'garage-survey', 'garage-thank-you', 'garage-not-in-area'];

function loadFiles(root = ROOT) {
  const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8');
  const f = { privacy: rd('survey/privacy.html'), funnel: rd('survey/wren-funnel.js'), consent: rd('survey/consent.js'), register: rd('docs/survey-release-register.json'), pages: {} };
  PAGES.forEach((p) => { f.pages[p] = rd(`survey/${p}.html`); });
  return f;
}

function section(html, n) {
  const m = html.match(new RegExp(`<h2[^>]*>${n}\\. [\\s\\S]*?(?=<h2|</main>)`));
  return m ? m[0] : '';
}

// Returns { problems: [...], pending: [...], notes: [...] }. Pure: takes file contents so tests can feed mutated copies.
function evaluate(f) {
  const problems = []; const pending = []; const notes = [];
  const html = f.privacy;
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  // ---- A1. Notice completeness and accuracy ----
  if (/\[\[|APPROVAL NEEDED|data-draft|\bTODO\b|\bTBC\b|\bTBD\b|lorem ipsum/i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) problems.push('notice still contains a placeholder, draft banner or TODO');
  const heads = { 1: 'Who we are', 2: 'What we collect', 3: 'How and why we use', 4: 'Calls and texts', 5: 'Who we share', 6: 'Transfers outside the UK', 7: 'How long we keep', 8: 'Cookies', 9: 'Your rights', 10: 'Contact us', 11: 'Changes' };
  for (const [n, h] of Object.entries(heads)) if (!new RegExp(`<h2[^>]*>${n}\\. ${h}`).test(html)) problems.push(`notice section ${n} ("${h}") is missing`);
  for (const [label, re] of [['company number 15580800', /15580800/], ['registered address TR4 8PN', /TR4 8PN/], ['phone 01872 613608', /01872 613608/], ['privacy email info@wren-builders.com', /mailto:info@wren-builders\.com/], ['ICO complaint link', /href="https:\/\/ico\.org\.uk\//], ['link to the general privacy policy', /wren-builders\.com\/privacy-policy/]]) if (!re.test(html)) problems.push(`notice is missing ${label}`);
  const s3 = section(html, 3);
  for (const [label, re] of [['a lawful basis for Cornwall enquiries', /Article 6\(1\)\(b\)/], ['a lawful basis for outside-Cornwall records', /Article 6\(1\)\(f\)/], ['consent as the basis for optional cookies', /Legal basis: your consent/], ['the outside-Cornwall rule (no opportunity, lead sheet, notification or sales text)', /do not create a sales opportunity, add it to our lead sheet, notify our sales team or send you a sales text/], ['that outside-Cornwall records are stored in the customer system', /still create or update a record for you in our customer system/]]) if (!re.test(s3)) problems.push(`notice section 3 is missing ${label}`);
  if ((s3.match(/Lawful basis:|Legal basis:/g) || []).length < 3) problems.push('notice section 3 must give a basis for each of the three uses');
  const s7 = section(html, 7).replace(/<li><strong>Your cookie choice<\/strong>[\s\S]*?<\/li>/, '');
  if (!/only for as long as we need them/.test(s7)) problems.push('notice section 7 must state retention criteria');
  if (/\b\d+\s*(days?|weeks?|months?|years?)\b/i.test(s7)) problems.push('notice section 7 states a numeric retention period that is not in the approved register');
  if (/\bZ[A-Z]\d{6,8}\b|ICO (registration|reference)( number| no\.?)?\s*[:\-]/i.test(text)) problems.push('notice publishes an ICO registration number that has not been verified');
  if (!/privacy request[^<]*<a href="mailto:info@wren-builders\.com"/.test(section(html, 10))) problems.push('notice section 10 must name info@wren-builders.com for privacy requests');
  if (!/id="cookies"/.test(html)) problems.push('notice cookie section needs id="cookies" (the banner links to it)');
  if (!/id="wren-cookie-settings"/.test(html)) problems.push('notice has no cookie-choice controls');
  if (!/Last updated: \d{1,2} [A-Z][a-z]+ 20\d\d/.test(text)) problems.push('notice has no last-updated date');

  // ---- A2. Notice stays isolated: only the first-party manage-mode consent script, nothing else ----
  const scripts = html.match(/<script\b[^>]*>/gi) || [];
  if (scripts.length !== 1 || !/src="\/survey\/consent\.js"/.test(scripts[0]) || !/data-mode="manage"/.test(scripts[0])) problems.push('notice must load exactly one script: /survey/consent.js with data-mode="manage"');
  if (/<script\b[^>]*>[^<]+<\/script>/i.test(html) || /GTM-|googletagmanager|fbq\(|fbevents|connect\.facebook|wren-funnel|support\.js|fonts\.g/i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) problems.push('notice loads inline script or tracking (must stay standalone)');
  if (!/name="robots" content="noindex/.test(html)) problems.push('notice robots noindex meta missing');

  // ---- A3. Consent wiring: nothing third-party before consent ----
  PAGES.forEach((p) => {
    const h = f.pages[p];
    const iC = h.indexOf('<script src="/survey/consent.js"></script>'); const iF = h.indexOf('<script src="/survey/wren-funnel.js"></script>');
    if (iC < 0) problems.push(`${p}: consent.js is not loaded`);
    else if (iF >= 0 && iC > iF) problems.push(`${p}: consent.js must load before wren-funnel.js`);
    if (/googletagmanager\.com|connect\.facebook\.net|fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com\/(?!react)/i.test(h.replace(/<!--[\s\S]*?-->/g, '').replace(/window\.__resources=\{[^}]*\}/, ''))) problems.push(`${p}: loads a third-party host before consent (GTM, Meta or Google Fonts)`);
  });
  if (!/GTM-KF4RWHHQ/.test(f.consent) || !/function state\(/.test(f.consent) || !/data-mode/.test(f.consent)) problems.push('consent.js is missing the GTM loader, state or manage mode');
  if (!/if \(state\(\) === 'granted'\) loadGtm\(\)/.test(f.consent)) problems.push('consent.js must load GTM only when consent is granted');
  if (/^\s*loadPixel\(\);/m.test(f.funnel) || !/WrenConsent\.onGrant\(loadPixel\)/.test(f.funnel)) problems.push('wren-funnel.js must start the Meta Pixel only through WrenConsent.onGrant');
  if (!/var st = C \? C\.state\(\) : 'denied'/.test(f.funnel)) problems.push('wren-funnel.js must fail closed when consent.js is missing');
  if (!/privacy:\s*\{\s*url:\s*'\/survey\/privacy'\s*\}/.test(f.funnel)) problems.push("survey Privacy Notice link is not enabled (wren-funnel.js privacy.url must be '/survey/privacy')");

  // ---- A3b. Export placeholders are gone: no .dc.html target, no placeholder webhook or redirect override, no x-import ----
  PAGES.forEach((p) => { if (/\.dc\.html|WREN_WEBHOOK|WREN_THANK_YOU|<x-import/.test(f.pages[p])) problems.push(`${p}: still references a .dc.html file, a placeholder webhook or redirect override, or an x-import`); });
  if (/\.dc\.html|WREN_WEBHOOK|WREN_THANK_YOU/.test(f.funnel)) problems.push('wren-funnel.js still references a .dc.html file or a placeholder webhook or redirect override');

  // ---- A4. Notice reachable where details are collected or kept ----
  for (const c of ['kitchen', 'garage']) {
    const na = f.pages[`${c}-not-in-area`];
    if (!/href="\/survey\/privacy"/.test(na) || !/kept the details you gave us/.test(na)) problems.push(`${c}-not-in-area.html is missing the Privacy Notice link or the retention disclosure`);
    if (!/hasPrivacy/.test(f.pages[`${c}-survey`])) problems.push(`${c}-survey.html is missing the Privacy Notice link`);
  }

  // ---- B. Business approvals ----
  let reg = null;
  try { reg = JSON.parse(f.register); } catch (e) { problems.push('docs/survey-release-register.json is not valid JSON'); }
  if (reg) {
    const items = Array.isArray(reg.items) ? reg.items : [];
    if (!items.length) problems.push('release register has no items');
    const ids = new Set();
    for (const it of items) {
      if (!it.id || ids.has(it.id) || typeof it.blocking !== 'boolean' || !['factual', 'compliance', 'technical'].includes(it.type) || !['pending', 'confirmed'].includes(it.status)) { problems.push(`register item "${it.id}" is malformed`); continue; }
      ids.add(it.id);
      const done = it.status === 'confirmed';
      if (done && (!it.confirmed_by || !/^\d{4}-\d{2}-\d{2}$/.test(it.confirmed_on || ''))) problems.push(`register item "${it.id}" is marked confirmed without confirmed_by and confirmed_on`);
      if (it.blocking && !done) pending.push(it);
      if (!it.blocking && !done) notes.push(it);
    }
  }
  const cc = reg && (reg.items || []).find((i) => i.id === 'privacy_contact_selected');
  if (reg && !cc) problems.push('register has no privacy_contact_selected item');
  else if (cc && cc.status === 'confirmed' && !new RegExp(`mailto:${cc.value.replace(/[.]/g, '\\.')}"`).test(section(html, 10))) problems.push(`notice section 10 does not use the confirmed privacy contact ${cc.value}`);
  const facts = reg && Array.isArray(reg.recorded_facts) ? reg.recorded_facts : [];
  for (const x of facts) if (!x.id || !['verified_by_codex', 'confirmed_by_user', 'verified_in_repo', 'checked_readonly', 'unknown'].includes(x.status) || !x.statement || !x.provenance) problems.push(`recorded fact "${x.id}" is malformed`);
  // A fact that is UNKNOWN must have a blocking approval item, so unknowns can never be skipped.
  if (reg && facts.some((x) => x.id === 'mailbox_monitoring' && x.status === 'unknown') && !(reg.items || []).some((i) => i.id === 'privacy_mailbox_monitored' && i.blocking)) problems.push('mailbox monitoring is UNKNOWN but has no blocking approval item');
  return { problems, pending, notes, facts };
}

module.exports = { evaluate, loadFiles, PAGES };

if (require.main === module) {
  const r = evaluate(loadFiles());
  if (r.problems.length) { console.log('A. BUILD PROBLEMS (fix in code or content):'); r.problems.forEach((p) => console.log(' - ' + p)); }
  if (r.pending.length) { console.log('B. OUTSTANDING BUSINESS APPROVALS (blocking):'); r.pending.forEach((p, i) => console.log(` ${i + 1}. [${p.type}] [${p.id}] ${p.title}`)); }
  if (r.facts.length) { console.log('Recorded facts (not approvals):'); r.facts.forEach((x) => console.log(` - [${x.status}] ${x.id}`)); }
  if (r.notes.length) { console.log('Recommended, not blocking:'); r.notes.forEach((p) => console.log(` - [${p.id}] ${p.title}`)); }
  if (r.problems.length || r.pending.length) { console.log(`\nRELEASE GATE: BLOCKED (${r.problems.length} build problem(s), ${r.pending.length} approval(s) outstanding).`); process.exit(1); }
  console.log('RELEASE GATE: PASS (notice complete, consent wiring verified, all blocking approvals confirmed).');
}
