"use client";

import { useState } from "react";
import { Check, Edit3, X } from "lucide-react";
import { updateOfflineOrderNumberAction } from "@/app/offline-actions";
import { SubmitButton } from "@/components/ui/submit-button";

interface EditOfflineOrderIdProps {
  orderId: string;
  currentOrderNumber: number;
  canEdit: boolean;
}

export function EditOfflineOrderId({
  orderId,
  currentOrderNumber,
  canEdit,
}: EditOfflineOrderIdProps) {
  const [editing, setEditing] = useState(false);

  if (!canEdit) {
    return <span className="font-semibold text-foreground">Order #{currentOrderNumber}</span>;
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
        <span>Order #{currentOrderNumber}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="Edit Order ID"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 transition"
        >
          <Edit3 className="size-3" />
          <span>Edit ID</span>
        </button>
      </span>
    );
  }

  return (
    <form action={updateOfflineOrderNumberAction} className="inline-flex flex-wrap items-center gap-1.5 my-1">
      <input type="hidden" name="order_id" value={orderId} />
      <span className="text-xs font-bold text-muted-foreground">Order #</span>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        required
        name="order_number"
        defaultValue={currentOrderNumber}
        className="w-24 rounded-lg border border-indigo-400 bg-background px-2 py-1 text-xs font-black text-foreground shadow-sm focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        autoFocus
      />
      <SubmitButton
        pendingText="Saving…"
        className="inline-flex h-7 items-center gap-1 rounded-lg bg-indigo-600 px-2.5 text-xs font-bold text-white hover:bg-indigo-700"
      >
        <Check className="size-3" />
        <span>Save</span>
      </SubmitButton>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-card px-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
      >
        <X className="size-3" />
        <span>Cancel</span>
      </button>
    </form>
  );
}

