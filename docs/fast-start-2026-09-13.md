# Fast-start release

Live: https://mafia-night-iota.vercel.app/
Deployment: dpl_E6BSiH62degJtnK87BbBEPG2Se7f (READY).

Changes: pre-rendered login reused without discarding typed input; root serves game directly; ordered styles consolidated into app-v64.css; gallery cards populate on intersection; QR and admin tools load on demand with retryable, shared script promises. Polling and backend game rules are unchanged.

Build: node scripts/build-fast-start.mjs (also npm run build). Edit scripts/game-template.html for page structure; dist/game.html and dist/index.html are generated. Original CSS files remain the ordered style sources. The deployment preparation script builds before staging.

Median of three cold-cache mobile lab runs, 4 Mbps, 80 ms latency, CPU 4x:
- Main content (LCP): 1724 -> 1032 ms.
- Load event: 1905.2 -> 1319.3 ms.
- Bytes: 326149 -> 121580.
- Resource entries: 34 -> 10.
- First paint (FCP): 600 -> 1032 ms; the earlier header-only paint is later with the consolidated stylesheet, while main-content paint is earlier.

The old root redirected to game.html, whose navigation timings excluded the preceding redirect; new root paints directly. Same machine/browser/network emulation, service workers blocked in both sets. Lab results do not measure real-user INP, multiplayer synchronization, or API response latency. No login/game mutation was used for the production benchmark.

Validation: fast-start browser test (login visible while game.js deliberately withheld, typed input retained, buttons enabled on initialization, lazy QR/admin tools, join link and return to login); performance browser; selection browser; role-reader browser; mobile/tablet/desktop layout browser; targeted join/discussion tests; cache tests. All passed. Live runs had no page errors/HTTP failures, and all 56 published files matched release hashes.

Raw final measurements: artifacts/live-fast-final.json.
