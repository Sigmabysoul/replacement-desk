import { createOrderBatchAction } from "@/app/actions";
import { OrderBuilder } from "@/components/replacements/order-builder";
import { Notice } from "@/components/ui/notice";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { DimensionPreset } from "@/lib/types";

export default async function NewReplacementPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireProfile(["customer_support", "ADMIN"]);
  const [{ error }, supabase] = await Promise.all([searchParams, createClient()]);
  const { data } = await supabase.from("dimension_presets").select("*").eq("active", true).order("name");
  const presets = (data ?? []) as DimensionPreset[];

  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-sm font-bold text-indigo-700">NEW ORDER</p>
      <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">Create orders</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Switch between replacement and offline orders, reuse a customer for several products, or start a separate customer branch.
        Logistics will add the label and tracking link next.
      </p>
      <div className="mt-5"><Notice>{error}</Notice></div>
      <div className="mt-6"><OrderBuilder action={createOrderBatchAction} presets={presets} /></div>
    </div>
  );
}
