import Link from "next/link";
import {
  Boxes,
  Camera,
  CheckCircle2,
  CirclePlus,
  Clock3,
  FileCheck,
  PackageCheck,
  Printer,
  Radar,
  ScanLine,
  Truck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { ReplacementCard } from "@/components/replacements/replacement-card";
import { OfflineOrderCard } from "@/components/offline-orders/offline-order-card";
import { UniversalSearch } from "@/components/dashboard/universal-search";
import { FloatingWorkButton } from "@/components/dashboard/floating-work-button";
import { hasAnyRole, requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type {
  OfflineOrder,
  OfflineOrderStatus,
  Replacement,
  ReplacementStatus,
  Role,
} from "@/lib/types";

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [
    { data: replacementData, error: replacementError },
    { data: offlineData, error: offlineError },
  ] = await Promise.all([
    supabase
      .from("replacements")
      .select("id, status, created_at, replacement_number, order_reference, order_number, brand, product_name, customer_name, customer_phone, courier_partner, tracking_id, tracking_link, archived_at, notes, qc_notes")
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("offline_orders")
      .select("id, status, created_at, so_number, order_number, brand, product_name, quantity, unit, logistics_partner, tracking_url, tracking_id, carton_count, carton_dimensions, carton_weight_kg, dispatch_date, notes, created_by")
      .order("created_at", { ascending: false })
      .limit(60),
  ]);

  const replacements = (replacementData ?? []) as unknown as Replacement[];
  const offlineOrders = (offlineData ?? []) as unknown as OfflineOrder[];

  const userRoles = profile.roles?.length ? profile.roles : [profile.role];
  const priorityOrder: Role[] = [
    "ADMIN",
    "BOSS",
    "CONSIGNMENT",
    "HR",
    "LOGISTICS",
    "CUSTOMER_SUPPORT",
    "PRINTING",
    "PACKING",
  ];
  const primaryRole =
    priorityOrder.find((r) => userRoles.includes(r)) ?? userRoles[0] ?? profile.role;

  // Replacement Metrics with high-contrast, theme-aware accent colors
  const replacementMetrics: {
    label: string;
    count: number;
    statuses: ReplacementStatus[];
    icon: typeof Clock3;
    tone: string;
    href: string;
  }[] = [
    {
      label: "Awaiting logistics",
      count: replacements.filter((r) => r.status === "NEW").length,
      statuses: ["NEW"],
      icon: PackageCheck,
      tone: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-1 dark:ring-blue-800/60",
      href: "/replacements?scope=all&status=AWAITING_LOGISTICS",
    },
    {
      label: "Awaiting printing",
      count: replacements.filter((r) => r.status === "LABEL_UPLOADED").length,
      statuses: ["LABEL_UPLOADED"],
      icon: Printer,
      tone: "bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950/60 dark:text-fuchsia-300 dark:ring-1 dark:ring-fuchsia-800/60",
      href: "/replacements?scope=all&status=LABEL_UPLOADED",
    },
    {
      label: "QC review pending",
      count: replacements.filter((r) => r.status === "QC_PENDING").length,
      statuses: ["QC_PENDING"],
      icon: ScanLine,
      tone: "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-1 dark:ring-amber-800/60",
      href: "/replacements?status=QC_PENDING",
    },
    {
      label: "Ready to pack",
      count: replacements.filter((r) => r.status === "QC_APPROVED").length,
      statuses: ["QC_APPROVED"],
      icon: Camera,
      tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-1 dark:ring-emerald-800/60",
      href: "/replacements?status=QC_APPROVED",
    },
    {
      label: "In transit tracking",
      count: replacements.filter((r) => r.status === "SHIPPED").length,
      statuses: ["SHIPPED"],
      icon: Radar,
      tone: "bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 dark:ring-1 dark:ring-sky-800/60",
      href: "/tracking",
    },
    {
      label: "Delivered",
      count: replacements.filter((r) => r.status === "DELIVERED").length,
      statuses: ["DELIVERED"],
      icon: CheckCircle2,
      tone: "bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 dark:ring-1 dark:ring-teal-800/60",
      href: "/replacements?status=DELIVERED",
    },
  ];

  // Offline Orders Metrics with high-contrast, theme-aware accent colors
  const offlineMetrics: {
    label: string;
    count: number;
    statuses: OfflineOrderStatus[];
    icon: typeof Boxes;
    tone: string;
    href: string;
  }[] = [
    {
      label: "New: Awaiting packing",
      count: offlineOrders.filter((o) => o.status === "CREATED").length,
      statuses: ["CREATED"],
      icon: PackageCheck,
      tone: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 dark:ring-1 dark:ring-indigo-800/60",
      href: "/offline-orders?status=CREATED",
    },
    {
      label: "Awaiting dispatch & photos",
      count: offlineOrders.filter((o) => o.status === "PACKING_CONFIRMED").length,
      statuses: ["PACKING_CONFIRMED"],
      icon: Camera,
      tone: "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-1 dark:ring-amber-800/60",
      href: "/offline-orders?status=PACKING_CONFIRMED",
    },
    {
      label: "Ready to print labels",
      count: offlineOrders.filter((o) => o.status === "DISPATCH_PREPARED").length,
      statuses: ["DISPATCH_PREPARED"],
      icon: Printer,
      tone: "bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950/60 dark:text-fuchsia-300 dark:ring-1 dark:ring-fuchsia-800/60",
      href: "/offline-orders?status=DISPATCH_PREPARED",
    },
    {
      label: "Awaiting courier pickup",
      count: offlineOrders.filter((o) => o.status === "PRINTED").length,
      statuses: ["PRINTED"],
      icon: Truck,
      tone: "bg-cyan-50 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 dark:ring-1 dark:ring-cyan-800/60",
      href: "/offline-orders?status=PRINTED",
    },
    {
      label: "In transit: Awaiting POD",
      count: offlineOrders.filter((o) => o.status === "PICKED_UP").length,
      statuses: ["PICKED_UP"],
      icon: FileCheck,
      tone: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-1 dark:ring-emerald-800/60",
      href: "/offline-orders?status=PICKED_UP",
    },
    {
      label: "Delivered: Await ack",
      count: offlineOrders.filter((o) => o.status === "DELIVERED").length,
      statuses: ["DELIVERED"],
      icon: CheckCircle2,
      tone: "bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 dark:ring-1 dark:ring-teal-800/60",
      href: "/offline-orders?status=DELIVERED",
    },
  ];

  return (
    <div className="grid gap-5 sm:gap-8">
      {/* 1. Hero Header */}
      <section className="flex flex-col gap-4 rounded-3xl border border-border/80 bg-card p-4 shadow-xs sm:flex-row sm:items-end sm:justify-between sm:p-6 text-card-foreground">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-400">
              Operations Center
            </span>
            <span className="text-muted-foreground/60">·</span>
            <div className="flex flex-wrap gap-1">
              {userRoles.map((r) => (
                <span
                  key={r}
                  className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300 dark:ring-1 dark:ring-indigo-800/60"
                >
                  {r}
                </span>
              ))}
            </div>
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
            Good {new Date().getHours() < 12 ? "morning" : "afternoon"},{" "}
            {profile.full_name.split(" ")[0]}
          </h1>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground sm:text-sm">
            Overview of both Replacement orders and Offline orders with real-time queues.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {hasAnyRole(profile, ["BOSS", "ADMIN"]) && (
            <Link
              href="/offline-orders/new"
              className="flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              <Boxes className="size-4" />
              New Offline Order
            </Link>
          )}

          {hasAnyRole(profile, ["CUSTOMER_SUPPORT", "ADMIN"]) && (
            <Link
              href="/replacements/new"
              className="flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700"
            >
              <CirclePlus className="size-4" />
              New Replacement
            </Link>
          )}
        </div>
      </section>

      {/* 2. Universal Search Bar */}
      <section>
        <UniversalSearch replacements={replacements} offlineOrders={offlineOrders} />
      </section>

      {/* Error notices if any */}
      {(replacementError || offlineError) && (
        <Card className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
          Some orders could not be refreshed from database. Try reloading the page.
        </Card>
      )}

      {/* 3. Dual Pipeline Overview */}
      <div className="grid gap-5 sm:gap-7 lg:grid-cols-2">
        {/* Offline Orders Pipeline */}
        <div className="rounded-3xl border border-border bg-card p-4 shadow-xs sm:p-6 text-card-foreground">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-slate-900 text-white dark:bg-indigo-600">
                <Boxes className="size-4" />
              </span>
              <div>
                <h2 className="text-base font-black text-foreground">Offline Orders Pipeline</h2>
                <p className="text-[11px] text-muted-foreground">Cartons, Logistics & Storehouse flow</p>
              </div>
            </div>
            <Link
              href="/offline-orders"
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              View All ({offlineOrders.length})
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {offlineMetrics.map((metric) => (
              <Link
                key={metric.label}
                href={metric.href}
                className="group flex flex-col justify-between rounded-2xl border border-border/80 bg-card/70 dark:bg-muted/35 p-3 transition hover:border-indigo-400/50 hover:bg-indigo-50/50 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-950/40"
              >
                <div className="flex items-center justify-between">
                  <span className={`grid size-7 place-items-center rounded-lg ${metric.tone}`}>
                    <metric.icon className="size-3.5" />
                  </span>
                  <strong className="text-xl font-black text-foreground">{metric.count}</strong>
                </div>
                <span className="mt-2 text-[11px] font-bold leading-tight text-muted-foreground group-hover:text-foreground">
                  {metric.label}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Replacement Orders Pipeline */}
        <div className="rounded-3xl border border-border bg-card p-4 shadow-xs sm:p-6 text-card-foreground">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-indigo-600 text-white">
                <Truck className="size-4" />
              </span>
              <div>
                <h2 className="text-base font-black text-foreground">Replacements Pipeline</h2>
                <p className="text-[11px] text-muted-foreground">Support, QC, Packing & Delivery flow</p>
              </div>
            </div>
            <Link
              href="/replacements"
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              View All ({replacements.length})
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {replacementMetrics.map((metric) => (
              <Link
                key={metric.label}
                href={metric.href}
                className="group flex flex-col justify-between rounded-2xl border border-border/80 bg-card/70 dark:bg-muted/35 p-3 transition hover:border-indigo-400/50 hover:bg-indigo-50/50 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-950/40"
              >
                <div className="flex items-center justify-between">
                  <span className={`grid size-7 place-items-center rounded-lg ${metric.tone}`}>
                    <metric.icon className="size-3.5" />
                  </span>
                  <strong className="text-xl font-black text-foreground">{metric.count}</strong>
                </div>
                <span className="mt-2 text-[11px] font-bold leading-tight text-muted-foreground group-hover:text-foreground">
                  {metric.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Recent Feeds Side by Side */}
      <div className="grid gap-5 sm:gap-7 lg:grid-cols-2">
        {/* Recent Offline Orders Feed */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Boxes className="size-4 text-foreground" />
              <h2 className="text-base font-black text-foreground">Recent Offline Orders</h2>
            </div>
            <Link
              href="/offline-orders"
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              View full list
            </Link>
          </div>

          {offlineOrders.length ? (
            <div className="grid gap-3">
              {offlineOrders.slice(0, 3).map((order) => (
                <OfflineOrderCard
                  key={order.id}
                  order={order}
                  role={profile.role}
                  roles={userRoles}
                />
              ))}
            </div>
          ) : (
            <Card className="grid place-items-center p-8 text-center">
              <Boxes className="size-8 text-muted-foreground/50" />
              <p className="mt-2 text-xs font-bold text-muted-foreground">No offline orders created yet</p>
            </Card>
          )}
        </section>

        {/* Recent Replacements Feed */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Truck className="size-4 text-indigo-600 dark:text-indigo-400" />
              <h2 className="text-base font-black text-foreground">Recent Replacements</h2>
            </div>
            <Link
              href="/replacements"
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              View full list
            </Link>
          </div>

          {replacements.length ? (
            <div className="grid gap-3">
              {replacements.slice(0, 3).map((replacement) => (
                <ReplacementCard
                  key={replacement.id}
                  replacement={replacement}
                  role={profile.role}
                />
              ))}
            </div>
          ) : (
            <Card className="grid place-items-center p-8 text-center">
              <Truck className="size-8 text-muted-foreground/50" />
              <p className="mt-2 text-xs font-bold text-muted-foreground">No replacement orders yet</p>
            </Card>
          )}
        </section>
      </div>

      {/* 5. Smart Floating Action Button */}
      <FloatingWorkButton
        roles={userRoles}
        primaryRole={primaryRole}
        replacements={replacements}
        offlineOrders={offlineOrders}
      />
    </div>
  );
}
