import { describe, expect, it } from "vitest";
import {
  assertOfflineWorkflowAction,
  availableOfflineActions,
  canOfflineTransition,
  canPerformOffline,
  formatOfflineStatus,
} from "@/lib/offline-orders/workflow";
import {
  confirmDeliverySchema,
  confirmPackingSchema,
  createOfflineOrderSchema,
  dispatchOrderSchema,
} from "@/lib/offline-orders/validation";

describe("offline workflow permissions", () => {
  it("allows Boss to create, acknowledge, and cancel offline orders", () => {
    expect(canPerformOffline("BOSS", "CREATE_OFFLINE_ORDER")).toBe(true);
    expect(canPerformOffline("BOSS", "ACKNOWLEDGE_ORDER")).toBe(true);
    expect(canPerformOffline("BOSS", "CANCEL_ORDER")).toBe(true);
    expect(canPerformOffline("BOSS", "CONFIRM_PRINTING")).toBe(false);
    expect(canPerformOffline("BOSS", "CONFIRM_PACKING")).toBe(false);
    expect(canPerformOffline("BOSS", "DISPATCH_ORDER")).toBe(false);
  });

  it("allows Print team to confirm printing only", () => {
    expect(canPerformOffline("PRINTING", "CONFIRM_PRINTING")).toBe(true);
    expect(canPerformOffline("PRINTING", "CONFIRM_PACKING")).toBe(false);
    expect(canPerformOffline("PRINTING", "DISPATCH_ORDER")).toBe(false);
    expect(canPerformOffline("PRINTING", "ACKNOWLEDGE_ORDER")).toBe(false);
  });

  it("allows Consignment team to confirm packing and courier pickup", () => {
    expect(canPerformOffline("CONSIGNMENT", "CONFIRM_PACKING")).toBe(true);
    expect(canPerformOffline("CONSIGNMENT", "CONFIRM_PICKUP")).toBe(true);
    expect(canPerformOffline("CONSIGNMENT", "DISPATCH_ORDER")).toBe(false);
    expect(canPerformOffline("CONSIGNMENT", "CONFIRM_DELIVERY")).toBe(false);
  });

  it("allows HR team to dispatch and confirm delivery with POD", () => {
    expect(canPerformOffline("HR", "DISPATCH_ORDER")).toBe(true);
    expect(canPerformOffline("HR", "CONFIRM_DELIVERY")).toBe(true);
    expect(canPerformOffline("HR", "CONFIRM_PACKING")).toBe(false);
    expect(canPerformOffline("HR", "CONFIRM_PICKUP")).toBe(false);
  });

  it("allows Admin to perform all operational actions", () => {
    expect(canPerformOffline("ADMIN", "CREATE_OFFLINE_ORDER")).toBe(true);
    expect(canPerformOffline("ADMIN", "CONFIRM_PRINTING")).toBe(true);
    expect(canPerformOffline("ADMIN", "CONFIRM_PACKING")).toBe(true);
    expect(canPerformOffline("ADMIN", "DISPATCH_ORDER")).toBe(true);
    expect(canPerformOffline("ADMIN", "CONFIRM_PICKUP")).toBe(true);
    expect(canPerformOffline("ADMIN", "CONFIRM_DELIVERY")).toBe(true);
    expect(canPerformOffline("ADMIN", "ACKNOWLEDGE_ORDER")).toBe(true);
    expect(canPerformOffline("ADMIN", "CANCEL_ORDER")).toBe(true);
  });
});

describe("offline workflow status transitions", () => {
  it("enforces the real-world sequence: CREATED -> PRINTING_ASSIGNED -> PACKING_CONFIRMED -> DISPATCHED -> PICKED_UP -> DELIVERED -> ACKNOWLEDGED", () => {
    expect(canOfflineTransition("CREATED", "PRINTING_ASSIGNED")).toBe(true);
    expect(canOfflineTransition("PRINTING_ASSIGNED", "PACKING_CONFIRMED")).toBe(true);
    expect(canOfflineTransition("PACKING_CONFIRMED", "DISPATCHED")).toBe(true);
    expect(canOfflineTransition("DISPATCHED", "PICKED_UP")).toBe(true);
    expect(canOfflineTransition("PICKED_UP", "DELIVERED")).toBe(true);
    expect(canOfflineTransition("DELIVERED", "ACKNOWLEDGED")).toBe(true);

    // Terminal states cannot transition further
    expect(canOfflineTransition("ACKNOWLEDGED", "CREATED")).toBe(false);
    expect(canOfflineTransition("CANCELLED", "CREATED")).toBe(false);
  });

  it("prevents skipping steps in the pipeline", () => {
    expect(canOfflineTransition("CREATED", "DISPATCHED")).toBe(false);
    expect(canOfflineTransition("CREATED", "PACKING_CONFIRMED")).toBe(false);
    expect(canOfflineTransition("PRINTING_ASSIGNED", "DELIVERED")).toBe(false);
    expect(canOfflineTransition("PACKING_CONFIRMED", "PICKED_UP")).toBe(false);
  });

  it("allows cancellation from open statuses", () => {
    expect(canOfflineTransition("CREATED", "CANCELLED")).toBe(true);
    expect(canOfflineTransition("PRINTING_ASSIGNED", "CANCELLED")).toBe(true);
    expect(canOfflineTransition("PACKING_CONFIRMED", "CANCELLED")).toBe(true);
    expect(canOfflineTransition("DISPATCHED", "CANCELLED")).toBe(true);
    expect(canOfflineTransition("PICKED_UP", "CANCELLED")).toBe(true);
    expect(canOfflineTransition("ACKNOWLEDGED", "CANCELLED")).toBe(false);
  });
});

describe("offline workflow assertions & available actions", () => {
  it("asserts valid transitions and throws on illegal ones", () => {
    expect(() =>
      assertOfflineWorkflowAction("BOSS", "CREATE_OFFLINE_ORDER"),
    ).not.toThrow();

    expect(() =>
      assertOfflineWorkflowAction("PRINTING", "CONFIRM_PRINTING", "CREATED", "PRINTING_ASSIGNED"),
    ).not.toThrow();

    expect(() =>
      assertOfflineWorkflowAction("HR", "CONFIRM_PRINTING"),
    ).toThrow(/HR cannot perform CONFIRM_PRINTING/);

    expect(() =>
      assertOfflineWorkflowAction("CONSIGNMENT", "CONFIRM_PACKING", "CREATED", "PACKING_CONFIRMED"),
    ).toThrow(/Invalid status transition/);
  });

  it("computes correct available actions based on role and status", () => {
    expect(availableOfflineActions("PRINTING", "CREATED")).toContain("CONFIRM_PRINTING");
    expect(availableOfflineActions("HR", "CREATED")).not.toContain("CONFIRM_PRINTING");

    expect(availableOfflineActions("CONSIGNMENT", "PRINTING_ASSIGNED")).toContain("CONFIRM_PACKING");
    expect(availableOfflineActions("HR", "PACKING_CONFIRMED")).toContain("DISPATCH_ORDER");
    expect(availableOfflineActions("CONSIGNMENT", "DISPATCHED")).toContain("CONFIRM_PICKUP");
    expect(availableOfflineActions("HR", "PICKED_UP")).toContain("CONFIRM_DELIVERY");
    expect(availableOfflineActions("BOSS", "DELIVERED")).toContain("ACKNOWLEDGE_ORDER");
  });

  it("formats status labels nicely", () => {
    expect(formatOfflineStatus("CREATED")).toBe("New Order");
    expect(formatOfflineStatus("PACKING_CONFIRMED")).toBe("Packing Confirmed");
    expect(formatOfflineStatus("DISPATCHED")).toBe("Dispatched");
    expect(formatOfflineStatus("DELIVERED")).toBe("Delivered");
  });
});

describe("offline order validation schemas", () => {
  it("validates offline order creation inputs", () => {
    const valid = createOfflineOrderSchema.safeParse({
      so_number: "SO - OFLN115",
      brand: "averX",
      product_name: "GARBAGE BAG ROLL - 24X32 - BLACK",
      quantity: "400",
      unit: "Rolls",
      logistics_partner: "Delhivery",
      dispatch_date: "2026-09-04",
      notes: "Carton count pending with Kartik Da",
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.quantity).toBe(400);
      expect(valid.data.so_number).toBe("SO - OFLN115");
    }

    const invalid = createOfflineOrderSchema.safeParse({
      so_number: "",
      product_name: "",
      quantity: 0,
    });
    expect(invalid.success).toBe(false);
  });

  it("validates packing confirmation inputs", () => {
    const valid = confirmPackingSchema.safeParse({
      order_id: "a0000000-0000-4000-8000-000000000001",
      carton_count: "3",
      carton_dimensions: "56X32X38",
      carton_weight_kg: "57",
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.carton_count).toBe(3);
      expect(valid.data.carton_weight_kg).toBe(57);
    }
  });

  it("validates dispatch inputs with optional tracking link", () => {
    const valid = dispatchOrderSchema.safeParse({
      order_id: "a0000000-0000-4000-8000-000000000001",
      lr_number: "DEL123456",
      tracking_url: "https://delhivery.com/track/123",
      logistics_partner: "Delhivery",
    });
    expect(valid.success).toBe(true);

    const invalidUrl = dispatchOrderSchema.safeParse({
      order_id: "a0000000-0000-4000-8000-000000000001",
      tracking_url: "not-a-url",
    });
    expect(invalidUrl.success).toBe(false);
  });

  it("validates delivery confirmation inputs", () => {
    const valid = confirmDeliverySchema.safeParse({
      order_id: "a0000000-0000-4000-8000-000000000001",
      pod_notes: "Received by security guard with stamp",
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.pod_notes).toBe("Received by security guard with stamp");
    }
  });
});
