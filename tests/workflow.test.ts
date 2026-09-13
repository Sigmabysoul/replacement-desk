import { describe, expect, it } from "vitest";
import {
  assertWorkflowAction,
  availableActions,
  canPerform,
  canTransition,
  nextReplacementNumber,
} from "@/lib/replacements/workflow";
import {
  commentSchema,
  replacementSchema,
  transitionSchema,
} from "@/lib/replacements/validation";
import { formatTelegramMessage } from "@/lib/notifications/format";
import { safeFileName } from "@/lib/utils";
import { validateMagicBytes } from "@/lib/security/magic-bytes";
import { checkRateLimit, resetRateLimit } from "@/lib/security/rate-limit";

describe("replacement workflow permissions", () => {
  it("keeps Logistics limited to label upload", () => {
    expect(canPerform("LOGISTICS", "UPLOAD_LABEL")).toBe(true);
    expect(canPerform("LOGISTICS", "APPROVE_QC")).toBe(false);
    expect(canPerform("LOGISTICS", "SUBMIT_QC")).toBe(false);
    expect(canPerform("LOGISTICS", "MARK_SHIPPED")).toBe(false);
  });

  it("keeps Printing limited to print confirmation", () => {
    expect(canPerform("PRINTING", "MARK_LABEL_PRINTED")).toBe(true);
    expect(canPerform("PRINTING", "SUBMIT_QC")).toBe(false);
    expect(canPerform("PRINTING", "MARK_PACKED")).toBe(false);
  });

  it("allows Esha to review QC but not finish dispatch", () => {
    expect(canPerform("ESHA", "APPROVE_QC")).toBe(true);
    expect(canPerform("ESHA", "REJECT_QC")).toBe(true);
    expect(canPerform("ESHA", "MARK_SHIPPED")).toBe(false);
    expect(canPerform("ESHA", "MARK_NEEDS_TOKEN")).toBe(false);
  });

  it("allows Packing to submit QC, pack, and finish dispatch", () => {
    expect(canPerform("PACKING", "SUBMIT_QC")).toBe(true);
    expect(canPerform("PACKING", "MARK_PACKED")).toBe(true);
    expect(canPerform("PACKING", "MARK_SHIPPED")).toBe(true);
    expect(canPerform("PACKING", "MARK_NEEDS_TOKEN")).toBe(true);
  });

  it("allows admin to perform all actions", () => {
    expect(canPerform("ADMIN", "CREATE_REPLACEMENT")).toBe(true);
    expect(canPerform("ADMIN", "UPLOAD_LABEL")).toBe(true);
    expect(canPerform("ADMIN", "MARK_LABEL_PRINTED")).toBe(true);
    expect(canPerform("ADMIN", "SUBMIT_QC")).toBe(true);
    expect(canPerform("ADMIN", "APPROVE_QC")).toBe(true);
    expect(canPerform("ADMIN", "REJECT_QC")).toBe(true);
    expect(canPerform("ADMIN", "MARK_PACKED")).toBe(true);
    expect(canPerform("ADMIN", "MARK_SHIPPED")).toBe(true);
    expect(canPerform("ADMIN", "CANCEL_REPLACEMENT")).toBe(true);
  });
});

describe("replacement workflow status transitions", () => {
  it("requires label upload before Printing can mark it printed", () => {
    expect(canTransition("NEW", "LABEL_UPLOADED")).toBe(true);
    expect(canTransition("NEW", "LABEL_PRINTED")).toBe(false);
    expect(canTransition("LABEL_UPLOADED", "LABEL_PRINTED")).toBe(true);
  });

  it("cannot pack before approval", () => {
    expect(canTransition("QC_PENDING", "PACKED")).toBe(false);
    expect(() => assertWorkflowAction("PACKING", "MARK_PACKED", "QC_PENDING", "PACKED")).toThrow();
  });

  it("allows rejected QC to be resubmitted", () => {
    expect(canTransition("QC_REJECTED", "QC_PENDING")).toBe(true);
  });

  it("allows approved QC to be packed", () => {
    expect(canTransition("QC_APPROVED", "PACKED")).toBe(true);
  });

  it.each(["SHIPPED", "NEEDS_TOKEN"] as const)("allows packed to become %s", (target) => {
    expect(canTransition("PACKED", target)).toBe(true);
  });

  it("allows needs token to become shipped upon pickup", () => {
    expect(canTransition("NEEDS_TOKEN", "SHIPPED")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(canTransition("NEW", "SHIPPED")).toBe(false);
    expect(canTransition("SHIPPED", "PACKED")).toBe(false);
    expect(canTransition("CANCELLED", "NEW")).toBe(false);
  });

  it("enforces role authorization", () => {
    expect(() => assertWorkflowAction("LOGISTICS", "APPROVE_QC")).toThrow("LOGISTICS cannot perform APPROVE_QC");
  });

  it("determines available actions accurately", () => {
    expect(availableActions("LOGISTICS", "NEW")).toContain("UPLOAD_LABEL");
    expect(availableActions("PRINTING", "LABEL_UPLOADED")).toContain("MARK_LABEL_PRINTED");
    expect(availableActions("PACKING", "LABEL_PRINTED")).toContain("SUBMIT_QC");
    expect(availableActions("PACKING", "QC_REJECTED")).toContain("SUBMIT_QC");
    expect(availableActions("ESHA", "QC_PENDING")).toEqual(
      expect.arrayContaining(["APPROVE_QC", "REJECT_QC"])
    );
    expect(availableActions("PACKING", "QC_APPROVED")).toContain("MARK_PACKED");
    expect(availableActions("PACKING", "PACKED")).toEqual(
      expect.arrayContaining(["MARK_SHIPPED", "MARK_NEEDS_TOKEN"])
    );
  });
});

describe("replacement number generation", () => {
  it("formats replacement numbers with 4-digit padding", () => {
    expect(nextReplacementNumber(2026, 1)).toBe("REP-2026-0001");
    expect(nextReplacementNumber(2026, 42)).toBe("REP-2026-0042");
    expect(nextReplacementNumber(2026, 9999)).toBe("REP-2026-9999");
  });

  it("rejects invalid years or sequence numbers", () => {
    expect(() => nextReplacementNumber(1999, 1)).toThrow("Invalid year");
    expect(() => nextReplacementNumber(10000, 1)).toThrow("Invalid year");
    expect(() => nextReplacementNumber(2026, 0)).toThrow("Invalid sequence");
    expect(() => nextReplacementNumber(2026, 10000)).toThrow("Invalid sequence");
  });
});

describe("schema validation", () => {
  it("validates valid replacement input", () => {
    const result = replacementSchema.safeParse({
      order_reference: "FK123456",
      product_name: "Garbage Bag 30L",
      quantity: "2",
      reason: "Damaged",
      notes: "Handle with care",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.quantity).toBe(2);
      expect(result.data.reason).toBe("Damaged");
    }
  });

  it("supports custom reason", () => {
    const result = replacementSchema.safeParse({
      order_reference: "FK123456",
      product_name: "Garbage Bag 30L",
      quantity: 1,
      reason: "Seal broken during transit",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe("Seal broken during transit");
    }
  });

  it("rejects empty order reference and invalid quantity", () => {
    expect(replacementSchema.safeParse({ order_reference: "", product_name: "Test", quantity: 1 }).success).toBe(false);
    expect(replacementSchema.safeParse({ order_reference: "123", product_name: "Test", quantity: 0 }).success).toBe(false);
    expect(replacementSchema.safeParse({ order_reference: "123", product_name: "Test", quantity: 1000 }).success).toBe(false);
  });

  it("accepts only http(s) tracking links", () => {
    expect(replacementSchema.safeParse({ order_reference: "123", product_name: "Test", quantity: 1, tracking_url: "https://track.example/ABC" }).success).toBe(true);
    expect(replacementSchema.safeParse({ order_reference: "123", product_name: "Test", quantity: 1, tracking_url: "javascript:alert(1)" }).success).toBe(false);
  });

  it("validates comments", () => {
    expect(commentSchema.safeParse({ replacement_id: "e58ed763-928c-4155-bee9-fdbaaadc15f3", message: "Hello" }).success).toBe(true);
    expect(commentSchema.safeParse({ replacement_id: "e58ed763-928c-4155-bee9-fdbaaadc15f3", message: "" }).success).toBe(false);
  });

  it("validates transition schemas", () => {
    expect(transitionSchema.safeParse({
      replacement_id: "e58ed763-928c-4155-bee9-fdbaaadc15f3",
      target_status: "LABEL_PRINTED",
    }).success).toBe(true);
  });
});

describe("safeFileName", () => {
  it("sanitizes file names cleanly", () => {
    expect(safeFileName("My Photo (1) [QC].JPEG")).toBe("my-photo-1-qc.jpeg");
    expect(safeFileName("special$$#@!name.pdf")).toBe("special-name.pdf");
    expect(safeFileName("")).toBe("upload");
  });
});

describe("telegram notification formatting", () => {
  const mockRep = {
    id: "rep-uuid-1234",
    replacement_number: "REP-2026-0012",
    product_name: "Garbage Bag 30L",
    quantity: 2,
  };
  const appUrl = "https://app.example.com";

  it("formats NEW_REPLACEMENT according to Section 10", () => {
    const msg = formatTelegramMessage("NEW_REPLACEMENT", mockRep, appUrl, undefined, "Esha");
    expect(msg).toContain("🔔 NEW REPLACEMENT");
    expect(msg).toContain("REP-2026-0012");
    expect(msg).toContain("Product: Garbage Bag 30L");
    expect(msg).toContain("Qty: 2");
    expect(msg).toContain("Requested by: Esha");
    expect(msg).toContain("Open: https://app.example.com/replacements/rep-uuid-1234");
  });

  it("formats LABEL_PRINTED according to Section 10", () => {
    const msg = formatTelegramMessage("LABEL_PRINTED", mockRep, appUrl);
    expect(msg).toContain("🖨 LABEL PRINTED");
    expect(msg).toContain("The replacement label has been printed.");
  });

  it("formats LABEL_UPLOADED for Printing", () => {
    const msg = formatTelegramMessage("LABEL_UPLOADED", mockRep, appUrl);
    expect(msg).toContain("🏷 LABEL READY FOR PRINTING");
    expect(msg).toContain("Logistics uploaded the shipping label");
  });

  it("formats QC_SUBMITTED for Esha", () => {
    const msg = formatTelegramMessage("QC_SUBMITTED", mockRep, appUrl);
    expect(msg).toContain("📸 QC APPROVAL REQUIRED");
    expect(msg).toContain("Packing submitted QC photos");
  });

  it("formats QC_REJECTED with reason according to Section 10", () => {
    const msg = formatTelegramMessage("QC_REJECTED", mockRep, appUrl, "Seal damaged. Please replace.");
    expect(msg).toContain("❌ QC REJECTED");
    expect(msg).toContain("Reason: Seal damaged. Please replace.");
    expect(msg).toContain("Please replace/fix the product and submit QC again.");
  });

  it("formats QC_APPROVED according to Section 10", () => {
    const msg = formatTelegramMessage("QC_APPROVED", mockRep, appUrl);
    expect(msg).toContain("✅ QC APPROVED");
    expect(msg).toContain("The product is approved and can now be packed.");
  });

  it("formats PACKED according to Section 10", () => {
    const msg = formatTelegramMessage("PACKED", mockRep, appUrl);
    expect(msg).toContain("📦 REPLACEMENT PACKED");
    expect(msg).toContain("Ready for dispatch.");
  });

  it("formats NEEDS_TOKEN according to Section 10", () => {
    const msg = formatTelegramMessage("NEEDS_TOKEN", mockRep, appUrl);
    expect(msg).toContain("⚠️ NEEDS TOKEN");
    expect(msg).toContain("The replacement was not picked up.");
  });

  it("formats SHIPPED according to Section 10", () => {
    const msg = formatTelegramMessage("SHIPPED", mockRep, appUrl);
    expect(msg).toContain("🚚 REPLACEMENT SHIPPED");
    expect(msg).toContain("Replacement completed.");
  });
});

describe("security: binary magic byte validation", () => {
  it("recognizes valid JPEG file signature", () => {
    const header = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    expect(validateMagicBytes(header, "image/jpeg")).toBe(true);
    expect(validateMagicBytes(header, "image/png")).toBe(false);
  });

  it("recognizes valid PNG file signature", () => {
    const header = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(validateMagicBytes(header, "image/png")).toBe(true);
    expect(validateMagicBytes(header, "image/jpeg")).toBe(false);
  });

  it("recognizes valid WebP file signature", () => {
    const header = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, // WEBP
    ]);
    expect(validateMagicBytes(header, "image/webp")).toBe(true);
    expect(validateMagicBytes(header, "image/png")).toBe(false);
  });

  it("recognizes valid PDF file signature", () => {
    const header = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    expect(validateMagicBytes(header, "application/pdf")).toBe(true);
    expect(validateMagicBytes(header, "image/jpeg")).toBe(false);
  });

  it("rejects spoofed executable masquerading as an image", () => {
    const exeHeader = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]); // MZ executable header
    expect(validateMagicBytes(exeHeader, "image/jpeg")).toBe(false);
    expect(validateMagicBytes(exeHeader, "image/png")).toBe(false);
    expect(validateMagicBytes(exeHeader, "application/pdf")).toBe(false);
  });
});

describe("security: sliding window rate limiter", () => {
  it("enforces max attempts and blocks brute force", () => {
    const testKey = `test-ip-${Date.now()}`;
    for (let i = 1; i <= 5; i++) {
      const res = checkRateLimit(testKey, 5, 60000);
      expect(res.allowed).toBe(true);
    }
    // 6th attempt must be blocked
    const blocked = checkRateLimit(testKey, 5, 60000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);

    // Resetting clears the limit
    resetRateLimit(testKey);
    expect(checkRateLimit(testKey, 5, 60000).allowed).toBe(true);
  });
});
