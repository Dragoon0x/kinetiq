"use client";

import * as React from "react";

import { Check } from "lucide-react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

/** Fixed viewBox the whole layout table is authored against. */
const VIEW_W = 640;
const VIEW_H = 230;

/**
 * Seven fixed node positions along the winding path — hand-authored, never
 * measured or generated. Y alternates the same two rows, so by reflection
 * symmetry every one of the six hops between them shares the same arc
 * length, which is what keeps the lit-trail math below honest.
 */
const NODE_X = [40, 132, 224, 316, 408, 500, 592] as const;
const NODE_Y = [150, 70, 150, 70, 150, 70, 150] as const;
const NODE_COUNT = NODE_X.length;

/** Half the gap between consecutive node x's — the control handles sit
 * level with each endpoint, which is what bows the path into an S. */
const HALF_GAP = 46;

/**
 * The single winding path, one authored cubic per hop. Fixed `d` string —
 * never measured, never generated from randomness.
 */
const PATH_D =
  "M40,150 C86,150 86,70 132,70 " +
  "C178,70 178,150 224,150 " +
  "C270,150 270,70 316,70 " +
  "C362,70 362,150 408,150 " +
  "C454,150 454,70 500,70 " +
  "C546,70 546,150 592,150";

type Vec = { x: number; y: number };

/** Point on a cubic bezier at t (0..1). Pure math — SSR-safe. */
function cubicPoint(p0: Vec, c1: Vec, c2: Vec, p1: Vec, t: number): Vec {
  const mt = 1 - t;
  return {
    x:
      mt * mt * mt * p0.x +
      3 * mt * mt * t * c1.x +
      3 * mt * t * t * c2.x +
      t * t * t * p1.x,
    y:
      mt * mt * mt * p0.y +
      3 * mt * mt * t * c1.y +
      3 * mt * t * t * c2.y +
      t * t * t * p1.y,
  };
}

/** Waypoint fractions sampled along each hop — dense enough that the avatar
 * visibly rides the drawn curve instead of cutting a straight line. */
const WAYPOINT_T = [0, 0.25, 0.5, 0.75, 1] as const;

/**
 * Polyline approximation of one cubic segment's arc length, in viewBox px.
 * Pure math over fixed inputs — not a DOM measurement — but real enough
 * that `strokeDasharray`/`strokeDashoffset` (which Motion would otherwise
 * renormalize the instant an SVG `pathLength` prop is set — see HOP_LENGTH
 * below) line up with what the browser actually renders.
 */
function approxLength(
  p0: Vec,
  c1: Vec,
  c2: Vec,
  p1: Vec,
  steps: number,
): number {
  let length = 0;
  let prev = p0;
  for (let s = 1; s <= steps; s += 1) {
    const pt = cubicPoint(p0, c1, c2, p1, s / steps);
    length += Math.hypot(pt.x - prev.x, pt.y - prev.y);
    prev = pt;
  }
  return length;
}

/**
 * Every hop is congruent by the reflection symmetry noted above, so one
 * measurement (off node 0 → node 1) gives every hop's length. Motion's SVG
 * renderer special-cases any element that receives a `pathLength` prop —
 * it recomputes `stroke-dasharray`/`stroke-dashoffset` itself and silently
 * overwrites whatever this component sets, so the progress overlay below
 * is driven in real px against this computed length instead of the usual
 * `pathLength="1"` normalization trick.
 */
const HOP_LENGTH = approxLength(
  { x: NODE_X[0] ?? 0, y: NODE_Y[0] ?? 0 },
  { x: (NODE_X[0] ?? 0) + HALF_GAP, y: NODE_Y[0] ?? 0 },
  { x: (NODE_X[1] ?? 0) - HALF_GAP, y: NODE_Y[1] ?? 0 },
  { x: NODE_X[1] ?? 0, y: NODE_Y[1] ?? 0 },
  48,
);
const PATH_LENGTH = HOP_LENGTH * (NODE_COUNT - 1);

type Hop = { x: number[]; y: number[]; dash: number[] };

/**
 * One entry per gap between nodes, sampled off the same fixed node table
 * and control-point rule `PATH_D` was authored from — so the avatar's
 * travel line and the lit-trail overlay both ride the exact drawn curve.
 * Built once at module scope: pure math over fixed constants, never a DOM
 * measurement.
 */
const HOPS: readonly Hop[] = NODE_X.slice(0, -1).map((x0, i) => {
  const y0 = NODE_Y[i] ?? 0;
  const x1 = NODE_X[i + 1] ?? 0;
  const y1 = NODE_Y[i + 1] ?? 0;
  const p0: Vec = { x: x0, y: y0 };
  const p1: Vec = { x: x1, y: y1 };
  const c1: Vec = { x: x0 + HALF_GAP, y: y0 };
  const c2: Vec = { x: x1 - HALF_GAP, y: y1 };
  const x: number[] = [];
  const y: number[] = [];
  const dash: number[] = [];
  for (const t of WAYPOINT_T) {
    const pt = cubicPoint(p0, c1, c2, p1, t);
    x.push(pt.x);
    y.push(pt.y);
    dash.push(PATH_LENGTH - (i + t) * HOP_LENGTH);
  }
  return { x, y, dash };
});

const NODE_D = 30;
const AVATAR_D = 14;

const HOP_DURATION = 0.6;
const PULSE_MS = 550;
const CELEBRATE_MS = 1500;

const CASCADE_STEP = cascade(NODE_COUNT);

const IDLE_CAPTION = "charting the route";

const TAU = Math.PI * 2;
const SPARK_COUNT = 8;
const SPARK_SPREAD = 30;

/** Eight fixed spark vectors thrown from the final node — deterministic, no
 * Math.random. */
const SPARKS = Array.from({ length: SPARK_COUNT }, (_, i) => {
  const angle = (i / SPARK_COUNT) * TAU - TAU / 4;
  return {
    dx: Math.cos(angle) * SPARK_SPREAD,
    dy: Math.sin(angle) * SPARK_SPREAD,
  };
});

export type Milestone = { id: string; label: string; hint: string };

const DEFAULT_MILESTONES: Milestone[] = [
  { id: "berth", label: "First berth", hint: "needs a signed manifest" },
  { id: "night-shift", label: "Night shift", hint: "needs the gate logged" },
  { id: "audit", label: "The audit", hint: "needs the ledger squared" },
  { id: "low-tide", label: "Low tide", hint: "needs the tide charts read" },
  { id: "full-crew", label: "Full crew", hint: "needs every hand signed" },
  { id: "storm-watch", label: "Storm watch", hint: "needs the glass checked" },
  {
    id: "harbour-master",
    label: "Harbour master",
    hint: "needs the keys earned",
  },
];

function clampIndex(value: number): number {
  return Math.min(NODE_COUNT - 1, Math.max(0, Math.round(value)));
}

type NodeStatus = "done" | "current" | "locked";

function statusOf(index: number, current: number): NodeStatus {
  if (index < current) return "done";
  if (index === current) return "current";
  return "locked";
}

export type JourneyMapProps = {
  /** The seven stops, in order. Fewer than seven are padded from the house
   * defaults; more are trimmed — the path's seven positions are fixed.
   * @default seven harbour-yard milestones */
  milestones?: Milestone[];
  /** Starting node index. @default 2 */
  at?: number;
  /** Fires with a milestone's id the instant the avatar lands on it. */
  onArrive?: (id: string) => void;
  className?: string;
};

/**
 * A campaign map: one fixed, hand-drawn cubic path winds across a faint
 * contour grid, seven milestones sitting at authored positions along it.
 * The track draws in two layers — a dim base and a bright overlay clipped
 * by `strokeDasharray`/`strokeDashoffset` — so distance covered reads as
 * the road lighting up behind the avatar. "Travel to the next milestone"
 * rides the avatar through waypoints sampled off that same curve while the
 * lit trail advances in the same beat, landing with the node popping to
 * `done` on `flick`, a ring pulsing, and the next node waking into its own
 * ambient pulse. Reaching the last milestone unfurls a banner, cascades a
 * pulse back down every node on the path, and throws eight sparks;
 * "restart" sends the avatar home while the road dims out in the reverse
 * order it lit. Hovering a node brightens its label, and a locked node also
 * surfaces a mono hint of what it is waiting on.
 * Reduced motion: the avatar jumps straight to each node, the progress
 * overlay steps to its new length instantly, and no pulses, sparks, or
 * banner unfurl play — the completion banner simply appears in its
 * finished state.
 */
export function JourneyMap({
  milestones: milestonesProp,
  at = 2,
  onArrive,
  className,
}: JourneyMapProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const milestones = React.useMemo<Milestone[]>(() => {
    const source = milestonesProp ?? DEFAULT_MILESTONES;
    return Array.from({ length: NODE_COUNT }, (_, i) => {
      const fallback = DEFAULT_MILESTONES[i];
      return (
        source[i] ??
        fallback ?? { id: `stop-${i}`, label: `Stop ${i + 1}`, hint: "" }
      );
    });
  }, [milestonesProp]);

  const startIndex = clampIndex(at);

  const [current, setCurrent] = React.useState(startIndex);
  const [isTraveling, setIsTraveling] = React.useState(false);
  const [justArrived, setJustArrived] = React.useState<number | null>(null);
  const [celebrating, setCelebrating] = React.useState(false);
  const [arrivedLabel, setArrivedLabel] = React.useState<string | null>(null);
  const [resetFrom, setResetFrom] = React.useState<number | null>(null);
  const [announce, setAnnounce] = React.useState("");

  const avatarX = useMotionValue<number>(NODE_X[startIndex] ?? 0);
  const avatarY = useMotionValue<number>(NODE_Y[startIndex] ?? 0);
  const dashOffset = useMotionValue<number>(
    PATH_LENGTH - startIndex * HOP_LENGTH,
  );

  const avatarXCtrl = React.useRef<ReturnType<typeof animate> | null>(null);
  const avatarYCtrl = React.useRef<ReturnType<typeof animate> | null>(null);
  const dashCtrl = React.useRef<ReturnType<typeof animate> | null>(null);
  const pulseTimer = React.useRef<number | null>(null);
  const celebrateTimer = React.useRef<number | null>(null);
  const onArriveRef = React.useRef(onArrive);

  React.useEffect(() => {
    onArriveRef.current = onArrive;
  }, [onArrive]);

  React.useEffect(() => {
    return () => {
      avatarXCtrl.current?.stop();
      avatarYCtrl.current?.stop();
      dashCtrl.current?.stop();
      if (pulseTimer.current !== null) window.clearTimeout(pulseTimer.current);
      if (celebrateTimer.current !== null)
        window.clearTimeout(celebrateTimer.current);
    };
  }, []);

  const journeyComplete = current === NODE_COUNT - 1;

  const handleAdvance = () => {
    if (isTraveling || current >= NODE_COUNT - 1) return;
    const hop = HOPS[current];
    if (!hop) return;
    const toIndex = current + 1;
    const milestone = milestones[toIndex];

    avatarXCtrl.current?.stop();
    avatarYCtrl.current?.stop();
    dashCtrl.current?.stop();

    const finalize = () => {
      setIsTraveling(false);
      setCurrent(toIndex);
      onArriveRef.current?.(milestone?.id ?? "");
      const isFinal = toIndex === NODE_COUNT - 1;
      setArrivedLabel(milestone?.label ?? null);
      setAnnounce(
        `Reached ${milestone?.label ?? "the next milestone"}.` +
          (isFinal ? " Journey complete." : ""),
      );

      if (motionSafe) {
        if (pulseTimer.current !== null)
          window.clearTimeout(pulseTimer.current);
        setJustArrived(toIndex);
        pulseTimer.current = window.setTimeout(() => {
          pulseTimer.current = null;
          setJustArrived(null);
        }, PULSE_MS);

        if (isFinal) {
          if (celebrateTimer.current !== null)
            window.clearTimeout(celebrateTimer.current);
          setCelebrating(true);
          celebrateTimer.current = window.setTimeout(() => {
            celebrateTimer.current = null;
            setCelebrating(false);
          }, CELEBRATE_MS);
        }
      }
    };

    if (!motionSafe) {
      avatarX.set(NODE_X[toIndex] ?? 0);
      avatarY.set(NODE_Y[toIndex] ?? 0);
      dashOffset.set(hop.dash[hop.dash.length - 1] ?? 0);
      setIsTraveling(false);
      finalize();
      return;
    }

    setIsTraveling(true);
    avatarXCtrl.current = animate(avatarX, hop.x, {
      duration: HOP_DURATION,
      ease: easings.move,
      times: [...WAYPOINT_T],
      onComplete: finalize,
    });
    avatarYCtrl.current = animate(avatarY, hop.y, {
      duration: HOP_DURATION,
      ease: easings.move,
      times: [...WAYPOINT_T],
    });
    dashCtrl.current = animate(dashOffset, hop.dash, {
      duration: HOP_DURATION,
      ease: easings.move,
      times: [...WAYPOINT_T],
    });
  };

  const handleRestart = () => {
    if (isTraveling || current === 0) return;

    avatarXCtrl.current?.stop();
    avatarYCtrl.current?.stop();
    dashCtrl.current?.stop();
    if (pulseTimer.current !== null) {
      window.clearTimeout(pulseTimer.current);
      pulseTimer.current = null;
    }
    if (celebrateTimer.current !== null) {
      window.clearTimeout(celebrateTimer.current);
      celebrateTimer.current = null;
    }

    setResetFrom(current);
    setCurrent(0);
    setIsTraveling(false);
    setJustArrived(null);
    setCelebrating(false);
    setArrivedLabel(null);
    setAnnounce(`Restarted. Back at ${milestones[0]?.label ?? "the start"}.`);

    const targetX = NODE_X[0] ?? 0;
    const targetY = NODE_Y[0] ?? 0;
    if (motionSafe) {
      avatarXCtrl.current = animate(avatarX, targetX, springs.glide);
      avatarYCtrl.current = animate(avatarY, targetY, springs.glide);
      dashCtrl.current = animate(dashOffset, PATH_LENGTH, {
        duration: durations.slow,
        ease: easings.exit,
      });
    } else {
      avatarX.set(targetX);
      avatarY.set(targetY);
      dashOffset.set(PATH_LENGTH);
    }
  };

  const lockedDelay = (index: number): number => {
    if (resetFrom === null || index >= resetFrom) return 0;
    return (resetFrom - 1 - index) * CASCADE_STEP;
  };

  const captionText = journeyComplete
    ? "journey complete"
    : arrivedLabel
      ? `reached · ${arrivedLabel}`
      : IDLE_CAPTION;
  const captionKey = journeyComplete
    ? "complete"
    : arrivedLabel
      ? `arrived-${current}`
      : "idle";

  const sparkX = NODE_X[NODE_COUNT - 1] ?? 0;
  const sparkY = NODE_Y[NODE_COUNT - 1] ?? 0;

  return (
    <div
      className={cn(
        "w-full max-w-2xl rounded-4 border border-hairline bg-surface-1 shadow-raised",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <span className="text-sm font-semibold text-ink">The Route</span>
        <Readout
          value={current + 1}
          format={(v) => `${v} of ${NODE_COUNT}`}
          size="sm"
          className="text-ink-2"
        />
      </div>

      <div className="px-4 py-5">
        <AnimatePresence>
          {journeyComplete && (
            <motion.div
              key="banner"
              initial={
                motionSafe && celebrating ? { scaleX: 0, opacity: 0 } : false
              }
              animate={{ scaleX: 1, opacity: 1 }}
              exit={{
                opacity: 0,
                transition: { duration: durations.fast, ease: easings.exit },
              }}
              transition={
                motionSafe
                  ? { duration: durations.slow, ease: easings.enter }
                  : { duration: 0 }
              }
              style={{ transformOrigin: "50% 50%" }}
              className="mb-3 rounded-2 border border-hairline-strong bg-surface-2 py-1.5 text-center font-mono text-[11px] font-semibold tracking-[0.14em] text-ink uppercase"
            >
              journey complete
            </motion.div>
          )}
        </AnimatePresence>

        <div className="overflow-x-auto">
          <div
            className="relative mx-auto shrink-0"
            style={{ width: VIEW_W, height: VIEW_H }}
          >
            <svg
              aria-hidden
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              className="absolute inset-0 size-full overflow-visible"
            >
              <MapGrid width={VIEW_W} height={VIEW_H} />
              <path
                d={PATH_D}
                fill="none"
                stroke="var(--hairline-strong)"
                strokeWidth={3}
                strokeLinecap="round"
              />
              <motion.path
                d={PATH_D}
                fill="none"
                stroke="var(--primary)"
                strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray={`${PATH_LENGTH} ${PATH_LENGTH}`}
                strokeDashoffset={dashOffset}
              />
            </svg>

            {milestones.map((milestone, index) => (
              <MilestoneNode
                key={milestone.id}
                milestone={milestone}
                index={index}
                status={statusOf(index, current)}
                justArrived={justArrived === index}
                celebrate={celebrating && index <= current}
                celebrateDelay={index * CASCADE_STEP}
                lockedDelay={lockedDelay(index)}
                motionSafe={motionSafe}
              />
            ))}

            <JourneyAvatar
              x={avatarX}
              y={avatarY}
              bobbing={!isTraveling}
              motionSafe={motionSafe}
            />

            <AnimatePresence>
              {motionSafe && celebrating && (
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute z-20"
                  style={{ left: sparkX, top: sparkY }}
                  exit={{ opacity: 0 }}
                >
                  {SPARKS.map((spark, i) => (
                    <motion.span
                      key={i}
                      className="absolute size-1 rounded-full"
                      style={{ background: "var(--primary)" }}
                      initial={{ x: 0, y: 0, opacity: 1 }}
                      animate={{ x: spark.dx, y: spark.dy, opacity: 0 }}
                      transition={{
                        duration: durations.slow,
                        ease: easings.exit,
                      }}
                    />
                  ))}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={captionKey}
            className="font-mono text-xs text-ink-3"
            initial={motionSafe ? { opacity: 0, y: 3 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={
              motionSafe
                ? {
                    opacity: 0,
                    transition: {
                      duration: durations.fast,
                      ease: easings.exit,
                    },
                  }
                : { opacity: 0, transition: { duration: 0 } }
            }
            transition={
              motionSafe
                ? { duration: durations.base, ease: easings.enter }
                : { duration: 0 }
            }
          >
            {captionText}
          </motion.span>
        </AnimatePresence>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleRestart}
            disabled={isTraveling || current === 0}
            className="text-label text-ink-3 transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-40"
          >
            restart
          </button>
          <motion.button
            type="button"
            aria-label="Travel to the next milestone"
            onClick={handleAdvance}
            disabled={isTraveling || current >= NODE_COUNT - 1}
            whileTap={motionSafe ? { scale: 0.94 } : undefined}
            transition={springs.flick}
            className={cn(
              "rounded-2 bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-raised transition-[filter] outline-none",
              "hover:brightness-110 active:brightness-95",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
              "disabled:pointer-events-none disabled:opacity-40",
            )}
          >
            advance
          </motion.button>
        </div>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}

/** Faint contour grid — the map panel's plane, a few repeating hairlines. */
function MapGrid({
  width,
  height,
}: {
  width: number;
  height: number;
}): React.JSX.Element {
  const cols = 6;
  const rows = 3;
  const lines: React.JSX.Element[] = [];
  for (let i = 1; i < cols; i += 1) {
    const x = (i / cols) * width;
    lines.push(
      <line
        key={`v${i}`}
        x1={x}
        y1={0}
        x2={x}
        y2={height}
        stroke="var(--hairline)"
        strokeWidth={1}
      />,
    );
  }
  for (let i = 1; i < rows; i += 1) {
    const y = (i / rows) * height;
    lines.push(
      <line
        key={`h${i}`}
        x1={0}
        y1={y}
        x2={width}
        y2={y}
        stroke="var(--hairline)"
        strokeWidth={1}
      />,
    );
  }
  return <g style={{ opacity: 0.6 }}>{lines}</g>;
}

type MilestoneNodeProps = {
  milestone: Milestone;
  index: number;
  status: NodeStatus;
  /** One-shot expanding ring for the instant this node is reached. */
  justArrived: boolean;
  /** Final-node cascade brighten. */
  celebrate: boolean;
  celebrateDelay: number;
  /** Reverse-cascade stagger applied while this node dims back during restart. */
  lockedDelay: number;
  motionSafe: boolean;
};

/** One milestone marker. Owns its own hover state — the reason this is a
 * real child component rather than inline JSX inside the parent's `.map`. */
function MilestoneNode({
  milestone,
  index,
  status,
  justArrived,
  celebrate,
  celebrateDelay,
  lockedDelay,
  motionSafe,
}: MilestoneNodeProps): React.JSX.Element {
  const [hovered, setHovered] = React.useState(false);
  const x = NODE_X[index] ?? 0;
  const y = NODE_Y[index] ?? 0;
  const done = status === "done";
  const current = status === "current";
  const locked = status === "locked";

  const fillTransition = motionSafe
    ? done
      ? { ...springs.flick, delay: 0 }
      : { duration: durations.base, ease: easings.exit, delay: lockedDelay }
    : { duration: 0 };

  return (
    <div
      className="absolute flex flex-col items-center"
      style={{
        left: x,
        top: y,
        marginLeft: -NODE_D / 2,
        marginTop: -NODE_D / 2,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="relative flex items-center justify-center"
        style={{ width: NODE_D, height: NODE_D }}
      >
        {motionSafe && current && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full border"
            style={{ borderColor: "var(--primary)" }}
            initial={{ scale: 1, opacity: 0.4 }}
            animate={{ scale: 1.3, opacity: 0.05 }}
            transition={{
              duration: 1.8,
              ease: "easeInOut",
              repeat: Infinity,
              repeatType: "mirror",
            }}
          />
        )}

        <AnimatePresence>
          {motionSafe && justArrived && (
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-full border-2"
              style={{ borderColor: "var(--primary)" }}
              initial={{ scale: 1, opacity: 0.65 }}
              animate={{ scale: 2.2, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.55, ease: easings.exit }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {motionSafe && celebrate && (
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{ background: "var(--primary)" }}
              initial={{ opacity: 0, scale: 1 }}
              animate={{ opacity: [0, 0.85, 0], scale: [1, 1.2, 1] }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 0.6,
                ease: easings.move,
                delay: celebrateDelay,
                times: [0, 0.4, 1],
              }}
            />
          )}
        </AnimatePresence>

        <div
          className={cn(
            "relative flex items-center justify-center overflow-hidden rounded-full border",
            done && "border-transparent",
            current && "border-2 bg-surface-1",
            locked && "border-hairline bg-surface-2 opacity-50",
          )}
          style={{
            width: NODE_D,
            height: NODE_D,
            borderColor: current ? "var(--primary)" : undefined,
          }}
        >
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{ background: "var(--primary)" }}
            initial={false}
            animate={{ scale: done ? 1 : 0, opacity: done ? 1 : 0 }}
            transition={fillTransition}
          />
          <span
            className="relative font-mono text-[11px] font-semibold"
            style={{ color: done ? "var(--primary-foreground)" : undefined }}
          >
            {done ? (
              <Check aria-hidden className="size-3.5" />
            ) : (
              <span className={locked ? "text-ink-3" : "text-ink"}>
                {index + 1}
              </span>
            )}
          </span>
        </div>
      </div>

      <span
        className={cn(
          "mt-1.5 max-w-20 truncate text-center text-[10px] font-medium transition-colors",
          hovered ? "text-ink" : done || current ? "text-ink-2" : "text-ink-3",
        )}
      >
        {milestone.label}
      </span>

      {locked && hovered && milestone.hint && (
        <span className="mt-0.5 max-w-24 truncate text-center font-mono text-[9px] text-ink-3">
          {milestone.hint}
        </span>
      )}
    </div>
  );
}

type JourneyAvatarProps = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  /** Idle bob plays only at rest — paused mid-travel. */
  bobbing: boolean;
  motionSafe: boolean;
};

/** The travelling marker. A single instance, positioned by motion values
 * the parent drives imperatively through the path's waypoints. */
function JourneyAvatar({
  x,
  y,
  bobbing,
  motionSafe,
}: JourneyAvatarProps): React.JSX.Element {
  const bob = motionSafe && bobbing;
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 z-10"
      style={{
        x,
        y,
        width: AVATAR_D,
        height: AVATAR_D,
        marginLeft: -AVATAR_D / 2,
        marginTop: -AVATAR_D / 2,
      }}
    >
      <motion.span
        className="block size-full rounded-full border-2 shadow-raised"
        style={{
          borderColor: "var(--primary-foreground)",
          background: "var(--primary)",
        }}
        animate={bob ? { y: [0, -3, 0] } : { y: 0 }}
        transition={
          bob
            ? {
                duration: 1.6,
                ease: easings.move,
                repeat: Infinity,
                times: [0, 0.5, 1],
              }
            : { duration: 0 }
        }
      />
    </motion.div>
  );
}
