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

        -- Ensure submit_packing_qc supports multi-role users (e.g. PRINTING + PACKING)
        CREATE OR REPLACE FUNCTION public.submit_packing_qc(p_replacement_id uuid, p_submission_id uuid, p_attachments jsonb) RETURNS public.replacements
            LANGUAGE plpgsql SECURITY DEFINER
            SET search_path TO ''
            AS $qc$
        declare
          current_row public.replacements;
          actor_role public.app_role;
          next_submission integer;
          attachment_count integer := 0;
        begin
          select * into current_row from public.replacements where id = p_replacement_id for update;
          if not found then raise exception 'Replacement not found'; end if;

          select public.current_active_role() into actor_role;
          if actor_role is null or not (actor_role in ('PACKING', 'ADMIN') or public.has_any_role('PACKING', 'ADMIN')) then
            raise exception 'Only Packing can submit QC photos';
          end if;
          if current_row.status not in ('LABEL_PRINTED', 'QC_REJECTED') then
            raise exception 'QC can only be submitted after label printing or a rejection';
          end if;
          if jsonb_typeof(p_attachments) is distinct from 'array'
            or jsonb_array_length(p_attachments) not between 1 and 12 then
            raise exception 'Between one and twelve QC photos are required';
          end if;
          if not exists (
            select 1
            from public.attachments attachment
            join storage.objects stored
              on stored.bucket_id = 'replacement-files'
              and stored.name = attachment.storage_path
            where attachment.replacement_id = p_replacement_id
              and attachment.attachment_type = 'LABEL'
          ) then
            raise exception 'A stored shipping label is required before QC';
          end if;
          if (
            select count(*)
            from jsonb_to_recordset(p_attachments) as item(storage_path text)
            join storage.objects as stored
              on stored.bucket_id = 'replacement-files'
              and stored.name = item.storage_path
              and stored.owner_id = auth.uid()::text
          ) <> jsonb_array_length(p_attachments) then
            raise exception 'QC photo storage objects were not uploaded by the current user';
          end if;

          select coalesce(max(submission_number), 0) + 1
          into next_submission
          from public.qc_submissions
          where replacement_id = p_replacement_id;

          insert into public.qc_submissions(id, replacement_id, submission_number, submitted_by)
          values (p_submission_id, p_replacement_id, next_submission, auth.uid());

          insert into public.attachments(
            replacement_id, qc_submission_id, attachment_type, storage_path, file_name, mime_type, uploaded_by
          )
          select
            p_replacement_id, p_submission_id, 'QC_PHOTO', item.storage_path, item.file_name, item.mime_type, auth.uid()
          from jsonb_to_recordset(p_attachments) as item(storage_path text, file_name text, mime_type text)
          where item.mime_type in ('image/jpeg', 'image/png', 'image/webp')
            and item.storage_path like (
              'replacements/' || p_replacement_id || '/packing/' || p_submission_id || '/photos/%'
            );
          get diagnostics attachment_count = row_count;
          if attachment_count <> jsonb_array_length(p_attachments) then raise exception 'Invalid QC photo metadata'; end if;

          update public.replacements set
            status = 'QC_PENDING',
            qc_submitted_at = now()
          where id = p_replacement_id
          returning * into current_row;

          insert into public.activity_logs(replacement_id, actor_id, action, metadata)
          values (
            p_replacement_id,
            auth.uid(),
            'QC_SUBMITTED',
            jsonb_build_object('submission_id', p_submission_id, 'photo_count', attachment_count)
          );

          return current_row;
        end;
        $qc$;

        -- Update storage policy to ensure multi-role workers can upload
        DROP POLICY IF EXISTS "authorized users can upload replacement files" ON storage.objects;
        CREATE POLICY "authorized users can upload replacement files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'replacement-files'::text) AND (name ~~ 'replacements/%'::text) AND (public.has_any_role('CUSTOMER_SUPPORT'::public.app_role, 'LOGISTICS'::public.app_role, 'PACKING'::public.app_role, 'ADMIN'::public.app_role)) AND (COALESCE(((metadata ->> 'size'::text))::bigint, (0)::bigint) <= 26214400)));
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

