import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Verifies whether required Supabase public environment variables are present
 * and not set to dummy or template placeholder values.
 * Used for graceful fallback during initial repository setup or local testing.
 *
 * @returns `true` if genuine URL and anon key exist; otherwise `false`.
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return false;
  if (
    url.includes("your-project") ||
    url.includes("example.com") ||
    key.includes("your-anon-key") ||
    key.includes("placeholder") ||
    !url.startsWith("http")
  ) {
    return false;
  }
  return true;
}

/**
 * Creates a server-side Supabase client bound to the current Next.js request cookie store.
 *
 * Used in Server Components, Server Actions, and Route Handlers.
 * Seamlessly extracts cookies to authenticate as the current user and enforce Postgres RLS policies.
 *
 * @throws Error if Supabase environment variables are missing.
 * @returns Initialized server Supabase client.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured. See .env.example.");

  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => {
        try {
          items.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies; proxy.ts refreshes sessions.
        }
      },
    },
  });
}
