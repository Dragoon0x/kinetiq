"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type NotifyLevel = "all" | "mentions" | "none";

export type NotifyStop = {
  value: NotifyLevel;
  label: string;
  /** One sentence, with its own full stop; it is spoken as part of the radio's name. */
  description: string;
};

export type NotifyToggleProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled level. */
  value?: NotifyLevel;
  /** Initial level for uncontrolled usage. @default "all" */
  defaultValue?: NotifyLevel;
  /** Fires from the press or key that chose the level. */
  onValueChange?: (value: NotifyLevel) => void;
  /** The sentence the live region just spoke. */
  onAnnounce?: (sentence: string) => void;
  /** The room the setting belongs to, printed and spoken after a hash. */
  room: string;
  /** All / Mentions / Nothing, in that order. */
  stops?: [NotifyStop, NotifyStop, NotifyStop];
  /** The group's visible heading. @default "Notify me" */
  label?: string;
  className?: string;
};

const DEFAULT_STOPS: [NotifyStop, NotifyStop, NotifyStop] = [
  {
    value: "all",
    label: "All",
    description: "Every message in this room.",
  },
  {
    value: "mentions",
    label: "Mentions",
    description: "Only when you are named.",
  },
  {
    value: "none",
    label: "Nothing",
    description: "Nothing until you open it.",
  },
];

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** One string per reading; the description carries its own full stop, so the
 *  sentence never ends in two. */
const stopSentence = (stop: NotifyStop, name: string): string =>
  `${stop.label} for ${name}. ${stop.description}`;

const changeSentence = (stop: NotifyStop, name: string): string =>
  `${name} is set to ${stop.label.toLowerCase()}. ${stop.description}`;

/** Keeps a callback out of effect dependencies so a re-render cannot re-speak. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * The bell reads the setting. Its outline is one path that is never
 * interpolated — motion cannot morph a `d` whose command count changes — so
 * what differs between the three stops is drawn and undrawn by `pathLength`:
 * two sound arcs for all, an at-mark at the shoulder for mentions, and for
 * nothing the clapper goes with the arcs, the bell tips to rest on `snap` and a
 * rest line draws beneath it. A bell without a clapper cannot ring, which is
 * the honest picture of nothing.
 */
function NotifyBell({
  level,
  motionSafe,
}: {
  level: NotifyLevel;
  motionSafe: boolean;
}) {
  const draw = motionSafe
    ? springs.flick
    : { duration: durations.fast, pathLength: { duration: 0 } };
  const loud = level === "all";
  const named = level === "mentions";
  const quiet = level === "none";

  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-6 shrink-0">
      <motion.g
        style={{ originX: 0.5, originY: 0.7 }}
        initial={false}
        animate={{ rotate: quiet && motionSafe ? -14 : 0 }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      >
        <path {...STROKE} d="M7.2 15.6v-4.4a4.8 4.8 0 0 1 9.6 0v4.4" />
        <path {...STROKE} d="M5.6 15.6h12.8" />
        <motion.path
          {...STROKE}
          d="M10 18.4a2.2 2.2 0 0 0 4 0"
          initial={false}
          animate={{ pathLength: quiet ? 0 : 1, opacity: quiet ? 0 : 1 }}
          transition={draw}
        />
      </motion.g>

      <motion.path
        {...STROKE}
        d="M4.4 6.6A7.6 7.6 0 0 0 2.8 10.8"
        initial={false}
        animate={{ pathLength: loud ? 1 : 0, opacity: loud ? 1 : 0 }}
        transition={draw}
      />
      <motion.path
        {...STROKE}
        d="M19.6 6.6a7.6 7.6 0 0 1 1.6 4.2"
        initial={false}
        animate={{ pathLength: loud ? 1 : 0, opacity: loud ? 1 : 0 }}
        transition={draw}
      />

      {/* `pathLength` lives on each drawn element rather than on a group: a
          group has no length of its own, so a `g` would animate nothing. */}
      <motion.circle
        {...STROKE}
        cx="18.6"
        cy="5.8"
        r="1.2"
        className="text-cobalt-bright"
        initial={false}
        animate={{ pathLength: named ? 1 : 0, opacity: named ? 1 : 0 }}
        transition={draw}
      />
      <motion.path
        {...STROKE}
        d="M19.8 5.8v1a1.5 1.5 0 0 0 2.4-1.2 3.6 3.6 0 1 0-1.5 2.9"
        className="text-cobalt-bright"
        initial={false}
        animate={{ pathLength: named ? 1 : 0, opacity: named ? 1 : 0 }}
        transition={draw}
      />

      <motion.path
        {...STROKE}
        d="M6.4 21h11.2"
        initial={false}
        animate={{ pathLength: quiet ? 1 : 0, opacity: quiet ? 1 : 0 }}
        transition={draw}
      />
    </svg>
  );
}

/**
 * The three honest answers to how much of a room you want: everything, only
 * when you are named, nothing. One knob rides a three-stop track, carried by a
 * shared `layoutId` and joined on `glide`, so the same knob travels rather than
 * three knobs blinking.
 *
 * Under the track a wheel of descriptions slides to match. A single
 * ResizeObserver measures all three lines, the strip translates by the sum of
 * the heights above the chosen one and the window's height joins that line's own
 * height, both on `glide` — so nothing is clipped at any width and no room is
 * reserved for the longest line. The bell beside the track morphs with the
 * choice on `flick`, the confirmation spring, drawing and undrawing its arcs,
 * its at-mark and its clapper rather than interpolating a `d`.
 *
 * It is a real radio group: a roving tabindex where Left and Right step without
 * wrapping past the ends, Home and End jump to all and nothing, and Space or
 * Enter selects. Each radio is named as one sentence including its description,
 * so the wheel itself stays out of the accessibility tree and a reader is never
 * read three descriptions; a polite region speaks one frozen sentence per
 * change. Under reduced motion no knob travels — the checked stop draws its own
 * pill — the wheel swaps, and the bell's marks cross-fade at full length rather
 * than drawing.
 */
export function NotifyToggle({
  ref,
  value,
  defaultValue = "all",
  onValueChange,
  onAnnounce,
  room,
  stops = DEFAULT_STOPS,
  label = "Notify me",
  className,
}: NotifyToggleProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const knobId = `${baseId}-knob`;
  const name = `#${room}`;

  const [own, setOwn] = React.useState<NotifyLevel>(defaultValue);
  const current = value ?? own;
  const index = Math.max(
    0,
    stops.findIndex((stop) => stop.value === current),
  );

  const [beat, setBeat] = React.useState({ sentence: "", stamp: 0 });
  const announceRef = useLatest(onAnnounce);
  React.useEffect(() => {
    if (beat.sentence) announceRef.current?.(beat.sentence);
  }, [beat.stamp, beat.sentence, announceRef]);

  // Reported from the setter that caused the change, never from an effect
  // watching the value: under a controlled parent the value cannot move until
  // the host answers, and a control that waits for itself never works.
  const select = (stop: NotifyStop) => {
    if (stop.value === current) return;
    if (value === undefined) setOwn(stop.value);
    onValueChange?.(stop.value);
    setBeat({ sentence: changeSentence(stop, name), stamp: beat.stamp + 1 });
  };

  const focusAt = (next: number) => {
    const clamped = Math.min(stops.length - 1, Math.max(0, next));
    const stop = stops[clamped];
    if (!stop) return;
    document.getElementById(`${baseId}-stop-${stop.value}`)?.focus();
    select(stop);
  };

  const onKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    at: number,
  ) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusAt(at + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusAt(at - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusAt(stops.length - 1);
    } else if (event.key === " ") {
      event.preventDefault();
      const stop = stops[at];
      if (stop) select(stop);
    }
  };

  // The wheel measures its own lines, so the window is exact at any width and
  // no height is reserved for the longest description.
  const lineRefs = React.useRef<(HTMLSpanElement | null)[]>([]);
  const [heights, setHeights] = React.useState<number[]>([]);
  React.useEffect(() => {
    const read = () => {
      const next = lineRefs.current.map((node) =>
        node ? Math.ceil(node.getBoundingClientRect().height) : 0,
      );
      setHeights((prev) =>
        prev.length === next.length && prev.every((one, at) => one === next[at])
          ? prev
          : next,
      );
    };
    // Without an observer the window would stay at zero and the description
    // would never show, so one frame after mount is read instead.
    if (typeof ResizeObserver === "undefined") {
      const frame = requestAnimationFrame(read);
      return () => cancelAnimationFrame(frame);
    }
    const observer = new ResizeObserver(read);
    for (const node of lineRefs.current) if (node) observer.observe(node);
    return () => observer.disconnect();
  }, [stops.length]);

  const offset = heights.slice(0, index).reduce((total, one) => total + one, 0);
  const measured = heights.length === stops.length ? (heights[index] ?? 0) : 0;

  const windowHeight = useMotionValue(0);
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (measured === 0) return;
    // The first measurement is written outright, or the window would grow from
    // nothing on the frame it mounts.
    if (!seeded.current) {
      seeded.current = true;
      windowHeight.set(measured);
      return;
    }
    const controls = animate(
      windowHeight,
      measured,
      motionSafe ? springs.glide : { duration: 0 },
    );
    return () => controls.stop();
  }, [measured, windowHeight, motionSafe]);

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      <div className="flex items-baseline gap-2">
        <span id={labelId} className="text-sm font-semibold text-foreground">
          {label}
        </span>
        <span className="min-w-0 truncate font-mono text-[11px] text-ink-3">
          {name}
        </span>
      </div>

      <div className="flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-hairline bg-surface-0 text-foreground">
          <NotifyBell level={current} motionSafe={motionSafe} />
        </span>

        <div
          role="radiogroup"
          aria-labelledby={labelId}
          className="flex h-9 min-w-0 flex-1 items-stretch rounded-full border border-hairline bg-surface-2 p-1"
        >
          {stops.map((stop, at) => {
            const checked = stop.value === current;
            return (
              <button
                key={stop.value}
                type="button"
                role="radio"
                aria-checked={checked}
                id={`${baseId}-stop-${stop.value}`}
                tabIndex={at === index ? 0 : -1}
                aria-label={stopSentence(stop, name)}
                onClick={() => select(stop)}
                onKeyDown={(event) => onKeyDown(event, at)}
                className={cn(
                  "relative flex min-w-0 flex-1 items-center justify-center rounded-full px-2 text-xs font-medium transition-colors",
                  checked ? "text-foreground" : "text-ink-3 hover:text-ink",
                  focusRing,
                )}
              >
                {checked &&
                  (motionSafe ? (
                    <motion.span
                      aria-hidden
                      layoutId={knobId}
                      transition={springs.glide}
                      className="absolute inset-0 rounded-full border border-hairline bg-surface-0 shadow-raised"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-full border border-hairline bg-surface-0 shadow-raised"
                    />
                  ))}
                <span className="relative truncate">{stop.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* The wheel is decoration: the chosen line already lives in the checked
          radio's name, so a reader is never read all three. */}
      <motion.div
        aria-hidden
        style={{ height: windowHeight }}
        className="overflow-clip [contain:paint]"
      >
        <motion.div
          initial={false}
          animate={{ y: -offset }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        >
          {stops.map((stop, at) => (
            <motion.span
              key={stop.value}
              ref={(node: HTMLSpanElement | null) => {
                lineRefs.current[at] = node;
              }}
              className="block text-xs leading-snug text-ink-2"
              initial={false}
              animate={{ opacity: at === index ? 1 : 0.3 }}
              transition={fade}
            >
              {stop.description}
            </motion.span>
          ))}
        </motion.div>
      </motion.div>

      <p role="status" aria-live="polite" className="sr-only">
        {beat.sentence}
      </p>
    </div>
  );
}
