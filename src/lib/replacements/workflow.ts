import type { ReplacementStatus, Role } from "@/lib/types";

export type WorkflowAction =
  | "CREATE_REPLACEMENT"
  | "EDIT_REPLACEMENT"
  | "SUBMIT_LOGISTICS"
  | "MARK_LABEL_PRINTED"
  | "SUBMIT_QC"
  | "APPROVE_QC"
  | "REJECT_QC"
  | "MARK_PACKED"
  | "MARK_SHIPPED"
  | "MARK_DELIVERED"
  | "MARK_NEEDS_TOKEN"
  | "CANCEL_REPLACEMENT"
  | "COMMENT";

const transitions: Record<ReplacementStatus, readonly ReplacementStatus[]> = {
  NEW: ["LABEL_UPLOADED", "CANCELLED"],
  LABEL_UPLOADED: ["LABEL_PRINTED", "CANCELLED"],
  LABEL_PRINTED: ["QC_PENDING", "CANCELLED"],
  QC_PENDING: ["QC_APPROVED", "QC_REJECTED", "CANCELLED"],
  QC_REJECTED: ["QC_PENDING", "CANCELLED"],
  QC_APPROVED: ["PACKED", "CANCELLED"],
  PACKED: ["SHIPPED", "NEEDS_TOKEN", "CANCELLED"],
  SHIPPED: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  NEEDS_TOKEN: ["SHIPPED", "CANCELLED"],
  CANCELLED: [],
};

const permissions: Record<WorkflowAction, readonly Role[]> = {
  CREATE_REPLACEMENT: ["CUSTOMER_SUPPORT", "ADMIN"],
  EDIT_REPLACEMENT: ["CUSTOMER_SUPPORT", "ADMIN"],
  SUBMIT_LOGISTICS: ["LOGISTICS", "ADMIN"],
  MARK_LABEL_PRINTED: ["PRINTING", "ADMIN"],
  SUBMIT_QC: ["PACKING", "ADMIN"],
  APPROVE_QC: ["CUSTOMER_SUPPORT", "ADMIN"],
  REJECT_QC: ["CUSTOMER_SUPPORT", "ADMIN"],
  MARK_PACKED: ["PACKING", "ADMIN"],
  MARK_SHIPPED: ["PACKING", "ADMIN"],
  MARK_DELIVERED: ["LOGISTICS", "ADMIN"],
  MARK_NEEDS_TOKEN: ["PACKING", "ADMIN"],
  CANCEL_REPLACEMENT: ["ADMIN"],
  COMMENT: ["CUSTOMER_SUPPORT", "LOGISTICS", "PRINTING", "PACKING", "ADMIN"],
};

/**
 * Determines whether a replacement order can legally transition from one status to another.
 */
export function canTransition(from: ReplacementStatus, to: ReplacementStatus) {
  return transitions[from]?.includes(to) ?? false;
}

/**
 * Checks whether a user with the given role or set of roles is authorized to perform a workflow action.
 */
export function canPerform(roleOrRoles: Role | readonly Role[], action: WorkflowAction): boolean {
  const allowed = permissions[action];
  if (!allowed) return false;
  const userRoles = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];
  return userRoles.includes("ADMIN") || allowed.some((r) => userRoles.includes(r));
}

/**
 * Validates role authorization and status transition constraints, throwing an error on failure.
 */
export function assertWorkflowAction(
  roleOrRoles: Role | readonly Role[],
  action: WorkflowAction,
  from?: ReplacementStatus,
  to?: ReplacementStatus,
) {
  if (!canPerform(roleOrRoles, action)) {
    const roleStr = Array.isArray(roleOrRoles) ? roleOrRoles.join(", ") : roleOrRoles;
    throw new Error(`${roleStr} cannot perform ${action}`);
  }
  if (from && to && !canTransition(from, to)) {
    throw new Error(`Invalid status transition: ${from} to ${to}`);
  }
}

/**
 * Computes the full list of actions available to a user role given the current order status.
 */
export function availableActions(
  roleOrRoles: Role | readonly Role[],
  status: ReplacementStatus,
): WorkflowAction[] {
  const actions: WorkflowAction[] = ["COMMENT"];
  if (status === "NEW" && canPerform(roleOrRoles, "SUBMIT_LOGISTICS")) actions.push("SUBMIT_LOGISTICS");
  if (status === "LABEL_UPLOADED" && canPerform(roleOrRoles, "MARK_LABEL_PRINTED")) actions.push("MARK_LABEL_PRINTED");
  if (["LABEL_PRINTED", "QC_REJECTED"].includes(status) && canPerform(roleOrRoles, "SUBMIT_QC")) actions.push("SUBMIT_QC");
  if (status === "QC_PENDING" && canPerform(roleOrRoles, "APPROVE_QC")) actions.push("APPROVE_QC", "REJECT_QC");
  if (status === "QC_APPROVED" && canPerform(roleOrRoles, "MARK_PACKED")) actions.push("MARK_PACKED");
  if (status === "PACKED") {
    if (canPerform(roleOrRoles, "MARK_SHIPPED")) actions.push("MARK_SHIPPED");
    if (canPerform(roleOrRoles, "MARK_NEEDS_TOKEN")) actions.push("MARK_NEEDS_TOKEN");
  }
  if (status === "NEEDS_TOKEN" && canPerform(roleOrRoles, "MARK_SHIPPED")) actions.push("MARK_SHIPPED");
  if (status === "SHIPPED" && canPerform(roleOrRoles, "MARK_DELIVERED")) actions.push("MARK_DELIVERED");
  return actions;
}

/**
 * Formats standard replacement identifiers in the `REP-YYYY-NNNN` sequence pattern.
 */
export function nextReplacementNumber(year: number, sequence: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new Error("Invalid year");
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 9999) throw new Error("Invalid sequence");
  return `REP-${year}-${String(sequence).padStart(4, "0")}`;
}
