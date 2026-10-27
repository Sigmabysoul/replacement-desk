import { createOrderBatchAction } from "@/app/actions";
import { OrderBuilder } from "@/components/replacements/order-builder";
import { Notice } from "@/components/ui/notice";
import { hasRole, requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { DimensionPreset } from "@/lib/types";

export default async function NewReplacementPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const profile = await requireProfile(["CUSTOMER_SUPPORT", "HR", "BOSS", "ADMIN"]);
  const [{ error }, supabase] = await Promise.all([searchParams, createClient()]);
  const [{ data: presetData }, { data: nextSeqData }] = await Promise.all([
    supabase.from("dimension_presets").select("*").eq("active", true).order("name"),
    supabase.rpc("get_next_order_number"),
  ]);
  const presets = (presetData ?? []) as DimensionPreset[];
  let startingOrderNumber = Number(nextSeqData);
  if (!Number.isSafeInteger(startingOrderNumber) || startingOrderNumber < 1) {
    const { data: latestOrderData } = await supabase
      .from("replacements")
      .select("order_number")
      .order("order_number", { ascending: false })
      .limit(1);
    startingOrderNumber = Number((latestOrderData as unknown as { order_number: number }[])?.[0]?.order_number ?? 500) + 1;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-sm font-bold text-indigo-700">NEW ORDER</p>
      <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">Create replacement order</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Add every product to one order. Customer, dimensions, photos, workflow, label, and tracking are shared across its items.
      </p>
      <div className="mt-5"><Notice>{error}</Notice></div>
      <div className="mt-6">
        <OrderBuilder
          action={createOrderBatchAction}
          presets={presets}
          isAdmin={hasRole(profile, "ADMIN")}
          startingOrderNumber={startingOrderNumber}
        />
      </div>
    </div>
  );
}
