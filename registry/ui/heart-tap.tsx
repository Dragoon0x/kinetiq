"use client";

import * as React from "react";

import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const TAU = Math.PI * 2;

/** Ring of hairline sparks thrown on each like. */
const SPARK_COUNT = 8;

/** Digit strip the count rolls through. */
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/**
 * djb2 over a small integer tuple, folded to [0, 1) with a two-round
 * avalanche — deterministic and SSR-safe, so spark jitter never touches
 * Math.random and server and client agree on every angle.
 */
const djb2 = (a: number, b: number, seed = 0): number => {
  let h = 5381 + seed;
  h = (Math.imul(h, 33) ^ a) >>> 0;
  h = (Math.imul(h, 33) ^ b) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

/** Lets an uncontrolled prop fall back to internal state, repo-style. */
function useControllable<T>(
  controlled: T | undefined,
  fallback: T,
): [T, (next: T) => void, boolean] {
  const isControlled = controlled !== undefined;
  const [uncontrolled, setUncontrolled] = React.useState(fallback);
  const value = isControlled ? controlled : uncontrolled;
  const set = React.useCallback(
    (next: T) => {
      if (!isControlled) setUncontrolled(next);
    },
    [isControlled],
  );
  return [value, set, isControlled];
}

type CountRollProps = {
  value: number;
  motionSafe: boolean;
};

/**
 * The count, rolled. Each digit is an overflow-hidden window over a 0–9 strip
 * that slides to its target on `glide`; a wider number just adds cells at the
 * left edge. Reduced motion drops the strip for a plain, instantly-swapped
 * number.
 */
function CountRoll({ value, motionSafe }: CountRollProps): React.JSX.Element {
  const text = String(Math.max(0, Math.trunc(value)));

  if (!motionSafe) {
    return <span className="font-mono tabular-nums">{text}</span>;
  }

  const chars = Array.from(text);
  return (
    <span aria-hidden className="inline-flex font-mono tabular-nums">
      {chars.map((ch, i) => {
        const digit = ch.charCodeAt(0) - 48;
        // Key from the right so the ones column keeps its identity as the
        // number grows and only the strip position animates.
        const fromRight = chars.length - i;
        return (
          <span
            key={`d${fromRight}`}
            className="relative inline-block h-[1em] overflow-hidden"
          >
            <motion.span
              className="flex flex-col"
              initial={false}
              animate={{ y: `${-digit}em` }}
              transition={springs.glide}
            >
              {DIGITS.map((d) => (
                <span key={d} className="block h-[1em] leading-none">
                  {d}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

type SparkRingProps = {
  burst: number;
  size: number;
};

/**
 * One outward throw of hairline sparks, mounted per like and removed by
 * AnimatePresence once it fades — so nothing lingers and rapid taps each get
 * their own clean ring. Angles are evenly spaced with a djb2 jitter, so the
 * ring reads organic without any per-render randomness.
 */
function SparkRing({ burst, size }: SparkRingProps): React.JSX.Element {
  const reach = size * 0.62;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      {Array.from({ length: SPARK_COUNT }, (_, i) => {
        const jitter = (djb2(i, burst, 41) - 0.5) * (TAU / SPARK_COUNT) * 0.6;
        const angle = (i / SPARK_COUNT) * TAU + jitter;
        const dx = Math.cos(angle) * reach;
        const dy = Math.sin(angle) * reach;
        const len = size * (0.16 + djb2(i, burst, 7) * 0.1);
        return (
          <motion.span
            key={i}
            className="absolute top-1/2 left-1/2 rounded-full"
            style={{
              width: len,
              height: Math.max(1.25, size * 0.045),
              background: "var(--signal)",
              rotate: `${(angle / TAU) * 360}deg`,
              originX: 0,
              originY: 0.5,
            }}
            initial={{ x: 0, y: 0, scaleX: 0.3, opacity: 0 }}
            animate={{ x: dx, y: dy, scaleX: 1, opacity: [0, 1, 0] }}
            transition={{
              x: springs.recoil,
              y: springs.recoil,
              scaleX: springs.recoil,
              opacity: { duration: durations.slow, ease: easings.exit },
            }}
          />
        );
      })}
    </span>
  );
}

export type HeartTapProps = {
  /** Controlled count. */
  count?: number;
  /** Uncontrolled initial count. */
  defaultCount?: number;
  /** Controlled liked state. */
  liked?: boolean;
  /** Uncontrolled initial liked state. */
  defaultLiked?: boolean;
  onChange?: (state: { liked: boolean; count: number }) => void;
  /** Heart glyph size in px. */
  size?: number;
  className?: string;
  "aria-label"?: string;
};

/**
 * A like control with weight. Tapping squashes the heart on `flick` then
 * overshoots back on `recoil` (two visible bounces), throws one ring of
 * hairline sparks, and rolls the count up a step; un-liking deflates the
 * heart and rolls the count back down. Works controlled or uncontrolled for
 * both `liked` and `count`. Reduced motion keeps the toggle and the
 * announcement but swaps the fill and the number instantly — no squash,
 * sparks, or roll.
 */
export function HeartTap({
  count,
  defaultCount = 0,
  liked,
  defaultLiked = false,
  onChange,
  size = 28,
  className,
  "aria-label": ariaLabel = "Like",
}: HeartTapProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [isLiked, setLiked] = useControllable(liked, defaultLiked);
  const [likeCount, setCount] = useControllable(
    count,
    Math.max(0, Math.trunc(defaultCount)),
  );

  // A fresh key per like mounts a fresh spark ring (and unmounts the old one).
  const [burst, setBurst] = React.useState(0);

  // Scale is driven imperatively so a like can chain two springs: the press
  // dips it on `flick`, then the release overshoots back on `recoil`.
  const scale = useMotionValue(1);
  const pop = React.useRef<ReturnType<typeof animate> | null>(null);

  const label = isLiked ? `Un${ariaLabel.toLowerCase()}` : ariaLabel;

  const toggle = React.useCallback(() => {
    const nextLiked = !isLiked;
    const nextCount = Math.max(0, likeCount + (nextLiked ? 1 : -1));

    if (motionSafe) {
      pop.current?.stop();
      if (nextLiked) {
        setBurst((b) => b + 1);
        // Squash on flick, then release into recoil's two-bounce overshoot.
        pop.current = animate(scale, 0.8, {
          ...springs.flick,
          onComplete: () => {
            pop.current = animate(scale, 1, springs.recoil);
          },
        });
      } else {
        // Unlike just deflates — quick, no sparks, no overshoot.
        pop.current = animate(scale, [0.92, 1], springs.flick);
      }
    }

    setLiked(nextLiked);
    setCount(nextCount);
    onChange?.({ liked: nextLiked, count: nextCount });
  }, [isLiked, likeCount, motionSafe, onChange, scale, setCount, setLiked]);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isLiked}
      aria-label={label}
      className={cn(
        "group relative inline-flex items-center gap-2 rounded-2 text-sm font-medium select-none",
        "text-ink-2 transition-colors",
        "outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
        !motionSafe && "active:brightness-95",
        className,
      )}
    >
      <span
        className="relative inline-flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        {motionSafe && (
          <AnimatePresence>
            {burst > 0 && (
              <motion.span
                key={burst}
                className="absolute inset-0"
                initial={{ opacity: 1 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: durations.blink }}
              >
                <SparkRing burst={burst} size={size} />
              </motion.span>
            )}
          </AnimatePresence>
        )}

        <motion.svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className="relative block"
          style={{ scale }}
        >
          <motion.path
            d="M12 21s-7.2-4.35-9.6-8.4C1.1 10.2 1.6 6.9 4.2 5.6c1.9-1 4.2-.4 5.4 1.2L12 9.6l2.4-2.8c1.2-1.6 3.5-2.2 5.4-1.2 2.6 1.3 3.1 4.6 1.8 7C19.2 16.65 12 21 12 21z"
            initial={false}
            animate={{
              fill: isLiked ? "var(--signal)" : "transparent",
              stroke: isLiked ? "var(--signal)" : "var(--ink-3)",
            }}
            transition={{
              duration: motionSafe ? durations.base : durations.fast,
              ease: easings.enter,
            }}
            strokeWidth={1.75}
            strokeLinejoin="round"
          />
        </motion.svg>
      </span>

      <span
        className={cn(
          "min-w-[1ch] leading-none tabular-nums transition-colors",
          isLiked ? "text-foreground" : "text-ink-2",
        )}
      >
        <CountRoll value={likeCount} motionSafe={motionSafe} />
      </span>

      {/* Announce the outcome without leaning on the rolling glyphs. */}
      <span aria-live="polite" className="sr-only">
        {isLiked ? "Liked" : "Not liked"}, {Math.max(0, Math.trunc(likeCount))}
      </span>
    </button>
  );
}
