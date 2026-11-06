"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { playLoudWarehouseAlert } from "@/components/notifications/notification-bell";

export interface WorkTask {
  id: string;
  role: string;
  title: string;
  description: string;
  count: number;
  href: string;
  urgency: "high" | "normal";
}

interface WorkQueueResponse {
  userName: string;
  userRoles: string[];
  totalPendingCount: number;
  tasks: WorkTask[];
}

const STORAGE_LAST_ALERT_KEY = "rd_last_work_alert_timestamp";
const STORAGE_SOUND_KEY = "rd_chime_enabled";
const ONE_HOUR_MS = 60 * 60 * 1000; // 1 hour = 3600 seconds

/**
 * Fires native desktop & mobile push notification.
 */
function fireBrowserAlert(title: string, body: string, href?: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "granted") {
    try {
      const notif = new Notification(title, {
        body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: `rd-force-work-${Date.now()}`,
        requireInteraction: true,
      });
      notif.onclick = () => {
        window.focus();
        if (href) window.location.href = href;
        notif.close();
      };
    } catch {
      // Fallback
    }
  }
}

export function ForceWorkNotification() {
  const [data, setData] = useState<WorkQueueResponse | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [lastAlertTime, setLastAlertTime] = useState<number>(0);
  const [now, setNow] = useState<number>(() => Date.now());
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const val = localStorage.getItem(STORAGE_SOUND_KEY);
    return val !== null ? val === "true" : true;
  });

  // Sound + vibration + browser notification trigger
  const triggerNotificationEffects = useCallback(
    (count: number, tasks: WorkTask[]) => {
      // 1. Loud audio tone
      if (soundEnabled) {
        playLoudWarehouseAlert("NEEDS_TOKEN");
      }

      // 2. Mobile vibration (distinctive 3-pulse vibration)
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate([300, 150, 300, 150, 300]);
      }

      // 3. Native OS notification (Desktop notification / Mobile lock screen & shade)
      const primaryTask = tasks[0];
      const taskPreview = primaryTask
        ? `${primaryTask.title}: ${primaryTask.count} pending`
        : `${count} orders require your action`;
      fireBrowserAlert(
        `⚠️ ACTION REQUIRED: ${count} Pending Task${count > 1 ? "s" : ""}`,
        `You have ${count} pending warehouse order(s). ${taskPreview}. Re-alerting every hour until complete!`,
        primaryTask?.href || "/"
      );
    },
    [soundEnabled]
  );

  // Fetch pending work and decide whether to force on screen
  const checkWorkQueue = useCallback(
    async (isManual = false) => {
      try {
        const res = await fetch("/api/work-queue", { cache: "no-store" });
        if (!res.ok) return;
        const resData: WorkQueueResponse = await res.json();
        setData(resData);

        const count = resData.totalPendingCount || 0;
        if (count === 0) {
          // All caught up! Close modal
          if (!isManual) setIsOpen(false);
          return;
        }

        const storedAlertTime = parseInt(
          localStorage.getItem(STORAGE_LAST_ALERT_KEY) || "0",
          10
        );
        const currentTime = Date.now();
        const timeSinceLastAlert = currentTime - storedAlertTime;
        const isHourlyOverdue = timeSinceLastAlert >= ONE_HOUR_MS;

        if (isManual) {
          setIsOpen(true);
          return;
        }

        // FORCE NOTIFICATION ON SCREEN if:
        // 1. Never alerted before (storedAlertTime === 0)
        // 2. Or 1 hour has elapsed and tasks are still incomplete!
        if (storedAlertTime === 0 || isHourlyOverdue) {
          setIsOpen(true);
          setLastAlertTime(currentTime);
          localStorage.setItem(STORAGE_LAST_ALERT_KEY, currentTime.toString());
          triggerNotificationEffects(count, resData.tasks);
        } else {
          setLastAlertTime(storedAlertTime);
        }
      } catch {
        // Retry on next interval
      }
    },
    [triggerNotificationEffects]
  );

  // Initial check on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      checkWorkQueue();
    }, 0);

    // Request notification permission if not yet decided
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    }

    return () => clearTimeout(timer);
  }, [checkWorkQueue]);

  // Periodic timer: update countdown every second and check hourly reminder every 30 seconds
  useEffect(() => {
    const clockInterval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    const reminderInterval = setInterval(() => {
      // Re-evaluate pending work and fire hourly reminder if incomplete
      checkWorkQueue();
    }, 30000);

    const handleFocus = () => {
      checkWorkQueue();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      clearInterval(clockInterval);
      clearInterval(reminderInterval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [checkWorkQueue]);

  const totalCount = data?.totalPendingCount || 0;
  const tasks = data?.tasks || [];

  // Calculate minutes & seconds until next hourly alert
  const msUntilNextAlert = Math.max(0, ONE_HOUR_MS - (now - lastAlertTime));
  const minutesUntilNext = Math.floor(msUntilNextAlert / 60000);
  const secondsUntilNext = Math.floor((msUntilNextAlert % 60000) / 1000);

  function handleDismiss() {
    setIsOpen(false);
  }

  function handleSnoozeOneHour() {
    const currentTime = Date.now();
    setLastAlertTime(currentTime);
    localStorage.setItem(STORAGE_LAST_ALERT_KEY, currentTime.toString());
    setIsOpen(false);
  }

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem(STORAGE_SOUND_KEY, String(next));
    if (next) playLoudWarehouseAlert("NEEDS_TOKEN");
  }

  if (totalCount === 0) return null;

  return (
    <>
      {/* 1. PERSISTENT FLOATING ON-SCREEN BADGE (Desktop & Mobile) */}
      {!isOpen && (
        <div className="fixed bottom-4 right-4 z-40 max-w-[calc(100vw-2rem)]">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="group flex items-center gap-2.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3.5 py-2 text-xs font-bold text-amber-900 shadow-xl backdrop-blur-md transition-all hover:scale-105 hover:bg-amber-500/20 active:scale-95 dark:border-amber-400/40 dark:bg-amber-950/80 dark:text-amber-200"
            aria-label="Pending Work Reminder"
          >
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex size-2.5 rounded-full bg-amber-500"></span>
            </span>

            <span className="flex items-center gap-1.5 font-black">
              <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400" />
              <span>{totalCount} PENDING</span>
            </span>

            <span className="hidden sm:inline border-l border-amber-500/30 pl-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">
              Next alert: {minutesUntilNext}m {secondsUntilNext}s
            </span>
          </button>
        </div>
      )}

      {/* 2. FORCED NOTIFICATION MODAL / DIALOG (Desktop & Mobile) */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="force-alert-title"
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border-2 border-amber-500/50 bg-card text-card-foreground shadow-2xl ring-4 ring-amber-500/20 animate-in zoom-in-95 duration-200"
          >
            {/* Top Amber Status Bar */}
            <div className="flex items-center justify-between border-b border-amber-500/30 bg-amber-500/15 px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-amber-500 text-slate-950">
                  <AlertTriangle className="size-3.5 stroke-[2.5]" />
                </span>
                <span className="text-xs font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">
                  ACTION REQUIRED · WORK PENDING
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={toggleSound}
                  title={soundEnabled ? "Mute alert audio" : "Enable alert audio"}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition"
                >
                  {soundEnabled ? (
                    <Volume2 className="size-4 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <VolumeX className="size-4 text-muted-foreground" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition"
                  aria-label="Close"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 grid gap-4 max-h-[calc(85vh-8rem)] overflow-y-auto">
              <div>
                <h2
                  id="force-alert-title"
                  className="text-lg sm:text-xl font-black tracking-tight text-foreground"
                >
                  You have {totalCount} incomplete task{totalCount > 1 ? "s" : ""}
                </h2>
                <p className="mt-1 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Warehouse operations are waiting on your assigned role. Please complete your pending orders to avoid delivery and dispatch delays.
                </p>
              </div>

              {/* Task Breakdown List */}
              <div className="grid gap-2 sm:gap-2.5">
                {tasks.map((task) => (
                  <Link
                    key={task.id}
                    href={task.href}
                    onClick={() => setIsOpen(false)}
                    className="group flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 p-3 sm:p-3.5 transition hover:border-indigo-500 hover:bg-indigo-500/5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-extrabold text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate">
                          {task.title}
                        </span>
                        {task.urgency === "high" && (
                          <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-black text-rose-600 dark:text-rose-400">
                            URGENT
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground truncate">
                        {task.description}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-600 text-xs font-black text-white shadow-sm">
                        {task.count}
                      </span>
                      <ArrowRight className="size-4 text-muted-foreground group-hover:text-indigo-600 group-hover:translate-x-0.5 transition" />
                    </div>
                  </Link>
                ))}
              </div>

              {/* Hourly Reminder Notice Box */}
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
                <Clock className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <div className="min-w-0 leading-relaxed">
                  <strong>Automatic Hourly Reminder:</strong> If tasks remain incomplete, this alert will sound and pop up on screen again every 1 hour until finished.
                  <div className="mt-1 text-[11px] font-medium opacity-85">
                    Next forced reminder in:{" "}
                    <span className="font-bold underline">
                      {minutesUntilNext} minute{minutesUntilNext === 1 ? "" : "s"} {secondsUntilNext} second{secondsUntilNext === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5 border-t border-border/70 bg-muted/20 px-4 py-3 sm:px-6">
              <button
                type="button"
                onClick={handleSnoozeOneHour}
                className="w-full sm:w-auto rounded-xl px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition"
              >
                I&apos;ll do it now (Snooze 1h)
              </button>

              {tasks.length > 0 && (
                <Link
                  href={tasks[0].href}
                  onClick={() => setIsOpen(false)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-500 active:scale-98"
                >
                  <span>Go to First Task ({tasks[0].title})</span>
                  <ArrowRight className="size-4" />
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
