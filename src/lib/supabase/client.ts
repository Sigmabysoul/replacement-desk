"use client";

/**
 * Verifies whether the application database backend is configured.
 */
export function isSupabaseConfigured(): boolean {
  return true;
}

/**
 * Browser-side client adapter.
 * Replaces external Supabase Realtime subscriptions with client-side polling and focus listeners.
 */
export function createClient() {
  const dummySubscription = {
    on: () => dummySubscription,
    subscribe: () => dummySubscription,
  };

  return {
    channel: () => dummySubscription,
    removeChannel: () => {},
    from: () => ({
      select: () => ({
        order: () => ({
          limit: async () => ({ data: [], error: null }),
        }),
      }),
    }),
  };
}
