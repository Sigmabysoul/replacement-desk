import { Archive, Building2, Save } from "lucide-react";
import { archiveCustomerPresetAction, saveCustomerPresetAction } from "@/app/offline-actions";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { CustomerPreset } from "@/lib/types";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  await requireProfile(["BOSS", "HR", "CUSTOMER_SUPPORT", "ADMIN"]);
  const [notice, supabase] = await Promise.all([searchParams, createClient()]);
  const { data, error } = await supabase
    .from("customer_presets")
    .select("*")
    .order("active", { ascending: false })
    .order("name");
  const presets = (data ?? []) as CustomerPreset[];

  return (
    <div className="grid gap-6">
      <header>
        <p className="text-sm font-bold text-indigo-700">CATALOGUE</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">Customer setup</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Register reusable customer profiles (name, address, phone, email) once and auto-populate them in future offline orders.
        </p>
      </header>

      <Notice>{notice.error ?? (error ? "Could not load customer profiles." : undefined)}</Notice>
      <Notice tone="success">{notice.success}</Notice>

      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Building2 className="size-5 text-indigo-600" />
          <h2 className="font-black text-foreground">New customer profile</h2>
        </div>
        <form action={saveCustomerPresetAction} className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer / Company name">
            <Input name="name" required maxLength={200} placeholder="e.g. Metro Mart Pvt Ltd" />
          </Field>
          <Field label="Phone number">
            <Input name="phone" type="tel" required maxLength={50} placeholder="e.g. +91 98765 43210" />
          </Field>
          <Field label="Email address (optional)" className="sm:col-span-2">
            <Input name="email" type="email" maxLength={255} placeholder="e.g. billing@metromart.in" />
          </Field>
          <Field label="Delivery address" className="sm:col-span-2">
            <Textarea
              name="address"
              required
              maxLength={2000}
              rows={3}
              placeholder="e.g. Warehouse 4B, Transport Nagar, Bhiwandi, Maharashtra - 421302"
            />
          </Field>
          <SubmitButton className="sm:col-span-2" pendingText="Saving…">
            <Save className="size-4" /> SAVE CUSTOMER PROFILE
          </SubmitButton>
        </form>
      </Card>

      <section className="grid gap-3">
        <h2 className="text-base font-bold text-foreground">Saved customer profiles ({presets.length})</h2>
        {presets.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            No saved customer profiles yet. Register one above to easily auto-fill offline orders.
          </Card>
        ) : (
          presets.map((preset) => (
            <Card key={preset.id} className={`p-4 ${preset.active ? "" : "opacity-60"}`}>
              <form action={saveCustomerPresetAction} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={preset.id} />
                <Field label="Customer / Company name">
                  <Input name="name" defaultValue={preset.name} required maxLength={200} disabled={!preset.active} />
                </Field>
                <Field label="Phone number">
                  <Input
                    name="phone"
                    type="tel"
                    defaultValue={preset.phone ?? ""}
                    required
                    maxLength={50}
                    disabled={!preset.active}
                  />
                </Field>
                <Field label="Email address" className="sm:col-span-2">
                  <Input
                    name="email"
                    type="email"
                    defaultValue={preset.email ?? ""}
                    maxLength={255}
                    disabled={!preset.active}
                  />
                </Field>
                <Field label="Delivery address" className="sm:col-span-2">
                  <Textarea
                    name="address"
                    defaultValue={preset.address}
                    required
                    maxLength={2000}
                    rows={2}
                    disabled={!preset.active}
                  />
                </Field>
                <div className="flex items-center gap-2 sm:col-span-2">
                  {preset.active ? (
                    <SubmitButton pendingText="Saving…" className="w-auto">
                      <Save className="size-4" /> Save changes
                    </SubmitButton>
                  ) : (
                    <span className="text-xs font-bold text-muted-foreground">ARCHIVED</span>
                  )}
                </div>
              </form>
              {preset.active ? (
                <form action={archiveCustomerPresetAction} className="mt-3 flex justify-end border-t border-border pt-3">
                  <input type="hidden" name="id" value={preset.id} />
                  <button
                    type="submit"
                    className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-bold text-rose-700 hover:bg-rose-50"
                  >
                    <Archive className="size-4" /> Archive profile
                  </button>
                </form>
              ) : null}
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
