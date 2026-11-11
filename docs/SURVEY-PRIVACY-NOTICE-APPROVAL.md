# Survey Privacy Notice: draft and approval pack

Status: **DRAFT. Not approved. Do not release to Production.**
Page: `/survey/privacy` (file `survey/privacy.html`). Standalone, noindex, no scripts, no tracking. The existing WordPress policy (https://wren-builders.com/privacy-policy/) is not edited and is linked from the notice.
This is a drafting aid, not legal advice. Items marked below are decisions for Wren Builders or its adviser. Nothing has been invented to fill them.

## 1. Microcopy under the submit button (both surveys)

Replaces: "We'll only use your details to send your quote. No spam." (no longer accurate).

> We use your details to respond to your enquiry. If your property is in Cornwall, we may call or text you about your project. We also keep enquiries from outside Cornwall, without sales follow-up.
> [Privacy Notice] (new tab, `/survey/privacy`)

Needs approval as final wording. If the adviser wants explicit consent or an opt-out for texts, the wording and possibly a checkbox change. That would be a design and logic change and is not made here.

## 2. Open items in the notice (12 markers) and who decides

| # | Section | Decision needed |
|---|---|---|
| 1 | Header | Date of the approved version |
| 2 | 1. Who we are | Confirm Wren Builders Ltd is the data controller. ICO registration number, if any |
| 3 | 3. Cornwall | Wording for call and text contact. How people stop texts. How consent for texts is obtained |
| 4 | 3. Outside Cornwall | The purpose for keeping outside-Cornwall enquiries |
| 5 | 4. Lawful basis | The lawful basis for each use. Deliberately left blank |
| 6 | 5. Sharing | Any other providers (agency, text-message provider, email provider for team notifications) |
| 7 | 6. Transfers | Safeguards for providers outside the UK |
| 8 | 7. Retention | Retention period for Cornwall enquiries |
| 9 | 7. Retention | Retention period for outside-Cornwall enquiries |
| 10 | 8. Cookies | How consent to non-essential cookies is obtained, and whether a cookie notice is needed |
| 11 | 9. Rights | Which rights apply to which lawful basis |
| 12 | 10. Contact | The contact for privacy requests (email, named person or role) |

The business details used (company number 15580800, Penstraze Business Centre, Penstraze, Truro, Cornwall, TR4 8PN, 01872 613608, info@wren-builders.com) are copied from the footer already published on the survey pages. Confirm they are the right ones for privacy requests.

## 3. Statements in the notice that describe how the system works (verified, re-check if the system changes)

- Fields collected: name, mobile, email, street address, city, postcode, the four survey answers, UTMs, Facebook click ID, page URL and time. (Server payload and GHL readback.)
- Every valid enquiry reaches GHL, including outside Cornwall, with a DQ tag. (Hosted test against the v2 receivers, 11 Nov.)
- Cornwall enquiries get a team notification, a lead-sheet row, an opportunity and an SMS opener. Outside-Cornwall enquiries do not. (Codex's published v2 workflow state. Not verifiable by me from GHL.)
- Meta gets a `Lead` event only for qualified enquiries, carrying the offer and campaign names, not contact details or answers. (`survey/wren-funnel.js`.)
- The survey service logs hold no names, phones, emails, addresses or answers. (Unit tests on the log output.)
- GTM loads Google tags (GA4 and Ads are in the published container) and the Meta Pixel loads on the survey pages. The notice page loads neither. (Container fetch and browser tests.)
- Some providers process data in the United States. (GHL, Vercel function region and Meta and Google are US-based; safeguards are an open item.)

## 4. Not changed, but recommended for the business to decide

- The not-in-area page says only that the project cannot be taken on. It does not say the details were kept. A one-line pointer to the notice would close that gap. Not added because it was out of scope.
- The survey pages load GTM and the Meta Pixel with no consent mechanism. This notice does not fix that.
- No consent checkbox exists for the SMS opener.

## 5. How to finalise (release gate)

1. Replace each `[[APPROVAL NEEDED: ...]]` with approved text (delete the highlight span, keep the sentence).
2. Remove the `data-draft="true"` banner and update the header comment.
3. Run `node tests/survey/privacy-approval.js`. It must print PASS. It currently exits 1 (12 markers and the draft banner).
4. Re-run the local suites. After release, run `tests/survey/hosted-checks.js` (GET only).

## 6. Files changed for this draft

- `survey/privacy.html` (new)
- `vercel.json`: one added rewrite `/survey/privacy` to `/survey/privacy.html`. The existing `/survey/(.*)` rule already sends `noindex, nofollow`.
- `survey/wren-funnel.js`: `privacy.url` set to `/survey/privacy` (was `null`). Set it back to `null` to hide the link.
- `survey/kitchen-survey.html`, `survey/garage-survey.html`: microcopy text and the link label ("Privacy Notice"). No logic, tracking, field or route change.
- `tests/survey/e2e.js`, `tests/survey/hosted-checks.js`, `tests/survey/privacy-approval.js` (new).
