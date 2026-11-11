# Kitchen and Garage surveys: final release approval

Branch `claude/modest-cori-ozevju`, commit below. Prepared 12 Nov 2026. **Nothing in this document is approved yet.** Claude Code does not tick any box. To approve, a named person sets the item to `confirmed` in `docs/survey-release-register.json` (status, `confirmed_by`, `confirmed_on`). The release gate (`node tests/survey/privacy-approval.js`) exits 0 only when all seven are done.

## 1. GO / NO-GO

**NO-GO until the 7 confirmations below are signed.** There is no critical technical issue. The creative stays as it is (decided by Wren). Safe to merge only after sign-off, Production variables and the checks in section 5.

## 2. Wren must confirm facts (4)

Only the business knows these. Answer yes, or say what is different.

| # | Register id | Confirm |
|---|---|---|
| F1 | `sms_and_calls` | Harry's first text is only a reply to the enquiry, not marketing. A person who asks us to stop texts or calls is removed (GHL do-not-disturb works). No marketing text or email goes out without separate permission |
| F2 | `providers_complete` | The only people who handle these details for us are GoHighLevel, Google Sheets, Vercel, the agency/IT providers who manage our systems, and Google and Meta (after consent). No other SMS carrier, email or CRM tool |
| F3 | `ico_fee` | The ICO data protection fee is paid, or Wren is exempt. (No number is published) |
| F4 | `offer_claims_true` | Every claim in section 4 is true on the day the ads go live |

## 3. Wren (or its adviser) must approve compliance positions (3)

These were adopted from standard UK practice on Wren's instruction. They are **not yet approved or documented**.

| # | Register id | Approve |
|---|---|---|
| C1 | `notice_signoff` | The Privacy Notice at `/survey/privacy` and the text under the submit button. This includes the lawful bases stated: Article 6(1)(b) for quotes, 6(1)(f) for keeping outside-Cornwall records, consent for optional Google and Meta cookies |
| C2 | `retention_and_dq_purpose` | Retention by criteria, not a fixed period. Purposes for outside-Cornwall records: a note of the enquiry, dealing with a return contact, advert measurement. Records are deleted when no longer needed or on request |
| C3 | `transfer_safeguards` | Each non-UK provider (GoHighLevel, Vercel, Google, Meta) has a valid UK transfer mechanism, such as UK-US data bridge certification or standard contract terms with the UK Addendum. The notice does not name them |

Recommended, not blocking: set a fixed retention period and a deletion routine; write down the legitimate interests assessment; add a Vercel rate limit on `/api/survey-lead`; Codex removes the Preview test contacts.

## 4. Claims Wren must attest are accurate on launch day (F4)

Exact text as shown today. Write Y or N and the evidence. Any N: use the fallback in `docs/SURVEY-CAMPAIGN-COPY.md`.

| Where | Exact claim |
|---|---|
| Kitchen survey | "Answer a few quick questions and we'll be in touch with your quote, plus your £1,000 free appliance upgrade." |
| Kitchen thank-you | "Your £1,000 free appliance upgrade is reserved." and "Book this month to secure your upgrade." |
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
- **Gate and tests.** 24 gate tests, 33 unit and API tests and the full browser suite pass. The release gate exits 1 only for the 7 pending approvals above. No build problems.
- **Known limit.** A missing Production variable returns `503 NOT_CONFIGURED`, but only after the payload validates. That cannot be tested without a valid submission, so check the variable names in Vercel and use the one authorised live test.

## 6. Release actions after sign-off (in order)

| # | Action | Owner | Needs |
|---|---|---|---|
| 1 | Sign the 7 items in the register. Gate exits 0 | Wren | Sign-off |
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
