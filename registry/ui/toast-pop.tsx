"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** SVG ids must survive url(#…) parsing — strip useId's sigil characters. */
const safeId = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, "_");

/** Toasting duration users may dial in, in seconds. */
const MIN_SECONDS = 1;
const MAX_SECONDS = 6;

/** How long before the pop the toaster gives its anticipatory shudder, and
 *  how long that shudder lasts, both in ms/seconds respectively. */
const SHUDDER_LEAD_MS = 160;
const SHUDDER_DURATION = 0.12;

/** Stage geometry — hand-set so the slot, lever, and dial all line up. */
const STAGE_W = 172;
const STAGE_H = 176;

const SHELL_W = 144;
const SHELL_H = 92;
const SHELL_RADIUS = 14;
const SHELL_LEFT = 14;
const SHELL_TOP = 74;

/** The slot is a deep cavity (not just a seam) so sunk bread reads as hidden
 *  inside the case rather than floating in front of it. */
const HOLE_W = 92;
const HOLE_H = 56;
const HOLE_X = (SHELL_W - HOLE_W) / 2;
const HOLE_Y = 6;
const HOLE_LEFT = SHELL_LEFT + HOLE_X;
const HOLE_TOP = SHELL_TOP + HOLE_Y;

const BREAD_W = 64;
const BREAD_H = 54;
const BREAD_LEFT = (STAGE_W - BREAD_W) / 2;
const BREAD_TOP = 40;

/** Bread travel, in px — sink into the slot, leap out, settle askew. */
const BREAD_SUNK_Y = 40;
const BREAD_PEAK_Y = -76;
const BREAD_REST_Y = -34;
const BREAD_REST_ROTATE = -7;

/** Lever geometry and travel, in px. */
const LEVER_LEFT = 146;
const LEVER_TOP = 80;
const LEVER_W = 24;
const LEVER_H = 54;
const LEVER_THUMB_W = 14;
const LEVER_THUMB_H = 20;
const LEVER_DOWN_Y = 20;

/** Browning dial — decorative, fixed, never moves on its own. */
const DIAL_LEFT = SHELL_LEFT + 16;
const DIAL_TOP = SHELL_TOP + 66;
const DIAL_SIZE = 16;

/** Where crumbs fly from — roughly the slot mouth the toast just cleared. */
const CRUMB_ANCHOR_X = STAGE_W / 2;
const CRUMB_ANCHOR_Y = HOLE_TOP;

/** Bread browns from a pale raw crumb toward a deep toasted crust. */
const RAW_MIX = 14;
const TOASTED_MIX = 64;

const SHELL = "var(--color-surface-2)";
const SLOT_DARK =
  "color-mix(in oklab, var(--ink-3) 45%, var(--color-surface-0))";
const CRUST = "color-mix(in oklab, var(--warning, #b45309) 65%, var(--ink-3))";
const CRUMB_FILL =
  "color-mix(in oklab, var(--warning, #b45309) 50%, var(--ink-3))";

/** Fixed topping cycle — butter, jam, honey, forever in that order. */
const TOPPINGS = [
  {
    label: "butter",
    fill: "color-mix(in oklab, var(--warning, #b45309) 22%, var(--card))",
    w: 22,
    h: 12,
    radius: "3px 3px 7px 7px",
    rotate: 0,
  },
  {
    label: "jam",
    fill: "color-mix(in oklab, var(--danger) 58%, var(--card))",
    w: 20,
    h: 16,
    radius: "60% 40% 55% 45%",
    rotate: 0,
  },
  {
    label: "honey",
    fill: "color-mix(in oklab, var(--warning, #b45309) 80%, var(--card))",
    w: 27,
    h: 9,
    radius: "50%",
    rotate: -12,
  },
] as const;

type Topping = (typeof TOPPINGS)[number];

/** Three fixed crumb flecks, thrown from the slot mouth as the toast leaps. */
const CRUMBS = [
  { dx: -18, dy: 10, lift: 14, rot: -130, w: 5, h: 3 },
  { dx: 3, dy: 14, lift: 18, rot: 90, w: 4, h: 3 },
  { dx: 19, dy: 8, lift: 12, rot: -95, w: 5, h: 2.5 },
] as const;

/** Caption per phase — the whole story in three beats. */
const CAPTIONS = {
  idle: "push the lever",
  toasting: "toasting…",
  popped: "breakfast.",
} as const;

type ToastPhase = "idle" | "toasting" | "popped";

export type ToastPopProps = {
  /** Seconds the toast takes to finish. Clamped to 1–6. @default 2.4 */
  toastSeconds?: number;
  /** Fires the instant the toast pops, with the topping that landed. */
  onPop?: (topping: string) => void;
  className?: string;
};

/**
 * A toaster that makes you wait for it. Push the lever — a real button — and
 * it slides down and latches on `flick` while the bread sinks into the slot
 * on `glide`; a warm glow builds inside the slot and the crust browns to
 * match, right up to one small anticipatory shudder just before it is done.
 * Then the lever springs back, the toast leaps clear of the slot on `recoil`
 * and lands askew with a few crumbs flung loose, and a beat later a stamp of
 * butter, jam, or honey — cycling in that fixed order — thunks down from
 * one-and-a-half scale on `flick`. A mono caption keeps pace: push the
 * lever, toasting…, breakfast. Pushing the lever again slides the toast back
 * into the slot so the whole ritual can rerun, and every crumb vector and
 * topping is a fixed table — nothing here rolls dice. Reduced motion: skips
 * the glow ramp, the shudder, and the leap — the toast simply appears above
 * the slot already browned with its topping on, timed by `toastSeconds`,
 * while the caption keeps cycling.
 */
export function ToastPop({
  toastSeconds = 2.4,
  onPop,
  className,
}: ToastPopProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const seconds = Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, toastSeconds));
  const maskId = `${safeId(React.useId())}-toast-slot`;

  const [phase, setPhase] = React.useState<ToastPhase>("idle");
  const [currentTopping, setCurrentTopping] = React.useState<Topping | null>(
    null,
  );
  const nextToppingIndex = React.useRef(0);

  // Imperative motion values so a press can chain set-peak/animate-to-rest
  // springs, and so the toasting ramp can run as one plain tween.
  const leverY = useMotionValue(0);
  const breadY = useMotionValue(0);
  const breadRotate = useMotionValue(0);
  const shudderX = useMotionValue(0);
  const toastProgress = useMotionValue(0);

  const breadBackground = useTransform(
    toastProgress,
    (v) =>
      `color-mix(in oklab, var(--warning, #b45309) ${RAW_MIX + v * (TOASTED_MIX - RAW_MIX)}%, var(--card))`,
  );

  const leverAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const breadYAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const breadRotateAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const progressAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const shudderAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const shudderTimer = React.useRef<number | null>(null);
  const popTimer = React.useRef<number | null>(null);

  const clearTimers = () => {
    if (shudderTimer.current !== null)
      window.clearTimeout(shudderTimer.current);
    if (popTimer.current !== null) window.clearTimeout(popTimer.current);
    shudderTimer.current = null;
    popTimer.current = null;
  };

  React.useEffect(() => {
    return () => {
      clearTimers();
      leverAnim.current?.stop();
      breadYAnim.current?.stop();
      breadRotateAnim.current?.stop();
      progressAnim.current?.stop();
      shudderAnim.current?.stop();
    };
  }, []);

  const finishPop = () => {
    const topping = TOPPINGS[nextToppingIndex.current] ?? TOPPINGS[0];
    nextToppingIndex.current = (nextToppingIndex.current + 1) % TOPPINGS.length;
    setCurrentTopping(topping);
    setPhase("popped");
    onPop?.(topping.label);

    if (motionSafe) {
      leverAnim.current?.stop();
      leverAnim.current = animate(leverY, 0, springs.snap);

      toastProgress.set(1);

      breadYAnim.current?.stop();
      breadRotateAnim.current?.stop();
      breadY.set(BREAD_PEAK_Y);
      breadYAnim.current = animate(breadY, BREAD_REST_Y, springs.recoil);
      breadRotateAnim.current = animate(
        breadRotate,
        BREAD_REST_ROTATE,
        springs.recoil,
      );
    } else {
      leverY.set(0);
      toastProgress.set(1);
      breadY.set(BREAD_REST_Y);
      breadRotate.set(BREAD_REST_ROTATE);
    }
  };

  const handleLever = () => {
    if (phase === "toasting") return; // Ignore clicks while toasting.

    if (phase === "popped") {
      // Reset: slide the toast back into the slot for another round.
      setPhase("idle");
      setCurrentTopping(null);
      progressAnim.current?.stop();
      toastProgress.set(0);
      breadYAnim.current?.stop();
      breadRotateAnim.current?.stop();
      if (motionSafe) {
        breadYAnim.current = animate(breadY, 0, springs.glide);
        breadRotateAnim.current = animate(breadRotate, 0, springs.glide);
      } else {
        breadY.set(0);
        breadRotate.set(0);
      }
      return;
    }

    // idle -> toasting
    setPhase("toasting");
    clearTimers();

    if (motionSafe) {
      shudderX.set(0);
      leverAnim.current?.stop();
      leverAnim.current = animate(leverY, LEVER_DOWN_Y, springs.flick);

      breadYAnim.current?.stop();
      breadYAnim.current = animate(breadY, BREAD_SUNK_Y, springs.glide);

      progressAnim.current?.stop();
      toastProgress.set(0);
      progressAnim.current = animate(toastProgress, 1, {
        duration: seconds,
        ease: easings.move,
      });

      shudderTimer.current = window.setTimeout(
        () => {
          shudderAnim.current?.stop();
          shudderAnim.current = animate(shudderX, [0, -2.2, 0], {
            duration: SHUDDER_DURATION,
            ease: easings.move,
            times: [0, 0.5, 1],
          });
        },
        Math.max(0, seconds * 1000 - SHUDDER_LEAD_MS),
      );

      popTimer.current = window.setTimeout(finishPop, seconds * 1000);
    } else {
      leverY.set(LEVER_DOWN_Y);
      popTimer.current = window.setTimeout(finishPop, seconds * 1000);
    }
  };

  const liveMessage =
    phase === "toasting"
      ? "Toasting"
      : phase === "popped" && currentTopping
        ? `Toast popped with ${currentTopping.label}`
        : "";

  return (
    <div className={cn("inline-flex flex-col items-center gap-3", className)}>
      <div className="relative" style={{ width: STAGE_W, height: STAGE_H }}>
        <motion.div className="absolute inset-0" style={{ x: shudderX }}>
          {/* Dark cavity behind the slot — gives the sunk bread somewhere
              to disappear into. */}
          <span
            aria-hidden
            className="absolute rounded-1"
            style={{
              left: HOLE_LEFT,
              top: HOLE_TOP,
              width: HOLE_W,
              height: HOLE_H,
              background: SLOT_DARK,
            }}
          />

          {/* Warm glow: ramps opacity in step with toastProgress while
              mounted, and fades out on its own tween the instant toasting
              ends — independent of whatever the ramp reached. */}
          <AnimatePresence>
            {motionSafe && phase === "toasting" && (
              <motion.span
                key="glow"
                aria-hidden
                className="absolute overflow-hidden rounded-1"
                style={{
                  left: HOLE_LEFT + 3,
                  top: HOLE_TOP + 3,
                  width: HOLE_W - 6,
                  height: HOLE_H - 6,
                }}
                initial={{ opacity: 1 }}
                animate={{ opacity: 1 }}
                exit={{
                  opacity: 0,
                  transition: { duration: durations.base, ease: easings.exit },
                }}
              >
                <motion.span
                  className="absolute inset-0"
                  style={{
                    background: "var(--warning, #b45309)",
                    opacity: toastProgress,
                  }}
                />
              </motion.span>
            )}
          </AnimatePresence>

          {/* The toast: browns permanently via toastProgress, travels via
              breadY/breadRotate, and carries whatever topping just landed. */}
          <motion.div
            aria-hidden
            className="absolute"
            style={{
              left: BREAD_LEFT,
              top: BREAD_TOP,
              width: BREAD_W,
              height: BREAD_H,
              y: breadY,
              rotate: breadRotate,
            }}
          >
            <motion.span
              className="absolute inset-0"
              style={{
                background: breadBackground,
                borderRadius: "38% 38% 10% 10%",
                border: `1.5px solid ${CRUST}`,
              }}
            />
            <AnimatePresence>
              {phase === "popped" && currentTopping && (
                <motion.span
                  key={currentTopping.label}
                  className="absolute top-[28%]"
                  style={{
                    left: (BREAD_W - currentTopping.w) / 2,
                    width: currentTopping.w,
                    height: currentTopping.h,
                    borderRadius: currentTopping.radius,
                    background: currentTopping.fill,
                    rotate: currentTopping.rotate,
                  }}
                  initial={motionSafe ? { scale: 1.5, opacity: 0 } : false}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{
                    opacity: 0,
                    scale: 0.85,
                    transition: {
                      duration: durations.fast,
                      ease: easings.exit,
                    },
                  }}
                  transition={
                    motionSafe
                      ? { ...springs.flick, delay: 0.35 }
                      : { duration: 0 }
                  }
                />
              )}
            </AnimatePresence>
          </motion.div>

          {/* Crumbs, flung from the slot mouth once the toast has popped. */}
          {motionSafe && (
            <AnimatePresence>
              {phase === "popped" && (
                <motion.span
                  key="crumbs"
                  aria-hidden
                  className="pointer-events-none absolute"
                  style={{ left: CRUMB_ANCHOR_X, top: CRUMB_ANCHOR_Y }}
                  exit={{
                    opacity: 0,
                    transition: { duration: durations.blink },
                  }}
                >
                  {CRUMBS.map((crumb, i) => (
                    <motion.span
                      key={i}
                      className="absolute top-0 left-0"
                      style={{
                        width: crumb.w,
                        height: crumb.h,
                        marginLeft: -crumb.w / 2,
                        marginTop: -crumb.h / 2,
                        background: CRUMB_FILL,
                        borderRadius: "40% 60% 55% 45%",
                      }}
                      initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                      animate={{
                        x: [0, crumb.dx * 0.6, crumb.dx],
                        y: [0, -crumb.lift, crumb.dy],
                        rotate: [0, crumb.rot * 0.6, crumb.rot],
                        opacity: [1, 1, 0],
                      }}
                      transition={{
                        duration: durations.slow,
                        ease: easings.exit,
                        times: [0, 0.45, 1],
                      }}
                    />
                  ))}
                </motion.span>
              )}
            </AnimatePresence>
          )}

          {/* Toaster shell, cut with a slot-shaped hole so the case itself
              occludes the bread once it sinks past the mouth. */}
          <svg
            viewBox={`0 0 ${SHELL_W} ${SHELL_H}`}
            width={SHELL_W}
            height={SHELL_H}
            aria-hidden
            className="absolute"
            style={{ left: SHELL_LEFT, top: SHELL_TOP }}
          >
            <defs>
              <mask
                id={maskId}
                maskUnits="userSpaceOnUse"
                x="0"
                y="0"
                width={SHELL_W}
                height={SHELL_H}
              >
                <rect
                  width={SHELL_W}
                  height={SHELL_H}
                  rx={SHELL_RADIUS}
                  fill="white"
                />
                <rect
                  x={HOLE_X}
                  y={HOLE_Y}
                  width={HOLE_W}
                  height={HOLE_H}
                  rx={6}
                  fill="black"
                />
              </mask>
            </defs>
            <rect
              width={SHELL_W}
              height={SHELL_H}
              rx={SHELL_RADIUS}
              fill={SHELL}
              stroke="var(--hairline-strong)"
              strokeWidth={1.25}
              mask={`url(#${maskId})`}
            />
            <rect
              x={10}
              y={5}
              width={SHELL_W - 20}
              height={2}
              rx={1}
              fill="var(--hairline-strong)"
              opacity={0.6}
              mask={`url(#${maskId})`}
            />
          </svg>

          {/* Browning dial — a fixed, decorative knob. */}
          <span
            aria-hidden
            className="absolute rounded-full border border-hairline-strong"
            style={{
              left: DIAL_LEFT,
              top: DIAL_TOP,
              width: DIAL_SIZE,
              height: DIAL_SIZE,
              background: "var(--color-surface-1)",
            }}
          >
            <span
              aria-hidden
              className="absolute top-0.5 left-1/2 block h-1.5 w-px"
              style={{
                background: "var(--ink-3)",
                transform: "translateX(-50%) rotate(-25deg)",
                transformOrigin: "50% 250%",
              }}
            />
          </span>

          {/* The lever — the one real control. */}
          <button
            type="button"
            aria-label="Push the toaster lever"
            onClick={handleLever}
            className={cn(
              "absolute flex items-start justify-center rounded-2 outline-none select-none",
              "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
              !motionSafe && "active:brightness-95",
            )}
            style={{
              left: LEVER_LEFT,
              top: LEVER_TOP,
              width: LEVER_W,
              height: LEVER_H,
            }}
          >
            <span
              aria-hidden
              className="block rounded-full border border-hairline-strong"
              style={{
                width: 10,
                height: LEVER_H,
                background: "var(--color-surface-1)",
              }}
            />
            <motion.span
              aria-hidden
              className="absolute top-0 block rounded-2 border border-hairline-strong shadow-raised"
              style={{
                left: (LEVER_W - LEVER_THUMB_W) / 2,
                width: LEVER_THUMB_W,
                height: LEVER_THUMB_H,
                background: "var(--color-surface-2)",
                y: leverY,
              }}
            />
          </button>
        </motion.div>
      </div>

      <div aria-hidden className="flex h-4 items-center">
        <motion.span
          key={phase}
          className="text-label text-ink-3 normal-case"
          initial={motionSafe ? { opacity: 0, y: distances.nudge } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={
            motionSafe
              ? { duration: durations.base, ease: easings.enter }
              : { duration: 0 }
          }
        >
          {CAPTIONS[phase]}
        </motion.span>
      </div>

      <span aria-live="polite" className="sr-only">
        {liveMessage}
      </span>
    </div>
  );
}
