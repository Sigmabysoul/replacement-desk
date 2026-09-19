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
  updateOfflineOrderNumberSchema,
} from "@/lib/offline-orders/validation";

describe("offline workflow permissions", () => {
  it("allows Boss to create, acknowledge, and cancel offline orders", () => {
    expect(canPerformOffline("BOSS", "CREATE_OFFLINE_ORDER")).toBe(true);
    expect(canPerformOffline("BOSS", "ACKNOWLEDGE_ORDER")).toBe(true);
    expect(canPerformOffline("BOSS", "CANCEL_ORDER")).toBe(true);
    expect(canPerformOffline("BOSS", "CONFIRM_PRINTING")).toBe(false);
    expect(canPerformOffline("BOSS", "CONFIRM_PACKING")).toBe(false);
    expect(canPerformOffline("BOSS", "DISPATCH_PREPARE")).toBe(false);
  });

  it("allows Print team to confirm printing only", () => {
    expect(canPerformOffline("PRINTING", "CONFIRM_PRINTING")).toBe(true);
    expect(canPerformOffline("PRINTING", "CONFIRM_PACKING")).toBe(false);
    expect(canPerformOffline("PRINTING", "DISPATCH_PREPARE")).toBe(false);
    expect(canPerformOffline("PRINTING", "ACKNOWLEDGE_ORDER")).toBe(false);
  });

  it("allows Consignment team to confirm packing and courier pickup", () => {
    expect(canPerformOffline("CONSIGNMENT", "CONFIRM_PACKING")).toBe(true);
    expect(canPerformOffline("CONSIGNMENT", "CONFIRM_PICKUP")).toBe(true);
    expect(canPerformOffline("CONSIGNMENT", "DISPATCH_PREPARE")).toBe(false);
    expect(canPerformOffline("CONSIGNMENT", "CONFIRM_DELIVERY")).toBe(false);
  });

  it("allows HR team to prepare dispatch and confirm delivery with POD", () => {
    expect(canPerformOffline("HR", "DISPATCH_PREPARE")).toBe(true);
    expect(canPerformOffline("HR", "CONFIRM_DELIVERY")).toBe(true);
    expect(canPerformOffline("HR", "CONFIRM_PACKING")).toBe(false);
    expect(canPerformOffline("HR", "CONFIRM_PICKUP")).toBe(false);
  });

  it("allows Admin to perform all operational actions", () => {
    expect(canPerformOffline("ADMIN", "CREATE_OFFLINE_ORDER")).toBe(true);
    expect(canPerformOffline("ADMIN", "CONFIRM_PACKING")).toBe(true);
    expect(canPerformOffline("ADMIN", "DISPATCH_PREPARE")).toBe(true);
    expect(canPerformOffline("ADMIN", "CONFIRM_PRINTING")).toBe(true);
    expect(canPerformOffline("ADMIN", "CONFIRM_PICKUP")).toBe(true);
    expect(canPerformOffline("ADMIN", "CONFIRM_DELIVERY")).toBe(true);
    expect(canPerformOffline("ADMIN", "ACKNOWLEDGE_ORDER")).toBe(true);
    expect(canPerformOffline("ADMIN", "CANCEL_ORDER")).toBe(true);
  });

  it("supports users holding multiple roles", () => {
    // Abid as PACKING + PRINTING
    const abidRoles = ["PACKING", "PRINTING"] as const;
    expect(canPerformOffline(abidRoles, "CONFIRM_PRINTING")).toBe(true);
    expect(canPerformOffline(abidRoles, "CONFIRM_PACKING")).toBe(false); // only CONSIGNMENT/ADMIN confirms offline packing
    expect(canPerformOffline(abidRoles, "DISPATCH_PREPARE")).toBe(false);

    // Esha as CUSTOMER_SUPPORT + HR
    const eshaRoles = ["CUSTOMER_SUPPORT", "HR"] as const;
    expect(canPerformOffline(eshaRoles, "DISPATCH_PREPARE")).toBe(true);
    expect(canPerformOffline(eshaRoles, "CONFIRM_DELIVERY")).toBe(true);
    expect(canPerformOffline(eshaRoles, "CONFIRM_PRINTING")).toBe(false);
  });
});

describe("offline workflow status transitions", () => {
  it("enforces the revised sequence: CREATED -> PACKING_CONFIRMED -> DISPATCH_PREPARED -> PRINTED -> PICKED_UP -> DELIVERED -> ACKNOWLEDGED", () => {
    expect(canOfflineTransition("CREATED", "PACKING_CONFIRMED")).toBe(true);
    expect(canOfflineTransition("PACKING_CONFIRMED", "DISPATCH_PREPARED")).toBe(true);
    expect(canOfflineTransition("DISPATCH_PREPARED", "PRINTED")).toBe(true);
    expect(canOfflineTransition("PRINTED", "PICKED_UP")).toBe(true);
    expect(canOfflineTransition("PICKED_UP", "DELIVERED")).toBe(true);
    expect(canOfflineTransition("DELIVERED", "ACKNOWLEDGED")).toBe(true);

    // Terminal states cannot transition further
    expect(canOfflineTransition("ACKNOWLEDGED", "CREATED")).toBe(false);
    expect(canOfflineTransition("CANCELLED", "CREATED")).toBe(false);
  });

  it("prevents skipping steps in the pipeline", () => {
    expect(canOfflineTransition("CREATED", "DISPATCH_PREPARED")).toBe(false);
    expect(canOfflineTransition("CREATED", "PRINTED")).toBe(false);
    expect(canOfflineTransition("PACKING_CONFIRMED", "PRINTED")).toBe(false);
    expect(canOfflineTransition("DISPATCH_PREPARED", "PICKED_UP")).toBe(false);
    expect(canOfflineTransition("PRINTED", "DELIVERED")).toBe(false);
  });

  it("allows cancellation from open statuses", () => {
    expect(canOfflineTransition("CREATED", "CANCELLED")).toBe(true);
    expect(canOfflineTransition("PACKING_CONFIRMED", "CANCELLED")).toBe(true);
    expect(canOfflineTransition("DISPATCH_PREPARED", "CANCELLED")).toBe(true);
    expect(canOfflineTransition("PRINTED", "CANCELLED")).toBe(true);
    expect(canOfflineTransition("PICKED_UP", "CANCELLED")).toBe(true);
    expect(canOfflineTransition("DELIVERED", "CANCELLED")).toBe(false);
    expect(canOfflineTransition("ACKNOWLEDGED", "CANCELLED")).toBe(false);
  });
});

describe("offline workflow assertions & available actions", () => {
  it("asserts valid transitions and throws on illegal ones", () => {
    expect(() =>
      assertOfflineWorkflowAction("BOSS", "CREATE_OFFLINE_ORDER"),
    ).not.toThrow();

    expect(() =>
      assertOfflineWorkflowAction("CONSIGNMENT", "CONFIRM_PACKING", "CREATED", "PACKING_CONFIRMED"),
    ).not.toThrow();

    expect(() =>
      assertOfflineWorkflowAction("HR", "CONFIRM_PRINTING"),
    ).toThrow(/HR cannot perform CONFIRM_PRINTING/);

    expect(() =>
      assertOfflineWorkflowAction("PRINTING", "CONFIRM_PRINTING", "CREATED", "PRINTED"),
    ).toThrow(/Invalid status transition/);
  });

  it("computes correct available actions based on role and status", () => {
    expect(availableOfflineActions("CONSIGNMENT", "CREATED")).toContain("CONFIRM_PACKING");
    expect(availableOfflineActions("HR", "CREATED")).not.toContain("CONFIRM_PACKING");

    expect(availableOfflineActions("HR", "PACKING_CONFIRMED")).toContain("DISPATCH_PREPARE");
    expect(availableOfflineActions("PRINTING", "DISPATCH_PREPARED")).toContain("CONFIRM_PRINTING");
    expect(availableOfflineActions("CONSIGNMENT", "PRINTED")).toContain("CONFIRM_PICKUP");
    expect(availableOfflineActions("HR", "PICKED_UP")).toContain("CONFIRM_DELIVERY");
    expect(availableOfflineActions("BOSS", "DELIVERED")).toContain("ACKNOWLEDGE_ORDER");
  });

  it("computes available actions for users with multiple roles", () => {
    const multiRole = ["CONSIGNMENT", "HR"] as const;
    expect(availableOfflineActions(multiRole, "CREATED")).toContain("CONFIRM_PACKING");
    expect(availableOfflineActions(multiRole, "PACKING_CONFIRMED")).toContain("DISPATCH_PREPARE");
    expect(availableOfflineActions(multiRole, "PRINTED")).toContain("CONFIRM_PICKUP");
    expect(availableOfflineActions(multiRole, "PICKED_UP")).toContain("CONFIRM_DELIVERY");
  });

  it("formats status labels nicely", () => {
    expect(formatOfflineStatus("CREATED")).toBe("New Order");
    expect(formatOfflineStatus("PACKING_CONFIRMED")).toBe("Packing Confirmed");
    expect(formatOfflineStatus("DISPATCH_PREPARED")).toBe("Dispatch Prepared");
    expect(formatOfflineStatus("PRINTED")).toBe("Materials Printed");
    expect(formatOfflineStatus("PICKED_UP")).toBe("Picked Up");
    expect(formatOfflineStatus("DELIVERED")).toBe("Delivered");
    expect(formatOfflineStatus("ACKNOWLEDGED")).toBe("Acknowledged");
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

  it("validates offline order creation with custom numeric order number", () => {
    const valid = createOfflineOrderSchema.safeParse({
      so_number: "OFLN120",
      product_name: "Rolls",
      quantity: 50,
      order_number: "620",
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.order_number).toBe(620);
    }

    const invalid = createOfflineOrderSchema.safeParse({
      so_number: "OFLN120",
      product_name: "Rolls",
      quantity: 50,
      order_number: "-5",
    });
    expect(invalid.success).toBe(false);
  });

  it("validates offline order number update schema", () => {
    const valid = updateOfflineOrderNumberSchema.safeParse({
      order_id: "a0000000-0000-4000-8000-000000000001",
      order_number: "700",
    });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.order_number).toBe(700);
    }

    const invalid = updateOfflineOrderNumberSchema.safeParse({
      order_id: "a0000000-0000-4000-8000-000000000001",
      order_number: "0",
    });
    expect(invalid.success).toBe(false);
  });
});
