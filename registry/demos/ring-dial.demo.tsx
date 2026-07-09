"use client";

import * as React from "react";

import { motion } from "motion/react";

import { RingDial } from "@/registry/ui/ring-dial";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** The five aperture stops KQ-111 ships with, evenly spaced on the ring. */
const STOP_VALUES = [0, 25, 50, 75, 100] as const;
const F_STOPS = ["f/1.4", "f/2", "f/2.8", "f/4", "f/5.6"] as const;

/** Maps a dial value to its f-stop label — nearest stop, never off-grid. */
const fLabel = (value: number): string => {
  const index = Math.min(
    F_STOPS.length - 1,
    Math.max(0, Math.round(value / 25)),
  );
  return F_STOPS[index] ?? "f/2.8";
};

/** Relative light intake: wide open at f/1.4, nearly closed at f/5.6. */
const intakeOf = (value: number): number => 1 - (value / 100) * 0.88;

/**
 * RingDial dressed as a lens barrel: the KQ-111 aperture ring beside a
 * readout card that mirrors the committed stop, with a thin exposure bar
 * whose width follows the light the stop lets through. Each detent land
 * moves the card; the hub streams live between stops.
 */
export function RingDialDemo() {
  // KQ-111 boots at f/2.8; the card only moves when a stop lands.
  const [stop, setStop] = React.useState(50);

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <div className="relative rounded-4 border border-hairline bg-surface-1 p-4">
        {/* Corner registration ticks — the lab-instrument frame. */}
        {(
          [
            "left-2 top-2 border-l border-t",
            "right-2 top-2 border-r border-t",
            "bottom-2 left-2 border-b border-l",
            "bottom-2 right-2 border-b border-r",
          ] as const
        ).map((corner) => (
          <span
            key={corner}
            aria-hidden
            className={cn("border-hairline-strong absolute size-2.5", corner)}
          />
        ))}

        <div className="mb-4 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">
            Aperture Ring &middot; 5 Stops
          </span>
          <span className="text-label text-ink-3 tabular-nums">KQ-111</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-6">
          <RingDial
            detents={[...STOP_VALUES]}
            defaultValue={50}
            onValueChange={setStop}
            format={fLabel}
            aria-label="Aperture"
          />

          {/* Committed readout — the card lands with the detents. */}
          <dl className="flex w-44 flex-col gap-3 rounded-3 border border-hairline bg-surface-0 p-4">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-label text-ink-3">Stop</dt>
              <dd
                role="status"
                className="font-mono text-sm text-signal tabular-nums"
              >
                {fLabel(stop)}
              </dd>
            </div>
            <div className="flex flex-col gap-2 border-t border-hairline pt-3">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-label text-ink-3">Light</dt>
                <dd className="font-mono text-xs text-ink-2 tabular-nums">
                  {String(Math.round(intakeOf(stop) * 100)).padStart(3, "0")}
                </dd>
              </div>
              {/* Exposure bar: width follows the committed stop. */}
              <dd
                aria-hidden
                className="h-1 w-full overflow-hidden rounded-full bg-surface-2"
              >
                <motion.span
                  className="block h-full w-full origin-left rounded-full bg-signal"
                  initial={false}
                  animate={{ scaleX: intakeOf(stop) }}
                  transition={springs.snap}
                />
              </dd>
            </div>
          </dl>
        </div>

        <p className="mt-5 border-t border-hairline pt-3 font-mono text-[10px] tracking-[0.15em] text-ink-3 uppercase">
          KQ-111 &middot; Ring Dial &middot; Sweep 300&deg; &middot; P 800
          &middot; &zeta; 0.83
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Turn the ring - each stop pulls it in like a magnet.
      </p>
    </div>
  );
}
