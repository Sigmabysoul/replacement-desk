# TBC_KART

TBC_KART is a standalone internal operations app for customer replacement orders. customer_support creates the order with product photos, Logistics uploads the shipping label, Printing marks the label printed, Packing submits separate QC pictures for customer_support's review, and Packing packs and completes dispatch. Every important action is retained in an append-only activity history.

## Architecture

- Next.js App Router, React, TypeScript, and Tailwind CSS
- Server Components for reads and Server Actions for writes
- Supabase Auth (email/password), PostgreSQL, RLS, and private Storage
- PostgreSQL security-definer functions as the workflow authority
- Telegram Bot API as a best-effort notification channel
- Managed Next.js deployment on Hostinger or Vercel; no queue, worker, or separate backend is required

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
4. Apply every SQL file in `supabase/migrations` in filename order. With the Supabase CLI linked, run:

   ```bash
   supabase db push
   ```

   Alternatively, paste each file into the Supabase SQL editor in order.

The migrations create the schema, RLS, workflow functions, triggers, indexes, Realtime publication, role hardening, and the private `replacement-files` bucket. No public bucket setup is needed. The bucket accepts JPEG, PNG, WebP, and PDF files up to 25 MB. App and database validation both restrict paths and file types.

### Authentication and first admin

Public self-registration is not implemented. In Supabase Authentication, keep new-user signup disabled if this is an internal-only project.

To create the first admin:

1. In Supabase Dashboard → Authentication → Users, create a user with email/password.
2. The database trigger creates a PRINTING profile automatically as the narrowest operational fallback.
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

Use a separate chat ID for each operational handoff so the next responsible team is notified without alerting everyone.

## Environment variables

| Variable | Scope | Required |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser/server | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser/server | Yes, unless using the publishable key |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser/server | Yes, unless using the anon key |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Server only | Yes for stable self-hosted deployments |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Yes for admin invitations and notification logs |
| `TELEGRAM_BOT_TOKEN` | Server only | No; required for Telegram |
| `TELEGRAM_customer_support_CHAT_ID` | Server only | Optional recipient |
| `TELEGRAM_LOGISTICS_CHAT_ID` | Server only | Optional recipient |
| `TELEGRAM_PRINTING_CHAT_ID` | Server only | Optional recipient |
| `TELEGRAM_PACKING_CHAT_ID` | Server only | Optional recipient |
| `TELEGRAM_ADMIN_CHAT_ID` | Server only | Optional recipient |
| `NEXT_PUBLIC_APP_URL` | Browser/server | Yes in production |

Never expose or prefix the service-role key or bot token with `NEXT_PUBLIC_`.

## Role testing

Create one account for each role on Admin → Users, then test in order:

1. **customer_support:** create a replacement with the order details and one or more product photos.
2. **LOGISTICS:** upload one shipping label only. Confirm product-photo, QC, printing, packing, and dispatch controls are absent.
3. **PRINTING:** mark the uploaded label printed. Confirm file upload and QC controls are absent.
4. **PACKING:** upload separate QC pictures and request customer_support approval.
5. **customer_support:** reject with a required reason; sign back in as Packing and resubmit photos without losing the original label; then approve as customer_support.
6. **PACKING:** mark the approved replacement packed, then mark it shipped or needs token from Dispatch.
7. **ADMIN:** verify users, Telegram configuration state, and the audited override control.

Use distinct browser profiles or sign out between roles. Direct attempts to bypass the UI should fail in PostgreSQL.

## Verification

```bash
npm run verify
```

This runs ESLint, TypeScript, workflow unit tests, a disposable-PostgreSQL migration and lifecycle test, and a production Next.js build. The database test also proves that Auth metadata cannot grant roles, inactive users cannot read work, and rejected QC submissions retain their history.

## Deploy to Hostinger

Hostinger's managed Node.js web apps currently require **Business Web Hosting or a Cloud plan**. Premium Web Hosting alone cannot run this server-rendered Next.js application. Keep Supabase as the external Auth, PostgreSQL, and Storage provider; do not create a second application database in Hostinger.

1. Push this directory to GitHub and select the `master` branch in Hostinger.
2. In hPanel, go to **Websites → Add Website → Deploy Web App → Import Git Repository**.
3. Use the detected Next.js settings, with Node.js 22.x, `npm run build` as the build command, and `npm run start` as the start command.
4. Add every required environment variable from the table above. Copy the values from the existing production deployment; never expose server-only secrets with a `NEXT_PUBLIC_` prefix.
5. Set `NEXT_PUBLIC_APP_URL` to the final Hostinger HTTPS origin and deploy.
6. In Supabase **Authentication → URL Configuration**, set the Site URL to the final origin and add it to Redirect URLs.
7. Redeploy after changing environment variables, then verify login, one replacement lifecycle, a private-file preview, and a Telegram link before moving production traffic.

GitHub integration automatically builds the latest selected branch on subsequent pushes. The application requires a Node.js server and must not be deployed as a static export.

### Hostinger VPS deployment

The repository also includes a production `Dockerfile` and `compose.hostinger.yaml` for a Hostinger VPS that already runs Coolify. This deployment joins the existing external `coolify` Docker network but does not publish a host port. An existing reverse proxy can reach the stable `replacement-desk` network alias on port 3000 without exposing the Next.js server directly.

The workflow migration introduces Logistics and the `LABEL_UPLOADED` state while preserving existing Printing and Packing assignments. Use a short maintenance window and complete these steps in order:

1. Confirm the exact Supabase project URL/reference, take a Supabase backup, and export `select id, full_name, role from public.profiles;` for rollback evidence.
2. Apply every pending SQL migration in filename order with `supabase db push`. Confirm the `LOGISTICS` role, `LABEL_UPLOADED` status, `PROOF_PHOTO` attachment type, `create_replacement_with_photos`, `submit_logistics_label`, and `submit_packing_qc` functions exist before proceeding.
3. Assign at least one active Logistics profile, build and start the new container, verify `/login` and one controlled lifecycle, then switch HTTPS traffic. The old build cannot understand `LABEL_UPLOADED`, so application rollback also requires restoring the pre-migration database backup.

Keep production values in an uncommitted `.env.production` file beside the Compose file. Generate `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` once with `openssl rand -base64 32` and retain the same value across builds. Compose passes that server-only value to the BuildKit builder as a secret and also supplies runtime secrets through the env file; only `NEXT_PUBLIC_*` values are normal build arguments. Deploy with:

```bash
docker compose --env-file .env.production -f compose.hostinger.yaml up -d --build
```

The container runs as an unprivileged user, restarts automatically, and reports health against `/login`. Route the chosen HTTPS hostname to `http://replacement-desk:3000` from the reverse proxy on the `coolify` network. Always test the proxy configuration before reloading it.

## Deploy to Vercel

1. Push this directory to a private Git repository.
2. Import it into Vercel as a Next.js project.
3. Add every required environment variable in Vercel Project Settings. Use the production Supabase keys and deployed Vercel origin.
4. Deploy.
5. Add the final Vercel URL to Supabase Auth URL Configuration and update `NEXT_PUBLIC_APP_URL` if needed, then redeploy.

## Operational limitations

- Notifications are retried once inline; failed Telegram sends are logged but never block the order workflow.
- There is no offline mode, bulk dispatch, or courier integration.
- Search covers replacement number, order reference, and product; usage is intentionally optimized for a few requests per month.
- Admin override changes the replacement status and timestamps but cannot manufacture missing QC submission history. It is an audited recovery tool, not the normal workflow.
- Uploaded storage objects are removed after known failures where possible; an interrupted network request may leave an orphan object that an admin can clean up from Supabase Storage.

## Suggested next improvements

After real-worker feedback, consider a small failed-notification retry control and password-reset UI. Keep marketplace, inventory, courier, and CommerceOps integration outside this MVP until explicitly planned.
