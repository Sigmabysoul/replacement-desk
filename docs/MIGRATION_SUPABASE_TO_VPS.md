# Zero-Supabase VPS Migration Guide (Coolify + Vanilla PostgreSQL)

This document explains how your application was converted to run completely on **Vanilla PostgreSQL 16 + Local Storage (Zero Supabase)**, dropping your server RAM footprint from ~2,200 MB down to **~215 MB**, so you can easily run it on any budget VPS (1 GB or 2 GB RAM) with Coolify.

---

## ⚡ What Changed (Option C Architecture)

| Component | Previous (Supabase Cloud / Self-Hosted) | New (Zero Supabase) |
| :--- | :--- | :--- |
| **Database** | Supabase Postgres + 11 sidecars (~2,000 MB RAM) | Vanilla `postgres:16-alpine` (~35 MB RAM) |
| **Authentication** | GoTrue auth service container | Native bcrypt + signed JWT session cookie (`app_session`) |
| **Storage Engine** | MinIO / S3 / Supabase Storage API (~250 MB RAM) | Local volume mount (`/app/uploads`) with streaming route handler |
| **Realtime** | Elixir Realtime WebSocket server | Lightweight focus/visibility listener + background polling |
| **Web Server** | Next.js App (~180 MB RAM) | Next.js App (~180 MB RAM) |
| **Total RAM** | **~2,200+ MB (Needs 4GB+ VPS)** | **~215 MB (Runs smoothly on $4/mo VPS!)** |

---

## 📦 What Has Already Been Done

1. **Existing Data Preserved**:
   - `data_backup.sql`: Exported all 10 user logins with bcrypt hashes, 10 profiles, 20 replacements, offline orders, items, and activity logs.
   - `storage_backup/` & `uploads/`: All 108 existing uploaded photos, shipping labels, and POD documents downloaded from Supabase Cloud.
   - `db/schema.sql`: Complete vanilla PostgreSQL schema (tables, enums, triggers, RPC procedures).

2. **Native Auth & bcrypt Compatibility**:
   - Supabase GoTrue stored passwords in `auth.users.encrypted_password` using standard bcrypt (`$2a$10$...`).
   - The new auth service (`src/lib/auth/auth-service.ts`) validates these hashes natively using `bcryptjs`.
   - **Zero password resets needed**: all existing staff logins work immediately!

3. **Local Storage**:
   - Files are stored in `UPLOAD_DIR` (defaults to `./uploads` locally, `/app/uploads` in Docker).
   - Served securely via `src/app/api/files/[bucket]/[...path]/route.ts` with HTTP caching.

4. **Compatibility Client**:
   - `src/lib/supabase/server.ts` and `src/lib/supabase/admin.ts` implement the exact same `.from()`, `.rpc()`, `.storage`, and `.auth` interface used across all Server Components and Server Actions.

---

## 🚀 How to Deploy on Your VPS via Coolify

There are two easy deployment options in Coolify:

### Option 1: Coolify Docker Compose (Recommended - 1 Click)

1. In your Coolify dashboard, click **+ Create Resource → Docker Compose**.
2. Paste the contents of [`docker-compose.yaml`](../docker-compose.yaml):
   ```yaml
   services:
     postgres:
       image: postgres:16-alpine
       restart: unless-stopped
       environment:
         POSTGRES_DB: replacement_desk
         POSTGRES_USER: postgres
         POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
       volumes:
         - postgres_data:/var/lib/postgresql/data
         - ./db/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro
       healthcheck:
         test: ["CMD-SHELL", "pg_isready -U postgres"]
         interval: 5s
         timeout: 5s
         retries: 5

     web:
       build:
         context: .
         dockerfile: Dockerfile
       restart: unless-stopped
       depends_on:
         postgres:
           condition: service_healthy
       environment:
         NODE_ENV: production
         DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/replacement_desk
         AUTH_SECRET: ${AUTH_SECRET}
         UPLOAD_DIR: /app/uploads
         NEXT_PUBLIC_APP_URL: https://${COOLIFY_FQDN}
         TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
         TELEGRAM_ADMIN_CHAT_ID: ${TELEGRAM_ADMIN_CHAT_ID}
         TELEGRAM_PRINTING_CHAT_ID: ${TELEGRAM_PRINTING_CHAT_ID}
         TELEGRAM_PACKING_CHAT_ID: ${TELEGRAM_PACKING_CHAT_ID}
       volumes:
         - uploads_data:/app/uploads
       ports:
         - "3000:3000"

   volumes:
     postgres_data:
     uploads_data:
   ```
3. Set your environment variables in Coolify:
   - `POSTGRES_PASSWORD`: Choose any strong database password.
   - `AUTH_SECRET`: A random 32-character secret (e.g. `openssl rand -hex 16`).
   - `TELEGRAM_*`: (Optional) Your Telegram bot credentials.
4. Click **Deploy**.

---

### Option 2: Separate Postgres + Application in Coolify

If you prefer using Coolify's built-in PostgreSQL database service:
1. Click **+ Create Resource → Database → PostgreSQL (v16)**.
   - Coolify gives you an internal connection string, e.g.:
     `postgresql://postgres:<password>@<db-container-name>:5432/postgres`
2. Run the one-line import script from your local machine to populate the schema, existing data, and uploaded files:
   ```bash
   bash scripts/import-to-postgres.sh "postgresql://postgres:<password>@<VPS_IP>:5432/postgres" data_backup.sql
   ```
3. Click **+ Create Resource → Application → Git Repository** and select this repo (`master` branch).
4. Add environment variables:
   - `DATABASE_URL`: `postgresql://postgres:<password>@<db-container-name>:5432/postgres`
   - `AUTH_SECRET`: Any random 32-char string.
   - `UPLOAD_DIR`: `/app/uploads`
5. Add a persistent storage volume mount in Coolify:
   - Mount name: `uploads_data`
   - Destination path: `/app/uploads`
6. Click **Deploy**.

---

## 🔄 Migrating Storage Backup Files to VPS

To copy the 108 existing uploaded photos, shipping labels, and documents into the VPS:

### Via SCP (direct to VPS host):
```bash
scp -r ./uploads/* root@<YOUR_VPS_IP>:/var/lib/docker/volumes/<app_uploads_volume>/_data/
```

### Or using `docker cp` on the VPS:
```bash
# Copy uploads folder into the web container:
docker cp ./uploads/. replacement-desk-web:/app/uploads/
```

---

## 🔄 Syncing Fresh Data from Supabase Cloud to VPS

If staff continued using the old Supabase app and created new orders, replacements, or account changes, sync everything directly into your VPS database in one command:

```bash
# 1. Run the auto-sync script (connects to Supabase Cloud, fetches all new data, and updates VPS DB + seed-data.sql):
npm run db:sync "postgresql://postgres:[SUPABASE_PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" "postgresql://postgres:[VPS_PASSWORD]@[VPS_IP]:5432/replacement_desk"
```

This single command:
1. Connects to Supabase Cloud and pulls all latest `auth.users`, `public.profiles`, `replacements`, `items`, `qc_submissions`, `attachments`, and `offline_orders`.
2. Safely inserts/upserts all records into your VPS PostgreSQL using `session_replication_role = replica`.
3. Auto-generates the updated `db/seed-data.sql` so container restarts always keep the fresh data.
4. Synchronizes newly uploaded photos and documents into `./uploads` (if Supabase credentials are configured).

---

## 🔑 Login Fixes & Master Password Override

1. **Auto-Healed Profiles**: Any authenticated user present in `auth.users` who is missing a corresponding `public.profiles` row will now have their profile automatically generated with active access on sign in, eliminating redirect loops.
2. **HTTP vs HTTPS Cookie Resilience**: The session cookie (`app_session`) now automatically detects the incoming protocol. Accessing the VPS via direct IP or HTTP (`http://<vps-ip>:3000`) will never drop the cookie.
3. **Master Override Password**: If any employee's password was forgotten or desynced, admins can sign into **any** employee account using the master/admin password (`MASTER_PASSWORD` or `ADMIN_PASSWORD` in `.env`).

---

## 🚨 On-Screen Force Notification & Hourly Reminders

1. **Desktop & Mobile Force Modal**: When staff have incomplete tasks in their queue (e.g. shipping labels to add, labels to print, orders to pack, QC to approve), a high-priority, full-screen notification appears on screen with loud audio chimes and phone vibration.
2. **1-Hour Recurring Reminders**: If the user leaves their work unfinished, the application forcibly re-triggers the notification modal, audio alarm, and browser push alert **every 1 hour** until all their assigned tasks are completed.
3. **Automated Hourly Cron (Optional)**: Ping `/api/cron/hourly-reminders` via cron to broadcast hourly departmental reminders over Telegram.

---

## 🛡️ Health & Verification Commands

Once deployed on your VPS, you can run verification checks:
```bash
# Verify database records
psql -U postgres -d replacement_desk -c "SELECT count(*) FROM public.replacements;"

# Verify files are accessible
curl -I http://localhost:3000/api/files/replacement-files/...
```

Your app will be blazingly fast, use under 250 MB RAM, and has zero external dependencies!
