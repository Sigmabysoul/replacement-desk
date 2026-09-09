"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Check, Package, Volume2, VolumeX, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Role } from "@/lib/types";

interface NotificationItem {
  id: string;
  replacement_id: string;
  title: string;
  subtitle: string;
  created_at: string;
  status?: string;
}

function playChime() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.start(now);
    osc.stop(now + 0.35);
  } catch {
    // AudioContext blocked or user has not interacted
  }
}

export function NotificationBell({ role }: { role?: Role }) {
  const [isOpen, setIsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("rd_chime_enabled");
    return saved !== null ? saved === "true" : true;
  });
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [lastReadTime, setLastReadTime] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const saved = localStorage.getItem("rd_last_read_notif");
    return saved ? parseInt(saved, 10) : 0;
  });
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Fetch initial recent replacement activity
  useEffect(() => {
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return;
    }

    async function loadNotifications() {
      const { data, error } = await supabase
        .from("replacements")
        .select("id, replacement_number, order_reference, product_name, status, updated_at")
        .order("updated_at", { ascending: false })
        .limit(10);

      if (!error && data) {
        setNotifications(
          data.map((row) => ({
            id: `${row.id}-${row.status}-${row.updated_at}`,
            replacement_id: row.id,
            title: `${row.replacement_number} · ${formatStatus(row.status)}`,
            subtitle: `${row.order_reference} · ${row.product_name}`,
            created_at: row.updated_at,
            status: row.status,
          })),
        );
      }
    }

    loadNotifications();

    // Listen to live database changes via Realtime
    const channel = supabase
      .channel("notification-bell-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "replacements" },
        (payload) => {
          const row = payload.new as {
            id?: string;
            replacement_number?: string;
            order_reference?: string;
            product_name?: string;
            status?: string;
            updated_at?: string;
          };
          if (!row || !row.id) return;

          const newItem: NotificationItem = {
            id: `${row.id}-${row.status}-${row.updated_at || Date.now()}`,
            replacement_id: row.id,
            title: `${row.replacement_number || "Order"} · ${formatStatus(row.status || "UPDATED")}`,
            subtitle: `${row.order_reference || ""} · ${row.product_name || ""}`,
            created_at: row.updated_at || new Date().toISOString(),
            status: row.status,
          };

          setNotifications((prev) => [newItem, ...prev.filter((p) => p.replacement_id !== row.id)].slice(0, 15));

          if (soundEnabled) {
            playChime();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [soundEnabled]);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const unreadCount = notifications.filter(
    (n) => new Date(n.created_at).getTime() > lastReadTime,
  ).length;

  function markAllRead() {
    const now = Date.now();
    setLastReadTime(now);
    localStorage.setItem("rd_last_read_notif", now.toString());
  }

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem("rd_chime_enabled", String(next));
    if (next) playChime();
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen && unreadCount > 0) {
            markAllRead();
          }
        }}
        aria-label="Notifications"
        className="relative grid size-10 place-items-center rounded-xl text-slate-600 transition hover:bg-white hover:text-slate-900"
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-black text-white shadow-sm ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-12 z-50 w-80 sm:w-96 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl animate-in fade-in zoom-in-95">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-slate-900">Notifications</span>
              {role && (
                <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                  {role}
                </span>
              )}
              {unreadCount > 0 && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleSound}
                title={soundEnabled ? "Mute alert chime" : "Enable alert chime"}
                className={`grid size-7 place-items-center rounded-lg text-xs transition ${
                  soundEnabled ? "text-indigo-600 hover:bg-indigo-50" : "text-slate-400 hover:bg-slate-100"
                }`}
              >
                {soundEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
              </button>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  title="Mark all as read"
                  className="grid size-7 place-items-center rounded-lg text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                >
                  <Check className="size-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-50 py-1">
            {notifications.length === 0 ? (
              <div className="py-8 text-center">
                <Package className="mx-auto size-7 text-slate-300" />
                <p className="mt-2 text-xs font-semibold text-slate-500">No recent notifications</p>
              </div>
            ) : (
              notifications.map((item) => (
                <Link
                  key={item.id}
                  href={`/replacements/${item.replacement_id}`}
                  onClick={() => setIsOpen(false)}
                  className="flex items-start gap-3 rounded-xl p-2.5 transition hover:bg-slate-50"
                >
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-700">
                    <Package className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-slate-900">{item.title}</p>
                    <p className="truncate text-[11px] text-slate-500">{item.subtitle}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {formatTimeAgo(item.created_at)}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatStatus(status: string) {
  switch (status) {
    case "NEW":
      return "New Request";
    case "LABEL_PRINTED":
      return "Label Printed";
    case "QC_PENDING":
      return "QC Submitted";
    case "QC_APPROVED":
      return "QC Approved";
    case "QC_REJECTED":
      return "QC Rejected";
    case "PACKED":
      return "Packed";
    case "SHIPPED":
      return "Shipped";
    case "NEEDS_TOKEN":
      return "Needs Token";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status;
  }
}

function formatTimeAgo(timestamp: string) {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString();
}
