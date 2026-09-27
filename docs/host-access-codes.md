# Limited host access

The existing master PIN remains the owner credential. After master login, use
**إدارة رموز الاستضافة** to create, copy, top up, disable or enable passes.
Guest hosts use **عندي رمز استضافة** on the login page. Players do not need passes.

A pass binds to the first local player profile that redeems it. The profile page
provides a recovery code for moving that account to another device. The name on
the management list is the owner's label, not a verified identity.

Creating a room does not charge. A committed new match, including midgame redeal,
charges once. The database trigger shares the balance across all rooms associated
with the pass and rolls back the whole start when exhausted or disabled. Existing
matches may finish after a pass is disabled; new starts are blocked. Existing
master sessions and rooms remain unlimited.

Deployment order: apply `supabase/host-access-codes.sql` as the `host_access_codes`
production migration, deploy the bundled `mafia-room` Edge function, then publish
the built frontend. The SQL is rerunnable and uses service-only grants with RLS.
The local Supabase CLI was unavailable; the versioned SQL is also loaded by the
disposable Edge test fixture. Do not expose host codes or profile tokens in public
room views.

Verification: `npm run test:host-codes`; `node tests/host-access-browser.mjs`
with PLAYWRIGHT_MODULE set to an installed Playwright module. Browser verification
uses a disposable database and blocks all production traffic.
