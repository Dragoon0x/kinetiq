"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { PrismFlip } from "@/registry/ui/prism-flip";

/** Fixed bench readings — keyed by face, never random. */
const FACES = [
  { meta: "01 / 03", label: "Status" },
  { meta: "02 / 03", label: "Load" },
  { meta: "03 / 03", label: "Uptime" },
] as const;

/** One deterministic load figure everywhere it appears. */
const LOAD_PCT = 62;

/**
 * PrismFlip dressed as a bench telemetry readout: a bezel plate with corner
 * ticks and the KQ-072 serial, three readings riding one triangular prism —
 * status, load, uptime — with a status line naming the facing panel.
 */
export function PrismFlipDemo() {
  const [facing, setFacing] = React.useState(0);
  const current = FACES[facing] ?? FACES[0];

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <div className="border-hairline bg-surface-0 relative rounded-4 border p-4">
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

        <div className="mb-3 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">TELEMETRY · 3 FACES</span>
          <span className="text-label text-ink-3 tabular-nums">KQ-072</span>
        </div>

        <PrismFlip
          aria-label="Telemetry readout prism"
          panels={[
            <TelemetryFace key="status" name="STATUS" meta={FACES[0].meta}>
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="size-2.5 rounded-full"
                  style={{
                    background: "var(--accent-bright)",
                    boxShadow: "0 0 0 4px var(--accent-wash)",
                  }}
                />
                <span className="text-sm font-medium">NOMINAL</span>
              </div>
            </TelemetryFace>,
            <TelemetryFace key="load" name="LOAD" meta={FACES[1].meta}>
              <div className="flex flex-col gap-2">
                <span className="font-mono text-xl leading-none tabular-nums">
                  {LOAD_PCT}%
                </span>
                <div className="bg-surface-1 h-1 w-full overflow-hidden rounded-full">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${LOAD_PCT}%`,
                      background: "var(--accent)",
                    }}
                  />
                </div>
              </div>
            </TelemetryFace>,
            <TelemetryFace key="uptime" name="UPTIME" meta={FACES[2].meta}>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-xl leading-none tabular-nums">
                  312:07:44
                </span>
                <span className="text-label text-ink-3">H:M:S</span>
              </div>
            </TelemetryFace>,
          ]}
          labels={FACES.map((face) => face.label)}
          defaultIndex={0}
          onIndexChange={setFacing}
        />
      </div>

      <p
        role="status"
        className="text-ink-2 text-center font-mono text-[10px] tracking-[0.08em] uppercase tabular-nums"
      >
        FACING &middot; {current.label}
      </p>
      <p className="text-ink-3 text-center text-xs">
        Click or drag vertically - three readings on one prism.
      </p>
    </div>
  );
}

/** One face plate: serial row up top, the reading seated at the base. */
function TelemetryFace({
  name,
  meta,
  children,
}: {
  name: string;
  meta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full w-full flex-col justify-between p-4">
      <div className="flex items-center justify-between">
        <span className="text-label text-ink-3">{name}</span>
        <span className="text-ink-3 font-mono text-[10px] tracking-[0.14em] tabular-nums">
          KQ-072 · {meta}
        </span>
      </div>
      {children}
    </div>
  );
}
