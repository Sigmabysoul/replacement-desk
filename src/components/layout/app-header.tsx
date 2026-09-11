import Link from "next/link";
import { LogOut, PackageCheck, Settings, UserRound } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ThemeButton } from "@/components/theme/theme-button";
import type { Profile } from "@/lib/types";

export function AppHeader({ profile }: { profile: Profile }) {
  return (
    <header className="sticky top-0 z-20 w-full border-b border-border/80 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex min-h-14 max-w-6xl items-center justify-between gap-2 px-3 sm:min-h-16 sm:px-6">
        <div className="min-w-0 flex-1 lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--brand)] text-white shadow-sm">
              <PackageCheck className="size-4" />
            </span>
            <div className="min-w-0">
              <strong className="block truncate text-sm font-bold tracking-tight text-foreground">
                Replacement Desk
              </strong>
              <span className="hidden sm:block text-[11px] font-medium text-muted-foreground truncate">
                Operations workspace
              </span>
            </div>
          </Link>
        </div>
        <div className="hidden lg:block">
          <p className="text-sm font-semibold text-muted-foreground">Internal operations</p>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <ThemeButton />
          <NotificationBell role={profile.role} />
          {profile.role === "ADMIN" && (
            <Link
              href="/admin/settings"
              className="grid size-9 place-items-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition sm:size-10 lg:hidden"
              aria-label="Settings"
            >
              <Settings className="size-4 sm:size-4.5" />
            </Link>
          )}
          <Link
            href="/profile"
            className="flex h-9 sm:min-h-11 items-center gap-1.5 rounded-xl px-1.5 sm:px-2 py-1 text-sm font-semibold text-foreground hover:bg-muted/60 transition"
            aria-label="User profile"
          >
            <span className="grid size-7 sm:size-8 shrink-0 place-items-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              <UserRound className="size-3.5 sm:size-4" />
            </span>
            <span className="hidden md:inline truncate max-w-[120px] lg:max-w-none">{profile.full_name}</span>
          </Link>
          <form action={logoutAction} className="inline-flex">
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              className="size-9 sm:size-10 text-muted-foreground hover:text-foreground"
            >
              <LogOut className="size-4 sm:size-4.5" />
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
