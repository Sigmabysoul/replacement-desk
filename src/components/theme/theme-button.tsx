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
      <Button type="button" variant="ghost" size="icon" onClick={openEditor} aria-label="Customize theme">
        <Palette data-icon="inline-start" />
      </Button>
      {open && (
        <>
          <button className="fixed inset-0 z-40 cursor-default bg-transparent" onClick={() => setOpen(false)} aria-label="Close theme editor" />
          <section className="absolute right-0 top-12 z-50 w-[min(21rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-2xl" aria-label="Custom theme editor">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold">Custom theme</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Choose three colors for your workspace.</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close theme editor">
                <X data-icon="inline-start" />
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
                <RotateCcw data-icon="inline-start" /> Reset
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
