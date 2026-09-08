import Link from "next/link";
import { LogOut, Settings, UserRound } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import type { Profile } from "@/lib/types";

export function AppHeader({ profile }: { profile: Profile }) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-[#f5f7fb]/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="lg:hidden">
          <strong className="text-base tracking-tight text-slate-950">Replacement Desk</strong>
        </div>
        <div className="hidden lg:block">
          <p className="text-sm font-semibold text-slate-500">Internal operations</p>
        </div>
        <div className="flex items-center gap-2">
          {profile.role === "ADMIN" && (
            <Link
              href="/admin/settings"
              className="grid size-9 place-items-center rounded-xl text-slate-600 hover:bg-white lg:hidden"
              aria-label="Settings"
            >
              <Settings className="size-4.5" />
            </Link>
          )}
          <Link
            href="/profile"
            className="flex min-h-11 items-center gap-2 rounded-xl px-2.5 text-sm font-semibold text-slate-700 hover:bg-white"
          >
            <span className="grid size-8 place-items-center rounded-full bg-indigo-100 text-indigo-700">
              <UserRound className="size-4" />
            </span>
            <span className="hidden sm:block">{profile.full_name}</span>
          </Link>
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="icon" aria-label="Sign out">
              <LogOut className="size-5" />
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
