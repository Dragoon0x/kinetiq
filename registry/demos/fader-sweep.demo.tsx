"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { FaderSweep, faderSweepBands } from "@/registry/ui/fader-sweep";

export const tweaks = defineTweaks({
  bands: {
    kind: "range",
    label: "Bands",
    default: 7,
    min: 5,
    max: 10,
    step: 1,
  },
  smoothing: {
    kind: "range",
    label: "Smoothing",
    default: 0.35,
    min: 0,
    max: 1,
    step: 0.05,
  },
  curve: { kind: "toggle", label: "Curve", default: true },
  range: {
    kind: "range",
    label: "Range",
    default: 12,
    min: 6,
    max: 24,
    step: 6,
    unit: "dB",
  },
});

/** A voice preset: a little less mud, a little more presence. */
const VOICE = [-3, -1.5, 0, 1.5, 4.5, 2, -1];

/** The same shape at another band count, by relative position. */
function fit(values: readonly number[], n: number): number[] {
  if (values.length === n) return values.slice();
  const last = values.length - 1;
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0 : (i / (n - 1)) * last;
    const a = Math.floor(t);
    const va = values[a] ?? 0;
    const vb = values[Math.min(last, a + 1)] ?? va;
    return Math.round((va + (vb - va) * (t - a)) * 2) / 2;
  });
}

const signed = (v: number) => `${v > 0 ? "+" : "−"}${Math.abs(v)} dB`;

/**
 * The voice EQ on the evening show's microphone in Fieldline Studio. Draw
 * across the bands to shape it, grab a knob to trim one, or tab in and use
 * the arrows.
 */
export function FaderSweepDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const count = values.bands ?? tweaks.bands.default;
  const span = values.range ?? tweaks.range.default;
  const [eq, setEq] = React.useState<number[]>(VOICE);
  const shown = fit(eq, count).map((v) => Math.max(-span, Math.min(span, v)));
  const names = faderSweepBands(count);

  let peak = -1;
  let dip = -1;
  shown.forEach((v, i) => {
    if (v > 0 && (peak < 0 || v > (shown[peak] ?? 0))) peak = i;
    if (v < 0 && (dip < 0 || v < (shown[dip] ?? 0))) dip = i;
  });
  const flat = peak < 0 && dip < 0;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-card px-3 pt-3 pb-2">
        <div className="flex items-center justify-between gap-3 px-1">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Voice EQ</p>
            <p className="truncate text-xs text-ink-3">
              Fieldline Studio · mic 1
            </p>
          </div>
          {chrome ? (
            <button
              type="button"
              onClick={() => setEq(Array.from({ length: count }, () => 0))}
              disabled={flat}
              className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            >
              Flat
            </button>
          ) : null}
        </div>
        <FaderSweep
          label="Voice EQ"
          value={shown}
          onValueChange={setEq}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {flat ? (
            <>
              <span className="text-signal">flat</span> · sweep across the bands
              to shape it
            </>
          ) : (
            <>
              <span className="text-signal">voice eq</span>
              {peak >= 0
                ? ` · ${names[peak]?.label ?? ""} ${signed(shown[peak] ?? 0)}`
                : ""}
              {dip >= 0
                ? ` · ${names[dip]?.label ?? ""} ${signed(shown[dip] ?? 0)}`
                : ""}
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
