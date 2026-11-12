# Survey funnels: Production runbook (PREPARED, NOT EXECUTED)

The short approval version, with the exact release order, rollback target and owner, is `docs/SURVEY-RELEASE-APPROVAL.md`. This file keeps the detail.

Nothing here has been run. Every step marked **APPROVAL** needs an explicit yes from Wren Builders. Do not merge, deploy, set Production variables or change Meta URLs before the release gate passes.

## 1. Current state (read-only checks, 11 Nov 2026)

| Item | State |
|---|---|
| Vercel team and project | A2B Solutions, project `wrenbuilders-googleoffers` (`prj_sKaFaKNbl8Gtuo8PVcvsJci3A8Ix`), Node 24 |
| Production domain | `go.wren-builders.online` (public). The `*.vercel.app` domains sit behind Vercel SSO, so ads must use the custom domain |
| Production variables | **None for the survey.** 0 Production variables exist |
| Preview variables | `GHL_SURVEY_KITCHEN_WEBHOOK_URL`, `GHL_SURVEY_GARAGE_WEBHOOK_URL`: sensitive, Preview, branch `claude/modest-cori-ozevju` only, pointing at the v2 receivers |
| Stale text | Both Preview variable comments still say "sales actions disabled". Sales actions are now active. Comment-only fix, not made |
| Legacy funnels | `git diff origin/main HEAD -- kitchen garage-conversion` is empty |
| Config diff vs main | `vercel.json`: 7 survey rewrites and 1 `/survey/(.*)` noindex header rule, nothing else. `.vercelignore`: adds `tests` and `docs` |

## 2. Production environment variables to create (APPROVAL)

| Name | Type | Target | Value |
|---|---|---|---|
| `GHL_SURVEY_KITCHEN_WEBHOOK_URL` | Sensitive | Production only | The Kitchen **v2** receiver URL (same one the Preview variable uses) |
| `GHL_SURVEY_GARAGE_WEBHOOK_URL` | Sensitive | Production only | The Garage **v2** receiver URL (same one the Preview variable uses) |

Nothing else is needed. `SURVEY_ALLOWED_ORIGINS` is not needed because the endpoint accepts its own host by default, which includes `go.wren-builders.online`. `SURVEY_IDEMPOTENCY_STORE` is not needed.

How to set them without exposing the URLs:
1. Sensitive Preview values cannot be read back. Copy each URL from the GHL workflow trigger (Codex, or whoever owns the workflow), not from chat.
2. Vercel dashboard, Project, Settings, Environment Variables, Add. Tick **Production only**, set type **Sensitive**, paste, save. Or run `vercel env add GHL_SURVEY_KITCHEN_WEBHOOK_URL production --sensitive` and paste at the prompt. Repeat for Garage.
3. Never put the URLs in the repo, a ticket, a chat, or a log. A Production variable change only applies to new deployments, so redeploy afterwards.
4. Do not reuse the v1 receivers. The code only accepts `https://services.leadconnectorhq.com/hooks/...` URLs, and v1 has no DQ gate.

## 3. Order of operations

| # | Step | Owner | Gate |
|---|---|---|---|
| 1 | Confirm the 8 blocking items in `docs/survey-release-register.json`. `node tests/survey/privacy-approval.js` must exit 0 | Wren | Gate PASS |
| 2 | Confirm v2 workflows are published with sales actions active, the DQ branch skips opportunity, Sheets, notification and SMS, and no filter is case-sensitive on `DQ - outside Cornwall` | Codex | Written confirmation |
| 3 | Remove the Preview test contacts from GHL | Codex | Done |
| 4 | Create the two Production variables (section 2) | Wren or Claude Code with **APPROVAL** | Variables listed as Production, sensitive |
| 5 | Optional but recommended: Vercel firewall rate limit on `POST /api/survey-lead` (for example 10 requests per minute per IP, then block for 10 minutes). Real GHL sales actions and SMS sit behind this public endpoint | Wren with **APPROVAL** | Rule active |
| 6 | Merge `claude/modest-cori-ozevju` to `main`. This builds and deploys Production | Wren with **APPROVAL** | Deployment READY |
| 7 | GET-only checks (section 4) | Claude Code | All pass |
| 8 | Real-browser consent check on a phone (section 5) | Wren | Pass |
| 9 | One controlled test submission (section 6) | Wren with **APPROVAL** | Pass |
| 10 | Switch Meta ad URLs to the `/survey/` routes on `go.wren-builders.online`, keeping the UTM parameters | Wren with **APPROVAL** | Ads approved |
| 11 | Watch the first 24 hours (section 7) | Claude Code and Wren | No anomalies |

## 4. GET-only checks after deploy (no leads created)

For each of the six `/survey/{kitchen,garage}-{survey,thank-you,not-in-area}` routes and `/survey/privacy`: status 200, `X-Robots-Tag: noindex, nofollow`, HTML contains `/survey/consent.js`, and does **not** contain `googletagmanager`, `connect.facebook.net` or `fonts.googleapis.com`. Also `/survey/consent.js` and `/survey/vendor/work-sans.css` return 200. `GET /api/survey-lead` returns 405 (it must not accept GET). `/kitchen` and `/garage-conversion` still load as before. `tests/survey/hosted-checks.js` holds the privacy and route checks. Run only its GET parts. Its submission parts must not run against Production without approval.

## 5. Consent check on a real phone

1. Open the Kitchen survey in a private tab. The banner shows, both buttons look the same, and the browser network panel shows no Google or Meta request.
2. Tap Reject, reload. No banner, still no Google or Meta request.
3. Clear site data, open again, tap Accept. GTM and the Meta Pixel load. In Meta Events Manager Test Events, PageView arrives.
4. On `/survey/privacy`, change the choice and confirm the status line updates.

## 6. Controlled test submission (APPROVAL, uses real GHL actions)

Use a number the business controls. **Outside Cornwall first** (No): expect the not-in-area page, a GHL contact with the DQ tag, and no opportunity, Sheets row, notification or SMS. A **Cornwall Yes** test fires real sales actions (opportunity, email, Sheets row, SMS to the tester) and needs its own explicit approval. After accepting cookies, a Yes should show exactly one `Lead` in Test Events with the same event id as the submission. Delete test contacts afterwards (Codex).

## 7. After go-live

Watch Vercel runtime logs for `accepted`, `accepted_dq`, `duplicate_done` and any `rejected` or upstream error lines (the logs hold no personal data). Compare GHL contacts and opportunities to the log counts. Expect lower Meta PageView and Google measurement volumes than before, because tracking now only runs for visitors who accept. The published GTM container has no trigger for `wren_survey_lead`, so Google Ads form-fill conversions are not set up for the surveys. That is unchanged and not part of this release.

## 8. Rollback

Target: deployment `dpl_8N23gbjGZcQtxS2YhdcqM7QTn5Yg` (`main` commit `28e92ed`). Owner and details: `docs/SURVEY-RELEASE-APPROVAL.md` section 7.

1. Point Meta ad URLs back to the legacy `/kitchen` and `/garage-conversion` pages (they are untouched).
2. Roll back the Production deployment in Vercel (Deployments, previous deployment, Promote), or revert the merge.
3. The Production variables are harmless if left in place. Remove them if the funnels are retired.

## 9. Known risks carried into Production

- In-memory duplicate protection only. It resets when a function instance restarts, so a retry can very rarely create a second GHL contact action. GHL matches contacts by phone, so it is contact-safe, but SMS and opportunity actions could repeat.
- Public endpoint with real SMS behind it. The rate limit in step 5 reduces abuse risk. Without it, risk is higher.
- A stale DQ tag on a contact who later submits a Cornwall enquiry: Codex to confirm the workflow removes or ignores it.
