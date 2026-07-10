"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { PeekPortal } from "@/registry/ui/peek-portal";

/** Fixed set pieces in the bay — dots and plates placed by hand, never random. */
const SET_PIECES = [
  { kind: "dot", left: "16%", top: "34%", size: 10, hue: 162 },
  { kind: "dot", left: "70%", top: "26%", size: 7, hue: 52 },
  { kind: "plate", left: "26%", top: "44%", width: 84, height: 34, hue: 258 },
  { kind: "plate", left: "58%", top: "52%", width: 64, height: 46, hue: 195 },
] as const;

/** Fixed readout values — the bay always reports the same shift. */
const READOUTS = [
  { label: "Pressure", value: "6.2 BAR" },
  { label: "Flow", value: "118 L/S" },
  { label: "Temp", value: "341 K" },
  { label: "Shaft", value: "1450 RPM" },
] as const;

/**
 * What the port sees: a machine-room vista built from three gradient bands
 * (haze, gantry line, floor glow) and four fixed set pieces, with the bay
 * placard riveted bottom-left. Spans only — this layer lives inside a button.
 */
function BayVista() {
  return (
    <span className="absolute inset-0 block bg-[oklch(0.21_0.03_240)]">
      {/* Band 1 — overhead haze. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 block h-2/5"
        style={{
          background:
            "linear-gradient(180deg, oklch(0.34 0.05 195 / 0.9), transparent)",
        }}
      />
      {/* Band 2 — the gantry line across the mid-field. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-[38%] block h-[14%]"
        style={{
          background:
            "linear-gradient(90deg, oklch(0.30 0.04 258), oklch(0.16 0.02 258) 55%, oklch(0.27 0.04 240))",
        }}
      />
      {/* Band 3 — floor glow off the condensate channel. */}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 block h-1/3"
        style={{
          background:
            "linear-gradient(0deg, oklch(0.13 0.02 258), transparent)",
        }}
      />

      {/* Indicator lamps and equipment plates at fixed stations. */}
      {SET_PIECES.map((piece) =>
        piece.kind === "dot" ? (
          <span
            key={`${piece.left}-${piece.top}`}
            aria-hidden
            className="absolute block rounded-full"
            style={{
              left: piece.left,
              top: piece.top,
              width: piece.size,
              height: piece.size,
              background: `oklch(0.82 0.15 ${piece.hue})`,
              boxShadow: `0 0 12px 2px oklch(0.82 0.15 ${piece.hue} / 0.5)`,
            }}
          />
        ) : (
          <span
            key={`${piece.left}-${piece.top}`}
            aria-hidden
            className="absolute block rounded-1 border border-white/10"
            style={{
              left: piece.left,
              top: piece.top,
              width: piece.width,
              height: piece.height,
              background: `linear-gradient(160deg, oklch(0.36 0.04 ${piece.hue}), oklch(0.24 0.03 ${piece.hue}))`,
            }}
          />
        ),
      )}

      {/* The bay placard — mono, riveted to the near rail. */}
      <span className="absolute bottom-3 left-3 block rounded-1 border border-white/15 bg-[oklch(0.15_0.02_258/0.8)] px-2 py-1 font-mono text-[10px] tracking-[0.15em] text-[oklch(0.88_0.02_195)] uppercase">
        Bay 7
      </span>
    </span>
  );
}

/** The full bay: header row, 2×2 mono readout grid, one field note. */
function BayBoard() {
  return (
    <div className="flex h-full flex-col justify-end gap-3 rounded-4 border border-hairline bg-surface-1 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-label text-ink">Bay 7 &middot; Turbine Hall</span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="block size-1.5 rounded-full bg-signal"
          />
          <span className="text-label text-ink-3">Live</span>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {READOUTS.map((readout) => (
          <div
            key={readout.label}
            className="rounded-2 border border-hairline bg-surface-0 px-2.5 py-2"
          >
            <p className="text-[9px] font-medium tracking-[0.12em] text-ink-3 uppercase">
              {readout.label}
            </p>
            <p className="mt-0.5 font-mono text-sm text-ink tabular-nums">
              {readout.value}
            </p>
          </div>
        ))}
      </div>

      <p className="border-t border-hairline pt-2 text-[11px] leading-snug text-ink-3">
        Condensate loop nominal. Next service window at shift change.
      </p>
    </div>
  );
}

/**
 * PeekPortal dressed as an observation port: the KQ-062 aperture on a bezel
 * plate with corner ticks. Lean around the framed vista of Bay 7, click to
 * step through to the full bay board; the status line mirrors each step.
 */
export function PeekPortalDemo() {
  // KQ-062 boots framed; the readout flips only when a step lands.
  const [through, setThrough] = React.useState(false);

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <div className="relative rounded-4 border border-hairline bg-surface-0 p-4">
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
            className={cn("absolute size-2.5 border-hairline-strong", corner)}
          />
        ))}

        <div className="mb-4 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">Observation Port</span>
          <span className="text-label text-ink-3 tabular-nums">KQ-062</span>
        </div>

        <PeekPortal
          scene={<BayVista />}
          beyond={<BayBoard />}
          sceneLabel="Peer through the observation port into Bay 7"
          backLabel="Step back"
          height={260}
          onStep={setThrough}
        />

        {/* Step readout — mirrors the port, one move per step. */}
        <p role="status" className="mt-4 text-center text-label text-ink-3">
          Viewing &middot;{" "}
          <span className="text-signal">{through ? "Bay 7" : "Port"}</span>
        </p>

        <p className="mt-4 border-t border-hairline pt-3 font-mono text-[10px] tracking-[0.15em] text-ink-3 uppercase">
          KQ-062 &middot; Peek Portal &middot; Depth 14 &middot; P 800 &middot;
          &zeta; 0.98
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Lean around the port, then click to step through.
      </p>
    </div>
  );
}
