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
import {
  clamp,
  djb2,
  mapRange,
  perspectives,
  seeded,
} from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type TownBuilding = {
  /** Stable id — seeds the deterministic window lighting. */
  id: string;
  /** Announced to screen readers and stamped on the facade. */
  label: string;
  /** Facade width at rest, px. */
  width: number;
  /** Facade height at rest, px. */
  height: number;
  /** Plot position — the facade's left edge, % of the plan width. */
  x: number;
};

export type CutoutTownProps = {
  /** The cutout buildings, 3–6. Rise order runs left-to-right by `x`. */
  buildings: TownBuilding[];
  /** Scroll-stage height in px. @default 280 */
  stageHeight?: number;
  /** Fires with how many buildings stand fully (rise > 0.95), deduped. */
  onRaised?: (count: number) => void;
  className?: string;
  /** Label for the focusable scroll region. @default "Town plan" */
  "aria-label"?: string;
};

/** Extra scroll track beyond the stage, px — sets the scrub gearing. */
const TRAVEL = 320;
/** The horizon — the ground plane starts here, % from the stage top. */
const HORIZON = 50;
/** The street line buildings stand on, % from the stage top. */
const BASELINE = 72;
/** Ground plane tilt, deg — one flat perspective() transform, Safari-flat. */
const GROUND_TILT = 55;
/** A building starts lying flat on the plan, foreshortened. */
const REST_DEG = 86;
/** First rise band opens here. */
const RISE_START = 0.1;
/** Last rise band closes here — the whole town stands by P = 0.92. */
const RISE_END = 0.92;
/** Every building rises over this much progress. */
const BAND_SPAN = 0.45;
/** A building counts as standing past this share of its rise. */
const STAND_AT = 0.95;
/** How much progress before its band a plot spends waking. */
const WAKE = 0.12;
/** Plot outline height, px — a flat footprint straddling the street line. */
const PLOT_H = 12;
/** Plot opacity asleep, awake at band start, and settled under a building. */
const PLOT_REST = 0.35;
const PLOT_SETTLED = 0.25;
/** Base shadow strip at full rise. */
const SHADOW_MAX = 0.45;
/** Plan grid — converging verticals and receding steps, % in plane space. */
const V_LINES = [12.5, 25, 37.5, 50, 62.5, 75, 87.5] as const;
const H_LINES = [10, 26, 42, 58, 74, 90] as const;

/** Where building of `rank` (left-to-right) starts rising, 0..1. */
const bandStart = (rank: number, count: number): number =>
  RISE_START +
  (RISE_END - BAND_SPAN - RISE_START) * (rank / Math.max(count - 1, 1));

/**
 * A town plan whose flat cutout buildings stand up as you scroll. Inside an
 * internal scroll region a sticky stage holds the plan: a ground plane tilted
 * back GROUND_TILT° under its own perspective() prefix — one flat transform,
 * verticals converging to the horizon, steps compressing toward it — with a
 * dashed plot outline and mono plot tag waiting on the street line for every
 * building. Scroll progress P raises the town left-to-right: each facade
 * hinges at its base from 86° (lying flat on the plan, foreshortened) to 0°
 * over its own band of the travel, its plot waking just before the band and
 * settling once covered, its base shadow widening and darkening with the
 * rise. Facades are plain plates with deterministic window grids — rows and
 * cols derived from their size, a few cells lit by a djb2 seed of the id, so
 * every visit renders the same town. Everything is a useTransform off P:
 * scrubbed 1:1, springless, reversible, nothing free-running. `onRaised`
 * reports the standing count (rise > 0.95) deduped via useMotionValueEvent;
 * screen readers get the buildings as an sr-only list (the plan is
 * decorative), the region is focusable and natively key-scrollable, and a
 * mono RAISED · N/M readout stamps the corner. Reduced motion: the town
 * renders fully built and static, scroll does nothing visual, and the
 * readout pins to M/M.
 */
export function CutoutTown({
  buildings,
  stageHeight = 280,
  onRaised,
  className,
  "aria-label": ariaLabel = "Town plan",
}: CutoutTownProps) {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const progress = useMotionValue(0);
  const [raised, setRaised] = React.useState(0);
  const raisedRef = React.useRef(0);

  const list = buildings.slice(0, 6);

  // Rise order is spatial, not array order: leftmost plot stands first.
  const ranks: number[] = new Array<number>(list.length).fill(0);
  list
    .map((building, i) => ({ i, x: building.x }))
    .sort((a, b) => a.x - b.x)
    .forEach((entry, rank) => {
      ranks[entry.i] = rank;
    });

  // Progress thresholds past which each building counts as standing.
  const standAt = ranks.map(
    (rank) => bandStart(rank, list.length) + BAND_SPAN * STAND_AT,
  );

  // Re-sync progress if the browser restored a scroll position (or the
  // reduced-motion pathway flipped). Motion-value writes only — any change
  // notification lands through the subscription below.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    progress.set(max > 0 ? el.scrollTop / max : 0);
  }, [progress, motionSafe, stageHeight]);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const max = el.scrollHeight - el.clientHeight;
    progress.set(max > 0 ? el.scrollTop / max : 0);
  };

  // Standing count — state and the callback move only when the count does.
  useMotionValueEvent(progress, "change", (p) => {
    let count = 0;
    for (const threshold of standAt) if (p >= threshold) count += 1;
    if (count === raisedRef.current) return;
    raisedRef.current = count;
    setRaised(count);
    onRaised?.(count);
  });

  const shownRaised = motionSafe ? raised : list.length;

  return (
    <div className={cn("relative", className)}>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        tabIndex={0}
        role="region"
        aria-label={ariaLabel}
        style={{ height: stageHeight }}
        className="border-hairline bg-surface-0 focus-visible:ring-cobalt-bright/40 overflow-y-auto rounded-3 border outline-none focus-visible:ring-2"
      >
        {/* AT reads the buildings whole; the plan below is decorative. */}
        <ol className="sr-only">
          {list.map((building, i) => (
            <li key={building.id}>
              {building.label}, plot {String(i + 1).padStart(2, "0")}
            </li>
          ))}
        </ol>

        <div
          aria-hidden
          style={{ height: motionSafe ? stageHeight + TRAVEL : stageHeight }}
          className="pointer-events-none select-none"
        >
          <div
            className="sticky top-0 overflow-hidden"
            style={{ height: stageHeight }}
          >
            {/* The plan — a ground plane tilted back as ONE flat transform;
                perspective makes its verticals converge on the horizon. */}
            <div
              className="bg-surface-1 absolute inset-x-0 h-full"
              style={{
                top: `${HORIZON}%`,
                transform: `perspective(${perspectives.far}px) rotateX(${GROUND_TILT}deg)`,
                transformOrigin: "50% 0%",
              }}
            >
              {V_LINES.map((v) => (
                <span
                  key={v}
                  className="bg-hairline absolute inset-y-0 w-px"
                  style={{ left: `${v}%` }}
                />
              ))}
              {H_LINES.map((h) => (
                <span
                  key={h}
                  className="bg-hairline absolute inset-x-0 h-px"
                  style={{ top: `${h}%` }}
                />
              ))}
            </div>

            {/* The horizon. */}
            <span
              className="bg-hairline-strong absolute inset-x-0 h-px"
              style={{ top: `${HORIZON}%` }}
            />

            {list.map((building, i) => (
              <TownLot
                key={building.id}
                building={building}
                plotIndex={i}
                rank={ranks[i] ?? i}
                count={list.length}
                motionSafe={motionSafe}
                progress={progress}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Mono readout — the same standing count the callback reports. */}
      <p className="text-label text-ink-3 pointer-events-none absolute bottom-2 left-3 tabular-nums">
        RAISED &middot; {shownRaised}/{list.length}
      </p>
    </div>
  );
}

type TownLotProps = {
  building: TownBuilding;
  plotIndex: number;
  rank: number;
  count: number;
  motionSafe: boolean;
  progress: MotionValue<number>;
};

/**
 * One plot and its cutout. The dashed footprint waits on the street line and
 * wakes as its band approaches; the facade hinges up from 86° to standing
 * across the band — its own flat perspective() transform, origin at the
 * base — while the shadow strip under it widens and darkens with the rise.
 * The window grid is sized from the facade and lit by a djb2 seed of the id.
 */
function TownLot({
  building,
  plotIndex,
  rank,
  count,
  motionSafe,
  progress,
}: TownLotProps) {
  const start = bandStart(rank, count);

  const rise = useTransform(
    progress,
    (p) =>
      `perspective(${perspectives.far}px) rotateX(${mapRange(
        p,
        start,
        start + BAND_SPAN,
        REST_DEG,
        0,
      )}deg)`,
  );
  const plotOpacity = useTransform(progress, (p) =>
    p < start
      ? mapRange(p, start - WAKE, start, PLOT_REST, 1)
      : mapRange(p, start, start + BAND_SPAN, 1, PLOT_SETTLED),
  );
  const shadowOpacity = useTransform(progress, (p) =>
    mapRange(p, start, start + BAND_SPAN, 0, SHADOW_MAX),
  );
  const shadowScaleX = useTransform(progress, (p) =>
    mapRange(p, start, start + BAND_SPAN, 0.55, 1.05),
  );

  // Deterministic window grid — rows × cols from the facade size, a few
  // cells lit by the building id's djb2 seed. Never random, never varies.
  const cols = clamp(Math.floor((building.width - 14) / 13), 2, 6);
  const rows = clamp(Math.floor((building.height - 22) / 15), 2, 8);
  const light = seeded(djb2(building.id));
  const cells: boolean[] = [];
  for (let c = 0; c < rows * cols; c += 1) cells.push(light() < 0.24);

  return (
    <div
      className="absolute"
      style={{
        left: `${building.x}%`,
        top: `${BASELINE}%`,
        width: building.width,
        height: 0,
      }}
    >
      {/* The plot — a dashed footprint straddling the street line. */}
      <motion.div
        className="border-hairline-strong absolute inset-x-0 top-0 rounded-1 border border-dashed"
        style={{
          height: PLOT_H,
          marginTop: -PLOT_H / 2,
          opacity: motionSafe ? plotOpacity : PLOT_SETTLED,
        }}
      >
        <span className="text-ink-3 absolute top-full left-1/2 mt-1 -translate-x-1/2 font-mono text-[8px] leading-none tracking-[0.08em] whitespace-nowrap">
          PLOT {String(plotIndex + 1).padStart(2, "0")}
        </span>
      </motion.div>

      {/* Base shadow — widens and darkens as the facade stands. */}
      <motion.span
        className="absolute inset-x-0 rounded-full bg-black/60 blur-[2px]"
        style={{
          top: -3,
          height: 6,
          opacity: motionSafe ? shadowOpacity : SHADOW_MAX,
          scaleX: motionSafe ? shadowScaleX : 1.05,
        }}
      />

      {/* The facade — hinges at its base from flat on the plan to standing. */}
      <motion.div
        className="border-hairline bg-surface-2 absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-1 border"
        style={{
          height: building.height,
          transform: motionSafe ? rise : "none",
          transformOrigin: "50% 100%",
          willChange: "transform",
        }}
      >
        <span className="text-ink-3 block truncate px-1.5 pt-1 text-center font-mono text-[8px] leading-3 tracking-[0.08em]">
          {building.label}
        </span>
        <span
          className="min-h-0 flex-1"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
            gap: 3,
            padding: "4px 5px 6px",
          }}
        >
          {cells.map((isLit, c) => (
            <span
              key={c}
              className="rounded-[1px]"
              style={{
                background: isLit ? "var(--accent-wash)" : "var(--hairline)",
              }}
            />
          ))}
        </span>
      </motion.div>
    </div>
  );
}
