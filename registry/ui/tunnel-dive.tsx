"use client";

import * as React from "react";

import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { clamp, djb2, mapRange } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type TunnelFrame = {
  /** Stable id — also seeds this frame's deterministic axis wobble. */
  id: string;
  /** Corner chip text, mono. */
  label: string;
  /** Optional content centered in the outline — keep it small; the camera flies through it. */
  node?: React.ReactNode;
};

export type TunnelDiveProps = {
  /** The gates of the tunnel, nearest first. 4–7 reads best. */
  frames: TunnelFrame[];
  /** Stage height in px. @default 280 */
  height?: number;
  /**
   * Fires as the camera blows past frame `index` (distance < −0.1) — deduped
   * ascending; scrolling back re-arms earlier frames so they can fire again.
   */
  onFramePass?: (index: number) => void;
  className?: string;
  "aria-label"?: string;
};

/** Hyperbolic approach rate — higher reads as a faster lens. */
const APPROACH_RATE = 0.9;
/** Below this distance the approach hyperbola hands off to the blow-past ramp. */
const CLAMP_D = -0.4;
/** By this distance a passed frame has fully died; visibility cuts beyond it. */
const GONE_D = -0.5;
/** Peak blow-past scale, reached the moment opacity hits zero. */
const BLOWN_SCALE = 2.6;
/** Frames farther than this are fully transparent. */
const FAR_D = 3;
/** A frame counts as passed once its distance drops below this. */
const PASS_D = -0.1;

/* Pure pose curves — shared by every gate's scrubbed transforms. */

/** Spec approach: 1 / (1 + max(d, −0.4) × 0.9) — the exponential-feeling swell. */
const approachScaleAt = (d: number): number =>
  1 / (1 + Math.max(d, CLAMP_D) * APPROACH_RATE);

/**
 * Full pose scale. Ahead of the clamp the hyperbola runs verbatim; past it
 * the blow-past ramp carries growth on to ~2.6× by the moment opacity dies.
 */
const scaleAt = (d: number): number =>
  d >= CLAMP_D
    ? approachScaleAt(d)
    : mapRange(d, CLAMP_D, GONE_D, approachScaleAt(CLAMP_D), BLOWN_SCALE);

const opacityAt = (d: number): number => {
  if (d > FAR_D) return 0;
  if (d >= 0) return mapRange(d, FAR_D, 0, 0.15, 1);
  return mapRange(d, 0, GONE_D, 1, 0);
};

const visibilityAt = (d: number): string => (d < GONE_D ? "hidden" : "visible");

/** The next-to-pass gate: within one gate of the camera and not yet passed. */
const isNextAt = (d: number): boolean => d >= PASS_D && d < 1 + PASS_D;

/** ±6px axis wobble hashed from the frame id — the tunnel meanders. */
const wobbleFor = (id: string): { x: number; y: number } => {
  const hash = djb2(id);
  return { x: (hash % 13) - 6, y: (Math.floor(hash / 13) % 13) - 6 };
};

/** Starburst brightness — crests between gates, ebbs as each one is met. */
const burstOpacityAt = (p: number, travel: number): number =>
  0.05 + 0.15 * Math.abs(Math.sin(p * travel * Math.PI));

/** Eight axis lines, 45° apart — center out to the corners and edges. */
const BURST_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315] as const;

/**
 * A z-tunnel fly-through. Scroll is the camera's travel: each frame hangs on
 * the tunnel axis at its own depth (distance d = k − P×(N−1)), swelling
 * hyperbolically as the camera closes in, then blowing past the lens — scale
 * surging toward 2.6× as opacity dies — while the next gate's outline warms
 * to accent. Every gate meanders off-axis by a deterministic ±6px wobble
 * hashed from its id, and a faint eight-line starburst pulses with progress
 * to sell the speed. 1:1 with scroll through transforms only. Under reduced
 * motion the tunnel flattens to a plain outlined list; native scroll still
 * drives the readout and onFramePass.
 */
export function TunnelDive({
  frames,
  height = 280,
  onFramePass,
  className,
  "aria-label": ariaLabel = "Tunnel dive",
}: TunnelDiveProps) {
  const motionSafe = useMotionSafe();
  const progress = useMotionValue(0);
  const [nearest, setNearest] = React.useState(0);
  const passedRef = React.useRef(0);

  const count = frames.length;
  const lastIndex = Math.max(count - 1, 0);
  const travel = Math.max(count - 1, 1);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const range = el.scrollHeight - el.clientHeight;
    progress.set(range <= 0 ? 0 : el.scrollTop / range);
  };

  useMotionValueEvent(progress, "change", (p) => {
    setNearest(clamp(Math.round(p * travel), 0, lastIndex));
    const passed = clamp(Math.ceil(p * travel + PASS_D), 0, lastIndex);
    if (passed > passedRef.current) {
      for (let i = passedRef.current; i < passed; i += 1) onFramePass?.(i);
      passedRef.current = passed;
    } else if (passed < passedRef.current) {
      passedRef.current = passed;
    }
  });

  const readout = (
    <span className="border-hairline bg-surface-2 text-ink-2 pointer-events-none rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wide tabular-nums">
      FRAME &middot; {Math.min(nearest, lastIndex) + 1}/{count}
    </span>
  );

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
      onScroll={handleScroll}
      style={{ height }}
      className={cn(
        "border-hairline bg-surface-1 focus-visible:ring-cobalt-bright/40 relative overflow-y-auto overscroll-contain rounded-4 border outline-none focus-visible:ring-2",
        className,
      )}
    >
      {motionSafe ? (
        <>
          <p className="sr-only">
            A tunnel dive of {count} frames. Scrolling flies the camera through
            each gate in turn. Nearest frame:{" "}
            {frames[nearest]?.label ?? "none"}.
          </p>
          <ol className="sr-only">
            {frames.map((frame) => (
              <li key={frame.id}>{frame.label}</li>
            ))}
          </ol>

          {/* The track supplies the travel; the stage pins while the tunnel streams past. */}
          <div aria-hidden style={{ height: height * Math.max(count, 1) }}>
            <div className="sticky top-0 overflow-hidden" style={{ height }}>
              <Starburst progress={progress} travel={travel} />
              {frames.map((frame, index) => (
                <TunnelGate
                  key={frame.id}
                  frame={frame}
                  index={index}
                  count={count}
                  progress={progress}
                />
              ))}
              <span className="absolute right-3 bottom-3 z-10">{readout}</span>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="sr-only">Tunnel frames, listed nearest first.</p>
          <ol className="flex flex-col gap-2 p-3">
            {frames.map((frame, index) => (
              <li
                key={frame.id}
                className="rounded-3 border px-3 py-2.5"
                style={{ borderColor: "var(--hairline-strong)" }}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ink-2 font-mono text-[10px] tracking-widest">
                    {frame.label}
                  </span>
                  <span className="text-ink-3 font-mono text-[10px] tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                {frame.node ? (
                  <div className="text-ink-2 mt-1.5">{frame.node}</div>
                ) : null}
              </li>
            ))}
          </ol>
          <div className="pointer-events-none sticky bottom-2 z-10 flex justify-end pr-2 pb-1">
            {readout}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * One gate of the tunnel. All pose transforms derive from the shared scroll
 * progress — distance in, scale/opacity/visibility/border warmth out.
 */
function TunnelGate({
  frame,
  index,
  count,
  progress,
}: {
  frame: TunnelFrame;
  index: number;
  count: number;
  progress: MotionValue<number>;
}) {
  const travel = Math.max(count - 1, 1);
  const wobble = wobbleFor(frame.id);

  const distance = useTransform(progress, (p) => index - p * travel);
  const scale = useTransform(distance, scaleAt);
  const opacity = useTransform(distance, opacityAt);
  const visibility = useTransform(distance, visibilityAt);
  const borderColor = useTransform(distance, (d) =>
    isNextAt(d) ? "var(--accent)" : "var(--hairline-strong)",
  );

  return (
    <motion.div
      className="absolute inset-0 m-auto h-[72%] w-[72%] rounded-3 border"
      style={{
        x: wobble.x,
        y: wobble.y,
        scale,
        opacity,
        visibility,
        borderColor,
        zIndex: count - index,
      }}
    >
      <span className="border-hairline bg-surface-2 text-ink-2 absolute top-1.5 left-1.5 rounded-full border px-1.5 py-px font-mono text-[9px] tracking-widest">
        {frame.label}
      </span>
      {frame.node ? (
        <div className="text-ink-2 grid h-full w-full place-items-center p-5 text-center">
          {frame.node}
        </div>
      ) : null}
    </motion.div>
  );
}

/** The speed starburst — eight hairlines from center, pulsing with progress. */
function Starburst({
  progress,
  travel,
}: {
  progress: MotionValue<number>;
  travel: number;
}) {
  const opacity = useTransform(progress, (p) => burstOpacityAt(p, travel));

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ opacity }}
    >
      {BURST_ANGLES.map((angle) => (
        <span
          key={angle}
          className="absolute top-1/2 left-1/2 h-[120%] w-px origin-top"
          style={{
            background: "var(--hairline-strong)",
            transform: `rotate(${angle}deg)`,
          }}
        />
      ))}
    </motion.div>
  );
}
