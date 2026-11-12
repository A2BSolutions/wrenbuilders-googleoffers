# Kitchen and Garage surveys: internal evidence pack (A2B only)

Not for the client. The client receives `docs/client-approval/wren-survey-approval-package.html` only. This file holds the evidence behind it, the claims A2B cannot substantiate, and what is left. Updated 11 Nov 2026.

## 1. Status

**Update 12 Nov:** the permanent review links are live on Production (review-first, intake still disabled). See `docs/SURVEY-REVIEW-LINKS.md` and register facts `review_links_published`, `survey_intake_disabled_production`, `legacy_funnels_unchanged`.

Implementation, hosted v2 integration and GHL sales workflows are done and verified. Consent controls and the Privacy Notice are built. The package is ready to send. **No client approval has been received.** The release gate (`node tests/survey/privacy-approval.js`) stays BLOCKED on 8 pending approvals, by design.

## 2. Claude Design handoff reconciled with the repository

| Original design decision | Current state | Evidence |
|---|---|---|
| Garage AI hero image | Approved by A2B, not by the client. Real photo optional, not a blocker | Register fact `garage_hero_ai_approved`. No repo document claims client approval |
| Kitchen "Book this month to secure your upgrade" | Kept as designed. A2B-approved. No replacement date needed | Register fact `kitchen_book_this_month_approved` |
| Reassurance copy, error messages, button labels, page titles, review labels | Kept. Provisionally approved, final sign-off requested | Register fact `provisional_copy`, client question A |
| `.dc.html` redirects | Placeholders, replaced by absolute `/survey/...` routes | Gate checks no `.dc.html`, `WREN_WEBHOOK`, `WREN_THANK_YOU` or `x-import` in any survey file |
| Webhook and tracking handover | Implemented: server-side endpoint, consent-gated GTM and Meta Pixel | Unit, API and browser tests |
| `support.js` runtime | Still used by the survey pages. Byte-identical to the legacy copy, self-hosted, React local, Babel never loads | Browser tests: zero unpkg and Babel requests |
| Legacy `/kitchen` and `/garage-conversion` | Untouched | `git diff origin/main HEAD -- kitchen garage-conversion` is empty |

## 3. Frontend fixes this round

An accessibility scan (axe-core 4.9.1, WCAG 2 A and AA, 2.1 A and AA, best practice) ran on all 7 pages at phone and desktop widths, with the cookie banner both visible and hidden. It found no colour-contrast issues and no console errors. It found structural issues, now fixed with no visual change:

- `<html>` had no language. Now `lang="en-GB"` on all six survey pages.
- No `main` landmark on the survey and thank-you pages. Added.
- The progress bar had no accessible name. Now "Survey progress".
- Review star ratings used `aria-label` on plain divs. Now `role="img"`.

Result: zero violations across 7 pages, 2 viewports and 2 consent states. The gate now fails if any of these regress. There are no unresolved production redirects: the only redirects in `vercel.json` are the two legacy ones, unchanged.

## 4. Assertions A2B cannot substantiate

Marked here so nothing is presented to the client as verified when it is not.

| Assertion | What A2B holds | Status |
|---|---|---|
| Lawful bases in the notice (Art 6(1)(b), 6(1)(f), consent for cookies) | Adopted from standard UK practice. No legitimate interests assessment | **Client or adviser must approve** (B1) |
| Purpose for keeping outside-Cornwall records | Stated conservatively. Business has confirmed it keeps them, not why | **Client confirms** (B1) |
| Retention ("only as long as needed", "delete on request") | Criteria only. No automated deletion exists | **Client confirms practice** (B2) |
| ICO data protection fee | Nothing. No number published | **Client confirms** (B5) |
| Provider list is complete | System shows GoHighLevel, Google Sheets, Vercel, Google, Meta. Agency and other processors unknown | **Client confirms** (B3) |
| Data processing terms with each provider | None seen | **Client confirms** (B3) |
| UK transfer mechanism per provider (data bridge, standard terms) | Not verified. The notice names none | **Client or adviser confirms** (B4) |
| Harry's first text is an enquiry response | Stated by the client | Recorded, client re-confirms (C1) |
| Stop requests are honoured (do-not-disturb) | Not verified by A2B | **Client confirms** (C1) |
| No marketing without separate permission | Business practice, not verifiable | **Client confirms** (C1) |
| Privacy mailbox read routinely, answered within one month | Address verified in GHL. Monitoring UNKNOWN | **Client confirms** (C2) |
| Replies to the automation sender `hello@email.wren-builders.online` are read | Unknown | **Client confirms** (C2) |
| Outside-Cornwall enquiries trigger no sales actions | Client confirmation, Codex's published workflow, hosted v2 test | Substantiated. Not re-tested (no hosted submissions) |
| Survey service logs hold no personal data | Unit tests on our log output. Vercel's own platform logs may hold IP addresses, which the notice discloses | Substantiated for our code |
| Offer terms, cap of 3, "reserved", "few hours", "fixed quote", "free home visit", caller number, review authenticity | Creative preserved. Campaigns exist. Nothing proves the terms | **Client attests** (A1 to A8) |
| Live Meta ad text has no expired date | API cannot return ad text. 7 Garage ads active, no Kitchen ads active | **A2B and client read it in Ads Manager** (A9) |

## 5. How client answers are recorded

Client answers arrive by email (the package copies them as text). A2B enters them in `docs/survey-release-register.json` only when the email supplies a name and date, and attaches the email as evidence. Mapping:

| Client questions | Register items |
|---|---|
| A1 to A9 | `offer_claims_true` |
| B1 | `notice_signoff`, `retention_and_dq_purpose` (purposes) |
| B2 | `retention_and_dq_purpose` |
| B3 | `providers_complete` |
| B4 | `transfer_safeguards` |
| B5 | `ico_fee` |
| C1 | `sms_and_calls` |
| C2 | `privacy_mailbox_monitored` |
| D1 | Not a register item. It authorises steps 3 to 8 of `docs/SURVEY-RELEASE-APPROVAL.md` section 6 |

Any "No" or "Let's discuss" leaves the item pending. Claude Code must not mark an item confirmed without that evidence.

## 6. Internal work that remains (nothing needs the client)

- Codex: confirm the v2 DQ branch skips opportunity, Sheets, notification and SMS and has no case-sensitive tag filter; remove the Preview test contacts.
- A2B: read the live Meta ad text for dates (A9), generate a Vercel share link only if a live walkthrough is wanted (Preview is SSO-protected and its forms hit real sales workflows).
- After client approval, A2B executes `docs/SURVEY-RELEASE-APPROVAL.md` section 6 and `docs/SURVEY-PRODUCTION-RUNBOOK.md`.
