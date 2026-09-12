export type ThemeColors = {
  primary: string;
  secondary: string;
  tertiary: string;
  background: string;
  foreground: string;
  surface: string;
  border: string;
  muted: string;
  mutedForeground: string;
};

export const THEME_PRESETS = [
  {
    id: "arctic-blue",
    name: "Arctic Blue",
    description: "Crisp blue with a cool, low-glare workspace",
    colors: { primary: "#2563eb", secondary: "#0f766e", tertiary: "#b45309", background: "#eaf1f7", foreground: "#172033", surface: "#f8fbfd", border: "#cbd8e5", muted: "#e1eaf2", mutedForeground: "#5c6b7f" },
  },
  {
    id: "lavender-mist",
    name: "Lavender Mist",
    description: "Gentle violet tones for a calmer desk",
    colors: { primary: "#5b21b6", secondary: "#0f766e", tertiary: "#b45309", background: "#f0edf7", foreground: "#211a35", surface: "#faf8fd", border: "#d9d1e8", muted: "#e7e1f1", mutedForeground: "#6c627d" },
  },
  {
    id: "sage-garden",
    name: "Sage Garden",
    description: "Restful greens with soft natural surfaces",
    colors: { primary: "#047857", secondary: "#4d7c0f", tertiary: "#b45309", background: "#edf3ec", foreground: "#193026", surface: "#f8fbf7", border: "#cdddcf", muted: "#e0ebe1", mutedForeground: "#5e7065" },
  },
  {
    id: "warm-sand",
    name: "Warm Sand",
    description: "Paper-like neutrals with an earthy accent",
    colors: { primary: "#9a3412", secondary: "#0f766e", tertiary: "#a16207", background: "#f4eee3", foreground: "#33271d", surface: "#fdfaf5", border: "#ded1bd", muted: "#ebe1d3", mutedForeground: "#746657" },
  },
  {
    id: "rose-quartz",
    name: "Rose Quartz",
    description: "Muted rose surfaces with confident contrast",
    colors: { primary: "#be123c", secondary: "#7e22ce", tertiary: "#b45309", background: "#f6ecef", foreground: "#371c25", surface: "#fdf8fa", border: "#e5ccd4", muted: "#efdee4", mutedForeground: "#7a6069" },
  },
  {
    id: "ocean-mist",
    name: "Ocean Mist",
    description: "Balanced ocean blue and teal for long shifts",
    colors: { primary: "#0369a1", secondary: "#0f766e", tertiary: "#c2410c", background: "#e9f2f3", foreground: "#142d33", surface: "#f7fbfb", border: "#c6dce0", muted: "#dcebed", mutedForeground: "#587078" },
  },
  {
    id: "stone-calm",
    name: "Stone Calm",
    description: "Quiet neutral grays with minimal visual noise",
    colors: { primary: "#475569", secondary: "#0f766e", tertiary: "#a16207", background: "#efefec", foreground: "#292924", surface: "#fafaf7", border: "#d8d8d0", muted: "#e5e5df", mutedForeground: "#686860" },
  },
  {
    id: "peach-paper",
    name: "Peach Paper",
    description: "A warm peach wash with clear orange actions",
    colors: { primary: "#c2410c", secondary: "#0f766e", tertiary: "#a21caf", background: "#f8ede6", foreground: "#3b251c", surface: "#fff9f5", border: "#e7cfc1", muted: "#f1dfd4", mutedForeground: "#7b6357" },
  },
  {
    id: "mint-cloud",
    name: "Mint Cloud",
    description: "Fresh mint neutrals with emerald controls",
    colors: { primary: "#047857", secondary: "#0369a1", tertiary: "#b45309", background: "#e9f3ef", foreground: "#173028", surface: "#f7fbf9", border: "#c6ddd4", muted: "#d9ebe4", mutedForeground: "#577067" },
  },
  {
    id: "dusk-blue",
    name: "Dusk Blue",
    description: "A subdued indigo workspace with cool depth",
    colors: { primary: "#4338ca", secondary: "#0e7490", tertiary: "#b45309", background: "#eaedf5", foreground: "#1d2338", surface: "#f8f9fc", border: "#ccd2e3", muted: "#dde2ef", mutedForeground: "#606a83" },
  },
] as const satisfies ReadonlyArray<{
  id: string;
  name: string;
  description: string;
  colors: ThemeColors;
}>;

export type ThemeId = (typeof THEME_PRESETS)[number]["id"];
export type ThemePreset = (typeof THEME_PRESETS)[number];

export const DEFAULT_THEME_ID: ThemeId = "arctic-blue";

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEME_PRESETS.some((theme) => theme.id === value);
}

export function getTheme(themeId: ThemeId): ThemePreset {
  return THEME_PRESETS.find((theme) => theme.id === themeId) ?? THEME_PRESETS[0];
}
