"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CirclePlus, ClipboardList, LayoutDashboard, PackageCheck, Settings, Truck, Users } from "lucide-react";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
}

const mainItems: NavItem[] = [
  { href: "/", label: "Dashboard", short: "Home", icon: LayoutDashboard, roles: ["customer_support", "LOGISTICS", "PRINTING", "PACKING", "ADMIN"] },
  { href: "/replacements", label: "Replacements", short: "Orders", icon: ClipboardList, roles: ["customer_support", "LOGISTICS", "PRINTING", "PACKING", "ADMIN"] },
  { href: "/replacements/new", label: "New replacement", short: "New", icon: CirclePlus, roles: ["customer_support", "ADMIN"] },
  { href: "/dispatch", label: "Dispatch", short: "Dispatch", icon: Truck, roles: ["PACKING", "ADMIN"] },
  { href: "/profile", label: "Profile", short: "Profile", icon: Users, roles: ["customer_support", "LOGISTICS", "PRINTING", "PACKING", "ADMIN"] },
];

export function Navigation({ role }: { role: Role }) {
  const pathname = usePathname();
  const operationalItems = mainItems.filter((item) => item.roles.includes(role));
  const adminItems = role === "ADMIN" ? [
    { href: "/admin/users", label: "Users", icon: Users },
    { href: "/admin/settings", label: "Settings", icon: Settings },
  ] : [];

  const mobileItems = role === "ADMIN"
    ? [
        { href: "/", short: "Home", icon: LayoutDashboard },
        { href: "/replacements", short: "Orders", icon: ClipboardList },
        { href: "/replacements/new", short: "New", icon: CirclePlus },
        { href: "/dispatch", short: "Dispatch", icon: Truck },
        { href: "/admin/users", short: "Users", icon: Users },
      ]
    : operationalItems.map((item) => ({
        href: item.href,
        short: item.short,
        icon: item.icon,
      }));

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-800 bg-slate-950 px-4 py-5 text-white lg:flex">
        <Link href="/" className="mb-8 flex items-center gap-3 px-2">
          <span className="grid size-10 place-items-center rounded-xl bg-indigo-600 shadow-md shadow-indigo-600/20">
            <PackageCheck className="size-6" />
          </span>
          <span>
            <strong className="block leading-5">Replacement Desk</strong>
            <small className="text-slate-400">Operations workspace</small>
          </span>
        </Link>
        <nav className="grid gap-1" aria-label="Main navigation">
          {operationalItems.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-colors",
                  active && "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                )}
              >
                <Icon className="size-5" />
                {label}
              </Link>
            );
          })}
        </nav>

        {role === "ADMIN" && (
          <div className="mt-auto grid gap-1 border-t border-slate-800 pt-3">
            <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Admin
            </p>
            {adminItems.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-colors",
                    active && "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                  )}
                >
                  <Icon className="size-5" />
                  {label}
                </Link>
              );
            })}
          </div>
        )}
      </aside>

      {/* Solid opaque mobile bottom navigation bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid border-t border-border bg-card px-1.5 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-4px_25px_rgba(15,23,42,0.08)] lg:hidden"
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
                "relative flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl text-[11px] transition-colors active:scale-95",
                active
                  ? "text-indigo-600 font-extrabold"
                  : "text-slate-500 hover:text-slate-900 font-medium"
              )}
            >
              <span
                className={cn(
                  "flex items-center justify-center rounded-full px-3.5 py-1 transition-all",
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
