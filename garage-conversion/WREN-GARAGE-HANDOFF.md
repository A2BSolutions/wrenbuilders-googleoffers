# Handoff: Wren Builders — Offer 2 (Garage Conversion, AC Included)

> Integration note: GTM `GTM-KF4RWHHQ` is now installed on both garage pages, and `vercel.json` redirects the no-slash routes to the slash form so relative paths resolve. See the root `README.md`.

Design-only handoff for a shared multi-funnel repo. Everything lives in its own folder `garage-conversion/`. No root `index.html`, no root assets, no `vercel.json`.

## About the files
HTML design references built in Claude Design (Design Component format). They render as-is in a browser via the bundled `support.js` runtime, but should be reviewed (or recreated in the repo's stack) before production. All styling is inline; fonts load from Google Fonts (Work Sans 300–600).

## Folder structure
```
garage-conversion/
  index.html                        landing page
  Wren Offer 2 Lead Form.dc.html    shared lead form (imported 3× by index.html; must stay a sibling of index.html, filename unchanged)
  support.js                        Design Component runtime (required by all pages)
  assets/
    wren-logo.svg  wren-logo-reversed.svg
    exterior.png  kitchen.png  kitchen-open-plan.webp  bifold.png  bathroom.png  builder.webp
  thank-you/
    index.html                      thank-you page (references ../support.js, ../assets/)
```

## Routes (assumes the folder is served at `/garage-conversion/`)
- Landing: `/garage-conversion`
- Thank you: `/garage-conversion/thank-you`
- Redirect target is hard-coded as `/garage-conversion/thank-you` (overridable via `window.WREN_THANK_YOU`). If the folder is mounted elsewhere, update that string in `index.html` and `Wren Offer 2 Lead Form.dc.html`.

## Webhook
GHL inbound webhook, set as the default in both submit handlers (overridable via `window.WREN_WEBHOOK`):
`https://services.leadconnectorhq.com/hooks/umsacBjS6we0WPzRhMZz/webhook-trigger/aa8407d1-af54-4821-aabc-81c00252c08f`

Sent as `POST`, `application/x-www-form-urlencoded`, `mode: 'no-cors'`, `keepalive: true`, then redirect. `keepalive` must stay — without it the request is cancelled on navigation.

## Forms & payload
Four forms, one webhook. Segment on `offer` + `source`.

| Form | source | Fields |
|---|---|---|
| Hero form | `hero` | full |
| Final CTA form | `final-cta` | full |
| CTA popup | `cta-popup` | full |
| Exit popup (desktop ≥900px, once per session) | `exit-popup` | name, phone only |

Full field names: `name`, `phone`, `email`, `address`, `city`, `postcode`, `pain`, `dream`
Hidden: `channel=meta`, `offer=garage-conversion-ac-included`, `source=<see table>`
Appended on submit: `page` (= landing URL)

`pain` options: We need more living space · I need a proper home office · We want an extra bedroom or guest room · I want a gym, studio or hobby space · The garage is currently wasted space · We need more room but don’t want to move · Other

`dream` options: Home office · Guest bedroom · Extra living room · Home gym · Playroom · Studio or hobby room · Multi-purpose room · Annex-style space · I’m not sure yet, I’d like ideas · Other

Validation (full form, on blur + submit): name required · phone ≥10 digits · email regex · address, city required · UK postcode regex · pain/dream required. Exit popup: name required, phone ≥10 digits.

## Thank-you page
- Clean URL. No query string is passed and the page reads none.
- Generic "Thank you" greeting.
- `<meta name="robots" content="noindex">` present.

## Conversion tracking
None. All design-source conversion events (`generate_lead`, Meta `Lead`, `__wrenOffer2LeadFired`) have been removed. No GTM, GA4, Google Ads or Meta Pixel code is present. Production conversion tracking is to be implemented by Claude Code.

## Storage
- `sessionStorage` key `wren_offer2_exit_shown` (exit popup once per session).
- No `localStorage` in page logic.

## Open items
- Photos are from other Wren projects. Garage conversion photography is still needed.
- `kitchen-open-plan.webp` is 300px wide, so it looks soft in the offer card and gallery.
- Footer F-Gas line needs the installer confirmed before going live.
