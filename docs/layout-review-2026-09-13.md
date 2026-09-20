# Layout review — 2026-09-13

Reviewed 32 rendered views at 320, 390, 768 and 1280 CSS pixels using isolated browser fixtures. No live game or production API was modified. All 128 renders passed horizontal overflow checks and produced no page errors.

Coverage: login, host home, player/spectator entry, replacement/recovery, roles guide, training, profile, leaderboard, all three setup steps, room/roster, host and player reveal/night/day/trial/verdict/vote/paused/finished states, and will dialog. Discussion fixtures include speaking order and opening draw. Visual screenshots are in artifacts/audit-*.png.

Fixes: selection/count badges no longer overlap in RTL; selected cards retain clear contrast in the light theme; in-game role cards are compact while the initial reveal remains large; long names and statistics wrap safely; small-screen discussion and draw panels use less nested padding; player controls have bottom scroll clearance and safe-area spacing.

Additional validation: light-theme LTR selection, click/keyboard toggles and locked required roles passed. Existing role-reader browser regression passed for flip state, private team display and all public roles. Targeted 320/390 discussion checks passed after the final spacing change.

Limits: these are rendered fixture and interaction checks, not a new end-to-end backend or multiplayer audit. English card illustrations retain the original Arabic artwork.
