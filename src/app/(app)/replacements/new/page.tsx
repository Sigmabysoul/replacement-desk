import { createReplacementAction } from "@/app/actions";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { ReasonSelect } from "@/components/replacements/reason-select";
import { FileInputFeedback } from "@/components/replacements/file-picker";
import { requireProfile } from "@/lib/auth/session";

export default async function NewReplacementPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireProfile(["ESHA", "ADMIN"]);
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm font-bold text-indigo-700">NEW REQUEST</p>
      <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Create replacement</h1>
      <p className="mt-1 text-sm text-slate-600">Add the order and product first. Photos and the label can be attached below.</p>
      <form action={createReplacementAction} className="mt-6 grid gap-5">
        <Notice>{error}</Notice>
        <Card className="grid gap-5 p-4 sm:grid-cols-2 sm:p-6">
          <Field label="Order reference">
            <Input name="order_reference" required maxLength={100} autoFocus placeholder="e.g. FK123456" />
          </Field>
          <Field label="Product">
            <Input name="product_name" required maxLength={200} placeholder="Product name" />
          </Field>
          <Field label="Quantity">
            <Input name="quantity" type="number" inputMode="numeric" min={1} max={999} defaultValue={1} required />
          </Field>
          <ReasonSelect />
          <Field label="Customer name (optional)">
            <Input name="customer_name" maxLength={120} />
          </Field>
          <Field label="Customer reference (optional)">
            <Input name="customer_reference" maxLength={100} />
          </Field>
          <Field label="Tracking link (optional)" hint="Paste the courier or marketplace tracking URL. It will stay with this order.">
            <Input name="tracking_url" type="url" inputMode="url" maxLength={2000} placeholder="https://tracking.example.com/..." />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes (optional)">
              <Textarea name="notes" maxLength={2000} placeholder="Anything the team should know" />
            </Field>
          </div>
        </Card>
        <Card className="grid gap-5 p-4 sm:grid-cols-2 sm:p-6">
          <FileInputFeedback
            name="customer_photos"
            label="Customer photos"
            hint="JPEG, PNG, or WebP. Up to 25 MB each."
            accept="image/jpeg,image/png,image/webp"
            iconType="camera"
          />
          <FileInputFeedback
            name="labels"
            label="Label / document"
            hint="PDF or image. Up to 25 MB each."
            accept="application/pdf,image/jpeg,image/png,image/webp"
            iconType="document"
          />
        </Card>
        <SubmitButton pendingText="Creating replacement…">CREATE REPLACEMENT</SubmitButton>
      </form>
    </div>
  );
}
