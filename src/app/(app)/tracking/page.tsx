import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  Radar,
  Truck,
  UserRound,
} from "lucide-react";
import { transitionAction } from "@/app/actions";
import { Card } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Replacement } from "@/lib/types";
import { formatDate } from "@/lib/utils";

function daysInTransit(shippedAt: string | null): string {
  if (!shippedAt) return "Just shipped";
  const diffMs = Date.now() - new Date(shippedAt).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Shipped today";
  if (diffDays === 1) return "1 day in transit";
  return `${diffDays} days in transit`;
}

export default async function TrackingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  await requireProfile(["LOGISTICS", "ADMIN"]);
  const { error: queryError, success: querySuccess } = await searchParams;

  const supabase = await createClient();
  const [
    { data: shippedData, error: shippedError },
    { data: deliveredData, error: deliveredError },
  ] = await Promise.all([
    supabase
      .from("replacements")
      .select("*")
      .eq("status", "SHIPPED")
      .order("shipped_at", { ascending: false }),
    supabase
      .from("replacements")
      .select("*")
      .eq("status", "DELIVERED")
      .order("delivered_at", { ascending: false })
      .limit(12),
  ]);

  const inTransit = (shippedData ?? []) as Replacement[];
  const delivered = (deliveredData ?? []) as Replacement[];
  const error = shippedError || deliveredError ? "Could not load shipment records." : null;

  return (
    <div className="grid gap-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-700">
            <Radar className="size-4" />
            <span>Logistics Control Center</span>
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
            Shipment Tracking
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Track all in-transit replacement orders and mark them delivered once received by the customer.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-sky-50 px-3 py-1.5 text-xs font-black text-sky-800 ring-1 ring-sky-200">
            <Truck className="size-4" /> {inTransit.length} In Transit
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-800 ring-1 ring-emerald-200">
            <CheckCircle2 className="size-4" /> {delivered.length} Delivered
          </span>
        </div>
      </div>

      <Notice>{queryError ?? (error ? "Could not load shipment records." : undefined)}</Notice>
      {querySuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">
          {querySuccess}
        </div>
      )}

      {/* Section 1: In-Transit Replacements */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-950">
            In-Transit Shipments ({inTransit.length})
          </h2>
        </div>

        {inTransit.length ? (
          <div className="grid gap-5 lg:grid-cols-2">
            {inTransit.map((order) => {
              const transitTime = daysInTransit(order.shipped_at);
              return (
                <Card
                  key={order.id}
                  className="flex flex-col justify-between overflow-hidden border-sky-200/80 p-5 shadow-xs transition hover:border-indigo-300 hover:shadow-md"
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-black text-indigo-700">
                            {order.replacement_number}
                          </span>
                          <span className="rounded-md bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-800">
                            SHIPPED
                          </span>
                        </div>
                        <h3 className="mt-1.5 text-base font-black text-slate-900">
                          {order.product_name} × {order.quantity}
                        </h3>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 shrink-0">
                        {transitTime}
                      </span>
                    </div>

                    {/* Logistics Card */}
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Courier Partner
                          </span>
                          <p className="mt-0.5 font-bold text-slate-800">
                            {order.courier_partner || order.order_reference || "Not recorded"}
                          </p>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Tracking ID / AWB
                          </span>
                          <p className="mt-0.5 font-bold font-mono text-slate-800">
                            {order.tracking_id || "No tracking ID"}
                          </p>
                        </div>
                      </div>

                      {order.tracking_url && (
                        <div className="mt-3 border-t border-slate-200 pt-2.5">
                          <a
                            href={order.tracking_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 font-bold text-indigo-600 hover:text-indigo-800 hover:underline"
                          >
                            <ExternalLink className="size-3.5" />
                            Open Courier Tracking Page
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Customer & Address Details */}
                    <div className="mt-4 grid gap-2 text-xs text-slate-600">
                      {order.customer_name && (
                        <div className="flex items-center gap-2">
                          <UserRound className="size-3.5 text-slate-400 shrink-0" />
                          <span className="font-semibold text-slate-800">{order.customer_name}</span>
                          {order.customer_phone && (
                            <span className="text-slate-400">· {order.customer_phone}</span>
                          )}
                        </div>
                      )}
                      {order.customer_address && (
                        <div className="flex items-start gap-2">
                          <MapPin className="size-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{order.customer_address}</span>
                        </div>
                      )}
                      {order.shipped_at && (
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          <Clock className="size-3.5 shrink-0" />
                          <span>Dispatched on {formatDate(order.shipped_at)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Delivery Action Form */}
                  <form action={transitionAction} className="mt-5 border-t border-slate-100 pt-4">
                    <input type="hidden" name="replacement_id" value={order.id} />
                    <input type="hidden" name="target_status" value="DELIVERED" />

                    <div className="mb-3">
                      <Input
                        name="message"
                        placeholder="Delivery notes (e.g. Received with customer signature / gate delivery)…"
                        className="h-10 text-xs"
                      />
                    </div>

                    <ConfirmButton
                      message={`Confirm ${order.replacement_number} has been successfully delivered to the customer?`}
                    >
                      <CheckCircle2 className="size-5" />
                      MARK SUCCESSFULLY DELIVERED
                    </ConfirmButton>
                  </form>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="grid place-items-center p-12 text-center">
            <div className="grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="size-6" />
            </div>
            <h3 className="mt-3 font-black text-slate-900">No shipments in transit</h3>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              All shipped replacement orders have reached customers and are marked delivered.
            </p>
          </Card>
        )}
      </section>

      {/* Section 2: Recently Delivered Replacements */}
      {delivered.length > 0 && (
        <section className="mt-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-950">
              Recently Delivered ({delivered.length})
            </h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {delivered.map((order) => (
              <Link
                key={order.id}
                href={`/replacements/${order.id}`}
                className="group block rounded-2xl outline-none focus-visible:ring-4 focus-visible:ring-emerald-200"
              >
                <Card className="h-full border-emerald-100 bg-emerald-50/20 p-4 transition hover:border-emerald-300 hover:shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-black text-slate-800">
                      {order.replacement_number}
                    </span>
                    <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-800">
                      Delivered
                    </span>
                  </div>

                  <p className="mt-2 truncate text-sm font-bold text-slate-900">
                    {order.product_name} × {order.quantity}
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    Courier: <strong className="text-slate-700">{order.courier_partner || order.order_reference || "Standard"}</strong>
                  </p>

                  {order.delivered_at && (
                    <p className="mt-3 text-[11px] text-slate-400">
                      Delivered on {formatDate(order.delivered_at)}
                    </p>
                  )}
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
