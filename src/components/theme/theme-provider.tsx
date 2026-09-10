"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type ThemeColors = {
  primary: string;
  secondary: string;
  tertiary: string;
};

type ThemeContextValue = {
  colors: ThemeColors;
  setColors: (colors: ThemeColors) => void;
  resetColors: () => void;
};

const defaultColors: ThemeColors = {
  primary: "#2563eb",
  secondary: "#0f766e",
  tertiary: "#f59e0b",
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialColors(): ThemeColors {
  if (typeof window === "undefined") return defaultColors;
  try {
    const saved = window.localStorage.getItem("replacement-desk-theme");
    if (!saved) return defaultColors;
    const parsed = JSON.parse(saved) as Partial<ThemeColors>;
    if (parsed.primary && parsed.secondary && parsed.tertiary) {
      return { primary: parsed.primary, secondary: parsed.secondary, tertiary: parsed.tertiary };
    }
  } catch {
    // The persistence effect below replaces malformed storage with defaults.
  }
  return defaultColors;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [colors, setColors] = useState<ThemeColors>(getInitialColors);

  useEffect(() => {
    document.documentElement.style.setProperty("--brand", colors.primary);
    document.documentElement.style.setProperty("--brand-secondary", colors.secondary);
    document.documentElement.style.setProperty("--brand-tertiary", colors.tertiary);
    window.localStorage.setItem("replacement-desk-theme", JSON.stringify(colors));
  }, [colors]);

  const value = useMemo(() => ({
    colors,
    setColors,
    resetColors: () => setColors(defaultColors),
  }), [colors]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
