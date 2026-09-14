import { describe, expect, it } from "vitest";
import { DEFAULT_THEME_ID, THEME_PRESETS, getTheme } from "@/components/theme/theme-presets";

function luminance(hex: string) {
  const channels = hex.slice(1).match(/.{2}/g)?.map((value) => {
    const channel = Number.parseInt(value, 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  if (!channels || channels.length !== 3) throw new Error(`Invalid color: ${hex}`);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first: string, second: string) {
  const light = Math.max(luminance(first), luminance(second));
  const dark = Math.min(luminance(first), luminance(second));
  return (light + 0.05) / (dark + 0.05);
}

describe("workspace theme presets", () => {
  it("offers separate light and dark theme collections", () => {
    expect(THEME_PRESETS.filter((theme) => theme.mode === "light")).toHaveLength(10);
    expect(THEME_PRESETS.filter((theme) => theme.mode === "dark")).toHaveLength(8);
    expect(new Set(THEME_PRESETS.map((theme) => theme.id))).toHaveLength(18);
    expect(new Set(THEME_PRESETS.map((theme) => theme.name))).toHaveLength(18);
  });

  it("keeps primary actions readable with white text", () => {
    for (const theme of THEME_PRESETS) {
      expect(contrast(theme.colors.primary, "#ffffff"), theme.name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps workspace and card text comfortably readable", () => {
    for (const theme of THEME_PRESETS) {
      expect(contrast(theme.colors.foreground, theme.colors.background), `${theme.name} workspace`).toBeGreaterThanOrEqual(7);
      expect(contrast(theme.colors.foreground, theme.colors.surface), `${theme.name} cards`).toBeGreaterThanOrEqual(7);
    }
  });

  it("resolves the documented default theme", () => {
    expect(getTheme(DEFAULT_THEME_ID).id).toBe(DEFAULT_THEME_ID);
  });
});
