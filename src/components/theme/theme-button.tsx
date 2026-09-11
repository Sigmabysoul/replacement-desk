"use client";

import { useState } from "react";
import { Palette, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme/theme-provider";

const fields = [
  { key: "primary", label: "Primary", description: "Buttons and active navigation" },
  { key: "secondary", label: "Secondary", description: "Supporting surfaces and accents" },
  { key: "tertiary", label: "Tertiary", description: "Highlights and attention states" },
] as const;

export function ThemeButton() {
  const { colors, setColors, resetColors } = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(colors);

  function openEditor() {
    setDraft(colors);
    setOpen(true);
  }

  function applyTheme() {
    setColors(draft);
    setOpen(false);
  }

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={openEditor}
        aria-label="Customize theme"
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
            className="fixed inset-x-3 top-16 z-50 mx-auto w-auto max-w-sm rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-2xl sm:absolute sm:inset-auto sm:right-0 sm:top-12 sm:w-[21rem] sm:max-w-none"
            aria-label="Custom theme editor"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold">Custom theme</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Choose three colors for your workspace.</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close theme editor" className="size-8">
                <X className="size-4" />
              </Button>
            </div>
            <div className="mt-4 grid gap-3">
              {fields.map(({ key, label, description }) => (
                <label key={key} className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3">
                  <input
                    type="color"
                    value={draft[key]}
                    onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
                    className="size-10 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                    aria-label={`${label} color`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{description}</span>
                  </span>
                  <code className="text-[11px] uppercase text-muted-foreground">{draft[key]}</code>
                </label>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-border p-2">
              <span className="size-8 rounded-lg" style={{ backgroundColor: draft.primary }} />
              <span className="size-8 rounded-lg" style={{ backgroundColor: draft.secondary }} />
              <span className="size-8 rounded-lg" style={{ backgroundColor: draft.tertiary }} />
              <span className="ml-auto text-xs font-medium text-muted-foreground">Live palette preview</span>
            </div>
            <div className="mt-4 flex justify-between gap-2">
              <Button type="button" variant="ghost" onClick={() => { resetColors(); setDraft(defaultColors); }}>
                <RotateCcw className="size-3.5 mr-1" /> Reset
              </Button>
              <Button type="button" onClick={applyTheme}>Apply theme</Button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

const defaultColors = {
  primary: "#2563eb",
  secondary: "#0f766e",
  tertiary: "#f59e0b",
};
