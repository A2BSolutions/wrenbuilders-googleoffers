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
- Kitchen thank-you pushes `{ event: 'generate_lead', channel: 'meta', offer: '1000-appliance-upgrade' }` to `dataLayer` once per page load. Garage thank-you pushes nothing. Use a page-path trigger on `/garage-conversion/thank-you/` for Garage.
