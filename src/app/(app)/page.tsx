import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  CirclePlus,
  Clock3,
  PackageCheck,
  Printer,
  ScanLine,
  Truck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { ReplacementCard } from "@/components/replacements/replacement-card";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Replacement, ReplacementStatus } from "@/lib/types";

const metrics: {
  label: string;
  statuses: ReplacementStatus[];
  icon: typeof Clock3;
  tone: string;
  href: string;
}[] = [
  {
    label: "New",
    statuses: ["NEW"],
    icon: CirclePlus,
    tone: "bg-blue-50 text-blue-700",
    href: "/replacements?status=NEW",
  },
  {
    label: "Waiting for printing",
    statuses: ["NEW"],
    icon: Printer,
    tone: "bg-indigo-50 text-indigo-700",
    href: "/replacements?status=NEW",
  },
  {
    label: "Waiting for QC",
    statuses: ["LABEL_PRINTED", "QC_PENDING"],
    icon: ScanLine,
    tone: "bg-amber-50 text-amber-800",
    href: "/replacements?status=QC_PENDING",
  },
  {
    label: "QC rejected",
    statuses: ["QC_REJECTED"],
    icon: AlertTriangle,
    tone: "bg-rose-50 text-rose-700",
    href: "/replacements?status=QC_REJECTED",
  },
  {
    label: "Ready to pack",
    statuses: ["QC_APPROVED"],
    icon: CheckCircle2,
    tone: "bg-emerald-50 text-emerald-700",
    href: "/replacements?status=QC_APPROVED",
  },
  {
    label: "Packed",
    statuses: ["PACKED"],
    icon: PackageCheck,
    tone: "bg-cyan-50 text-cyan-800",
    href: "/replacements?status=PACKED",
  },
  {
    label: "Needs token",
    statuses: ["NEEDS_TOKEN"],
    icon: Clock3,
    tone: "bg-orange-50 text-orange-800",
    href: "/replacements?status=NEEDS_TOKEN",
  },
  {
    label: "Shipped recently",
    statuses: ["SHIPPED"],
    icon: Truck,
    tone: "bg-slate-100 text-slate-700",
    href: "/replacements?status=SHIPPED",
  },
];

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("replacements")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(40);
  const replacements = (data ?? []) as Replacement[];

  return (
    <div className="grid gap-6 sm:gap-8">
      <section className="flex flex-col gap-4 rounded-3xl border border-border/80 bg-card p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--brand)]">Today&apos;s work</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
            Good {new Date().getHours() < 12 ? "morning" : "afternoon"}, {profile.full_name.split(" ")[0]}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">See what needs attention across replacement orders.</p>
        </div>
        {["ESHA", "ADMIN"].includes(profile.role) && (
          <Link
            href="/replacements/new"
            className="hidden min-h-12 items-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-bold text-white shadow-lg shadow-[var(--brand)]/20 transition hover:-translate-y-0.5 hover:brightness-95 sm:flex"
          >
            <CirclePlus className="size-5" />
            New replacement
          </Link>
        )}
      </section>

      {error && (
        <Card className="border-rose-200 bg-rose-50 p-4 text-rose-900">
          Could not load the dashboard. Try refreshing.
        </Card>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {metrics.map(({ label, statuses, icon: Icon, tone, href }) => {
          const count = replacements.filter((item) => statuses.includes(item.status)).length;
          return (
            <Link
              key={label}
              href={href}
              className="group block transition hover:scale-[1.01]"
              aria-label={`${label}: ${count} replacements`}
            >
              <Card className="h-full p-4 transition group-hover:border-indigo-300 group-hover:shadow-sm">
                <span className={`grid size-9 place-items-center rounded-xl ${tone}`}>
                  <Icon className="size-5" />
                </span>
                <strong className="mt-4 block text-3xl font-black tracking-tight text-slate-950">
                  {count}
                </strong>
                <span className="text-sm font-semibold text-slate-600 group-hover:text-indigo-700">
                  {label}
                </span>
              </Card>
            </Link>
          );
        })}
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-950">Recent replacements</h2>
          <Link href="/replacements" className="text-sm font-bold text-indigo-700 hover:text-indigo-900">
            View all
          </Link>
        </div>
        {replacements.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {replacements.slice(0, 6).map((replacement) => (
              <ReplacementCard key={replacement.id} replacement={replacement} role={profile.role} />
            ))}
          </div>
        ) : (
          <Card className="grid place-items-center p-10 text-center">
            <Truck className="size-10 text-slate-300" />
            <h3 className="mt-3 font-bold text-slate-800">No replacement requests yet</h3>
            <p className="mt-1 text-sm text-slate-500">New requests will appear here.</p>
          </Card>
        )}
      </section>

      {profile.role === "PRINTING" && (
        <Link
          href="/replacements?status=NEW"
          className="fixed bottom-20 right-4 grid size-14 place-items-center rounded-2xl bg-indigo-600 text-white shadow-xl hover:bg-indigo-700 lg:bottom-6"
          aria-label="Open pending labels"
        >
          <Printer className="size-6" />
        </Link>
      )}
    </div>
  );
}
