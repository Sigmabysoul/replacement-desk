import postgres from "postgres";

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  // Fallback to local default if not set
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

