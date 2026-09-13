import type { Replacement, Role } from "@/lib/types";

export type NotificationType =
  | "NEW_REPLACEMENT"
  | "LABEL_PRINTED"
  | "QC_SUBMITTED"
  | "QC_REJECTED"
  | "QC_APPROVED"
  | "PACKED"
  | "SHIPPED"
  | "NEEDS_TOKEN";

export const NOTIFICATION_RECIPIENTS: Record<NotificationType, readonly Role[]> = {
  NEW_REPLACEMENT: ["LOGISTICS"],
  LABEL_PRINTED: ["LOGISTICS", "ESHA"],
  QC_SUBMITTED: ["ESHA"],
  QC_REJECTED: ["LOGISTICS"],
  QC_APPROVED: ["LOGISTICS"],
  PACKED: ["ESHA", "ADMIN"],
  SHIPPED: ["ESHA", "ADMIN"],
  NEEDS_TOKEN: ["ESHA", "ADMIN"],
};

/**
 * Formats a clean, readable multi-line plain text message for Telegram notifications.
 *
 * @param type The operational event triggering the notification (e.g. `NEW_REPLACEMENT`, `PACKED`).
 * @param replacement Subset of replacement details (`id`, `replacement_number`, `product_name`, `quantity`).
 * @param appUrl Optional base URL of the deployed application used to generate direct links.
 * @param detail Optional secondary message or QC rejection reason.
 * @param actorName Optional display name of the user who initiated the action.
 * @returns Formatted notification text ready to be dispatched to the Telegram Bot API.
 */
export function formatTelegramMessage(
  type: NotificationType,
  replacement: Pick<Replacement, "id" | "replacement_number" | "product_name" | "quantity">,
  appUrl?: string,
  detail?: string,
  actorName?: string,
): string {
  const lines: string[] = [];

  switch (type) {
    case "NEW_REPLACEMENT":
      lines.push(
        "🔔 NEW REPLACEMENT",
        "",
        replacement.replacement_number,
        "",
        `Product: ${replacement.product_name}`,
        `Qty: ${replacement.quantity}`,
        `Requested by: ${actorName || "Esha"}`,
      );
      break;

    case "LABEL_PRINTED":
      lines.push(
        "🖨 LABEL PRINTED",
        "",
        replacement.replacement_number,
        "",
        "The replacement label has been printed.",
      );
      break;

    case "QC_SUBMITTED":
      lines.push(
        "📸 QC APPROVAL REQUIRED",
        "",
        replacement.replacement_number,
        "",
        "Logistics added the shipping label and proof photos.",
      );
      break;

    case "QC_REJECTED":
      lines.push(
        "❌ QC REJECTED",
        "",
        replacement.replacement_number,
        "",
        `Reason: ${detail || "Please check QC notes"}`,
        "",
        "Please replace/fix the product and submit QC again.",
      );
      break;

    case "QC_APPROVED":
      lines.push(
        "✅ QC APPROVED",
        "",
        replacement.replacement_number,
        "",
        "The product is approved and can now be packed.",
      );
      break;

    case "PACKED":
      lines.push(
        "📦 REPLACEMENT PACKED",
        "",
        replacement.replacement_number,
        "",
        "Ready for dispatch.",
      );
      break;

    case "NEEDS_TOKEN":
      lines.push(
        "⚠️ NEEDS TOKEN",
        "",
        replacement.replacement_number,
        "",
        "The replacement was not picked up.",
      );
      break;

    case "SHIPPED":
      lines.push(
        "🚚 REPLACEMENT SHIPPED",
        "",
        replacement.replacement_number,
        "",
        "Replacement completed.",
      );
      break;
  }

  if (appUrl) {
    const cleanUrl = appUrl.replace(/\/$/, "");
    lines.push("", `Open: ${cleanUrl}/replacements/${replacement.id}`);
  }

  return lines.join("\n");
}
