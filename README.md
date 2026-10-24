# Bus Ticketing System

A responsive bus ticketing app built with Next.js, TypeScript, Supabase Auth, Supabase PostgreSQL, and Prisma.

## Quick start

1. Install Node.js 20.9+ and run `npm install`.
2. Configure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `DATABASE_URL` in `.env.local` and `.env` (see [setup instructions](./SETUP_INSTRUCTIONS.md)). For Vercel Realtime in the browser, also set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the same public project URL and anon key.
3. Run `npm run db:setup` to create the PostgreSQL schema and seed buses, routes, and trips.
4. Run `npm run dev` and open `http://localhost:3000`.

## Features

- Passenger registration with email OTP activation, login OTP, OTP resend, and forgot-password recovery OTP.
- Admin and passenger roles with protected server routes.
- Trip search, booking, passenger booking history, and ticket details.
- Admin CRUD for buses, routes, and trips, plus booking management and reports.
- User-to-admin support messaging and login activity history.
- Password security handled by Supabase Auth.

Auth accounts are created through the app and Supabase Auth. The bus seed does not create demo login accounts. Follow the setup guide to promote a verified account to admin.

## Database

Bus, route, trip, and booking records are stored in PostgreSQL and accessed through Prisma. Supabase Auth stores user credentials and roles; `auth_profiles`, `user_login_logs`, and `bus_ticket_messages` support profiles, history, and messaging.

For complete Supabase configuration, SQL steps, OTP settings, and admin setup, see [SETUP_INSTRUCTIONS.md](./SETUP_INSTRUCTIONS.md).
