import type { Profile, Role } from "@/lib/types";

/**
 * Normalizes roles to a guaranteed array of Role strings.
 * Handles PostgreSQL text array strings like "{ADMIN}" or "{CUSTOMER_SUPPORT,LOGISTICS,HR}"
 * as well as native JS arrays and fallbacks.
 */
export function normalizeRoles(roles: unknown, fallbackRole?: Role): Role[] {
  if (Array.isArray(roles)) {
    return roles.filter(Boolean) as Role[];
  }
  if (typeof roles === "string") {
    const trimmed = roles.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      const items = trimmed
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
      if (items.length > 0) return items as Role[];
    } else if (trimmed.length > 0) {
      return [trimmed as Role];
    }
  }
  return fallbackRole ? [fallbackRole] : [];
}

/**
 * Extracts all effective roles for a user profile, falling back to the primary role.
 */
export function getProfileRoles(profile: Profile): Role[] {
  const roles = normalizeRoles(profile.roles, profile.role);
  return roles.length > 0 ? roles : profile.role ? [profile.role] : [];
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
