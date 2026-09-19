"use client";

import { Boxes } from "lucide-react";
import { createOfflineOrderAction } from "@/app/offline-actions";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export function OfflineOrderForm({ defaultOrderNumber }: { defaultOrderNumber?: number }) {
  return (
    <form action={createOfflineOrderAction} className="grid gap-6">
      <Card className="grid gap-5 p-5 sm:p-6">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
          <Boxes className="size-5 text-indigo-600" />
          <h2 className="text-lg font-black text-slate-950">New Offline Order</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Order ID" hint="Auto-increments · Editable">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              required
              name="order_number"
              defaultValue={defaultOrderNumber}
              className="font-black"
              placeholder="e.g. 501"
            />
          </Field>
          <Field label="SO Number" hint="Sales Order reference">
            <Input
              required
              name="so_number"
              maxLength={50}
              placeholder="e.g. OFLN115"
              className="font-bold"
            />
          </Field>
          <Field label="Brand" hint="Client or brand name">
            <Input
              name="brand"
              maxLength={200}
              placeholder="e.g. averX"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
          <Field label="Product Name">
            <Input
              required
              name="product_name"
              maxLength={200}
              placeholder="e.g. GARBAGE BAG ROLL - 24X32 - BLACK"
            />
          </Field>
          <Field label="Quantity">
            <Input
              required
              type="number"
              inputMode="numeric"
              min={1}
              max={999999}
              name="quantity"
              defaultValue={1}
            />
          </Field>
          <Field label="Unit">
            <Select name="unit" defaultValue="Pieces">
              <option value="Pieces">Pieces</option>
              <option value="Rolls">Rolls</option>
              <option value="Boxes">Boxes</option>
              <option value="Packets">Packets</option>
              <option value="KG">KG</option>
              <option value="Sets">Sets</option>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Logistics Partner" hint="Preferred courier">
            <Input
              name="logistics_partner"
              maxLength={200}
              placeholder="e.g. Delhivery, Bluedart"
            />
          </Field>
          <Field label="Target Dispatch Date">
            <Input
              type="date"
              name="dispatch_date"
            />
          </Field>
        </div>

        <Field label="Notes" hint="Special instructions, packing notes, etc.">
          <Textarea
            name="notes"
            maxLength={2000}
            placeholder="e.g. Carton count pending with Kartik Da..."
            className="min-h-24"
          />
        </Field>

        <div className="pt-2">
          <SubmitButton pendingText="Creating offline order…">
            CREATE OFFLINE ORDER
          </SubmitButton>
        </div>
      </Card>
    </form>
  );
}
