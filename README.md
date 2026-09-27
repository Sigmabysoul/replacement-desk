# TBC_KART

TBC_KART is a standalone internal operations app for replacement and offline orders. Customer Support creates one or more orders with product photos, Logistics uploads the shipping label and adds tracking, Printing marks the label printed, Packing submits separate QC pictures for Customer Support's review, and Packing packs and completes dispatch. Every important action is retained in an append-only activity history.

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
4. The Supabase CLI is installed inside this project, so a global `supabase` command is not required. Confirm it works, sign in, link the project once, and apply every SQL file in `supabase/migrations`:

   ```bash
   npm run supabase -- --version
   npm run supabase -- login
   npm run supabase -- link --project-ref YOUR_PROJECT_REF
   npm run db:push
   ```

   Replace `YOUR_PROJECT_REF` with the reference shown in Supabase Project Settings. For the optional local Supabase stack, install Docker and use `npm run db:start`, `npm run db:status`, and `npm run db:stop`. Alternatively, paste each migration into the Supabase SQL editor in filename order.

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

4. Sign in. Admin → Users can then create email/password users, rename their displayed full name, change roles, and activate/deactivate users. Renaming there updates both `public.profiles.full_name` and the Auth user's full-name metadata.

Admins assign a temporary password of at least 6 characters and share it through a secure channel. New users should immediately use Profile → Change password. Public registration remains unavailable.

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
| `TELEGRAM_CUSTOMER_SUPPORT_CHAT_ID` | Server only | Optional recipient |
| `TELEGRAM_LOGISTICS_CHAT_ID` | Server only | Optional recipient |
| `TELEGRAM_PRINTING_CHAT_ID` | Server only | Optional recipient |
| `TELEGRAM_PACKING_CHAT_ID` | Server only | Optional recipient |
| `TELEGRAM_ADMIN_CHAT_ID` | Server only | Optional recipient |
| `NEXT_PUBLIC_APP_URL` | Browser/server | Yes in production |

Never expose or prefix the service-role key or bot token with `NEXT_PUBLIC_`.

## Role testing

Create one account for each role on Admin → Users, then test in order:

1. **CUSTOMER_SUPPORT:** create a replacement order with one or more product line items and product photos. Verify shared replacement dimensions and automatic order numbers starting at 501. Create and edit a preset in Dimensions.
2. **LOGISTICS:** upload one shipping label and optionally add its tracking link. Confirm product-photo, QC, printing, packing, and dispatch controls are absent.
3. **PRINTING:** mark the uploaded label printed. Confirm file upload and QC controls are absent.
4. **PACKING:** upload separate QC pictures and request CUSTOMER_SUPPORT approval.
5. **CUSTOMER_SUPPORT:** reject with a required reason; sign back in as Packing and resubmit photos without losing the original label; then approve as CUSTOMER_SUPPORT.
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

### Deploy to Coolify (VPS Hosting)

Coolify is an open-source, self-hosted Heroku/Netlify/Vercel alternative that runs on your VPS.

#### 1. Understanding the Database & Backend Architecture
This application utilizes **Supabase** features directly on top of PostgreSQL:
- **Authentication**: JWT cookies, session validation (`@supabase/ssr`, `auth.users`).
- **PostgreSQL Database**: Custom schema, stored procedures (RPC), triggers, and Row-Level Security (`auth.uid()`).
- **Storage**: Buckets for labels, POD documents, and photos (`storage.buckets`).
- **Realtime**: WebSocket channels for instant dashboard updates.

> [!IMPORTANT]
> If you deploy a plain/vanilla PostgreSQL container in Coolify, it lacks the HTTP authentication endpoints (`/auth/v1`) and object storage endpoints (`/storage/v1`).
> **You have two supported ways to set up the backend on your VPS:**
> 1. **Option A (Self-hosted on your VPS via Coolify - Recommended for full VPS ownership)**:
>    In Coolify, go to **+ Create Resource → Service → Supabase**. Coolify will spin up PostgreSQL 15, GoTrue Auth, Storage, PostgREST, Realtime, Kong Gateway, and Supabase Studio on your VPS.
> 2. **Option B (Managed Supabase Cloud + VPS Web App)**:
>    Use a free or pro project on [supabase.com](https://supabase.com), and run the Next.js web application container in Coolify on your VPS.

---

#### 2. Database Initialization
Once your Supabase instance (Coolify Service or Supabase Cloud) is running:
1. Open **Supabase Studio → SQL Editor**.
2. Paste and run the complete schema from [`supabase/schema.sql`](file:///home/sigma/work/replacement-desk/supabase/schema.sql). This initializes all enums, tables, RLS policies, RPC stored procedures, and storage buckets (`replacement-photos` and `offline-documents`).

---

#### 3. Deploy the Web Application in Coolify

##### Method A: Direct Git / Dockerfile Deployment (Recommended)
1. In Coolify, click **+ Create Resource → Application → Public/Private Git Repository**.
2. Select your repository and `master` (or main) branch.
3. Under **Build Pack**, select **Dockerfile**.
4. In the **Environment Variables** tab, add:
   | Variable | Value | In Coolify: Check "Build Variable"? |
   | :--- | :--- | :---: |
   | `NEXT_PUBLIC_SUPABASE_URL` | e.g. `https://your-domain-or-ip:8000` | ✅ **YES** |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Anon key from Supabase API settings | ✅ **YES** |
   | `NEXT_PUBLIC_APP_URL` | Public HTTPS domain for this app | ✅ **YES** |
   | `SUPABASE_SERVICE_ROLE_KEY` | `service_role` secret key from Supabase API settings | ❌ NO (Runtime only) |
   | `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`| Random 32-byte key (`openssl rand -base64 32`) | ❌ NO (Runtime only) |
   | `TELEGRAM_*` (optional) | Bot token & channel IDs | ❌ NO (Runtime only) |
5. Coolify will automatically configure Traefik / Caddy, generate free Let's Encrypt SSL, and deploy the app on port 3000.

##### Method B: Docker Compose in Coolify
If you prefer deploying via Docker Compose:
1. Coolify will automatically detect [`docker-compose.yaml`](file:///home/sigma/work/replacement-desk/docker-compose.yaml).
2. Enter the same environment variables in the Coolify UI.
3. Click **Deploy**.

---

#### 4. Create the Initial Admin User
Because the database is brand new, create your first superadmin account so you can log in:
```bash
# Run locally or via SSH on your VPS:
npm run create-admin <your-email@example.com> <your-password> "Super Admin"
```
Or execute it inside the running container in Coolify:
```bash
docker exec -it <container-id> node scripts/create-admin.mjs admin@example.com MyPass123! "Super Admin"
```
Once created, navigate to `/login` on your domain, log in, and you'll have full administrative control!

## Deploy to Vercel

1. Push this directory to a private Git repository.
2. Import it into Vercel as a Next.js project.
3. Add every required environment variable in Vercel Project Settings. Use the production Supabase keys and deployed Vercel origin.
4. Deploy.
5. Add the final Vercel URL to Supabase Auth URL Configuration and update `NEXT_PUBLIC_APP_URL` if needed, then redeploy.

## Operational limitations

- Notifications are retried once inline; failed Telegram sends are logged but never block the order workflow.
- There is no offline mode, bulk dispatch, or courier integration.
- Search covers replacement number, courier partner, and product; usage is intentionally optimized for a few requests per month.
- Admin override changes the replacement status and timestamps but cannot manufacture missing QC submission history. It is an audited recovery tool, not the normal workflow.
- Uploaded storage objects are removed after known failures where possible; an interrupted network request may leave an orphan object that an admin can clean up from Supabase Storage.

## Suggested next improvements

After real-worker feedback, consider a small failed-notification retry control and password-reset UI. Keep marketplace, inventory, courier, and CommerceOps integration outside this MVP until explicitly planned.
