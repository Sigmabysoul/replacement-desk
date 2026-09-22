import { z } from "zod";
import { parseDisplayDate } from "@/lib/utils";



export const offlineOrderItemsSchema = z.array(z.object({
  product_name: z.string().trim().min(1, "Product name is required").max(200),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1").max(999999),
})).min(1, "Add at least one item").max(20, "An order can contain at most twenty items");

export const createOfflineOrderSchema = z.object({
  order_number: z
    .preprocess(
      (value) => (value === "" || value == null ? null : value),
      z.coerce.number().int().min(1, "Order ID must be a positive whole number").nullable(),
    )
    .optional(),
  so_number: z.string().trim().min(1, "SO Number is required").max(50, "SO Number must be 50 characters or less"),
  brand: z.string().trim().min(1, "Brand is required").max(200),
  product_name: z.string().trim().min(1, "Product name is required").max(200),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1").max(999999),
  unit: z.string().trim().min(1, "Unit is required").max(50).default("Pieces"),
  logistics_partner: z.string().trim().min(1, "Logistics partner is required").max(200),
  dispatch_date: z
    .preprocess((value) => (value == null ? "" : value), z.string().trim())
    .refine((value) => Boolean(value) && parseDisplayDate(value) !== null, "Target dispatch date is required (DD/MM/YYYY)")
    .transform((value) => parseDisplayDate(value)!),
  notes: z.string().trim().min(1, "Notes are required").max(2000),
});

export const updateOfflineOrderNumberSchema = z.object({
  order_id: z.string().uuid("Invalid order ID"),
  order_number: z.coerce.number().int().min(1, "Order ID must be a positive whole number"),
});

export const confirmPackingSchema = z.object({
  order_id: z.string().uuid("Invalid order ID"),
  carton_count: z.coerce.number().int().min(1, "Carton count must be at least 1").max(9999),
  carton_dimensions: z.string().trim().min(1, "Carton dimensions are required (LxBxH)").max(100),
  carton_weight_kg: z.coerce.number().positive("Weight must be greater than 0").max(10000),
});

export const dispatchOrderSchema = z.object({
  order_id: z.string().uuid("Invalid order ID"),
  lr_number: z.string().trim().min(1, "LR / Consignment number is required").max(100),
  tracking_url: z
    .string()
    .trim()
    .min(1, "Tracking link is required")
    .max(2000, "Tracking link is too long")
    .refine((value) => /^https?:\/\/[^\s]+$/i.test(value), "Tracking link must begin with http:// or https://"),
  logistics_partner: z.string().trim().min(1, "Logistics partner is required").max(200),
});

export const confirmDeliverySchema = z.object({
  order_id: z.string().uuid("Invalid order ID"),
  pod_notes: z.string().trim().min(1, "Proof of delivery notes are required").max(2000),
});

export const cancelOfflineOrderSchema = z.object({
  order_id: z.string().uuid("Invalid order ID"),
  reason: z.string().trim().min(1, "A cancellation reason is required").max(1000),
});

export const offlineOrderCommentSchema = z.object({
  order_id: z.string().uuid("Invalid order ID"),
  message: z.string().trim().min(1, "Comment cannot be empty").max(1000),
});
