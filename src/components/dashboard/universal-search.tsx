"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  CalendarDays,
  ClipboardList,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { OfflineStatusBadge, ReplacementStatusBadge } from "@/components/ui/badge";
import type { OfflineOrder, Replacement } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export function UniversalSearch({
  replacements,
  offlineOrders,
}: {
  replacements: Replacement[];
  offlineOrders: OfflineOrder[];
}) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"ALL" | "REPLACEMENTS" | "OFFLINE">("ALL");
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = query.trim().toLowerCase();

  const filteredReplacements = useMemo(() => {
    if (!trimmed) return [];
    return replacements.filter((order) => {
      const matchNumber = order.replacement_number.toLowerCase().includes(trimmed);
      const matchOrderNum = String(order.order_number).includes(trimmed);
      const matchProduct = order.product_name.toLowerCase().includes(trimmed);
      const matchCustomer = order.customer_name?.toLowerCase().includes(trimmed) ?? false;
      const matchPhone = order.customer_phone?.toLowerCase().includes(trimmed) ?? false;
      const matchRef = order.order_reference?.toLowerCase().includes(trimmed) ?? false;
      const matchCourier = order.courier_partner?.toLowerCase().includes(trimmed) ?? false;
      const matchTracking = order.tracking_id?.toLowerCase().includes(trimmed) ?? false;
      return (
        matchNumber ||
        matchOrderNum ||
        matchProduct ||
        matchCustomer ||
        matchPhone ||
        matchRef ||
        matchCourier ||
        matchTracking
      );
    });
  }, [replacements, trimmed]);

  const filteredOffline = useMemo(() => {
    if (!trimmed) return [];
    return offlineOrders.filter((order) => {
      const matchSO = order.so_number.toLowerCase().includes(trimmed);
      const matchOrderNum = String(order.order_number).includes(trimmed);
      const matchBrand = order.brand?.toLowerCase().includes(trimmed) ?? false;
      const matchProduct = order.product_name.toLowerCase().includes(trimmed);
      const matchLR = order.lr_number?.toLowerCase().includes(trimmed) ?? false;
      const matchPartner = order.logistics_partner?.toLowerCase().includes(trimmed) ?? false;
      return (
        matchSO ||
        matchOrderNum ||
        matchBrand ||
        matchProduct ||
        matchLR ||
        matchPartner
      );
    });
  }, [offlineOrders, trimmed]);

  const totalResults = filteredReplacements.length + filteredOffline.length;
  const isSearching = trimmed.length > 0;

  return (
    <div className="relative w-full">
      {/* Search Input Bar */}
      <div className="relative flex items-center">
        <span className="pointer-events-none absolute left-4 grid place-items-center text-slate-400">
          <Search className="size-5" />
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by Order #, SO #, Customer, Phone, Product, Courier, or Tracking..."
          className="h-13 w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-12 text-sm font-semibold text-slate-900 shadow-xs transition placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
          aria-label="Universal search"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="absolute right-3 grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Live Search Results Overlay */}
      {isSearching && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[75vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl ring-1 ring-slate-900/5">
          {/* Filter Tabs */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setTab("ALL")}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  tab === "ALL"
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                All ({totalResults})
              </button>
              <button
                type="button"
                onClick={() => setTab("REPLACEMENTS")}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  tab === "REPLACEMENTS"
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Replacements ({filteredReplacements.length})
              </button>
              <button
                type="button"
                onClick={() => setTab("OFFLINE")}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  tab === "OFFLINE"
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Offline Orders ({filteredOffline.length})
              </button>
            </div>

            <span className="text-[11px] font-semibold text-slate-400">
              {totalResults} result{totalResults === 1 ? "" : "s"} found
            </span>
          </div>

          {totalResults === 0 ? (
            <div className="py-8 text-center">
              <Search className="mx-auto size-8 text-slate-300" />
              <p className="mt-2 text-sm font-bold text-slate-800">No matching orders found</p>
              <p className="text-xs text-slate-400">
                Check for typos or try searching with an SO number, replacement ID, or phone number.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {/* Replacements Results */}
              {(tab === "ALL" || tab === "REPLACEMENTS") && filteredReplacements.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-1.5 px-1 text-xs font-black uppercase tracking-wider text-indigo-700">
                    <ClipboardList className="size-3.5" />
                    <span>Replacement Orders ({filteredReplacements.length})</span>
                  </div>
                  <div className="grid gap-2">
                    {filteredReplacements.slice(0, 5).map((order) => (
                      <Link
                        key={order.id}
                        href={`/replacements/${order.id}`}
                        className="group flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 transition hover:border-indigo-200 hover:bg-indigo-50/40"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-slate-900">
                              {order.replacement_number}
                            </span>
                            <ReplacementStatusBadge status={order.status} />
                          </div>
                          <p className="mt-1 truncate text-xs font-bold text-slate-800">
                            {order.product_name} × {order.quantity}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 text-[11px] text-slate-500">
                            {order.customer_name && (
                              <span className="flex items-center gap-1">
                                <UserRound className="size-3" /> {order.customer_name}
                              </span>
                            )}
                            {order.customer_phone && <span>· {order.customer_phone}</span>}
                            {order.courier_partner && (
                              <span>· Courier: {order.courier_partner}</span>
                            )}
                          </div>
                        </div>

                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-slate-400 shadow-xs transition group-hover:bg-indigo-600 group-hover:text-white">
                          <ArrowRight className="size-4" />
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Offline Orders Results */}
              {(tab === "ALL" || tab === "OFFLINE") && filteredOffline.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-1.5 px-1 text-xs font-black uppercase tracking-wider text-slate-800">
                    <Boxes className="size-3.5 text-indigo-600" />
                    <span>Offline Orders ({filteredOffline.length})</span>
                  </div>
                  <div className="grid gap-2">
                    {filteredOffline.slice(0, 5).map((order) => (
                      <Link
                        key={order.id}
                        href={`/offline-orders/${order.id}`}
                        className="group flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 transition hover:border-indigo-200 hover:bg-indigo-50/40"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 font-mono text-xs font-black text-indigo-700">
                              SO: {order.so_number}
                            </span>
                            {order.brand && (
                              <span className="rounded-md bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                                {order.brand}
                              </span>
                            )}
                            <OfflineStatusBadge status={order.status} />
                          </div>
                          <p className="mt-1 truncate text-xs font-bold text-slate-800">
                            {order.product_name} × {order.quantity} {order.unit}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
                            <span>#{order.order_number}</span>
                            {order.logistics_partner && <span>· Courier: {order.logistics_partner}</span>}
                            {order.lr_number && <span>· LR: {order.lr_number}</span>}
                            {order.created_at && (
                              <span className="flex items-center gap-1">
                                <CalendarDays className="size-3" /> {formatDate(order.created_at)}
                              </span>
                            )}
                          </div>
                        </div>

                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-slate-400 shadow-xs transition group-hover:bg-indigo-600 group-hover:text-white">
                          <ArrowRight className="size-4" />
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
