import { z } from "zod";

const optionalText = (max: number) =>
  z
    .preprocess((value) => (value == null ? "" : value), z.string().trim().max(max))
    .transform((value) => value || null);

const optionalTrackingUrl = z
  .preprocess((value) => (value == null ? "" : value), z.string().trim().max(2000, "Tracking link is too long"))
  .transform((value) => value || null)
  .refine(
    (value) => value === null || /^https?:\/\/[^\s]+$/i.test(value),
    "Tracking link must begin with http:// or https://",
  );

export const createOfflineOrderSchema = z.object({
  order_number: z
    .preprocess(
      (value) => (value === "" || value == null ? null : value),
      z.coerce.number().int().min(1, "Order ID must be a positive whole number").nullable(),
    )
    .optional(),
  so_number: z.string().trim().min(1, "SO Number is required").max(50, "SO Number must be 50 characters or less"),
  brand: optionalText(200),
  product_name: z.string().trim().min(1, "Product name is required").max(200),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1").max(999999),
  unit: z.string().trim().min(1).max(50).default("Pieces"),
  logistics_partner: optionalText(200),
  dispatch_date: z
    .preprocess((value) => (value == null ? "" : value), z.string().trim())
    .transform((value) => value || null),
  notes: optionalText(2000),
});

export const updateOfflineOrderNumberSchema = z.object({
  order_id: z.string().uuid("Invalid order ID"),
  order_number: z.coerce.number().int().min(1, "Order ID must be a positive whole number"),
});

export const confirmPackingSchema = z.object({
  order_id: z.string().uuid("Invalid order ID"),
  carton_count: z.coerce.number().int().min(1, "Carton count must be at least 1").max(9999),
  carton_dimensions: optionalText(100),
  carton_weight_kg: z.preprocess(
    (value) => (value === "" || value == null ? null : value),
    z.coerce.number().positive("Weight must be greater than 0").max(10000).nullable(),
  ),
});

export const dispatchOrderSchema = z.object({
  order_id: z.string().uuid("Invalid order ID"),
  lr_number: optionalText(100),
  tracking_url: optionalTrackingUrl,
  logistics_partner: optionalText(200),
});

export const confirmDeliverySchema = z.object({
  order_id: z.string().uuid("Invalid order ID"),
  pod_notes: optionalText(2000),
});

export const cancelOfflineOrderSchema = z.object({
  order_id: z.string().uuid("Invalid order ID"),
  reason: z.string().trim().min(1, "A cancellation reason is required").max(1000),
});

export const offlineOrderCommentSchema = z.object({
  order_id: z.string().uuid("Invalid order ID"),
  message: z.string().trim().min(1, "Comment cannot be empty").max(1000),
});

