# Survey campaign copy: unapproved claims and conservative replacements

Status: **PROPOSED. Not applied to any page.** Applying needs Wren's sign-off on each claim, then a small edit and a re-run of the pixel checks. Pages today still carry the original claims.

Rule used: keep a claim only if Wren can prove it and keep to it. Otherwise use the plain version. Weak point: the deadline, scarcity and response-time lines below are the kind of claim regulators and ad platforms look at first.

## Claims found, and the plain replacement

| # | Where | Current text | Risk | Conservative replacement |
|---|---|---|---|---|
| 1 | Garage survey hero | "Free AC unit included when you book this month, limited to 3 homeowners." | Deadline and scarcity. Unproven | "Ask us about the free AC unit offer." Or remove |
| 2 | Garage survey, Cornwall step | "We're only taking on 3 garage conversions this month, so places are limited." | Scarcity | "We only work with homeowners in Cornwall." (true, matches the question) |
| 3 | Garage thank-you | "Your free AC unit is reserved." | Promise made to every lead | "We'll confirm the free AC unit offer when we speak." |
| 4 | Garage thank-you | "Limited to 3 homeowners this month." | Scarcity | Remove |
| 5 | Kitchen survey hero | "we'll be in touch with your quote, plus your £1,000 free appliance upgrade." | Unconditional value claim | "we'll be in touch about your quote and the £1,000 appliance upgrade offer." (needs offer terms approved) |
| 6 | Kitchen thank-you | "Your £1,000 free appliance upgrade is reserved." | Promise to every lead | "We'll go through the £1,000 appliance upgrade offer when we speak." |
| 7 | Kitchen thank-you | "Book this month to secure your upgrade." | Deadline | Remove, or state the real end date if one exists |
| 8 | Kitchen survey, timeframe step | "Book soon to get fitted before Christmas." | Urgency, implies a fitting date | "Tell us your timing and we'll plan around it." |
| 9 | Both thank-you pages | "reach out within a few hours" (twice) | Response-time promise | "A member of the team will be in touch soon." Or a time only if Wren commits to it |
| 10 | Both thank-you pages | "A clear, fixed quote with no hidden costs." | Pricing promise | Keep only if true for every job. Otherwise "A written quote after your free home visit." |
| 11 | Both surveys | "Get my free quote", "free quote in 60 seconds" | "In 60 seconds" is the form time, not the quote time | "Get your free quote request in 60 seconds" or "Answer 5 quick questions" |

Also check: "Free home visit" and the testimonial "100% would come back" (a customer quote, needs permission and a source).

## Needs from Wren
- Is the AC unit offer real, what are its terms, and does it have an end date or a cap?
- Same for the £1,000 appliance upgrade.
- What response time can the team actually meet?
- Is every quote fixed price?

## Claude Code can do once decided
Edit the strings in the four pages, run the unit, browser and pixel checks, and update the expected differences. No logic change. Offer names in tracking (`free-ac-unit`, `1000-appliance-upgrade`) stay as they are, so Meta data is unaffected.
