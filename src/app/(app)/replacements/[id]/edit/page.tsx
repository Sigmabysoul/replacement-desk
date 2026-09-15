import { notFound } from "next/navigation";
import { deleteReplacementAction, updateReplacementAction } from "@/app/actions";
import { Card } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { ReasonSelect } from "@/components/replacements/reason-select";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Replacement } from "@/lib/types";

export default async function EditReplacementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const profile = await requireProfile(["CUSTOMER_SUPPORT", "ADMIN"]);
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("replacements").select("*").eq("id", id).single();
  if (!data) notFound();
  const replacement = data as Replacement;
  if (["SHIPPED", "CANCELLED"].includes(replacement.status)) {
    return <Notice>This completed replacement can no longer be edited.</Notice>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm font-bold text-indigo-700">{replacement.replacement_number}</p>
      <h1 className="mt-1 text-2xl font-black text-slate-950">Edit replacement</h1>
      <form action={updateReplacementAction} className="mt-6 grid gap-5">
        <input type="hidden" name="replacement_id" value={replacement.id} />
        <Notice>{error}</Notice>
        <Card className="grid gap-5 p-5 sm:grid-cols-2">
          <Field label="Order ID" hint="Only Admin can change this ID.">
            <Input name="order_number" type="number" inputMode="numeric" min={1} required defaultValue={replacement.order_number} readOnly={profile.role !== "ADMIN"} className={`order-id-input ${profile.role !== "ADMIN" ? "cursor-not-allowed bg-muted" : ""}`} />
          </Field>
          <Field label="Order reference">
            <Input name="order_reference" required defaultValue={replacement.order_reference} />
          </Field>
          <Field label="Product">
            <Input name="product_name" required defaultValue={replacement.product_name} />
          </Field>
          <Field label="Quantity">
            <Input name="quantity" type="number" min={1} max={999} required defaultValue={replacement.quantity} />
          </Field>
          <ReasonSelect defaultValue={replacement.reason} />
          <Field label="Customer name">
            <Input name="customer_name" defaultValue={replacement.customer_name ?? ""} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <Textarea name="notes" defaultValue={replacement.notes ?? ""} />
            </Field>
          </div>
        </Card>
        <SubmitButton pendingText="Saving…">SAVE CHANGES</SubmitButton>
      </form>

      <div className="mt-8 border-t border-slate-200 pt-6">
        <h2 className="text-sm font-bold text-slate-900">Danger zone</h2>
        <p className="mt-1 text-xs text-slate-500">
          Delete this replacement permanently if it was created by mistake.
        </p>
        <form action={deleteReplacementAction} className="mt-3">
          <input type="hidden" name="replacement_id" value={replacement.id} />
          <ConfirmButton
            variant="danger"
            message={`Are you sure you want to permanently delete ${replacement.replacement_number}? All attached files will be deleted.`}
          >
            DELETE REPLACEMENT ORDER
          </ConfirmButton>
        </form>
      </div>
    </div>
  );
}
