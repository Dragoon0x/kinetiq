"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PinnedNote = {
  id: string;
  author: string;
  text: string;
  /** Pinned time, already formatted by the host. */
  time: string;
};

export type PinnedBarProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** What the bar holds, most recently pinned first. */
  pins: PinnedNote[];
  /** Controlled index of the pin on show; clamped whenever the array shrinks. */
  index?: number;
  /** Initial index for uncontrolled usage. @default 0 */
  defaultIndex?: number;
  /** Fires from the body press and the arrow keys. */
  onIndexChange?: (index: number) => void;
  /** Fires from the unpin control or Delete; the host removes the note. */
  onUnpin?: (id: string) => void;
  /** Fires once per frozen change sentence ("Pin 2 of 3, from Marta Ferreira."). */
  onAnnounce?: (sentence: string) => void;
  /** Names the bar. @default "Pinned" */
  label?: string;
  /** A word for the empty bar. Unset, the bar collapses to nothing. */
  emptyLabel?: string;
  className?: string;
};

const FADE = { duration: durations.fast, ease: easings.enter } as const;

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** A drawn pin: head, collar, needle. */
function PinGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cn("size-4", className)}>
      <circle {...STROKE} cx="8" cy="5.4" r="2.8" fill="currentColor" />
      <path {...STROKE} d="M4.6 8.4h6.8" />
      <path {...STROKE} d="M8 8.4V13.6" />
    </svg>
  );
}

/**
 * Digits roll one place at a time, so 9 → 10 reads as a count and not a redraw.
 * Each place owns an `AnimatePresence`, whose `initial={false}` holds the roll
 * back on first paint and hands every later digit a fresh presence context.
 */
function Roll({ value, motionSafe }: { value: number; motionSafe: boolean }) {
  return (
    <span className="inline-flex tabular-nums">
      {String(value)
        .split("")
        .map((char, place) => (
          <span
            key={place}
            className="relative inline-flex overflow-hidden leading-none"
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={char}
                className="inline-block"
                initial={motionSafe ? { y: -8, opacity: 0 } : { opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{
                  opacity: 0,
                  y: motionSafe ? 8 : 0,
                  transition: exitFor(durations.fast),
                }}
                transition={motionSafe ? springs.snap : FADE}
              >
                {char}
              </motion.span>
            </AnimatePresence>
          </span>
        ))}
    </span>
  );
}

/** Keeps a callback out of effect dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

type Beat = {
  signature: string;
  /** Who wrote each pin the bar last held — an unpinned note can still be named. */
  seen: { id: string; author: string }[];
  sentence: string;
  stamp: number;
};

const CONTROL =
  "transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * The strip above the thread, holding everything pinned to it. One pin shows at
 * a time; pressing the bar cycles to the next and the swap is a slide in the
 * direction of travel — the current line leaves upward while the next rises from
 * below, both on `snap` under `AnimatePresence mode="popLayout"`, so the
 * outgoing line leaves the flow and the incoming one sets the height. Notes are
 * different lengths, so no height is reserved: a ResizeObserver bound to the
 * inner column when the node arrives reports its box and the strip glides to it
 * on `glide` with `overflow-hidden`.
 *
 * The active tick travels its rail on a `useId`-prefixed `layoutId` and the
 * index digit rolls, so the count reads without being read. Unpinning is the
 * third move: the line fades out on the exit ease — a removal never springs —
 * the strip collapses to the next note's measured height, and when the last pin
 * goes the strip collapses to nothing at all rather than leaving an empty band.
 * The body is a real button (Enter and Space cycle, Right and Down step forward,
 * Left and Up step back, Home and End jump to the ends, Delete unpins) whose
 * name is a whole sentence, and a polite region speaks one frozen line per
 * change. Under reduced motion nothing slides: pins cross-fade, the strip's
 * height changes on a tween, and the tick is drawn on its new seat.
 */
export function PinnedBar({
  ref,
  pins,
  index,
  defaultIndex,
  onIndexChange,
  onUnpin,
  onAnnounce,
  label = "Pinned",
  emptyLabel,
  className,
}: PinnedBarProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();

  const [uncontrolled, setUncontrolled] = React.useState(defaultIndex ?? 0);
  const raw = index ?? uncontrolled;
  // Clamped for display only: writing the clamp back would mean a callback
  // fired out of a render, which a controlled parent never asked for.
  const current =
    pins.length === 0 ? 0 : Math.min(pins.length - 1, Math.max(0, raw));
  const pin = pins[current];

  const [direction, setDirection] = React.useState<1 | -1>(1);

  const [height, setHeight] = React.useState<number | null>(null);
  const observerRef = React.useRef<ResizeObserver | null>(null);
  const measure = React.useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      setHeight(Math.round(box ? box.blockSize : node.offsetHeight));
    });
    observer.observe(node);
    observerRef.current = observer;
  }, []);
  React.useEffect(() => () => observerRef.current?.disconnect(), []);

  // The sentence is frozen the moment the bar changes — from these controls or
  // from the host — so the region never re-reads a pin that is already old.
  const signature = `${pins.map((one) => one.id).join(",")}|${current}`;
  const [beat, setBeat] = React.useState<Beat>(() => ({
    signature,
    seen: pins.map((one) => ({ id: one.id, author: one.author })),
    sentence: "",
    stamp: 0,
  }));
  if (beat.signature !== signature) {
    const seen = pins.map((one) => ({ id: one.id, author: one.author }));
    const gone = beat.seen.find(
      (one) => !seen.some((next) => next.id === one.id),
    );
    const left = seen.length === 1 ? "1 pin left" : `${seen.length} pins left`;
    const sentence =
      seen.length === 0
        ? "No pins left."
        : gone
          ? `Unpinned ${gone.author}'s note. ${left}.`
          : pin
            ? `Pin ${current + 1} of ${pins.length}, from ${pin.author}.`
            : beat.sentence;
    setBeat({ signature, seen, sentence, stamp: beat.stamp + 1 });
  }

  const announceRef = useLatest(onAnnounce);
  const firstRun = React.useRef(true);
  React.useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (beat.sentence) announceRef.current?.(beat.sentence);
  }, [beat.stamp, beat.sentence, announceRef]);

  const go = (next: number, way: 1 | -1) => {
    if (pins.length === 0) return;
    const wrapped = ((next % pins.length) + pins.length) % pins.length;
    setDirection(way);
    if (index === undefined) setUncontrolled(wrapped);
    if (wrapped !== current) onIndexChange?.(wrapped);
  };

  const unpin = () => {
    if (pin) onUnpin?.(pin.id);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const { key } = event;
    if (key === "ArrowRight" || key === "ArrowDown") {
      event.preventDefault();
      go(current + 1, 1);
    } else if (key === "ArrowLeft" || key === "ArrowUp") {
      event.preventDefault();
      go(current - 1, -1);
    } else if (key === "Home") {
      event.preventDefault();
      go(0, -1);
    } else if (key === "End") {
      event.preventDefault();
      go(pins.length - 1, 1);
    } else if (key === "Delete" || key === "Backspace") {
      event.preventDefault();
      unpin();
    }
  };

  // The note itself belongs in the name: an aria-label overrides the content
  // it wraps, so a pin a screen reader cannot hear would be a pin it does not
  // have. One string, so nothing is spliced with a stray space.
  const bodySentence = pin
    ? `Pinned by ${pin.author} at ${pin.time}, ${current + 1} of ${pins.length}. ${pin.text} Press for the next pin.`
    : label;
  // The direction rides `custom`, so a line that is already leaving still exits
  // the way the press sent it — an exit animates from the props of its last
  // render, which is exactly where a plain inline target would go stale.
  const travel = motionSafe ? distances.shift : 0;
  const slide = {
    enter: (way: number) => ({ opacity: 0, y: way * travel }),
    middle: { opacity: 1, y: 0 },
    leave: (way: number) => ({
      opacity: 0,
      y: -way * travel,
      transition: exitFor(durations.fast),
    }),
  };

  return (
    <section ref={ref} aria-label={label} className={cn("w-full", className)}>
      <motion.div
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.base, ease: easings.move }
        }
        className="overflow-hidden"
      >
        {/* The measured column carries the bar's own frame, so an empty bar
            occupies nothing at all — no strip is held open for a pin. */}
        <div ref={measure}>
          {pins.length === 0 ? (
            emptyLabel ? (
              <p className="rounded-3 border border-hairline bg-surface-1 px-3 py-2 text-xs text-ink-3">
                {emptyLabel}
              </p>
            ) : null
          ) : (
            <div className="flex items-stretch gap-1 rounded-3 border border-hairline bg-surface-1 p-1.5">
              {/* One item shows at a time, so the list says where it sits:
                  posinset and setsize carry "2 of 3" without a second reading. */}
              <ol role="list" className="flex min-w-0 flex-1">
                <li
                  aria-posinset={current + 1}
                  aria-setsize={pins.length}
                  className="flex min-w-0 flex-1"
                >
                  <button
                    type="button"
                    onClick={() => go(current + 1, 1)}
                    onKeyDown={onKeyDown}
                    aria-label={bodySentence}
                    className={cn(
                      "flex min-w-0 flex-1 items-start gap-2 rounded-2 px-1.5 py-1 text-left",
                      CONTROL,
                    )}
                  >
                    <PinGlyph className="mt-0.5 shrink-0 text-cobalt-bright" />
                    <span aria-hidden className="grid min-w-0 flex-1 gap-0.5">
                      <span className="flex items-baseline gap-1.5">
                        <span className="truncate text-[11px] font-medium text-ink-2">
                          {pin?.author}
                        </span>
                        <span className="shrink-0 text-[11px] text-ink-3 tabular-nums">
                          {pin?.time}
                        </span>
                        <span className="flex-1" />
                        <span className="flex shrink-0 items-center font-mono text-[10px] text-ink-3">
                          <Roll value={current + 1} motionSafe={motionSafe} />
                          <span>{` / ${pins.length}`}</span>
                        </span>
                      </span>
                      {/* popLayout takes the outgoing line out of flow, so the
                      incoming one sets the height the strip glides to. */}
                      <span className="relative grid">
                        <AnimatePresence
                          initial={false}
                          mode="popLayout"
                          custom={direction}
                        >
                          <motion.span
                            key={pin?.id ?? "none"}
                            custom={direction}
                            variants={slide}
                            initial="enter"
                            animate="middle"
                            exit="leave"
                            transition={motionSafe ? springs.snap : FADE}
                            className="col-start-1 row-start-1 line-clamp-2 text-xs leading-snug wrap-break-word text-foreground"
                          >
                            {pin?.text}
                          </motion.span>
                        </AnimatePresence>
                      </span>
                    </span>
                  </button>
                </li>
              </ol>

              {/* One tick per pin; the lit one travels the rail rather than
                  blinking from seat to seat. */}
              <span
                aria-hidden
                className="flex shrink-0 flex-col items-center justify-center gap-1 px-0.5"
              >
                {pins.map((one, seat) => (
                  <span key={one.id} className="relative flex">
                    <span className="block h-1 w-0.5 rounded-full bg-hairline-strong" />
                    {seat === current ? (
                      <motion.span
                        layoutId={motionSafe ? `${uid}-tick` : undefined}
                        transition={springs.snap}
                        className="absolute inset-0 block rounded-full bg-cobalt-bright"
                      />
                    ) : null}
                  </span>
                ))}
              </span>

              <button
                type="button"
                onClick={unpin}
                aria-label={
                  pin ? `Unpin ${pin.author}'s note` : "Unpin this note"
                }
                className={cn(
                  "grid size-8 shrink-0 place-items-center self-center rounded-2 text-ink-3 hover:text-foreground",
                  CONTROL,
                )}
              >
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  className="size-3.5 shrink-0"
                >
                  <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </motion.div>

      <span role="status" aria-live="polite" className="sr-only">
        {beat.sentence}
      </span>
    </section>
  );
}
