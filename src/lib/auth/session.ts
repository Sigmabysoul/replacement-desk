import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Profile, Role } from "@/lib/types";

export const getSessionProfile = cache(async (): Promise<Profile | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return data as Profile | null;
});

export async function requireProfile(allowedRoles?: readonly Role[]) {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  if (!profile.active) redirect("/login?error=inactive");
  if (allowedRoles && !allowedRoles.includes(profile.role)) redirect("/");
  return profile;
}
