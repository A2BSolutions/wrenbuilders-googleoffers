# Survey Privacy Notice: business approval checklist

Status: **DRAFT. Not approved. Do not release to Production.**
Page: `/survey/privacy` (`survey/privacy.html`). Standalone, noindex, no scripts, no tracking. The WordPress policy (https://wren-builders.com/privacy-policy/) is not edited and is linked from the notice.
This is a drafting aid, not legal advice. Nothing has been invented to fill the open items. The notice itself still carries all 12 `[[APPROVAL NEEDED: ...]]` markers. They stay until a real answer replaces them.

## A. What Wren Builders must decide (12 items, 3 groups)

Tick each when the answer is in. The marker number is the order in which it appears in the notice.

### 1. Privacy governance, retention and lawful bases
- [ ] Date of the approved version (marker 1, header)
- [ ] Purpose for keeping outside-Cornwall enquiries (marker 4, section 3)
- [ ] Lawful basis for each use in section 3 (marker 5, section 4). Left blank on purpose
- [ ] Retention period, Cornwall enquiries (marker 8, section 7)
- [ ] Retention period, outside-Cornwall enquiries (marker 9, section 7)
- [ ] Which privacy rights apply to which lawful basis (marker 11, section 9)

### 2. SMS follow-up, cookies and tracking
- [ ] Wording for call and text contact, how people stop texts, how text consent is obtained (marker 3, section 3)
- [ ] How consent to non-essential cookies is obtained, and whether a cookie notice is needed (marker 10, section 8)

### 3. Business identity, contact details and service providers
- [ ] Confirm Wren Builders Ltd is the data controller. Give the ICO number if there is one (marker 2, section 1)
- [ ] Other providers to list: managing agency, text-message provider, team-email provider (marker 6, section 5)
- [ ] Safeguards for providers outside the UK (marker 7, section 6)
- [ ] Contact for privacy requests: email, and a named person or role if wanted (marker 12, section 10)

Also confirm the footer details are right for privacy requests: company number 15580800, Penstraze Business Centre, Penstraze, Truro, Cornwall, TR4 8PN, 01872 613608, info@wren-builders.com. They are copied from the survey footer.

## B. Already supported by system evidence (no decision needed, re-check if the system changes)

| Statement in the notice | Evidence |
|---|---|
| Fields collected: name, mobile, email, address, city, postcode, four answers, campaign data, Facebook click ID, page URL, time | Server payload code and GHL readback |
| Outside-Cornwall enquiries are stored in GHL with tag `DQ - outside Cornwall` | Hosted test on the v2 receivers, 11 Nov |
| Only Cornwall enquiries get team email, lead-sheet row, opportunity and SMS opener | Codex's published v2 workflow state. I cannot read GHL workflows (API 403), so this is Codex's evidence, not mine |
| Meta `Lead` fires only for Cornwall enquiries, with no contact details or answers | `survey/wren-funnel.js`, browser tests |
| Survey service logs hold no names, phones, emails, addresses or answers | Unit tests on log output |
| GTM (Google tags) and the Meta Pixel load on survey pages. The notice page loads neither | Container fetch, browser tests (zero third-party requests on the notice) |
| Some providers process data in the US | Provider locations. The safeguards are open (group 3) |
| The not-in-area page now says the details were kept, links the notice, and gives no retention period | Browser tests, section 6c |

## C. Decisions that genuinely need Wren input, and why they cannot be guessed

- **Lawful basis, purpose, retention, rights.** These are legal choices. Evidence shows what the system does, not what the law allows or what you intend.
- **SMS consent and stop-text route.** The system sends an SMS opener. No consent box exists. Whether that is enough is for your adviser. A checkbox would change the form, so it is not added.
- **Cookie consent.** GTM and the Pixel load with no banner. This notice does not fix that. Weak point: until it is decided, the cookie section cannot be finalised.
- **Controller, ICO number, privacy contact.** Only the business knows these.
- **Other providers and transfer safeguards.** The system shows GHL, Google Sheets, Vercel, Meta and Google. Other processors (agency, SMS, email) are not visible from the code.

## D. Microcopy under the submit button (both surveys)

> We use your details to respond to your enquiry. If your property is in Cornwall, we may call or text you about your project. We also keep enquiries from outside Cornwall, without sales follow-up.
> [Privacy Notice] (new tab, `/survey/privacy`)

Needs approval as final wording. It replaces "We'll only use your details to send your quote. No spam.", which was no longer accurate.

## E. Release gate (unchanged)

1. Replace each marker with approved text (delete the highlight span, keep the sentence).
2. Remove the `data-draft="true"` banner and update the header comment.
3. Run `node tests/survey/privacy-approval.js`. It must print PASS. It currently exits 1 (12 markers and the banner).
4. The gate also fails if the survey config loses `privacy.url`, or if either not-in-area page loses its notice link or retention line.
5. Re-run local suites. After release, run `tests/survey/hosted-checks.js` (GET only).

## F. Files changed

- `survey/privacy.html` (new), `vercel.json` (one rewrite `/survey/privacy`)
- `survey/wren-funnel.js`: `privacy.url` set. `null` hides the survey link.
- `survey/kitchen-survey.html`, `survey/garage-survey.html`: microcopy and link label
- `survey/kitchen-not-in-area.html`, `survey/garage-not-in-area.html`: one paragraph with the notice link. No retention period stated
- `tests/survey/e2e.js`, `tests/survey/hosted-checks.js`, `tests/survey/privacy-approval.js`
