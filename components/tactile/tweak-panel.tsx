"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import type { TweakSchema } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";

import { ScrubBar, Segmented } from "./tweak-controls";

export type TweakState = Record<string, boolean | number | string>;

const title = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The live parameters of one component, generated from its schema: range
 * tweaks as scrub bars, toggles and choices as segmented groups. `values`
 * holds every key (defaults filled in); Reset is offered only once something
 * differs from its default.
 */
export function TweakPanel({
  schema,
  values,
  onChange,
  onReset,
  grid = false,
  className,
}: {
  schema: TweakSchema;
  values: TweakState;
  onChange: (key: string, value: boolean | number | string) => void;
  onReset: () => void;
  /** Lay the controls out in two columns where there is room. */
  grid?: boolean;
  className?: string;
}) {
  const headingId = React.useId();
  const entries = Object.entries(schema);
  const changed = entries.some(
    ([key, spec]) => values[key] !== undefined && values[key] !== spec.default,
  );

  if (entries.length === 0) return null;

  return (
    <section
      aria-labelledby={headingId}
      className={cn("flex flex-col gap-1.5", className)}
    >
      <div className="flex h-7 items-center justify-between">
        <h3 id={headingId} className="text-label text-ink-3">
          Tweaks
        </h3>
        <button
          type="button"
          onClick={onReset}
          disabled={!changed}
          className="inline-flex h-7 items-center gap-1.5 rounded-2 px-2 text-xs text-ink-2 transition-colors outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40"
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <div
        className={cn(
          "flex flex-col gap-1.5",
          grid && "md:grid md:grid-cols-2 md:gap-x-6",
        )}
      >
        {entries.map(([key, spec]) => {
          if (spec.kind === "range") {
            return (
              <ScrubBar
                key={key}
                label={spec.label}
                spec={spec}
                value={Number(values[key] ?? spec.default)}
                onChange={(next) => onChange(key, next)}
              />
            );
          }
          if (spec.kind === "toggle") {
            return (
              <Segmented
                key={key}
                label={spec.label}
                options={[
                  { value: "off", label: "Off" },
                  { value: "on", label: "On" },
                ]}
                value={(values[key] ?? spec.default) ? "on" : "off"}
                onChange={(next) => onChange(key, next === "on")}
              />
            );
          }
          return (
            <Segmented
              key={key}
              label={spec.label}
              options={spec.options.map((option) => ({
                value: option,
                label: spec.names?.[option] ?? title(option),
              }))}
              value={String(values[key] ?? spec.default)}
              onChange={(next) => onChange(key, next)}
            />
          );
        })}
      </div>
    </section>
  );
}
