import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { sql, ensureDatabaseReady } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/auth-service";
import { normalizeRoles, hasAnyRole } from "@/lib/auth/roles";
import type { Profile, Role } from "@/lib/types";

interface CachedProfile {
  profile: Profile;
  expiresAt: number;
}

// In-memory process cache keyed by session token hash with a 300-second TTL.
const profileCache = new Map<string, CachedProfile>();

export function invalidateProfileCache(key?: string) {
  if (key) {
    profileCache.delete(key);
  } else {
    profileCache.clear();
  }
}

/**
 * Retrieves the currently authenticated user's profile record from PostgreSQL.
 *
 * Uses `React.cache()` to memoize the profile lookup per incoming server request,
 * and an in-memory process-level cache keyed by the user's auth token to prevent
 * redundant database roundtrips during client-side navigation.
 *
 * @returns The active user `Profile` if authenticated, or `null` if unauthenticated.
 */
export const getSessionProfile = cache(async (): Promise<Profile | null> => {
  if (!isSupabaseConfigured()) return null;

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionToken) return null;

  const cacheKey = createHash("sha256").update(sessionToken).digest("hex");
  const cached = profileCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.profile;
  }

  try {
    await ensureDatabaseReady().catch(() => {});
    const userId = await verifySessionToken(sessionToken);
    if (!userId) {
      profileCache.delete(cacheKey);
      return null;
    }

    const rows = await sql`
      SELECT id, full_name, role, roles, active, created_at, updated_at
      FROM public.profiles
      WHERE id = ${userId}
      LIMIT 1
    `;

    if (!rows || rows.length === 0) {
      profileCache.delete(cacheKey);
      return null;
    }

    const raw = rows[0] as unknown as {
      id: string;
      full_name: string;
      role: Role;
      roles: unknown;
      active: boolean;
      created_at: string;
      updated_at: string;
    };

    const profile: Profile = {
      ...raw,
      roles: normalizeRoles(raw.roles, raw.role),
    };

    if (profile.active) {
      profileCache.set(cacheKey, {
        profile,
        expiresAt: Date.now() + 300 * 1000,
      });
    }
    return profile;
  } catch {
    return null;
  }
});

export { normalizeRoles, getProfileRoles, hasRole, hasAnyRole } from "@/lib/auth/roles";

/**
 * Route / action guard that enforces authentication, account activity, and optional role checks.
 *
 * Behavior:
 * - Redirects to `/login` if no authenticated session exists.
 * - Redirects to `/login?error=inactive` if the user's profile is deactivated (`active === false`).
 * - Redirects to `/` if `allowedRoles` is specified and the user does not possess any of the allowed roles (nor ADMIN).
 *
 * @param allowedRoles Optional list of roles permitted to execute this action / view this page.
 * @returns The authenticated and verified user `Profile`.
 */
export async function requireProfile(allowedRoles?: readonly Role[]) {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  if (!profile.active) redirect("/login?error=inactive");
  if (allowedRoles && !hasAnyRole(profile, allowedRoles)) redirect("/");
  return profile;
}
