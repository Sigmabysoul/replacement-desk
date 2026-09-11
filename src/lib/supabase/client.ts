"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Verifies whether required Supabase public environment variables are present
 * and not set to dummy or template placeholder values.
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
 * Creates a browser-side Supabase client for client components.
 * Configured with publishable anonymous credentials for Realtime subscriptions and auth state.
 *
 * @throws Error if `NEXT_PUBLIC_SUPABASE_URL` or anon key are not configured.
 * @returns Initialized browser Supabase client.
 */
export function createClient() {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!;
  return createBrowserClient(url, key);
}
