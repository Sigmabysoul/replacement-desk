import { z } from "zod";

/**
 * Zod helper that validates optional string fields, trims whitespace,
 * enforces maximum length, and converts empty strings to `null`.
 *
 * @param max Maximum character length allowed.
 */
const optionalText = (max: number) => z.string().trim().max(max).optional().transform((value) => value || null);

export const replacementSchema = z.object({
  order_reference: z.string().trim().min(1, "Order reference is required").max(100),
  customer_name: optionalText(120),
  customer_reference: optionalText(100),
  product_name: z.string().trim().min(1, "Product is required").max(200),
  quantity: z.coerce.number().int().min(1).max(999),
  reason: optionalText(200),
  notes: optionalText(2000),
});

export const commentSchema = z.object({
  replacement_id: z.string().uuid(),
  message: z.string().trim().min(1, "Comment cannot be empty").max(1000),
});

export const transitionSchema = z.object({
  replacement_id: z.string().uuid(),
  target_status: z.enum(["LABEL_PRINTED", "QC_APPROVED", "QC_REJECTED", "PACKED", "SHIPPED", "NEEDS_TOKEN", "CANCELLED"]),
  message: z.string().trim().max(1000).optional(),
});

export const MAX_FILE_SIZE = 25 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
