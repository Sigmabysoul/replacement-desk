import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Profile, Role } from "@/lib/types";

/**
 * Retrieves the currently authenticated user's profile record from Supabase or local demo session.
 *
 * Uses `React.cache()` to memoize the profile lookup per incoming server request,
 * preventing duplicate network roundtrips when called across multiple server components
 * and action guards in the same render tree.
 *
 * @returns The active user `Profile` if authenticated, or `null` if unauthenticated or Supabase is unconfigured.
 */
export const getSessionProfile = cache(async (): Promise<Profile | null> => {
  const cookieStore = await cookies();
  const demoRole = cookieStore.get("rd_demo_role")?.value as Role | undefined;

  if (demoRole && ["ADMIN", "ESHA", "PRINTING", "PACKING"].includes(demoRole)) {
    const roleNames: Record<Role, string> = {
      ADMIN: "Alex Admin",
      ESHA: "Esha (Operations)",
      PRINTING: "Pat Printing",
      PACKING: "Sam Packing",
    };
    return {
      id: `demo-${demoRole.toLowerCase()}-id`,
      full_name: roleNames[demoRole] || `Demo ${demoRole}`,
      role: demoRole,
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  if (!isSupabaseConfigured()) return null;

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
 * Route / action guard that enforces authentication, account activity, and optional role checks.
 *
 * Behavior:
 * - Redirects to `/login` if no authenticated session exists.
 * - Redirects to `/login?error=inactive` if the user's profile is deactivated (`active === false`).
 * - Redirects to `/` if `allowedRoles` is specified and the user's role is not included.
 *
 * @param allowedRoles Optional list of roles permitted to execute this action / view this page.
 * @returns The authenticated and verified user `Profile`.
 */
export async function requireProfile(allowedRoles?: readonly Role[]) {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  if (!profile.active) redirect("/login?error=inactive");
  if (allowedRoles && !allowedRoles.includes(profile.role)) redirect("/");
  return profile;
}

