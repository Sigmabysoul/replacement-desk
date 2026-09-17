"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  DEFAULT_THEME_ID,
  getTheme,
  isThemeId,
  THEME_PRESETS,
  type ThemeId,
  type ThemePreset,
} from "@/components/theme/theme-presets";

type ThemeContextValue = {
  theme: ThemePreset;
  setTheme: (themeId: ThemeId) => void;
  resetTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const THEME_STORAGE_KEY = "replacement-desk-theme";
const THEME_CHANGE_EVENT = "replacement-desk-theme-change";

function getInitialThemeId(): ThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!saved) return DEFAULT_THEME_ID;
    const parsed = JSON.parse(saved) as { themeId?: unknown; primary?: string; background?: string };
    if (isThemeId(parsed.themeId)) return parsed.themeId;

    // Migrate the previous free-form theme format when it matches a new preset.
    const matchingTheme = THEME_PRESETS.find(({ colors }) => (
      colors.primary === parsed.primary && colors.background === parsed.background
    ));
    if (matchingTheme) {
      return matchingTheme.id;
    }
  } catch {
    // The persistence effect below replaces malformed storage with the default.
  }
  return DEFAULT_THEME_ID;
}

function subscribeToTheme(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
  };
}

function saveThemeId(themeId: ThemeId) {
  window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ version: 2, themeId }));
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // getServerSnapshot keeps SSR and hydration identical. React reads the
  // browser snapshot immediately afterwards and updates to the saved theme.
  const themeId = useSyncExternalStore(subscribeToTheme, getInitialThemeId, () => DEFAULT_THEME_ID);
  const theme = useMemo(() => getTheme(themeId), [themeId]);
  const setTheme = useCallback((nextThemeId: ThemeId) => saveThemeId(nextThemeId), []);

  useEffect(() => {
    const { colors } = theme;
    document.documentElement.style.setProperty("--brand", colors.primary);
    document.documentElement.style.setProperty("--brand-secondary", colors.secondary);
    document.documentElement.style.setProperty("--brand-tertiary", colors.tertiary);
    document.documentElement.style.setProperty("--background", colors.background);
    document.documentElement.style.setProperty("--foreground", colors.foreground);
    document.documentElement.style.setProperty("--surface", colors.surface);
    document.documentElement.style.setProperty("--card", colors.surface);
    document.documentElement.style.setProperty("--card-foreground", colors.foreground);
    document.documentElement.style.setProperty("--border", colors.border);
    document.documentElement.style.setProperty("--muted", colors.muted);
    document.documentElement.style.setProperty("--muted-foreground", colors.mutedForeground);
    document.documentElement.dataset.themeMode = theme.mode;
  }, [theme]);

  const value = useMemo(() => ({
    theme,
    setTheme,
    resetTheme: () => setTheme(DEFAULT_THEME_ID),
  }), [setTheme, theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
