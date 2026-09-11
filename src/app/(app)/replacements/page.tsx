import { Search, SlidersHorizontal } from "lucide-react";
import { ReplacementCard } from "@/components/replacements/replacement-card";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { STATUSES, type Replacement, type ReplacementStatus } from "@/lib/types";
import { statusLabel } from "@/lib/utils";

export default async function ReplacementsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; date?: string; error?: string }> }) {
  const profile = await requireProfile();
  const params = await searchParams;

  const supabase = await createClient();
  let query = supabase.from("replacements").select("*").order("created_at", { ascending: false });
  if (STATUSES.includes(params.status as ReplacementStatus)) query = query.eq("status", params.status!);
  if (params.date) query = query.gte("created_at", `${params.date}T00:00:00`).lt("created_at", `${params.date}T23:59:59.999`);
  if (params.q?.trim()) {
    const q = params.q.trim().replace(/[%_,()"'\\]/g, " ").replace(/\s+/g, " ").slice(0, 100);
    if (q) query = query.or(`replacement_number.ilike.%${q}%,order_reference.ilike.%${q}%,product_name.ilike.%${q}%`);
  }
  const { data, error } = await query.limit(100);
  const replacements = (data ?? []) as Replacement[];

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-700">All work</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Replacements</h1>
      </div>

      <Card className="p-4 sm:p-5">
        <form className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_190px_170px_auto]">
          <label className="relative">
            <span className="sr-only">Search replacements</span>
            <Search className="pointer-events-none absolute left-3.5 top-3.5 size-5 text-slate-400" />
            <Input name="q" defaultValue={params.q} placeholder="REP number, order, product" className="pl-11" />
          </label>
          <Select name="status" defaultValue={params.status ?? ""} aria-label="Filter by status">
            <option value="">All statuses</option>
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

      {replacements.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {replacements.map((replacement) => (
            <ReplacementCard key={replacement.id} replacement={replacement} role={profile.role} />
          ))}
        </div>
      ) : (
        <Card className="p-10 text-center">
          <h2 className="font-bold text-slate-800">No replacements match these filters</h2>
          <p className="mt-1 text-sm text-slate-500">Clear a filter or try another search.</p>
        </Card>
      )}
    </div>
  );
}
