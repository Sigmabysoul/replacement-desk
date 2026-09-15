import { Archive, Ruler, Save } from "lucide-react";
import { archiveDimensionPresetAction, saveDimensionPresetAction } from "@/app/actions";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { DimensionPreset } from "@/lib/types";

export default async function DimensionsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  await requireProfile(["CUSTOMER_SUPPORT", "ADMIN"]);
  const [notice, supabase] = await Promise.all([searchParams, createClient()]);
  const { data, error } = await supabase.from("dimension_presets").select("*").order("active", { ascending: false }).order("name");
  const presets = (data ?? []) as DimensionPreset[];
  return (
    <div className="grid gap-6">
      <header>
        <p className="text-sm font-bold text-indigo-700">CATALOGUE</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">Product dimensions</h1>
        <p className="mt-1 text-sm text-muted-foreground">Esha / Customer Support and Admin can register reusable package sizes in centimetres.</p>
      </header>
      <Notice>{notice.error ?? (error ? "Could not load dimension presets." : undefined)}</Notice>
      <Notice tone="success">{notice.success}</Notice>
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2"><Ruler className="size-5 text-indigo-600" /><h2 className="font-black text-foreground">New preset</h2></div>
        <form action={saveDimensionPresetAction} className="grid gap-4 sm:grid-cols-4">
          <Field label="Preset name"><Input name="name" required maxLength={100} placeholder="Medium box" /></Field>
          <Field label="Length (cm)"><Input name="length_cm" type="number" inputMode="decimal" min="0.01" max="10000" step="0.01" required /></Field>
          <Field label="Breadth (cm)"><Input name="breadth_cm" type="number" inputMode="decimal" min="0.01" max="10000" step="0.01" required /></Field>
          <Field label="Height (cm)"><Input name="height_cm" type="number" inputMode="decimal" min="0.01" max="10000" step="0.01" required /></Field>
          <SubmitButton className="sm:col-span-4" pendingText="Saving…"><Save className="size-4" /> SAVE PRESET</SubmitButton>
        </form>
      </Card>
      <section className="grid gap-3">
        {presets.map((preset) => (
          <Card key={preset.id} className={`p-4 ${preset.active ? "" : "opacity-60"}`}>
            <form action={saveDimensionPresetAction} className="grid items-end gap-3 sm:grid-cols-[1fr_repeat(3,130px)_auto]">
              <input type="hidden" name="id" value={preset.id} />
              <Field label="Name"><Input name="name" defaultValue={preset.name} required maxLength={100} disabled={!preset.active} /></Field>
              <Field label="Length"><Input name="length_cm" type="number" step="0.01" min="0.01" defaultValue={preset.length_cm} required disabled={!preset.active} /></Field>
              <Field label="Breadth"><Input name="breadth_cm" type="number" step="0.01" min="0.01" defaultValue={preset.breadth_cm} required disabled={!preset.active} /></Field>
              <Field label="Height"><Input name="height_cm" type="number" step="0.01" min="0.01" defaultValue={preset.height_cm} required disabled={!preset.active} /></Field>
              {preset.active ? <SubmitButton pendingText="Saving…">SAVE</SubmitButton> : <span className="pb-3 text-center text-xs font-bold text-muted-foreground">ARCHIVED</span>}
            </form>
            {preset.active ? (
              <form action={archiveDimensionPresetAction} className="mt-3 flex justify-end border-t border-border pt-3">
                <input type="hidden" name="id" value={preset.id} />
                <button className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-bold text-rose-700 hover:bg-rose-50"><Archive className="size-4" /> Archive</button>
              </form>
            ) : null}
          </Card>
        ))}
      </section>
    </div>
  );
}
