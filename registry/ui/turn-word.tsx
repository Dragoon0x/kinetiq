"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Figure space — a digit-wide blank, so padded cells hold the mono pitch. */
const FIGURE_SPACE = " ";

export type TurnWordProps = {
  /**
   * The two settled states. The shorter word pads with figure spaces so both
   * read on the same row of cells.
   */
  words: readonly [string, string];
  /** Controlled state. */
  active?: 0 | 1;
  /** Uncontrolled initial state. @default 0 */
  defaultActive?: 0 | 1;
  onTurn?: (active: 0 | 1) => void;
  /** When true (default) the whole word is one real switch button. */
  interactive?: boolean;
  className?: string;
  /** Names the switch. @default `${words[0]} or ${words[1]}` */
  "aria-label"?: string;
};

/**
 * A word whose letters Y-rotate in cascade to become another word. Each
 * letter sits in a fixed-width mono cell; on a turn the cell half-flips — a
 * `durations.fast` tween on `easings.move` carries it to 90° (edge-on), the
 * glyph swaps at the midpoint, then `springs.snap` lands it back at 0° —
 * staggered `cascade(length)` from the left. Turning back staggers from the
 * right and rotates the opposite way, so the mechanism visibly unwinds.
 * Letters identical in both words at the same position never flip — they hold
 * still while the rest turn. The row supplies `perspectives.near`, so edge
 * letters turn slightly off-axis like one printed strip viewed from its
 * center, and each swapped-in glyph lands with a brief accent tint that dries
 * back to ink.
 *
 * Mid-flight policy: a toggle stops every cell's in-flight controls and each
 * cell re-derives from the glyph it currently shows. A cell still showing its
 * old letter springs back upright and holds — its swap never happened; a cell
 * that already swapped turns straight back from its current angle, skipping
 * its wave slice so the reversal reads immediate; resting cells run the fresh
 * cascade from the opposite edge. The shown glyph is state (render never
 * reads a ref); a ref mirror lets retargets decide without re-render races.
 *
 * Semantics: when `interactive` (the default) the word is one real
 * `<button role="switch" aria-checked>` — Space and Enter toggle natively, a
 * focus-visible ring draws on the frame, the letter cells are aria-hidden
 * decoration, and an sr-only polite region announces the settled word once
 * the last cell lands. When not interactive it is a plain group driven by
 * `active`. A faint baseline hairline underscores the cells and a tiny mono
 * A/B index chip (aria-hidden) sits beside the word, mirroring the commanded
 * side while the letters are still in flight.
 *
 * Reduced motion: no flips — the word crossfades at `durations.fast` with
 * identical semantics and announcements. Every cell's controls stop on
 * unmount and on each retarget.
 */
export function TurnWord({
  words,
  active,
  defaultActive = 0,
  onTurn,
  interactive = true,
  className,
  "aria-label": ariaLabel,
}: TurnWordProps) {
  const motionSafe = useMotionSafe();
  const [uncontrolled, setUncontrolled] = React.useState<0 | 1>(defaultActive);
  const current = active ?? uncontrolled;

  // Pad the shorter word with figure spaces so both sides share one cell row.
  const lettersA = Array.from(words[0]);
  const lettersB = Array.from(words[1]);
  const count = Math.max(lettersA.length, lettersB.length);
  const cells = Array.from({ length: count }, (_, index) => ({
    a: lettersA[index] ?? FIGURE_SPACE,
    b: lettersB[index] ?? FIGURE_SPACE,
  }));

  // The wave: pure geometry — index in, delay out — so every turn replays
  // identically. Forward turns cascade from the left, reversals from the
  // right, each rotating its own way.
  const step = cascade(count);
  const direction: 1 | -1 = current === 1 ? 1 : -1;
  const delayFor = (index: number): number =>
    (current === 1 ? index : count - 1 - index) * step;
  const settleDelay = Math.max(0, count - 1) * step + durations.fast;

  const currentWord = current === 1 ? words[1] : words[0];
  const label = ariaLabel ?? `${words[0]} or ${words[1]}`;

  // Settle announcer: a throwaway 0→1 animation mirrors the last cell's
  // landing (same spring, full wave delay plus the away tween), so the polite
  // region speaks only once the word has actually landed. Retargeting a
  // mid-flight turn restarts it too.
  const [announced, setAnnounced] = React.useState(currentWord);
  const settleControls = React.useRef<ReturnType<typeof animate> | null>(null);
  const prevRef = React.useRef(current);

  React.useEffect(() => {
    if (prevRef.current === current) return;
    prevRef.current = current;
    settleControls.current?.stop();
    settleControls.current = animate(0, 1, {
      ...(motionSafe
        ? { ...springs.snap, delay: settleDelay }
        : { duration: durations.fast }),
      onComplete: () => {
        settleControls.current = null;
        setAnnounced(currentWord);
      },
    });
  }, [current, currentWord, motionSafe, settleDelay]);

  React.useEffect(
    () => () => {
      settleControls.current?.stop();
      settleControls.current = null;
    },
    [],
  );

  const handleTurn = () => {
    const next: 0 | 1 = current === 1 ? 0 : 1;
    if (active === undefined) setUncontrolled(next);
    onTurn?.(next);
  };

  // Spans throughout — the row must stay valid phrasing content inside the
  // button. Nothing on this branch clips: letters swing over their own cells.
  const row = (
    <span
      aria-hidden
      className="relative inline-flex items-baseline pb-1"
      style={{
        perspective: motionSafe ? `${perspectives.near}px` : undefined,
      }}
    >
      {motionSafe ? (
        cells.map((cell, index) => (
          <TurnCell
            key={index}
            target={current === 1 ? cell.b : cell.a}
            delay={delayFor(index)}
            direction={direction}
          />
        ))
      ) : (
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={currentWord}
            className="inline-flex items-baseline"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            {cells.map((cell, index) => (
              <span key={index} className="inline-flex w-[1.2ch] justify-center">
                {current === 1 ? cell.b : cell.a}
              </span>
            ))}
          </motion.span>
        </AnimatePresence>
      )}
      {/* Baseline hairline — the print bed the letters turn over. */}
      <span className="border-hairline absolute inset-x-0 bottom-0 border-t" />
    </span>
  );

  // Tiny A/B index chip — decoration only; it flips to the commanded side at
  // once while the letters are still turning toward it.
  const chip = (
    <span
      aria-hidden
      className={cn(
        "border-hairline text-ink-3 rounded-1 border px-1 py-px font-mono text-[9px] tracking-[0.1em] tabular-nums transition-colors",
        interactive &&
          "group-hover:border-hairline-strong group-hover:text-ink-2",
      )}
    >
      {current === 1 ? "B" : "A"}
    </span>
  );

  const status = (
    <span role="status" aria-live="polite" className="sr-only">
      {announced}
    </span>
  );

  const baseClass = cn(
    "text-ink relative inline-flex items-center gap-2.5 rounded-2 px-1.5 py-1 font-mono text-2xl tracking-wide select-none sm:text-3xl",
    className,
  );

  if (!interactive) {
    return (
      <>
        <span
          role="group"
          aria-label={label}
          data-active={current}
          className={baseClass}
        >
          {row}
          {chip}
          <span className="sr-only">{currentWord}</span>
        </span>
        {status}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={current === 1}
        aria-label={label}
        data-active={current}
        onClick={handleTurn}
        className={cn(
          "group cursor-pointer outline-none",
          "focus-visible:ring-ring/60 focus-visible:ring-offset-surface-1 focus-visible:ring-2 focus-visible:ring-offset-2",
          baseClass,
        )}
      >
        {row}
        {chip}
        <span className="sr-only">{currentWord}</span>
      </button>
      {status}
    </>
  );
}

type TurnCellProps = {
  /** The letter this cell settles on for the commanded side. */
  target: string;
  /** This cell's slice of the wave, seconds — applied only from rest. */
  delay: number;
  /** +1 turns forward (toward word B), -1 turns back. */
  direction: 1 | -1;
};

/**
 * One letter cell. The half-flip chain runs imperatively on a per-cell
 * rotateY motion value: tween to ±90° (edge-on), swap the rendered glyph in
 * the animation callback, land at 0° on `springs.snap`. Cells whose shown
 * glyph already matches the target hold still — the identical-letter polish —
 * and a cell interrupted before its midpoint simply springs back upright.
 * Every retarget and the unmount cleanup stop the in-flight controls; a
 * cancellation flag keeps a stopped away-leg from ever committing its swap.
 */
function TurnCell({ target, delay, direction }: TurnCellProps) {
  const [shown, setShown] = React.useState({ glyph: target, swap: 0 });
  const glyphRef = React.useRef(target);
  const rotateY = useMotionValue(0);
  const controls = React.useRef<ReturnType<typeof animate> | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (glyphRef.current === target) {
      // Held or already-settled letter. If an interrupted turn left the cell
      // tilted with its old glyph still up, land it back — no swap happened.
      if (rotateY.get() !== 0) {
        controls.current?.stop();
        controls.current = animate(rotateY, 0, springs.snap);
      }
    } else {
      // Half-flip: away on the tween, swap at the midpoint, land on snap.
      // A retargeted cell enters mid-tilt and turns on from its current
      // angle immediately — the wave slice only applies from rest.
      controls.current?.stop();
      controls.current = animate(rotateY, 90 * direction, {
        delay: rotateY.get() === 0 ? delay : 0,
        duration: durations.fast,
        ease: easings.move,
        onComplete: () => {
          if (cancelled) return;
          glyphRef.current = target;
          setShown((previous) => ({ glyph: target, swap: previous.swap + 1 }));
          controls.current = animate(rotateY, 0, springs.snap);
        },
      });
    }
    return () => {
      cancelled = true;
      controls.current?.stop();
      controls.current = null;
    };
  }, [target, delay, direction, rotateY]);

  return (
    <motion.span
      className="relative inline-flex w-[1.2ch] justify-center"
      style={{ rotateY }}
    >
      {shown.glyph}
      {/* Fresh ink: each swapped-in glyph lands tinted, then dries to ink. */}
      {shown.swap > 0 && (
        <motion.span
          key={shown.swap}
          className="pointer-events-none absolute inset-0 flex justify-center"
          style={{ color: "var(--accent-bright)" }}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: durations.slow, ease: easings.exit }}
        >
          {shown.glyph}
        </motion.span>
      )}
    </motion.span>
  );
}
