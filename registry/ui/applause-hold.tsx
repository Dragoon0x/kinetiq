"use client";

import * as React from "react";

import { Hand } from "lucide-react";
import { animate, motion, useMotionValue } from "motion/react";
import type { Transition } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const TAU = Math.PI * 2;

/** Clap-to-clap gaps in ms — the crescendo steps down this ladder. */
const CLAP_INTERVALS_MS = [420, 340, 260, 190, 150] as const;

/** Hold time per ladder step: every ~800ms the interval tightens a notch. */
const STEP_EVERY_MS = 800;

/** Every Nth clap lands an impact fleck at the meeting point. */
const TICK_EVERY = 3;

/** Reduced motion fills the meter in this many instant steps. */
const REDUCED_FILL_STEPS = 8;

/** Seconds a full meter takes to drain after release. */
const DRAIN_S = 2;

/**
 * Palm poses, mirrored across the button center: `x` in px away from the
 * midline, `rot` in degrees of outward tilt. The left hand takes the negated
 * values, so a clap is both palms driving toward zero.
 */
const POSE = {
  apart: { x: 3.5, rot: 26 },
  together: { x: -2.5, rot: 6 },
} as const;

/**
 * Six fixed flecks thrown once at ovation — evenly spaced from twelve
 * o'clock, precomputed so every burst is identical and SSR-safe.
 */
const BURST_FLECKS = Array.from({ length: 6 }, (_, i) => {
  const angle = (i / 6) * TAU - TAU / 4;
  return {
    dx: Math.cos(angle) * 40,
    dy: Math.sin(angle) * 40,
    deg: (angle / TAU) * 360,
  };
});

type Phase = "idle" | "applauding" | "ovation";

export type ApplauseHoldProps = {
  /** Seconds of continuous hold before the ovation lands. */
  ovationAfter?: number;
  /** Fired once each time the meter reaches full. */
  onOvation?: () => void;
  className?: string;
};

/**
 * Press-and-hold applause that builds. While the round button is held —
 * pointer, Space, or Enter — the two palms clap on a fixed cycle that
 * tightens in steps the longer the hold, every third clap landing a small
 * impact fleck, while the thin meter beside fills in proportion to hold
 * time. At full (default 4s) the state tips into ovation: the border glows,
 * six fixed flecks burst once, the caption flips to standing ovation, and
 * further holding just sustains the fast claps. Release stops the claps,
 * settles the hands apart, and drains the meter over ~2s — if it reaches
 * zero the caption returns to hold to applaud. Reduced motion: no clap
 * animation — while held the meter fills as a stepped instant bar and a
 * static clap count ticks in mono text; ovation still swaps the glow on.
 */
export function ApplauseHold({
  ovationAfter = 4,
  onOvation,
  className,
}: ApplauseHoldProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [phase, setPhase] = React.useState<Phase>("idle");
  const [clapCount, setClapCount] = React.useState(0);
  // A fresh key per ovation mounts a fresh burst (and replays it).
  const [burst, setBurst] = React.useState(0);

  // Meter fill, 0..1 — animated upward while held, drained on release. In
  // reduced motion it is jumped in steps instead of animated.
  const fill = useMotionValue(0);

  // Palm transforms, driven imperatively so each clap can chain
  // together-then-apart on `flick` without re-rendering per beat.
  const lx = useMotionValue<number>(-POSE.apart.x);
  const lrot = useMotionValue<number>(-POSE.apart.rot);
  const rx = useMotionValue<number>(POSE.apart.x);
  const rrot = useMotionValue<number>(POSE.apart.rot);

  // The hold engine lives in refs: timer chains and animations started by
  // the press handler, torn down on release and unmount.
  const heldRef = React.useRef(false);
  const stepRef = React.useRef(0);
  const phaseRef = React.useRef<Phase>("idle");
  const clapTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const fillTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const fillAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const drainAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const handAnims = React.useRef<Array<ReturnType<typeof animate>>>([]);

  // Latest-ref mirrors, so timer callbacks started at press time never act
  // on a stale preference or callback.
  const motionSafeRef = React.useRef(motionSafe);
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  }, [motionSafe]);
  const onOvationRef = React.useRef(onOvation);
  React.useEffect(() => {
    onOvationRef.current = onOvation;
  }, [onOvation]);

  const setPhaseBoth = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const stopHandAnims = () => {
    for (const a of handAnims.current) a.stop();
    handAnims.current = [];
  };

  const poseHands = (
    pose: { x: number; rot: number },
    transition: Transition,
    onDone?: () => void,
  ) => {
    stopHandAnims();
    handAnims.current = [
      animate(lx, -pose.x, transition),
      animate(lrot, -pose.rot, transition),
      animate(rx, pose.x, transition),
      animate(rrot, pose.rot, { ...transition, onComplete: onDone }),
    ];
  };

  /** One clap: palms drive together on `flick`, then release back apart. */
  const playClap = () => {
    poseHands(POSE.together, springs.flick, () => {
      poseHands(POSE.apart, springs.flick);
    });
  };

  const settleHands = () => {
    poseHands(POSE.apart, springs.glide);
  };

  const doClap = () => {
    setClapCount((c) => c + 1);
    if (motionSafeRef.current) playClap();
  };

  /** Fixed-interval clap chain — each beat reads the current ladder step. */
  const scheduleClap = () => {
    const interval =
      CLAP_INTERVALS_MS[
        Math.min(stepRef.current, CLAP_INTERVALS_MS.length - 1)
      ] ?? CLAP_INTERVALS_MS[0];
    clapTimer.current = setTimeout(() => {
      doClap();
      scheduleClap();
    }, interval);
  };

  /** Tightens the clap interval one notch per STEP_EVERY_MS of hold. */
  const scheduleStep = () => {
    stepTimer.current = setTimeout(() => {
      stepRef.current += 1;
      if (stepRef.current < CLAP_INTERVALS_MS.length - 1) scheduleStep();
    }, STEP_EVERY_MS);
  };

  const enterOvation = () => {
    if (phaseRef.current === "ovation") return;
    setPhaseBoth("ovation");
    setBurst((b) => b + 1);
    onOvationRef.current?.();
  };

  /** Reduced-motion meter: jump the fill a fixed step at a time. */
  const scheduleFillStep = (targetS: number) => {
    fillTimer.current = setTimeout(
      () => {
        const next = Math.min(1, fill.get() + 1 / REDUCED_FILL_STEPS);
        fill.jump(next);
        if (next >= 1) enterOvation();
        else scheduleFillStep(targetS);
      },
      (targetS / REDUCED_FILL_STEPS) * 1000,
    );
  };

  const clearTimers = () => {
    if (clapTimer.current) clearTimeout(clapTimer.current);
    if (stepTimer.current) clearTimeout(stepTimer.current);
    if (fillTimer.current) clearTimeout(fillTimer.current);
    clapTimer.current = null;
    stepTimer.current = null;
    fillTimer.current = null;
  };

  const settleIdle = () => {
    setPhaseBoth("idle");
    setClapCount(0);
  };

  const pressStart = () => {
    if (heldRef.current) return;
    heldRef.current = true;
    drainAnim.current?.stop();
    fillAnim.current?.stop();
    if (fill.get() <= 0) setClapCount(0);
    if (phaseRef.current !== "ovation") setPhaseBoth("applauding");
    stepRef.current = 0;
    doClap();
    scheduleClap();
    scheduleStep();

    const target = Math.max(0.5, ovationAfter);
    if (motionSafeRef.current) {
      const remaining = (1 - fill.get()) * target;
      if (remaining <= 0) return;
      // Linear on purpose: the fill is a clock, proportional to hold time.
      fillAnim.current = animate(fill, 1, {
        duration: remaining,
        ease: easings.linear,
        onComplete: enterOvation,
      });
    } else {
      scheduleFillStep(target);
    }
  };

  const pressEnd = () => {
    if (!heldRef.current) return;
    heldRef.current = false;
    clearTimers();
    fillAnim.current?.stop();
    if (motionSafeRef.current) {
      settleHands();
      const level = fill.get();
      if (level > 0) {
        drainAnim.current = animate(fill, 0, {
          duration: DRAIN_S * level,
          ease: easings.exit,
          onComplete: settleIdle,
        });
      } else {
        settleIdle();
      }
    } else {
      fill.jump(0);
      settleIdle();
    }
  };

  // Unmount teardown — timers cleared, every in-flight animation stopped.
  React.useEffect(() => {
    return () => {
      if (clapTimer.current) clearTimeout(clapTimer.current);
      if (stepTimer.current) clearTimeout(stepTimer.current);
      if (fillTimer.current) clearTimeout(fillTimer.current);
      fillAnim.current?.stop();
      drainAnim.current?.stop();
      for (const a of handAnims.current) a.stop();
    };
  }, []);

  const isOvation = phase === "ovation";
  const tickCount = Math.floor(clapCount / TICK_EVERY);
  const caption = isOvation
    ? "standing ovation"
    : phase === "applauding"
      ? "applauding"
      : "hold to applaud";

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Applaud"
          onPointerDown={(e) => {
            if (!e.isPrimary) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            pressStart();
          }}
          onPointerUp={pressEnd}
          onPointerCancel={pressEnd}
          onKeyDown={(e) => {
            if (e.key !== " " && e.key !== "Enter") return;
            e.preventDefault();
            if (e.repeat) return;
            pressStart();
          }}
          onKeyUp={(e) => {
            if (e.key !== " " && e.key !== "Enter") return;
            e.preventDefault();
            pressEnd();
          }}
          onBlur={pressEnd}
          className={cn(
            "relative inline-flex size-16 touch-none items-center justify-center rounded-full border select-none",
            "bg-card transition-[border-color,box-shadow,color]",
            "outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
            isOvation
              ? "border-[var(--success,var(--primary))] text-foreground shadow-[0_0_28px_-6px_var(--success,var(--primary))]"
              : "border-border text-ink-2 shadow-none",
            !motionSafe && "active:brightness-95",
          )}
        >
          <span
            aria-hidden
            className="pointer-events-none relative flex items-center justify-center"
          >
            <motion.span
              className="-mr-1 inline-flex"
              style={{ x: lx, rotate: lrot }}
            >
              <Hand className="size-6 -scale-x-100" strokeWidth={1.75} />
            </motion.span>
            <motion.span
              className="-ml-1 inline-flex"
              style={{ x: rx, rotate: rrot }}
            >
              <Hand className="size-6" strokeWidth={1.75} />
            </motion.span>
          </span>

          {/* Impact tick — a small + fleck at the meeting point, every 3rd clap. */}
          {motionSafe && tickCount > 0 && (
            <motion.span
              key={tickCount}
              aria-hidden
              className="pointer-events-none absolute top-[42%] left-1/2"
              initial={{ scale: 0.4, opacity: 1 }}
              animate={{ scale: 1.15, opacity: 0 }}
              transition={{
                scale: springs.flick,
                opacity: { duration: durations.base, ease: easings.exit },
              }}
            >
              <span className="absolute top-1/2 left-1/2 h-[2px] w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--primary)]" />
              <span className="absolute top-1/2 left-1/2 h-3 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--primary)]" />
            </motion.span>
          )}

          {/* Ovation burst — six fixed flecks, fired once per ovation. */}
          {motionSafe && burst > 0 && (
            <span
              key={burst}
              aria-hidden
              className="pointer-events-none absolute inset-0"
            >
              {BURST_FLECKS.map((f, i) => (
                <motion.span
                  key={i}
                  className="absolute top-1/2 left-1/2 h-[3px] w-3.5 rounded-full bg-[var(--success,var(--primary))]"
                  style={{ rotate: `${f.deg}deg`, originX: 0, originY: 0.5 }}
                  initial={{ x: 0, y: 0, scaleX: 0.3, opacity: 0 }}
                  animate={{ x: f.dx, y: f.dy, scaleX: 1, opacity: [0, 1, 0] }}
                  transition={{
                    x: springs.recoil,
                    y: springs.recoil,
                    scaleX: springs.recoil,
                    opacity: { duration: durations.slow, ease: easings.exit },
                  }}
                />
              ))}
            </span>
          )}
        </button>

        {/* The hold meter — fills with hold time, drains after release. */}
        <span
          aria-hidden
          className="relative h-16 w-1 overflow-hidden rounded-full bg-border"
        >
          <motion.span
            className={cn(
              "absolute inset-0 origin-bottom rounded-full transition-colors",
              isOvation
                ? "bg-[var(--success,var(--primary))]"
                : "bg-[var(--primary)]",
            )}
            style={{ scaleY: fill }}
          />
        </span>
      </div>

      <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.08em] text-ink-3">
        <span>{caption}</span>
        {!motionSafe && (
          <span className="text-ink-2 tabular-nums">
            {clapCount} {clapCount === 1 ? "clap" : "claps"}
          </span>
        )}
      </div>

      {/* Announce the crescendo without narrating every clap. */}
      <span aria-live="polite" className="sr-only">
        {isOvation
          ? "standing ovation"
          : phase === "applauding"
            ? "applauding"
            : ""}
      </span>
    </div>
  );
}
