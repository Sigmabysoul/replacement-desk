import postgres from "postgres";

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

export default sql;

