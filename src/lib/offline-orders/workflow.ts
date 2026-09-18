import type { OfflineOrderStatus, Role } from "@/lib/types";

export type OfflineWorkflowAction =
  | "CREATE_OFFLINE_ORDER"
  | "CONFIRM_PRINTING"
  | "CONFIRM_PACKING"
  | "DISPATCH_ORDER"
  | "CONFIRM_PICKUP"
  | "CONFIRM_DELIVERY"
  | "ACKNOWLEDGE_ORDER"
  | "CANCEL_ORDER"
  | "COMMENT";

const transitions: Record<OfflineOrderStatus, readonly OfflineOrderStatus[]> = {
  CREATED: ["PRINTING_ASSIGNED", "CANCELLED"],
  PRINTING_ASSIGNED: ["PACKING_CONFIRMED", "CANCELLED"],
  PACKING_CONFIRMED: ["DISPATCHED", "CANCELLED"],
  DISPATCHED: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: ["DELIVERED", "CANCELLED"],
  DELIVERED: ["ACKNOWLEDGED"],
  ACKNOWLEDGED: [],
  CANCELLED: [],
};

const permissions: Record<OfflineWorkflowAction, readonly Role[]> = {
  CREATE_OFFLINE_ORDER: ["BOSS", "ADMIN"],
  CONFIRM_PRINTING: ["PRINTING", "ADMIN"],
  CONFIRM_PACKING: ["CONSIGNMENT", "ADMIN"],
  DISPATCH_ORDER: ["HR", "ADMIN"],
  CONFIRM_PICKUP: ["CONSIGNMENT", "ADMIN"],
  CONFIRM_DELIVERY: ["HR", "ADMIN"],
  ACKNOWLEDGE_ORDER: ["BOSS", "ADMIN"],
  CANCEL_ORDER: ["BOSS", "ADMIN"],
  COMMENT: ["BOSS", "HR", "CONSIGNMENT", "PRINTING", "CUSTOMER_SUPPORT", "LOGISTICS", "PACKING", "ADMIN"],
};

/**
 * Determines whether an offline order can legally transition from one status to another.
 */
export function canOfflineTransition(from: OfflineOrderStatus, to: OfflineOrderStatus): boolean {
  return transitions[from]?.includes(to) ?? false;
}

/**
 * Checks whether a user with the given role is authorized to perform an offline workflow action.
 */
export function canPerformOffline(role: Role, action: OfflineWorkflowAction): boolean {
  return permissions[action]?.includes(role) ?? false;
}

/**
 * Validates role authorization and status transition constraints, throwing an error on failure.
 */
export function assertOfflineWorkflowAction(
  role: Role,
  action: OfflineWorkflowAction,
  from?: OfflineOrderStatus,
  to?: OfflineOrderStatus,
): void {
  if (!canPerformOffline(role, action)) {
    throw new Error(`${role} cannot perform ${action}`);
  }
  if (from && to && !canOfflineTransition(from, to)) {
    throw new Error(`Invalid status transition: ${from} to ${to}`);
  }
}

/**
 * Computes the full list of actions available to a user role given the current offline order status.
 */
export function availableOfflineActions(role: Role, status: OfflineOrderStatus): OfflineWorkflowAction[] {
  const actions: OfflineWorkflowAction[] = ["COMMENT"];

  if (status === "CREATED" && canPerformOffline(role, "CONFIRM_PRINTING")) {
    actions.push("CONFIRM_PRINTING");
  }
  if (status === "PRINTING_ASSIGNED" && canPerformOffline(role, "CONFIRM_PACKING")) {
    actions.push("CONFIRM_PACKING");
  }
  if (status === "PACKING_CONFIRMED" && canPerformOffline(role, "DISPATCH_ORDER")) {
    actions.push("DISPATCH_ORDER");
  }
  if (status === "DISPATCHED" && canPerformOffline(role, "CONFIRM_PICKUP")) {
    actions.push("CONFIRM_PICKUP");
  }
  if (status === "PICKED_UP" && canPerformOffline(role, "CONFIRM_DELIVERY")) {
    actions.push("CONFIRM_DELIVERY");
  }
  if (status === "DELIVERED" && canPerformOffline(role, "ACKNOWLEDGE_ORDER")) {
    actions.push("ACKNOWLEDGE_ORDER");
  }
  if (!["ACKNOWLEDGED", "CANCELLED"].includes(status) && canPerformOffline(role, "CANCEL_ORDER")) {
    actions.push("CANCEL_ORDER");
  }

  return actions;
}

/**
 * Formats user-facing status label.
 */
export function formatOfflineStatus(status: OfflineOrderStatus): string {
  switch (status) {
    case "CREATED":
      return "New Order";
    case "PRINTING_ASSIGNED":
      return "Printing Assigned";
    case "PACKING_CONFIRMED":
      return "Packing Confirmed";
    case "DISPATCHED":
      return "Dispatched";
    case "PICKED_UP":
      return "Picked Up";
    case "DELIVERED":
      return "Delivered";
    case "ACKNOWLEDGED":
      return "Acknowledged";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status;
  }
}

