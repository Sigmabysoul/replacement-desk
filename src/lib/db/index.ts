import postgres from "postgres";
import fs from "node:fs";
import path from "node:path";

function getDatabaseUrl(): string {
  // 1. Direct single DATABASE_URL (takes priority)
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // 2. Separate environment variables if provided by hosting environment
  const user = process.env.POSTGRES_USER || process.env.PGUSER || process.env.DB_USER;
  const password = process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || process.env.DB_PASSWORD;
  const host = process.env.POSTGRES_HOST || process.env.PGHOST || process.env.DB_HOST;
  const port = process.env.POSTGRES_PORT || process.env.PGPORT || process.env.DB_PORT || "5432";
  const database = process.env.POSTGRES_DB || process.env.PGDATABASE || process.env.DB_NAME;

  if (user || password || host || database) {
    const u = encodeURIComponent(user || "postgres");
    const p = password ? `:${encodeURIComponent(password)}` : "";
    const h = host || "localhost";
    const d = database || "replacement_desk";
    return `postgresql://${u}${p}@${h}:${port}/${d}`;
  }

  // 3. Fallback to local default
  return "postgresql://postgres:postgres@localhost:5432/replacement_desk";
}

const globalForDb = globalThis as unknown as {
  sql: postgres.Sql | undefined;
};

export const sql = globalForDb.sql ?? postgres(getDatabaseUrl(), {
  max: 20,
  idle_timeout: 30,
  connect_timeout: 10,
  onnotice: () => {}, // Suppress notices
  transform: {
    undefined: null,
  },
});

if (process.env.NODE_ENV !== "production") {
  globalForDb.sql = sql;
}

function findSqlFile(filename: string): string | null {
  const candidates = [
    path.resolve(process.cwd(), "db", filename),
    path.resolve(process.cwd(), "..", "db", filename),
  ];
  for (const c of candidates) {
    if (fs.existsSync(/*turbopackIgnore: true*/ c)) return c;
  }
  return null;
}

let dbReadyPromise: Promise<void> | null = null;

/**
 * Ensures that the core database tables exist.
 * If the database is completely empty (no auth.users), it automatically
 * applies db/schema.sql and db/seed-data.sql so the app is ready immediately.
 */
export async function ensureDatabaseReady(): Promise<void> {
  if (dbReadyPromise) return dbReadyPromise;

  dbReadyPromise = (async () => {
    try {
      const [tableCheck] = await sql`
        SELECT to_regclass('auth.users') as exists;
      `;

      if (!tableCheck || !tableCheck.exists) {
        console.log("[DB] Core relation 'auth.users' not found. Auto-bootstrapping schema...");
        const schemaPath = findSqlFile("schema.sql");
        if (schemaPath) {
          await sql.file(schemaPath);
          console.log("[DB] Database schema created successfully!");
        } else {
          console.warn("[DB] Could not locate db/schema.sql for automatic migration.");
        }

        const seedPath = findSqlFile("seed-data.sql");
        if (seedPath) {
          console.log("[DB] Auto-seeding existing data into database...");
          try {
            await sql.file(seedPath);
            console.log("[DB] Existing database data seeded successfully!");
          } catch (seedErr) {
            console.warn("[DB] Warning during data seed (non-fatal):", seedErr);
          }
        }
      }

      // Ensure storage schema & tables exist
      await sql.unsafe(`
        CREATE SCHEMA IF NOT EXISTS storage;
        CREATE TABLE IF NOT EXISTS storage.buckets (
          id text NOT NULL PRIMARY KEY,
          name text NOT NULL,
          owner text,
          created_at timestamp with time zone DEFAULT now(),
          updated_at timestamp with time zone DEFAULT now(),
          public boolean DEFAULT false,
          avif_autodetection boolean DEFAULT false,
          file_size_limit bigint,
          allowed_mime_types text[],
          owner_id text,
          type text DEFAULT 'STANDARD'::text,
          versioning_status text DEFAULT 'DISABLED'::text,
          lifecycle_configuration jsonb,
          lifecycle_configuration_generation bigint
        );
        CREATE TABLE IF NOT EXISTS storage.objects (
          id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
          bucket_id text NOT NULL,
          name text NOT NULL,
          owner text,
          created_at timestamp with time zone DEFAULT now(),
          updated_at timestamp with time zone DEFAULT now(),
          last_accessed_at timestamp with time zone,
          metadata jsonb,
          version text,
          owner_id text,
          user_metadata jsonb,
          archived_at timestamp with time zone,
          is_delete_marker boolean DEFAULT false,
          is_versioned boolean DEFAULT false
        );
        INSERT INTO storage.buckets (id, name, public)
        VALUES ('replacement-files', 'replacement-files', false),
               ('offline-order-files', 'offline-order-files', false)
        ON CONFLICT (id) DO NOTHING;
      `).catch((e: Error) => console.warn("[DB] Storage schema ensure notice:", e.message));

      // Auto-heal missing storage.objects rows for existing attachments
      await sql`
        INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata, created_at, updated_at)
        SELECT
          gen_random_uuid(),
          'replacement-files',
          a.storage_path,
          a.uploaded_by::text,
          a.uploaded_by::text,
          jsonb_build_object('mimetype', a.mime_type),
          a.created_at,
          a.created_at
        FROM public.attachments a
        WHERE a.storage_path IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM storage.objects s
            WHERE s.bucket_id = 'replacement-files' AND s.name = a.storage_path
          );
      `.catch(() => {});

      await sql`
        INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id, metadata, created_at, updated_at)
        SELECT
          gen_random_uuid(),
          'offline-order-files',
          o.storage_path,
          o.uploaded_by::text,
          o.uploaded_by::text,
          jsonb_build_object('mimetype', o.mime_type),
          o.created_at,
          o.created_at
        FROM public.offline_order_attachments o
        WHERE o.storage_path IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM storage.objects s
            WHERE s.bucket_id = 'offline-order-files' AND s.name = o.storage_path
          );
      `.catch(() => {});
    } catch (err) {
      console.error("[DB] Failed to auto-bootstrap database:", err);
      dbReadyPromise = null;
      throw err;
    }
  })();

  return dbReadyPromise;
}

export default sql;

