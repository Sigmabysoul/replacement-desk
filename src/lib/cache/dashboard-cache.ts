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

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const operationalCache = new Map<string, CacheEntry<unknown>>();

/**
 * Returns cached operational list query results if still within TTL.
 */
export function getCachedOperationalData<T>(key: string): T | null {
  const entry = operationalCache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.data as T;
  }
  operationalCache.delete(key);
  return null;
}

/**
 * Caches operational list query results for a short duration (default 15 seconds).
 */
export function setCachedOperationalData<T>(key: string, data: T, ttlMs = 15000): void {
  if (operationalCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of operationalCache) {
      if (v.expiresAt <= now) operationalCache.delete(k);
    }
  }
  operationalCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/**
 * Invalidates all operational and dashboard caches immediately so subsequent views receive fresh data.
 */
export function invalidateDashboardCache() {
  cachedDashboards.clear();
  operationalCache.clear();
}
