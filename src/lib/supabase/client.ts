"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Creates a browser-side Supabase client for client components.
 * Configured with publishable anonymous credentials for Realtime subscriptions and auth state.
 *
 * @throws Error if `NEXT_PUBLIC_SUPABASE_URL` or anon key are not configured.
 * @returns Initialized browser Supabase client.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured.");
  return createBrowserClient(url, key);
}
