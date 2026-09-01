"use client";

import * as React from "react";

import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** SVG ids must survive url(#…) parsing — strip useId's sigil characters. */
const safeId = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, "_");

const RAD = Math.PI / 180;
const lerp = (from: number, to: number, t: number): number =>
  from + (to - from) * t;

/** Cookie zone geometry — the biscuit lives in a 112×112 viewBox. */
const SIZE = 112;
const CENTER = 56;

/** Stage box: cookie zone plus the plate it rests on. */
const STAGE_W = 128;
const STAGE_H = 132;
const COOKIE_LEFT = 8;
const COOKIE_TOP = 10;

/** Beat between the last bite landing and the fresh cookie arriving. */
const REFILL_DELAY = 1600;

/**
 * Warm tone mixed against the surface so the biscuit sits in either theme
 * rather than floating on top of it.
 */
const DOUGH = "color-mix(in oklab, var(--warning, #b45309) 45%, var(--card))";
const DOUGH_EDGE =
  "color-mix(in oklab, var(--warning, #b45309) 62%, var(--card))";
const CHIP_FILL =
  "color-mix(in oklab, var(--warning, #b45309) 55%, oklch(0.3 0.05 55))";

/**
 * The fixed bite ledger: angle around the rim (deg, y-down), distance of the
 * cutout centre from the cookie centre, and cutout radius. Non-default bite
 * counts interpolate along this table, so every count eats the same way.
 */
const BITE_TABLE = [
  { a: -48, d: 44, r: 19 },
  { a: 24, d: 42.5, r: 21 },
  { a: 96, d: 45, r: 18 },
  { a: 172, d: 42.5, r: 21 },
  { a: 244, d: 44, r: 19 },
] as const;

/** Seven fixed chips, offsets from the cookie centre. */
const CHIPS = [
  { x: -15, y: -13, r: 4.4 },
  { x: 9, y: -21, r: 3.8 },
  { x: 22, y: 1, r: 4.8 },
  { x: -1, y: 6, r: 3.6 },
  { x: -24, y: 12, r: 4.2 },
  { x: 13, y: 21, r: 4 },
  { x: -8, y: -28, r: 3.2 },
] as const;

/** Three fixed crumbs per bite: angle offset, throw distance, arc shape. */
const CRUMB_TABLE = [
  { da: -24, dist: 30, lift: 11, fall: 15, r: 2.6 },
  { da: 3, dist: 38, lift: 7, fall: 12, r: 2 },
  { da: 26, dist: 26, lift: 13, fall: 17, r: 3 },
] as const;

/** What is left on the plate once the cookie is gone (stage coordinates). */
const PLATE_CRUMBS = [
  { x: 43, y: 115, r: 2.4 },
  { x: 57, y: 120, r: 1.9 },
  { x: 70, y: 115.5, r: 2.8 },
  { x: 86, y: 118.5, r: 2.1 },
  { x: 51, y: 123, r: 1.7 },
  { x: 79, y: 122, r: 2.5 },
] as const;

type BitePosition = { cx: number; cy: number; r: number; a: number };

/** Interpolates `total` bite cutouts from the fixed five-entry table. */
const bitesFor = (total: number): BitePosition[] =>
  Array.from({ length: total }, (_, i) => {
    const t = (i * (BITE_TABLE.length - 1)) / (total - 1);
    const lo = BITE_TABLE[Math.floor(t)] ?? BITE_TABLE[0];
    const hi =
      BITE_TABLE[Math.min(BITE_TABLE.length - 1, Math.floor(t) + 1)] ?? lo;
    const f = t - Math.floor(t);
    const a = lerp(lo.a, hi.a, f);
    const d = lerp(lo.d, hi.d, f);
    return {
      cx: CENTER + Math.cos(a * RAD) * d,
      cy: CENTER + Math.sin(a * RAD) * d,
      r: lerp(lo.r, hi.r, f),
      a,
    };
  });

export type CookieBiteProps = {
  /** Bites to finish the cookie. Clamped to 3–6. @default 5 */
  bites?: number;
  /** Fires after each bite with the running count (1-based). */
  onBite?: (n: number) => void;
  /** Fires when the last bite lands and the cookie is gone. */
  onFinish?: () => void;
  className?: string;
};

/**
 * A cookie you eat one click at a time. Every press carves a fixed bite out of
 * the rim through an SVG mask, startles the biscuit with a tiny `flick`
 * squash, and throws three crumbs that arc away on an exit tween. After the
 * last bite only crumbs remain: the plate keeps its scatter, a small mono
 * "worth it" fades in, and about 1.6s later a fresh cookie springs back on
 * `recoil` while the crumbs sweep off. Bite positions, chips, and crumbs are
 * all precomputed tables — the same clicks always eat the same cookie — and a
 * polite live region counts each bite for screen readers. Reduced motion: each
 * bite swaps the mask instantly with no squash or crumbs, and the refill
 * appears in place without the spring.
 */
export function CookieBite({
  bites = 5,
  onBite,
  onFinish,
  className,
}: CookieBiteProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const maskId = `${safeId(React.useId())}-bites`;

  const total = Math.min(6, Math.max(3, Math.trunc(bites)));
  const positions = bitesFor(total);

  const [biteCount, setBiteCount] = React.useState(0);
  const [phase, setPhase] = React.useState<"cookie" | "gone">("cookie");
  const [message, setMessage] = React.useState("");

  // The squash and the refill share one pair of imperative scale values:
  // set the pose, then a single spring carries it back to rest (2 keyframes).
  const scaleX = useMotionValue(1);
  const scaleY = useMotionValue(1);
  const popX = React.useRef<ReturnType<typeof animate> | null>(null);
  const popY = React.useRef<ReturnType<typeof animate> | null>(null);
  const refillTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (refillTimer.current !== null)
        window.clearTimeout(refillTimer.current);
    };
  }, []);

  const takeBite = (): void => {
    if (phase === "gone") return;
    const next = biteCount + 1;
    setBiteCount(next);
    onBite?.(next);

    if (motionSafe) {
      popX.current?.stop();
      popY.current?.stop();
      scaleX.set(1.05);
      scaleY.set(0.92);
      popX.current = animate(scaleX, 1, springs.flick);
      popY.current = animate(scaleY, 1, springs.flick);
    }

    if (next >= total) {
      setPhase("gone");
      setMessage("eaten");
      onFinish?.();
      refillTimer.current = window.setTimeout(() => {
        setBiteCount(0);
        setPhase("cookie");
        setMessage("");
        if (motionSafe) {
          popX.current?.stop();
          popY.current?.stop();
          scaleX.set(0.5);
          scaleY.set(0.5);
          popX.current = animate(scaleX, 1, springs.recoil);
          popY.current = animate(scaleY, 1, springs.recoil);
        }
      }, REFILL_DELAY);
    } else {
      setMessage(`bite ${next} of ${total}`);
    }
  };

  const lastBite = positions[Math.min(biteCount, total) - 1];

  return (
    <button
      type="button"
      aria-label="Take a bite"
      onClick={takeBite}
      className={cn(
        "relative inline-flex flex-col items-center rounded-3 p-1 select-none",
        "outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
        className,
      )}
    >
      <span
        aria-hidden
        className="relative block"
        style={{ width: STAGE_W, height: STAGE_H }}
      >
        {/* Plate, and the scatter left behind once the cookie is gone. */}
        <svg
          viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
          className="absolute inset-0 size-full"
        >
          <ellipse
            cx="64"
            cy="118"
            rx="50"
            ry="9"
            fill="var(--card)"
            stroke="var(--hairline-strong)"
            strokeWidth="1"
          />
          <AnimatePresence>
            {phase === "gone" && (
              <motion.g
                key="plate-crumbs"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{
                  opacity: 0,
                  x: 14,
                  transition: motionSafe
                    ? exitFor(durations.base)
                    : { duration: 0 },
                }}
                transition={
                  motionSafe
                    ? { duration: durations.base, ease: easings.enter }
                    : { duration: 0 }
                }
              >
                {PLATE_CRUMBS.map((crumb, i) => (
                  <circle
                    key={i}
                    cx={crumb.x}
                    cy={crumb.y}
                    r={crumb.r}
                    fill={DOUGH_EDGE}
                  />
                ))}
              </motion.g>
            )}
          </AnimatePresence>
        </svg>

        {/* The cookie, squashed and refilled through shared scale values. */}
        <motion.div
          className="absolute"
          style={{
            left: COOKIE_LEFT,
            top: COOKIE_TOP,
            width: SIZE,
            height: SIZE,
            scaleX,
            scaleY,
          }}
        >
          <AnimatePresence initial={false}>
            {phase === "cookie" && (
              <motion.div
                key="cookie"
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{
                  opacity: 0,
                  transition: motionSafe
                    ? exitFor(durations.fast)
                    : { duration: 0 },
                }}
                transition={
                  motionSafe
                    ? { duration: durations.fast, ease: easings.enter }
                    : { duration: 0 }
                }
              >
                <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full">
                  <defs>
                    <mask
                      id={maskId}
                      maskUnits="userSpaceOnUse"
                      x="0"
                      y="0"
                      width={SIZE}
                      height={SIZE}
                    >
                      <rect width={SIZE} height={SIZE} fill="white" />
                      {positions.slice(0, biteCount).map((bite, i) =>
                        motionSafe ? (
                          <motion.circle
                            key={i}
                            cx={bite.cx}
                            cy={bite.cy}
                            fill="black"
                            initial={{ r: 0 }}
                            animate={{ r: bite.r }}
                            transition={{
                              duration: durations.fast,
                              ease: easings.enter,
                            }}
                          />
                        ) : (
                          <circle
                            key={i}
                            cx={bite.cx}
                            cy={bite.cy}
                            r={bite.r}
                            fill="black"
                          />
                        ),
                      )}
                    </mask>
                  </defs>
                  <g mask={`url(#${maskId})`}>
                    <circle
                      cx={CENTER}
                      cy={CENTER}
                      r="44"
                      fill={DOUGH}
                      stroke={DOUGH_EDGE}
                      strokeWidth="2.5"
                    />
                    {/* Soft top-light so the dough reads baked, not flat. */}
                    <circle
                      cx="48"
                      cy="46"
                      r="34"
                      fill="color-mix(in oklab, var(--warning, #b45309) 18%, transparent)"
                    />
                    {CHIPS.map((chip, i) => (
                      <circle
                        key={i}
                        cx={CENTER + chip.x}
                        cy={CENTER + chip.y}
                        r={chip.r}
                        fill={CHIP_FILL}
                      />
                    ))}
                  </g>
                </svg>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Crumbs thrown by the latest bite — outside the squash so their
            trajectories stay true. Translation-only transforms, so no
            transform-origin traps on SVG children. */}
        {motionSafe && (
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="pointer-events-none absolute overflow-visible"
            style={{
              left: COOKIE_LEFT,
              top: COOKIE_TOP,
              width: SIZE,
              height: SIZE,
            }}
          >
            <AnimatePresence>
              {biteCount > 0 && lastBite && (
                <motion.g
                  key={`crumbs-${biteCount}`}
                  exit={{
                    opacity: 0,
                    transition: {
                      duration: durations.blink,
                      ease: easings.exit,
                    },
                  }}
                >
                  {CRUMB_TABLE.map((crumb, i) => {
                    const heading = (lastBite.a + crumb.da) * RAD;
                    const dx = Math.cos(heading) * crumb.dist;
                    const dy = Math.sin(heading) * crumb.dist;
                    return (
                      <motion.circle
                        key={i}
                        cx={lastBite.cx}
                        cy={lastBite.cy}
                        r={crumb.r}
                        fill={DOUGH_EDGE}
                        initial={{ x: 0, y: 0, opacity: 1 }}
                        animate={{
                          x: dx,
                          y: [0, dy * 0.5 - crumb.lift, dy + crumb.fall],
                          opacity: [1, 1, 0],
                        }}
                        transition={{
                          x: { duration: durations.slow, ease: easings.exit },
                          y: {
                            duration: durations.slow,
                            ease: easings.exit,
                            times: [0, 0.45, 1],
                          },
                          opacity: {
                            duration: durations.slow,
                            ease: easings.exit,
                            times: [0, 0.55, 1],
                          },
                        }}
                      />
                    );
                  })}
                </motion.g>
              )}
            </AnimatePresence>
          </svg>
        )}

        {/* The verdict, centred where the cookie was. */}
        <AnimatePresence>
          {phase === "gone" && (
            <motion.span
              key="worth-it"
              className="absolute flex items-center justify-center text-label font-mono text-ink-3"
              style={{
                left: COOKIE_LEFT,
                top: COOKIE_TOP,
                width: SIZE,
                height: SIZE,
              }}
              initial={{ opacity: 0, y: distances.nudge }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                transition: motionSafe
                  ? exitFor(durations.base)
                  : { duration: 0 },
              }}
              transition={
                motionSafe
                  ? {
                      duration: durations.base,
                      ease: easings.enter,
                      delay: 0.15,
                    }
                  : { duration: 0 }
              }
            >
              worth it
            </motion.span>
          )}
        </AnimatePresence>
      </span>

      <span aria-live="polite" className="sr-only">
        {message}
      </span>
    </button>
  );
}
