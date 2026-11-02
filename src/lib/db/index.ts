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
    if (fs.existsSync(c)) return c;
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

      if (tableCheck && tableCheck.exists) {
        return;
      }

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
    } catch (err) {
      console.error("[DB] Failed to auto-bootstrap database:", err);
      dbReadyPromise = null;
      throw err;
    }
  })();

  return dbReadyPromise;
}

export default sql;

