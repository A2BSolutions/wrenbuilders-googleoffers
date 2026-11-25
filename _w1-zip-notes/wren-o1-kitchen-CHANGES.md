# 08 – Wren O1 Kitchen – speed pass (2026-11-23)

Base: A2BSolutions/wrenbuilders-googleoffers main, kitchen/ (byte-for-byte match confirmed before editing).
Format kept as is: self-unpacking bundle. Only the bundled page template inside kitchen/index.html was edited. The outer document (GTM-KF4RWHHQ head + noscript, loader) and every manifest asset are byte-identical, including the "Wren Lead Form" component (8202e945…).

## Files
| File | Status | Old size | New size | What changed |
|---|---|---|---|---|
| kitchen/index.html | changed | 479,960 B | 481,038 B | Hero entrance has no delay and starts before first paint; width/height on every image; loading="lazy" on below-fold images |

No files added or removed. kitchen/thank-you/, vercel.json, survey/ and garage-conversion/ untouched.

## Brief items
1. First paint – headline, offer line, offer badge and form were already visible (no opacity:0 since the 18 Nov pass). Removed the remaining stagger delay (80–500 ms), and the slide now runs from mount instead of a 60 ms timer, so there's no jump after first paint. Transform-only, 16 px, 420 ms, still off with reduced motion.
2. Phone hero image – SKIPPED. In the bundle, every image is packed into the one HTML file and downloaded by every visitor, so a separate 800 px mobile file would add bytes on phones, not save them. Preload, imagesrcset/imagesizes and fetchpriority have no effect for the same reason (nothing is fetched separately). The hero stays one 1536×1024 WebP (82 KB), now with width/height and decoding="sync".
3. Other images – already WebP (18 Nov). Added width/height to all 12 img tags and loading="lazy" + decoding="async" to the 9 below-fold ones. Logos are SVG. Not resized: kitchen-thumb (338×253), open-plan (300×177), dining and island (338×253) are already smaller than their display size; only bigger source photos would sharpen them.
4. Kitchen only – confirmed.
5. Text-led mobile hero – built as a preview only (not in this zip). At 390 px the form starts at 432 px down vs 929 px now, and the submit button sits at 1231 px vs 1729 px. The hero photo is hidden on phones and stays in the offer badge. Needs creative approval.

## Visual changes
- Hero items slide up together without the staggered timing. Otherwise none.

## Not changed
Copy, offer, prices, form fields/labels/order/validation, hidden fields (channel, offer, source, page, event_id), webhook, wren_lead_kitchen, wren_exit_shown, generate_lead guard, /kitchen/thank-you redirect, GTM + noscript, vercel.json, paths.

## Why mobile LCP is likely still above 2.5 s
Most of the cost is the format. Phones download about 480 KB of HTML, decode every asset from base64, swap the whole document, then start React before anything paints. Edits that work inside the bundle can't remove that. Reaching the target needs the kitchen pages unbundled into static HTML with separate files (as garage-conversion/ is), which changes file names and needs sign-off. I haven't measured this pass; run the speed check after it's live.
