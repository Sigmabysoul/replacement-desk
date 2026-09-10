import Link from "next/link";
import { LogOut, Settings, UserRound } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ThemeButton } from "@/components/theme/theme-button";
import type { Profile } from "@/lib/types";

export function AppHeader({ profile }: { profile: Profile }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border/80 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <div className="min-w-0 lg:hidden">
          <strong className="block truncate text-base tracking-tight text-foreground">Replacement Desk</strong>
          <span className="block text-[11px] font-medium text-muted-foreground">Operations workspace</span>
        </div>
        <div className="hidden lg:block">
          <p className="text-sm font-semibold text-muted-foreground">Internal operations</p>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <ThemeButton />
          <NotificationBell role={profile.role} />
          {profile.role === "ADMIN" && (
            <Link
              href="/admin/settings"
              className="grid size-10 place-items-center rounded-xl text-slate-600 hover:bg-white lg:hidden"
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
