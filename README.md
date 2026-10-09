# Wren Builders funnels

Static funnels deployed on Vercel. Each funnel lives in its own folder. There is no root `index.html`.

| Funnel | Landing | Thank-you | Handoff |
|---|---|---|---|
| Kitchen | `/kitchen` | `/kitchen/thank-you` | `kitchen/WREN-KITCHEN-HANDOFF.md` |
| Garage Conversion | `/garage-conversion/` | `/garage-conversion/thank-you/` | `garage-conversion/WREN-GARAGE-HANDOFF.md` |

## Routing (`vercel.json`)
- Garage pages use relative paths (`./support.js`, `assets/`, `Wren Offer 2 Lead Form.dc.html`, `../support.js`). They only resolve with a trailing slash, so `/garage-conversion` and `/garage-conversion/thank-you` redirect (307) to the slash form. Query strings (UTMs, gclid, fbclid) are kept.
- Kitchen pages are self-contained bundles and work with or without the slash.
- Both thank-you routes send `X-Robots-Tag: noindex` on top of the page-level `<meta name="robots" content="noindex">`.

## Tracking
- One Google Tag Manager container, `GTM-KF4RWHHQ`, on all four pages. Head snippet sits straight after `<meta charset>`. Noscript sits straight after `<body>`.
- Kitchen pages are self-unpacking bundles that swap the whole `<html>` element after load. GTM lives in the outer document, so it runs once before the swap and `window.dataLayer` survives it. Do not add GTM inside the bundled template too, or it will load twice.
- No hardcoded GA4, Google Ads or Meta Pixel. Configure those inside GTM.

## Conversions (both funnels, same architecture)
Conversion signal: GTM Custom Event trigger `generate_lead`. Never use a thank-you page-view trigger.

1. On a valid submit (all 4 forms per funnel, exit popup included), the page creates a random `event_id` (UUID, no PII), adds it to the GHL webhook payload, and stores a record in sessionStorage:
   `{ event_id, offer, channel, ts, fired: false }`. Keys: `wren_lead_kitchen`, `wren_lead_garage`. No form answers or contact details are stored.
2. The thank-you page reads the record. It pushes only if `event_id` exists, `offer` matches the funnel, the record is under 30 minutes old and `fired !== true`. It sets `fired: true` and saves the record before pushing:
   `{ event: 'generate_lead', event_id, offer, channel }`
3. Direct visits, refreshes, stale records and other-funnel records push nothing. A new valid submission creates a new `event_id` and fires once.

Use `event_id` as the GA4 / Ads / Meta deduplication ID inside GTM (Data Layer Variable `event_id`).
