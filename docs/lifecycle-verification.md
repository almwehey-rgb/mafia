# Lifecycle verification — 2026-09-12

Scope: local implementation and verification. Neither migration nor Edge/frontend deployment has been applied to production by this task.

## Requirement audit

| Requirement | Implementation and evidence |
| --- | --- |
| Same-room replay, fresh roles/data | `mafia_start_match` transaction resets match data and changes match ID. Lifecycle SQL and integrated Edge tests inspect resets; browser room 7311 completed two games with changed roles and a clean second timeline. |
| Return to lobby and change roster | Authenticated `mafia_return_to_lobby` clears secrets and keeps remaining identities. SQL rollback/isolation checks; integrated games used 4 then 5 seats; browser games used 3 then 4 independently stored player sessions. |
| Recompute roles and validate size | Server validates 2–20 seats and available role slots; detective allocation respects schema limit 8. SQL capacity/roster tests and integrated 20-player start. |
| Reject late admission, protect secrets | Membership trigger and Edge reject active-game joins. Browser late join was rejected without adding a seat. Private state, spectator/controller permissions and admin grants have contract tests. Join feedback regression checks the explanatory message after an expired-seat retry. |
| Temporary disconnect and same-seat return | Authenticated join preserves session/role even in full active rooms. SQL presence and Edge reconnect tests. Browser refresh/resume preserved the player's identity, readiness and role. Missed host heartbeats resulted in observed takeover; this was not a physical-network test. |
| Departure during vote/night | Transaction revokes credentials, clears invalid targets without refunding a detective question, advances discussion and releases trial/final-shot waits. SQL tests exercise each path. Browser vote against departing host was cleared; remaining three players voted and finished. |
| Host departure and empty room | Connected successor receives controller authority; old authority is fenced. SQL checks connected eliminated fallback and cancellation after last human leaves. Browser takeover occurred both after missed heartbeats and deliberate host departure. |
| Duplicate/concurrent start and results | Busy UI guard plus locked/versioned RPCs. Native independent PostgreSQL tests verify single deal, join/start contention, single statistics commit and deadlock-free rejection of stale player writes. |
| Synchronization and cross-match isolation | Atomic room/player/snapshot/statistics commit, generation fences and match-ID local-history reset. Rollback/preimage tests and matching browser results across player sessions. |
| Roles, victory/ties, timers, refresh | Contract suite covers leader ties, discussion lottery/roulette privacy, role powers, final shot, win handling, deadlines, pause/resume and reconnect; real Edge/SQL suite completes night/discussion/vote/victory twice. Browser first match also exercised timed discussion and investigation. |
| Preserve existing work | Lifecycle changes were applied without reverting concurrent artwork/theme/layout/service-worker edits. |

## Findings repaired

- Partial result writes and duplicate statistics: private transition plans commit atomically.
- Room/player lock-order deadlock: statement-level room lock precedes row locks.
- Stale credentials/actions following leave, kick, replacement or rematch: version fences and atomic membership transitions.
- Invalid departed-player targets, stranded discussion/trial/final-shot state: transactional cleanup and recoverable departure follow-up.
- Previous-match local history and snapshot authority leakage: match identity and restoration checks.
- Oversized detective allocation, reused bot names, and unhandled expired-session join retry.

## Verification boundaries

Final run: 85 existing contract/SQL/integration/atomic tests passed together (zero failures). The added join-feedback regression passed separately, giving 86 passing tests. The production-schema lifecycle test was then extended to exercise direct finished-to-reveal replay without visiting the lobby; that updated test passed, preserving seat credentials while resetting deaths, votes, investigations, winner and statistics flags. Four native PostgreSQL concurrency tests passed at the preceding unchanged-migration checkpoint. `node --check dist/game.js` and `git diff --check` passed.

Tests use a schema-only production fixture and the actual Edge handler with a SQL transport adapter. PGlite checks transactions and logic; four native PostgreSQL checks separately exercise independent connections. Browser sessions used distinct localhost origins with one shared disposable backend, not physical phones. Production PostgREST/Deno deployment and real-network behavior remain deployment checks. No unresolved game-rule decision was identified.

Reproduction commands and runtime setup: `tests/README.md`. The historical checkpoints in `lifecycle-work-plan.md` describe earlier states; this audit supersedes their outstanding local implementation gates.
