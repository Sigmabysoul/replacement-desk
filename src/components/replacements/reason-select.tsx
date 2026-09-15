"use client";

import { useState } from "react";
import { Input, Select } from "@/components/ui/field";

const DEFAULT_PRESETS = [
  "Damaged",
  "Wrong product",
  "Missing item",
  "Quality issue",
] as const;

export function ReasonSelect({
  defaultValue,
  label = "Reason (optional)",
  name = "reason",
  presets = DEFAULT_PRESETS,
  onValueChange,
}: {
  defaultValue?: string | null;
  label?: string;
  name?: string | null;
  presets?: readonly string[];
  onValueChange?: (value: string) => void;
}) {
  const initialIsPreset = defaultValue && presets.includes(defaultValue);
  const initialPreset = defaultValue
    ? initialIsPreset
      ? defaultValue
      : "Other"
    : "";
  const initialCustom = !initialIsPreset && defaultValue ? defaultValue : "";

  const [preset, setPreset] = useState<string>(initialPreset);
  const [customText, setCustomText] = useState<string>(initialCustom);

  const effectiveValue =
    preset === "Other"
      ? customText.trim() || "Other"
      : preset;

  return (
    <div className="grid gap-2">
      {name ? <input type="hidden" name={name} value={effectiveValue} /> : null}
      <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
        {label}
      </label>
      <Select
        value={preset}
        onChange={(event) => {
          const nextPreset = event.target.value;
          setPreset(nextPreset);
          onValueChange?.(nextPreset === "Other" ? customText.trim() || "Other" : nextPreset);
        }}
        aria-label={label}
      >
        <option value="">Select a reason</option>
        {presets.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
        <option value="Other">Other (custom reason)</option>
      </Select>

      {preset === "Other" && (
        <Input
          type="text"
          maxLength={200}
          autoFocus={!initialCustom}
          placeholder="Enter specific reason (e.g. Broken zipper, wrong color, etc.)"
          value={customText}
          onChange={(event) => {
            setCustomText(event.target.value);
            onValueChange?.(event.target.value);
          }}
          aria-label="Custom reason details"
          className="mt-1"
        />
      )}
    </div>
  );
}
