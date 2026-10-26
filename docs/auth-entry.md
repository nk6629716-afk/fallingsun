# Authentication entry and branch integration

Integrated main `17f3a3fc53d06a82b42adcd65e55c117bf58521c` with the authentication and logic work on `fix/logic` (`b284e8d`). Main's medical dashboard, nested MediRoute screens, Soldier Vitals, dark theme, and dashboard styles are retained.

## Startup

`src/main.tsx` mounts `ApplicationEntry`. It displays an authentication wireframe for 1,000 ms, verifies any saved session, and renders `AuthPage` for signed-out users. The timer cleans up correctly under React StrictMode. `#signup` opens registration; signed-out dashboard URLs still show sign in.

An approved sign in opens `#dashboard`. New signups stay on the pending approval screen. An administrator approves/rejects accounts in VitalWatch. The approval-status button reauthenticates using the submitted password. Logout clears the client session immediately, revokes the server session, disconnects the live stream and returns every open tab to sign in. Background synchronization waits for an authenticated session.

## Credentials and compatibility

The incoming branch accepted email-only login and derived tokens from public user IDs. These behaviors were removed. Signup and login require a password, local passwords use salted scrypt hashes stored separately from public user profiles, and login issues random server sessions. Wrong passwords, pending/rejected accounts and revoked sessions are rejected. Approval records the authenticated administrator rather than a submitted identity. VitalWatch uses the authenticated operator and cannot switch profiles locally.

Existing fixture accounts have no password. In local development without a configured provider, choose **Explore simulated demo** for explicit administrator access to synthetic data. This option and legacy development tokens are disabled in production or with a configured authentication provider. Newly registered local accounts use their chosen password after approval.

Scenario reset preserves account records and credential hashes. Local sessions expire after 12 hours and are held in server memory, so restarting the API requires sign in again. Initial session verification needs the API; an already signed-in dashboard retains its existing offline simulation behavior.

## Verification

- `npm run build:frontend`
- `npm --prefix server run build`
- `npm run test:all`
- `npx tsx --test --test-timeout=15000 tests/fixes/*.test.ts`
- Cloud Chromium: timed startup, signup/approval, wrong password, login, reload, medical and operational routes, logout across tabs, direct URL guard and mobile signup.

The server's regression test `server/tests/auth-entry.test.ts` covers password verification, approval authorization, unguessable sessions, restoration, logout/revocation and preservation of accounts during scenario resets. This remains a simulated-data prototype; external Supabase operations require separate environment verification.
