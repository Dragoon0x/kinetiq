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
import { djb2, mapRange, perspectives, seeded } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type CraneTile = {
  id: string;
  label: string;
  node?: React.ReactNode;
};

export type CraneScrollProps = {
  /** Plots staged on the ground plane; the first six are used. */
  tiles: CraneTile[];
  /** Scroll travel, in stage heights. @default 3 */
  journey?: number;
  /** Stage height in px. @default 280 */
  height?: number;
  /** Fires with crane progress 0..1, deduped to steps of 0.05. */
  onCrane?: (progress: number) => void;
  className?: string;
  "aria-label"?: string;
};

/** Reduced motion holds the visual crane at a fixed three-quarter pose. */
const REST_P = 0.5;
/** rotateX at P=0 — looking straight down onto the plane. */
const ROTATE_TOP = 74;
/** rotateX at P=1 — eye level, front-on. */
const ROTATE_FRONT = 6;
/** Ground plane travels up (px) as the crane descends, so the scene stays framed. */
const LIFT_Y = -46;
/** Ground plane pushes toward the viewer (px) as the crane closes in. */
const PUSH_Z = 40;

/* Pure crane curves, shared by the live transforms and the reduced-motion frame. */
const rotateAt = (p: number): number => mapRange(p, 0, 1, ROTATE_TOP, ROTATE_FRONT);
const liftAt = (p: number): number => mapRange(p, 0, 1, 0, LIFT_Y);
const pushAt = (p: number): number => mapRange(p, 0, 1, 0, PUSH_Z);
const stageLabelAt = (p: number): string =>
  p < 0.33 ? "TOP-DOWN" : p < 0.66 ? "THREE-QUARTER" : "FRONT";

/** Deterministic per-plot depth wobble — a tidy grid, gently seeded. */
const wobbleRand = seeded(djb2("kinetiq:crane-scroll:plots"));
const GRID_COLS = 3;
const PLOT_SPACING_X = 92;
const PLOT_SPACING_Y = 64;

type PlotSeat = {
  x: number;
  y: number;
  z: number;
};

const seatFor = (index: number): PlotSeat => {
  const col = index % GRID_COLS;
  const row = Math.floor(index / GRID_COLS);
  return {
    x: (col - (GRID_COLS - 1) / 2) * PLOT_SPACING_X,
    y: (row - 0.5) * PLOT_SPACING_Y,
    z: (wobbleRand() - 0.5) * 14,
  };
};

/**
 * The camera cranes down over a scene as you scroll: a ground plane holding a
 * grid of plots stands up from top-down toward eye level, 1:1 with scroll
 * through transforms only. The scroll stage mirrors DollyFrame's idiom — an
 * outer scroll region, a track `journey` stages tall, a `sticky` viewport —
 * but here the scroll progress scrubs a preserve-3d ground plane's rotateX
 * (74deg near top-down, 6deg near front) instead of a dolly push, with a
 * matching lift and push so the plots stay framed as the plane stands up.
 * Each plot sits at a seeded grid seat on the plane and counter-rotates its
 * label against the plane's tilt so text stays legible throughout the crane.
 * A mono HUD reads the coarse stage (TOP-DOWN / THREE-QUARTER / FRONT) and
 * `onCrane` streams progress deduped to twentieths. Reduced motion holds a
 * fixed three-quarter composition — the readout and onCrane still track
 * scroll, only the 3D animation stops.
 */
export function CraneScroll({
  tiles,
  journey = 3,
  height = 280,
  onCrane,
  className,
  "aria-label": ariaLabel = "Crane shot",
}: CraneScrollProps) {
  const motionSafe = useMotionSafe();
  const progress = useMotionValue(0);
  const [stage, setStage] = React.useState(stageLabelAt(0));
  const craneStepRef = React.useRef(0);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const plots = tiles.slice(0, 6);

  const writeProgress = (el: HTMLDivElement) => {
    const range = el.scrollHeight - el.clientHeight;
    progress.set(range <= 0 ? 0 : el.scrollTop / range);
  };

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    writeProgress(event.currentTarget);
  };

  // Adopt a browser-restored scrollTop into progress once on mount.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) writeProgress(el);
    // Mount-only adoption of whatever scrollTop the browser restored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useMotionValueEvent(progress, "change", (p) => {
    setStage(stageLabelAt(p));
    const step = Math.round(p * 20) / 20;
    if (step !== craneStepRef.current) {
      craneStepRef.current = step;
      onCrane?.(step);
    }
  });

  const planeRotate = useTransform(progress, rotateAt);
  const planeLift = useTransform(progress, liftAt);
  const planePush = useTransform(progress, pushAt);
  const labelCounter = useTransform(planeRotate, (r) => -r);

  return (
    <div
      ref={scrollRef}
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
      <p className="sr-only">
        A crane shot: scrolling lowers the camera from directly overhead down
        to eye level over a grid of site plots. The camera now reads {stage}.
      </p>

      {/* The track supplies the scroll travel; the stage stays pinned as it passes. */}
      <div aria-hidden style={{ height: height * journey }}>
        <div
          className="sticky top-0"
          style={{
            height,
            perspective: motionSafe ? perspectives.base : undefined,
          }}
        >
          <div className="absolute inset-0 grid place-items-center">
            {/* Ground plane — the only preserve-3d layer; no clip or filter on this chain. */}
            <motion.div
              style={
                motionSafe
                  ? {
                      rotateX: planeRotate,
                      y: planeLift,
                      z: planePush,
                      transformStyle: "preserve-3d",
                    }
                  : {
                      transform: `rotateX(${rotateAt(REST_P)}deg) translateY(${liftAt(REST_P)}px) translateZ(${pushAt(REST_P)}px)`,
                      transformStyle: "preserve-3d",
                    }
              }
              className="relative"
            >
              {plots.map((plot, i) => (
                <Plot
                  key={plot.id}
                  plot={plot}
                  seat={seatFor(i)}
                  index={i}
                  labelCounter={labelCounter}
                  motionSafe={motionSafe}
                />
              ))}
            </motion.div>
          </div>

          {/* HUD readout chip */}
          <span
            aria-hidden
            className="border-hairline bg-surface-2 text-ink-2 pointer-events-none absolute right-3 bottom-3 rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wide"
          >
            CRANE &middot; {stage}
          </span>
        </div>
      </div>
    </div>
  );
}

function Plot({
  plot,
  seat,
  index,
  labelCounter,
  motionSafe,
}: {
  plot: CraneTile;
  seat: PlotSeat;
  index: number;
  labelCounter: MotionValue<number>;
  motionSafe: boolean;
}) {
  return (
    <div
      className="absolute top-1/2 left-1/2"
      style={{
        transform: `translate3d(${seat.x}px, ${seat.y}px, ${seat.z}px) translate(-50%, -50%)`,
        transformStyle: "preserve-3d",
      }}
    >
      <div className="border-hairline bg-surface-2 flex w-20 flex-col items-center gap-1 rounded-2 border px-2 py-2 text-center">
        {/* Billboard: counter-rotate the label against the plane's tilt (live
            scrub via motion value, or a static offset at the RM rest pose). */}
        <motion.span
          style={
            motionSafe
              ? { rotateX: labelCounter, display: "block" }
              : { transform: `rotateX(${-rotateAt(REST_P)}deg)`, display: "block" }
          }
          className="text-ink-3 font-mono text-[9px] tracking-wide"
        >
          {plot.label}
        </motion.span>
        {plot.node ? (
          <motion.div
            style={
              motionSafe
                ? { rotateX: labelCounter, display: "block" }
                : { transform: `rotateX(${-rotateAt(REST_P)}deg)`, display: "block" }
            }
          >
            {plot.node}
          </motion.div>
        ) : (
          <span
            aria-hidden
            className="bg-cobalt-bright/50 h-1 w-6 rounded-full"
          />
        )}
      </div>
      <span className="sr-only">
        {String(index + 1).padStart(2, "0")} {plot.label}
      </span>
    </div>
  );
}
