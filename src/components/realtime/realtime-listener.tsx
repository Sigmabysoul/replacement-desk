"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

/**
 * Headless Realtime listener that subscribes to database changes on `replacements`
 * and triggers a seamless Server Component refresh via Next.js `router.refresh()`.
 * Allows workers in printing, packing, and admin to see status updates live
 * without needing to manually refresh their browser.
 */
export function RealtimeListener() {
  const router = useRouter();
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

    const triggerRefresh = () => {
      // Debounce refreshes to prevent rapid refetches
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      refreshTimeoutRef.current = setTimeout(() => {
        router.refresh();
      }, 300);
    };

    const channel = supabase
      .channel("realtime-replacements")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "replacements",
        },
        triggerRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "qc_submissions",
        },
        triggerRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "offline_orders",
        },
        triggerRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "offline_order_activity",
        },
        triggerRefresh,
      )
      .subscribe();

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
