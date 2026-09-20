# Lifecycle implementation and verification

## Scope still in progress

Implement repeated games in one room; a post-game lobby with membership changes; server-side capacity and role validation; safe active-game admission/spectating; deliberate departure distinct from transient disconnection; authenticated seat recovery; departure cleanup during votes/night actions; host succession and empty-room behavior; concurrency-safe start/restart; privacy and synchronization; complete two-game verification with changed membership.

## Evidence and completed work

- Baseline: 58 simulated tests passed; deployed bot game reached round 2 and was ended. This is not a multi-device or roulette visual verification.
- Fixed join/reconnect ordering: existing authenticated seats can reconnect in active/full rooms, retaining name, role, action, token and seat count. New admissions remain lobby-only and capacity-limited. Wrong tokens fail.
- Added regression coverage across lobby/night/vote/finished and full rooms.
- Preserved the pre-existing Windows newline compatibility fix in tests.

## Outstanding design and implementation

- Start currently accepts lobby/finished and updates multiple tables independently. Needs a database transaction shared with membership mutations, expected game generation/idempotency, and a real concurrency test. A process-local mutex or UI-only lock is insufficient.
- No return-to-lobby/leave action exists. Introduce explicit membership lifecycle without letting departed identities regain active authority. Clear per-game secrets, messages, actions, timers, results and replacement grants between matches.
- Host authority currently uses original host token or living delegated player; transferHost does not revoke original authority. Define owner oversight separately from active controller and implement connected-player succession and grace period for transient loss.
- Reconnect must preserve seats; departures must invalidate pending votes/actions/discussion/last-shot dependencies and reevaluate victory without inappropriate role death effects.
- UI needs return-to-lobby, deliberate leave, reconnect/wait states and safe repeated-click behavior.
- Current migration files lack the initial core-table schema; standalone clean database verification requires recovering or reconstructing and validating that schema.
- Full integration tests: game one -> lobby -> join/leave -> game two; concurrent start/join/leave; host departure/disconnect/recovery; last participant departure; active join rejection/spectator privacy; stale requests from previous game.
- No lifecycle changes have been deployed.

## Current implementation checkpoint

- Reconnect regression and the baseline suite pass (59 tests).
- Added service-only `mafia_return_to_lobby` RPC migration, with room-row lock, authority recheck and expected lifecycle version. Clears roles, role state, choices, investigation results, wills, replacement grants, messages, reports, snapshots, clocks, victory and runtime settings; retains identity and setup preferences.
- Added Edge action and finished-screen lobby button, plus local repeated-click guard shared with start.
- New migration is NOT applied or integration-tested yet. Existing 59 tests do not exercise this SQL. Need real PostgreSQL/compatible isolated test database, plus failure/rollback, stale-version and concurrent callers before accepting this checkpoint.
- Start/join/leave still need to share the transactional lifecycle protocol; row locking in the new RPC alone does not make the overall lifecycle concurrency-safe.

## PostgreSQL verification checkpoint

- Downloaded checksum-verified PGlite 0.5.8 from npm into `../.test-runtime/package` (test runtime only, outside source checkout). Run `node --test --test-isolation=none tests/lifecycle-postgres.test.mjs` from this checkout. Runtime packaging for other machines remains to be made reproducible.
- Three isolated PostgreSQL tests pass: reset authentication/version/secret cleanup/room isolation; rollback on injected failure and EXECUTE grants; atomic start, stale generation rejection and changed-roster rejection, followed by a second start with 3 rather than 2 seats and a different role for the retained player.
- Added `mafia_start_match` SQL function. It is not yet wired into Edge `start`, and the new SQL migration remains unapplied to production.
- These tests exercise the actual PL/pgSQL, but PGlite's single connection does not prove independent concurrent transactions. Add a real multi-connection concurrency gate before claiming complete concurrency verification.
- Next: wire Edge start/client generation; serialize membership changes with room transitions; implement deliberate leave and controller succession; then end-to-end lifecycle tests. Current browser-local suite has 60 passing tests.

## Start integration checkpoint

- Edge start now calls `mafia_start_match`, requires the observed lifecycleVersion, and rejects fractional/out-of-range role counts. Client start submits that version. Previous multi-request player/room reset is removed.
- Original lobby admin grants survive initial dealing, preserving established behavior; direct rematch and return-to-lobby revoke them.
- Added a room-locking membership trigger for INSERT/DELETE, enforcing lobby-only changes, maximum 20 and duplicate-name checks at the database boundary. Cascading room deletion remains allowed when the parent is gone. Edge maps known trigger rejections to conflict responses.
- 61 simulated/contract tests and 4 actual PostgreSQL tests pass. Tests cover duplicate start at the handler, generation checks, blocked active-game inserts/deletes, full-room capacity and duplicate names. Real independent database connections are still needed for lock/deadlock contention verification.
- Preserved unrelated untracked `dist/assets/` and `docs/detective-card-prompt.txt` discovered this turn.
- Next implement explicit leave (soft during play, seat removal in lobby), cleanup of actions/votes, controller succession, disconnect grace, and stale in-flight gameplay fencing; then integrate two complete gameplay cycles with changed roster.

## Departure checkpoint

- Added transactional explicit leave RPC, Edge handler and confirmed leave button. Deliberate departure invalidates the player session, marks left_at, clears votes/actions, removes speaker from discussion, clears seat replacement grants, advances a departed accused's trial, and releases a departed sniper's pending shot. Edge then reevaluates Mafia succession and victory.
- A departing controller rotates the old host token and nominates a connected living human; the last human's departure cancels the match. Return-to-lobby/start remove vacated seats rather than reviving them.
- 61 contract/simulation tests and 6 isolated PostgreSQL tests passed before the final living-successor eligibility restriction (needs next verification). SQL tests cover departure during vote, revoked seat auth, host handoff, last human cancellation, and active-speaker removal.
- Still incomplete: no-connected-living-successor policy and grace-period takeover, lost leave response idempotency, stale in-flight mutations, role-action expenditure on removed targets, pending-shot target departure, and full client synchronization. Departure during night/trial/pending-shot needs additional actual SQL tests. Migration remains local and unapplied.
- The UI language-map change for detective_only_night and unrelated artwork were present when this turn started; preserved.

## Presence and retry checkpoint

- Added service-only leave receipts keyed by room, generation and SHA-256 of the authenticated credential tuple, so a lost leave response can be retried without restoring session authority or replaying side effects. Wrong credentials still fail. Receipts contain no raw credentials.
- Added room-locked presence RPC and wired state polling to it: updates caller heartbeat; allows 45 seconds for original/delegated controller reconnection; selects a connected living human afterward and rotates the old controller token. Returning player keeps the same role and seat.
- Added actual SQL regression for short disconnect, takeover after grace, rejected old host token and preserved returning-player role. Seven PostgreSQL tests and 61 simulated/contract tests pass (68 total).
- Client discards stale controller UI authority, treats revoked sessions distinctly from network reconnection, and exposes deliberate leave in the player lobby.
- Still required: independent multi-connection contention test; stale in-flight gameplay fencing; robust pending-shot target/role-spending cleanup on departure; no living successor behavior; integrated real database Edge/client two-game flows and browser verification. All new SQL remains unapplied to production.

## Night departure and controller fallback

- Detective target departure now replaces the already spent selection with a non-player sentinel, preventing a free extra question and avoiding secret disclosure. Potion targets use colon-aware cleanup. Committed sniper target/shooter departure spends the shot and releases its saved next phase; trial target departure advances to the next night.
- Added lifecycle generation checks at the Edge request boundary for gameplay mutations; the browser attaches the currently observed generation. This rejects late-arriving previous-match requests but is NOT yet a substitute for fencing writes from an already-running request.
- Fallback control prefers connected living players, then permits an eliminated connected player to manage the room without reviving or enabling their voting/role powers. Secret adminState remains original-host-only. The frontend shows a controller notice/button.
- Added tests for these SQL paths and stale actions/spectator-control permission boundaries. The combined run completed successfully: 62 simulated/contract tests and 10 PostgreSQL tests (72 total).
- Unrelated theme/card edits and concurrent source commits were observed during this turn and preserved; re-read git status before continuing.

## Per-write generation fencing

- Edge now scopes the Supabase client to each request using AsyncLocalStorage, forwarding the observed room/generation to PostgREST. No cross-request mutable client/header state. State/spectator heartbeats omit generation so a client can refresh after a match transition.
- SQL generation-fence triggers lock/check the parent room before writes to rooms, players, messages, reports and snapshots. Actual PostgreSQL test proves that delayed old-generation role, phase, message and delete writes fail after a lobby reset while current-generation writes succeed.
- Query wrapper propagates STALE_GAME errors even from legacy queries whose result.error was ignored. Added a regression for that abort behavior.
- References checked: https://docs.deno.com/api/node/async_hooks/ and https://docs.postgrest.org/en/stable/references/transactions.html .
- Combined suite passed before the final wrapper-specific test addition (62 contract + 11 SQL). The contract suite then passed with the extra test (63 contract; total 74).
- Remaining integrity work: membership departure/controller change should advance a structural revision so in-flight same-match actor actions cannot run after revocation; make post-leave follow-ups retry-safe. Partial multi-query phase resolution still needs atomicity/recovery analysis, and real multi-connection contention verification remains outstanding. Finish full DB-backed Edge/browser two-match test.

## Production schema compatibility checkpoint

- Departure and presence takeover now advance lifecycle_version; a new actual SQL regression confirms old same-game writes fail after both transitions. The combined suite passed 75 tests.
- Added a schema-only production snapshot under tests/fixtures, including all table constraints and the existing phase-clock trigger, with no production rows or credentials. An additional isolated test successfully applies the migration and runs start, finished-to-lobby reset, and second start against that schema. Total verified tests: 76 (75 combined plus the new targeted test).
- This confirms schema compatibility, not full gameplay through the Edge API/browser, nor independent multi-connection concurrency. Production migration remains unapplied. Full two-game browser flow and partial phase-resolution atomicity are still outstanding.

## Integrated Edge and browser verification

- Added tests/helpers/sql-client.mjs, a transport adapter executing each actual Edge query/RPC against isolated PostgreSQL with request headers and a per-query transaction. It preserves the multi-query handler boundary and does not claim network or multi-connection equivalence.
- tests/lifecycle-edge-sql.test.mjs runs real login/create/join/start, private state, acknowledgements, night action/result, discussion, voting and victory twice (4 then 5 players). It checks reset secrets/statistics, blocked mid-game admission, authenticated reconnect, departure while targeted by a vote, controller timeout takeover and deliberate controller leave. A 20-seat start also verifies the detective cap.
- Fixed detective allocation to respect the production constraint of at most 8 detectives; previously a large requested count could fail at the database despite fitting the roster.
- Added disposable tests/browser-server.mjs (random localhost port, fake PIN 12345678, no production API calls). Browser verification completed matches in room 3248 with 8 then 7 bots, producing Mafia then village victories. Reload/resume restored the finished room. Console error/warning log was empty.
- Browser verification found a lobby event leaking into the next local match timeline. Starting any successful match now clears local history; lobby events are not recorded. A third completed browser match verified a clean timeline and no console warnings/errors.
- Still outstanding: actual independent PostgreSQL connection contention tests; atomic/recoverable multi-query night/vote resolution; remaining actor revocation paths and remote-client history synchronization audit; reproducible test-runtime installation. This browser test used bots and does not substitute for multi-device human synchronization testing. Migration remains unapplied to production.

## Atomic transition computation and commit

- Added a request-local TransitionPlan in the Edge handler. resolveNight, resolveVote, beginNight, startVote, advanceVerdict, lastShot, expelPlayer, endGame and transferHost now compute on copied room/player state. Reads inside the operation see its own planned writes; unauthorized/failed requests discard the plan.
- New migration 202609120002_atomic_transitions.sql adds service-only mafia_commit_transition. It locks/checks typed room and player preimages (ignoring heartbeat timestamps), saves players/room/snapshots/audits, increments profile/season statistics additively, and advances lifecycle_version in one transaction. Competing stale calculations fail without partial writes. Room/player timestamp normalization uses jsonb_populate_record so ISO/Postgres timestamp formats compare correctly.
- Deliberate departure leaves a durable departure_pending marker. Its follow-up uses the same atomic plan. If that follow-up fails, an authenticated state poll retries Mafia promotion/victory and clears the marker atomically; leave receipts still cannot replay statistics.
- Four new actual-DB tests cover injected night-phase failure rollback; injected statistics failure rollback; two competing Edge resolutions producing one winner/statistics update; recovery after a committed departure; changed vote/host/session preimage rejection; heartbeat tolerance; and denied authenticated-role RPC execution. The concurrent Edge test uses PGlite's serialized connection and is NOT independent multi-connection lock verification.
- Capped expulsion cleanup for detective targets with SKIP so a spent question is not refunded. Manual controller assignment excludes departed players and sets spectator-control eligibility for eliminated successors. Frontend stale-state errors now ask the host to wait for refresh and retry.
- Verification: all 80 existing/new tests passed together before the final preimage test was added. Then all 68 contract/atomic/integrated tests passed with that added test (63 contract + 4 atomic + 1 integrated); the 13 lifecycle SQL tests were unchanged since their passing run, for 81 verified tests total. The final frontend alert wording edit has not been re-run in the browser.
- Remaining: independent PostgreSQL connection/deadlock contention testing; repeat browser/multiple-human synchronization against the new atomic path; audit restoreSnapshot/kick/replacement and remote host timeline behavior; reproducible test runtime. The previous browser evidence predates this atomic implementation. Both migrations remain unapplied to production. No postgres/psql/initdb/docker/npm executable was found on PATH in the latest check.
- Other tasks changed game.html, screen-fit.js, sw.js and theme files during this turn; those edits were preserved.

## Snapshot and native concurrency checkpoint

- restoreSnapshot now stages and atomically commits restoration. It rejects replaced/departed/changed seat lists and completed/statistically recorded games; it preserves current admin/controller permissions rather than restoring old grants. An actual database regression verifies rollback on injected restore failure, retained current admin access, restored player state, and denied replacement-seat/completed-game restoration.
- Added package.json/package-lock.json with pinned PGlite 0.5.8 and integrity, normal package imports, node_modules ignore and tests/README.md. The existing verified archive was installed into node_modules because npm is absent on this host. All 82 Node tests passed together using the normal dependency path. npm ci itself has not been executed on this host.
- Downloaded official EDB PostgreSQL 17.11-3 binary ZIP (file 1260491), SHA-256 4b8db0930c38f6ef845db919551dedda3b6b845aeb0927b3d79a6e8e9e4537cf, into ignored .test-postgres. Initialized a SCRAM-authenticated disposable cluster; no service installation. Server bound only to 127.0.0.1:55439 and was stopped after tests. Runtime initialization and pg_ctl required sandbox escalation due Windows restricted-token behavior.
- Added tests/postgres-concurrency.mjs. THREE native PostgreSQL checks PASS using independent psql processes and a verified pg_stat_activity lock barrier: one deal from duplicate starts; safe roster for concurrent join/start; exactly one victory/statistics commit from competing atomic plans. Each run creates/drops its own random test database. The test cluster remains stopped; binaries/data remain ignored for reuse.
- Remaining gates: lock-order/deadlock contention involving ordinary player writes versus result commits; browser/multiple-human synchronization on the new atomic implementation; kick/replacement authorization and remote-host history audit. The former absence of independent PostgreSQL connections is resolved, but these three native cases are not proof for every contention pattern. Both migrations remain local/unapplied.

## Lock-order, replacement, kick and remote history checkpoint

- Reproduced a real PostgreSQL deadlock between a player-row update and a room-first transition. Native output showed mafia_fence_write waiting on the parent while the transition waited on the player. Added BEFORE STATEMENT room-lock triggers using the request room/generation, before row locks are acquired; the row fence remains as a cross-room check. The identical native barrier test now rejects the old write with STALE_GAME and no vote mutation. All FOUR native tests pass on the current migrations; the test server was stopped afterward.
- claimSeat now computes/commits through TransitionPlan, so concurrent uses of one replacement code grant one session. The old session is revoked by the new generation. Role/action stay intact, names remain unique, and an absent profile token creates a fresh profile instead of disclosing/inheriting the previous occupant's profile. Actual Edge/SQL regression passed.
- Added service-only room-locked mafia_kick_player, with authority/version recheck, atomic deletion/generation bump and connected controller selection if needed. Bot refill chooses an unused name, fixing middle-of-list removals. Actual Edge/SQL regression verifies kicked-controller requests fail and refill succeeds.
- Added rooms.match_id refreshed only on dealing, exposed as matchId. The client tracks the history's match ID and clears stale history even when it missed the lobby/reveal while offline. Ordinary phase/controller generation changes preserve that match's history. Snapshot restore also checks match_id. Added a UI regression for missed-rematch history reset.
- All 85 Node tests passed together on this checkpoint's final code (64 contract/UI, 13 lifecycle SQL, 1 integrated two-match, 7 atomic/security). Remaining major gate: browser/multiple-human synchronization on this latest atomic, membership and match-id implementation, followed by requirement-by-requirement completion audit. Both migrations remain unapplied to production; no deployment claimed.

## Final local verification

Completed the remaining multi-session browser gate: room 7311, two full games with 3 then 4 human sessions, refresh/reconnect, late-join rejection, host takeover and departure during voting, matching village victories. Final automated suite: 85 passed together plus the new join-feedback test; strengthened direct replay test also passed. See lifecycle-verification.md for requirement evidence and deployment boundaries. Both migrations remain local; production deployment is not claimed.
