"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  PackageCheck,
  Radar,
  Settings,
  Truck,
  UserRound,
  Users,
} from "lucide-react";
import { logoutAction } from "@/app/actions";
import type { Profile, Role } from "@/lib/types";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
}

const ALL_ROLES: Role[] = [
  "CUSTOMER_SUPPORT",
  "LOGISTICS",
  "PRINTING",
  "PACKING",
  "ADMIN",
  "BOSS",
  "HR",
  "CONSIGNMENT",
];

// Operational workflow items only (Settings & Profile moved below user section)
const operationalNavItems: NavItem[] = [
  { href: "/", label: "Dashboard", short: "Home", icon: LayoutDashboard, roles: ALL_ROLES },
  { href: "/offline-orders", label: "Offline orders", short: "Offline", icon: Boxes, roles: ALL_ROLES },
  {
    href: "/replacements",
    label: "Replacements",
    short: "Orders",
    icon: ClipboardList,
    roles: ["CUSTOMER_SUPPORT", "LOGISTICS", "PRINTING", "PACKING", "ADMIN", "BOSS"],
  },
  { href: "/tracking", label: "Shipment Tracking", short: "Tracking", icon: Radar, roles: ["LOGISTICS", "ADMIN"] },
  { href: "/dispatch", label: "Dispatch", short: "Dispatch", icon: Truck, roles: ["PACKING", "ADMIN"] },
];

export function Navigation({
  profile,
  role,
  roles,
}: {
  profile?: Profile;
  role?: Role;
  roles?: Role[];
}) {
  const pathname = usePathname();
  const userRoles = roles?.length
    ? roles
    : role
    ? [role]
    : profile?.roles?.length
    ? profile.roles
    : profile?.role
    ? [profile.role]
    : [];
  const isAdmin = userRoles.includes("ADMIN");

  // Operational items filtered by user role
  const operationalItems = operationalNavItems.filter((item) =>
    isAdmin || item.roles.some((r) => userRoles.includes(r))
  );

  // Clean, responsive mobile items (max 4-5 items, prevents horizontal overflow)
  const mobileItems = [
    { href: "/", short: "Home", icon: LayoutDashboard },
    { href: "/offline-orders", short: "Offline", icon: Boxes },
    { href: "/replacements", short: "Orders", icon: ClipboardList },
    ...(userRoles.includes("LOGISTICS") || isAdmin
      ? [{ href: "/tracking", short: "Tracking", icon: Radar }]
      : userRoles.includes("PACKING")
      ? [{ href: "/dispatch", short: "Dispatch", icon: Truck }]
      : []),
    { href: "/profile", short: "Profile", icon: UserRound },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-800 bg-slate-950 px-4 py-5 text-white lg:flex">
        {/* Brand Header */}
        <Link href="/" className="mb-6 flex items-center gap-3 px-2">
          <span className="grid size-10 place-items-center rounded-xl bg-indigo-600 shadow-md shadow-indigo-600/20">
            <PackageCheck className="size-6" />
          </span>
          <div className="min-w-0">
            <strong className="block leading-5 truncate">TBC_KART</strong>
            <small className="text-slate-400 text-xs">Operations workspace</small>
          </div>
        </Link>

        {/* Operational Section */}
        <nav className="grid gap-1" aria-label="Main operational navigation">
          {operationalItems.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-colors",
                  active && "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                )}
              >
                <Icon className="size-5 shrink-0" />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom Section: User Section + Settings/Profile Below */}
        <div className="mt-auto flex flex-col gap-2 border-t border-slate-800 pt-3">
          {/* Admin: Users Management link if Admin */}
          {isAdmin && (
            <Link
              href="/admin/users"
              className={cn(
                "flex min-h-10 items-center gap-3 rounded-xl px-3 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-colors",
                pathname.startsWith("/admin/users") && "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
              )}
            >
              <Users className="size-4 shrink-0 text-slate-400" />
              <span className="truncate">Users Management</span>
            </Link>
          )}

          {/* 1. User Identity Section */}
          <div className="flex items-center gap-2.5 rounded-2xl bg-white/5 px-3 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-indigo-600 text-xs font-black text-white shadow-xs">
              {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : <UserRound className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-white">
                {profile?.full_name ?? "User"}
              </p>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {userRoles.slice(0, 2).map((r) => (
                  <span
                    key={r}
                    className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-indigo-300"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 2. Repositioned Below User Section: Profile & Settings */}
          <div className="grid gap-1">
            <Link
              href="/profile"
              className={cn(
                "flex min-h-10 items-center gap-3 rounded-xl px-3 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-colors",
                pathname.startsWith("/profile") && "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
              )}
            >
              <UserRound className="size-4 shrink-0" />
              <span className="truncate">Profile</span>
            </Link>

            <Link
              href={isAdmin ? "/admin/settings" : "/settings"}
              className={cn(
                "flex min-h-10 items-center gap-3 rounded-xl px-3 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-colors",
                (pathname.startsWith("/settings") || pathname.startsWith("/admin/settings") || pathname.startsWith("/dimensions")) && "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
              )}
            >
              <Settings className="size-4 shrink-0" />
              <span className="truncate">Settings</span>
            </Link>

            <form action={logoutAction} className="w-full">
              <button
                type="submit"
                className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors"
              >
                <LogOut className="size-4 shrink-0" />
                <span className="truncate">Sign out</span>
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Solid opaque mobile bottom navigation bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid border-t border-border bg-card px-1 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-4px_25px_rgba(15,23,42,0.08)] lg:hidden"
        style={{ gridTemplateColumns: `repeat(${mobileItems.length}, minmax(0, 1fr))` }}
        aria-label="Mobile navigation"
      >
        {mobileItems.map(({ href, short, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] transition-colors active:scale-95",
                active
                  ? "text-indigo-600 font-extrabold"
                  : "text-slate-500 hover:text-slate-900 font-medium"
              )}
            >
              <span
                className={cn(
                  "flex items-center justify-center rounded-full px-3 py-1 transition-all",
                  active
                    ? "bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200/70"
                    : "text-slate-500"
                )}
              >
                <Icon className={cn("size-5 shrink-0", active ? "stroke-[2.5]" : "stroke-2")} />
              </span>
              <span className="truncate max-w-[64px] text-center leading-none tracking-tight">{short}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
