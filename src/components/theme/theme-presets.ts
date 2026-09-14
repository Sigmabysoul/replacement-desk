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
    mode: "light",
    name: "Arctic Blue",
    description: "Crisp blue with a cool, low-glare workspace",
    colors: { primary: "#2563eb", secondary: "#0f766e", tertiary: "#b45309", background: "#eaf1f7", foreground: "#172033", surface: "#f8fbfd", border: "#cbd8e5", muted: "#e1eaf2", mutedForeground: "#5c6b7f" },
  },
  {
    id: "lavender-mist",
    mode: "light",
    name: "Lavender Mist",
    description: "Gentle violet tones for a calmer desk",
    colors: { primary: "#5b21b6", secondary: "#0f766e", tertiary: "#b45309", background: "#f0edf7", foreground: "#211a35", surface: "#faf8fd", border: "#d9d1e8", muted: "#e7e1f1", mutedForeground: "#6c627d" },
  },
  {
    id: "sage-garden",
    mode: "light",
    name: "Sage Garden",
    description: "Restful greens with soft natural surfaces",
    colors: { primary: "#047857", secondary: "#4d7c0f", tertiary: "#b45309", background: "#edf3ec", foreground: "#193026", surface: "#f8fbf7", border: "#cdddcf", muted: "#e0ebe1", mutedForeground: "#5e7065" },
  },
  {
    id: "warm-sand",
    mode: "light",
    name: "Warm Sand",
    description: "Paper-like neutrals with an earthy accent",
    colors: { primary: "#9a3412", secondary: "#0f766e", tertiary: "#a16207", background: "#f4eee3", foreground: "#33271d", surface: "#fdfaf5", border: "#ded1bd", muted: "#ebe1d3", mutedForeground: "#746657" },
  },
  {
    id: "rose-quartz",
    mode: "light",
    name: "Rose Quartz",
    description: "Muted rose surfaces with confident contrast",
    colors: { primary: "#be123c", secondary: "#7e22ce", tertiary: "#b45309", background: "#f6ecef", foreground: "#371c25", surface: "#fdf8fa", border: "#e5ccd4", muted: "#efdee4", mutedForeground: "#7a6069" },
  },
  {
    id: "ocean-mist",
    mode: "light",
    name: "Ocean Mist",
    description: "Balanced ocean blue and teal for long shifts",
    colors: { primary: "#0369a1", secondary: "#0f766e", tertiary: "#c2410c", background: "#e9f2f3", foreground: "#142d33", surface: "#f7fbfb", border: "#c6dce0", muted: "#dcebed", mutedForeground: "#587078" },
  },
  {
    id: "stone-calm",
    mode: "light",
    name: "Stone Calm",
    description: "Quiet neutral grays with minimal visual noise",
    colors: { primary: "#475569", secondary: "#0f766e", tertiary: "#a16207", background: "#efefec", foreground: "#292924", surface: "#fafaf7", border: "#d8d8d0", muted: "#e5e5df", mutedForeground: "#686860" },
  },
  {
    id: "peach-paper",
    mode: "light",
    name: "Peach Paper",
    description: "A warm peach wash with clear orange actions",
    colors: { primary: "#c2410c", secondary: "#0f766e", tertiary: "#a21caf", background: "#f8ede6", foreground: "#3b251c", surface: "#fff9f5", border: "#e7cfc1", muted: "#f1dfd4", mutedForeground: "#7b6357" },
  },
  {
    id: "mint-cloud",
    mode: "light",
    name: "Mint Cloud",
    description: "Fresh mint neutrals with emerald controls",
    colors: { primary: "#047857", secondary: "#0369a1", tertiary: "#b45309", background: "#e9f3ef", foreground: "#173028", surface: "#f7fbf9", border: "#c6ddd4", muted: "#d9ebe4", mutedForeground: "#577067" },
  },
  {
    id: "dusk-blue",
    mode: "light",
    name: "Dusk Blue",
    description: "A subdued indigo workspace with cool depth",
    colors: { primary: "#4338ca", secondary: "#0e7490", tertiary: "#b45309", background: "#eaedf5", foreground: "#1d2338", surface: "#f8f9fc", border: "#ccd2e3", muted: "#dde2ef", mutedForeground: "#606a83" },
  },
  {
    id: "midnight-indigo", mode: "dark", name: "Midnight Indigo", description: "Deep navy surfaces with focused indigo actions",
    colors: { primary: "#3730a3", secondary: "#0f766e", tertiary: "#b45309", background: "#090d1a", foreground: "#f1f5f9", surface: "#11182a", border: "#29334a", muted: "#1a2438", mutedForeground: "#a8b3c7" },
  },
  {
    id: "graphite", mode: "dark", name: "Graphite", description: "Neutral charcoal for a distraction-free shift",
    colors: { primary: "#334155", secondary: "#0f766e", tertiary: "#a16207", background: "#101214", foreground: "#f4f4f5", surface: "#191c20", border: "#343940", muted: "#24282d", mutedForeground: "#adb3bc" },
  },
  {
    id: "forest-night", mode: "dark", name: "Forest Night", description: "Dark evergreen with calm natural contrast",
    colors: { primary: "#047857", secondary: "#1d4ed8", tertiary: "#a16207", background: "#07130f", foreground: "#ecfdf5", surface: "#10231b", border: "#284537", muted: "#193329", mutedForeground: "#a7c7b8" },
  },
  {
    id: "plum-night", mode: "dark", name: "Plum Night", description: "Rich aubergine surfaces and restrained violet",
    colors: { primary: "#6d28d9", secondary: "#0f766e", tertiary: "#b45309", background: "#130b19", foreground: "#faf5ff", surface: "#211329", border: "#41284d", muted: "#311d3c", mutedForeground: "#c8b3d0" },
  },
  {
    id: "ocean-night", mode: "dark", name: "Ocean Night", description: "Blue-black workspace with a cool ocean accent",
    colors: { primary: "#0369a1", secondary: "#0f766e", tertiary: "#c2410c", background: "#07131a", foreground: "#f0f9ff", surface: "#0e202b", border: "#274454", muted: "#17313e", mutedForeground: "#abc3cf" },
  },
  {
    id: "espresso", mode: "dark", name: "Espresso", description: "Warm near-black surfaces with earthy controls",
    colors: { primary: "#9a3412", secondary: "#0f766e", tertiary: "#854d0e", background: "#160e0a", foreground: "#fff7ed", surface: "#261811", border: "#4d3326", muted: "#38251b", mutedForeground: "#d1b7a7" },
  },
  {
    id: "crimson-night", mode: "dark", name: "Crimson Night", description: "Dark wine tones with decisive red accents",
    colors: { primary: "#9f1239", secondary: "#6d28d9", tertiary: "#a16207", background: "#18090e", foreground: "#fff1f2", surface: "#281118", border: "#512733", muted: "#3a1b24", mutedForeground: "#d5b0ba" },
  },
  {
    id: "slate-night", mode: "dark", name: "Slate Night", description: "Cool slate layers built for long evening work",
    colors: { primary: "#1d4ed8", secondary: "#0f766e", tertiary: "#b45309", background: "#0b1120", foreground: "#f8fafc", surface: "#151e30", border: "#334155", muted: "#202c40", mutedForeground: "#b0bed1" },
  },
] as const satisfies ReadonlyArray<{
  id: string;
  mode: "light" | "dark";
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
