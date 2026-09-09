"use client";

import * as React from "react";

import {
  PresetDeck,
  type Preset,
  type PresetField,
} from "@/registry/ui/preset-deck";

/** What a Waylight composer lets you tune on Fernworks Model 3. */
const FIELDS: PresetField[] = [
  { id: "temperature", label: "Temperature", min: 0, max: 2, step: 0.1 },
  { id: "topP", label: "Top-p", min: 0, max: 1, step: 0.05 },
  {
    id: "maxLength",
    label: "Max length",
    min: 64,
    max: 2048,
    step: 64,
    format: (v) => `${v}`,
  },
];

const PRESETS: Preset[] = [
  {
    id: "precise",
    name: "Precise",
    values: { temperature: 0.2, topP: 0.8, maxLength: 512 },
  },
  {
    id: "balanced",
    name: "Balanced",
    values: { temperature: 0.7, topP: 0.95, maxLength: 1024 },
  },
  {
    id: "creative",
    name: "Creative",
    values: { temperature: 1.2, topP: 1, maxLength: 1536 },
  },
];

const fmt = (field: PresetField, value: number) =>
  field.format
    ? field.format(value)
    : value.toFixed((String(field.step).split(".")[1] ?? "").length);

export function PresetDeckDemo() {
  const [values, setValues] = React.useState<Record<string, number>>(
    PRESETS[1]?.values ?? {},
  );
  const [presets, setPresets] = React.useState<Preset[]>(PRESETS);
  const [lastSaved, setLastSaved] = React.useState<string | null>(null);

  const matching = presets.find((preset) =>
    FIELDS.every((field) => preset.values[field.id] === values[field.id]),
  );
  const readings = FIELDS.map((field) =>
    fmt(field, values[field.id] ?? field.min),
  ).join(" · ");

  const status = lastSaved
    ? `Saved ${lastSaved} · ${presets.length} presets`
    : matching
      ? `Preset ${matching.name} · ${presets.length} saved`
      : `Modified · ${readings}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <PresetDeck
        label="Fernworks Model 3 · sampling"
        fields={FIELDS}
        values={values}
        onValuesChange={(next) => {
          setValues(next);
          setLastSaved(null);
        }}
        presets={presets}
        onPresetsChange={(next) => {
          setPresets(next);
          setLastSaved(next[0]?.name ?? null);
        }}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status}
      </p>
    </div>
  );
}
