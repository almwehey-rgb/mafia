# Performance improvements — 2026-09-13

- Replaced the displayed 1,581,127-byte logo with a 17,414-byte WebP at 440px (98.9% smaller). Original retained for the Apple touch icon/manifest compatibility.
- Role card backgrounds now use the supplied thumbnail on the home gallery instead of fetching full-size art behind every thumbnail. Personal role cards and the guide retain full artwork.
- Removed unused page content, scripts and styles from the redirect entry point; query strings and fragments still forward to game.html.
- Service worker no longer preloads unused multi-megabyte PNG artwork. Requested artwork uses cache-first; HTML/scripts/styles stay network-first to pick up releases. API and external requests are excluded. Only mafia-prefixed old caches are removed.

Validation:
- tests/performance-browser.mjs: passed against local files through Playwright routing, no live API access. Mobile/desktop rendering, 14 home cards, card flip, no full-size home art requests, no JavaScript errors. 555,467 bytes across 33 local resource requests over the checked flow (not a production timing measurement).
- tests/performance-cache.mjs: passed image cache reuse, script revalidation, offline fallback and API/external/POST exclusion.
- node --check dist/game.js and dist/sw.js passed.

Changes are local; production has not been deployed or benchmarked.

## Second pass — interaction and lobby performance

- Generate room QR codes with the bundled library; cache the last URL/image so repeated lobby renders need neither a remote QR request nor another encoding pass. Load the library before game.js and remove the unused QR-service preconnection.
- Observe only top-level app replacements for lobby fitting. Nested text/timer mutations no longer schedule layout work.
- Remove the duplicate lobby render from the language observer; the language control already renders the active view. Avoid setting the same lang attribute on theme changes.
- Translation walks reject already-localized card subtrees rather than traversing every text node within them.

Verified with local browser routing: QR image decodes, correct join URL supplied to encoder, one QR generation across two lobby renders; one lobby render per language change, none on theme change; zero fit callbacks across five nested text updates. Mobile/desktop role selection and keyboard toggles passed without script errors. Join-feedback and discussion-display tests passed (2/2). No production deployment or live latency benchmark performed.
