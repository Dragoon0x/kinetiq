"use client";

import * as React from "react";

import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Stage geometry, px — the globe sits over the base, the chute runs to the tray. */
const STAGE_W = 220;
const STAGE_H = 250;

const GLOBE_CX = 110;
const GLOBE_CY = 74;
const GLOBE_R = 66;

const BASE_LEFT = 56;
const BASE_TOP = 136;
const BASE_W = 108;
const BASE_H = 46;

const KNOB_CX = 110;
const KNOB_CY = 159;
const KNOB_R = 15;

const TRAY_LEFT = 20;
const TRAY_TOP = 202;
const TRAY_W = 180;
const TRAY_H = 44;

/** Travelling and landed gumball footprint, px. */
const GUMBALL_D = 16;

/** Up to six gumballs queue in the tray before the oldest fades out. */
const TRAY_MAX = 6;
/** Up to three gumballs may ride the chute at once. */
const TRANSIT_MAX = 3;

/** Beat the caption holds "restocked" before reverting to the count. */
const CAPTION_MS = 1300;

/**
 * Fixed color cycle every gumball — cluster or dispensed — draws from, token
 * palette only.
 */
const COLORS = [
  "color-mix(in oklab, var(--primary) 80%, var(--card))",
  "color-mix(in oklab, var(--success, #047857) 80%, var(--card))",
  "color-mix(in oklab, var(--warning, #b45309) 80%, var(--card))",
  "color-mix(in oklab, var(--ink-2) 80%, var(--card))",
] as const;

/**
 * Fixed cluster ledger — a center ball plus two packed rings, offsets from
 * the globe center. The array order is the dispensing order: outer-ring
 * balls (indices 7–13) are hidden first, then the inner ring, the center
 * ball last, so the globe visibly thins from the glass inward.
 */
const CLUSTER = [
  { x: 0, y: 0, r: 10 },
  { x: 16, y: 0, r: 9 },
  { x: 8, y: 13.9, r: 9 },
  { x: -8, y: 13.9, r: 9 },
  { x: -16, y: 0, r: 9 },
  { x: -8, y: -13.9, r: 9 },
  { x: 8, y: -13.9, r: 9 },
  { x: 32, y: 0, r: 8 },
  { x: 20, y: 25, r: 8 },
  { x: -7.1, y: 31.2, r: 8 },
  { x: -28.8, y: 13.9, r: 8 },
  { x: -28.8, y: -13.9, r: 8 },
  { x: -7.1, y: -31.2, r: 8 },
  { x: 20, y: -25, r: 8 },
] as const;

/** The drawn chute — a single cubic curve from the dispense outlet to the tray. */
const CHUTE_D = "M128,150 C168,150 168,214 150,230";

/**
 * The traveling gumball keyframes — six points sampled off CHUTE_D at
 * t = 0, 0.2, 0.4, 0.6, 0.8, 1, so the ball rides the exact drawn tube.
 */
const CHUTE_X = [128, 147.4, 158.2, 161.6, 158.5, 150] as const;
const CHUTE_Y = [150, 156.8, 173.6, 194.9, 215.5, 230] as const;
const CHUTE_TIMES = [0, 0.2, 0.4, 0.6, 0.8, 1] as const;
const CHUTE_DURATION = 0.9;

/** Beat between the globe emptying and the refill starting, motion only. */
const RESTOCK_DELAY_MS = CHUTE_DURATION * 1000 + 650;

type Traveler = { key: number; color: string };
type LandedBall = { key: number; color: string };

export type GumballRunProps = {
  /** Gumballs served before the globe refills. Clamped to 6–14. @default 12 */
  capacity?: number;
  /** Fires the instant a gumball is dispensed, with the color that left. */
  onServe?: (color: string) => void;
  className?: string;
};

/**
 * A gumball machine that actually dispenses. A globe packed with a fixed
 * cluster of tinted gumballs sits over a metal-ish base with a real turn
 * knob; pressing it spins the knob a half turn on `snap`, the globe visibly
 * loses one ball, and a fresh gumball rides an authored curve down the chute
 * before dropping into the tray with a `recoil` bounce. Landed gumballs
 * queue in a row of up to six, oldest fading out as new ones nudge in, under
 * a mono "N served" count. Up to three gumballs may be in transit at once —
 * further turns are ignored until one lands — and once the globe empties it
 * holds a "restocked" caption beat before the cluster cascades back in and
 * the count resumes; the cluster layout, chute path, and color cycle are all
 * fixed tables, nothing simulated. Reduced motion: the knob swaps rotation
 * instantly, each gumball appears directly in the tray with no chute travel,
 * and the restock cascade appears at once.
 */
export function GumballRun({
  capacity = 12,
  onServe,
  className,
}: GumballRunProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const cap = Math.min(CLUSTER.length, Math.max(6, Math.round(capacity)));

  const [dispensed, setDispensed] = React.useState(0);
  const [totalServed, setTotalServed] = React.useState(0);
  const [cycle, setCycle] = React.useState(0);
  const [travelers, setTravelers] = React.useState<Traveler[]>([]);
  const [landed, setLanded] = React.useState<LandedBall[]>([]);
  const [caption, setCaption] = React.useState<"" | "restocked">("");
  const [announce, setAnnounce] = React.useState("");

  const knobRotate = useMotionValue(0);
  const knobAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const counterRef = React.useRef(0);
  const restockTimer = React.useRef<number | null>(null);
  const captionTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      knobAnim.current?.stop();
      if (restockTimer.current !== null)
        window.clearTimeout(restockTimer.current);
      if (captionTimer.current !== null)
        window.clearTimeout(captionTimer.current);
    };
  }, []);

  const handleArrive = React.useCallback((key: number, color: string) => {
    setTravelers((prev) => prev.filter((t) => t.key !== key));
    setLanded((prev) => [...prev, { key, color }].slice(-TRAY_MAX));
  }, []);

  const scheduleRestock = React.useCallback(() => {
    if (captionTimer.current !== null)
      window.clearTimeout(captionTimer.current);
    const settle = () => {
      setDispensed(0);
      setCycle((c) => c + 1);
      setCaption("restocked");
      setAnnounce("Machine restocked.");
      captionTimer.current = window.setTimeout(() => {
        captionTimer.current = null;
        setCaption("");
      }, CAPTION_MS);
    };
    if (motionSafe) {
      if (restockTimer.current !== null)
        window.clearTimeout(restockTimer.current);
      restockTimer.current = window.setTimeout(() => {
        restockTimer.current = null;
        settle();
      }, RESTOCK_DELAY_MS);
    } else {
      settle();
    }
  }, [motionSafe]);

  const handleTurnKnob = (): void => {
    if (dispensed >= cap) return;
    if (motionSafe && travelers.length >= TRANSIT_MAX) return;

    const color = COLORS[totalServed % COLORS.length] ?? COLORS[0];
    const nextDispensed = dispensed + 1;
    const nextTotal = totalServed + 1;

    setDispensed(nextDispensed);
    setTotalServed(nextTotal);
    setAnnounce(`Gumball served. ${nextTotal} total.`);
    onServe?.(color);

    knobAnim.current?.stop();
    const target = knobRotate.get() + 180;
    if (motionSafe) {
      knobAnim.current = animate(knobRotate, target, springs.snap);
    } else {
      knobRotate.set(target);
    }

    counterRef.current += 1;
    const key = counterRef.current;
    if (motionSafe) {
      setTravelers((prev) => [...prev, { key, color }]);
    } else {
      setLanded((prev) => [...prev, { key, color }].slice(-TRAY_MAX));
    }

    if (nextDispensed >= cap) scheduleRestock();
  };

  const visibleCount = cap - dispensed;

  return (
    <div className={cn("inline-flex flex-col items-center gap-3", className)}>
      <div className="relative" style={{ width: STAGE_W, height: STAGE_H }}>
        {/* Chute — drawn once, the traveler keyframes ride the same curve. */}
        <svg
          aria-hidden
          viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
          width={STAGE_W}
          height={STAGE_H}
          className="pointer-events-none absolute inset-0"
        >
          <path
            d={CHUTE_D}
            fill="none"
            stroke="color-mix(in oklab, var(--ink-3) 45%, var(--color-surface-2))"
            strokeWidth={12}
            strokeLinecap="round"
          />
          <path
            d={CHUTE_D}
            fill="none"
            stroke="color-mix(in oklab, var(--ink-3) 12%, var(--color-surface-2))"
            strokeWidth={4}
            strokeLinecap="round"
          />
        </svg>

        {/* Globe — translucent glass over the fixed cluster. */}
        <div
          aria-hidden
          className="absolute overflow-hidden rounded-full border border-hairline-strong bg-surface-2/70 shadow-raised"
          style={{
            left: GLOBE_CX - GLOBE_R,
            top: GLOBE_CY - GLOBE_R,
            width: GLOBE_R * 2,
            height: GLOBE_R * 2,
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 32% 24%, var(--primary-foreground) 0%, transparent 55%)",
              opacity: 0.25,
            }}
          />
          <AnimatePresence>
            {CLUSTER.slice(0, visibleCount).map((ball, i) => {
              const color = COLORS[i % COLORS.length] ?? COLORS[0];
              return (
                <motion.span
                  key={`${cycle}-${i}`}
                  className="absolute block rounded-full"
                  style={{
                    left: GLOBE_R + ball.x - ball.r,
                    top: GLOBE_R + ball.y - ball.r,
                    width: ball.r * 2,
                    height: ball.r * 2,
                    background: color,
                  }}
                  initial={
                    motionSafe && cycle > 0 ? { opacity: 0, scale: 0.4 } : false
                  }
                  animate={{ opacity: 1, scale: 1 }}
                  exit={
                    motionSafe
                      ? {
                          opacity: 0,
                          scale: 0.5,
                          transition: {
                            duration: durations.fast,
                            ease: easings.exit,
                          },
                        }
                      : { opacity: 0, transition: { duration: 0 } }
                  }
                  transition={
                    motionSafe
                      ? {
                          duration: durations.base,
                          ease: easings.enter,
                          delay: i * cascade(cap),
                        }
                      : { duration: 0 }
                  }
                />
              );
            })}
          </AnimatePresence>
        </div>

        {/* Base — metal-ish stand housing the knob mechanism. */}
        <div
          aria-hidden
          className="absolute rounded-3 border border-hairline-strong shadow-raised"
          style={{
            left: BASE_LEFT,
            top: BASE_TOP,
            width: BASE_W,
            height: BASE_H,
            background:
              "color-mix(in oklab, var(--ink-3) 12%, var(--color-surface-2))",
          }}
        >
          <span
            aria-hidden
            className="absolute inset-x-2 top-1.5 block h-px"
            style={{ background: "var(--hairline-strong)" }}
          />
        </div>

        {/* Knob — the one real control. */}
        <button
          type="button"
          aria-label="Turn the knob"
          onClick={handleTurnKnob}
          className={cn(
            "absolute z-10 flex cursor-pointer items-center justify-center rounded-full border border-hairline-strong bg-surface-2 shadow-raised outline-none select-none",
            "focus-visible:ring-2 focus-visible:ring-ring/60",
            !motionSafe && "active:brightness-95",
          )}
          style={{
            left: KNOB_CX - KNOB_R,
            top: KNOB_CY - KNOB_R,
            width: KNOB_R * 2,
            height: KNOB_R * 2,
          }}
        >
          <motion.span
            aria-hidden
            className="block h-[3px] w-4 rounded-full"
            style={{ background: "var(--ink-3)", rotate: knobRotate }}
          />
        </button>

        {/* Travelers — fresh mounts riding the authored chute keyframes. */}
        {motionSafe &&
          travelers.map((t) => (
            <motion.div
              key={t.key}
              aria-hidden
              className="pointer-events-none absolute top-0 left-0 z-20 rounded-full"
              style={{
                width: GUMBALL_D,
                height: GUMBALL_D,
                marginLeft: -GUMBALL_D / 2,
                marginTop: -GUMBALL_D / 2,
                background: t.color,
              }}
              initial={{ x: CHUTE_X[0], y: CHUTE_Y[0] }}
              animate={{ x: [...CHUTE_X], y: [...CHUTE_Y] }}
              transition={{
                duration: CHUTE_DURATION,
                ease: easings.move,
                times: [...CHUTE_TIMES],
              }}
              onAnimationComplete={() => handleArrive(t.key, t.color)}
            />
          ))}

        {/* Tray — landed gumballs queue up to six, oldest fading first. */}
        <div
          aria-hidden
          className="absolute rounded-3 border border-hairline bg-surface-1 shadow-raised"
          style={{
            left: TRAY_LEFT,
            top: TRAY_TOP,
            width: TRAY_W,
            height: TRAY_H,
          }}
        >
          <div className="flex h-full items-end gap-1.5 overflow-hidden px-2.5 pb-1.5">
            <AnimatePresence initial={false}>
              {landed.map((ball) => (
                <motion.span
                  key={ball.key}
                  layout
                  className="block shrink-0 rounded-full"
                  style={{
                    width: GUMBALL_D,
                    height: GUMBALL_D,
                    background: ball.color,
                  }}
                  initial={motionSafe ? { opacity: 0, y: -10 } : false}
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
                      ? {
                          y: springs.recoil,
                          opacity: {
                            duration: durations.fast,
                            ease: easings.enter,
                          },
                          layout: springs.glide,
                        }
                      : { duration: 0 }
                  }
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <span aria-hidden className="flex h-4 items-center">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={caption === "restocked" ? "restocked" : "count"}
            className="font-mono text-xs text-ink-3 tabular-nums"
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
            {caption === "restocked" ? "restocked" : `${totalServed} served`}
          </motion.span>
        </AnimatePresence>
      </span>

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
