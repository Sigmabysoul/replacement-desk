import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { sql } from "@/lib/db";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/auth-service";
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

    const profile = rows[0] as Profile;
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

/**
 * Extracts all effective roles for a user profile, falling back to the primary role.
 */
export function getProfileRoles(profile: Profile): Role[] {
  if (profile.roles && profile.roles.length > 0) {
    return profile.roles;
  }
  return profile.role ? [profile.role] : [];
}

/**
 * Checks if a profile has a given role (or is an ADMIN).
 */
export function hasRole(profile: Profile, role: Role): boolean {
  const roles = getProfileRoles(profile);
  return roles.includes("ADMIN") || roles.includes(role);
}

/**
 * Checks if a profile has ANY of the given roles (or is an ADMIN).
 */
export function hasAnyRole(profile: Profile, targetRoles: readonly Role[]): boolean {
  const roles = getProfileRoles(profile);
  return roles.includes("ADMIN") || targetRoles.some((r) => roles.includes(r));
}

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
