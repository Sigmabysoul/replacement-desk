import Link from "next/link";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ClipboardList,
  CirclePlus,
  Clock3,
  PackageCheck,
  Printer,
  Camera,
  ScanLine,
  Truck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { ReplacementCard } from "@/components/replacements/replacement-card";
import { OfflineOrderCard } from "@/components/offline-orders/offline-order-card";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { OfflineOrder, Replacement, ReplacementStatus } from "@/lib/types";

const metrics: {
  label: string;
  statuses: ReplacementStatus[];
  icon: typeof Clock3;
  tone: string;
  href: string;
}[] = [
  {
    label: "Awaiting logistics",
    statuses: ["NEW"],
    icon: PackageCheck,
    tone: "bg-indigo-50 text-indigo-700",
    href: "/replacements?scope=all&status=AWAITING_LOGISTICS",
  },
  {
    label: "Awaiting printing",
    statuses: ["LABEL_UPLOADED"],
    icon: Printer,
    tone: "bg-fuchsia-50 text-fuchsia-700",
    href: "/replacements?scope=all&status=LABEL_UPLOADED",
  },
  {
    label: "Awaiting Packing QC",
    statuses: ["LABEL_PRINTED"],
    icon: Camera,
    tone: "bg-violet-50 text-violet-700",
    href: "/replacements?scope=all&status=AWAITING_QC",
  },
  {
    label: "Waiting for CUSTOMER_SUPPORT review",
    statuses: ["QC_PENDING"],
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

  const [
    { data: replacementData, error: replacementError },
    { data: offlineData },
  ] = await Promise.all([
    supabase
      .from("replacements")
      .select("*")
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("offline_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const replacements = (replacementData ?? []) as Replacement[];
  const offlineOrders = (offlineData ?? []) as OfflineOrder[];

  const workShortcut = {
    CUSTOMER_SUPPORT: { href: "/replacements?scope=all&status=QC_PENDING", label: "Open QC reviews", icon: ScanLine },
    LOGISTICS: { href: "/replacements?scope=all&status=AWAITING_LOGISTICS", label: "Open orders awaiting Logistics", icon: PackageCheck },
    PRINTING: { href: "/replacements?scope=all&status=LABEL_UPLOADED", label: "Open orders awaiting Printing", icon: Printer },
    PACKING: { href: "/replacements?scope=all&status=AWAITING_QC", label: "Open orders awaiting Packing", icon: Camera },
    ADMIN: { href: "/replacements?scope=all", label: "Open all operational work", icon: ClipboardList },
    BOSS: { href: "/offline-orders", label: "Open offline orders", icon: Boxes },
    HR: { href: "/offline-orders?status=PACKING_CONFIRMED", label: "Offline orders awaiting dispatch", icon: Truck },
    CONSIGNMENT: { href: "/offline-orders?status=PRINTING_ASSIGNED", label: "Offline orders awaiting packing", icon: PackageCheck },
  }[profile.role];

  const WorkIcon = workShortcut.icon;

  return (
    <div className="grid gap-6 sm:gap-8">
      <section className="flex flex-col gap-4 rounded-3xl border border-border/80 bg-card p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--brand)]">Today&apos;s work</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
            Good {new Date().getHours() < 12 ? "morning" : "afternoon"}, {profile.full_name.split(" ")[0]}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            See what needs attention across replacement and offline orders.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {["BOSS", "ADMIN"].includes(profile.role) && (
            <Link
              href="/offline-orders/new"
              className="flex min-h-12 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 hover:bg-slate-800"
            >
              <Boxes className="size-5" />
              New offline order
            </Link>
          )}

          {["CUSTOMER_SUPPORT", "ADMIN"].includes(profile.role) && (
            <Link
              href="/replacements/new"
              className="flex min-h-12 items-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-bold text-white shadow-lg shadow-[var(--brand)]/20 transition hover:-translate-y-0.5 hover:brightness-95"
            >
              <CirclePlus className="size-5" />
              New replacement
            </Link>
          )}
        </div>
      </section>

      {replacementError && (
        <Card className="border-rose-200 bg-rose-50 p-4 text-rose-900">
          Could not load replacement orders. Try refreshing.
        </Card>
      )}

      {/* Replacement metrics */}
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

      {/* Recent offline orders section */}
      {offlineOrders.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Boxes className="size-5 text-indigo-600" />
              <h2 className="text-lg font-black text-slate-950">Recent offline orders</h2>
            </div>
            <Link href="/offline-orders" className="text-sm font-bold text-indigo-700 hover:text-indigo-900">
              View all offline
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {offlineOrders.slice(0, 4).map((order) => (
              <OfflineOrderCard key={order.id} order={order} role={profile.role} />
            ))}
          </div>
        </section>
      )}

      {/* Recent replacements */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-950">Recent replacement orders</h2>
          <Link href="/replacements" className="text-sm font-bold text-indigo-700 hover:text-indigo-900">
            View all replacements
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
            <h3 className="mt-3 font-bold text-slate-800">No replacement orders yet</h3>
            <p className="mt-1 text-sm text-slate-500">New requests will appear here.</p>
          </Card>
        )}
      </section>

      <Link
        href={workShortcut.href}
        className="fixed bottom-20 right-4 grid size-14 place-items-center rounded-2xl bg-indigo-600 text-white shadow-xl hover:bg-indigo-700 lg:bottom-6"
        aria-label={workShortcut.label}
      >
        <WorkIcon className="size-6" />
      </Link>
    </div>
  );
}
