# Kitchen and Garage surveys: final release approval

**Client approval RELAYED BY A2B, 12 Nov 2026.** Harry (Wren Builders) approved the new funnels, the Kitchen £1,000 appliance upgrade and the Garage Free AC offers including their conditions, the existing frontend content and promotional claims, the survey Privacy Notice and proposed lead handling, and proceeding with launch. This is a relayed approval. There is no direct written approval, signature or client timestamp. It does **not** independently verify the ICO fee, UK transfer safeguards, provider completeness or privacy mailbox monitoring: those 4 items stay pending in the register and the release gate still exits 1 on them. Production intake activation was done on A2B's instruction. **Real ad traffic stays NO-GO** until the controlled live test passes and those items are resolved or accepted in writing. Plan: `docs/SURVEY-META-CUTOVER.md`.

The client-facing version is `docs/client-approval/wren-survey-approval-package.html`. Evidence and unsubstantiated claims: `docs/SURVEY-EVIDENCE-PACK.md`.

Branch `claude/modest-cori-ozevju`, commit below. Updated 11 Nov 2026. **Nothing in this document is approved yet.** Claude Code does not tick any box. To approve, a named person sets the item to `confirmed` in `docs/survey-release-register.json` (status, `confirmed_by`, `confirmed_on`). The release gate (`node tests/survey/privacy-approval.js`) exits 0 only when all eight are done.

## 1. GO / NO-GO

**NO-GO until the 8 confirmations below are signed (5 facts, 3 compliance positions).** There is no critical technical issue. The creative stays as it is (decided by Wren). Safe to merge only after sign-off, Production variables and the checks in section 5.

## 1a. Already recorded (not approvals, they do not clear the gate)

| Fact | Source |
|---|---|
| **CONFIRMED:** `info@wren-builders.com` is the privacy contact email for both surveys (register item `privacy_contact_selected`) | Selection approved by Wren, 11 Nov. Address verified by Codex: it appears in GHL Location Settings, Business Profile and Harry Wren's GHL user record, and an earlier GHL internal notification sent to it was opened |
| Automation sender `hello@email.wren-builders.online` | Verified by Codex. Preserved and unchanged. Not the privacy contact |
| Harry's first SMS is an enquiry response, not separate marketing | Stated by Wren in the release session |
| The Kitchen £1,000 appliance upgrade and Garage free AC campaigns are running separately. Creative stays unless a claim is disproven | Stated by Wren in the release session |
| Outside-Cornwall enquiries are stored and tagged with no sales actions | Business confirmed, Codex's published workflow, hosted v2 test |
| The Garage AI hero image is approved for launch. A real client photograph is optional, **not a blocker**. It was approved by A2B, **not by the client**, and must not be called client-approved | Stated by Wren. The repo holds no claim that the client approved it |
| Kitchen "Book this month to secure your upgrade" was approved by A2B. **No replacement book-by date is needed** | Stated by Wren |
| Reassurance copy, error messages, button labels, page titles and review labels were approved **provisionally**, pending final sign-off | Stated by Wren. Final sign-off is F5 |
| The original `.dc.html` redirects were export placeholders and are gone. Webhook and tracking handover is implemented | Repo check, enforced by the release gate. No `.dc.html`, `WREN_WEBHOOK`, `WREN_THANK_YOU` or `x-import` in any survey file |
| 7 Garage "Free AC" ads are ACTIVE in the Wren ad account. No Kitchen ads are ACTIVE. Ad text could not be read through the API | Read-only Meta check, nothing changed. See F5 |
| **Routine monitoring of `info@wren-builders.com` is UNKNOWN** | Codex could not verify it. Still open as F4 below |

## 2. Wren must confirm facts (5)

Only the business knows these. Answer yes, or say what is different.

| # | Register id | Confirm |
|---|---|---|
| F1 | `sms_and_calls` | A person who replies "stop" or asks us to stop is removed from texts and calls (GHL do-not-disturb works). No marketing text or email goes out without separate permission. (That the first text is only an enquiry response is already recorded.) |
| F2 | `providers_complete` | The only people who handle these details for us are GoHighLevel, Google Sheets, Vercel, the agency and IT providers who manage our systems, and Google and Meta (after consent). No other SMS carrier, email or CRM tool |
| F3 | `ico_fee` | The ICO data protection fee is paid, or Wren is exempt. (No number is published) |
| F4 | `privacy_mailbox_monitored` | `info@wren-builders.com` is read routinely and someone answers privacy requests within one month. Also say who handles replies sent to the automation sender `hello@email.wren-builders.online` |
| F5 | `offer_claims_true` | Sign off the provisional copy, and confirm the remaining claims in section 4 are true on the day the ads go live. Also read the live ad text in Ads Manager and confirm no ad carries an expired date. The API could not show it |

## 3. Wren (or its adviser) must approve compliance positions (3)

These were adopted from standard UK practice on Wren's instruction. They are **not yet approved or documented**.

| # | Register id | Approve |
|---|---|---|
| C1 | `notice_signoff` | The Privacy Notice at `/survey/privacy` and the text under the submit button. This includes the lawful bases stated: Article 6(1)(b) for quotes, 6(1)(f) for keeping outside-Cornwall records, consent for optional Google and Meta cookies |
| C2 | `retention_and_dq_purpose` | Retention by criteria, not a fixed period. Purposes for outside-Cornwall records: a note of the enquiry, dealing with a return contact, advert measurement. Records are deleted when no longer needed or on request |
| C3 | `transfer_safeguards` | Each non-UK provider (GoHighLevel, Vercel, Google, Meta) has a valid UK transfer mechanism, such as UK-US data bridge certification or standard contract terms with the UK Addendum. The notice does not name them |

Recommended, not blocking: review or remove "Before Christmas" after 25 Dec 2026; set a fixed retention period and a deletion routine; write down the legitimate interests assessment; add a Vercel rate limit on `/api/survey-lead`; Codex removes the Preview test contacts.

## 4. Provisional copy to sign off, and claims to attest on launch day (F5)

That the two offers exist and the creative stays is already recorded (section 1a). The exact text below still needs a Y or N and the evidence, because a running campaign does not prove the cap, "reserved", timing or review wording. Any N: use the fallback in `docs/SURVEY-CAMPAIGN-COPY.md`.

| Where | Exact claim |
|---|---|
| Kitchen survey | "Answer a few quick questions and we'll be in touch with your quote, plus your £1,000 free appliance upgrade." |
| Kitchen thank-you | "Your £1,000 free appliance upgrade is reserved." and "Book this month to secure your upgrade." (A2B-approved. No fixed date is needed. The upgrade must be honoured for anyone who books that month) |
| Kitchen step 2 | Option "Before Christmas" and "Book soon to get fitted before Christmas." (today is 11 Nov: about six weeks) |
| Garage survey | "Free AC unit included when you book this month, limited to 3 homeowners." |
| Garage step 5 | "We're only taking on 3 garage conversions this month, so places are limited." |
| Garage thank-you | "Your free AC unit is reserved." and "Limited to 3 homeowners this month." |
| Both thank-you | "reach out within a few hours" (twice), "Free home visit.", "A clear, fixed quote with no hidden costs.", "We'll call you from 01872 613608." |
| Both surveys and thank-you | "Real reviews from Cornwall homeowners", with "Google review · N months ago" labels (typed in, they go stale). One kitchen review is from a main contractor, not a homeowner. "100% would come back" (garage) |
| Both surveys | "Get your free … quote in 60 seconds" (the 60 seconds is the form, not the quote) |

## 5. Technical state (verified locally, mocks only)

- **Tracking and consent.** Nothing from Google or Meta loads before Accept on any survey, thank-you or not-in-area page, or on the notice. Accept loads GTM-KF4RWHHQ and the Meta Pixel. After Accept, a qualified lead fires one `wren_survey_lead` and one Meta `Lead`, once. Late Accept on the thank-you page still fires it once. Reject drops it. The enquiry always reaches GHL regardless of choice.
- **A2B initial-HTML GTM standard: documented exception.** The standard puts the GTM snippet in the initial static HTML head. UK PECR forbids that for non-essential tracking before consent. So the GTM snippet is replaced by `consent.js`, a static script in the same head position (first script, before the funnel and React). A visitor who already accepted gets GTM requested as soon as `consent.js` has downloaded and run, which is before React and the app load. The one difference from the inline standard is about one extra network round trip, because `consent.js` is an external file. A first-time visitor gets GTM only after Accept. A test proves GTM is requested before the app runtime. Tag Assistant and crawlers that read raw HTML will not see the container until consent is given. This is a deliberate, compliant exception, not a defect.
- **Runtime.** The survey pages still use `survey/support.js`, the Design Component runtime. It is byte-identical to the one in `/garage-conversion`, self-hosted, and its `.dc.html`, unpkg and Babel code paths are dormant (tests prove zero such requests). The export placeholders are gone. Replacing the runtime would be a redesign and is not planned.
- **Gate and tests.** 24 gate tests, 33 unit and API tests and the full browser suite pass. The release gate exits 1 only for the 8 pending approvals above. No build problems.
- **Known limit.** A missing Production variable returns `503 NOT_CONFIGURED`, but only after the payload validates. That cannot be tested without a valid submission, so check the variable names in Vercel and use the one authorised live test.

## 6. Release actions after sign-off (in order)

| # | Action | Owner | Needs |
|---|---|---|---|
| 1 | Sign the 8 items in the register. Gate exits 0 | Wren | Sign-off |
| 2 | Confirm v2 workflows published, DQ branch skips opportunity, Sheets, notification and SMS, no case-sensitive tag filter. Remove Preview test contacts | Codex | Written confirmation |
| 3 | In Vercel, add `GHL_SURVEY_KITCHEN_WEBHOOK_URL` and `GHL_SURVEY_GARAGE_WEBHOOK_URL`: Sensitive, **Production only**, pasted from the GHL v2 workflow triggers. No other variable is needed. Never put the URLs in chat or the repo | Wren or A2B Solutions | **Approval** |
| 4 | Optional: Vercel firewall rate limit on `POST /api/survey-lead`, about 10 per minute per IP | Wren | **Approval** |
| 5 | Open a PR from `claude/modest-cori-ozevju` to `main` and merge it. The branch is 12 commits ahead and 0 behind, and merges cleanly. Merging deploys Production on `go.wren-builders.online` | Wren | **Approval** |
| 6 | Confirm the new deployment is READY and was built after step 3. Run the non-submitting checks (below) | Claude Code | None |
| 7 | One authorised live test, outside Cornwall (No) first: expect the not-in-area page, a GHL contact with the DQ tag, and no opportunity, Sheets row, notification or SMS. A Cornwall Yes test triggers real sales actions and the tester's SMS, so it needs its own approval. After Accept, one `Lead` in Meta Test Events with the submission id | Wren | **Approval** |
| 8 | Switch the Meta ad URLs. Replace only the path and keep every UTM parameter: `/kitchen` becomes `/survey/kitchen-survey`, `/garage-conversion/` becomes `/survey/garage-survey`, on `https://go.wren-builders.online`. Editing a URL sends the ad back into Meta review, so do it in a quiet period | Wren or A2B Solutions | **Approval** |
| 9 | Watch the first 24 hours: Vercel logs (`accepted`, `accepted_dq`, `duplicate_done`, no `rejected` spikes) against GHL counts | Claude Code and Wren | None |

**Non-submitting smoke checks (step 6).** For the six `/survey/` routes and `/survey/privacy`: status 200, `X-Robots-Tag: noindex, nofollow`, HTML loads `/survey/consent.js` and has no `googletagmanager`, `connect.facebook.net` or `fonts.googleapis.com`. `/survey/consent.js` and `/survey/vendor/work-sans.css` return 200. `GET /api/survey-lead` returns 405. `/kitchen` and `/garage-conversion` still load. Variable names and targets are visible in Vercel. No form is submitted.

## 7. Rollback

- **Target:** the current Production deployment `dpl_8N23gbjGZcQtxS2YhdcqM7QTn5Yg`, built from `main` commit `28e92ed` (PR #3, "Simplify lead forms"). Vercel marks it a rollback candidate.
- **How:** Vercel, Deployments, that deployment, Promote. Or revert the merge on `main`. Then point the Meta ad URLs back to `/kitchen` and `/garage-conversion/`. The legacy funnels are untouched, so they keep working throughout.
- **Owner (to confirm by Wren):** decision by Wren. Execution by A2B Solutions (Vercel project owner and Meta ads). Claude Code can prepare the revert but will not deploy without approval.
- **Leave in place:** the Production variables are harmless. GHL contacts already created stay, and Codex handles them.
