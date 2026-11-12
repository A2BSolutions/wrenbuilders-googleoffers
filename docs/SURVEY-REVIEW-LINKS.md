# Permanent review links for the Kitchen and Garage surveys

Status 12 Nov 2026: **PUBLISHED (review-first).** PR #5 merged to `main` as `f4b9be2`. Production deployment `dpl_NYE1iGCtw2PKknnkLoS7zZbrkJ5q` is READY. Rollback target: `dpl_8N23gbjGZcQtxS2YhdcqM7QTn5Yg` (`main` 28e92ed). The survey funnels are NOT activated: Production has no webhook variables.

## 1. Proposed permanent URLs (on `go.wren-builders.online`)

| Page | URL |
|---|---|
| Hub (start here) | `https://go.wren-builders.online/review` |
| Kitchen enquiry page | `https://go.wren-builders.online/review/kitchen` |
| Kitchen thank-you | `https://go.wren-builders.online/review/kitchen/thank-you` |
| Kitchen not-in-our-area | `https://go.wren-builders.online/review/kitchen/not-in-area` |
| Garage enquiry page | `https://go.wren-builders.online/review/garage` |
| Garage thank-you | `https://go.wren-builders.online/review/garage/thank-you` |
| Garage not-in-our-area | `https://go.wren-builders.online/review/garage/not-in-area` |
| Privacy Notice | `https://go.wren-builders.online/review/privacy` |

No `review` route, folder or file existed before, so nothing conflicts. The live campaign destinations (`/survey/...`, `/kitchen`, `/garage-conversion`) are separate and untouched.

**No login, no expiry.** The custom domain is public (the project's Vercel protection excludes custom domains), and these are ordinary routes, not tokens. Preview deployments on `*.vercel.app` stay behind Vercel login, unchanged.

## 2. How it works (one implementation, not two)

- **Same pages.** The review URLs are rewrites to the existing survey HTML files. There is no copy of the funnel to maintain. Layout, questions, thank-you and not-in-area pages are the real ones.
- **Review mode** is switched on by the URL (`/review/...`) in the two shared scripts, `survey/consent.js` and `survey/wren-funnel.js`:
  - The form posts to `/api/survey-review`, not `/api/survey-lead`.
  - Results go to `/review/<campaign>/thank-you` and `/review/<campaign>/not-in-area`. The notice link goes to `/review/privacy`.
  - A fixed bar says **PREVIEW ONLY**, that it is not a live campaign page, and that nothing entered is sent or saved.
  - GTM and the Meta Pixel never load, whatever consent a browser has stored for the live site. No cookie banner. No `wren_survey_lead`, no Meta `Lead`, no conversion token. Live campaign analytics cannot be contaminated.
  - The cookie buttons on the review notice are switched off, so they cannot change a real visitor's saved choice.
- **Noindex.** Header `X-Robots-Tag: noindex, nofollow` (rule in `vercel.json`) and the page meta tag.

## 3. Why a review page cannot submit a real lead (the server boundary)

1. `api/survey-review.js` is the only endpoint review pages use. It imports one thing, the pure validators from `survey-core`. It reads no environment variable, holds no webhook URL, makes no outgoing request, has no store, and logs only the campaign and outcome. It validates like the real endpoint so reviewers see real errors, then answers `review:true, stored_in_ghl:false`.
2. `api/survey-lead.js` (the real endpoint) refuses with `403 REVIEW_COPY_CANNOT_SUBMIT` any request whose Referer is a `/review` page or that carries `X-Wren-Review`, before validation, storage or any outgoing request. So even a tampered review page that calls the real endpoint is stopped.
3. The live page script rejects a review-shaped response, and the review script rejects a live-shaped one.

Limit: the real endpoint is a public API. A person using a command-line tool with no Referer can still call it, exactly as before this work. That is the same exposure the live funnel always had, and it is why the Vercel rate limit is recommended.

No GHL URL or secret appears in any review file.

## 4. Tests (mocks only)

- `tests/survey/review.test.js` (4): the review endpoint with real-looking webhook variables set to a live mock receiver: zero outgoing requests and the receiver sees nothing, no personal data in logs, same validation, source has no env, network or webhook code, the real endpoint refuses `/review` referers and still serves live pages. Mutation-checked: removing the guard or adding an env read fails them.
- `tests/survey/e2e.js`, new section 6e, in a fresh unauthenticated browser with consent seeded as granted: every review page returns 200 without login with noindex, zero third-party requests, no GTM, Meta or fbq, no console errors; the PREVIEW bar shows; Kitchen and Garage, Yes and No, click through every question to the right review result; the form posts only to `/api/survey-review` and never `/api/survey-lead`; the GHL mock receives nothing; a tampered browser call to the real endpoint gets 403; the notice link stays inside the review copy; each review page is pixel-identical to its live page at phone and desktop widths once the bar is hidden; live pages are unchanged and still track after consent.
- Release gate: now also fails if a review route or noindex header is removed, the review endpoint gains env, network or forwarder code, the real endpoint stops refusing review pages, or review mode stops blocking tracking. 10 new mutation tests.

## 5. Publication (done, review-first)

Verified live on 12 Nov 2026 from an unauthenticated browser: all 8 URLs return 200 with noindex, no third-party requests, PREVIEW bar shown; a Kitchen Yes and a Garage No review journey posted only to `/api/survey-review`; a review page calling the real endpoint got 403. Legacy funnels byte-identical to before. Survey intake stays off until the two Production variables exist, which needs the 8 business approvals first.

### Options that were considered

The review pages ship in the same build as the survey funnels, so **publishing them means merging to `main`, which also puts `/survey/*` and the real `/api/survey-lead` on the live domain.** Two ways to do that:

- **Review-first (safe interim).** Merge without setting the two Production webhook variables. `/survey/*` is then public but unadvertised and noindex, and the real endpoint answers `503 NOT_CONFIGURED` (fails closed), so nothing can reach GHL. The review links work immediately. Campaigns and Meta stay on the legacy pages. This still needs explicit approval because it is a Production merge, and the privacy release gate is still blocked for the full launch.
- **With the launch.** Publish the review links together with the funnels after the 8 approvals are signed.

If neither is wanted, an isolated project (a second Vercel project from the same repo, no environment variables, its own domain) would work but adds infrastructure, so it was not built.

After publication, A2B verifies from a logged-out browser with non-submitting checks (all 8 URLs return 200, noindex, no third-party requests). A review submission is also safe to try, since it cannot reach GHL.
