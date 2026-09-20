# Published cards and discussion draw

- Production URL: https://mafia-night-iota.vercel.app/
- Vercel deployment: `dpl_AYGYbd4iNVZtSvdXtHMLG7Hg6EYg` (READY).
- Frontend release: `da1afd793c9039a8`.
- Supabase `mafia-room`: version 49, ACTIVE; retrieved deployed source matches local source after line-ending normalization. Previous source saved at `artifacts/cards-publish-edge-before.ts`.
- All 69 published frontend files match the release manifest. Backend health returns 200.
- Published browser verification: five kids cards selected only in kids mode; fourteen normal cards load at original 1024px width; six-second draw hides the final result until completion; no JavaScript errors.
- Normal WebP artwork is pixel-identical to the original PNG sources. Home thumbnails increased from 192px to 512px. Children's existing original artwork is retained and is not enlarged beyond its natural card width.
- Backend checks: 68 tests passed, including draw timing, pause/resume, resignation, and legacy-election compatibility. Conflicting concurrent legacy requests are retried using the current lifecycle version instead of expecting both to commit simultaneously.
- Verification uses disposable browser state and a read-only health request; no live player rooms were modified by the checks.

Evidence: `artifacts/cards-publication-verified.json`, `artifacts/publish-verified-tests.log`, `artifacts/published-cards-kids.png`, `artifacts/published-cards-normal.png`, `artifacts/published-draw.png`.
