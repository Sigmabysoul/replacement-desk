"use client";

import { useMemo, useState } from "react";
import { Boxes, CirclePlus, Trash2 } from "lucide-react";
import { createOfflineOrderAction } from "@/app/offline-actions";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

type ItemDraft = { id: string; productName: string; quantity: string };
const newItem = (id = crypto.randomUUID()): ItemDraft => ({ id, productName: "", quantity: "1" });

export function OfflineOrderForm({ defaultOrderNumber }: { defaultOrderNumber?: number }) {
  const [items, setItems] = useState<ItemDraft[]>([newItem("item-1")]);
  const itemsManifest = useMemo(() => items.map((item) => ({ product_name: item.productName, quantity: item.quantity })), [items]);

  function updateItem(id: string, patch: Partial<ItemDraft>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  return (
    <form action={createOfflineOrderAction} className="grid gap-6">
      <input type="hidden" name="items_manifest" value={JSON.stringify(itemsManifest)} />
      <Card className="grid gap-5 p-5 sm:p-6">
        <div className="flex items-center gap-2 border-b border-border pb-4"><Boxes className="size-5 text-indigo-600" /><h2 className="text-lg font-black text-foreground">New Offline Order</h2></div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Order ID" hint="Auto-increments · Editable"><Input type="text" inputMode="numeric" pattern="[0-9]*" required name="order_number" defaultValue={defaultOrderNumber} className="font-black" placeholder="e.g. 501" /></Field>
          <Field label="SO Number" hint="Sales Order reference"><Input required name="so_number" maxLength={50} placeholder="e.g. OFLN115" className="font-bold" /></Field>
          <Field label="Brand" hint="Client or brand name"><Input name="brand" required maxLength={200} placeholder="e.g. averX" /></Field>
        </div>

        <div className="grid gap-3">
          <div><p className="text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">Order items</p><h3 className="font-black text-foreground">Products in this order</h3></div>
          {items.map((item, index) => (
            <div key={item.id} className="grid gap-3 rounded-2xl border border-border bg-muted/20 p-3 sm:grid-cols-[auto_1fr_170px_auto] sm:items-end">
              <span className="grid size-8 place-items-center self-center rounded-full bg-[var(--brand)] text-xs font-black text-white">{index + 1}</span>
              <Field label="Product"><Input required value={item.productName} onChange={(event) => updateItem(item.id, { productName: event.target.value })} maxLength={200} placeholder="Product name or description" /></Field>
              <Field label="Quantity"><Input required type="number" inputMode="numeric" min={1} max={999999} value={item.quantity} onChange={(event) => updateItem(item.id, { quantity: event.target.value })} /></Field>
              <button type="button" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))} className="grid size-11 place-items-center rounded-xl text-rose-600 hover:bg-rose-50 disabled:invisible" aria-label={`Remove item ${index + 1}`}><Trash2 className="size-4" /></button>
            </div>
          ))}
          <button type="button" onClick={() => setItems((current) => [...current, newItem()])} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--brand)]/50 font-bold text-[var(--brand)] transition hover:bg-muted"><CirclePlus className="size-5" /> ADD ITEM</button>
        </div>

        <Field label="Unit" hint="Applied to every item in this order"><Select name="unit" defaultValue="Pieces"><option value="Pieces">Pieces</option><option value="Rolls">Rolls</option><option value="Boxes">Boxes</option><option value="Packets">Packets</option><option value="KG">KG</option><option value="Sets">Sets</option></Select></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Logistics Partner"><Input name="logistics_partner" required maxLength={200} placeholder="Enter logistics partner" /></Field>
          <Field label="Target Dispatch Date" hint="DD/MM/YYYY"><Input required type="text" inputMode="numeric" pattern="[0-9]{2}/[0-9]{2}/[0-9]{4}" name="dispatch_date" placeholder="DD/MM/YYYY" /></Field>
        </div>
        <Field label="Notes" hint="Special instructions, packing notes, etc."><Textarea name="notes" required maxLength={2000} placeholder="e.g. Carton count pending..." className="min-h-24" /></Field>
        <SubmitButton pendingText="Creating offline order…">CREATE OFFLINE ORDER · {items.length} ITEM{items.length === 1 ? "" : "S"}</SubmitButton>
      </Card>
    </form>
  );
}
