import Link from "next/link";
import { ArrowRight, Ruler, SlidersHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth/session";

export default async function SettingsHubPage() {
  const profile = await requireProfile(["CUSTOMER_SUPPORT", "ADMIN"]);

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <header>
        <p className="text-sm font-bold text-indigo-700">SETTINGS</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">Workspace settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage occasional configuration without crowding the daily operations menu.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/dimensions" className="group">
          <Card className="flex h-full items-start gap-4 p-5 transition hover:border-indigo-300 hover:shadow-md">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
              <Ruler className="size-5" />
            </span>
            <span className="min-w-0">
              <strong className="block text-foreground">Product dimensions</strong>
              <span className="mt-1 block text-sm leading-5 text-muted-foreground">Create, edit, or archive reusable package-size presets.</span>
            </span>
            <ArrowRight className="ml-auto mt-2 size-5 shrink-0 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-indigo-600" />
          </Card>
        </Link>

        {profile.role === "ADMIN" ? (
          <Link href="/admin/settings" className="group">
            <Card className="flex h-full items-start gap-4 p-5 transition hover:border-indigo-300 hover:shadow-md">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
                <SlidersHorizontal className="size-5" />
              </span>
              <span className="min-w-0">
                <strong className="block text-foreground">System and integrations</strong>
                <span className="mt-1 block text-sm leading-5 text-muted-foreground">Review security, Telegram configuration, and notification delivery.</span>
              </span>
              <ArrowRight className="ml-auto mt-2 size-5 shrink-0 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-indigo-600" />
            </Card>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
