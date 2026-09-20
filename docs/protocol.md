# Request and response contract

The API accepts JSON POST and legacy GET. OPTIONS handles browser preflight.
Malformed JSON or non-object input returns 400 `BAD_REQUEST`; other methods
return 405. Responses and errors use JSON and `Cache-Control: no-store`.

| Field | Purpose |
|---|---|
| `action` | One of the action names in `src/server/contracts.ts` |
| `code` | Four-digit room code for room operations |
| `lifecycleVersion` | Required current generation for mutations; checked again by atomic SQL |
| `hostToken` | Original room controller credential |
| `id`, `playerToken` | Player identity and private session credential |
| `hostAccessToken` | Host account session for account operations and `operationsStatus` |
| `target` | Action-specific choice, validated by its handler |

Success returns a public room view for room actions: `code`, `phase`, `round`,
`lifecycleVersion`, `matchId`, `players`, `phaseClock`, `discussion`, and the
authenticated caller's private `me` when appropriate. Role-specific fields stay
inside the authorized projection in `src/server/views.ts`. No shared response
cache exists. In-flight client reads are shared only for identical full payloads
(including credentials), expire on completion/failure, and return independent objects.

Errors are `{ "error": "CODE" }`. The client attaches `error.code` and
`error.status`; network failures use `NETWORK_ERROR`, timeouts `REQUEST_TIMEOUT`,
and invalid JSON responses `INVALID_RESPONSE`. Mutations are never automatically
retried because their first attempt may have committed.

`X-Request-Id` correlates a response with structured logs. `Server-Timing` reports
application duration; it excludes client network transit. Logs contain only
request ID, allowlisted action, status, duration, room code, public phase and
generation. They exclude bodies, headers, PINs, tokens, names, roles and targets.

`operationsStatus` requires a valid host account session. It returns public phase
clocks for at most 1000 active rooms and per-isolate counters. The counters are
not a global or durable aggregate. A `truncated` response requires narrower
monitoring instead of treating missing rooms as recovered.
