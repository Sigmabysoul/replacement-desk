import type { ReplacementStatus, Role } from "@/lib/types";

export type WorkflowAction =
  | "CREATE_REPLACEMENT"
  | "EDIT_REPLACEMENT"
  | "MARK_LABEL_PRINTED"
  | "SUBMIT_QC"
  | "APPROVE_QC"
  | "REJECT_QC"
  | "MARK_PACKED"
  | "MARK_SHIPPED"
  | "MARK_NEEDS_TOKEN"
  | "CANCEL_REPLACEMENT"
  | "COMMENT"
  | "UPLOAD";

const transitions: Record<ReplacementStatus, readonly ReplacementStatus[]> = {
  NEW: ["LABEL_PRINTED", "CANCELLED"],
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
  CREATE_REPLACEMENT: ["ESHA", "ADMIN"],
  EDIT_REPLACEMENT: ["ESHA", "ADMIN"],
  MARK_LABEL_PRINTED: ["PRINTING", "ADMIN"],
  SUBMIT_QC: ["PACKING", "ADMIN"],
  APPROVE_QC: ["ESHA", "ADMIN"],
  REJECT_QC: ["ESHA", "ADMIN"],
  MARK_PACKED: ["PACKING", "ADMIN"],
  MARK_SHIPPED: ["ESHA", "ADMIN"],
  MARK_NEEDS_TOKEN: ["ESHA", "ADMIN"],
  CANCEL_REPLACEMENT: ["ADMIN"],
  COMMENT: ["ESHA", "PRINTING", "PACKING", "ADMIN"],
  UPLOAD: ["ESHA", "PACKING", "ADMIN"],
};

export function canTransition(from: ReplacementStatus, to: ReplacementStatus) {
  return transitions[from].includes(to);
}

export function canPerform(role: Role, action: WorkflowAction) {
  return permissions[action].includes(role);
}

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

export function availableActions(role: Role, status: ReplacementStatus): WorkflowAction[] {
  const actions: WorkflowAction[] = ["COMMENT"];
  if (canPerform(role, "UPLOAD")) actions.push("UPLOAD");
  if (status === "NEW" && canPerform(role, "MARK_LABEL_PRINTED")) actions.push("MARK_LABEL_PRINTED");
  if ((status === "LABEL_PRINTED" || status === "QC_REJECTED") && canPerform(role, "SUBMIT_QC")) actions.push("SUBMIT_QC");
  if (status === "QC_PENDING" && canPerform(role, "APPROVE_QC")) actions.push("APPROVE_QC", "REJECT_QC");
  if (status === "QC_APPROVED" && canPerform(role, "MARK_PACKED")) actions.push("MARK_PACKED");
  if (status === "PACKED") {
    if (canPerform(role, "MARK_SHIPPED")) actions.push("MARK_SHIPPED");
    if (canPerform(role, "MARK_NEEDS_TOKEN")) actions.push("MARK_NEEDS_TOKEN");
  }
  if (status === "NEEDS_TOKEN" && canPerform(role, "MARK_SHIPPED")) actions.push("MARK_SHIPPED");
  return actions;
}

export function nextReplacementNumber(year: number, sequence: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new Error("Invalid year");
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 9999) throw new Error("Invalid sequence");
  return `REP-${year}-${String(sequence).padStart(4, "0")}`;
}
