import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { sendDepartmentTelegramAlert } from "@/lib/notifications/telegram";

export async function GET(request: Request) {
  return handleHourlyCheck(request);
}

export async function POST(request: Request) {
  return handleHourlyCheck(request);
}

async function handleHourlyCheck(request: Request) {
  try {
    // Optional secret check if CRON_SECRET is set
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = request.headers.get("authorization");
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // 1. Replacements pending summary
    const repCounts = await sql`
      SELECT status, count(*)::int as count
      FROM public.replacements
      WHERE archived_at IS NULL
      GROUP BY status
    `;
    const repMap: Record<string, number> = {};
    for (const r of repCounts) repMap[r.status] = Number(r.count) || 0;

    // 2. Offline orders pending summary
    const offCounts = await sql`
      SELECT status, count(*)::int as count
      FROM public.offline_orders
      GROUP BY status
    `;
    const offMap: Record<string, number> = {};
    for (const o of offCounts) offMap[o.status] = Number(o.count) || 0;

    const notificationsSent: string[] = [];

    // Check Printing
    const printingReplacements = repMap["LABEL_UPLOADED"] || 0;
    const printingOffline = offMap["DISPATCH_PREPARED"] || 0;
    if (printingReplacements > 0 || printingOffline > 0) {
      const msg = `⏰ [Hourly Reminder] PRINTING:\n• ${printingReplacements} replacement label(s) ready to print\n• ${printingOffline} offline order(s) awaiting label printing\nPlease complete your print queue!`;
      await sendDepartmentTelegramAlert("PRINTING", msg).catch(() => {});
      notificationsSent.push("PRINTING");
    }

    // Check Packing
    const readyToPack = repMap["QC_APPROVED"] || 0;
    const readyToDispatch = (repMap["PACKED"] || 0) + (repMap["NEEDS_TOKEN"] || 0);
    if (readyToPack > 0 || readyToDispatch > 0) {
      const msg = `⏰ [Hourly Reminder] PACKING:\n• ${readyToPack} QC-approved order(s) waiting to pack\n• ${readyToDispatch} packed box(es) waiting for courier pickup\nPlease complete your packing tasks!`;
      await sendDepartmentTelegramAlert("PACKING", msg).catch(() => {});
      notificationsSent.push("PACKING");
    }

    // Check Logistics
    const newReplacements = repMap["NEW"] || 0;
    if (newReplacements > 0) {
      const msg = `⏰ [Hourly Reminder] LOGISTICS:\n• ${newReplacements} new replacement(s) waiting for shipping labels & tracking!\nPlease upload labels so printing can begin.`;
      await sendDepartmentTelegramAlert("LOGISTICS", msg).catch(() => {});
      notificationsSent.push("LOGISTICS");
    }

    // Check Customer Support
    const qcPending = repMap["QC_PENDING"] || 0;
    if (qcPending > 0) {
      const msg = `⏰ [Hourly Reminder] CUSTOMER SUPPORT:\n• ${qcPending} order(s) submitted for QC approval waiting for your review!\nPlease approve or reject so packers can pack.`;
      await sendDepartmentTelegramAlert("CUSTOMER_SUPPORT", msg).catch(() => {});
      notificationsSent.push("CUSTOMER_SUPPORT");
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      pendingReplacements: repMap,
      pendingOffline: offMap,
      notificationsSent,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to run hourly check";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
