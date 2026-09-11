import { PackageCheck, Send, TriangleAlert } from "lucide-react";
import { transitionAction } from "@/app/actions";
import { Card } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Notice } from "@/components/ui/notice";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Replacement } from "@/lib/types";

export default async function DispatchPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireProfile(["ESHA", "ADMIN"]);
  const { error: queryError } = await searchParams;

  const supabase = await createClient();
  const [{ data: packedData, error: packedError }, { data: tokenData, error: tokenError }] = await Promise.all([
    supabase.from("replacements").select("*").eq("status", "PACKED").order("packed_at", { ascending: true }),
    supabase.from("replacements").select("*").eq("status", "NEEDS_TOKEN").order("needs_token_at", { ascending: true }),
  ]);

  const error = (packedError || tokenError) ? "Could not load dispatch orders." : null;
  const packed = (packedData ?? []) as Replacement[];
  const needsToken = (tokenData ?? []) as Replacement[];

  return (
    <div className="grid gap-7">
      <div>
        <p className="text-sm font-bold text-indigo-700">END OF DAY</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Dispatch</h1>
        <p className="mt-1 text-sm text-slate-600">Confirm pickup for each packed replacement order.</p>
      </div>

      <Notice>{queryError ?? (error ? "Could not load dispatch orders." : undefined)}</Notice>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-950">Packed & ready for pickup ({packed.length})</h2>
        </div>
        {packed.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {packed.map((replacement) => (
              <Card key={replacement.id} className="p-5">
                <div className="flex items-start gap-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-cyan-50 text-cyan-700">
                    <PackageCheck className="size-6" />
                  </span>
                  <div>
                    <h3 className="font-black text-slate-950">{replacement.replacement_number}</h3>
                    <p className="text-sm font-semibold text-slate-700">
                      {replacement.product_name} × {replacement.quantity}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Order: {replacement.order_reference}</p>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <form action={transitionAction}>
                    <input type="hidden" name="replacement_id" value={replacement.id} />
                    <input type="hidden" name="target_status" value="SHIPPED" />
                    <ConfirmButton message={`Confirm ${replacement.replacement_number} was picked up?`}>
                      <Send className="size-5" />SHIPPED
                    </ConfirmButton>
                  </form>
                  <form action={transitionAction}>
                    <input type="hidden" name="replacement_id" value={replacement.id} />
                    <input type="hidden" name="target_status" value="NEEDS_TOKEN" />
                    <ConfirmButton variant="warning" message={`Confirm ${replacement.replacement_number} was not picked up and needs a token?`}>
                      <TriangleAlert className="size-5" />NEEDS TOKEN
                    </ConfirmButton>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="grid place-items-center p-8 text-center">
            <PackageCheck className="size-10 text-emerald-500" />
            <h3 className="mt-2 font-black text-slate-900">No packed orders waiting</h3>
            <p className="mt-1 text-sm text-slate-500">All packed replacements have been dispatched.</p>
          </Card>
        )}
      </section>

      {needsToken.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-black text-amber-950">Awaiting token pickup ({needsToken.length})</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {needsToken.map((replacement) => (
              <Card key={replacement.id} className="border-amber-200 bg-amber-50/40 p-5">
                <div className="flex items-start gap-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-orange-100 text-orange-800">
                    <TriangleAlert className="size-6" />
                  </span>
                  <div>
                    <h3 className="font-black text-slate-950">{replacement.replacement_number}</h3>
                    <p className="text-sm font-semibold text-slate-800">
                      {replacement.product_name} × {replacement.quantity}
                    </p>
                    <p className="mt-1 text-xs text-amber-900 font-medium">Order: {replacement.order_reference} (token pending)</p>
                  </div>
                </div>
                <div className="mt-4">
                  <form action={transitionAction}>
                    <input type="hidden" name="replacement_id" value={replacement.id} />
                    <input type="hidden" name="target_status" value="SHIPPED" />
                    <ConfirmButton message={`Confirm token received and ${replacement.replacement_number} picked up?`}>
                      <Send className="size-5" />MARK SHIPPED (TOKEN RECEIVED)
                    </ConfirmButton>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
