# Local verification

Use Node.js 24 or newer. From the repository root:

```sh
npm ci
npm test
```

The lockfile pins the isolated PostgreSQL runtime and its integrity hash.
Tests never connect to production. The schema fixture contains table definitions
and constraints only; it contains no user rows or credentials.

## Security, rules and recovery assurance

`npm test` now includes `assurance.test.mjs`: revoked credentials, permission and
privacy checks, reconnection in five phases, shared-IP spectator polling, rejected
writes, stale generations, role interactions and complete 6/10/14-seat matches.
Run `node tests/ux-entry-browser.mjs` with `PLAYWRIGHT_MODULE` set to verify entry
forms, dialog keyboard behavior and blocked submissions while reconnecting.

With the isolated native PostgreSQL cluster below running, `npm run test:backup`
performs a real dump/restore into separate temporary databases with synthetic data.
It verifies every application table, relationships, permissions, sequences and
conservative cleanup. Its report and test-only dump are in `artifacts/backup-restore`.
The cleanup SQL defaults to ROLLBACK; no production cleanup is scheduled.

The Arabic permission/rule tables, production read-only findings, retention policy
and verification boundaries are in `docs/assurance-2026-09-13.md`.

- `discussion.test.mjs`: handler/UI contract tests with an in-memory double.
- `lifecycle-postgres.test.mjs`: lifecycle migrations executed in PostgreSQL WASM.
- `lifecycle-edge-sql.test.mjs`: real Edge handler, SQL queries and two matches.
- `atomic-transitions.test.mjs`: rollback, stale preimages, competing handlers,
  departure recovery, snapshot restoration and service-only privileges.

PGlite has one database connection. Competing-handler tests validate stale-result
rejection, but do not prove locking/deadlock behavior between independent PostgreSQL
connections. The SQL transport adapter does not replace a PostgREST network test.

For browser verification:

```sh
npm run test:browser
```

Open the localhost URL printed by the command. The disposable host PIN is
`12345678`. The server replaces the API URL only in the files it serves, routes
requests to the actual Edge handler and uses an in-memory database. Stop with
Ctrl+C; the test database is discarded. The production files and API are unchanged.

## Independent PostgreSQL connections (Windows)

`node tests/postgres-concurrency.mjs` uses native `psql` connections. It creates
and drops only a newly named `mafia_concurrency_*` database on the local test
cluster at `127.0.0.1:55439`, user `mafia_test`. It requires binaries under
`.test-postgres/pgsql/bin` and the cluster password in `.test-postgres/password.txt`.
The entire `.test-postgres` folder is gitignored.

The verified local installation uses PostgreSQL 17.11-3 from
[EDB's binary archive page](https://www.enterprisedb.com/download-postgresql-binaries),
file ID 1260491. Downloaded ZIP SHA-256:
`4b8db0930c38f6ef845db919551dedda3b6b845aeb0927b3d79a6e8e9e4537cf`.
This hash records the downloaded artifact, not an independently published vendor checksum.

Start/stop the existing disposable test cluster with PowerShell:

```powershell
& .test-postgres/pgsql/bin/pg_ctl.exe -D .test-postgres/data -l .test-postgres/server.log -o '-h 127.0.0.1 -p 55439' -w start
node tests/postgres-concurrency.mjs
& .test-postgres/pgsql/bin/pg_ctl.exe -D .test-postgres/data -m fast -w stop
```

On a new machine, extract the official ZIP into `.test-postgres`, create a random
test password file, and initialize `.test-postgres/data` with `initdb -U mafia_test
-A scram-sha-256 --pwfile=.test-postgres/password.txt --locale=C -E UTF8` before
starting the cluster. Do not point this runner at production.

The runner observes both contenders waiting on PostgreSQL locks before releasing
the barrier. It checks duplicate dealing, join-versus-start roster consistency,
and competing result commits with exactly-once statistics.
It also forces a player write to wait behind a room transition, verifying that
the statement-level room lock prevents a player/room lock-order deadlock and
that the old-generation write fails without changing the vote.

## Final acceptance

`npm run test:acceptance:browser` runs entry, role-card, layout, and integrated
journey checks. Requires local Playwright (`PLAYWRIGHT_MODULE` can point to its
`index.mjs`) and Edge. Run `npm run build` first. These scripts intercept browser
requests, serve local assets, and never contact a production game API.

`final-journeys-browser.mjs` exercises UI login/create/join and recovery against
the real Edge handler and fresh PGlite schema for 4/7/10/14/20 participants.
Two independent browser sessions represent a host and player; remaining seats
and phase actions use the test API. It injects API disconnection, reloads both
pages, closes the host and advances the test database heartbeat to exercise
takeover, then checks completion, statistics, and lobby privacy. Its scripted
durations and forced outcomes are not human playtest or balance evidence.

The acceptance matrix and pending human/device checks are recorded in
`docs/final-acceptance-2026-09-13.md`.

`node tests/focus-refresh-browser.mjs` verifies that polling-style renders keep
keyboard focus on role confirmation and role cards within the same phase, without
carrying action focus into a new match. It uses the same Playwright setup.

`node scripts/acceptance-snapshot.mjs` saves code/assets under a timestamped
`artifacts/acceptance-*` directory with SHA-256 fingerprints, excluding credentials
and local database folders. Build inside the saved directory before testing.
`npm run test:human-balance` checks evidence validation; `npm run analyze:human-balance`
summarizes only valid human records from `docs/human-playtests.json`.
