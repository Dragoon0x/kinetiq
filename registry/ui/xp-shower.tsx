"use client";

import * as React from "react";

import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

/** Batch size is clamped into this range regardless of what the prop asks for. */
const ORBS_MIN = 6;
const ORBS_MAX = 20;

/** Stage footprint, in px. */
const STAGE_W = 340;
const STAGE_H = 190;

/** The source node's centre, in stage coordinates. */
const SOURCE_X = 78;
const SOURCE_Y = 120;
const SOURCE_SIZE = 34;

/** Where a flying orb's arc aims for — the counter's numerals. */
const COUNTER_TARGET_X = 254;
const COUNTER_TARGET_Y = 46;
const FLIGHT_DX = COUNTER_TARGET_X - SOURCE_X;
const FLIGHT_DY = COUNTER_TARGET_Y - SOURCE_Y;

/** Orb sizes, px. */
const ORB_SIZE = 12;
const BIG_ORB_SIZE = 20;

/** Rest scale reached at the end of spawn — big orbs land visibly larger. */
const REST_SCALE = 1;
const BIG_REST_SCALE = 1.4;
/** Shrink applied right as an orb is absorbed into the counter. */
const ARRIVE_SCALE = 0.4;

/** Timing, s. */
const SPAWN_S = 0.16;
const HOLD_S = 0.2;
const HOLD_TOTAL_S = SPAWN_S + HOLD_S;
const FLIGHT_S = 0.6;

/** Curvature of the flight arc: a slight loft, biased left or right per orb. */
const ARC_BOW_X = 12;
const ARC_BOW_Y = 30;

/** Level-up caption holds this long before reverting to the totals line. */
const CAPTION_FLASH_MS = 1200;
/** XP required per level. */
const LEVEL_STEP = 100;

/**
 * Ten fixed scatter offsets, evenly spaced around the source and cycled by
 * index — every batch pops outward along the same fan, no two claims land
 * differently.
 */
const SCATTER_COUNT = 10;
const SCATTER_VECTORS = Array.from({ length: SCATTER_COUNT }, (_, i) => {
  const angle = (i / SCATTER_COUNT) * Math.PI * 2;
  const radius = i % 2 === 0 ? 26 : 40;
  return { dx: Math.cos(angle) * radius, dy: Math.sin(angle) * radius };
}) satisfies readonly { dx: number; dy: number }[];

/**
 * The hold phase's shared keyframe times: a fast scale-in pop, then two
 * small jitters, then a settle — identical for every orb so the batch hangs
 * together as one beat before the cascade begins.
 */
const HOLD_TIMES = [0, 0.44, 0.65, 0.85, 1] as const;
const FLIGHT_TIMES = [0, 0.5, 1] as const;

/** Fixed orb value table — most pickups small, cycled by index. */
const ORB_VALUES = [10, 15, 10, 20, 15, 10, 25, 15, 10, 20, 15, 10] as const;
/** The one or two big orbs a batch reserves for last, cycled if more than two. */
const BIG_ORB_VALUES = [70, 55] as const;

const ORB_FILL =
  "radial-gradient(circle at 35% 30%, color-mix(in oklab, var(--primary) 55%, var(--primary-foreground)) 0%, var(--primary) 78%)";
const ORB_GLOW =
  "0 0 8px 1px color-mix(in oklab, var(--primary) 50%, transparent)";
const BIG_ORB_FILL =
  "radial-gradient(circle at 35% 30%, color-mix(in oklab, var(--warning, #b45309) 55%, var(--primary-foreground)) 0%, var(--warning, #b45309) 78%)";
const BIG_ORB_GLOW =
  "0 0 14px 3px color-mix(in oklab, var(--warning, #b45309) 55%, transparent), 0 0 4px 1px color-mix(in oklab, var(--warning, #b45309) 85%, transparent)";

type OrbEntry = {
  id: number;
  value: number;
  big: boolean;
  dx: number;
  dy: number;
  jx: number;
  jy: number;
  flightPath: { x: number[]; y: number[] };
  flightDelay: number;
};

type RingEntry = { id: number };

/** Small, deterministic per-orb jitter and arc-bow variety — no randomness. */
const jitterFor = (i: number): { jx: number; jy: number } => ({
  jx: 2 + (i % 3),
  jy: 2 + ((i + 1) % 3),
});

function buildFlightPath(
  dx: number,
  dy: number,
  bowSign: number,
): { x: number[]; y: number[] } {
  const midX = dx + (FLIGHT_DX - dx) * 0.5 + bowSign * ARC_BOW_X;
  const midY = dy + (FLIGHT_DY - dy) * 0.5 - ARC_BOW_Y;
  return {
    x: [dx, midX, FLIGHT_DX],
    y: [dy, midY, FLIGHT_DY],
  };
}

type OrbPhase = "holding" | "flying";

/**
 * One claimed orb's whole life: pop out to its scatter offset with a
 * scale-in, jitter in place for a beat, then arc to the counter on a
 * multi-keyframe tween and report its own arrival. The hold and flight
 * keyframes are engineered to share their boundary value, so switching the
 * `animate` target between phases never produces a visible jump regardless
 * of where Motion samples the handoff from.
 */
function Orb({
  entry,
  onArrive,
}: {
  entry: OrbEntry;
  onArrive: (id: number, value: number) => void;
}): React.JSX.Element {
  const [phase, setPhase] = React.useState<OrbPhase>("holding");
  const size = entry.big ? BIG_ORB_SIZE : ORB_SIZE;
  const restScale = entry.big ? BIG_REST_SCALE : REST_SCALE;

  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute rounded-full"
      style={{
        left: SOURCE_X,
        top: SOURCE_Y,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        width: size,
        height: size,
        background: entry.big ? BIG_ORB_FILL : ORB_FILL,
        boxShadow: entry.big ? BIG_ORB_GLOW : ORB_GLOW,
      }}
      initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
      animate={
        phase === "holding"
          ? {
              x: [
                0,
                entry.dx,
                entry.dx + entry.jx,
                entry.dx - entry.jx,
                entry.dx,
              ],
              y: [
                0,
                entry.dy,
                entry.dy - entry.jy,
                entry.dy + entry.jy,
                entry.dy,
              ],
              scale: [
                0,
                restScale,
                restScale * 1.05,
                restScale * 0.95,
                restScale,
              ],
              opacity: [0, 1, 1, 1, 1],
            }
          : {
              x: [...entry.flightPath.x],
              y: [...entry.flightPath.y],
              scale: [restScale, restScale, ARRIVE_SCALE],
              opacity: [1, 1, 0],
            }
      }
      transition={
        phase === "holding"
          ? {
              duration: HOLD_TOTAL_S,
              times: [...HOLD_TIMES],
              ease: easings.move,
            }
          : {
              duration: FLIGHT_S,
              times: [...FLIGHT_TIMES],
              ease: easings.move,
              delay: entry.flightDelay,
            }
      }
      onAnimationComplete={() => {
        if (phase === "holding") {
          setPhase("flying");
        } else {
          onArrive(entry.id, entry.value);
        }
      }}
    />
  );
}

export type XpShowerProps = {
  /** Orbs per claim. Clamped 6-20. @default 12 */
  orbs?: number;
  /** Fires once per claim with the session total this claim brings you to. */
  onClaim?: (total: number) => void;
  className?: string;
};

/**
 * A reward burst that pays out as objects, not a number changing. Claiming
 * spawns a batch of orbs at the defeated node, holds them jittering in place
 * for a beat, then sends them arcing to the counter one after another on a
 * `cascade` stagger — each orb's own arrival ticks the `Readout` total up by
 * its own value, pops the counter, and rings the frame, so the total
 * visibly climbs in steps as the orbs land; that stepped climb, not the
 * final number, is the whole point of the effect. Orb values come from a
 * fixed table weighted toward small pickups, with one or two bright,
 * oversized orbs held back to land last, because the big one only means
 * something once everything smaller has already landed. The level bar
 * fills alongside the total and flashes brighter with a mono "level N"
 * caption whenever a threshold is crossed. Claiming again mid-flight is
 * fine — batches overlap freely and every orb still owns its own arrival.
 * Reduced motion: no burst, hold, flight, or ring — orbs are never
 * rendered, and the counter ticks up once by the batch total with the
 * caption updated to match.
 */
export function XpShower({
  orbs: orbsProp = 12,
  onClaim,
  className,
}: XpShowerProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const orbCount = Math.min(ORBS_MAX, Math.max(ORBS_MIN, Math.round(orbsProp)));

  const [total, setTotal] = React.useState(0);
  const [level, setLevel] = React.useState(1);
  const [lastBatchTotal, setLastBatchTotal] = React.useState(0);
  const [levelFlashActive, setLevelFlashActive] = React.useState(false);
  const [levelFlashKey, setLevelFlashKey] = React.useState(0);
  const [orbEntries, setOrbEntries] = React.useState<OrbEntry[]>([]);
  const [rings, setRings] = React.useState<RingEntry[]>([]);
  const [announce, setAnnounce] = React.useState("");

  // Synchronous accumulators: several orbs (even from overlapping batches)
  // can arrive in the same tick, before React re-renders between them, so
  // these refs — not the state above — are the source of truth mid-handler.
  const totalRef = React.useRef(0);
  const levelRef = React.useRef(1);
  const orbIdRef = React.useRef(0);
  const ringIdRef = React.useRef(0);

  const popScale = useMotionValue(1);
  const popAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const captionTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      popAnim.current?.stop();
      if (captionTimer.current !== null)
        window.clearTimeout(captionTimer.current);
    };
  }, []);

  const pulsePop = () => {
    if (!motionSafe) return;
    popAnim.current?.stop();
    popAnim.current = animate(popScale, 1.16, {
      ...springs.flick,
      onComplete: () => {
        popAnim.current = animate(popScale, 1, springs.flick);
      },
    });
  };

  const spawnRing = () => {
    if (!motionSafe) return;
    const id = ringIdRef.current;
    ringIdRef.current += 1;
    setRings((prev) => [...prev, { id }]);
  };

  const handleRingDone = (id: number) => {
    setRings((prev) => prev.filter((r) => r.id !== id));
  };

  const triggerLevelFlash = (newLevel: number) => {
    setLevelFlashActive(true);
    setLevelFlashKey((k) => k + 1);
    setAnnounce(`Level ${newLevel}.`);
    if (captionTimer.current !== null)
      window.clearTimeout(captionTimer.current);
    captionTimer.current = window.setTimeout(() => {
      captionTimer.current = null;
      setLevelFlashActive(false);
    }, CAPTION_FLASH_MS);
  };

  /** Applies one orb's value (or, under reduced motion, a whole batch's). */
  const applyGain = (value: number) => {
    const newTotal = totalRef.current + value;
    totalRef.current = newTotal;
    setTotal(newTotal);

    const newLevel = Math.floor(newTotal / LEVEL_STEP) + 1;
    if (newLevel > levelRef.current) {
      levelRef.current = newLevel;
      setLevel(newLevel);
      triggerLevelFlash(newLevel);
    }

    pulsePop();
    spawnRing();
  };

  const handleOrbArrive = (id: number, value: number) => {
    setOrbEntries((prev) => prev.filter((e) => e.id !== id));
    applyGain(value);
  };

  const handleClaim = () => {
    const bigCount = orbCount >= 16 ? 2 : 1;
    const smallCount = orbCount - bigCount;

    const specs: { value: number; big: boolean }[] = [];
    for (let i = 0; i < smallCount; i += 1) {
      specs.push({
        value: ORB_VALUES[i % ORB_VALUES.length] ?? 10,
        big: false,
      });
    }
    for (let i = 0; i < bigCount; i += 1) {
      specs.push({
        value: BIG_ORB_VALUES[i % BIG_ORB_VALUES.length] ?? 60,
        big: true,
      });
    }

    const batchTotal = specs.reduce((sum, s) => sum + s.value, 0);
    setLastBatchTotal(batchTotal);
    setAnnounce(`Claimed ${batchTotal} experience.`);
    onClaim?.(totalRef.current + batchTotal);

    if (!motionSafe) {
      applyGain(batchTotal);
      return;
    }

    const step = cascade(specs.length);
    const entries: OrbEntry[] = specs.map((spec, i) => {
      const id = orbIdRef.current;
      orbIdRef.current += 1;
      const vector = SCATTER_VECTORS[i % SCATTER_VECTORS.length] ?? {
        dx: 0,
        dy: 0,
      };
      const { jx, jy } = jitterFor(i);
      const bowSign = i % 2 === 0 ? 1 : -1;
      return {
        id,
        value: spec.value,
        big: spec.big,
        dx: vector.dx,
        dy: vector.dy,
        jx,
        jy,
        flightPath: buildFlightPath(vector.dx, vector.dy, bowSign),
        flightDelay: i * step,
      };
    });

    setOrbEntries((prev) => [...prev, ...entries]);
  };

  const progressPct = ((total % LEVEL_STEP) / LEVEL_STEP) * 100;
  const captionText = levelFlashActive
    ? `level ${level}`
    : `${total} total · +${lastBatchTotal} this claim`;

  return (
    <div className={cn("inline-flex flex-col items-center gap-3", className)}>
      <div
        className="relative overflow-hidden rounded-4 border border-hairline bg-surface-2"
        style={{ width: STAGE_W, height: STAGE_H }}
      >
        <div
          aria-hidden
          className="absolute flex items-center justify-center"
          style={{
            left: SOURCE_X,
            top: SOURCE_Y,
            marginLeft: -SOURCE_SIZE / 2,
            marginTop: -SOURCE_SIZE / 2,
            width: SOURCE_SIZE,
            height: SOURCE_SIZE,
          }}
        >
          <span className="absolute inset-0 rounded-full border border-hairline-strong bg-surface-1" />
          <span
            className="size-3 rotate-45 rounded-[3px]"
            style={{
              background:
                "color-mix(in oklab, var(--primary) 55%, var(--color-surface-2))",
            }}
          />
        </div>

        {orbEntries.map((entry) => (
          <Orb key={entry.id} entry={entry} onArrive={handleOrbArrive} />
        ))}

        <div className="absolute top-3 right-3 flex w-[150px] flex-col items-end gap-1.5 rounded-3 border border-hairline-strong bg-surface-1/90 px-3 py-2 shadow-raised">
          <span className="font-mono text-[10px] font-medium tracking-[0.16em] text-ink-3 uppercase">
            XP
          </span>

          <span className="relative inline-flex">
            <motion.span className="inline-flex" style={{ scale: popScale }}>
              <Readout value={total} size="lg" />
            </motion.span>

            <span
              aria-hidden
              className="pointer-events-none absolute -inset-2.5"
            >
              {motionSafe &&
                rings.map((ring) => (
                  <motion.span
                    key={ring.id}
                    className="absolute inset-0 rounded-full border-2"
                    style={{
                      borderColor:
                        "color-mix(in oklab, var(--primary) 70%, transparent)",
                    }}
                    initial={{ scale: 0.7, opacity: 0.9 }}
                    animate={{ scale: 1.5, opacity: 0 }}
                    transition={{
                      duration: durations.slow,
                      ease: easings.exit,
                    }}
                    onAnimationComplete={() => handleRingDone(ring.id)}
                  />
                ))}
              {motionSafe && levelFlashKey > 0 && (
                <motion.span
                  key={levelFlashKey}
                  className="absolute -inset-3 rounded-full"
                  style={{
                    background:
                      "radial-gradient(circle, color-mix(in oklab, var(--primary) 55%, transparent) 0%, transparent 70%)",
                  }}
                  initial={{ opacity: 0.9, scale: 0.8 }}
                  animate={{ opacity: 0, scale: 1.3 }}
                  transition={{ duration: durations.page, ease: easings.exit }}
                />
              )}
            </span>
          </span>

          <div
            role="progressbar"
            aria-label="Level progress"
            aria-valuenow={total % LEVEL_STEP}
            aria-valuemin={0}
            aria-valuemax={LEVEL_STEP}
            className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
          >
            <motion.span
              aria-hidden
              className="absolute inset-y-0 left-0 rounded-full bg-primary"
              initial={false}
              animate={{ width: `${progressPct}%` }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
            />
          </div>
        </div>
      </div>

      <div className="flex w-full items-center justify-between gap-3">
        <span
          aria-hidden
          className="flex h-4 items-center overflow-hidden font-mono text-[11px] text-ink-3 tabular-nums"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={levelFlashActive ? "levelup" : "totals"}
              initial={motionSafe ? { opacity: 0, y: 4 } : false}
              animate={{ opacity: 1, y: 0 }}
              exit={
                motionSafe
                  ? {
                      opacity: 0,
                      y: -4,
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
        </span>

        <motion.button
          type="button"
          aria-label="Claim the reward"
          onClick={handleClaim}
          whileTap={motionSafe ? { scale: 0.94 } : undefined}
          transition={springs.flick}
          className={cn(
            "rounded-2 bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-raised transition-[filter] outline-none",
            "hover:brightness-110 active:brightness-95",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          )}
        >
          Claim
        </motion.button>
      </div>

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
