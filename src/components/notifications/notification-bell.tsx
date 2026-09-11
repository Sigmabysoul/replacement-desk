"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  Check,
  CheckCircle2,
  Package,
  Volume2,
  VolumeX,
  X,
  Play,
} from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Role } from "@/lib/types";

interface NotificationItem {
  id: string;
  replacement_id: string;
  title: string;
  subtitle: string;
  created_at: string;
  status?: string;
}

/**
 * High-volume, punchy warehouse operational alert tone.
 * Uses harmonic triangle oscillators to cut cleanly through ambient warehouse noise.
 */
export function playLoudWarehouseAlert(status?: string) {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    // Distinctive acoustic patterns based on operational event
    const isUrgent = status === "QC_REJECTED" || status === "NEEDS_TOKEN";
    const frequencies = isUrgent
      ? [750, 580] // Warning double tone
      : [880, 1175, 1400]; // Loud, energetic triple alert

    let timeOffset = ctx.currentTime;
    frequencies.forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Triangle wave provides punchy odd harmonics without harsh distortion
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, timeOffset);

      // 0.75 volume for clear audibility in warehouse / factory floors
      gain.gain.setValueAtTime(0.75, timeOffset);
      gain.gain.exponentialRampToValueAtTime(0.01, timeOffset + 0.14);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(timeOffset);
      osc.stop(timeOffset + 0.15);

      timeOffset += 0.12;
    });

    // Mobile device vibration
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([250, 100, 250]);
    }
  } catch {
    // AudioContext blocked before first user interaction
  }
}

/**
 * Fires a native OS/browser system notification (lock screen & desktop banner).
 *
 * @param title Bold notification header.
 * @param body Descriptive text detailing the order event.
 * @param replacementId Replacement record UUID.
 * @param onOpen Optional callback executed when user clicks the notification banner.
 */
function fireSystemNotification(
  title: string,
  body: string,
  replacementId: string,
  onOpen?: () => void,
) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "granted") {
    try {
      const notif = new Notification(title, {
        body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: `rd-${replacementId}-${Date.now()}`,
      });
      notif.onclick = () => {
        window.focus();
        if (onOpen) {
          onOpen();
        }
        notif.close();
      };
    } catch {
      // Fallback
    }
  }
}

/**
 * Generates user-facing notification titles and descriptive summaries
 * corresponding to replacement lifecycle status updates.
 *
 * @param status Operational order status.
 * @param repNumber Formatted replacement ID (e.g. REP-2026-0001).
 * @param orderRef Original customer sales order reference.
 * @param product Product SKU or item name.
 * @returns Object with formatted `title` and `body` strings.
 */
function getNotificationContent(
  status: string,
  repNumber: string,
  orderRef: string,
  product: string,
) {
  switch (status) {
    case "PACKED":
      return {
        title: `📦 Order Packed · ${repNumber}`,
        body: `Order ${orderRef} (${product}) is packed & ready for dispatch.`,
      };
    case "SHIPPED":
      return {
        title: `🚚 Order Shipped · ${repNumber}`,
        body: `Order ${orderRef} (${product}) has been marked as shipped.`,
      };
    case "QC_APPROVED":
      return {
        title: `✅ QC Approved · ${repNumber}`,
        body: `QC approved for ${orderRef}. Ready to pack!`,
      };
    case "QC_REJECTED":
      return {
        title: `❌ QC Rejected · ${repNumber}`,
        body: `QC rejected for ${orderRef}. Please check feedback and resubmit.`,
      };
    case "QC_PENDING":
      return {
        title: `🔍 QC Submitted · ${repNumber}`,
        body: `Packing submitted photos for ${orderRef}. Pending review.`,
      };
    case "LABEL_PRINTED":
      return {
        title: `🖨️ Label Printed · ${repNumber}`,
        body: `Shipping label printed for ${orderRef} (${product}).`,
      };
    case "NEW":
      return {
        title: `🆕 New Replacement · ${repNumber}`,
        body: `Order ${orderRef} · ${product} created by Esha.`,
      };
    case "NEEDS_TOKEN":
      return {
        title: `⚠️ Token Required · ${repNumber}`,
        body: `Need to raise token for order ${orderRef}.`,
      };
    default:
      return {
        title: `📋 Order Updated · ${repNumber}`,
        body: `Order ${orderRef} · ${product} status changed to ${status}.`,
      };
  }
}

/**
 * Top navigation notification center component.
 *
 * Capabilities:
 * - Realtime badge counter for unread order updates.
 * - Loud synthesized warehouse acoustic alerts via Web Audio API.
 * - Native desktop and mobile browser push notifications with permission prompt.
 * - Live subscription to Supabase Realtime `replacements` table mutations.
 * - Dropdown feed with direct links to recent replacement orders.
 *
 * @param props.role Current user's department role.
 */
export function NotificationBell({ role }: { role?: Role }) {
  const router = useRouter();
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
  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      return Notification.permission;
    }
    return "default";
  });
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Fetch initial notifications and subscribe to live changes
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return;
    }

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
          data.map((row) => {
            const content = getNotificationContent(
              row.status,
              row.replacement_number,
              row.order_reference,
              row.product_name,
            );
            return {
              id: `${row.id}-${row.status}-${row.updated_at}`,
              replacement_id: row.id,
              title: content.title,
              subtitle: content.body,
              created_at: row.updated_at,
              status: row.status,
            };
          }),
        );
      }
    }

    loadNotifications();

    // Listen to live database changes via Supabase Realtime
    const channel = supabase
      .channel("notification-bell-live")
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

          const content = getNotificationContent(
            row.status || "UPDATED",
            row.replacement_number || "Order",
            row.order_reference || "",
            row.product_name || "",
          );

          const newItem: NotificationItem = {
            id: `${row.id}-${row.status}-${row.updated_at || Date.now()}`,
            replacement_id: row.id,
            title: content.title,
            subtitle: content.body,
            created_at: row.updated_at || new Date().toISOString(),
            status: row.status,
          };

          setNotifications((prev) =>
            [newItem, ...prev.filter((p) => p.replacement_id !== row.id)].slice(0, 15),
          );

          // 1. Play loud warehouse operational alert
          if (soundEnabled) {
            playLoudWarehouseAlert(row.status);
          }

          // 2. Fire system/browser lock screen notification
          fireSystemNotification(content.title, content.body, row.id, () => {
            router.push(`/replacements/${row.id}`);
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [soundEnabled, router]);

  // Click outside to close
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
    if (next) playLoudWarehouseAlert("PACKED");
  }

  async function requestPermission() {
    if (typeof window !== "undefined" && "Notification" in window) {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") {
        playLoudWarehouseAlert("PACKED");
        fireSystemNotification(
          "🔔 Notifications Enabled!",
          "You will receive loud alerts when orders are packed, shipped, or approved.",
          "",
        );
      }
    }
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
        className="relative grid size-9 sm:size-10 place-items-center rounded-xl text-slate-600 transition hover:bg-white hover:text-slate-900"
      >
        <Bell className="size-4.5 sm:size-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-black text-white shadow-sm ring-2 ring-white animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="fixed inset-x-3 top-16 z-50 mx-auto w-auto max-w-sm rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl animate-in fade-in zoom-in-95 sm:absolute sm:inset-auto sm:right-0 sm:top-12 sm:w-96 sm:max-w-none">
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
                onClick={() => playLoudWarehouseAlert("PACKED")}
                title="Test loud warehouse alert sound"
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
              >
                <Play className="size-3 fill-indigo-600" />
                <span>Test</span>
              </button>
              <button
                type="button"
                onClick={toggleSound}
                title={soundEnabled ? "Mute loud alert sound" : "Enable loud alert sound"}
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

          {/* Browser System Notification Banner */}
          {permission !== "granted" && (
            <div className="m-2 rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-sky-50 p-3">
              <div className="flex items-start gap-2.5">
                <Bell className="mt-0.5 size-4 shrink-0 text-indigo-600" />
                <div className="flex-1">
                  <p className="text-xs font-bold text-indigo-950">
                    Get System & Lock-screen Alerts
                  </p>
                  <p className="mt-0.5 text-[11px] text-indigo-700">
                    Receive pop-ups when orders are packed, shipped, or approved even in background.
                  </p>
                  <button
                    type="button"
                    onClick={requestPermission}
                    className="mt-2 inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm hover:bg-indigo-700"
                  >
                    <CheckCircle2 className="size-3.5" />
                    Enable Device Alerts
                  </button>
                </div>
              </div>
            </div>
          )}

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
                    <p className="line-clamp-2 text-[11px] text-slate-500">{item.subtitle}</p>
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

/**
 * Computes a relative, human-friendly duration string (e.g. "Just now", "5m ago", "2h ago").
 *
 * @param timestamp ISO date string or millisecond timestamp.
 * @returns Short human-readable relative time string.
 */
function formatTimeAgo(timestamp: string) {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString();
}
