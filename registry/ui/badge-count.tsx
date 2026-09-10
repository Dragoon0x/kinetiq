"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BadgeCountProps = {
  ref?: React.Ref<HTMLButtonElement>;
  /** The app's name: seeds the mark, captions the tile, and names the button. */
  app: string;
  /** Unread items. Zero collapses the badge. @default 0 */
  count?: number;
  /** Cap; anything above reads as `99+`. @default 99 */
  max?: number;
  /** Pluralised into the spoken sentences. @default "unread message" */
  noun?: string;
  /** The badge's ink. @default "signal" */
  tone?: "signal" | "danger" | "neutral";
  /** Fires from the press; clear the count in the host. */
  onOpen?: () => void;
  /** The sentence the live region just spoke. */
  onAnnounce?: (sentence: string) => void;
  className?: string;
};

const TONES = {
  signal: "bg-primary text-primary-foreground",
  danger: "bg-destructive text-destructive-foreground",
  neutral: "border border-hairline-strong bg-surface-2 text-ink",
} as const;

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const MARK_INKS = [
  "text-cobalt-bright",
  "text-signal",
  "text-warn",
  "text-success",
] as const;

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Smallest the pill may be: a single digit sits in a circle. */
const MIN_WIDTH = 20;

/**
 * A stable 32-bit hash, kept unsigned. `>>>` matters: a hash above 2^31 read
 * through `>>` comes back negative, and negative geometry draws nothing.
 */
const hashOf = (text: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const plural = (count: number, noun: string): string =>
  `${count} ${count === 1 ? noun : `${noun}s`}`;

/** One string per reading, pluralised, so no name is spliced from two nodes and
 *  nothing ever reads "1 unread messages". */
const tileSentence = (
  app: string,
  count: number,
  max: number,
  noun: string,
): string => {
  if (count <= 0) return `${app}, nothing unread.`;
  if (count > max) return `${app}, more than ${plural(max, noun)}.`;
  return `${app}, ${plural(count, noun)}.`;
};

const changeSentence = (
  app: string,
  count: number,
  max: number,
  noun: string,
): string => {
  if (count <= 0) return `Nothing unread in ${app}.`;
  if (count > max) return `More than ${plural(max, noun)} in ${app}.`;
  return `${plural(count, noun)} in ${app}.`;
};

/** Keeps a callback out of effect dependencies so a re-render cannot re-speak. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * The app's own mark: a mirrored grid of cells lit by the bits of a hash of its
 * name, so a launcher needs no assets and the same app always draws the same
 * face.
 */
function AppMark({ app }: { app: string }) {
  const hash = hashOf(app);
  const ink = MARK_INKS[(hash >>> 17) % MARK_INKS.length] ?? MARK_INKS[0];
  const cells: { x: number; y: number }[] = [];
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      if (((hash >>> (row * 2 + col)) & 1) === 0) continue;
      cells.push({ x: col, y: row });
      cells.push({ x: 3 - col, y: row });
    }
  }
  // A hash whose low bits are all zero would light nothing; every app gets a
  // face, so the empty draw falls back to a centre pair.
  if (cells.length === 0) cells.push({ x: 1, y: 1 }, { x: 2, y: 2 });
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-7", ink)}>
      {cells.map((cell) => (
        <rect
          key={`${cell.x}-${cell.y}`}
          x={1.5 + cell.x * 5.5}
          y={1.5 + cell.y * 5.5}
          width="4.5"
          height="4.5"
          rx="1.4"
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

/**
 * Digits roll in strips of ten, so 9 to 10 reads as a count rather than a
 * redraw. Keyed from the right, which is what keeps the units column's identity
 * when the number gains a place and lets only the new column mount.
 */
function DigitStrip({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span className="flex items-center tabular-nums">
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        const key = value.length - index;
        if (digit < 0) {
          return (
            <span key={key} className="inline-block">
              {char}
            </span>
          );
        }
        return (
          <span
            key={key}
            className="relative inline-block h-[1.1em] w-[1ch] overflow-clip [contain:paint]"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((face) => (
                <span
                  key={face}
                  className="flex h-[1.1em] items-center justify-center"
                >
                  {face}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * The number on the app, and the way it behaves. The tile carries a procedural
 * mark drawn from a hash of its own name — unsigned shifts throughout, because a
 * hash past 2^31 read as a signed number draws nothing at all — and the badge
 * sits at its shoulder.
 *
 * An arrival bumps it: the pill scales from 1.25 back to 1 on `recoil`, exactly
 * two keyframes, the physics of something landing, while the digits roll in
 * strips of ten. The pill's width is measured by a ResizeObserver and joined on
 * `glide`, so gaining a place widens the badge rather than jumping it. A count
 * that falls does not bump — being read is not an arrival — it simply rolls back
 * down and narrows. Past `max` the strips hold at the cap and a plus arrives from
 * `distances.nudge` on `snap`; falling back under the cap drops it on the exit
 * ease. Reading everything collapses the badge away on the exit ease, because an
 * empty inbox never celebrates.
 *
 * The tile is a real button named as one built and properly pluralised sentence
 * — "Coldbrook Threads, 12 unread messages." — so the badge itself stays
 * `aria-hidden` and a reader never hears the number twice, and a polite region
 * speaks one frozen sentence per change. Under reduced motion nothing bumps and
 * nothing travels: the digits swap, the width swaps, and the badge fades, but the
 * number always updates, because the count is the information the badge exists
 * to carry.
 */
export function BadgeCount({
  ref,
  app,
  count = 0,
  max = 99,
  noun = "unread message",
  tone = "signal",
  onOpen,
  onAnnounce,
  className,
}: BadgeCountProps) {
  const motionSafe = useMotionSafe();
  const bumpRef = React.useRef<HTMLSpanElement | null>(null);
  const innerRef = React.useRef<HTMLSpanElement | null>(null);

  const cap = Math.max(1, Math.round(max));
  const value = Math.max(0, Math.round(count));
  const showing = value > 0;
  const over = value > cap;
  const printed = String(over ? cap : value);

  // The reading is frozen at the moment the count changes, and the direction is
  // frozen with it: only an arrival earns the bump.
  const [beat, setBeat] = React.useState(() => ({
    count: value,
    rising: false,
    sentence: "",
    stamp: 0,
  }));
  if (beat.count !== value) {
    setBeat({
      count: value,
      rising: value > beat.count,
      sentence: changeSentence(app, value, cap, noun),
      stamp: beat.stamp + 1,
    });
  }

  const announceRef = useLatest(onAnnounce);
  React.useEffect(() => {
    if (beat.stamp > 0 && beat.sentence) announceRef.current?.(beat.sentence);
  }, [beat.stamp, beat.sentence, announceRef]);

  React.useEffect(() => {
    const node = bumpRef.current;
    if (!node || !motionSafe) return;
    if (beat.stamp === 0 || !beat.rising || beat.count === 0) return;
    // Exactly two keyframes: a spring silently drops anything in between.
    const bump = animate(node, { scale: [1.25, 1] }, springs.recoil);
    return () => bump.stop();
  }, [beat.stamp, beat.rising, beat.count, motionSafe]);

  // The pill measures its own content, so a badge that gains a place widens to
  // fit rather than reserving room for a number it may never carry.
  const width = useMotionValue<number>(MIN_WIDTH);
  const [content, setContent] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      const next = Math.max(
        MIN_WIDTH,
        Math.ceil(node.getBoundingClientRect().width),
      );
      setContent((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [showing]);

  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (content === null) return;
    // The first measurement is written outright, or a badge that mounts with
    // two digits would widen from a circle on the frame it arrives.
    if (!seeded.current) {
      seeded.current = true;
      width.set(content);
      return;
    }
    const controls = animate(
      width,
      content,
      motionSafe ? springs.glide : { duration: 0 },
    );
    return () => controls.stop();
  }, [content, width, motionSafe]);

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div className={cn("inline-flex", className)}>
      <button
        ref={ref}
        type="button"
        aria-label={tileSentence(app, value, cap, noun)}
        onClick={() => onOpen?.()}
        className={cn(
          "flex w-20 flex-col items-center gap-1.5 rounded-3 p-1 transition-colors hover:bg-accent",
          focusRing,
        )}
      >
        <span className="relative">
          <span className="grid size-14 place-items-center rounded-4 border border-hairline bg-surface-2">
            <AppMark app={app} />
          </span>

          <AnimatePresence initial={false}>
            {showing ? (
              <motion.span
                key="badge"
                aria-hidden
                className="absolute -top-1.5 -right-1.5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={
                  motionSafe
                    ? { opacity: 0, scale: 0.5, transition: exitFor() }
                    : { opacity: 0, transition: exitFor(durations.fast) }
                }
                transition={fade}
              >
                {/* The bump target is a plain span, so the imperative scale and
                    the presence opacity never write the same style. */}
                <span ref={bumpRef} className="block">
                  <motion.span
                    style={{ width }}
                    className={cn(
                      "relative flex h-5 items-center justify-center overflow-clip rounded-full font-mono text-[10px] leading-none font-semibold [contain:paint]",
                      TONES[tone],
                    )}
                  >
                    {/* Absolutely positioned and nowrap, so the pill's animated
                        width can never squeeze the number it is measuring. */}
                    <span
                      ref={innerRef}
                      className="absolute left-1/2 flex -translate-x-1/2 items-center px-1.5 whitespace-nowrap"
                    >
                      <DigitStrip value={printed} motionSafe={motionSafe} />
                      <AnimatePresence initial={false}>
                        {over ? (
                          <motion.span
                            key="over"
                            className="pl-px"
                            initial={
                              motionSafe
                                ? { opacity: 0, x: distances.nudge }
                                : { opacity: 0 }
                            }
                            animate={{ opacity: 1, x: 0 }}
                            exit={{
                              opacity: 0,
                              transition: exitFor(durations.fast),
                            }}
                            transition={motionSafe ? springs.snap : fade}
                          >
                            +
                          </motion.span>
                        ) : null}
                      </AnimatePresence>
                    </span>
                  </motion.span>
                </span>
              </motion.span>
            ) : null}
          </AnimatePresence>
        </span>

        <span className="line-clamp-2 text-center text-[11px] leading-tight text-ink-2">
          {app}
        </span>
      </button>

      <p role="status" aria-live="polite" className="sr-only">
        {beat.sentence}
      </p>
    </div>
  );
}
