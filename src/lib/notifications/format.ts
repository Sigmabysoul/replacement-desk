import type { Replacement, Role } from "@/lib/types";

export type NotificationType =
  | "NEW_REPLACEMENT"
  | "LABEL_UPLOADED"
  | "LABEL_PRINTED"
  | "QC_SUBMITTED"
  | "QC_REJECTED"
  | "QC_APPROVED"
  | "PACKED"
  | "SHIPPED"
  | "DELIVERED"
  | "NEEDS_TOKEN";

export const NOTIFICATION_RECIPIENTS: Record<NotificationType, readonly Role[]> = {
  NEW_REPLACEMENT: ["LOGISTICS"],
  LABEL_UPLOADED: ["PRINTING"],
  LABEL_PRINTED: ["PACKING"],
  QC_SUBMITTED: ["CUSTOMER_SUPPORT"],
  QC_REJECTED: ["PACKING"],
  QC_APPROVED: ["PACKING"],
  PACKED: ["CUSTOMER_SUPPORT", "ADMIN"],
  SHIPPED: ["CUSTOMER_SUPPORT", "ADMIN"],
  DELIVERED: ["CUSTOMER_SUPPORT", "ADMIN", "LOGISTICS"],
  NEEDS_TOKEN: ["CUSTOMER_SUPPORT", "ADMIN"],
};

export type OfflineNotificationType =
  | "OFFLINE_CREATED"
  | "OFFLINE_PACKING_CONFIRMED"
  | "OFFLINE_DISPATCH_PREPARED"
  | "OFFLINE_PRINTED"
  | "OFFLINE_PICKED_UP"
  | "OFFLINE_DELIVERED"
  | "OFFLINE_ACKNOWLEDGED";

export const OFFLINE_NOTIFICATION_RECIPIENTS: Record<OfflineNotificationType, readonly Role[]> = {
  OFFLINE_CREATED: ["CONSIGNMENT"],
  OFFLINE_PACKING_CONFIRMED: ["HR"],
  OFFLINE_DISPATCH_PREPARED: ["PRINTING"],
  OFFLINE_PRINTED: ["CONSIGNMENT", "PACKING", "BOSS"],
  OFFLINE_PICKED_UP: ["CONSIGNMENT", "HR", "BOSS"],
  OFFLINE_DELIVERED: ["BOSS", "HR"],
  OFFLINE_ACKNOWLEDGED: ["BOSS", "HR", "CONSIGNMENT"],
};

/**
 * Formats user-facing notification titles and descriptive summaries
 * for each lifecycle step in the offline order workflow, explicitly highlighting
 * the next-step team member who needs to act.
 */
export function getOfflineNotificationContent(
  status: string,
  soNumber: string,
  productName: string,
  extra?: { cartonCount?: number | null; courier?: string | null; notes?: string | null },
) {
  switch (status) {
    case "CREATED":
      return {
        title: `📋 New Offline Order · ${soNumber}`,
        body: `SO ${soNumber} (${productName}) created. Consignment Team: please confirm cartons & weight.`,
        targetRoles: ["CONSIGNMENT", "ADMIN"] as Role[],
      };
    case "PACKING_CONFIRMED":
      return {
        title: `📦 Cartons Confirmed · ${soNumber}`,
        body: `Consignment confirmed ${extra?.cartonCount ? `${extra.cartonCount} cartons` : "packing"}. HR (Nainisha): please upload dispatch details & photos.`,
        targetRoles: ["HR", "ADMIN"] as Role[],
      };
    case "DISPATCH_PREPARED":
      return {
        title: `📑 Dispatch Ready · ${soNumber}`,
        body: `HR prepared dispatch documents. Storehouse Print Team: ready to print carton labels.`,
        targetRoles: ["PRINTING", "ADMIN"] as Role[],
      };
    case "PRINTED":
      return {
        title: `🖨️ Labels Printed · ${soNumber}`,
        body: `Storehouse confirmed labels printed for ${soNumber}. Ready for transporter/courier pickup.`,
        targetRoles: ["CONSIGNMENT", "PACKING", "BOSS", "ADMIN"] as Role[],
      };
    case "PICKED_UP":
      return {
        title: `🚚 Consignment Picked Up · ${soNumber}`,
        body: `${soNumber} picked up ${extra?.courier ? `by ${extra.courier}` : ""}. In transit to destination.`,
        targetRoles: ["CONSIGNMENT", "HR", "BOSS", "ADMIN"] as Role[],
      };
    case "DELIVERED":
      return {
        title: `📬 Consignment Delivered · ${soNumber}`,
        body: `${soNumber} marked delivered. Boss / HR: please verify POD and acknowledge.`,
        targetRoles: ["BOSS", "HR", "ADMIN"] as Role[],
      };
    case "ACKNOWLEDGED":
      return {
        title: `✅ Order Completed · ${soNumber}`,
        body: `SO ${soNumber} has been acknowledged and marked fully completed.`,
        targetRoles: ["BOSS", "HR", "CONSIGNMENT", "ADMIN"] as Role[],
      };
    default:
      return {
        title: `📦 Order Updated · ${soNumber}`,
        body: `SO ${soNumber} (${productName}) status changed to ${status}.`,
        targetRoles: ["ADMIN"] as Role[],
      };
  }
}

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
        `Requested by: ${actorName || "CUSTOMER_SUPPORT"}`,
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

    case "LABEL_UPLOADED":
      lines.push(
        "🏷 LABEL READY FOR PRINTING",
        "",
        replacement.replacement_number,
        "",
        "Logistics uploaded the shipping label. Please print it.",
      );
      break;

    case "QC_SUBMITTED":
      lines.push(
        "📸 QC APPROVAL REQUIRED",
        "",
        replacement.replacement_number,
        "",
        "Packing submitted QC photos for CUSTOMER_SUPPORT's approval.",
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
        "Dispatched with courier.",
      );
      break;

    case "DELIVERED":
      lines.push(
        "✅ REPLACEMENT DELIVERED",
        "",
        replacement.replacement_number,
        "",
        detail ? `Delivery Notes: ${detail}` : "Delivered to customer successfully.",
      );
      break;
  }

  if (appUrl) {
    const cleanUrl = appUrl.replace(/\/$/, "");
    lines.push("", `Open: ${cleanUrl}/replacements/${replacement.id}`);
  }

  return lines.join("\n");
}
