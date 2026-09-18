import Link from "next/link";
import { Boxes, CirclePlus, Search } from "lucide-react";
import { OfflineOrderCard } from "@/components/offline-orders/offline-order-card";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { hasAnyRole, requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { OFFLINE_ORDER_STATUSES, type OfflineOrder, type OfflineOrderStatus } from "@/lib/types";
import { offlineStatusLabel } from "@/lib/utils";

export default async function OfflineOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; error?: string; success?: string }>;
}) {
  const profile = await requireProfile();
  const params = await searchParams;

  const supabase = await createClient();
  let query = supabase.from("offline_orders").select("*").order("created_at", { ascending: false });

  if (params.status && OFFLINE_ORDER_STATUSES.includes(params.status as OfflineOrderStatus)) {
    query = query.eq("status", params.status);
  }

  if (params.q?.trim()) {
    const q = params.q.trim().replace(/[%_,()"'\\]/g, " ").slice(0, 100);
    if (q) {
      const orderNumberFilter = /^\d+$/.test(q) ? `,order_number.eq.${Number(q)}` : "";
      query = query.or(`so_number.ilike.%${q}%,brand.ilike.%${q}%,product_name.ilike.%${q}%${orderNumberFilter}`);
    }
  }

  const { data, error } = await query.limit(100);
  const orders = (data ?? []) as OfflineOrder[];

  const canCreate = hasAnyRole(profile, ["BOSS", "ADMIN"]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-700">Offline Pipeline</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
            Offline Orders
          </h1>
        </div>

        {canCreate && (
          <Link
            href="/offline-orders/new"
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-bold text-white shadow-lg shadow-[var(--brand)]/20 transition hover:-translate-y-0.5 hover:brightness-95"
          >
            <CirclePlus className="size-5" />
            New Offline Order
          </Link>
        )}
      </div>

      <Card className="p-4 sm:p-5">
        <form className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_220px_auto]">
          <div className="relative flex min-h-12 w-full items-center">
            <span className="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-12 items-center justify-center" aria-hidden="true">
              <Search className="size-5 text-slate-400" />
            </span>
            <Input
              name="q"
              type="search"
              defaultValue={params.q}
              placeholder="Search SO number, product, brand, or ID…"
              className="pl-12"
            />
          </div>

          <Select name="status" defaultValue={params.status ?? ""}>
            <option value="">All statuses</option>
            {OFFLINE_ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {offlineStatusLabel[status]}
              </option>
            ))}
          </Select>

          <button
            type="submit"
            className="flex min-h-12 items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-bold text-white transition hover:bg-slate-800"
          >
            Filter
          </button>
        </form>
      </Card>

      {error && (
        <Card className="border-rose-200 bg-rose-50 p-4 text-rose-900">
          Could not load offline orders. Please refresh the page.
        </Card>
      )}

      {orders.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {orders.map((order) => (
            <OfflineOrderCard
              key={order.id}
              order={order}
              role={profile.role}
              roles={profile.roles ?? [profile.role]}
            />
          ))}
        </div>
      ) : (
        <Card className="grid place-items-center p-12 text-center">
          <Boxes className="size-12 text-slate-300" />
          <h3 className="mt-3 text-lg font-bold text-slate-800">No offline orders found</h3>
          <p className="mt-1 text-sm text-slate-500">
            {params.q || params.status ? "Try clearing search filters." : "New offline orders created by the Boss will appear here."}
          </p>
        </Card>
      )}
    </div>
  );
}

