# Wren Builders replacement survey funnels: technical handoff

Two replacement Meta survey funnels (Kitchen, Garage). Not a third offer. The live `/kitchen` and `/garage-conversion` funnels are untouched.
Status: built and tested locally against a MOCK receiver. Nothing here proves GHL persistence. No GHL webhook exists yet.
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
| 200 | `{ok:true}` | GHL returned 2xx |
| 200 | `{ok:true,duplicate:true}` | same submission already accepted, not forwarded again |
| 400 | `{ok:false,error:'INVALID_PAYLOAD',fields:[names only]}` / `INVALID_JSON` / `IDEMPOTENCY_MISMATCH` | rejected |
| 403 / 405 / 413 / 415 | `FORBIDDEN_ORIGIN` / `METHOD_NOT_ALLOWED` / `PAYLOAD_TOO_LARGE` / `UNSUPPORTED_MEDIA_TYPE` | rejected |
| 409 | `IN_PROGRESS` + `Retry-After: 2` | same submission is being processed |
| 502 / 504 | `UPSTREAM_REJECTED`, `UPSTREAM_UNREACHABLE` / `UPSTREAM_TIMEOUT` | GHL did not accept (8 s timeout, redirects count as failure) |
| 503 | `NOT_CONFIGURED` | webhook env var missing/invalid or unknown store |
| 500 | `INTERNAL` | unexpected |

`ok:true` means GHL accepted the webhook request. A GHL inbound webhook answers 200 on receipt even if the workflow later fails. So persistence still has to be checked inside GHL.
Qualification (server-derived only): `in_cornwall = No` gives tag `DQ - outside Cornwall`. Kitchen `fitting_timeframe = Just looking for now` gives `Low priority`. Both can apply. `owns_property = No` has no rule (recorded only). Tag names come from the export handoff; confirm they match the five tags created in GHL.
Logs contain only: event code, campaign, `submission_id` (random UUID), status, duration, failure kind. No bodies, headers, URLs or error text.

### GHL payload (flat JSON sent to the inbound webhook)

`first_name, last_name, full_name, phone (+447...), email, address1, city, postal_code, lead_source, survey_campaign, survey_offer, survey_submission_id, survey_submission_timestamp (client), survey_received_at (server), survey_page_url, survey_utm_source|medium|campaign|content|term, survey_fbclid, survey_qualified, survey_dq_outside_cornwall, survey_low_priority, survey_priority, tags[], tags_csv, survey_answer_<key> for each of the 4 answers, survey_kitchen_type or survey_garage_type`.
Booleans and tags are both sent so a workflow can branch on a flag and add its static tag.

### Field mapping (PROPOSED, nothing applied)

Existing new fields (verified present, read-only): `survey__kitchen_type`, `survey__garage_type`, `survey_submission_id`, `survey_campaign`, `survey_offer`, `survey_page_url`, `survey_utm_source|medium|campaign|content|term`, `survey_fbclid`, `survey_submission_timestamp`.
There is no new field for `fitting_timeframe`, `conversion_use`, `owns_property`, `in_cornwall`, nor for `fbp`/`fbc`/`referrer`.
Candidate reuse: `fb_offer1_fittingtime`, `fb_offer1_ownproperty`, `fb_offer1_cornwall`, `fb_offer2_property`, `google_o2_q2`. These belong to the older funnels and may feed their workflows or reports. **Inspect workflow dependencies before mapping to them.** Safer option: create four dedicated survey fields instead. Decision needed.

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
