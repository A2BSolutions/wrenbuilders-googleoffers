'use strict';
/*
 * RELEASE GATE for the survey Privacy Notice. Exit 1 (blocks release) while the page is still a draft.
 *   node tests/survey/privacy-approval.js
 * Passes only when: no [[APPROVAL NEEDED]] marker remains, the data-draft banner is removed, and the page still loads
 * no scripts or tracking. Run it before any Production merge. See docs/SURVEY-PRIVACY-NOTICE-APPROVAL.md.
 */
const fs = require('fs'); const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'survey', 'privacy.html'), 'utf8');
const markers = html.match(/\[\[APPROVAL NEEDED:[^\]]*\]\]/g) || [];
const problems = [];
if (markers.length) problems.push(`${markers.length} unresolved [[APPROVAL NEEDED]] marker(s)`);
if (/data-draft="true"/.test(html)) problems.push('DRAFT banner (data-draft="true") is still present');
if (/<script/i.test(html) || /GTM-|googletagmanager|fbq|connect\.facebook|wren-funnel|support\.js/i.test(html)) problems.push('page loads scripts or tracking (must stay standalone)');
if (!/name="robots" content="noindex/.test(html)) problems.push('robots noindex meta missing');
if (problems.length) { console.log('PRIVACY NOTICE NOT APPROVED FOR RELEASE:'); problems.forEach((p) => console.log(' - ' + p)); markers.forEach((m, i) => console.log(`   ${i + 1}. ${m.slice(0, 150)}`)); process.exit(1); }
console.log('Privacy Notice release gate: PASS (no unresolved items, no draft banner, no scripts).');
