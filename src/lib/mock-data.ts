import type { Replacement, ReplacementStatus } from "@/lib/types";

export const initialMockReplacements: Replacement[] = [
  {
    id: "e58ed763-928c-4155-bee9-fdbaaadc15f1",
    replacement_number: "REP-2026-0001",
    order_reference: "FK-882319",
    customer_name: "John Miller",
    customer_reference: "CUST-4412",
    product_name: "Heavy Duty Garbage Bags 50L (Roll of 30)",
    quantity: 2,
    reason: "Damaged box during transit, rolls punctured",
    notes: "Customer requested expedited replacement.",
    status: "NEW",
    created_by: "demo-esha-id",
    created_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    label_printed_at: null,
    qc_submitted_at: null,
    qc_approved_at: null,
    packed_at: null,
    shipped_at: null,
    needs_token_at: null,
    creator: { full_name: "Esha (Operations)" },
  },
  {
    id: "e58ed763-928c-4155-bee9-fdbaaadc15f2",
    replacement_number: "REP-2026-0002",
    order_reference: "FK-882450",
    customer_name: "Sarah Chen",
    customer_reference: "CUST-9901",
    product_name: "Biodegradable Food Prep Gloves (Box of 100)",
    quantity: 1,
    reason: "Wrong size dispatched in original shipment",
    notes: "Verified size L needed instead of M.",
    status: "LABEL_PRINTED",
    created_by: "demo-esha-id",
    created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 80).toISOString(),
    label_printed_at: new Date(Date.now() - 1000 * 60 * 80).toISOString(),
    qc_submitted_at: null,
    qc_approved_at: null,
    packed_at: null,
    shipped_at: null,
    needs_token_at: null,
    creator: { full_name: "Esha (Operations)" },
  },
  {
    id: "e58ed763-928c-4155-bee9-fdbaaadc15f3",
    replacement_number: "REP-2026-0003",
    order_reference: "FK-882512",
    customer_name: "David Kim",
    customer_reference: "CUST-1044",
    product_name: "Industrial Stretch Wrap 500mm x 300m",
    quantity: 3,
    reason: "Missing item in main order delivery",
    notes: "Packing team ready to inspect and package.",
    status: "QC_PENDING",
    created_by: "demo-esha-id",
    created_at: new Date(Date.now() - 1000 * 60 * 200).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    label_printed_at: new Date(Date.now() - 1000 * 60 * 150).toISOString(),
    qc_submitted_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    qc_approved_at: null,
    packed_at: null,
    shipped_at: null,
    needs_token_at: null,
    creator: { full_name: "Esha (Operations)" },
  },
  {
    id: "e58ed763-928c-4155-bee9-fdbaaadc15f4",
    replacement_number: "REP-2026-0004",
    order_reference: "FK-882601",
    customer_name: "Elena Rostova",
    customer_reference: "CUST-3810",
    product_name: "Eco Bubble Pouch 200x300mm (Pack of 50)",
    quantity: 1,
    reason: "Defective seal",
    notes: "QC approved, ready to be boxed for courier pickup.",
    status: "QC_APPROVED",
    created_by: "demo-esha-id",
    created_at: new Date(Date.now() - 1000 * 60 * 300).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    label_printed_at: new Date(Date.now() - 1000 * 60 * 250).toISOString(),
    qc_submitted_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    qc_approved_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    packed_at: null,
    shipped_at: null,
    needs_token_at: null,
    creator: { full_name: "Esha (Operations)" },
  },
  {
    id: "e58ed763-928c-4155-bee9-fdbaaadc15f5",
    replacement_number: "REP-2026-0005",
    order_reference: "FK-882740",
    customer_name: "Marcus Aurelius",
    customer_reference: "CUST-5519",
    product_name: "Kraft Paper Tape 48mm x 50m (Carton of 6)",
    quantity: 1,
    reason: "Tape adhesive dried up / defective batch",
    notes: "Packed and placed on dispatch rack 2.",
    status: "PACKED",
    created_by: "demo-esha-id",
    created_at: new Date(Date.now() - 1000 * 60 * 420).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    label_printed_at: new Date(Date.now() - 1000 * 60 * 380).toISOString(),
    qc_submitted_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    qc_approved_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    packed_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    shipped_at: null,
    needs_token_at: null,
    creator: { full_name: "Esha (Operations)" },
  },
  {
    id: "e58ed763-928c-4155-bee9-fdbaaadc15f6",
    replacement_number: "REP-2026-0006",
    order_reference: "FK-882890",
    customer_name: "Liam O'Connor",
    customer_reference: "CUST-7231",
    product_name: "Thermal Shipping Labels 4x6 inch (Roll of 500)",
    quantity: 4,
    reason: "Courier damaged parcel on arrival",
    notes: "Handed over to carrier dispatch.",
    status: "SHIPPED",
    created_by: "demo-esha-id",
    created_at: new Date(Date.now() - 1000 * 60 * 600).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    label_printed_at: new Date(Date.now() - 1000 * 60 * 540).toISOString(),
    qc_submitted_at: new Date(Date.now() - 1000 * 60 * 300).toISOString(),
    qc_approved_at: new Date(Date.now() - 1000 * 60 * 280).toISOString(),
    packed_at: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    shipped_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    needs_token_at: null,
    creator: { full_name: "Esha (Operations)" },
  },
];

// Global in-memory storage for demo fallback mode
const globalReplacements = new Map<string, Replacement>(
  initialMockReplacements.map((r) => [r.id, { ...r }])
);

export function getMockReplacements(filters?: { q?: string; status?: string; date?: string }): Replacement[] {
  let list = Array.from(globalReplacements.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  if (filters?.q) {
    const q = filters.q.toLowerCase().trim();
    list = list.filter(
      (r) =>
        r.replacement_number.toLowerCase().includes(q) ||
        r.order_reference.toLowerCase().includes(q) ||
        r.product_name.toLowerCase().includes(q) ||
        (r.customer_name && r.customer_name.toLowerCase().includes(q))
    );
  }

  if (filters?.status) {
    list = list.filter((r) => r.status === filters.status);
  }

  if (filters?.date) {
    list = list.filter((r) => r.created_at.startsWith(filters.date!));
  }

  return list;
}

export function getMockReplacement(id: string): Replacement | null {
  return globalReplacements.get(id) ?? null;
}

export function addMockReplacement(record: Replacement) {
  globalReplacements.set(record.id, record);
}

export function updateMockReplacementStatus(id: string, newStatus: ReplacementStatus): Replacement | null {
  const existing = globalReplacements.get(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated: Replacement = {
    ...existing,
    status: newStatus,
    updated_at: now,
  };

  if (newStatus === "LABEL_PRINTED") updated.label_printed_at = now;
  else if (newStatus === "QC_PENDING") updated.qc_submitted_at = now;
  else if (newStatus === "QC_APPROVED") updated.qc_approved_at = now;
  else if (newStatus === "PACKED") updated.packed_at = now;
  else if (newStatus === "SHIPPED") updated.shipped_at = now;
  else if (newStatus === "NEEDS_TOKEN") updated.needs_token_at = now;

  globalReplacements.set(id, updated);
  return updated;
}
