# Ticket9ja

Multi-organizer event ticketing platform (Next.js App Router, TypeScript, Prisma, PostgreSQL).
How it works: the Super Admin (or an invited organizer) creates an event and shares its link. People who open the link can
buy tickets for that event only. Tickets are emailed with QR codes and validated at the door with the scanner app (/scanner).
There is no public list of events. Status: written but NOT yet compiled or tested. See docs/LEDGER.md.

## First-time setup (Windows, Command Prompt or PowerShell)

1. Install Node.js 20 or newer and a PostgreSQL database (local install, or a free hosted one such as Neon or Supabase).
2. In this folder:

       copy .env.example .env

3. Edit `.env`:
   - `DATABASE_URL`: your Postgres connection string
   - `DIRECT_URL`: a direct or session-mode connection (used by migrations). Same value as DATABASE_URL on a plain Postgres.
   - `APP_URL`: `http://localhost:3000`
   - `AUTH_SECRET`: generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   - `EMAIL_FROM`: any address for now (emails print to the terminal until you set `RESEND_API_KEY`)
   - `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` (12+ characters): your Super Admin login
4. Run:

       npm install
       npm run db:init
       npm run db:seed
       npm run typecheck
       npm test
       npm run dev

   Then remove the two `BOOTSTRAP_ADMIN_*` lines from `.env`.
   `npm run db:init` is for the FIRST setup only. For later schema changes use `npm run db:migrate`.

5. Open http://localhost:3000. Sign in at /login with the bootstrap admin, invite an organizer at /admin/invitations
   (the invitation link prints in the terminal in development).

## Database tests

Create a separate empty throwaway database, run `npx prisma migrate deploy` against it with `DATABASE_URL` set to it,
then run the tests with `TEST_DATABASE_URL` set to the same URL. Never point them at real data.
