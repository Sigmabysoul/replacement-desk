import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSessionProfile, getProfileRoles } from "@/lib/auth/session";
import type { Role } from "@/lib/types";

export interface WorkTask {
  id: string;
  role: Role;
  title: string;
  description: string;
  count: number;
  href: string;
  urgency: "high" | "normal";
}

export async function GET() {
  const profile = await getSessionProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRoles = getProfileRoles(profile);
  const isAdmin = userRoles.includes("ADMIN");
  const hasRole = (r: Role) => isAdmin || userRoles.includes(r);

  try {
    // 1. Fetch counts of active pending replacement statuses
    const repStatusCounts = await sql`
      SELECT status, count(*)::int as count
      FROM public.replacements
      WHERE archived_at IS NULL
      GROUP BY status
    `;
    const repMap: Record<string, number> = {};
    for (const row of repStatusCounts) {
      repMap[row.status] = Number(row.count) || 0;
    }

    // 2. Fetch counts of active pending offline order statuses
    const offStatusCounts = await sql`
      SELECT status, count(*)::int as count
      FROM public.offline_orders
      GROUP BY status
    `;
    const offMap: Record<string, number> = {};
    for (const row of offStatusCounts) {
      offMap[row.status] = Number(row.count) || 0;
    }

    const tasks: WorkTask[] = [];

    // --- LOGISTICS ---
    if (hasRole("LOGISTICS")) {
      const awaitingLabels = repMap["NEW"] || 0;
      if (awaitingLabels > 0) {
        tasks.push({
          id: "logistics-labels",
          role: "LOGISTICS",
          title: "Add Shipping Labels",
          description: `${awaitingLabels} new replacement${awaitingLabels > 1 ? "s" : ""} awaiting labels & tracking`,
          count: awaitingLabels,
          href: "/replacements?scope=all&status=AWAITING_LOGISTICS",
          urgency: "high",
        });
      }

      const inTransit = repMap["SHIPPED"] || 0;
      if (inTransit > 0) {
        tasks.push({
          id: "logistics-tracking",
          role: "LOGISTICS",
          title: "In-Transit Tracking",
          description: `${inTransit} shipment${inTransit > 1 ? "s" : ""} to monitor and confirm delivery`,
          count: inTransit,
          href: "/tracking",
          urgency: "normal",
        });
      }
    }

    // --- PRINTING ---
    if (hasRole("PRINTING")) {
      const printReplacements = repMap["LABEL_UPLOADED"] || 0;
      if (printReplacements > 0) {
        tasks.push({
          id: "printing-replacements",
          role: "PRINTING",
          title: "Print Replacement Labels",
          description: `${printReplacements} shipping label${printReplacements > 1 ? "s" : ""} ready to print & stick`,
          count: printReplacements,
          href: "/replacements?scope=all&status=LABEL_UPLOADED",
          urgency: "high",
        });
      }

      const printOffline = offMap["DISPATCH_PREPARED"] || 0;
      if (printOffline > 0) {
        tasks.push({
          id: "printing-offline",
          role: "PRINTING",
          title: "Print Offline SO Labels & Docs",
          description: `${printOffline} offline order${printOffline > 1 ? "s" : ""} awaiting label printing`,
          count: printOffline,
          href: "/offline-orders?status=DISPATCH_PREPARED",
          urgency: "high",
        });
      }
    }

    // --- PACKING ---
    if (hasRole("PACKING")) {
      const readyToPack = repMap["QC_APPROVED"] || 0;
      if (readyToPack > 0) {
        tasks.push({
          id: "packing-ready",
          role: "PACKING",
          title: "Pack Approved Orders",
          description: `${readyToPack} QC-approved order${readyToPack > 1 ? "s" : ""} ready for final packing`,
          count: readyToPack,
          href: "/replacements?scope=all&status=QC_APPROVED",
          urgency: "high",
        });
      }

      const readyToDispatch = (repMap["PACKED"] || 0) + (repMap["NEEDS_TOKEN"] || 0);
      if (readyToDispatch > 0) {
        tasks.push({
          id: "packing-dispatch",
          role: "PACKING",
          title: "Dispatch Handover & Courier Pickup",
          description: `${readyToDispatch} packed box${readyToDispatch > 1 ? "es" : ""} awaiting courier pickup / token`,
          count: readyToDispatch,
          href: "/dispatch",
          urgency: "normal",
        });
      }
    }

    // --- CUSTOMER_SUPPORT ---
    if (hasRole("CUSTOMER_SUPPORT")) {
      const qcPending = repMap["QC_PENDING"] || 0;
      if (qcPending > 0) {
        tasks.push({
          id: "cs-qc",
          role: "CUSTOMER_SUPPORT",
          title: "QC Photo Review",
          description: `${qcPending} order${qcPending > 1 ? "s" : ""} awaiting quality control approval`,
          count: qcPending,
          href: "/replacements?scope=all&status=QC_PENDING",
          urgency: "high",
        });
      }
    }

    // --- CONSIGNMENT ---
    if (hasRole("CONSIGNMENT")) {
      const awaitPacking = offMap["CREATED"] || 0;
      if (awaitPacking > 0) {
        tasks.push({
          id: "consignment-packing",
          role: "CONSIGNMENT",
          title: "Confirm Offline Packing",
          description: `${awaitPacking} order${awaitPacking > 1 ? "s" : ""} awaiting carton count & dimensions`,
          count: awaitPacking,
          href: "/offline-orders?status=CREATED",
          urgency: "high",
        });
      }

      const awaitPickup = offMap["PRINTED"] || 0;
      if (awaitPickup > 0) {
        tasks.push({
          id: "consignment-pickup",
          role: "CONSIGNMENT",
          title: "Courier Collection Confirmation",
          description: `${awaitPickup} order${awaitPickup > 1 ? "s" : ""} printed and waiting for courier`,
          count: awaitPickup,
          href: "/offline-orders?status=PRINTED",
          urgency: "normal",
        });
      }
    }

    // --- HR ---
    if (hasRole("HR")) {
      const awaitDispatch = offMap["PACKING_CONFIRMED"] || 0;
      if (awaitDispatch > 0) {
        tasks.push({
          id: "hr-dispatch",
          role: "HR",
          title: "Dispatch & Photo Upload",
          description: `${awaitDispatch} order${awaitDispatch > 1 ? "s" : ""} awaiting LR & box photos`,
          count: awaitDispatch,
          href: "/offline-orders?status=PACKING_CONFIRMED",
          urgency: "high",
        });
      }

      const awaitDelivery = offMap["PICKED_UP"] || 0;
      if (awaitDelivery > 0) {
        tasks.push({
          id: "hr-delivery",
          role: "HR",
          title: "Confirm Delivery & POD",
          description: `${awaitDelivery} order${awaitDelivery > 1 ? "s" : ""} awaiting client POD receipt`,
          count: awaitDelivery,
          href: "/offline-orders?status=PICKED_UP",
          urgency: "normal",
        });
      }
    }

    // --- BOSS ---
    if (hasRole("BOSS")) {
      const awaitAck = offMap["DELIVERED"] || 0;
      if (awaitAck > 0) {
        tasks.push({
          id: "boss-ack",
          role: "BOSS",
          title: "Acknowledge Delivered Orders",
          description: `${awaitAck} completed shipment${awaitAck > 1 ? "s" : ""} to review & archive`,
          count: awaitAck,
          href: "/offline-orders?status=DELIVERED",
          urgency: "normal",
        });
      }
    }

    const totalPendingCount = tasks.reduce((sum, t) => sum + t.count, 0);

    return NextResponse.json({
      userName: profile.full_name,
      userRoles,
      totalPendingCount,
      tasks,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load work queue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
