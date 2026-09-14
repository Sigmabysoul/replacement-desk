import { z } from "zod";

/**
 * Zod helper that validates optional string fields, trims whitespace,
 * enforces maximum length, and converts empty strings to `null`.
 *
 * @param max Maximum character length allowed.
 */
const optionalText = (max: number) => z.string().trim().max(max).optional().transform((value) => value || null);
const optionalTrackingUrl = z
  .string()
  .trim()
  .max(2000, "Tracking link is too long")
  .optional()
  .transform((value) => value || null)
  .refine((value) => value === null || /^https?:\/\/[^\s]+$/i.test(value), "Tracking link must begin with http:// or https://");

const optionalEmail = z.string().trim().max(254).optional().transform((value) => value?.toLowerCase() || null)
  .refine((value) => value === null || z.email().safeParse(value).success, "Enter a valid customer email");
const optionalDimension = z.preprocess(
  (value) => value === "" || value == null ? null : value,
  z.coerce.number().positive().max(10000).nullable(),
);

export const replacementSchema = z.object({
  order_reference: z.string().trim().min(1, "Order reference is required").max(100),
  customer_name: optionalText(120),
  customer_reference: optionalText(100),
  customer_address: optionalText(1000),
  customer_email: optionalEmail,
  customer_phone: optionalText(40),
  product_name: z.string().trim().min(1, "Product is required").max(200),
  quantity: z.coerce.number().int().min(1).max(999),
  reason: optionalText(200),
  notes: optionalText(2000),
  tracking_url: optionalTrackingUrl,
  order_type: z.enum(["REPLACEMENT", "OFFLINE"]).default("REPLACEMENT"),
  shipping_speed: z.enum(["STANDARD", "EXPRESS"]).default("STANDARD"),
  dimension_preset_id: z.union([z.literal(""), z.string().uuid()]).optional().transform((value) => value || null),
  length_cm: optionalDimension,
  breadth_cm: optionalDimension,
  height_cm: optionalDimension,
}).superRefine((value, context) => {
  if (value.order_type === "REPLACEMENT" && (!value.length_cm || !value.breadth_cm || !value.height_cm)) {
    context.addIssue({ code: "custom", message: "Length, breadth, and height are required for replacement orders", path: ["length_cm"] });
  }
  if (value.order_type === "OFFLINE" && (value.length_cm || value.breadth_cm || value.height_cm)) {
    context.addIssue({ code: "custom", message: "Offline orders do not use dimensions", path: ["length_cm"] });
  }
});

export const replacementEditSchema = z.object({
  order_reference: z.string().trim().min(1, "Order reference is required").max(100),
  customer_name: optionalText(120),
  customer_reference: optionalText(100),
  product_name: z.string().trim().min(1, "Product is required").max(200),
  quantity: z.coerce.number().int().min(1).max(999),
  reason: optionalText(200),
  notes: optionalText(2000),
});

export const dimensionPresetSchema = z.object({
  id: z.union([z.literal(""), z.string().uuid()]).optional(),
  name: z.string().trim().min(1, "Preset name is required").max(100),
  length_cm: z.coerce.number().positive().max(10000),
  breadth_cm: z.coerce.number().positive().max(10000),
  height_cm: z.coerce.number().positive().max(10000),
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
