"use client";

import * as React from "react";

import { FluxCanvas, type FluxVariant } from "@/registry/ui/flux-canvas";

const VARIANTS: FluxVariant[] = ["mesh", "warp"];

export function FluxCanvasDemo() {
  const [variant, setVariant] = React.useState<FluxVariant>("mesh");

  return (
    <div className="w-full max-w-md">
      <FluxCanvas variant={variant} className="rounded-4 h-64">
        <div className="flex h-full flex-col justify-between p-6">
          <p className="font-mono text-[10px] tracking-[0.08em] text-white/80 uppercase">
            FLUX · WEBGL
          </p>
          <div>
            <h3 className="text-2xl font-semibold text-white">
              A gradient with a pulse.
            </h3>
            <p className="mt-1 text-sm text-white/70">
              Tinted from your theme tokens.
            </p>
          </div>
        </div>
      </FluxCanvas>

      <div role="group" aria-label="Field variant" className="mt-3 flex gap-1.5">
        {VARIANTS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setVariant(option)}
            aria-pressed={option === variant}
            className={
              option === variant
                ? "border-primary bg-primary/10 text-foreground rounded-2 border px-3 py-1 font-mono text-xs"
                : "border-input text-muted-foreground hover:text-foreground rounded-2 border px-3 py-1 font-mono text-xs transition-colors"
            }
          >
            {option}
          </button>
        ))}
      </div>
      <p className="text-muted-foreground mt-2 font-mono text-[10px] tracking-wide uppercase">
        WEBGL2 · STATIC FALLBACK · PAUSES OFFSCREEN
      </p>
    </div>
  );
}
