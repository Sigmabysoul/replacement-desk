import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  formatTelegramMessage,
  NOTIFICATION_RECIPIENTS,
  type NotificationType,
} from "@/lib/notifications/format";
import type { Replacement, Role } from "@/lib/types";

export type { NotificationType };

/**
 * Resolves Telegram chat IDs associated with a department role.
 * E.g., `TELEGRAM_ESHA_CHAT_ID`, `TELEGRAM_LOGISTICS_CHAT_ID`.
 *
 * @param role The target department role.
 * @returns Unique configured chat IDs. During cutover, both legacy operational
 * chats receive Logistics alerts until a dedicated Logistics chat is set.
 */
function chatIds(role: Role): string[] {
  if (role === "LOGISTICS") {
    const dedicated = process.env.TELEGRAM_LOGISTICS_CHAT_ID;
    if (dedicated) return [dedicated];
    return [...new Set([
      process.env.TELEGRAM_PACKING_CHAT_ID,
      process.env.TELEGRAM_PRINTING_CHAT_ID,
    ].filter((value): value is string => Boolean(value)))];
  }
  const target = process.env[`TELEGRAM_${role}_CHAT_ID`];
  return target ? [target] : [];
}

/**
 * Dispatches automated operational notifications to departmental Telegram groups.
 *
 * Workflow:
 * 1. Checks if `TELEGRAM_BOT_TOKEN` is configured; skips silently if omitted (local dev mode).
 * 2. Looks up all recipient roles mapped to the `type` event.
 * 3. Sends formatted messages with a 2-attempt retry loop on network glitches.
 * 4. Logs the delivery attempt (`SENT` or `FAILED`) into the `notifications` audit table.
 *
 * @param type Event type identifier (e.g., `NEW_REPLACEMENT`, `QC_SUBMITTED`, `PACKED`).
 * @param replacement Minimal replacement order details.
 * @param detail Optional additional context or rejection explanation.
 * @param actorName Optional name of the person performing the action.
 * @returns Status object `{ ok: boolean, skipped: boolean }`.
 */
export async function notifyTelegram(
  type: NotificationType,
  replacement: Pick<Replacement, "id" | "replacement_number" | "product_name" | "quantity">,
  detail?: string,
  actorName?: string,
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: true, skipped: true };
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const message = formatTelegramMessage(type, replacement, appUrl, detail, actorName);

  let admin: ReturnType<typeof createAdminClient> | null = null;
  try {
    admin = createAdminClient();
  } catch {
    /* Sending can still work without notification logging. */
  }

  let failed = false;
  const targets = [...new Set(NOTIFICATION_RECIPIENTS[type].flatMap(chatIds))];
  for (const target of targets) {
    let status = "SENT";
    let error: string | null = null;
    let ok = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: target,
            text: message,
            disable_web_page_preview: true,
            link_preview_options: { is_disabled: true },
          }),
        });
        if (response.ok) {
          ok = true;
          break;
        }
        if (attempt === 1) await new Promise((r) => setTimeout(r, 400));
        else error = `Telegram returned ${response.status}`;
      } catch (caught) {
        if (attempt === 1) {
          await new Promise((r) => setTimeout(r, 400));
        } else {
          error = caught instanceof Error ? caught.message.slice(0, 500) : "Unknown Telegram error";
        }
      }
    }
    if (!ok) {
      failed = true;
      status = "FAILED";
    }
    if (admin) {
      try {
        await admin.from("notifications").insert({
          replacement_id: replacement.id,
          channel: "TELEGRAM",
          type,
          status,
          error,
          sent_at: status === "SENT" ? new Date().toISOString() : null,
        });
      } catch {
        /* Notification logging must not block the workflow either. */
      }
    }
  }
  return { ok: !failed, skipped: false };
}
