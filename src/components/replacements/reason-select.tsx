"use client";

import { useState } from "react";
import { Input, Select } from "@/components/ui/field";

const PRESETS = [
  "Damaged",
  "Wrong product",
  "Missing item",
  "Quality issue",
] as const;

export function ReasonSelect({
  defaultValue,
  label = "Reason (optional)",
}: {
  defaultValue?: string | null;
  label?: string;
}) {
  const initialIsPreset = defaultValue && (PRESETS as readonly string[]).includes(defaultValue);
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
      <input type="hidden" name="reason" value={effectiveValue} />
      <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
        {label}
      </label>
      <Select
        value={preset}
        onChange={(e) => setPreset(e.target.value)}
        aria-label={label}
      >
        <option value="">Select a reason</option>
        {PRESETS.map((item) => (
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
          onChange={(e) => setCustomText(e.target.value)}
          aria-label="Custom reason details"
          className="mt-1"
        />
      )}
    </div>
  );
}

