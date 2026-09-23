"use client";

import { useMemo, useState } from "react";
import { Boxes, Calendar, CirclePlus, Trash2, UserCheck } from "lucide-react";
import { createOfflineOrderAction } from "@/app/offline-actions";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { CustomerPreset } from "@/lib/types";

type ItemDraft = { id: string; productName: string; quantity: string };
const newItem = (id = crypto.randomUUID()): ItemDraft => ({ id, productName: "", quantity: "1" });

export function OfflineOrderForm({
  defaultOrderNumber,
  customerPresets = [],
}: {
  defaultOrderNumber?: number;
  customerPresets?: CustomerPreset[];
}) {
  const [items, setItems] = useState<ItemDraft[]>([newItem("item-1")]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [customerName, setCustomerName] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [customerEmail, setCustomerEmail] = useState<string>("");
  const [customerAddress, setCustomerAddress] = useState<string>("");

  const itemsManifest = useMemo(
    () => items.map((item) => ({ product_name: item.productName, quantity: item.quantity })),
    [items],
  );

  function updateItem(id: string, patch: Partial<ItemDraft>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function handleSelectPreset(presetId: string) {
    setSelectedPresetId(presetId);
    const found = customerPresets.find((p) => p.id === presetId);
    if (found) {
      setCustomerName(found.name);
      setCustomerPhone(found.phone ?? "");
      setCustomerEmail(found.email ?? "");
      setCustomerAddress(found.address);
    }
  }

  return (
    <form action={createOfflineOrderAction} className="grid gap-6">
      <input type="hidden" name="items_manifest" value={JSON.stringify(itemsManifest)} />
      <input type="hidden" name="customer_preset_id" value={selectedPresetId} />

      <Card className="grid gap-5 p-5 sm:p-6">
        <div className="flex items-center gap-2 border-b border-border pb-4">
          <Boxes className="size-5 text-indigo-600" />
          <h2 className="text-lg font-black text-foreground">New Offline Order</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Order ID" hint="Auto-increments · Editable">
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              required
              name="order_number"
              defaultValue={defaultOrderNumber}
              className="font-black"
              placeholder="e.g. 501"
            />
          </Field>
          <Field label="SO Number" hint="Sales Order reference">
            <Input required name="so_number" maxLength={50} placeholder="e.g. OFLN115" className="font-bold" />
          </Field>
          <Field label="Brand" hint="Client or brand name">
            <Input name="brand" required maxLength={200} placeholder="e.g. averX" />
          </Field>
        </div>

        {/* Customer Details Section */}
        <div className="grid gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/30 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="size-4.5 text-indigo-600" />
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-indigo-700">Customer details</p>
                <h3 className="text-sm font-black text-foreground">Delivery contact & destination</h3>
              </div>
            </div>
            {customerPresets.length > 0 ? (
              <div className="w-full sm:w-64">
                <Select
                  value={selectedPresetId}
                  onChange={(e) => handleSelectPreset(e.target.value)}
                  className="bg-white text-xs font-semibold"
                >
                  <option value="">⚡ Load saved customer…</option>
                  {customerPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Customer / Company Name">
              <Input
                name="customer_name"
                required
                maxLength={200}
                placeholder="e.g. Metro Mart Pvt Ltd"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </Field>
            <Field label="Customer Phone Number">
              <Input
                name="customer_phone"
                type="tel"
                required
                maxLength={50}
                placeholder="e.g. +91 98765 43210"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </Field>
            <Field label="Customer Email" hint="Optional" className="sm:col-span-2">
              <Input
                name="customer_email"
                type="email"
                maxLength={255}
                placeholder="e.g. buyer@example.com"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
              />
            </Field>
            <Field label="Delivery Address" className="sm:col-span-2">
              <Textarea
                name="customer_address"
                required
                maxLength={2000}
                rows={2}
                placeholder="Full delivery destination, street address, PIN code..."
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
              />
            </Field>
          </div>
        </div>

        {/* Order Line Items */}
        <div className="grid gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">Order items</p>
            <h3 className="font-black text-foreground">Products in this order</h3>
          </div>
          {items.map((item, index) => (
            <div
              key={item.id}
              className="grid gap-3 rounded-2xl border border-border bg-muted/20 p-3 sm:grid-cols-[auto_1fr_170px_auto] sm:items-end"
            >
              <span className="grid size-8 place-items-center self-center rounded-full bg-[var(--brand)] text-xs font-black text-white">
                {index + 1}
              </span>
              <Field label="Product">
                <Input
                  required
                  value={item.productName}
                  onChange={(event) => updateItem(item.id, { productName: event.target.value })}
                  maxLength={200}
                  placeholder="Product name or description"
                />
              </Field>
              <Field label="Quantity">
                <Input
                  required
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={999999}
                  value={item.quantity}
                  onChange={(event) => updateItem(item.id, { quantity: event.target.value })}
                />
              </Field>
              <button
                type="button"
                disabled={items.length === 1}
                onClick={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))}
                className="grid size-11 place-items-center rounded-xl text-rose-600 hover:bg-rose-50 disabled:invisible"
                aria-label={`Remove item ${index + 1}`}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setItems((current) => [...current, newItem()])}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--brand)]/50 font-bold text-[var(--brand)] transition hover:bg-muted"
          >
            <CirclePlus className="size-5" /> ADD ITEM
          </button>
        </div>

        <Field label="Unit" hint="Applied to every item in this order">
          <Select name="unit" defaultValue="Pieces">
            <option value="Pieces">Pieces</option>
            <option value="Rolls">Rolls</option>
            <option value="Boxes">Boxes</option>
            <option value="Packets">Packets</option>
            <option value="KG">KG</option>
            <option value="Sets">Sets</option>
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Logistics Partner">
            <Input name="logistics_partner" required maxLength={200} placeholder="Enter logistics partner" />
          </Field>
          <Field label="Target Dispatch Date" hint="Pick from calendar">
            <div className="relative">
              <Input
                required
                type="date"
                name="dispatch_date"
                className="cursor-pointer font-medium pl-3.5 pr-10"
                onClick={(e) => {
                  try {
                    e.currentTarget.showPicker?.();
                  } catch {}
                }}
              />
              <Calendar className="pointer-events-none absolute right-3.5 top-1/2 size-4.5 -translate-y-1/2 text-muted-foreground" />
            </div>
          </Field>
        </div>

        <Field label="Notes" hint="Special instructions, packing notes, etc.">
          <Textarea
            name="notes"
            required
            maxLength={2000}
            placeholder="e.g. Carton count pending..."
            className="min-h-24"
          />
        </Field>

        <SubmitButton pendingText="Creating offline order…">
          CREATE OFFLINE ORDER · {items.length} ITEM{items.length === 1 ? "" : "S"}
        </SubmitButton>
      </Card>
    </form>
  );
}
