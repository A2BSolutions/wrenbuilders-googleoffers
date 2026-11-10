# Wren Builders replacement survey funnels: technical handoff

Two replacement Meta survey funnels (Kitchen, Garage). Not a third offer. The live `/kitchen` and `/garage-conversion` funnels are untouched.
Status: built, tested locally and on a hosted Vercel preview, and verified against the real GHL workflows (sections 13 to 16).
**Qualification boundary (16): only Cornwall = Yes is sent to GHL. Cornwall = No gets an explicit DQ outcome and creates or updates nothing. Earlier sections that describe DQ leads being forwarded, tagged or stored are SUPERSEDED by section 16.**
Docs and tests are excluded from deployments by `.vercelignore` (`docs`, `tests`).

## 1. Routes

| Route | File |
|---|---|
| `/survey/kitchen-survey` | `survey/kitchen-survey.html` |
| `/survey/kitchen-thank-you` | `survey/kitchen-thank-you.html` |
| `/survey/kitchen-not-in-area` | `survey/kitchen-not-in-area.html` |
| `/survey/garage-survey` | `survey/garage-survey.html` |
| `/survey/garage-thank-you` | `survey/garage-thank-you.html` |
| `/survey/garage-not-in-area` | `survey/garage-not-in-area.html` |
| `POST /api/survey-lead` | `api/survey-lead.js` |

- `vercel.json`: six explicit rewrites (`/survey/<name>` to `/survey/<name>.html`) and one header rule `/survey/(.*)` with `X-Robots-Tag: noindex, nofollow`. Existing redirects and headers are byte-for-byte the same entries. **Do not apply the export's `vercel.json.example`**: its global `cleanUrls` and `trailingSlash:false` would break `/garage-conversion`.
- All six pages also carry `<meta name="robots" content="noindex, nofollow">`. Indexing decision still open.
- All asset, script and route paths in the survey pages are absolute (`/survey/...`), so a stray trailing slash cannot break them.
- UNKNOWN until a preview is tested: how Vercel treats `/survey/kitchen-survey/` (trailing slash) on the rewrites.

## 2. Files

```
survey/   6 pages, support.js (identical to garage-conversion/support.js), wren-funnel.js, assets/, vendor/ (React 18.3.1, ReactDOM 18.3.1)
api/survey-lead.js            same-origin endpoint
api/_lib/survey-core.js       validation, normalisation, qualification, GHL payload (pure functions)
api/_lib/idempotency.js       idempotency state machine + in-memory store
tests/survey/                 unit tests, dev server, browser tests (dev only)
docs/SURVEY-HANDOFF.md        this file
.vercelignore                 keeps tests/ and docs/ out of deployments
```

Changes made to the exported pages (no visual change; pixel-diffed, see section 9):
1. GTM-KF4RWHHQ head snippet after `<meta charset>` and noscript straight after `<body>`, in the static outer HTML.
2. `<meta name="robots" content="noindex, nofollow">` in the static head.
3. `wren-funnel.js` moved from inside `<helmet>` to a static head script before `support.js`, so Meta PageView does not wait for the runtime.
4. `window.__resources` maps the two unpkg URLs to `/survey/vendor/*` (self-hosted, same files, SRI hashes checked at import).
5. Relative paths made absolute.
6. Survey pages: `componentDidUpdate(pp, ps)` now guards `ps` (see 10). A hidden-by-default "Privacy policy" link (see 8).

## 3. Configuration

Vercel environment variables (server only, never in the browser):

| Name | Needed | Purpose |
|---|---|---|
| `GHL_SURVEY_KITCHEN_WEBHOOK_URL` | yes | GHL inbound webhook for the kitchen workflow. Must be `https://services.leadconnectorhq.com/hooks/...` |
| `GHL_SURVEY_GARAGE_WEBHOOK_URL` | yes | Same for garage |
| `SURVEY_ALLOWED_ORIGINS` | no | Extra comma-separated allowed origins. Default: the request's own host only |
| `SURVEY_IDEMPOTENCY_STORE` | no | Only `memory` is implemented (default). Any other value fails closed |

In `survey/wren-funnel.js`: `submitEndpoint` (`/api/survey-lead`), `routes` (absolute), `privacy.url` (null), `tracking.inlineMetaPixel` (true), `tracking.metaPixelId`.
Without the two webhook variables the endpoint returns 503 and the page shows its error message. It never redirects and never returns `ok:true`.

## 4. Endpoint contract

Request: `POST /api/survey-lead`, `Content-Type: application/json`, header `Idempotency-Key` equal to `submission_id`, body = schema 1.0 from the export handoff (`schema_version`, `submission_id`, `campaign`, `offer`, `lead_source`, `contact`, `answers`, `attribution`, `submission_timestamp`).

Server checks, in order: method, same-origin (`Origin`, else `Referer`), content type, size (16 KB), JSON, strict schema (unknown keys rejected, exact answer labels per campaign, offer must match campaign), UK mobile, UK postcode, email, `Idempotency-Key` equals `submission_id`, webhook configured.
`first_name` and any tags from the client are ignored. `fbp`, `fbc`, `referrer` are validated then dropped (not forwarded). `page_url` loses any query string.

| Status | Body | Meaning |
|---|---|---|
| 200 | `{ok:true,outcome:'accepted'}` | Cornwall = Yes. GHL returned 2xx |
| 200 | `{ok:true,outcome:'accepted',duplicate:true}` | same submission already accepted, not forwarded again |
| 200 | `{ok:true,outcome:'disqualified',reason:'outside_cornwall'}` | Cornwall = No. **No request to GHL, nothing stored.** Not a conversion |
| 400 | `{ok:false,error:'INVALID_PAYLOAD',fields:[names only]}` / `INVALID_JSON` / `IDEMPOTENCY_MISMATCH` | rejected |
| 403 / 405 / 413 / 415 | `FORBIDDEN_ORIGIN` / `METHOD_NOT_ALLOWED` / `PAYLOAD_TOO_LARGE` / `UNSUPPORTED_MEDIA_TYPE` | rejected |
| 409 | `IN_PROGRESS` + `Retry-After: 2` | same submission is being processed |
| 502 / 504 | `UPSTREAM_REJECTED`, `UPSTREAM_UNREACHABLE` / `UPSTREAM_TIMEOUT` | GHL did not accept (8 s timeout, redirects count as failure) |
| 503 | `NOT_CONFIGURED` | webhook env var missing/invalid or unknown store |
| 500 | `INTERNAL` | unexpected |

`ok:true` means GHL accepted the webhook request. A GHL inbound webhook answers 200 on receipt even if the workflow later fails. So persistence still has to be checked inside GHL.
Qualification (server-derived only, see 16): only `in_cornwall = Yes` is forwarded. Kitchen `fitting_timeframe = Just looking for now` adds tag `Low priority`. `owns_property = No` has no rule (recorded only).
Logs contain only: event code, campaign, `submission_id` (random UUID), status, duration, failure kind. No bodies, headers, URLs or error text.

### GHL payload (flat JSON sent to the inbound webhook)

`first_name, last_name, full_name, phone (+447...), email, address1, city, postal_code, lead_source, survey_campaign, survey_offer, survey_submission_id, survey_submission_timestamp (client), survey_received_at (server), survey_page_url, survey_utm_source|medium|campaign|content|term, survey_fbclid, survey_qualified, survey_dq_outside_cornwall, survey_low_priority, survey_priority, tags[], tags_csv, survey_answer_<key> for each of the 4 answers, survey_kitchen_type or survey_garage_type`.
Booleans and tags are both sent so a workflow can branch on a flag and add its static tag.

### Field mapping (VERIFIED by GHL readback, 10 Nov 2026)

The two survey workflows write dedicated survey fields. No field belonging to the older funnels is used.
`survey_campaign`, `survey_offer`, `survey_submission_id`, `survey_submission_timestamp`, `survey_page_url`, `survey_utm_source|medium|campaign|content|term`, `survey_fbclid`, `survey__kitchen_type`, `survey__garage_type`, plus:
Kitchen: `survey_kitchen_fitting_timeframe`, `survey_kitchen_owns_property`, `survey_kitchen_in_cornwall`.
Garage: `survey_garage_conversion_use`, `survey_garage_owns_property`, `survey_garage_in_cornwall`.
Not stored in GHL: `fbp`, `fbc`, `referrer` (not forwarded).
Contact fields: name split into first and last, `+447...` phone, address, city, postcode, source `Meta`, country `GB`.
GHL adds base tags `meta lead`, `survey funnel` and `offer 1: kitchen + £1k upgrade` or `offer 2: garage conversion + free ac upgrade`. Conditional tags `DQ - outside Cornwall` and `Low priority` are stored lower-cased by GHL.

## 5. Idempotency

IMPLEMENTED: a state machine with explicit states, keyed `campaign:submission_id`.
`absent` to `processing` (30 s lease) to `done` (24 h). A live lease gives 409 and the browser retries. A failed forward releases the lease. A lease that expired without an answer is "in doubt" (GHL may have received it): the next attempt takes over and re-forwards, logged as `takeover_in_doubt`. That is at-least-once, so a lead is never silently lost. A `done` record answers `ok:true` without forwarding.
The browser keeps one `submission_id` per campaign per tab until success (`sessionStorage`), so retries and refreshes reuse it.

**LIMIT: the only store is in-process memory. It is not durable.** Vercel instances do not share memory and are recycled, so this only stops same-instance double clicks and fast retries. After a cold start or on another instance, a retry of an already-accepted lead can be forwarded twice.
A plain permanent `SET NX` is not enough: it cannot tell "done" from "died mid-flight", so a crash would lock the lead out forever. The store needs an atomic create-if-absent with a lease, then a transition to done.

Options (none added; each needs approval):

| Option | Notes |
|---|---|
| Redis via Marketplace (Upstash) | Cleanest: `SET key NX PX lease`, then `SET key done EX ttl`. Free tier likely enough at this volume |
| Vercel Blob | `put` with `allowOverwrite:false` is create-if-absent. Lease expiry and transition are not atomic. Usage billed |
| GHL as the store | Search contact by `survey_submission_id` before forwarding. Needs a GHL API credential and adds latency and a failure mode |
| Make the workflow idempotent | Upsert on email and stop if `survey_submission_id` already equals the incoming id. No new dependency, but a duplicate webhook still runs part of the workflow |

Recommendation: Redis (Upstash) behind the existing store interface (`begin`, `complete`, `release`). Until approved, also make the GHL workflow upsert on email and record `survey_submission_id`.

## 6. Tracking

- GTM-KF4RWHHQ is in the static outer HTML of all six pages. `wren-funnel.js` pushes `wren_survey_lead` to `dataLayer`: `{event, event_id, wren_submission_id, wren_campaign, wren_offer}`. No PII.
- No new Google Ads or GA4 conversion is configured. The published container's triggers listen for `generate_lead` and `generate_lead_garage`, neither is pushed by these pages, so no existing conversion can fire from them. Do not reuse `generate_lead`.
- Meta Pixel `1135200792433711` lives in one place: `wren-funnel.js` (`inlineMetaPixel:true`). It loads fbevents once, `init` once, `PageView` on every page, and `Lead` only on a thank-you page that finds a one-time token (matching campaign, under 30 min, deleted before firing) written after a confirmed `ok:true` with Cornwall = Yes. `eventID` = `submission_id`.
- Guards: if an `fbq` already exists on the page (for example from GTM), `wren-funnel.js` does not init or fire PageView again (`window.__wrenPixelOwner`). No Meta CAPI is built.
- Verified 10 Nov 2026 from the public GTM script: the PUBLISHED GTM-KF4RWHHQ version has no Meta Pixel. **UNKNOWN: the active workspace and any unpublished draft.** Check before go-live. If a Meta tag exists there, set `inlineMetaPixel:false` and map a GTM Meta Lead tag to `wren_survey_lead`.

## 7. Performance

React 18.3.1 (10.8 KB) and ReactDOM (132 KB) are self-hosted, removing the unpkg dependency. Babel is not needed and is not shipped: `support.js` only loads it for JSX `x-import` files and these pages use none (verified on the original export and the new pages).
Remaining third parties: Google Fonts, GTM, Meta fbevents. Hero images 75 KB and 115 KB WebP.
A fuller port to plain static HTML would drop the React runtime but risks visual regression and is not done.

## 8. Privacy, phone, copy

- Privacy link: `CONFIG.privacy.url` in `survey/wren-funnel.js` is `null`. While null, nothing renders. When set, a "Privacy policy" link opens in a new tab under the submit button on both survey pages. No URL or legal wording has been invented. **Client to supply the URL, and consent wording if required.**
- Stored in `sessionStorage`: submission id, one-time conversion token, attribution (UTM, no query PII) and the visitor's first name (`wren_first_name`, used only for the thank-you greeting). Decide whether that first name should stay.
- Phone `01872 613608` (`tel:+441872613608`) matches the existing funnels. Mobile-only validation kept as exported (landlines rejected).
- Date-sensitive copy to review before every flight: kitchen "Before Christmas" / "Early 2027" options, "£1,000 free appliance upgrade", "Book this month to secure your upgrade", "Book soon to get fitted before Christmas"; garage "Free AC unit included when you book this month, limited to 3 homeowners" and the thank-you "Limited to 3 homeowners this month"; review ages ("2 months ago"); rating 4.9 / 65; "© 2026".

## 9. Testing

Run from the repo root (Node 20+; browser tests need Playwright):
```bash
node --test --test-force-exit tests/survey/core.test.js tests/survey/api.test.js
node tests/survey/dev-server.js 8766 &
BASE=http://localhost:8766 OUT=/tmp/shots [ORIG=/path/to/original/export] node tests/survey/e2e.js
```
The dev server applies the real `vercel.json` and a mock receiver.
Results at hand-off: 22 unit/API tests pass (a deliberate mutation of tag logic and of the duplicate branch made them fail). 132 browser checks pass: six routes, noindex, GTM, Meta, four submission paths, failure/retry, in-flight lock, thank-you guards, privacy link, console clean. 20 screenshots at 390, 820 and 1440 px match the original export with 0 differing pixels (fonts and motion neutralised).

Not covered: GHL persistence, real GTM/Meta delivery, Vercel rewrite behaviour on a real deployment, real mobile devices, concurrency across instances.
Vercel previews sit behind SSO. A preview POST to `/api/survey-lead` from a browser needs a deployment-protection bypass, which has not been used.

## 10. Known issue fixed

The x-dc runtime calls `componentDidUpdate(prevProps)` only, so the exported `componentDidUpdate(pp, ps)` read `ps.step` on `undefined` and threw on every update (the blank `[error] {}` in the design notes). It is guarded now. That also means the step slide-in written inside it has never run in this runtime. It stays dormant so the approved visuals do not change. To enable it, track the previous step on the instance. That is a visible change, so it needs design approval.
Not fixed (design approval needed): tablet CTA gap at 760 to 899 px, accessibility items listed in the export handoff.

## 11. Go-live checklist

1. Create the two GHL inbound-webhook workflows and map fields (section 4). Decide the mapping.
2. Add `GHL_SURVEY_KITCHEN_WEBHOOK_URL` and `GHL_SURVEY_GARAGE_WEBHOOK_URL` in Vercel (Preview first, then Production).
3. Decide and approve the idempotency store (section 5).
4. Check the GTM active workspace for a Meta Pixel (section 6).
5. Supply the privacy URL (and wording).
6. Test a preview with protection bypass approval: every scenario in section 9 plus one real GHL contact per campaign, in GHL.
7. Merge only after explicit approval.

## 12. Rollback

The change is additive. To roll back: revert the merge commit (removes `survey/`, `api/`, the six rewrites and one header rule), or in Vercel promote the previous production deployment. Existing funnels are unaffected either way. To stop leads without a rollback, remove the two webhook env vars: the endpoint then fails closed with 503.

## 13. Preview environment and controlled live verification (10 Nov 2026)

- Vercel: `GHL_SURVEY_KITCHEN_WEBHOOK_URL` and `GHL_SURVEY_GARAGE_WEBHOOK_URL` are set as **sensitive**, **Preview only**, scoped to branch `claude/modest-cori-ozevju`. Production has no survey variables. Values are never in the repo, in client code or in logs. To widen to all previews or to set Production later, do it in Vercel project settings or with `create_project_env`.
- Controlled test: `tests/survey/live-e2e.js` drives the real endpoint code against the real GHL webhooks from a local dev server (`SURVEY_DEV_LIVE=1`, webhook URLs in that process's environment only). GTM and Meta are stubbed so test traffic never reaches real analytics. Test contacts are `zz-survey-e2e-<run>-sN@example.com`, phones `07700 9007NN`, UTM medium `controlled-test`. Delete them in GHL by that email prefix or the `survey funnel` tag plus the name `ZZ Test`.
- Results: 9 scenarios accepted (HTTP 200). GHL readback confirmed contact fields, all answers, attribution, base tags and conditional tags. No opportunities or conversations were created for the contacts checked.
- Failed delivery: first attempt 502 (no redirect, no Lead), retry with the same `submission_id` returned 200 and produced one contact.
- Duplicate with the same `submission_id`: same instance returns `ok:true, duplicate:true` and forwards nothing. After a simulated cold start (empty memory) it was forwarded again and GHL re-ran the workflow: same contact id, `dateUpdated` moved, fields and tags unchanged, no duplicate contact or tag.

## 14. Hosted Vercel preview verification (10 Nov 2026)

Run against the real preview deployment of commit `e535294` with a temporary, deployment-scoped, 40-minute shareable link, **revoked afterwards**. Project and Production protection were not changed.

- Preview variables work: the hosted function returned 200 only after GHL answered 2xx (a missing variable returns 503 `NOT_CONFIGURED`).
- `tests/survey/hosted-checks.js`: 40 of 40. Six routes 200 with `X-Robots-Tag: noindex, nofollow` and a robots meta tag, assets 200, existing funnel routes and headers unchanged, API gates (405, 403 no or foreign Origin, 415, 400 invalid JSON, 400 invalid payload with field names only, 400 offer mismatch, 400 idempotency mismatch, `no-store`). `/survey/<name>/` with a trailing slash returns 404 (the pages use absolute paths, so use the no-slash URLs in ads). `/survey/<name>.html` also works and is noindex.
- `tests/survey/live-e2e.js` hosted: kitchen and garage, qualified, out of area, low priority, combined tags, and owns property = No. All 200 with the right redirect. Qualified leads fired exactly one `wren_survey_lead` and one Meta `Lead` (`eventID` = `submission_id`); out-of-area fired none; refresh and direct visit fired none. GTM and Meta were stubbed in the browser.
- GHL readback: all answers, contact fields, attribution (including the hosted page URL) and tags correct; the `submission_id` stored in GHL matched the one sent for all 8; no opportunities or conversations.
- Hosted duplicate with the same `submission_id` was suppressed (same warm instance).
- NOT tested on the hosted function: a failed GHL delivery (cannot be simulated without breaking the Preview variable) and a cross-instance duplicate. Both were tested locally.

## 15. GHL behaviour observed (for the workflow owner)

- GHL matches an existing contact by **phone** (fictional test phones repeat across runs). A later submission with the same phone updates the same contact and **overwrites the email, name and survey fields**.
- Conditional tags are only ever added. A person who first submits outside Cornwall and later inside Cornwall would keep `dq - outside cornwall`. Consider removing the opposite tag in the workflow. UNVERIFIED for real leads.
- A replayed submission re-runs the workflow on the same contact (fields and tags unchanged, no duplicate contact or tag).

## 16. Qualification boundary (business requirement, 10 Nov 2026) - supersedes earlier DQ behaviour

Confirmed by the team: Cornwall = Yes goes to GHL and the existing lead process. Cornwall = No goes to the not-in-area page and **must not create or update any GHL record**. No Lead conversion for out-of-area submissions.

**Server (`api/survey-lead.js`, `api/_lib/survey-core.js`)**
- The whole submission is validated first (unchanged). `answers.in_cornwall` must be exactly `"Yes"` or `"No"`; anything else (missing, `null`, wrong case, spaces, arrays, objects, booleans) is 400 `INVALID_PAYLOAD` and is never treated as qualified or DQ.
- Then `isQualified(answers)` is a **positive match** on `"Yes"`. If not qualified, the endpoint returns `200 {ok:true, outcome:'disqualified', reason:'outside_cornwall'}` **before** the webhook is read, the idempotency store is touched, or any request is made. DQ works even if the webhook variable is missing.
- Defence in depth: `buildGhlPayload()` throws `DQ_NOT_FORWARDABLE` for a DQ lead, so a coding mistake cannot send one.
- The GHL payload keeps `survey_qualified` (now always `true`) and `survey_dq_outside_cornwall` (always `false`) so existing mappings still work. The `DQ - outside Cornwall` tag is never sent. `tags` is `["Low priority"]` or `[]`.
- Logs for DQ: event `disqualified`, campaign, `submission_id`, status, duration. No personal data. Vercel logs are the only record of DQ volume.
- DQ is deterministic and never claims an idempotency id, so retries return the same response and a later qualified submission with the same id is forwarded normally.

**Client (`survey/wren-funnel.js`, both survey pages)**
- `submitLead` resolves only for `ok:true` with `outcome` of `accepted` or `disqualified`. `ok:true` with no or an unknown outcome is `NOT_CONFIRMED` (error shown, no redirect).
- The server's outcome decides the route and the conversion, not the page's own answer check. If they disagree the page logs a PII-free warning and follows the server.
- `completeSubmission` writes the one-time conversion token **only** for `accepted`. A DQ never creates a token, so `wren_survey_lead` and Meta `Lead` cannot fire, including after visiting the thank-you page.

**Tests**
- 32 unit and API tests (mutation-checked): zero outgoing requests and zero store calls for DQ; DQ with the identity of an existing contact; retries and duplicates; 21 invalid or unexpected Cornwall values; DQ-looking requests that fail other gates; no PII in logs.
- 131 browser checks plus 20 screenshots identical to the original export (0 differing pixels).
- `tests/survey/live-boundary.js` against the real GHL webhooks (local endpoint code, fictional contacts): 3 qualified submissions produced exactly 3 outgoing requests and 3 contacts; 4 DQ submissions (2 new identities, 2 using the identity of existing contacts) produced 0 outgoing requests (counted by request instrumentation), created no contact, and left the existing contacts' `dateUpdated` and fields unchanged. No opportunities.
- NOT yet re-run on a hosted Vercel preview after this change.

**Effects and open points**
- Out-of-area people leave no CRM trace. The privacy policy copy should say their details are not stored.
- The earlier concern about stale DQ tags no longer applies to new data. Old test contacts that carry `dq - outside cornwall` remain until deleted.
- A DQ person still types and submits their details. The server validates and discards them.

**For Codex (GHL side, no workflow change was made by this repo)**
1. The survey workflows no longer receive DQ leads. Any branch keyed on `survey_dq_outside_cornwall = true` or the tag `DQ - outside Cornwall` is dead and can be left or removed. Do not remove the `Low priority` branch.
2. Existing test contacts created before this change are still in GHL (including `s2`, `s4`, `s6`-style contacts with the DQ tag). Delete them with the other `ZZ Test` contacts (`zz-survey-e2e-*`, `zz-survey-boundary-*`).
3. Re-confirm from workflow execution logs that a qualified lead still triggers the established SMS opener and internal notification, and that no existing production workflow ran.
4. Idempotency is still best-effort (in-memory), so a duplicate qualified submission can re-run the workflow. Add the `survey_submission_id` guard before any side effect.
