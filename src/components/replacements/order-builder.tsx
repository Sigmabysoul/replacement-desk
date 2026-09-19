"use client";

import { useMemo, useState } from "react";
import { CirclePlus, Package, Trash2, UserRound } from "lucide-react";
import { ProductPhotoPicker } from "@/components/replacements/product-photo-picker";
import { ReasonSelect } from "@/components/replacements/reason-select";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { DimensionPreset } from "@/lib/types";

type ItemDraft = { id: string; productName: string; quantity: string };
const newItem = (id = crypto.randomUUID()): ItemDraft => ({ id, productName: "", quantity: "1" });

export function OrderBuilder({ action, presets, isAdmin, startingOrderNumber }: {
  action: (formData: FormData) => Promise<void>;
  presets: DimensionPreset[];
  isAdmin: boolean;
  startingOrderNumber: number;
}) {
  const [orderId] = useState("order-1");
  const [orderNumber, setOrderNumber] = useState(String(startingOrderNumber));
  const [customer, setCustomer] = useState({ name: "", address: "", email: "", phone: "" });
  const [items, setItems] = useState<ItemDraft[]>([newItem("item-1")]);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [shippingSpeed, setShippingSpeed] = useState<"STANDARD" | "EXPRESS">("STANDARD");
  const [presetId, setPresetId] = useState("");
  const [dimensions, setDimensions] = useState({ length: "", breadth: "", height: "" });

  const manifest = useMemo(() => [{
    id: orderId,
    requested_order_number: orderNumber ? Number(orderNumber) : null,
    order_type: "REPLACEMENT" as const,
    order_reference: `REF-${orderNumber}`,
    customer_name: customer.name,
    customer_reference: null,
    customer_address: customer.address,
    customer_email: customer.email.toLowerCase(),
    customer_phone: customer.phone,
    product_name: items[0]?.productName ?? "",
    quantity: items[0]?.quantity ?? "1",
    reason,
    notes,
    shipping_speed: shippingSpeed,
    dimension_preset_id: presetId,
    length_cm: dimensions.length,
    breadth_cm: dimensions.breadth,
    height_cm: dimensions.height,
  }], [customer, dimensions, items, notes, orderId, orderNumber, presetId, reason, shippingSpeed]);

  const itemManifest = useMemo(() => items.map((item) => ({ product_name: item.productName, quantity: item.quantity })), [items]);

  function updateItem(id: string, patch: Partial<ItemDraft>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function choosePreset(id: string) {
    setPresetId(id);
    const preset = presets.find((item) => item.id === id);
    setDimensions(preset ? { length: String(preset.length_cm), breadth: String(preset.breadth_cm), height: String(preset.height_cm) } : { length: "", breadth: "", height: "" });
  }

  return (
    <form action={action} className="grid gap-6">
      <input type="hidden" name="orders_manifest" value={JSON.stringify(manifest)} />
      <input type="hidden" name="items_manifest" value={JSON.stringify(itemManifest)} />

      <Card className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
        <div className="flex items-center gap-2 sm:col-span-2"><UserRound className="size-5 text-indigo-600" /><h2 className="font-black text-foreground">Customer details</h2></div>
        <Field label="Customer name"><Input value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} maxLength={120} /></Field>
        <Field label="Customer email"><Input type="email" inputMode="email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value.toLowerCase() })} className="lowercase" maxLength={254} /></Field>
        <Field label="Phone"><Input type="tel" inputMode="tel" value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} maxLength={40} /></Field>
        <div className="sm:col-span-2"><Field label="Customer address"><Textarea value={customer.address} onChange={(event) => setCustomer({ ...customer, address: event.target.value })} maxLength={1000} className="min-h-24" /></Field></div>
      </Card>

      <Card className="grid gap-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex items-center gap-2"><Package className="size-5 text-indigo-600" /><div><p className="text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">Order items</p><h2 className="font-black text-foreground">Products in this replacement</h2></div></div>
          <div className="ml-auto w-full sm:w-40"><Field label="Order ID" hint={isAdmin ? "Editable by Admin" : "Assigned automatically"}><Input type="text" inputMode="numeric" pattern="[0-9]*" required value={orderNumber} onChange={(event) => setOrderNumber(event.target.value.replace(/\D/g, ""))} disabled={!isAdmin} className="font-black" /></Field></div>
        </div>

        <div className="grid gap-3">
          {items.map((item, index) => (
            <div key={item.id} className="grid gap-3 rounded-2xl border border-border bg-muted/20 p-3 sm:grid-cols-[auto_1fr_150px_auto] sm:items-end">
              <span className="grid size-8 place-items-center self-center rounded-full bg-[var(--brand)] text-xs font-black text-white">{index + 1}</span>
              <Field label="Product"><Input required value={item.productName} onChange={(event) => updateItem(item.id, { productName: event.target.value })} maxLength={200} placeholder="Product name or description" /></Field>
              <Field label="Quantity"><Input required type="number" inputMode="numeric" min={1} max={999} value={item.quantity} onChange={(event) => updateItem(item.id, { quantity: event.target.value })} /></Field>
              <button type="button" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))} className="grid size-11 place-items-center rounded-xl text-rose-600 hover:bg-rose-50 disabled:invisible" aria-label={`Remove item ${index + 1}`}><Trash2 className="size-4" /></button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setItems((current) => [...current, newItem()])} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--brand)]/50 font-bold text-[var(--brand)] transition hover:bg-muted"><CirclePlus className="size-5" /> ADD ITEM</button>
        <div className="grid gap-4 sm:grid-cols-2"><ReasonSelect name={null} defaultValue={reason} onValueChange={setReason} /><Field label="Notes"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} className="min-h-24" /></Field></div>
      </Card>

      <Card className="grid gap-4 bg-muted/25 p-4 sm:p-6">
        <div><p className="text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">Dimensions & fulfilment</p><h2 className="font-black text-foreground">Shared order details</h2></div>
        <div className="grid gap-4 sm:grid-cols-[1.2fr_2fr]">
          <Field label="Dimension preset"><Select value={presetId} onChange={(event) => choosePreset(event.target.value)}><option value="">Enter manually</option>{presets.filter((preset) => preset.active).map((preset) => <option key={preset.id} value={preset.id}>{preset.name} — {preset.length_cm} × {preset.breadth_cm} × {preset.height_cm} cm</option>)}</Select></Field>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Field label="Length (cm)"><Input required type="number" inputMode="decimal" min="0.01" max="10000" step="0.01" value={dimensions.length} onChange={(event) => { setPresetId(""); setDimensions({ ...dimensions, length: event.target.value }); }} /></Field>
            <Field label="Breadth (cm)"><Input required type="number" inputMode="decimal" min="0.01" max="10000" step="0.01" value={dimensions.breadth} onChange={(event) => { setPresetId(""); setDimensions({ ...dimensions, breadth: event.target.value }); }} /></Field>
            <Field label="Height (cm)"><Input required type="number" inputMode="decimal" min="0.01" max="10000" step="0.01" value={dimensions.height} onChange={(event) => { setPresetId(""); setDimensions({ ...dimensions, height: event.target.value }); }} /></Field>
          </div>
        </div>
        <Field label="Shipping speed"><Select value={shippingSpeed} onChange={(event) => setShippingSpeed(event.target.value as "STANDARD" | "EXPRESS")}><option value="STANDARD">Standard</option><option value="EXPRESS">Express</option></Select></Field>
        <ProductPhotoPicker name={`product_photos:${orderId}`} />
      </Card>

      <SubmitButton pendingText="Creating replacement order and uploading photos…">CREATE REPLACEMENT ORDER · {items.length} ITEM{items.length === 1 ? "" : "S"}</SubmitButton>
    </form>
  );
}
