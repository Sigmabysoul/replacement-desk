"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
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

function getInitialThemeId(): ThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;
  try {
    const saved = window.localStorage.getItem("replacement-desk-theme");
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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setTheme] = useState<ThemeId>(getInitialThemeId);
  const theme = useMemo(() => getTheme(themeId), [themeId]);

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
    window.localStorage.setItem("replacement-desk-theme", JSON.stringify({ version: 2, themeId }));
  }, [theme, themeId]);

  const value = useMemo(() => ({
    theme,
    setTheme,
    resetTheme: () => setTheme(DEFAULT_THEME_ID),
  }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
