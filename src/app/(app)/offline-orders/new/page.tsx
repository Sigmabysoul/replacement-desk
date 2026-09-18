import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { OfflineOrderForm } from "@/components/offline-orders/offline-order-form";
import { Notice } from "@/components/ui/notice";
import { requireProfile } from "@/lib/auth/session";

export default async function NewOfflineOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireProfile(["BOSS", "ADMIN"]);
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/offline-orders"
        className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-indigo-600"
      >
        <ArrowLeft className="size-4" /> Back to Offline Orders
      </Link>

      <div className="mt-4">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-700">The Brothers & Co</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
          Create Offline Order
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Enter the Sales Order (SO) number and product specifications. Printing, Consignment, and HR teams will be notified to process fulfilment.
        </p>
      </div>

      <div className="mt-4">
        <Notice>{error}</Notice>
      </div>

      <div className="mt-6">
        <OfflineOrderForm />
      </div>
    </div>
  );
}

