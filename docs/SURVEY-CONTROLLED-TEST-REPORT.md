# Controlled Production test report: Kitchen and Garage survey integrations (12 Nov 2026)

Internal. Production `go.wren-builders.online`, Kitchen v2 (v25), Garage v2 (v22). One submission per journey, no retries. Google and Meta requests in the test browser were intercepted and stubbed.

## Test matrix

| Journey | Result | Observed |
|---|---|---|
| A. Kitchen, Cornwall No | **PASS** | Site routed to `/survey/kitchen-not-in-area`. GHL contact created about 3 s after submit by the Kitchen v2 workflow, tags `meta lead`, `offer 1: kitchen + £1k upgrade`, `survey funnel`, `dq - outside cornwall` (tag landed within 2 s). All 4 answers, page URL, UTMs, submission id, timestamp, offer and campaign stored. No opportunity, no conversation or SMS, lead sheet unchanged. No Meta Lead, no `wren_survey_lead` |
| B. Garage, Cornwall No | **PASS** | Same for Garage: `/survey/garage-not-in-area`, contact created by the Garage v2 workflow, tags `meta lead`, `offer 2: garage conversion + free ac upgrade`, `survey funnel`, `dq - outside cornwall`, answers and attribution stored. No opportunity, no SMS, lead sheet unchanged, no Meta Lead |
| C. Kitchen, Cornwall Yes | **BLOCKED** | No approved test phone or email destination. Not submitted |
| D. Garage, Cornwall Yes | **BLOCKED** | Same. Not submitted |

Tracking: Meta Lead for a qualified enquiry and its receipt in Events Manager are **UNKNOWN** (needs test C or D).

## Pre-test state (for comparison)

GHL: 41 existing ZZ test contacts; 53 opportunities (newest test one `ZZ Test Wren Phase2`, 11 Nov). Leads Master Tab: last data row 73. No test conversations for the new run ids.

## Records created (and left in place)

| Record | Detail |
|---|---|
| GHL contact | `5Ir3RB7QhaHAHgBWoYua` ZZ TEST kitchen DQ T1112A, `zz-test-kitchen-dq-t1112a@example.com`, 07700 900881, Exeter |
| GHL contact | `vbeBD1qmrU1ASJ0qHTMv` ZZ TEST garage DQ T1112B, `zz-test-garage-dq-t1112b@example.com`, 07700 900882, Exeter |
| Opportunities | none |
| SMS or conversations | none |
| Lead-sheet rows | none |
| Internal notifications | none observed (info@ inbox not visible to A2B) |

The phone numbers are in the Ofcom drama range reserved for fictional use, so they cannot reach a person. They were used only because the DQ path sends no SMS and the form requires a number. No existing customer was used. Cleanup was not authorised.

## Observations

- GHL contact search and list views lag the write by up to about 30 s. The first search missed a contact that already existed. Inspect with a delay and by recent list. Never resubmit.
- No correction to the integration is needed from these two tests. Nothing in Production was changed.

## Needed to finish

Approved test destination (a phone A2B controls and is authorised to receive Harry's SMS, plus an email) so C and D can run, and so one qualified test can accept cookies and check a real Meta Lead in Events Manager. A Meta Events Manager or Test Events view is needed for receipt.
