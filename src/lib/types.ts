export const ROLES = ["ESHA", "PRINTING", "PACKING", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const STATUSES = [
  "NEW",
  "LABEL_PRINTED",
  "QC_PENDING",
  "QC_REJECTED",
  "QC_APPROVED",
  "PACKED",
  "SHIPPED",
  "NEEDS_TOKEN",
  "CANCELLED",
] as const;
export type ReplacementStatus = (typeof STATUSES)[number];

export type AttachmentType = "CUSTOMER_PHOTO" | "LABEL" | "QC_PHOTO" | "OTHER";
export type QcDecision = "PENDING" | "APPROVED" | "REJECTED";

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Replacement {
  id: string;
  replacement_number: string;
  order_reference: string;
  customer_name: string | null;
  customer_reference: string | null;
  product_name: string;
  quantity: number;
  reason: string | null;
  notes: string | null;
  tracking_url: string | null;
  status: ReplacementStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  label_printed_at: string | null;
  qc_submitted_at: string | null;
  qc_approved_at: string | null;
  packed_at: string | null;
  shipped_at: string | null;
  needs_token_at: string | null;
  archived_at: string | null;
  archived_by: string | null;
  creator?: Pick<Profile, "full_name"> | null;
}

export interface Attachment {
  id: string;
  replacement_id: string;
  qc_submission_id: string | null;
  attachment_type: AttachmentType;
  storage_path: string;
  file_name: string;
  mime_type: string;
  uploaded_by: string;
  created_at: string;
  signed_url?: string;
}

export interface QcSubmission {
  id: string;
  replacement_id: string;
  submission_number: number;
  submitted_by: string;
  submitted_at: string;
  decision: QcDecision;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  submitter?: Pick<Profile, "full_name"> | null;
  reviewer?: Pick<Profile, "full_name"> | null;
  attachments?: Attachment[];
}

export interface ActivityLog {
  id: string;
  replacement_id: string;
  actor_id: string | null;
  action: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor?: Pick<Profile, "full_name" | "role"> | null;
}
