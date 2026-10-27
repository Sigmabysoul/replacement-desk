"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Headless background listener that triggers seamless Server Component updates via Next.js `router.refresh()`.
 * Refreshes operational lists when workers refocus their tab or on a 15-second lightweight polling interval.
 */
export function RealtimeListener() {
  const router = useRouter();
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const triggerRefresh = () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      refreshTimeoutRef.current = setTimeout(() => {
        router.refresh();
      }, 300);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        triggerRefresh();
      }
    };

    window.addEventListener("focus", triggerRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // 15-second polling interval while active
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        triggerRefresh();
      }
    }, 15000);

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      window.removeEventListener("focus", triggerRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(interval);
    };
  }, [router]);

  return null;
}
