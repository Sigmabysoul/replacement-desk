import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Profile, Role } from "@/lib/types";

/**
 * Retrieves the currently authenticated user's profile record from Supabase.
 *
 * Uses `React.cache()` to memoize the profile lookup per incoming server request,
 * preventing duplicate network roundtrips when called across multiple server components
 * and action guards in the same render tree.
 *
 * @returns The active user `Profile` if authenticated, or `null` if unauthenticated or Supabase is unconfigured.
 */
export const getSessionProfile = cache(async (): Promise<Profile | null> => {
  if (!isSupabaseConfigured()) return null;

  const cookieStore = await cookies();
  // Check if Supabase auth cookies exist before invoking network auth
  const hasAuthCookie = cookieStore
    .getAll()
    .some((c) => c.name.includes("auth-token") || c.name.startsWith("sb-"));
  if (!hasAuthCookie) return null;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    return data as Profile | null;
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

