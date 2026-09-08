# Replacement Desk

Replacement Desk is a standalone internal operations app for customer replacement orders. Esha creates a request, Printing prints its label, Packing submits photo-based QC, Esha reviews it, and an authorized dispatcher records pickup or a missing token. Every important action is retained in an append-only activity history.

## Architecture

- Next.js App Router, React, TypeScript, and Tailwind CSS
- Server Components for reads and Server Actions for writes
- Supabase Auth (email/password), PostgreSQL, RLS, and private Storage
- PostgreSQL security-definer functions as the workflow authority
- Telegram Bot API as a best-effort notification channel
- Vercel deployment; no queue, worker, or separate backend is required

The application code is divided into authentication, replacements, activity, attachments, notifications, permissions, and shared UI modules. PostgreSQL—not hidden UI—is the final permission and transition authority.

## Local setup

Prerequisites: Node.js 20+, npm, and a Supabase project.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Before Supabase is configured, the login screen shows a configuration notice.

## Supabase setup

1. Create a Supabase project.
2. Copy Project URL and anon/publishable key into `.env.local`.
3. Copy the service-role key into `SUPABASE_SERVICE_ROLE_KEY`. It is used only on the server for admin invitations and notification records.
4. Apply both SQL files in `supabase/migrations` in filename order. With the Supabase CLI linked, run:

   ```bash
   supabase db push
   ```

   Alternatively, paste each file into the Supabase SQL editor in order.

The first migration creates the schema, RLS, workflow functions, triggers, indexes, and the private `replacement-files` bucket. No public bucket setup is needed. The bucket accepts JPEG, PNG, WebP, and PDF files up to 5 MB. App and database validation both restrict paths and file types.

### Authentication and first admin

Public self-registration is not implemented. In Supabase Authentication, keep new-user signup disabled if this is an internal-only project.

To create the first admin:

1. In Supabase Dashboard → Authentication → Users, create a user with email/password.
2. The database trigger creates a PACKING profile automatically.
3. In SQL Editor, promote that exact user ID:

   ```sql
   update public.profiles
   set role = 'ADMIN'
   where id = '<auth-user-uuid>';
   ```

4. Sign in. Admin → Users can then create email/password users, change roles, and activate/deactivate users.

Admins assign a temporary password of at least 12 characters and share it through a secure channel. New users should immediately use Profile → Change password. Public registration remains unavailable.

## Telegram setup

1. Message `@BotFather` in Telegram, create a bot, and copy its token.
2. Add the bot to each target chat and obtain the numeric chat ID (group IDs are commonly negative).
3. Set `TELEGRAM_BOT_TOKEN` and the desired `TELEGRAM_*_CHAT_ID` variables.
4. Set `NEXT_PUBLIC_APP_URL` so messages link to the deployed replacement page.

Missing chat IDs are skipped. Telegram delivery or logging failure never rolls back a replacement action. Attempts are recorded in `notifications` when the service-role key is configured.

## Environment variables

| Variable | Scope | Required |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser/server | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser/server | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Yes for admin invitations and notification logs |
| `TELEGRAM_BOT_TOKEN` | Server only | No; required for Telegram |
| `TELEGRAM_ESHA_CHAT_ID` | Server only | Optional recipient |
| `TELEGRAM_PRINTING_CHAT_ID` | Server only | Optional recipient |
| `TELEGRAM_PACKING_CHAT_ID` | Server only | Optional recipient |
| `TELEGRAM_ADMIN_CHAT_ID` | Server only | Optional recipient |
| `NEXT_PUBLIC_APP_URL` | Browser/server | Yes in production |

Never expose or prefix the service-role key or bot token with `NEXT_PUBLIC_`.

## Role testing

Create one account for each role on Admin → Users, then test in order:

1. **ESHA:** create a replacement with a label and customer photo.
2. **PRINTING:** open the label and mark it printed. Confirm QC/dispatch controls are absent.
3. **PACKING:** upload one or more QC images and submit. Confirm approve controls are absent.
4. **ESHA:** reject with a required reason; sign back in as Packing and resubmit; then approve as Esha.
5. **PACKING:** mark the approved replacement packed.
6. **ESHA or ADMIN:** use Dispatch to mark it shipped or needs token.
7. **ADMIN:** verify users, Telegram configuration state, and the audited override control.

Use distinct browser profiles or sign out between roles. Direct attempts to bypass the UI should fail in PostgreSQL.

## Verification

```bash
npm run verify
```

This runs ESLint, TypeScript, workflow unit tests, and a production Next.js build. Business-rule tests cover unauthorized roles, rejection resubmission, packing prerequisites, dispatch alternatives, invalid transitions, and replacement-number formatting.

## Deploy to Vercel

1. Push this directory to a private Git repository.
2. Import it into Vercel as a Next.js project.
3. Add every required environment variable in Vercel Project Settings. Use the production Supabase keys and deployed Vercel origin.
4. Deploy.
5. Add the final Vercel URL to Supabase Auth URL Configuration and update `NEXT_PUBLIC_APP_URL` if needed, then redeploy.

## Operational limitations

- Notifications are attempted once inline; failed Telegram sends are logged but not retried automatically.
- There is no image compression, offline mode, bulk dispatch, or courier integration.
- Search covers replacement number, order reference, and product; usage is intentionally optimized for a few requests per month.
- Admin override changes the replacement status and timestamps but cannot manufacture missing QC submission history. It is an audited recovery tool, not the normal workflow.
- Uploaded storage objects are removed after known failures where possible; an interrupted network request may leave an orphan object that an admin can clean up from Supabase Storage.

## Suggested next improvements

After real-worker feedback, consider a small failed-notification retry control, client-side image compression for slow phones, password-reset UI, and a Supabase-backed integration test suite. Keep marketplace, inventory, courier, and CommerceOps integration outside this MVP until explicitly planned.
