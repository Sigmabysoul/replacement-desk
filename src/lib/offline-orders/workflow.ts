import type { OfflineOrderStatus, Role } from "@/lib/types";

export type OfflineWorkflowAction =
  | "CREATE_OFFLINE_ORDER"
  | "CONFIRM_PACKING"
  | "DISPATCH_PREPARE"
  | "CONFIRM_PRINTING"
  | "CONFIRM_PICKUP"
  | "CONFIRM_DELIVERY"
  | "ACKNOWLEDGE_ORDER"
  | "CANCEL_ORDER"
  | "COMMENT";

const transitions: Record<OfflineOrderStatus, readonly OfflineOrderStatus[]> = {
  CREATED: ["PACKING_CONFIRMED", "CANCELLED"],
  PACKING_CONFIRMED: ["DISPATCH_PREPARED", "CANCELLED"],
  DISPATCH_PREPARED: ["PRINTED", "CANCELLED"],
  PRINTED: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: ["DELIVERED", "CANCELLED"],
  DELIVERED: ["ACKNOWLEDGED"],
  ACKNOWLEDGED: [],
  CANCELLED: [],
};

const permissions: Record<OfflineWorkflowAction, readonly Role[]> = {
  CREATE_OFFLINE_ORDER: ["BOSS", "ADMIN"],
  CONFIRM_PACKING: ["CONSIGNMENT", "ADMIN"],
  DISPATCH_PREPARE: ["HR", "ADMIN"],
  CONFIRM_PRINTING: ["PRINTING", "ADMIN"],
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
 * Checks whether a user with the given role or set of roles is authorized to perform an offline workflow action.
 */
export function canPerformOffline(roleOrRoles: Role | readonly Role[], action: OfflineWorkflowAction): boolean {
  const allowed = permissions[action];
  if (!allowed) return false;
  const userRoles = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];
  return userRoles.includes("ADMIN") || allowed.some((r) => userRoles.includes(r));
}

/**
 * Validates role authorization and status transition constraints, throwing an error on failure.
 */
export function assertOfflineWorkflowAction(
  roleOrRoles: Role | readonly Role[],
  action: OfflineWorkflowAction,
  from?: OfflineOrderStatus,
  to?: OfflineOrderStatus,
): void {
  if (!canPerformOffline(roleOrRoles, action)) {
    const roleStr = Array.isArray(roleOrRoles) ? roleOrRoles.join(", ") : roleOrRoles;
    throw new Error(`${roleStr} cannot perform ${action}`);
  }
  if (from && to && !canOfflineTransition(from, to)) {
    throw new Error(`Invalid status transition: ${from} to ${to}`);
  }
}

/**
 * Computes the full list of actions available to a user given their roles and current offline order status.
 */
export function availableOfflineActions(
  roleOrRoles: Role | readonly Role[],
  status: OfflineOrderStatus,
): OfflineWorkflowAction[] {
  const actions: OfflineWorkflowAction[] = ["COMMENT"];

  if (status === "CREATED" && canPerformOffline(roleOrRoles, "CONFIRM_PACKING")) {
    actions.push("CONFIRM_PACKING");
  }
  if (status === "PACKING_CONFIRMED" && canPerformOffline(roleOrRoles, "DISPATCH_PREPARE")) {
    actions.push("DISPATCH_PREPARE");
  }
  if (status === "DISPATCH_PREPARED" && canPerformOffline(roleOrRoles, "CONFIRM_PRINTING")) {
    actions.push("CONFIRM_PRINTING");
  }
  if (status === "PRINTED" && canPerformOffline(roleOrRoles, "CONFIRM_PICKUP")) {
    actions.push("CONFIRM_PICKUP");
  }
  if (status === "PICKED_UP" && canPerformOffline(roleOrRoles, "CONFIRM_DELIVERY")) {
    actions.push("CONFIRM_DELIVERY");
  }
  if (status === "DELIVERED" && canPerformOffline(roleOrRoles, "ACKNOWLEDGE_ORDER")) {
    actions.push("ACKNOWLEDGE_ORDER");
  }
  if (!["ACKNOWLEDGED", "CANCELLED"].includes(status) && canPerformOffline(roleOrRoles, "CANCEL_ORDER")) {
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
    case "PACKING_CONFIRMED":
      return "Packing Confirmed";
    case "DISPATCH_PREPARED":
      return "Dispatch Prepared";
    case "PRINTED":
      return "Materials Printed";
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
