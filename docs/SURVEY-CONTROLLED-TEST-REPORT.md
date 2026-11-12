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


---

# Addendum: qualified (Cornwall Yes) tests C and D, 12 Nov 2026

Destination supplied and confirmed by A2B: +44 7427 912624 and gabriello@a2bmedia.ie. Names "A2B Kitchen Test" and "A2B Garage Test". Both used the same contact, because GHL matches on phone and email, and that contact already existed (A2B, created 8 Oct, no phone, no tags). One submission per journey, no retries.

## Matrix

| Journey | Result | Observed |
|---|---|---|
| C. Kitchen, Cornwall Yes (cookies accepted) | **PASS** | Contact updated, tags `meta lead`, `offer 1: kitchen + £1k upgrade`, `survey funnel`, **no `dq` tag**, no low-priority tag. Opportunity "A2B Kitchen Test" created (Marketing Pipeline, New Lead). Leads Master row 74. Harry's SMS **delivered** with "Reply STOP to unsubscribe". Browser pushed exactly one `wren_survey_lead` |
| D. Garage, Cornwall Yes (cookies rejected) | **PARTIAL** | Contact updated with the Garage answers and tag `offer 2: garage conversion + free ac upgrade`, **no `dq` tag**. Leads Master row 75. Harry's Garage SMS **delivered**. **No opportunity created** (total stayed at 54; the contact already held the open Kitchen test opportunity). No Google or Meta request, no Lead |

## Meta
Lead receipt: **UNKNOWN / not received.** Pixel last fired 11 Nov 15:49 UTC, zero Lead events before and after. The headless test browser loaded the Pixel script but sent no beacon. Needs a manual check in a normal browser and Events Manager.

## Records created or changed (left in place)
- GHL contact `ukEHK10uEq78cg1bo36R` (pre-existing A2B contact) now named A2B Garage Test, phone +447427912624, Truro address, 4 tags, Garage and Kitchen survey fields
- Opportunity `mxSWwRYGpiBQq22XApWD` "A2B Kitchen Test", open, New Lead
- 2 automated SMS to +447427912624, both delivered
- 2 Leads Master rows (74, 75)
- Internal notification emails: expected 2 to Wren's team, not observable by A2B. Harry's team may want to be told to ignore them
- Earlier DQ test contacts remain

## Findings (no Production change made)
1. **Garage opportunity not created** for a contact that already has an open opportunity. Probably a duplicate-opportunity rule plus the shared test contact, not a defect, but unproven. Also a real-world edge case: a person who sends both a Kitchen and a Garage enquiry may get only one opportunity. Codex to confirm the intended rule.
2. **STOP footer:** present on the Kitchen SMS, absent on the second (Garage) SMS in the same conversation. Probably added to first messages only. Confirm on a fresh contact.
3. **Kitchen low-priority** ("Just looking for now") not exercised.
4. **Meta Lead receipt** unverified.
