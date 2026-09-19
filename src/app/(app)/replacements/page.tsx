import Link from "next/link";
import { Archive, CirclePlus, Search, SlidersHorizontal } from "lucide-react";
import { archiveCompletedReplacementsAction } from "@/app/actions";
import { ReplacementCard } from "@/components/replacements/replacement-card";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { hasAnyRole, hasRole, requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { STATUSES, type Replacement, type ReplacementStatus } from "@/lib/types";
import { statusLabel } from "@/lib/utils";

type TimeScope = "recent_15" | "recent_30" | "archived" | "all";

const scopeOptions: { value: TimeScope; label: string }[] = [
  { value: "recent_15", label: "Last 15 days" },
  { value: "recent_30", label: "Last month" },
  { value: "archived", label: "Archive" },
  { value: "all", label: "All records" },
];

const REPLACEMENT_LIST_COLUMNS =
  "id, status, created_at, replacement_number, order_reference, order_number, order_type, product_name, quantity, archived_at";

export default async function ReplacementsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; date?: string; scope?: string; error?: string; success?: string }> }) {
  const profile = await requireProfile();
  const params = await searchParams;
  const scope: TimeScope = scopeOptions.some((item) => item.value === params.scope)
    ? params.scope as TimeScope
    : "recent_30";

  const supabase = await createClient();
  let query = supabase.from("replacements").select(REPLACEMENT_LIST_COLUMNS).order("created_at", { ascending: false });
  const now = new Date();
  if (scope === "recent_15") {
    query = query.is("archived_at", null).gte("created_at", new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString());
  } else if (scope === "recent_30") {
    query = query.is("archived_at", null).gte("created_at", new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString());
  } else if (scope === "archived") {
    query = query.not("archived_at", "is", null);
  }
  if (params.status === "AWAITING_LOGISTICS") {
    query = query.eq("status", "NEW");
  } else if (params.status === "AWAITING_QC") {
    query = query.in("status", ["LABEL_PRINTED", "QC_REJECTED"]);
  } else if (STATUSES.includes(params.status as ReplacementStatus)) {
    query = query.eq("status", params.status!);
  }
  if (params.date) query = query.gte("created_at", `${params.date}T00:00:00`).lt("created_at", `${params.date}T23:59:59.999`);
  if (params.q?.trim()) {
    const q = params.q.trim().replace(/[%_,()"'\\]/g, " ").replace(/\s+/g, " ").slice(0, 100);
    if (q) {
      const orderNumberFilter = /^\d+$/.test(q) ? `,order_number.eq.${Number(q)}` : "";
      query = query.or(`replacement_number.ilike.%${q}%,order_reference.ilike.%${q}%,product_name.ilike.%${q}%${orderNumberFilter}`);
    }
  }
  const { data, error } = await query.limit(100);
  const replacements = (data ?? []) as Replacement[];

  const canCreate = hasAnyRole(profile, ["CUSTOMER_SUPPORT", "ADMIN"]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-700">Replacements Pipeline</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Replacement Orders</h1>
        </div>

        {canCreate && (
          <Link
            href="/replacements/new"
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-bold text-white shadow-lg shadow-[var(--brand)]/20 transition hover:-translate-y-0.5 hover:brightness-95"
          >
            <CirclePlus className="size-5" />
            New Replacement
          </Link>
        )}
      </div>

      <Card className="p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" aria-label="Replacement time range">
            {scopeOptions.map((option) => {
              const linkParams = new URLSearchParams();
              linkParams.set("scope", option.value);
              if (params.status) linkParams.set("status", params.status);
              if (params.q) linkParams.set("q", params.q);
              return (
                <Link
                  key={option.value}
                  href={`/replacements?${linkParams.toString()}`}
                  className={`rounded-xl px-3 py-2 text-xs font-bold transition ${scope === option.value ? "bg-[var(--brand)] text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                >
                  {option.value === "archived" && <Archive className="mr-1 inline size-3.5" />}
                  {option.label}
                </Link>
              );
            })}
          </div>
          {hasRole(profile, "ADMIN") && (
            <form action={archiveCompletedReplacementsAction}>
              <button className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50">
                <Archive className="size-4" /> Archive completed 30+ day orders
              </button>
            </form>
          )}
        </div>
        <form className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_190px_170px_auto]">
          <input type="hidden" name="scope" value={scope} />
          <div className="relative flex min-h-12 w-full items-center">
            <span className="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-12 items-center justify-center" aria-hidden="true">
              <Search className="size-5 text-slate-400" />
            </span>
            <Input
              name="q"
              type="search"
              defaultValue={params.q}
              placeholder="Order #, reference, REP number, product"
              className="h-12 py-0 pl-12 pr-4"
              aria-label="Search orders"
            />
          </div>
          <Select name="status" defaultValue={params.status ?? ""} aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="AWAITING_LOGISTICS">Awaiting logistics</option>
            <option value="AWAITING_QC">Awaiting Packing QC</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>{statusLabel[status]}</option>
            ))}
          </Select>
          <Input name="date" type="date" defaultValue={params.date} aria-label="Filter by date" />
          <button className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white hover:bg-slate-800 transition active:scale-[0.99]">
            <SlidersHorizontal className="size-4" />
            Filter
          </button>
        </form>
      </Card>

      {(error || params.error) && (
        <Card className="border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">
          {params.error ?? error?.message}
        </Card>
      )}
      {params.success && (
        <Card className="border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
          {params.success}
        </Card>
      )}

      {replacements.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {replacements.map((replacement) => (
            <ReplacementCard key={replacement.id} replacement={replacement} role={profile.role} />
          ))}
        </div>
      ) : (
        <Card className="p-10 text-center">
          <h2 className="font-bold text-slate-800">No replacements match these filters</h2>
          <p className="mt-1 text-sm text-slate-500">Clear a filter, try another search, or check the Archive.</p>
        </Card>
      )}
    </div>
  );
}
