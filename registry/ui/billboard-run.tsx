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
import { clamp, mapRange, perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type Billboard = {
  /** Stable id — keys the board across renders. */
  id: string;
  /** The board's headline. */
  headline: string;
  /** Optional one-line deck under the headline. */
  deck?: string;
};

export type BillboardRunProps = {
  /** The billboards, in roadside order. 3–6. */
  boards: Billboard[];
  /** Scroll-stage height in px. @default 280 */
  height?: number;
  /** Fires as each board sweeps past the camera. */
  onPass?: (index: number) => void;
  className?: string;
  /** Label for the focusable scroll region. @default "Billboard run" */
  "aria-label"?: string;
};

/** Scroll track allotted per board interval, px — sets the scrub gearing. */
const BOARD_STEP = 150;
/** Road vanishing point, as fractions of the stage. */
const VP = { x: 0.46, y: 0.3 } as const;
/** Where a board meets the camera: right of frame, lower third. */
const NEAR = { x: 0.74, y: 0.62 } as const;
/** Signed road distance at which a board is still parked at the VP. */
const PARKED = 2.5;
/** Signed road distance at which a passing board has fully swept off. */
const PASS_END = -0.7;
/** Roadside stand, deg — every board banks toward the driver. */
const BANK_DEG = -26;
/** Center-line dashes in flight at once. */
const TICK_COUNT = 3;

/**
 * Headlines on angled roadside billboards — scroll is the drive past them.
 * Inside an internal scroll region a sticky stage draws an aria-hidden road:
 * two hairlines converging from the bottom corners on a vanishing point, with
 * three faint center-line dashes that stretch toward the viewer as the run
 * advances. Every board stands on the road's right side, banked toward the
 * driver at −26° behind a `perspective(perspectives.far)` prefix, and board
 * k's whole journey derives from its signed road distance d = k − P·(N−1):
 * parked at the vanishing point as a dim speck, swelling along the road ray
 * into the lower right, then sweeping off the right edge past the camera.
 * Everything is a useTransform off scroll progress — scrubbed 1:1, springless,
 * reversible. `onPass` fires once per board as it crosses the camera plane,
 * deduped per index and re-armed by scrolling back. Screen readers get the
 * run whole as an sr-only ordered list (the staging is decorative), the
 * region is focusable and natively key-scrollable, and a mono MILE k/N
 * readout stamps the frame. Reduced motion: the road collapses to a flat
 * stacked list — scroll still drives it, and the board nearest center
 * carries the accent hairline.
 */
export function BillboardRun({
  boards,
  height = 280,
  onPass,
  className,
  "aria-label": ariaLabel = "Billboard run",
}: BillboardRunProps) {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);

  // Scroll progress 0..1 plus measured stage size, all as motion values —
  // every board and dash transform derives from these, so a resize re-flows
  // the road without any state write.
  const progress = useMotionValue(0);
  const stageW = useMotionValue(0);
  const stageH = useMotionValue(0);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const activeRef = React.useRef(0);
  const passedRef = React.useRef(0);

  const list = boards.slice(0, 6);
  const count = list.length;
  const span = Math.max(count - 1, 1);
  const trackHeight = height + span * BOARD_STEP;

  // The stage stays hidden until its first measure so boards never flash
  // unpositioned at (0,0) on the frame before ResizeObserver runs.
  const stageReady = useTransform(stageW, (w) => (w > 0 ? 1 : 0));

  // Measure the sticky stage; re-measure on any size change. Sizes land in
  // motion values (not state), and progress is refreshed so every derived
  // transform recomputes against the new geometry.
  React.useEffect(() => {
    const container = containerRef.current;
    const stage = stageRef.current;
    if (!container || !stage || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      stageW.set(stage.clientWidth);
      stageH.set(stage.clientHeight);
      const max = container.scrollHeight - container.clientHeight;
      progress.set(max > 0 ? container.scrollTop / max : 0);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    measure();
    return () => observer.disconnect();
  }, [motionSafe, count, progress, stageW, stageH]);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const max = el.scrollHeight - el.clientHeight;
    progress.set(max > 0 ? el.scrollTop / max : 0);
  };

  // The mile is the board nearest the camera (nearest center in the reduced
  // list); a pass is a board's d crossing below 0. Both dedupe through refs
  // so state and the callback fire only on an actual crossing — scrolling
  // back re-arms a board, so driving past it again reports again.
  useMotionValueEvent(progress, "change", (p) => {
    const travel = clamp(p, 0, 1) * span;
    const active = clamp(Math.round(travel), 0, span);
    if (active !== activeRef.current) {
      activeRef.current = active;
      setActiveIndex(active);
    }
    const passed = clamp(Math.ceil(travel - 1e-4), 0, count);
    if (passed > passedRef.current) {
      for (let k = passedRef.current; k < passed; k += 1) onPass?.(k);
    }
    passedRef.current = passed;
  });

  return (
    <div className={cn("relative", className)}>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        tabIndex={0}
        role="region"
        aria-label={ariaLabel}
        style={{ height }}
        className="border-hairline bg-surface-0 focus-visible:ring-cobalt-bright/40 overflow-y-auto rounded-3 border outline-none focus-visible:ring-2"
      >
        {/* AT reads the run whole; the road staging below is decorative. */}
        <ol className="sr-only">
          {list.map((board) => (
            <li key={board.id}>
              {board.headline}
              {board.deck ? ` — ${board.deck}` : null}
            </li>
          ))}
        </ol>

        <div
          aria-hidden
          style={motionSafe ? { height: trackHeight } : { minHeight: trackHeight }}
          className="pointer-events-none select-none"
        >
          {motionSafe ? (
            <motion.div
              ref={stageRef}
              className="sticky top-0 overflow-hidden"
              style={{ height, opacity: stageReady }}
            >
              {/* The road — two edges converging on the vanishing point. */}
              <svg
                className="absolute inset-0 size-full"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <line
                  x1={0}
                  y1={100}
                  x2={VP.x * 100}
                  y2={VP.y * 100}
                  stroke="var(--hairline-strong)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={100}
                  y1={100}
                  x2={VP.x * 100}
                  y2={VP.y * 100}
                  stroke="var(--hairline-strong)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {/* Center-line dashes — recycle down the road as P advances. */}
              {Array.from({ length: TICK_COUNT }, (_, i) => (
                <CenterTick
                  key={i}
                  progress={progress}
                  span={span}
                  phase={i / TICK_COUNT}
                />
              ))}
              {list.map((board, i) => (
                <BoardPlate
                  key={board.id}
                  board={board}
                  index={i}
                  count={count}
                  progress={progress}
                  stageW={stageW}
                  stageH={stageH}
                />
              ))}
            </motion.div>
          ) : (
            /* Reduced motion: no road, no perspective — a flat stacked list;
               scroll still drives it and the nearest board takes the accent. */
            <div className="flex flex-col gap-3 p-4">
              {list.map((board, i) => (
                <div
                  key={board.id}
                  className={cn(
                    "rounded-3 border bg-surface-2 p-4",
                    i === activeIndex ? "border-cobalt" : "border-hairline",
                  )}
                >
                  <PlateFace board={board} index={i} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mono readout — the mile marker of the board nearest the camera. */}
      <p className="text-label text-ink-3 pointer-events-none absolute bottom-2 left-3 tabular-nums">
        MILE {count === 0 ? 0 : activeIndex + 1}/{count}
      </p>
    </div>
  );
}

/**
 * One center-line dash. Its phase cycles once per board interval of scroll;
 * position runs the ray from the vanishing point to the bottom center on t²,
 * so a dash accelerates and stretches as it nears the viewer — the parallax
 * cue that sells forward travel. Fully derived from progress: reversible.
 */
function CenterTick({
  progress,
  span,
  phase,
}: {
  progress: MotionValue<number>;
  span: number;
  phase: number;
}) {
  const t = useTransform(progress, (p) => {
    const cycles = clamp(p, 0, 1) * span + phase;
    return cycles - Math.floor(cycles);
  });
  const left = useTransform(t, (v) => `${(VP.x + (0.5 - VP.x) * v * v) * 100}%`);
  const top = useTransform(t, (v) => `${(VP.y + (1 - VP.y) * v * v) * 100}%`);
  const tickHeight = useTransform(t, (v) => 5 + 22 * v * v);
  const opacity = useTransform(t, (v) => mapRange(v, 0.04, 0.4, 0, 0.5));

  return (
    <motion.span
      className="bg-ink-3 absolute w-0.5 -translate-x-1/2"
      style={{ left, top, height: tickHeight, opacity }}
    />
  );
}

type BoardPlateProps = {
  board: Billboard;
  index: number;
  count: number;
  progress: MotionValue<number>;
  stageW: MotionValue<number>;
  stageH: MotionValue<number>;
};

/**
 * One roadside board. Its signed road distance d = index − P·(N−1) picks the
 * leg of the journey: d ≥ 2.5 parked at the vanishing point (the approach
 * mappings clamp there — a 0.12-scale speck at 0.2 opacity), 2.5 > d > 0
 * lerping down the road ray toward the camera slot, 0 ≥ d > −0.7 sweeping
 * off the right edge swelling to ×1.25 as it fades, and beyond that hidden
 * but mounted. Anchored by its center: the outer point translates to the
 * road position and scales/banks about origin (0,0) while the inner block
 * pulls itself back by half — so the anchor never wanders as the board grows.
 */
function BoardPlate({
  board,
  index,
  count,
  progress,
  stageW,
  stageH,
}: BoardPlateProps) {
  const span = Math.max(count - 1, 1);
  const distance = (p: number) => index - clamp(p, 0, 1) * span;

  const x = useTransform([progress, stageW], ([p = 0, w = 0]: number[]) => {
    const d = distance(p);
    if (d <= 0) return (NEAR.x + mapRange(d, 0, PASS_END, 0, 0.55)) * w;
    return mapRange(d, PARKED, 0, VP.x, NEAR.x) * w;
  });
  const y = useTransform([progress, stageH], ([p = 0, h = 0]: number[]) => {
    const d = distance(p);
    if (d <= 0) return NEAR.y * h;
    return mapRange(d, PARKED, 0, VP.y, NEAR.y) * h;
  });
  const scale = useTransform(progress, (p) => {
    const d = distance(p);
    if (d <= 0) return mapRange(d, 0, PASS_END, 1.05, 1.25);
    return mapRange(d, PARKED, 0, 0.12, 1.05);
  });
  const opacity = useTransform(progress, (p) => {
    const d = distance(p);
    if (d <= 0) return mapRange(d, 0, PASS_END, 1, 0);
    return mapRange(d, PARKED, 0, 0.2, 1);
  });
  /** A swept board stays mounted but drops out of paint entirely. */
  const visibility = useTransform(progress, (p) =>
    distance(p) <= PASS_END ? "hidden" : "visible",
  );
  /** Nearer the camera stacks higher, so an approaching board always fronts. */
  const zIndex = useTransform(
    progress,
    (p) => 20 - Math.round(clamp(distance(p), -1, 5) * 3),
  );

  return (
    <motion.div
      className="absolute top-0 left-0"
      style={{
        x,
        y,
        scale,
        opacity,
        visibility,
        zIndex,
        rotateY: BANK_DEG,
        transformPerspective: perspectives.far,
        originX: 0,
        originY: 0,
        willChange: "transform",
      }}
    >
      <div className="w-44 -translate-x-1/2 -translate-y-1/2">
        <div className="border-hairline bg-surface-2 rounded-3 border p-4">
          <PlateFace board={board} index={index} />
        </div>
        {/* Post legs — the thin stands that plant the board on the shoulder. */}
        <div aria-hidden className="mx-7 flex h-5 justify-between">
          <span className="bg-hairline-strong w-1" />
          <span className="bg-hairline-strong w-1" />
        </div>
      </div>
    </motion.div>
  );
}

/** The board's face — mono index chip, headline, optional deck line. */
function PlateFace({ board, index }: { board: Billboard; index: number }) {
  return (
    <>
      <span className="border-hairline text-ink-3 inline-flex rounded-1 border px-1.5 font-mono text-[10px] leading-4 tracking-[0.08em] tabular-nums">
        {String(index + 1).padStart(2, "0")}
      </span>
      <p className="text-ink mt-2 text-lg leading-tight font-semibold">
        {board.headline}
      </p>
      {board.deck ? (
        <p className="text-ink-3 mt-1 text-xs">{board.deck}</p>
      ) : null}
    </>
  );
}
