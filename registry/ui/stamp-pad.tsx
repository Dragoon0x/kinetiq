"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import { Anchor, Leaf, Music, Rocket, Star, Sun } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type StampPadProps = {
  /** The stamp cycle, in order. @default six joyful lucide glyphs */
  stamps?: { id: string; icon: React.ReactNode; color: string }[];
  /** Stamps the sheet holds before the next press wipes it clean. @default 24 */
  cap?: number;
  className?: string;
};

type PlacedStamp = {
  key: number;
  x: number;
  y: number;
  stampIndex: number;
  rotation: number;
};

/**
 * Five rotations against six stamps — co-prime lengths, so the same glyph
 * lands at a different tilt each time around. Fixed arrays, never random.
 */
const ROTATIONS = [-8, 5, -3, 9, 0] as const;

/** Where Enter and Space land, as sheet fractions — a center-ish cycle. */
const KEY_POINTS = [
  [0.5, 0.5],
  [0.38, 0.42],
  [0.62, 0.58],
  [0.44, 0.64],
  [0.58, 0.36],
  [0.32, 0.56],
  [0.68, 0.44],
  [0.5, 0.3],
  [0.5, 0.7],
] as const;

const DEFAULT_STAMPS: NonNullable<StampPadProps["stamps"]> = [
  {
    id: "star",
    icon: <Star className="size-6" />,
    color: "var(--warning, #b45309)",
  },
  {
    id: "anchor",
    icon: <Anchor className="size-6" />,
    color: "var(--primary)",
  },
  {
    id: "leaf",
    icon: <Leaf className="size-6" />,
    color: "var(--success, #047857)",
  },
  {
    id: "sun",
    icon: <Sun className="size-6" />,
    color: "var(--warning, #b45309)",
  },
  { id: "music", icon: <Music className="size-6" />, color: "var(--ink-2)" },
  {
    id: "rocket",
    icon: <Rocket className="size-6" />,
    color: "var(--primary)",
  },
];

/** Stamps fade in fast on arrival; exits run at 0.6x that, easing away. */
const ENTER_FADE = { duration: durations.fast, ease: easings.enter } as const;
const EXIT_FADE = {
  duration: durations.fast * 0.6,
  ease: easings.exit,
} as const;

/**
 * A blank sheet you stamp. Each press slams the next glyph down at the
 * pointer — it lands big, thunks to rest on `flick`, and throws a quick
 * impact ring that expands and fades — while the tray beneath previews the
 * stamp up next, cycled in fixed order with a fixed rotation per press,
 * never random. Placed stamps persist up to `cap`; the press after that
 * fades the sheet clean and starts fresh, and the Clear button empties it
 * with a cascade fade. The stage is keyboard-playable too: Enter or Space
 * stamps along a fixed center-ish cycle of positions. Reduced motion:
 * stamps appear in place instantly with no ring, and clearing is immediate.
 */
export function StampPad({
  stamps,
  cap = 24,
  className,
}: StampPadProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const stampSet = stamps && stamps.length > 0 ? stamps : DEFAULT_STAMPS;
  const capCount = Math.max(1, Math.trunc(cap));

  const [placed, setPlaced] = React.useState<PlacedStamp[]>([]);
  // Total presses ever — drives the stamp, rotation, and key-point cycles,
  // and never rewinds, so the order keeps marching across clears.
  const [seq, setSeq] = React.useState(0);
  const [clearing, setClearing] = React.useState(false);

  const clearTimer = React.useRef<number | null>(null);
  React.useEffect(() => {
    return () => {
      if (clearTimer.current !== null) window.clearTimeout(clearTimer.current);
    };
  }, []);

  const place = (x: number, y: number) => {
    if (clearing) return;
    const next: PlacedStamp = {
      key: seq,
      x,
      y,
      stampIndex: seq % stampSet.length,
      rotation: ROTATIONS[seq % ROTATIONS.length] ?? 0,
    };
    setSeq(seq + 1);
    // At the cap, the fresh stamp replaces the lot — the old sheet all-fades
    // out through AnimatePresence while the new press lands on clean paper.
    setPlaced(placed.length >= capCount ? [next] : [...placed, next]);
  };

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    place(event.clientX - rect.left, event.clientY - rect.top);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const point = KEY_POINTS[seq % KEY_POINTS.length] ?? KEY_POINTS[0];
    place(rect.width * point[0], rect.height * point[1]);
  };

  const clearSheet = () => {
    if (placed.length === 0 || clearing) return;
    if (!motionSafe) {
      setPlaced([]);
      return;
    }
    setClearing(true);
    const step = cascade(placed.length);
    const total = (placed.length - 1) * step + EXIT_FADE.duration;
    clearTimer.current = window.setTimeout(
      () => {
        clearTimer.current = null;
        setPlaced([]);
        setClearing(false);
      },
      total * 1000 + 60,
    );
  };

  const step = cascade(Math.max(placed.length, 1));
  const last = placed[placed.length - 1];
  const lastColor = last
    ? stampSet[last.stampIndex % stampSet.length]?.color
    : undefined;
  const nextStamp = stampSet[seq % stampSet.length] ?? stampSet[0];

  return (
    <div className={cn("flex w-full max-w-md flex-col gap-3", className)}>
      <div
        role="button"
        tabIndex={0}
        aria-label="Stamp the sheet"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={cn(
          "relative min-h-[200px] w-full cursor-crosshair overflow-hidden select-none",
          "rounded-3 border border-hairline bg-surface-1",
          "outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
        )}
      >
        <AnimatePresence>
          {placed.length === 0 && !clearing && (
            <motion.span
              key="hint"
              aria-hidden
              className="pointer-events-none absolute inset-0 grid place-items-center text-label text-ink-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{
                opacity: 0,
                transition: motionSafe ? EXIT_FADE : { duration: 0 },
              }}
              transition={motionSafe ? ENTER_FADE : { duration: 0 }}
            >
              Click or press Enter to stamp
            </motion.span>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {placed.map((p, i) => {
            const stamp = stampSet[p.stampIndex % stampSet.length];
            if (!stamp) return null;
            return (
              <motion.span
                key={p.key}
                aria-hidden
                className="pointer-events-none absolute size-0"
                style={{ left: p.x, top: p.y }}
                initial={motionSafe ? { scale: 1.6, opacity: 0 } : false}
                animate={
                  clearing
                    ? {
                        scale: 0.9,
                        opacity: 0,
                        transition: { ...EXIT_FADE, delay: i * step },
                      }
                    : { scale: 1, opacity: 1 }
                }
                exit={{
                  opacity: 0,
                  transition: motionSafe ? EXIT_FADE : { duration: 0 },
                }}
                transition={
                  motionSafe
                    ? { scale: springs.flick, opacity: ENTER_FADE }
                    : { duration: 0 }
                }
              >
                <span
                  className="absolute top-0 left-0 grid -translate-x-1/2 -translate-y-1/2 place-items-center"
                  style={{ rotate: `${p.rotation}deg`, color: stamp.color }}
                >
                  {stamp.icon}
                </span>
              </motion.span>
            );
          })}
        </AnimatePresence>

        {/* One impact ring per landing — keyed to the newest stamp so each
            press remounts it fresh at the press point. */}
        {motionSafe && last && !clearing && (
          <motion.span
            key={`ring-${last.key}`}
            aria-hidden
            className="pointer-events-none absolute size-0"
            style={{ left: last.x, top: last.y }}
            initial={{ scale: 0.4, opacity: 0.55 }}
            animate={{ scale: 1.8, opacity: 0 }}
            transition={{ duration: durations.base, ease: easings.exit }}
          >
            <span
              className="absolute top-0 left-0 block size-11 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
              style={{ borderColor: lastColor ?? "var(--primary)" }}
            />
          </motion.span>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-2 border border-hairline bg-surface-2 [&_svg]:size-4"
            style={{ color: nextStamp?.color }}
          >
            <motion.span
              key={seq}
              className="grid place-items-center"
              initial={motionSafe ? { opacity: 0, y: distances.nudge } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={springs.flick}
            >
              {nextStamp?.icon}
            </motion.span>
          </span>
          <div className="flex flex-col">
            <span className="text-label text-ink-3">Next up</span>
            <span className="font-mono text-[10px] tracking-[0.06em] text-ink-2">
              {nextStamp?.id}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-ink-3 tabular-nums">
            {placed.length}/{capCount}
          </span>
          <button
            type="button"
            onClick={clearSheet}
            disabled={placed.length === 0 || clearing}
            className={cn(
              "rounded-1 text-label text-ink-2 transition-colors hover:text-ink",
              "outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
              "disabled:pointer-events-none disabled:opacity-40",
            )}
          >
            Clear
          </button>
        </div>
      </div>

      <span aria-live="polite" className="sr-only">
        {placed.length} of {capCount} stamps placed
      </span>
    </div>
  );
}
