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
  SHIPPED: [],
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
  MARK_NEEDS_TOKEN: ["PACKING", "ADMIN"],
  CANCEL_REPLACEMENT: ["ADMIN"],
  COMMENT: ["CUSTOMER_SUPPORT", "LOGISTICS", "PRINTING", "PACKING", "ADMIN"],
};

/**
 * Determines whether a replacement order can legally transition from one status to another.
 *
 * Enforces the core state machine:
 * - NEW -> LABEL_UPLOADED after Logistics supplies the label
 * - LABEL_UPLOADED -> LABEL_PRINTED after Printing confirms the label is printed
 * - LABEL_PRINTED -> QC_PENDING after Packing uploads a QC picture and requests review
 * - QC_PENDING -> QC_APPROVED, QC_REJECTED, or CANCELLED
 * - QC_REJECTED -> QC_PENDING or CANCELLED
 * - QC_APPROVED -> PACKED or CANCELLED
 * - PACKED -> SHIPPED, NEEDS_TOKEN, or CANCELLED
 * - NEEDS_TOKEN -> SHIPPED or CANCELLED
 * - SHIPPED / CANCELLED are terminal states (no further transitions).
 *
 * @param from Current status of the replacement.
 * @param to Proposed destination status.
 * @returns `true` if the transition is allowed; otherwise `false`.
 */
export function canTransition(from: ReplacementStatus, to: ReplacementStatus) {
  return transitions[from].includes(to);
}

/**
 * Checks whether a user with the given role is authorized to perform a workflow action.
 *
 * Role capabilities:
 * - CUSTOMER_SUPPORT: Creates and edits replacements, then reviews Packing's QC evidence.
 * - LOGISTICS: Uploads the shipping label.
 * - PRINTING: Confirms the uploaded label was printed.
 * - PACKING: Uploads QC pictures, requests review, packs, and finishes dispatch.
 * - ADMIN: Superuser across all operations and cancellations.
 *
 * @param role User's operational role.
 * @param action Workflow action to check.
 * @returns `true` if authorized; otherwise `false`.
 */
export function canPerform(role: Role, action: WorkflowAction) {
  return permissions[action].includes(role);
}

/**
 * Validates role authorization and status transition constraints, throwing an error on failure.
 *
 * @param role User's operational role.
 * @param action Workflow action being attempted.
 * @param from Optional current replacement status.
 * @param to Optional target replacement status.
 * @throws Error if the role cannot perform the action or if the transition is illegal.
 */
export function assertWorkflowAction(
  role: Role,
  action: WorkflowAction,
  from?: ReplacementStatus,
  to?: ReplacementStatus,
) {
  if (!canPerform(role, action)) throw new Error(`${role} cannot perform ${action}`);
  if (from && to && !canTransition(from, to)) {
    throw new Error(`Invalid status transition: ${from} to ${to}`);
  }
}

/**
 * Computes the full list of actions available to a user role given the current order status.
 * Used by UI components to conditionally render action buttons and controls.
 *
 * @param role User's operational role.
 * @param status Current status of the replacement.
 * @returns Array of available `WorkflowAction` keys.
 */
export function availableActions(role: Role, status: ReplacementStatus): WorkflowAction[] {
  const actions: WorkflowAction[] = ["COMMENT"];
  if (status === "NEW" && canPerform(role, "SUBMIT_LOGISTICS")) actions.push("SUBMIT_LOGISTICS");
  if (status === "LABEL_UPLOADED" && canPerform(role, "MARK_LABEL_PRINTED")) actions.push("MARK_LABEL_PRINTED");
  if (["LABEL_PRINTED", "QC_REJECTED"].includes(status) && canPerform(role, "SUBMIT_QC")) actions.push("SUBMIT_QC");
  if (status === "QC_PENDING" && canPerform(role, "APPROVE_QC")) actions.push("APPROVE_QC", "REJECT_QC");
  if (status === "QC_APPROVED" && canPerform(role, "MARK_PACKED")) actions.push("MARK_PACKED");
  if (status === "PACKED") {
    if (canPerform(role, "MARK_SHIPPED")) actions.push("MARK_SHIPPED");
    if (canPerform(role, "MARK_NEEDS_TOKEN")) actions.push("MARK_NEEDS_TOKEN");
  }
  if (status === "NEEDS_TOKEN" && canPerform(role, "MARK_SHIPPED")) actions.push("MARK_SHIPPED");
  return actions;
}

/**
 * Formats standard replacement identifiers in the `REP-YYYY-NNNN` sequence pattern.
 *
 * @param year 4-digit Gregorian year (2000 to 9999).
 * @param sequence Integer sequence number (1 to 9999), padded with leading zeros.
 * @returns Formatted identifier, e.g. "REP-2026-0042".
 * @throws Error if year or sequence are out of acceptable bounds.
 */
export function nextReplacementNumber(year: number, sequence: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new Error("Invalid year");
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 9999) throw new Error("Invalid sequence");
  return `REP-${year}-${String(sequence).padStart(4, "0")}`;
}
