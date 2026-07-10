"use client";

import * as React from "react";

import { TurnModel } from "@/registry/ui/turn-model";

/**
 * The specimen turntable: the default minted monument on a 200px stage,
 * framed by an instrument bezel stamped with its serial. The status line
 * mirrors `onAngleChange`, so it only speaks on settled detents.
 */
export function TurnModelDemo() {
  const [yaw, setYaw] = React.useState(30);

  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-4">
      {/* Bezel — the fascia carries the nameplate and the serial. */}
      <div className="w-full rounded-4 border border-hairline p-4">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <p className="text-label text-ink-3">SPECIMEN TURNTABLE</p>
          <span className="font-mono text-label text-ink-3 tabular-nums">
            KQ-130
          </span>
        </div>

        <div className="flex justify-center">
          <TurnModel
            size={200}
            onAngleChange={setYaw}
            aria-label="Specimen turntable"
          />
        </div>

        <p
          role="status"
          className="mt-4 border-t border-border pt-3 text-center text-label text-ink-3"
        >
          YAW &middot;{" "}
          <span className="font-mono text-ink-2 tabular-nums">
            {String(yaw).padStart(3, "0")}&deg;
          </span>
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Spin the platter - the wireframe is drawn live, not filmed.
      </p>
    </div>
  );
}
