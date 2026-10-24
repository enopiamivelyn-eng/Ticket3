# Bus Ticketing System Setup

This project uses Supabase Auth for accounts and email OTP, Supabase PostgreSQL for bus-ticket data, and Prisma for server-side database access.

## 1. Install the project

Use Node.js 20.9 or newer, then run:

```bash
npm install
```

## 2. Configure Supabase

Create a Supabase project. In **Project Settings → API**, copy the Project URL and anon key. Keep these values private except for the anon key, which is intended for public clients. Never use a service-role key in this app.

Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `DATABASE_URL` in `.env.local` for the Next.js app and in `.env` for Prisma CLI commands. For local development, a direct or session-pooler PostgreSQL URI can be used if it is reachable from your network. The local URI shown here is only an example:

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
DATABASE_URL=postgresql://postgres:YOUR_DATABASE_PASSWORD@YOUR_DATABASE_HOST:5432/postgres?sslmode=require
```

For Vercel serverless deployments, set `DATABASE_URL` in **Vercel → Project → Settings → Environment Variables** to the **Transaction pooler** URI from **Supabase → Connect**. Use the exact host and username Supabase provides; it should use port `6543`. Add `pgbouncer=true&connection_limit=1&sslmode=require` to the query string. Select every Vercel environment where the app will run (Production and/or Preview), then redeploy because existing deployments do not receive changed environment variables.

Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` for those same Vercel environments. All three values must refer to the same Supabase project. Never commit real values from `.env` or `.env.local`.

Keep the real values private. These environment files are excluded from Git. Never put the database connection string or a Supabase service-role key in browser code.

## 3. Create the database tables

The Prisma schema is the source of truth for buses, routes, trips, and bookings. Create those PostgreSQL tables and seed the bus catalog with:

```bash
npm run db:setup
```

If this Supabase project already contains the older quoted `public."User"` table or existing bus-ticket data, back up the project first. Prisma may report legacy schema changes before it can align the tables; do not accept a data-loss prompt until you have reviewed what it will remove.

Then in the Supabase SQL Editor, run `supabase-business-security.sql` to enable row-level security and block direct browser access to the ticket data tables. The app accesses those tables through server-side Prisma routes.

The seed creates Cebu City routes to Bato, Oslob, Boljoon, Dalaguete, Moalboal, Argao, Carcar, Toledo City, and Sibonga, plus active buses and a daily departure schedule for the next 30 days. After the tables already exist, use `npm run db:seed` to add or extend this sample catalog without deleting bookings.

Run `supabase-auth-migration.sql` in the SQL Editor to create auth profiles, login history, the user-to-admin message board, and in-app notifications for new passenger/admin messages. This script is safe to rerun. If you already ran an older version of this script, run the updated file again; alternatively, run `supabase-notifications.sql` to add just the notification table and trigger.

Do not run `supabase-schema.sql` on a database with data: it drops and recreates the bus-ticket tables. It is only for intentionally resetting a disposable/new database. Do not run `supabase-messages-rename.sql` unless the old `public.messages` table needs to be replaced; it drops that old table.

## 4. Configure email OTP

In **Authentication → Providers → Email**, enable email confirmation. For the **Password Recovery** email template, send the code with `{{ .Token }}` (for example, `Your password reset code is {{ .Token }}.`) and remove any recovery URL or link from that template. The app accepts password recovery only through the email address and numeric code flow; it does not send SMS codes or use password-reset links. Use `{{ .Token }}` in the signup and email OTP templates as well. Configure a custom SMTP provider in **Authentication → SMTP Settings** for reliable delivery. Set the code expiry in the Supabase Auth email/OTP settings; Supabase rejects expired codes when the app verifies them.

The app supports these flows:

1. **Registration:** register → email code → verify code → account activated.
2. **Login:** email and password → email code → verify code → dashboard.
3. **Forgot password:** request recovery code → verify code → set new password.

The verification screens include a resend action. Supabase rate limits may temporarily delay repeated requests.

## 5. Create an administrator

Register using the app and verify that account’s email first. In Supabase SQL Editor, replace the address below with that account’s email and run:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"role":"admin"}'::jsonb
where lower(email) = lower('admin@example.com');
```

Sign out and sign in again so the refreshed Supabase session includes the admin role. New registrations receive the regular `passenger` role; role data is stored in Supabase Auth app metadata and mirrored to `auth_profiles`.

## 6. Start the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Implemented system requirements

- Registration, login, logout, email OTP verification, expiration enforced by Supabase, and resend OTP.
- Admin and passenger roles with protected pages and API routes.
- Passenger and admin dashboards, an admin management area, and admin reports.
- User-to-admin and admin-to-user message board.
- Bus, route, trip, and booking operations, including create/read/update/delete actions where appropriate.
- PostgreSQL database for buses, routes, trips, and bookings; Supabase Auth for users.
- Route/trip search and filters, client and server input validation, login activity history, and booking records.
- Password storage and verification handled by Supabase Auth.
- Responsive public, booking, and account interfaces.

## Existing local SQLite data

The app now reads bus-ticket data from PostgreSQL. Existing records in `prisma/dev.db` are not copied automatically. The seed command creates sample buses, routes, and upcoming trips in PostgreSQL; bookings must be recreated or migrated separately if they need to be retained.
