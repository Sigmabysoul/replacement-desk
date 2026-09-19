import type { OfflineOrder, Replacement } from "@/lib/types";

interface CachedDashboardData {
  replacements: Replacement[];
  offlineOrders: OfflineOrder[];
  replacementError: unknown;
  offlineError: unknown;
  expiresAt: number;
}

const cachedDashboards = new Map<string, CachedDashboardData>();
const MAX_CACHED_PROFILES = 50;

function pruneDashboardCache(now: number) {
  for (const [profileId, entry] of cachedDashboards) {
    if (entry.expiresAt <= now) cachedDashboards.delete(profileId);
  }

  while (cachedDashboards.size >= MAX_CACHED_PROFILES) {
    const oldestProfileId = cachedDashboards.keys().next().value;
    if (!oldestProfileId) break;
    cachedDashboards.delete(oldestProfileId);
  }
}

/**
 * Returns cached dashboard records if still within their short TTL.
 * Eliminates redundant Supabase network roundtrips during rapid page transitions.
 */
export function getCachedDashboardData(profileId: string): CachedDashboardData | null {
  const cachedDashboard = cachedDashboards.get(profileId);
  if (cachedDashboard && cachedDashboard.expiresAt > Date.now()) {
    return cachedDashboard;
  }

  cachedDashboards.delete(profileId);
  return null;
}

/**
 * Caches dashboard query results for a short duration (default 12 seconds).
 */
export function setCachedDashboardData(
  profileId: string,
  data: Omit<CachedDashboardData, "expiresAt">,
  ttlMs = 12000,
) {
  pruneDashboardCache(Date.now());
  cachedDashboards.set(profileId, {
    ...data,
    expiresAt: Date.now() + ttlMs,
  });
}

/**
 * Invalidates the dashboard cache immediately so subsequent views receive fresh data.
 */
export function invalidateDashboardCache() {
  cachedDashboards.clear();
}
