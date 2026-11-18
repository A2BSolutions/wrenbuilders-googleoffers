# Kitchen funnel – performance pass (18 Nov 2026)

Base: live files from A2BSolutions/wrenbuilders-googleoffers@main, kitchen/ (read in full, both pages).
Only bundle internals changed. The outer document (GTM-KF4RWHHQ head + noscript, loader, noindex on thank-you) is byte-identical to live.
Form component (manifest 8202e945…), webhook, hidden fields, event_id, wren_lead_kitchen, generate_lead guard, wren_exit_shown and /kitchen/thank-you redirect: untouched.

## Page weight on open (HTML document, GTM excluded)
Landing   1,632,127 B → 479,898 B  (−71%)
Thank-you 1,073,064 B → 344,454 B  (−68%)
Mobile and desktop load the same file (self-unpacking bundle).

## Changes
- Images re-encoded to WebP, same pixel size, same manifest keys:
  hero/final kitchen 1536×1024 381 KB → 82 KB; dining 151 → 14 KB; island 125 → 9 KB; breakfast bar 115 → 9 KB; open-plan 99 → 8 KB; builder 71 → 26 KB; oak 29 → 12 KB.
- Fonts: removed the vietnamese and latin-ext Work Sans subsets (47 KB); the copy only uses latin characters. Latin subset kept for all four weights.
- Removed the unused Google Fonts preconnects (fonts are inlined).
- Landing hero: no longer fades in from invisible; the slide-up stays.

## For the tech team
- The biggest remaining cost is the bundle format: nothing paints until the browser downloads, base64-decodes and swaps the whole page, then runs React. Unbundling into static HTML and separate files (like garage-conversion/) would allow srcset, lazy loading, preload/fetchpriority and caching. It would change file names, so it wasn't done here.
- In this format srcset, lazy loading and hero preload don't help, because every asset is inside the HTML.
