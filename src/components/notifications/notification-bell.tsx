"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  Boxes,
  Check,
  CheckCircle2,
  Package,
  Volume2,
  VolumeX,
  X,
  Play,
} from "lucide-react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  getOfflineNotificationContent,
  NOTIFICATION_RECIPIENTS,
} from "@/lib/notifications/format";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";

interface NotificationItem {
  id: string;
  order_type: "REPLACEMENT" | "OFFLINE";
  target_id: string;
  href: string;
  title: string;
  subtitle: string;
  created_at: string;
  status?: string;
  tag: string;
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
        body: `Packing submitted QC photos for ${orderRef}. Pending CUSTOMER_SUPPORT review.`,
      };
    case "LABEL_UPLOADED":
      return {
        title: `🏷️ Label Uploaded · ${repNumber}`,
        body: `Logistics uploaded the shipping label for ${orderRef}. Ready for Printing.`,
      };
    case "LABEL_PRINTED":
      return {
        title: `🖨️ Label Printed · ${repNumber}`,
        body: `Shipping label printed for ${orderRef} (${product}).`,
      };
    case "NEW":
      return {
        title: `🆕 New Replacement · ${repNumber}`,
        body: `Order ${orderRef} · ${product} created by CUSTOMER_SUPPORT.`,
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
export function NotificationBell({ role, roles }: { role?: Role; roles?: Role[] }) {
  const router = useRouter();
  const userRoles = useMemo(() => {
    return roles?.length ? roles : role ? [role] : [];
  }, [roles, role]);
  const isAdmin = userRoles.includes("ADMIN");
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
      const [
        { data: repData },
        { data: offData },
      ] = await Promise.all([
        supabase
          .from("replacements")
          .select("id, replacement_number, order_reference, product_name, status, updated_at")
          .order("updated_at", { ascending: false })
          .limit(8),
        supabase
          .from("offline_orders")
          .select("id, so_number, product_name, status, updated_at, carton_count, logistics_partner")
          .order("updated_at", { ascending: false })
          .limit(8),
      ]);

      const items: NotificationItem[] = [];

      if (repData) {
        repData.forEach((row) => {
          const content = getNotificationContent(
            row.status,
            row.replacement_number,
            row.order_reference,
            row.product_name,
          );
          items.push({
            id: `rep-${row.id}-${row.status}-${row.updated_at}`,
            order_type: "REPLACEMENT",
            target_id: row.id,
            href: `/replacements/${row.id}`,
            title: content.title,
            subtitle: content.body,
            created_at: row.updated_at,
            status: row.status,
            tag: "REPLACEMENT",
          });
        });
      }

      if (offData) {
        offData.forEach((row) => {
          const content = getOfflineNotificationContent(
            row.status,
            row.so_number,
            row.product_name,
            { cartonCount: row.carton_count, courier: row.logistics_partner },
          );
          items.push({
            id: `off-${row.id}-${row.status}-${row.updated_at}`,
            order_type: "OFFLINE",
            target_id: row.id,
            href: `/offline-orders/${row.id}`,
            title: content.title,
            subtitle: content.body,
            created_at: row.updated_at,
            status: row.status,
            tag: "OFFLINE SO",
          });
        });
      }

      items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setNotifications(items.slice(0, 15));
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
            id: `rep-${row.id}-${row.status}-${row.updated_at || Date.now()}`,
            order_type: "REPLACEMENT",
            target_id: row.id,
            href: `/replacements/${row.id}`,
            title: content.title,
            subtitle: content.body,
            created_at: row.updated_at || new Date().toISOString(),
            status: row.status,
            tag: "REPLACEMENT",
          };

          setNotifications((prev) =>
            [newItem, ...prev.filter((p) => p.id !== newItem.id)].slice(0, 15),
          );

          const targetRoles = (NOTIFICATION_RECIPIENTS as Record<string, readonly Role[]>)[row.status || ""] ?? [];
          const isTargetRecipient =
            isAdmin || targetRoles.length === 0 || targetRoles.some((r) => userRoles.includes(r));

          if (isTargetRecipient) {
            if (soundEnabled) {
              playLoudWarehouseAlert(row.status);
            }
            fireSystemNotification(content.title, content.body, row.id, () => {
              router.push(`/replacements/${row.id}`);
            });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "offline_orders" },
        (payload) => {
          const row = payload.new as {
            id?: string;
            so_number?: string;
            product_name?: string;
            status?: string;
            carton_count?: number;
            logistics_partner?: string;
            updated_at?: string;
          };
          if (!row || !row.id) return;

          const content = getOfflineNotificationContent(
            row.status || "UPDATED",
            row.so_number || "Offline SO",
            row.product_name || "Materials",
            { cartonCount: row.carton_count, courier: row.logistics_partner },
          );

          const newItem: NotificationItem = {
            id: `off-${row.id}-${row.status}-${row.updated_at || Date.now()}`,
            order_type: "OFFLINE",
            target_id: row.id,
            href: `/offline-orders/${row.id}`,
            title: content.title,
            subtitle: content.body,
            created_at: row.updated_at || new Date().toISOString(),
            status: row.status,
            tag: "OFFLINE SO",
          };

          setNotifications((prev) =>
            [newItem, ...prev.filter((p) => p.id !== newItem.id)].slice(0, 15),
          );

          const isTargetRecipient =
            isAdmin || content.targetRoles.some((r) => userRoles.includes(r));

          if (isTargetRecipient) {
            if (soundEnabled) {
              playLoudWarehouseAlert(row.status);
            }
            fireSystemNotification(content.title, content.body, row.id, () => {
              router.push(`/offline-orders/${row.id}`);
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [soundEnabled, router, isAdmin, userRoles]);

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
        className="relative grid size-9 sm:size-10 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <Bell className="size-4.5 sm:size-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-black text-white shadow-sm ring-2 ring-background animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="fixed inset-x-3 top-16 z-50 mx-auto w-auto max-w-sm rounded-2xl border border-border bg-card text-card-foreground p-2 shadow-2xl animate-in fade-in zoom-in-95 sm:absolute sm:inset-auto sm:right-0 sm:top-12 sm:w-96 sm:max-w-none">
          <div className="flex items-center justify-between border-b border-border/70 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-foreground">Notifications</span>
              {userRoles.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {userRoles.slice(0, 2).map((r) => (
                    <span
                      key={r}
                      className="rounded border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400"
                    >
                      {r.replace("_", " ")}
                    </span>
                  ))}
                  {userRoles.length > 2 && (
                    <span className="text-[10px] font-bold text-muted-foreground">
                      +{userRoles.length - 2}
                    </span>
                  )}
                </div>
              )}
              {unreadCount > 0 && (
                <span className="rounded-full border border-rose-500/30 bg-rose-500/15 px-2 py-0.5 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => playLoudWarehouseAlert("PACKED")}
                title="Test loud warehouse alert sound"
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10"
              >
                <Play className="size-3 fill-indigo-600 dark:fill-indigo-400" />
                <span>Test</span>
              </button>
              <button
                type="button"
                onClick={toggleSound}
                title={soundEnabled ? "Mute loud alert sound" : "Enable loud alert sound"}
                className={cn(
                  "grid size-7 place-items-center rounded-lg text-xs transition",
                  soundEnabled
                    ? "text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {soundEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
              </button>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  title="Mark all as read"
                  className="grid size-7 place-items-center rounded-lg text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Check className="size-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>

          {/* Browser System Notification Banner */}
          {permission !== "granted" && (
            <div className="m-2 rounded-xl border border-indigo-500/20 bg-indigo-500/5 dark:bg-indigo-950/30 p-3">
              <div className="flex items-start gap-2.5">
                <Bell className="mt-0.5 size-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                <div className="flex-1">
                  <p className="text-xs font-bold text-foreground">
                    Get System & Lock-screen Alerts
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Receive pop-ups when orders are packed, shipped, or approved even in background.
                  </p>
                  <button
                    type="button"
                    onClick={requestPermission}
                    className="mt-2 inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 active:scale-95 transition"
                  >
                    <CheckCircle2 className="size-3.5" />
                    Enable Device Alerts
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="max-h-80 overflow-y-auto divide-y divide-border/50 py-1">
            {notifications.length === 0 ? (
              <div className="py-8 text-center">
                <Package className="mx-auto size-7 text-muted-foreground/40" />
                <p className="mt-2 text-xs font-semibold text-muted-foreground">No recent notifications</p>
              </div>
            ) : (
              notifications.map((item) => {
                const isOffline = item.order_type === "OFFLINE";
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className="flex items-start gap-3 rounded-xl p-2.5 transition hover:bg-muted/60"
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border text-xs",
                        isOffline
                          ? "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          : "border-indigo-500/25 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
                      )}
                    >
                      {isOffline ? <Boxes className="size-3.5" /> : <Package className="size-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide border",
                            isOffline
                              ? "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                              : "border-indigo-500/30 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
                          )}
                        >
                          {item.tag}
                        </span>
                        <p className="truncate text-xs font-bold text-foreground">{item.title}</p>
                      </div>
                      <p className="line-clamp-2 text-[11px] text-muted-foreground">{item.subtitle}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground/70">
                        {formatTimeAgo(item.created_at)}
                      </p>
                    </div>
                  </Link>
                );
              })
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
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
  }).format(new Date(timestamp));
}
