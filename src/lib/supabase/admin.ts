import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Creates a privileged Supabase client authenticated with the backend Service Role key.
 *
 * CAUTION: Bypasses all PostgreSQL Row-Level Security (RLS) policies.
 * Must only be invoked in secure server-only contexts (e.g. user administration,
 * background notification logs, or cascading order deletions).
 *
 * @throws Error if `SUPABASE_SERVICE_ROLE_KEY` is not configured.
 * @returns Privileged Supabase client without session persistence.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin credentials are not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
