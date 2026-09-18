export const ROLES = ["CUSTOMER_SUPPORT", "LOGISTICS", "PRINTING", "PACKING", "ADMIN", "BOSS", "HR", "CONSIGNMENT"] as const;
export type Role = (typeof ROLES)[number];

export const STATUSES = [
  "NEW",
  "LABEL_UPLOADED",
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

export type AttachmentType = "CUSTOMER_PHOTO" | "LABEL" | "PROOF_PHOTO" | "QC_PHOTO" | "OTHER";
export type QcDecision = "PENDING" | "APPROVED" | "REJECTED";
export type OrderType = "REPLACEMENT" | "OFFLINE";
export type ShippingSpeed = "STANDARD" | "EXPRESS";

export interface DimensionPreset {
  id: string;
  name: string;
  length_cm: number;
  breadth_cm: number;
  height_cm: number;
  active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

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
  order_number: number;
  order_type: OrderType;
  order_group_id: string | null;
  order_reference: string;
  customer_name: string | null;
  customer_reference: string | null;
  customer_address: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  product_name: string;
  quantity: number;
  reason: string | null;
  notes: string | null;
  tracking_url: string | null;
  shipping_speed: ShippingSpeed;
  dimension_preset_id: string | null;
  length_cm: number | null;
  breadth_cm: number | null;
  height_cm: number | null;
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

export const OFFLINE_ORDER_STATUSES = [
  "CREATED",
  "PRINTING_ASSIGNED",
  "PACKING_CONFIRMED",
  "DISPATCHED",
  "PICKED_UP",
  "DELIVERED",
  "ACKNOWLEDGED",
  "CANCELLED",
] as const;
export type OfflineOrderStatus = (typeof OFFLINE_ORDER_STATUSES)[number];

export type OfflineOrderAttachmentType = "DISPATCH_DOC" | "POD" | "OTHER";

export interface OfflineOrder {
  id: string;
  so_number: string;
  order_number: number;
  brand: string | null;
  product_name: string;
  quantity: number;
  unit: string;
  logistics_partner: string | null;
  dispatch_date: string | null;
  notes: string | null;
  status: OfflineOrderStatus;
  carton_count: number | null;
  carton_dimensions: string | null;
  carton_weight_kg: number | null;
  lr_number: string | null;
  tracking_url: string | null;
  pod_notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  printing_confirmed_at: string | null;
  printing_confirmed_by: string | null;
  packing_confirmed_at: string | null;
  packing_confirmed_by: string | null;
  dispatched_at: string | null;
  dispatched_by: string | null;
  picked_up_at: string | null;
  picked_up_by: string | null;
  delivered_at: string | null;
  delivered_by: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  creator?: Pick<Profile, "full_name"> | null;
}

export interface OfflineOrderAttachment {
  id: string;
  offline_order_id: string;
  attachment_type: OfflineOrderAttachmentType;
  storage_path: string;
  file_name: string;
  mime_type: string;
  uploaded_by: string;
  created_at: string;
  signed_url?: string;
}

export interface OfflineOrderActivityLog {
  id: string;
  offline_order_id: string;
  actor_id: string | null;
  action: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor?: Pick<Profile, "full_name" | "role"> | null;
}
