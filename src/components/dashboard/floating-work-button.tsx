"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Boxes,
  Camera,
  CheckCircle2,
  ChevronRight,
  FileCheck,
  PackageCheck,
  Printer,
  Radar,
  ScanLine,
  Truck,
  X,
  Zap,
} from "lucide-react";
import type { OfflineOrder, Replacement, Role } from "@/lib/types";

interface WorkQueueItem {
  id: string;
  role: Role;
  title: string;
  description: string;
  count: number;
  href: string;
  icon: typeof Truck;
  tone: string;
}

export function FloatingWorkButton({
  roles,
  primaryRole,
  replacements,
  offlineOrders,
}: {
  roles: Role[];
  primaryRole: Role;
  replacements: Replacement[];
  offlineOrders: OfflineOrder[];
}) {
  const [open, setOpen] = useState(false);

  const queues: WorkQueueItem[] = useMemo(() => {
    const list: WorkQueueItem[] = [];
    const hasRole = (r: Role) => roles.includes("ADMIN") || roles.includes(r);

    if (hasRole("LOGISTICS")) {
      const awaitingLabels = replacements.filter((r) => r.status === "NEW").length;
      list.push({
        id: "logistics-labels",
        role: "LOGISTICS",
        title: "Logistics: Add Shipping Labels",
        description: "New replacements awaiting labels & tracking",
        count: awaitingLabels,
        href: "/replacements?scope=all&status=AWAITING_LOGISTICS",
        icon: PackageCheck,
        tone: "bg-indigo-600 text-white",
      });

      const inTransit = replacements.filter((r) => r.status === "SHIPPED").length;
      list.push({
        id: "logistics-tracking",
        role: "LOGISTICS",
        title: "Logistics: In-Transit Tracking",
        description: "Track shipments and confirm delivery",
        count: inTransit,
        href: "/tracking",
        icon: Radar,
        tone: "bg-sky-600 text-white",
      });
    }

    if (hasRole("PRINTING")) {
      const printOffline = offlineOrders.filter((o) => o.status === "DISPATCH_PREPARED").length;
      list.push({
        id: "printing-offline",
        role: "PRINTING",
        title: "Printing: Offline Orders",
        description: "Orders awaiting label & document printing",
        count: printOffline,
        href: "/offline-orders?status=DISPATCH_PREPARED",
        icon: Printer,
        tone: "bg-fuchsia-600 text-white",
      });

      const printReplacements = replacements.filter((r) => r.status === "LABEL_UPLOADED").length;
      list.push({
        id: "printing-replacements",
        role: "PRINTING",
        title: "Printing: Replacement Labels",
        description: "Labels ready to print & stick",
        count: printReplacements,
        href: "/replacements?scope=all&status=LABEL_UPLOADED",
        icon: Printer,
        tone: "bg-violet-600 text-white",
      });
    }

    if (hasRole("PACKING")) {
      const readyToPack = replacements.filter((r) => r.status === "QC_APPROVED").length;
      list.push({
        id: "packing-ready",
        role: "PACKING",
        title: "Packing: Approved Orders",
        description: "Pack orders and prepare for dispatch",
        count: readyToPack,
        href: "/replacements?status=QC_APPROVED",
        icon: Camera,
        tone: "bg-emerald-600 text-white",
      });

      const readyToDispatch = replacements.filter((r) => r.status === "PACKED" || r.status === "NEEDS_TOKEN").length;
      list.push({
        id: "packing-dispatch",
        role: "PACKING",
        title: "Packing: Dispatch Pickup",
        description: "Packed boxes waiting for courier collection",
        count: readyToDispatch,
        href: "/dispatch",
        icon: Truck,
        tone: "bg-cyan-600 text-white",
      });
    }

    if (hasRole("CONSIGNMENT")) {
      const awaitPacking = offlineOrders.filter((o) => o.status === "CREATED").length;
      list.push({
        id: "consignment-packing",
        role: "CONSIGNMENT",
        title: "Consignment: Confirm Packing",
        description: "Set carton count, dimensions & weight",
        count: awaitPacking,
        href: "/offline-orders?status=CREATED",
        icon: PackageCheck,
        tone: "bg-amber-600 text-white",
      });

      const awaitPickup = offlineOrders.filter((o) => o.status === "PRINTED").length;
      list.push({
        id: "consignment-pickup",
        role: "CONSIGNMENT",
        title: "Consignment: Courier Pickup",
        description: "Confirm boxes collected by courier",
        count: awaitPickup,
        href: "/offline-orders?status=PRINTED",
        icon: CheckCircle2,
        tone: "bg-cyan-600 text-white",
      });
    }

    if (hasRole("HR")) {
      const awaitDispatch = offlineOrders.filter((o) => o.status === "PACKING_CONFIRMED").length;
      list.push({
        id: "hr-dispatch",
        role: "HR",
        title: "HR: Dispatch & Photos",
        description: "Attach LR, courier link & upload box photos",
        count: awaitDispatch,
        href: "/offline-orders?status=PACKING_CONFIRMED",
        icon: Truck,
        tone: "bg-amber-600 text-white",
      });

      const awaitDelivery = offlineOrders.filter((o) => o.status === "PICKED_UP").length;
      list.push({
        id: "hr-delivery",
        role: "HR",
        title: "HR: Delivery & POD",
        description: "Confirm client delivery with POD photos",
        count: awaitDelivery,
        href: "/offline-orders?status=PICKED_UP",
        icon: FileCheck,
        tone: "bg-emerald-600 text-white",
      });
    }

    if (hasRole("CUSTOMER_SUPPORT")) {
      const qcPending = replacements.filter((r) => r.status === "QC_PENDING").length;
      list.push({
        id: "cs-qc",
        role: "CUSTOMER_SUPPORT",
        title: "Support: QC Review",
        description: "Review packing quality photos",
        count: qcPending,
        href: "/replacements?status=QC_PENDING",
        icon: ScanLine,
        tone: "bg-amber-600 text-white",
      });
    }

    if (hasRole("BOSS")) {
      const awaitAck = offlineOrders.filter((o) => o.status === "DELIVERED").length;
      list.push({
        id: "boss-ack",
        role: "BOSS",
        title: "Boss: Acknowledge Deliveries",
        description: "Review completed shipments & archive",
        count: awaitAck,
        href: "/offline-orders?status=DELIVERED",
        icon: Boxes,
        tone: "bg-slate-900 text-white",
      });
    }

    if (primaryRole) {
      list.sort((a, b) => (a.role === primaryRole ? -1 : b.role === primaryRole ? 1 : 0));
    }

    return list;
  }, [roles, primaryRole, replacements, offlineOrders]);

  const totalPending = queues.reduce((sum, q) => sum + q.count, 0);

  return (
    <>
      {/* Floating Action Button */}
      <div className="fixed bottom-20 right-4 z-40 lg:bottom-6 lg:right-6">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="group relative flex size-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-2xl shadow-indigo-600/40 transition hover:scale-105 hover:bg-indigo-700 active:scale-95 focus:outline-none focus:ring-4 focus:ring-indigo-300"
          aria-label="My Work Tasks"
        >
          {open ? (
            <X className="size-6 transition" />
          ) : (
            <Zap className="size-6 transition group-hover:scale-110" />
          )}

          {/* Pending items badge */}
          {totalPending > 0 && !open && (
            <span className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full bg-rose-500 font-black text-[11px] text-white shadow-md ring-2 ring-white animate-pulse">
              {totalPending}
            </span>
          )}

          {/* Tooltip on hover */}
          <span className="pointer-events-none absolute right-full mr-3 hidden whitespace-nowrap rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white shadow-lg lg:group-hover:inline-block">
            {totalPending > 0 ? `${totalPending} tasks waiting for you` : "Your Work Queues"}
          </span>
        </button>
      </div>

      {/* Popover Menu for Work Queues */}
      {open && (
        <>
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-xs transition-opacity"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer / Modal Panel */}
          <div className="fixed bottom-36 right-4 z-50 w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl ring-1 ring-slate-900/10 sm:right-6 lg:bottom-22">
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-indigo-700">
                  Quick Navigation
                </p>
                <h3 className="text-base font-black text-slate-950">Your Work Queues</h3>
              </div>
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-black text-indigo-700">
                {totalPending} pending
              </span>
            </div>

            <div className="grid max-h-[60vh] gap-2 overflow-y-auto pr-1">
              {queues.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 transition hover:border-indigo-200 hover:bg-indigo-50/50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${item.tone} shadow-xs`}>
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-slate-900 group-hover:text-indigo-700">
                          {item.title}
                        </p>
                        <p className="truncate text-[11px] text-slate-500">
                          {item.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.count > 0 ? (
                        <span className="rounded-md bg-indigo-600 px-2 py-0.5 text-xs font-black text-white">
                          {item.count}
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold text-slate-400">0</span>
                      )}
                      <ChevronRight className="size-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-600" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
