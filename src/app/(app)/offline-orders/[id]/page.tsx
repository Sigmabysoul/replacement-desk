import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  Boxes,
  Download,
  ExternalLink,
  FileText,
  Truck,
} from "lucide-react";
import { notFound } from "next/navigation";
import { EditOfflineOrderId } from "@/components/offline-orders/edit-offline-order-id";
import { OfflineActionPanel } from "@/components/offline-orders/offline-action-panel";
import { OfflineActivityTimeline } from "@/components/offline-orders/offline-activity-timeline";
import { OfflineCommentComposer } from "@/components/offline-orders/offline-comment-composer";
import { OfflineStatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type {
  OfflineOrder,
  OfflineOrderActivityLog,
  OfflineOrderAttachment,
  Profile,
} from "@/lib/types";
import { formatDate } from "@/lib/utils";

function isImageAttachment(file: OfflineOrderAttachment) {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.mime_type);
}

export default async function OfflineOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; warning?: string; success?: string }>;
}) {
  const profile = await requireProfile();
  const { id } = await params;
  const notice = await searchParams;
  const supabase = await createClient();

  const [
    { data: orderData },
    { data: attachmentData },
    { data: activityData },
  ] = await Promise.all([
    supabase.from("offline_orders").select("*").eq("id", id).single(),
    supabase
      .from("offline_order_attachments")
      .select("*")
      .eq("offline_order_id", id)
      .order("created_at"),
    supabase
      .from("offline_order_activity_logs")
      .select("*")
      .eq("offline_order_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (!orderData) notFound();
  const order = orderData as OfflineOrder;
  const attachments = (attachmentData ?? []) as OfflineOrderAttachment[];
  const userRoles = profile.roles?.length ? profile.roles : [profile.role];
  const canEditOrderNumber = userRoles.some((r) =>
    ["BOSS", "HR", "CUSTOMER_SUPPORT", "ADMIN"].includes(r),
  );
  const activities = (activityData ?? []) as OfflineOrderActivityLog[];

  const actorIds = [
    ...new Set(
      [
        order.created_by,
        order.printing_confirmed_by,
        order.packing_confirmed_by,
        order.dispatched_by,
        order.picked_up_by,
        order.delivered_by,
        order.acknowledged_by,
        ...activities.map((item) => item.actor_id),
      ].filter(Boolean),
    ),
  ] as string[];

  const { data: profileRows } = actorIds.length
    ? await supabase.from("profiles").select("id,full_name,role,roles").in("id", actorIds)
    : { data: [] };

  const names = new Map(
    (profileRows ?? []).map((item) => [item.id, item as Pick<Profile, "full_name" | "role" | "roles">]),
  );

  // Generate signed URLs for attachments
  if (attachments.length > 0) {
    const { data: signedData } = await supabase.storage
      .from("offline-order-files")
      .createSignedUrls(
        attachments.map((item) => item.storage_path),
        60 * 60, // 1 hour
      );
    const urlMap = new Map(
      (signedData ?? [])
        .filter((item) => item.path && item.signedUrl)
        .map((item) => [item.path as string, item.signedUrl as string]),
    );
    attachments.forEach((att) => {
      att.signed_url = urlMap.get(att.storage_path) ?? undefined;
    });
  }

  const creator = names.get(order.created_by);

  const activitiesWithActors = activities.map((item) => ({
    ...item,
    actor: item.actor_id ? names.get(item.actor_id) ?? null : null,
  }));

  const dispatchDocs = attachments.filter((item) => item.attachment_type === "DISPATCH_DOC");
  const podDocs = attachments.filter((item) => item.attachment_type === "POD");

  return (
    <div className="grid gap-6">
      <Notice>{notice.error}</Notice>
      <Notice tone="warning">{notice.warning}</Notice>
      <Notice tone="success">{notice.success}</Notice>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/offline-orders"
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-indigo-600"
        >
          <ArrowLeft className="size-4" /> Back to Offline Orders
        </Link>
      </div>

      {/* Header card */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                SO: {order.so_number}
              </h1>
              {order.brand && (
                <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-black text-indigo-700">
                  {order.brand}
                </span>
              )}
              <OfflineStatusBadge status={order.status} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <EditOfflineOrderId
                orderId={order.id}
                currentOrderNumber={order.order_number}
                canEdit={canEditOrderNumber}
              />
              <span>·</span>
              <span>Created by {creator?.full_name ?? "Boss"} on {formatDate(order.created_at)}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Action panel */}
      <OfflineActionPanel order={order} profile={profile} attachments={dispatchDocs} />

      {/* Order info details */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Boxes className="size-5 text-indigo-600" />
            <h2 className="font-black text-slate-950">Product & Order Details</h2>
          </div>
          <div className="mt-4 grid gap-3 text-sm">
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Product</span>
              <strong className="text-right text-slate-900">{order.product_name}</strong>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Quantity</span>
              <strong className="text-slate-900">
                {order.quantity} {order.unit}
              </strong>
            </div>
            {order.brand && (
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Brand</span>
                <strong className="text-slate-900">{order.brand}</strong>
              </div>
            )}
            {order.dispatch_date && (
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Target Dispatch Date</span>
                <strong className="text-slate-900">{order.dispatch_date}</strong>
              </div>
            )}
            {order.notes && (
              <div className="pt-1">
                <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Notes</span>
                <p className="mt-1 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                  {order.notes}
                </p>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Truck className="size-5 text-indigo-600" />
            <h2 className="font-black text-slate-950">Logistics & Fulfilment</h2>
          </div>
          <div className="mt-4 grid gap-3 text-sm">
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-500">Logistics Partner</span>
              <strong className="text-slate-900">{order.logistics_partner ?? "Not assigned yet"}</strong>
            </div>

            {order.carton_count != null && (
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Carton Count</span>
                <strong className="text-slate-900">{order.carton_count} boxes</strong>
              </div>
            )}

            {order.carton_dimensions && (
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Dimensions</span>
                <strong className="text-slate-900">{order.carton_dimensions}</strong>
              </div>
            )}

            {order.carton_weight_kg != null && (
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Total Weight</span>
                <strong className="text-slate-900">{order.carton_weight_kg} KG</strong>
              </div>
            )}

            {order.lr_number && (
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">LR / Consignment No</span>
                <strong className="font-mono text-slate-900">{order.lr_number}</strong>
              </div>
            )}

            {order.tracking_url && (
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">Live Tracking</span>
                <a
                  href={order.tracking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-bold text-indigo-600 hover:underline"
                >
                  Track Shipment <ExternalLink className="size-3.5" />
                </a>
              </div>
            )}

            {order.pod_notes && (
              <div className="pt-1">
                <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Proof of Delivery (POD) Notes
                </span>
                <p className="mt-1 whitespace-pre-wrap rounded-xl bg-emerald-50/70 p-3 text-xs text-emerald-900 ring-1 ring-emerald-200">
                  {order.pod_notes}
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Attachments Section */}
      {(dispatchDocs.length > 0 || podDocs.length > 0) && (
        <Card className="p-5">
          <h2 className="font-black text-slate-950">Documents & Attachments</h2>

          {dispatchDocs.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Dispatch & Consignment Documents
              </h3>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {dispatchDocs.map((doc) => (
                  <div key={doc.id} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3">
                    {doc.signed_url && isImageAttachment(doc) ? (
                      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate-100">
                        <Image src={doc.signed_url} alt={doc.file_name} fill unoptimized className="object-cover" />
                      </div>
                    ) : (
                      <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-slate-200">
                        <FileText className="size-8 text-slate-500" />
                      </div>
                    )}
                    <p className="mt-2 truncate text-xs font-bold text-slate-800">{doc.file_name}</p>
                    {doc.signed_url && (
                      <a
                        href={doc.signed_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
                      >
                        <Download className="size-3" /> View / Download
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {podDocs.length > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                Proof of Delivery (POD)
              </h3>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {podDocs.map((doc) => (
                  <div key={doc.id} className="group relative overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                    {doc.signed_url && isImageAttachment(doc) ? (
                      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate-100">
                        <Image src={doc.signed_url} alt={doc.file_name} fill unoptimized className="object-cover" />
                      </div>
                    ) : (
                      <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-emerald-100">
                        <FileText className="size-8 text-emerald-600" />
                      </div>
                    )}
                    <p className="mt-2 truncate text-xs font-bold text-slate-800">{doc.file_name}</p>
                    {doc.signed_url && (
                      <a
                        href={doc.signed_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                      >
                        <Download className="size-3" /> View POD
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Activity Timeline & Comments */}
      <Card className="p-5">
        <h2 className="mb-4 font-black text-slate-950">Activity & Timeline</h2>
        <OfflineActivityTimeline activities={activitiesWithActors} />

        <div className="mt-6 border-t border-slate-100 pt-5">
          <OfflineCommentComposer orderId={order.id} profile={profile} />
        </div>
      </Card>
    </div>
  );
}
