# Wren Builders – Kitchen Offer Funnel (isolated, shared-repo)

All files are scoped to /kitchen/. No root-level files. No vercel.json.

/kitchen/
  index.html                  Landing      → /kitchen
  thank-you/index.html        Thank-you    → /kitchen/thank-you  (noindex)
  WREN-KITCHEN-HANDOFF.md     This file

Each page is self-contained (CSS, JS, images, grain texture inlined). No external asset paths.

## Forms (4 on landing: hero, final-cta, cta-popup, exit-popup)
Webhook: window.WREN_WEBHOOK (landing <head>)
  https://services.leadconnectorhq.com/hooks/umsacBjS6we0WPzRhMZz/webhook-trigger/39fc8a16-a6fe-45ef-90b4-74a3f1b1e163
POST application/x-www-form-urlencoded, mode no-cors.
Fields: name, phone, email, address, city, postcode, pain, timing
Hidden: channel=meta, offer=1000-appliance-upgrade, source=<hero|final-cta|cta-popup|exit-popup>, page=<landing URL>, event_id=<random UUID, no PII>
Exit popup sends name + phone + hidden fields only.
Redirect: window.WREN_THANK_YOU || '/kitchen/thank-you' — no query string, no PII.

## Conversion logic (one-time, guarded)
See the root `README.md` for the shared architecture. Session key: `wren_lead_kitchen`. GTM fires on Custom Event `generate_lead`.

## Storage
sessionStorage 'wren_exit_shown' — display-only, limits exit popup to once per session.
sessionStorage 'wren_lead_kitchen' — conversion record { event_id, offer, channel, ts, fired }. No PII.

## Hosting
Directory index routing (/kitchen/ → index.html) works on Vercel/Netlify/GitHub Pages by default. If the repo uses cleanUrls/trailingSlash settings, confirm /kitchen/thank-you resolves to thank-you/index.html.
