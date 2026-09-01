"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Stage geometry, px — glass box top-left, chute and tray bottom-right. */
const STAGE_W = 256;
const STAGE_H = 224;

const BOX_LEFT = 14;
const BOX_TOP = 12;
const BOX_W = 196;
const BOX_H = 150;
const BOX_RIGHT = BOX_LEFT + BOX_W;
const BOX_BOTTOM = BOX_TOP + BOX_H;

/** The rail the trolley rides — its bounds also cap the sweep and delivery. */
const RAIL_Y = 24;
const RAIL_LEFT = 40;
const RAIL_RIGHT = 184;
const CENTER_X = (RAIL_LEFT + RAIL_RIGHT) / 2;

/** Fixed prize-bed slots — five plush, five x positions, never randomized. */
const PLUSH_X = [50, 81, 112, 143, 174] as const;
const BED_Y = 140;
const PLUSH_D = 26;
const PLUSH_R = PLUSH_D / 2;
const TRAY_PLUSH_D = 18;

/** Cable length, idle vs. bottomed out at the bed. */
const REST_DROP = 16;
const DESCEND_DROP = BED_Y - RAIL_Y;

/** Delivery stops the trolley at the rail's right bound, above the chute. */
const CHUTE_X = RAIL_RIGHT;
const CHUTE_NOTCH_LEFT = CHUTE_X - 15;
const CHUTE_D = `M${CHUTE_X},${BOX_BOTTOM - 12} C${CHUTE_X + 6},${BOX_BOTTOM - 4} ${CHUTE_X + 6},${BOX_BOTTOM + 6} ${CHUTE_X + 4},${BOX_BOTTOM + 14}`;

const TRAY_LEFT = BOX_RIGHT - 54;
const TRAY_TOP = BOX_BOTTOM + 14;
const TRAY_W = 64;
const TRAY_H = 30;

/** Pincer rest (closed) and full-open angles, degrees. */
const CLOSED_ANGLE = 4;
const OPEN_ANGLE = 34;
const FINGER_W = 4;
const FINGER_LEN = 14;
/** How far below the pivot the carried plush hangs. */
const CARRY_DROP = 18;

/** Authored timings, s / ms. */
const SWEEP_LEG_S = 1.6;
const DESCEND_S = 0.7;
const DELIVER_S = 0.6;
const GOT_ONE_MS = 900;
const RESTOCK_MS = 1100;
const REDUCED_BEAT_MS = 450;

const PINCER_FILL = "color-mix(in oklab, var(--ink-2) 65%, var(--card))";

/** Fixed token color cycle every plush draws from, position-locked. */
const PLUSH_CYCLE = [
  "color-mix(in oklab, var(--primary) 78%, var(--card))",
  "color-mix(in oklab, var(--success, #047857) 78%, var(--card))",
  "color-mix(in oklab, var(--warning, #b45309) 78%, var(--card))",
  "color-mix(in oklab, var(--ink-2) 68%, var(--card))",
] as const;

const plushColor = (index: number): string =>
  PLUSH_CYCLE[index % PLUSH_CYCLE.length] ?? PLUSH_CYCLE[0];

type Caption = "time it" | "dropping" | "got one" | "cleaned it out.";
type TrayItem = { key: number; color: string };

/**
 * Pure nearest-slot lookup — compares a frozen x against the fixed plush
 * table and returns whichever remaining slot sits closest. No physics, no
 * randomness: the machine always resolves the same catch for the same stop.
 */
function nearestIndex(x: number, bed: readonly boolean[]): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < PLUSH_X.length; i += 1) {
    if (!bed[i]) continue;
    const dist = Math.abs((PLUSH_X[i] ?? 0) - x);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

export type ClawDropProps = {
  /** Fires the instant a plush is caught, with its bed slot index (0–4). */
  onCatch?: (index: number) => void;
  className?: string;
};

/**
 * A claw machine that is honest about its odds — it always catches. A
 * trolley sweeps the rail on a slow repeating tween so timing is the whole
 * game; press the cabinet (click, Enter, or Space) and it freezes exactly
 * where it stands, the claw descends on an authored tween while its pincers
 * open, then closes on `flick` around whichever of the five bedded plush
 * sits nearest the frozen spot — a pure index lookup, never chance. The claw
 * lifts its catch, the trolley slides it to the chute, and the claw opens so
 * the plush lands in the tray with a small `recoil` bounce, joining a row
 * that empties the bed one creature at a time while a mono caption walks
 * time it, dropping, got one. Presses mid-run are ignored; once the bed is
 * bare the caption reads cleaned it out, and after a beat the machine
 * restocks on a `cascade()` stagger — every position, from plush to stop to
 * chute, comes off a fixed table, nothing simulated. Reduced motion: the
 * trolley sits centered instead of sweeping, each press just claims the
 * nearest remaining plush — cycling on as the bed thins — and it appears in
 * the tray after a short beat, with no descent, lift, or bounce animation
 * played.
 */
export function ClawDrop({
  onCatch,
  className,
}: ClawDropProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [bed, setBed] = React.useState<boolean[]>(() => [
    true,
    true,
    true,
    true,
    true,
  ]);
  const [heldIndex, setHeldIndex] = React.useState<number | null>(null);
  const [tray, setTray] = React.useState<TrayItem[]>([]);
  const [running, setRunning] = React.useState(false);
  const [caption, setCaption] = React.useState<Caption>("time it");
  const [announce, setAnnounce] = React.useState("");

  const trolleyX = useMotionValue(RAIL_LEFT);
  const cableLen = useMotionValue(REST_DROP);
  const pincerAngle = useMotionValue(CLOSED_ANGLE);
  const carryY = useTransform(cableLen, (v) => RAIL_Y + v);

  const sweepAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const trolleyAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const cableAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const pincerAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const beatTimer = React.useRef<number | null>(null);
  const captionTimer = React.useRef<number | null>(null);
  const restockTimer = React.useRef<number | null>(null);
  const catchKeyRef = React.useRef(0);

  React.useEffect(() => {
    return () => {
      sweepAnim.current?.stop();
      trolleyAnim.current?.stop();
      cableAnim.current?.stop();
      pincerAnim.current?.stop();
      if (beatTimer.current !== null) window.clearTimeout(beatTimer.current);
      if (captionTimer.current !== null)
        window.clearTimeout(captionTimer.current);
      if (restockTimer.current !== null)
        window.clearTimeout(restockTimer.current);
    };
  }, []);

  // The trolley's only idle behavior: sweep the rail while nothing is
  // running. A press stops this (see handlePress); this effect resumes it
  // once `running` drops back to false, picking up from wherever it sits.
  React.useEffect(() => {
    if (!motionSafe) {
      trolleyX.set(CENTER_X);
      return;
    }
    if (running) return;
    const from = trolleyX.get();
    const target = from <= CENTER_X ? RAIL_RIGHT : RAIL_LEFT;
    sweepAnim.current = animate(trolleyX, target, {
      duration: SWEEP_LEG_S,
      ease: easings.move,
      repeat: Infinity,
      repeatType: "mirror",
    });
    return () => {
      sweepAnim.current?.stop();
    };
  }, [motionSafe, running, trolleyX]);

  const catchPlush = (targetIndex: number) => {
    const nextBed = bed.map((present, i) =>
      i === targetIndex ? false : present,
    );
    const color = plushColor(targetIndex);

    setHeldIndex(null);
    setBed(nextBed);
    catchKeyRef.current += 1;
    setTray((prev) => [...prev, { key: catchKeyRef.current, color }]);
    onCatch?.(targetIndex);
    setCaption("got one");
    setAnnounce(`Caught one. ${tray.length + 1} in the tray.`);

    if (motionSafe) {
      pincerAnim.current?.stop();
      pincerAnim.current = animate(pincerAngle, CLOSED_ANGLE, springs.snap);
    }

    captionTimer.current = window.setTimeout(() => {
      captionTimer.current = null;
      finishRun(nextBed);
    }, GOT_ONE_MS);
  };

  const finishRun = (bedAfterCatch: readonly boolean[]) => {
    if (bedAfterCatch.every((present) => !present)) {
      setCaption("cleaned it out.");
      setAnnounce("Bed cleared. Restocking.");
      restockTimer.current = window.setTimeout(() => {
        restockTimer.current = null;
        setBed([true, true, true, true, true]);
        setTray([]);
        setCaption("time it");
        setRunning(false);
      }, RESTOCK_MS);
    } else {
      setCaption("time it");
      setRunning(false);
    }
  };

  const release = (targetIndex: number) => {
    pincerAnim.current?.stop();
    pincerAnim.current = animate(pincerAngle, OPEN_ANGLE, {
      duration: durations.base,
      ease: easings.enter,
      onComplete: () => catchPlush(targetIndex),
    });
  };

  const deliver = (targetIndex: number) => {
    trolleyAnim.current?.stop();
    trolleyAnim.current = animate(trolleyX, CHUTE_X, {
      duration: DELIVER_S,
      ease: easings.move,
      onComplete: () => release(targetIndex),
    });
  };

  const lift = (targetIndex: number) => {
    cableAnim.current?.stop();
    cableAnim.current = animate(cableLen, REST_DROP, {
      ...springs.glide,
      onComplete: () => deliver(targetIndex),
    });
  };

  const grab = (targetIndex: number) => {
    setHeldIndex(targetIndex);
    pincerAnim.current?.stop();
    pincerAnim.current = animate(pincerAngle, CLOSED_ANGLE, {
      ...springs.flick,
      onComplete: () => lift(targetIndex),
    });
  };

  const descend = (targetIndex: number) => {
    cableAnim.current?.stop();
    pincerAnim.current?.stop();
    cableAnim.current = animate(cableLen, DESCEND_DROP, {
      duration: DESCEND_S,
      ease: easings.move,
    });
    pincerAnim.current = animate(pincerAngle, OPEN_ANGLE, {
      duration: DESCEND_S,
      ease: easings.move,
      onComplete: () => grab(targetIndex),
    });
  };

  const handlePress = () => {
    if (running) return;
    if (!bed.some(Boolean)) return;

    // Freeze the sweep exactly where it stands: read it, stop it, set it.
    const frozenX = trolleyX.get();
    sweepAnim.current?.stop();
    trolleyX.set(frozenX);

    if (!motionSafe) {
      const targetIndex = nearestIndex(CENTER_X, bed);
      if (targetIndex === null) return;
      setRunning(true);
      setCaption("dropping");
      beatTimer.current = window.setTimeout(() => {
        beatTimer.current = null;
        catchPlush(targetIndex);
      }, REDUCED_BEAT_MS);
      return;
    }

    const targetIndex = nearestIndex(frozenX, bed);
    if (targetIndex === null) return;
    setRunning(true);
    setCaption("dropping");
    descend(targetIndex);
  };

  return (
    <div className={cn("inline-flex flex-col items-center gap-3", className)}>
      {/* The cabinet is the whole control — no separate "move" button, the
          continuous sweep itself is the affordance that invites a press. */}
      <button
        type="button"
        aria-label="Drop the claw"
        onClick={handlePress}
        className={cn(
          "relative block cursor-pointer touch-manipulation rounded-4 border border-hairline-strong bg-surface-1 p-3 shadow-raised outline-none select-none",
          "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
          !motionSafe && "active:brightness-95",
        )}
      >
        <span
          aria-hidden
          className="relative block"
          style={{ width: STAGE_W, height: STAGE_H }}
        >
          {/* Glass cabinet box. */}
          <span
            aria-hidden
            className="absolute rounded-4 border border-hairline-strong bg-surface-2/55"
            style={{
              left: BOX_LEFT,
              top: BOX_TOP,
              width: BOX_W,
              height: BOX_H,
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-4"
              style={{
                background:
                  "radial-gradient(circle at 26% 18%, var(--primary-foreground) 0%, transparent 55%)",
                opacity: 0.18,
              }}
            />
          </span>

          {/* Bed floor line. */}
          <span
            aria-hidden
            className="absolute h-px"
            style={{
              left: BOX_LEFT + 10,
              top: BED_Y + PLUSH_R + 4,
              width: BOX_W - 20,
              background: "var(--hairline-strong)",
            }}
          />

          {/* Chute notch and its drawn drop to the tray. */}
          <span
            aria-hidden
            className="absolute rounded-b-2"
            style={{
              left: CHUTE_NOTCH_LEFT,
              top: BOX_BOTTOM - 12,
              width: 30,
              height: 12,
              background:
                "color-mix(in oklab, var(--ink-3) 32%, var(--color-surface-2))",
            }}
          />
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
              stroke="color-mix(in oklab, var(--ink-3) 40%, var(--color-surface-2))"
              strokeWidth={8}
              strokeLinecap="round"
            />
          </svg>

          {/* Rail. */}
          <span
            aria-hidden
            className="absolute rounded-full"
            style={{
              left: RAIL_LEFT - 6,
              top: RAIL_Y - 1,
              width: RAIL_RIGHT - RAIL_LEFT + 12,
              height: 2,
              background: "var(--hairline-strong)",
            }}
          />

          {/* Prize bed — five fixed slots, declared from state, no per-item hooks. */}
          <AnimatePresence initial={false}>
            {PLUSH_X.map((x, i) => {
              const visible = (bed[i] ?? false) && heldIndex !== i;
              if (!visible) return null;
              return (
                <motion.span
                  key={i}
                  className="absolute"
                  style={{
                    left: x,
                    top: BED_Y,
                    marginLeft: -PLUSH_R,
                    marginTop: -PLUSH_R,
                  }}
                  initial={motionSafe ? { opacity: 0, scale: 0.5 } : false}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={
                    motionSafe
                      ? {
                          opacity: 0,
                          y: -6,
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
                          delay: i * cascade(PLUSH_X.length),
                        }
                      : { duration: 0 }
                  }
                >
                  <Plush color={plushColor(i)} />
                </motion.span>
              );
            })}
          </AnimatePresence>

          {/* Carriage — trolley, cable, claw, and any carried plush share
              trolleyX; only the claw group also carries cableLen's y. */}
          <motion.div className="absolute top-0 left-0" style={{ x: trolleyX }}>
            <span
              aria-hidden
              className="absolute rounded-1 border border-hairline-strong bg-surface-2 shadow-raised"
              style={{
                left: 0,
                top: RAIL_Y - 5,
                marginLeft: -10,
                width: 20,
                height: 10,
              }}
            />
            <motion.span
              aria-hidden
              className="absolute rounded-full"
              style={{
                left: 0,
                top: RAIL_Y,
                marginLeft: -1,
                width: 2,
                height: cableLen,
                background: "var(--ink-3)",
              }}
            />
            <motion.div className="absolute top-0 left-0" style={{ y: carryY }}>
              <ClawGraphic pincerAngle={pincerAngle} />
              <AnimatePresence>
                {heldIndex !== null && (
                  <motion.span
                    key={heldIndex}
                    className="absolute"
                    style={{
                      left: 0,
                      top: 0,
                      marginLeft: -PLUSH_R,
                      marginTop: CARRY_DROP,
                    }}
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={
                      motionSafe
                        ? { duration: durations.fast, ease: easings.enter }
                        : { duration: 0 }
                    }
                  >
                    <Plush color={plushColor(heldIndex)} />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>

          {/* Tray — caught plush queue here, up to five, the bed's own count. */}
          <span
            aria-hidden
            className="absolute rounded-3 border border-hairline bg-surface-1 shadow-raised"
            style={{
              left: TRAY_LEFT,
              top: TRAY_TOP,
              width: TRAY_W,
              height: TRAY_H,
            }}
          >
            <span className="flex h-full items-end gap-1 overflow-hidden px-2 pb-1">
              <AnimatePresence initial={false}>
                {tray.map((item) => (
                  <motion.span
                    key={item.key}
                    layout
                    className="block shrink-0"
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
                            opacity: {
                              duration: durations.fast,
                              ease: easings.enter,
                            },
                            y: springs.recoil,
                            layout: springs.glide,
                          }
                        : { duration: 0 }
                    }
                  >
                    <Plush color={item.color} size={TRAY_PLUSH_D} />
                  </motion.span>
                ))}
              </AnimatePresence>
            </span>
          </span>
        </span>
      </button>

      <span aria-hidden className="flex h-4 items-center">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={caption}
            className="text-label text-ink-3"
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
            {caption}
          </motion.span>
        </AnimatePresence>
      </span>
      <span aria-hidden className="font-mono text-xs text-ink-3 tabular-nums">
        {tray.length} in the tray
      </span>

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}

/** Two mirrored pincers hinged at one pivot, sharing a single angle value. */
function ClawGraphic({ pincerAngle }: { pincerAngle: MotionValue<number> }) {
  return (
    <span aria-hidden className="absolute block" style={{ left: 0, top: 0 }}>
      <span
        className="absolute rounded-full"
        style={{
          left: -2,
          top: -3,
          width: 4,
          height: 4,
          background: "var(--ink-3)",
        }}
      />
      <motion.span
        className="absolute rounded-full"
        style={{
          left: 0,
          top: 0,
          marginLeft: 1,
          width: FINGER_W,
          height: FINGER_LEN,
          background: PINCER_FILL,
          transformOrigin: "50% 0%",
          rotate: pincerAngle,
        }}
      />
      <span
        className="absolute"
        style={{ left: 0, top: 0, transform: "scaleX(-1)" }}
      >
        <motion.span
          className="absolute rounded-full"
          style={{
            left: 0,
            top: 0,
            marginLeft: 1,
            width: FINGER_W,
            height: FINGER_LEN,
            background: PINCER_FILL,
            transformOrigin: "50% 0%",
            rotate: pincerAngle,
          }}
        />
      </span>
    </span>
  );
}

/** A simple rounded creature silhouette: body, two ear nubs, two dot eyes. */
function Plush({ color, size = PLUSH_D }: { color: string; size?: number }) {
  const ear = size * 0.34;
  const eye = Math.max(2, size * 0.11);
  return (
    <span className="relative block" style={{ width: size, height: size }}>
      <span
        className="absolute rounded-full"
        style={{
          left: size * 0.08,
          top: -ear * 0.4,
          width: ear,
          height: ear,
          background: color,
        }}
      />
      <span
        className="absolute rounded-full"
        style={{
          right: size * 0.08,
          top: -ear * 0.4,
          width: ear,
          height: ear,
          background: color,
        }}
      />
      <span
        className="absolute inset-0 rounded-full border border-hairline-strong shadow-raised"
        style={{ background: color }}
      />
      <span
        className="absolute rounded-full"
        style={{
          left: "30%",
          top: "40%",
          width: eye,
          height: eye,
          background: "var(--ink)",
        }}
      />
      <span
        className="absolute rounded-full"
        style={{
          right: "30%",
          top: "40%",
          width: eye,
          height: eye,
          background: "var(--ink)",
        }}
      />
    </span>
  );
}
