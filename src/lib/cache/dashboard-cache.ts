import type { OfflineOrder, Replacement } from "@/lib/types";

interface CachedDashboardData {
  replacements: Replacement[];
  offlineOrders: OfflineOrder[];
  replacementError: unknown;
  offlineError: unknown;
  expiresAt: number;
}

let cachedDashboard: CachedDashboardData | null = null;

/**
 * Returns cached dashboard records if still within their short TTL.
 * Eliminates redundant Supabase network roundtrips during rapid page transitions.
 */
export function getCachedDashboardData(): CachedDashboardData | null {
  if (cachedDashboard && cachedDashboard.expiresAt > Date.now()) {
    return cachedDashboard;
  }
  return null;
}

/**
 * Caches dashboard query results for a short duration (default 12 seconds).
 */
export function setCachedDashboardData(
  data: Omit<CachedDashboardData, "expiresAt">,
  ttlMs = 12000,
) {
  cachedDashboard = {
    ...data,
    expiresAt: Date.now() + ttlMs,
  };
}

/**
 * Invalidates the dashboard cache immediately so subsequent views receive fresh data.
 */
export function invalidateDashboardCache() {
  cachedDashboard = null;
}

