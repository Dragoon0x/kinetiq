"use client";

import * as React from "react";

import { FlipMosaic, type FlipMosaicSide } from "@/registry/ui/flip-mosaic";
import { cn } from "@/registry/lib/utils";

/** Fixed channel manifest — codes, readings, and link status never vary. */
const CHANNELS = [
  { code: "CH-01", reading: "-41.2", live: true },
  { code: "CH-02", reading: "-48.7", live: true },
  { code: "CH-03", reading: "-63.4", live: false },
  { code: "CH-04", reading: "-44.9", live: true },
  { code: "CH-05", reading: "-57.1", live: true },
  { code: "CH-06", reading: "-71.8", live: false },
  { code: "CH-07", reading: "-39.6", live: true },
  { code: "CH-08", reading: "-52.3", live: true },
  { code: "CH-09", reading: "-66.0", live: false },
  { code: "CH-10", reading: "-45.5", live: true },
  { code: "CH-11", reading: "-58.9", live: true },
  { code: "CH-12", reading: "-49.4", live: true },
] as const;

type Channel = (typeof CHANNELS)[number];

/** Both boards, built once: A carries the roster, B the readings. */
const TILES = CHANNELS.map((channel) => ({
  a: <RosterFace channel={channel} />,
  b: <ReadingFace channel={channel} />,
}));

export function FlipMosaicDemo() {
  // KQ-078 wakes on the roster; the chips mirror whichever board is up.
  const [boardSide, setBoardSide] = React.useState<FlipMosaicSide>("a");

  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      <p className="flex items-baseline justify-between text-label text-ink-3">
        <span>Signal Board</span>
        <span className="font-mono text-[10px] tracking-[0.14em] tabular-nums">
          KQ-078
        </span>
      </p>

      {/* Bezel — comfortable padding so edge plates can swing mid-flip unclipped. */}
      <div className="rounded-4 border border-hairline bg-surface-1 p-4 sm:p-5">
        <FlipMosaic
          tiles={TILES}
          columns={4}
          defaultSide="a"
          onSideChange={setBoardSide}
          aria-label="Signal board: side A lists the channel roster, side B lists the same channels as dBm readings"
        />

        {/* Side chips — a passive mirror of the board, not a second control. */}
        <div
          role="status"
          className="mt-4 flex items-center justify-center gap-2"
        >
          <SideChip active={boardSide === "a"}>A &middot; ROSTER</SideChip>
          <SideChip active={boardSide === "b"}>B &middot; READINGS</SideChip>
        </div>

        <p className="mt-4 border-t border-hairline pt-3 font-mono text-[10px] tracking-[0.15em] text-ink-3 uppercase">
          KQ-078 &middot; Flip Mosaic &middot; 12 plates &middot; P 800 &middot;
          &zeta; 0.83
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Press the board - twelve tiles carry the swap.
      </p>
    </div>
  );
}

/** Side A plate: link dot over the channel code. */
function RosterFace({ channel }: { channel: Channel }) {
  return (
    <span className="flex flex-col items-center gap-1">
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          channel.live ? "bg-signal" : "bg-ink-3/60",
        )}
      />
      <span className="font-mono text-[10px] tracking-[0.12em] text-ink-2 tabular-nums">
        {channel.code}
      </span>
    </span>
  );
}

/** Side B plate: the same channel read out in dBm — signal green when live. */
function ReadingFace({ channel }: { channel: Channel }) {
  return (
    <span className="flex flex-col items-center gap-0.5">
      <span
        className={cn(
          "font-mono text-[11px] font-medium tracking-[0.08em] tabular-nums",
          channel.live ? "text-signal" : "text-ink-3",
        )}
      >
        {channel.reading}
      </span>
      <span className="font-mono text-[8px] tracking-[0.2em] text-ink-3">
        DBM
      </span>
    </span>
  );
}

function SideChip({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] tabular-nums transition-colors",
        active
          ? "border-hairline-strong bg-cobalt-wash text-cobalt-bright"
          : "border-hairline text-ink-3",
      )}
    >
      {children}
    </span>
  );
}
