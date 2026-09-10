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
  { href: "/", label: "Dashboard", short: "Home", icon: LayoutDashboard, roles: ["ESHA", "PRINTING", "PACKING", "ADMIN"] },
  { href: "/replacements", label: "Replacements", short: "Orders", icon: ClipboardList, roles: ["ESHA", "PRINTING", "PACKING", "ADMIN"] },
  { href: "/replacements/new", label: "New replacement", short: "New", icon: CirclePlus, roles: ["ESHA", "ADMIN"] },
  { href: "/dispatch", label: "Dispatch", short: "Dispatch", icon: Truck, roles: ["ESHA", "ADMIN"] },
  { href: "/profile", label: "Profile", short: "Profile", icon: Users, roles: ["ESHA", "PRINTING", "PACKING", "ADMIN"] },
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
            <span className="grid size-10 place-items-center rounded-xl bg-[var(--brand)] shadow-lg shadow-[var(--brand)]/25">
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
                  "flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white",
                  active && "bg-[var(--brand)] text-white shadow-lg shadow-[var(--brand)]/20"
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
                    "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white",
                    active && "bg-[var(--brand)] text-white shadow-lg shadow-[var(--brand)]/20"
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

      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid border-t border-border/80 bg-background/95 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-8px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl lg:hidden"
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
                "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-bold text-slate-500",
                active && "bg-indigo-50 text-indigo-700"
              )}
            >
              <Icon className="size-5" />
              <span>{short}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
