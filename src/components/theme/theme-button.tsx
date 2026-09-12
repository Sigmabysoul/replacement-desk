"use client";

import { useState } from "react";
import { Check, Palette, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme/theme-provider";
import { THEME_PRESETS } from "@/components/theme/theme-presets";

export function ThemeButton() {
  const { theme, setTheme, resetTheme } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label={`Choose workspace theme. Current theme: ${theme.name}`}
        className="size-9 sm:size-10"
      >
        <Palette className="size-4.5" />
      </Button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-black/40 backdrop-blur-[2px] sm:bg-transparent sm:backdrop-blur-none"
            onClick={() => setOpen(false)}
            aria-label="Close theme editor"
          />
          <section
            className="fixed inset-x-3 top-16 z-50 mx-auto w-auto max-w-md rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-2xl sm:absolute sm:inset-auto sm:right-0 sm:top-12 sm:w-[25rem] sm:max-w-none"
            aria-label="Workspace theme picker"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold">Workspace themes</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Ten balanced, low-glare palettes. Your choice saves automatically.</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close theme editor" className="size-8">
                <X className="size-4" />
              </Button>
            </div>
            <div className="mt-4 grid max-h-[min(65vh,34rem)] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {THEME_PRESETS.map((preset) => {
                const selected = preset.id === theme.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setTheme(preset.id)}
                    aria-pressed={selected}
                    className={`relative rounded-xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${selected ? "border-[var(--brand)] bg-muted ring-2 ring-[var(--brand)]/15" : "border-border bg-card hover:border-[var(--brand)]/50"}`}
                  >
                    <span className="mb-2 flex h-9 items-center gap-1 rounded-lg border border-black/5 px-2" style={{ backgroundColor: preset.colors.background }}>
                      <span className="size-4 rounded-full shadow-sm" style={{ backgroundColor: preset.colors.primary }} />
                      <span className="size-4 rounded-full shadow-sm" style={{ backgroundColor: preset.colors.secondary }} />
                      <span className="size-4 rounded-full shadow-sm" style={{ backgroundColor: preset.colors.tertiary }} />
                      <span className="ml-auto size-4 rounded-full border border-black/10 shadow-sm" style={{ backgroundColor: preset.colors.surface }} />
                    </span>
                    <span className="flex items-center gap-1.5 text-xs font-bold">
                      {preset.name}
                      {selected ? <Check className="size-3.5 text-[var(--brand)]" aria-hidden="true" /> : null}
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">{preset.description}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
              <Button type="button" variant="ghost" onClick={resetTheme}>
                <RotateCcw className="size-3.5 mr-1" /> Reset
              </Button>
              <span className="text-xs font-medium text-muted-foreground">Saved on this device</span>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
