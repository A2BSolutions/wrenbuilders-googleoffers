# Survey privacy, consent and release approvals

Status (12 Nov 2026): the notice, consent gate and release gate are built. **Release is blocked only by 7 business confirmations** in `docs/survey-release-register.json`. Nothing here is legal advice. Where the business has not decided something, the notice states a standard UK position, says so here, and a named approval is required.

## 1. What changed on the business's two decisions

1. **Standard UK practice.** The notice now states lawful bases, retention criteria and consent rules in the way ICO guidance expects for a small UK business. These are **adopted, not approved or documented**. Approval item `notice_signoff` covers them.
2. **Keep the existing creative.** No campaign wording or offer name was changed. The business's instruction is treated as approval to keep the creative, not proof that claims are true. Claims needing a fact check are in `docs/SURVEY-CAMPAIGN-COPY.md` and approval item `offer_claims_true`.

## 2. Verified operational facts (the notice relies on these)

| Fact | Evidence |
|---|---|
| **VERIFIED.** Outside-Cornwall enquiry: GHL contact created or updated, all answers and attribution stored, campaign tags kept, tag `DQ - outside Cornwall`. No opportunity, no Leads Master row, no internal notification, no Harry SMS | Business confirmed 11 Nov. Matches Codex's published GHL workflow state. Hosted v2 test read back the contact and tag. (GHL stores tags in lower case: `dq - outside cornwall`) |
| Cornwall enquiry: team email, lead-sheet row, opportunity, Harry's first SMS | Codex's published workflow state. I cannot read GHL workflows (API 403) |
| Fields collected: name, mobile, email, street, city, postcode, four answers, campaign data, Facebook click ID, page URL, time | Server payload code, GHL readback |
| `fbp`, `fbc` and referrer are validated then dropped. They never reach GHL | `api/_lib/survey-core.js`, unit tests |
| Survey service logs hold no names, phones, emails, addresses or answers | Unit tests on log output |
| Meta `Lead` fires only for Cornwall enquiries, with offer and campaign names, no contact details or answers, and **only after the visitor accepts optional cookies** | `survey/wren-funnel.js`, browser tests |
| Before Accept, no request goes to Google or Meta from any survey page (GTM, Pixel, preconnect, noscript iframe and Google Fonts all removed or gated; Work Sans is self-hosted) | Browser tests: zero third-party requests on all 6 pages and the notice |
| Company number 15580800, Penstraze Business Centre, Penstraze, Truro, Cornwall, TR4 8PN, 01872 613608, info@wren-builders.com | Footer already published on the survey pages |
| Hosting is Vercel, customer system is GoHighLevel, lead sheet is Google Sheets, ads tools are Google and Meta | System configuration |

## 3. Lawful bases considered (stated in the notice, not yet documented by the business)

| Use | Basis stated | Why it fits, and the weak point |
|---|---|---|
| Quote, call or text for a Cornwall enquiry | Art 6(1)(b), steps at the person's request before a contract. Fallback 6(1)(f) | The person asked for a quote. Weak point: texts must stay a reply to the enquiry. Marketing needs separate consent |
| Keeping an outside-Cornwall record | Art 6(1)(f) legitimate interests | A note of the enquiry, dealing with a return contact, advert measurement. Weak point: a legitimate interests assessment has not been written (`lia_and_records`, recommended). The purposes need business confirmation (`retention_and_dq_purpose`) |
| Optional Google and Meta tools | Consent (also the PECR permission for storing or reading on the device) | Built: nothing loads before Accept |

## 4. Harry's SMS (assessed, unchanged)

Treated as a reply to an enquiry the person submitted, not as consent to unrelated marketing. No marketing opt-in box was added, because no marketing message is part of this flow. The notice says marketing texts or emails would need separate permission. Still needed: the business confirms the first text is a reply only, that stop requests are honoured, and that no marketing follows without permission (`sms_and_calls`).

## 5. Consent mechanism (built)

- `survey/consent.js`, first-party, loaded first on all six pages. Banner with equal-weight Accept and Reject. Choice kept 12 months, then asked again. Storage blocked means no tracking.
- Accept: loads GTM-KF4RWHHQ, then the funnel starts the Meta Pixel and PageView.
- Reject or no choice: nothing loads. The enquiry still works and is still sent to GHL.
- **Qualified-lead conversion after consent.** The one-time conversion token is kept until the visitor decides. Accept: one `wren_survey_lead` and one Meta `Lead`, same event id as the submission, then the token is consumed. Reject: token dropped. Direct visits, refreshes and other campaigns still fire nothing.
- Withdraw or change the choice on `/survey/privacy` (section 8). Rejecting removes `_fbp`, `_fbc`, `_ga*`, `_gid` and `_gcl_*` cookies on this site, and later pages load nothing optional.
- `consent.js` missing: the funnel fails closed, with no tracking.
- Assessed as essential and not gated: the stored choice, and session storage that carries answers and campaign details between steps (no third party, cleared when the tab closes). Weak point: campaign details in session storage are arguably attribution rather than strictly necessary. They are only sent when the person submits, and the notice discloses them. Adviser may confirm.

## 6. Not published, deliberately

- No ICO registration number (`ico_fee`: the business confirms fee status).
- No fixed retention period (criteria only; a number and deletion routine are recommended, `retention_number`).
- No named agency or SMS carrier (`providers_complete`).
- No named transfer mechanism (`transfer_safeguards`).

## 7. Who does what

**Wren Builders must confirm (blocking, in the register):** `notice_signoff`, `sms_and_calls`, `providers_complete`, `transfer_safeguards`, `retention_and_dq_purpose`, `ico_fee`, `offer_claims_true`. To confirm, set `status` to `confirmed` and fill `confirmed_by` and `confirmed_on`.

**Recommended, not blocking:** `retention_number`, `lia_and_records`, `firewall_rate_limit`, `test_contacts_cleanup`.

**Claude Code has done:** the notice, consent gate, funnel gating, self-hosted fonts, the release gate (structured, with tests that fail if a tracker or placeholder returns), the Production runbook, and all local tests.

**Claude Code cannot do:** confirm any approval, change GHL workflows, set Production variables, deploy, or switch Meta URLs without explicit approval.

## 8. Release gate

`node tests/survey/privacy-approval.js` exits 0 only when (A) the notice is complete and accurate against the code, no third-party tool can load before consent, and the notice is linked where details are collected or kept, and (B) every blocking register item is confirmed with a name and date. It prints build problems and outstanding approvals separately. `tests/survey/gate.test.js` proves it catches 18 regressions.

## 9. Files

`survey/privacy.html`, `survey/consent.js`, `survey/wren-funnel.js`, the six survey pages (GTM snippet, noscript, preconnects and Google Fonts link removed), `survey/vendor/work-sans.css` and `survey/vendor/fonts/*.woff2`, `docs/survey-release-register.json`, `tests/survey/privacy-approval.js`, `tests/survey/gate.test.js`, `tests/survey/e2e.js`, `tests/survey/hosted-checks.js`.
