# Connect SENTINEL to Supabase

## What this integration provides

- Supabase Auth checks signup and email/password login.
- `sentinel_users` stores each Auth UUID, requested role, and administrator approval in PostgreSQL.
- Every authenticated API request rechecks the cloud approval. Browser metadata cannot grant admin access.
- New registrations stay pending. Email confirmation and administrator approval are separate requirements.
- The existing one-second wireframe, local demo mode, and sign-out flow remain available.

**Current boundary:** operational dashboards still read the application's local cache. Existing operational writes and VitalWatch personnel/vitals mirror some fields into Supabase asynchronously. This is not a complete migration of all module data to PostgreSQL. Use a persistent server data directory for that cache. App sessions remain opaque, expire after 12 hours, and require sign-in after an API restart. Password-recovery email dispatch exists, but the frontend recovery callback/new-password form is not implemented.

## 1. Create or select your project

Open your project at [Supabase Dashboard](https://supabase.com/dashboard). In **Connect** / API keys, get:

- Project URL: `https://YOUR_PROJECT_REF.supabase.co`
- Publishable key: `sb_publishable_...`
- Server secret key: `sb_secret_...`

Legacy anon/service-role keys also work through `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. Keep secret keys in the backend environment, outside chat and Git. This app's main authentication screen calls the backend; it does not need Supabase keys in `VITE_*` variables.

## 2. Apply the SQL

In your project's **SQL Editor**, run these complete files **in order**:

1. `server/src/db/schema.sql` — operational tables and synthetic demo fixtures. Root `supabase_schema.sql` is an identical convenience copy.
2. `server/src/db/auth-schema.sql` — private approval profiles, the Auth signup trigger, existing-account backfill, and tables used by VitalWatch mirrors.

Both scripts can be rerun. They do not delete existing rows or reset existing approvals. Existing Auth accounts receive pending profiles on first application. The trigger ignores client-provided admin roles and approval status.

The baseline retains public reads of synthetic operational fixtures for demo evaluation. Its write policies are explicitly restricted to `service_role`. Auth profiles and the new VitalWatch tables have no browser read/write grants. Further API authorization and data-policy work is required before storing real personnel or medical data.

## 3. Configure the server

From the repository root, copy `server/.env.example` to `server/.env`, then set:

```dotenv
PORT=5000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
STORAGE_MODE=supabase
DATA_DIR=./data
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=YOUR_SERVER_SECRET_KEY
```

Existing environment variables take precedence over the file. The source and compiled servers both locate `server/.env`; the process working directory's `.env` remains a compatibility fallback.

For deployment, configure these variables on the backend host, use `NODE_ENV=production`, set `CORS_ORIGIN` to the frontend origin, and attach persistent storage at `DATA_DIR`. Do not commit the real `.env`.

Check access:

```bash
npm --prefix server run check:supabase
```

This checks the privileged Auth API and all eleven tables without changing hosted data. It does not verify SMTP, a password login, or browser behavior against your hosted project.

## 4. Configure email and start locally

In Supabase Auth settings, enable email/password signup and set the Site URL to `http://localhost:5173` during development, or your deployed frontend origin later. Leave email confirmation enabled for a real deployment. Configure an authorized email provider for delivery beyond a small development test.

Start in two terminals:

```bash
npm --prefix server run dev
```

```bash
npm run dev
```

Open `http://localhost:5173`. Root `.env.local` only needs `VITE_API_URL=/api`; Vite proxies it to port 5000. For separate frontend/backend deployments, use `VITE_API_URL=https://YOUR_API_HOST/api` and configure the matching CORS origin.

## 5. Bootstrap the first administrator

1. Register **your own account** in the app.
2. Confirm its verification email if Supabase requests it.
3. In the SQL Editor, replace the placeholder email below with that account's exact email and run:

```sql
UPDATE public.sentinel_users
SET role = 'admin', status = 'approved', approved_at = NOW(), approved_by = 'initial-project-owner'
WHERE email = lower('REPLACE_WITH_YOUR_OWN_EMAIL')
RETURNING id, email, role, status;
```

Exactly one row should be returned. If none appears, check that both SQL scripts were applied and signup completed. Do not grant admin to every account. Sign in again, open **VitalWatch**, and use its approval actions for subsequent accounts. The local demo administrator is intentionally unavailable with a configured provider.

Accounts previously created in local/file mode are not automatically converted into Supabase Auth accounts. Register or invite them through Supabase; their local password hashes and `USR-*` IDs are not cloud identities.

## 6. Verify the complete flow

1. Run `check:supabase`; every table should report `OK`.
2. Register a second synthetic user; confirm a pending UUID profile appears in `sentinel_users`.
3. Before approval, login must not open the dashboard. Confirm email separately if requested.
4. Sign in as the administrator and approve the account through VitalWatch.
5. Login as that account; check dashboard, reload, and logout.
6. Reject the account as administrator; its next authenticated request must fail.
7. Restart the API and sign in again; the account and approval must still exist.

No hosted project was modified during preparation. Local validation covers the SDK/API boundary using synthetic HTTP responses and PostgreSQL schema/trigger/permission behavior using a temporary PGlite database. Hosted Auth, SMTP delivery, live migrations, and your hosting environment must be verified after private configuration.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Startup reports missing configuration | Supply the URL, public key, and server secret in the backend environment. |
| Registration unavailable | Apply `auth-schema.sql`; check the trigger and backend logs. |
| Confirm your email before signing in | Complete the Supabase email verification, then sign in again. |
| Pending administrator approval | Approve that account's UUID profile; email confirmation alone does not approve it. |
| Demo sign-in disappears | Expected when Supabase is configured. Bootstrap your real administrator as above. |
| `check:supabase` reports a table unavailable | Run both SQL files in the same project referenced by the server URL. |
| Operational data disappears on host restart | Retain the local cache on persistent storage; operational modules are not fully cloud-backed. |

Official references: [API keys](https://supabase.com/docs/guides/api/api-keys), [signup](https://supabase.com/docs/reference/javascript/auth-signup), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).
