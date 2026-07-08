"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { Wavefield, type WavefieldVariant } from "@/registry/ui/wavefield";

const VARIANTS: readonly WavefieldVariant[] = [
  "interference",
  "contour",
  "lattice",
  "drift",
];

export function WavefieldDemo() {
  const [variant, setVariant] =
    React.useState<WavefieldVariant>("interference");

  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
      <Wavefield
        variant={variant}
        className="h-[400px] w-full overflow-hidden rounded-4 border border-border bg-card"
      >
        <div className="flex h-full flex-col justify-end gap-4 p-6">
          <div>
            <p className="font-mono text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
              Field · Ambient
            </p>
            <h2 className="mt-2 max-w-[20ch] text-2xl leading-tight font-semibold tracking-tight">
              Instruments hum quietly.
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {VARIANTS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={option === variant}
                onClick={() => setVariant(option)}
                className={cn(
                  "rounded-1 border px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors",
                  option === variant
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {option}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Speed 0.5 — the field drifts at ambient tempo and never asks for
            attention.
          </p>
        </div>
      </Wavefield>
      <p className="text-center font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
        Canvas 2D · Pauses offscreen
      </p>
    </div>
  );
}
