# Meta cutover plan: Kitchen and Garage surveys (PREPARED, NOT EXECUTED)

Meta ad destinations are unchanged. Do not switch any URL until every precondition below is met.

## 1. Preconditions (all required)

| # | Precondition | Owner | State 12 Nov |
|---|---|---|---|
| 1 | Production intake active and non-submitting checks pass | Claude Code | See `docs/SURVEY-HANDOFF.md` section 28 |
| 2 | **Controlled live test passes.** 12 Nov: outside-Cornwall tests (Kitchen, Garage) PASSED, see `docs/SURVEY-CONTROLLED-TEST-REPORT.md`. Cornwall Yes tests BLOCKED for want of an approved test phone. Remaining requirement: (separate approval of the test destinations): opportunity created, Leads Master row, internal notification, Harry's SMS delivered, Meta Events Manager receives one `Lead` with the submission id. An outside-Cornwall test shows the DQ tag and none of those actions | A2B and Codex | Not run. Needs approved test phone and email |
| 3 | Codex confirms Kitchen v25 and Garage v22 are still published | Codex | Relayed 12 Nov |
| 4 | The 4 pending items are resolved, or Wren accepts them in writing as open risks: provider list complete, privacy mailbox monitored, UK transfer safeguards, ICO fee | Wren | Pending |
| 5 | Live ad text read in Ads Manager and no expired date found (register item `ad_text_dates_checked`) | A2B | Pending |
| 6 | Vercel firewall rate limit on `POST /api/survey-lead` (about 10 per minute per IP). Real SMS now sits behind a public endpoint | A2B, needs approval | Strongly recommended |
| 7 | Written confirmation that the client's launch approval stands (it was relayed, not signed) | A2B | Recommended |

## 2. What is live in Meta today

Read-only check, 11 Nov: the Wren account has 7 ACTIVE Garage ads in the campaign "A2B | Garage Conversion + Free AC | Conversions | Leads | IF". No Kitchen ads were active. The ads are post-backed (their link lives in the Page post), and the API does not return ad text or link.

## 3. The change

Replace only the path. Keep every UTM parameter. Meta adds `fbclid` itself.

| Today | After |
|---|---|
| `https://go.wren-builders.online/garage-conversion/` | `https://go.wren-builders.online/survey/garage-survey` |
| `https://go.wren-builders.online/kitchen/` | `https://go.wren-builders.online/survey/kitchen-survey` |

Recommended method: create duplicate ads with the new link and run them beside the old ones for a short time at a low budget, then pause the old ones once leads arrive correctly. Post-backed ads may need the link edited in Ads Manager or new ads built from the post, so A2B confirms the method on the first ad. Editing a destination sends the ad back through Meta review.

## 4. What to expect

- The survey fires the Meta `Lead` event only after a visitor accepts cookies, and only for Cornwall enquiries. A campaign optimised for Leads will see fewer Lead signals than the legacy pages and may re-enter learning. Google Ads form-fill conversions are not set up for the surveys (no GTM trigger for `wren_survey_lead`).
- Outside-Cornwall visitors are stored in GHL with the DQ tag and trigger no sales action or Lead.

## 5. First 24 hours

Compare Vercel logs (`accepted`, `accepted_dq`, `duplicate_done`, no `rejected` spikes) with GHL contacts and opportunities, Leads Master rows and Meta Events Manager.

## 6. Rollback

1. Point the ad links back to `/garage-conversion/` and `/kitchen/` (untouched and byte-identical).
2. If the survey itself misbehaves, remove the two Production webhook variables and redeploy. `/api/survey-lead` then answers 503 and sends nothing. Or promote the previous Production deployment in Vercel.
3. Leave the `/review/*` pages in place.
