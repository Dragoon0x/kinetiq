"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useIsPresent,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type Arrival = {
  id: string;
  /** The member's name; spoken with the room. */
  name: string;
  /** One short line under the name — how they came in. */
  note?: string;
};

export type JoinToastProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Who has joined, oldest first. The host removes them in `onDismiss`. */
  arrivals: Arrival[];
  /** The room's name, spoken in every card's sentence. */
  room: string;
  /** Milliseconds a card stays before it clears itself; 0 or less keeps it. @default 4200 */
  duration?: number;
  /** Cards shown before the older ones fold into the summary line. @default 3 */
  max?: number;
  onDismiss?: (id: string, reason: "timer" | "action") => void;
  /** Fires when Escape clears the whole stack. */
  onClear?: () => void;
  /** Fires as the pointer or focus enters and leaves the stack. */
  onHoldChange?: (held: boolean) => void;
  /** The room content the stack sits above and pushes down. */
  children?: React.ReactNode;
  className?: string;
};

const FADE = { duration: durations.fast, ease: easings.enter } as const;

const TONES = [
  "bg-cobalt-wash text-cobalt-bright",
  "bg-success/15 text-success",
  "bg-warn/15 text-warn",
  "bg-signal/15 text-signal",
] as const;

/** A name always lands on the same tone, on the server and the client alike. */
const toneFor = (name: string) => {
  let sum = 0;
  for (let i = 0; i < name.length; i += 1) sum += name.charCodeAt(i);
  return TONES[sum % TONES.length] ?? TONES[0];
};

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => !document.hidden;
const getServerVisible = () => true;

/** Keeps a callback out of an effect's dependencies so a re-render cannot restart a timer. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

type DrainOptions = {
  duration: number;
  held: boolean;
  visible: boolean;
  onDone: () => void;
};

/**
 * One card's life, 1 → 0. Holding the remainder in a motion value rather than
 * state is what makes the pause free: stop the animation, resume from what is
 * left, and nothing re-renders in between — and no clock is ever read.
 */
function useDrain({ duration, held, visible, onDone }: DrainOptions) {
  const left = useMotionValue(1);
  const doneRef = useLatest(onDone);
  // A card already leaving stops counting: its last frames would otherwise
  // report an expiry for an arrival the host has already taken away.
  const present = useIsPresent();

  React.useEffect(() => {
    if (held || !visible || duration <= 0 || !present) return;
    const controls = animate(left, 0, {
      // A countdown is information, so it runs at the same linear rate
      // whatever the motion preference.
      duration: (duration / 1000) * left.get(),
      ease: easings.linear,
      onComplete: () => doneRef.current?.(),
    });
    return () => controls.stop();
  }, [duration, held, visible, present, left, doneRef]);

  return left;
}

/** A folded arrival keeps its own timer, so the summary line drains instead of settling. */
function FoldedTimer(options: DrainOptions) {
  useDrain(options);
  return null;
}

type CardProps = {
  arrival: Arrival;
  room: string;
  duration: number;
  held: boolean;
  visible: boolean;
  motionSafe: boolean;
  onDismiss?: (id: string, reason: "timer" | "action") => void;
};

function ArrivalCard({
  arrival,
  room,
  duration,
  held,
  visible,
  motionSafe,
  onDismiss,
}: CardProps) {
  const left = useDrain({
    duration,
    held,
    visible,
    onDone: () => onDismiss?.(arrival.id, "timer"),
  });
  // Rounded before it reaches a motion string: an unrounded percentage never
  // hydrates cleanly against what the server painted.
  const width = useTransform(left, (v) => `${Math.round(v * 1000) / 10}%`);

  return (
    <motion.li
      aria-label={`${arrival.name} joined ${room}`}
      layout={motionSafe ? "position" : false}
      initial={
        motionSafe ? { opacity: 0, y: -distances.shift } : { opacity: 0 }
      }
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        y: motionSafe ? -distances.step : 0,
        transition: exitFor(),
      }}
      transition={
        motionSafe
          ? { ...springs.recoil, opacity: FADE, layout: springs.glide }
          : { duration: durations.fast }
      }
      className={cn(
        "relative flex items-center gap-2.5 overflow-hidden rounded-3 border px-3 py-2",
        "border-hairline-strong bg-popover text-popover-foreground shadow-raised",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold",
          toneFor(arrival.name),
        )}
      >
        {initialsOf(arrival.name)}
      </span>

      <span aria-hidden className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm leading-snug">
          <span className="font-medium">{arrival.name}</span> joined
        </span>
        {arrival.note ? (
          <span className="truncate text-[11px] leading-snug text-ink-3">
            {arrival.note}
          </span>
        ) : null}
      </span>

      <button
        type="button"
        aria-label={`Dismiss ${arrival.name} joined`}
        onClick={() => onDismiss?.(arrival.id, "action")}
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors outline-none",
          "hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
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

      {duration > 0 ? (
        <motion.span
          aria-hidden
          style={{ width }}
          className="absolute inset-x-0 bottom-0 h-px bg-cobalt-bright/70"
        />
      ) : null}
    </motion.li>
  );
}

/**
 * Someone arrived. A card lands above the room's own content on `recoil` —
 * ζ0.53, the two bounces of something landing on a stack — from 16px up, while
 * the cards already there glide down through `layout`, so the stack opens
 * rather than reflowing in a single frame. Each card carries its own timer as a
 * motion value draining linearly to zero, shown as a hairline under it, and
 * clears itself on the exit ease when it empties, because a departure never
 * springs.
 *
 * The stack lives inside the component's own box, in flow above `children`:
 * nothing floats over what the host wrote, and a ResizeObserver measures the
 * room the cards need so an empty stack reserves none of it. Past `max` the
 * older arrivals fold into one summary line whose count rolls on `snap` and
 * whose folded timers keep running headlessly, so a burst can never grow the
 * box without bound and never leaves a card stranded.
 *
 * Pointing at the stack or focusing inside it holds every timer where it stands
 * and leaving resumes it, so reading an arrival never costs the chance to act on
 * it. Every card is an `<li>` whose accessible name is a sentence, each has a
 * real dismiss button, Escape clears the stack, and a polite status region
 * speaks the newest arrival once. Under reduced motion the cards fade in place,
 * the height swaps on a tween, and the timers still run.
 */
export function JoinToast({
  ref,
  arrivals,
  room,
  duration = 4200,
  max = 3,
  onDismiss,
  onClear,
  onHoldChange,
  children,
  className,
}: JoinToastProps) {
  const motionSafe = useMotionSafe();
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );
  const [held, setHeld] = React.useState(false);

  const hold = (next: boolean) => {
    setHeld(next);
    onHoldChange?.(next);
  };

  const keep = Math.max(1, Math.floor(max));
  // Newest first: an arrival lands on top and pushes the rest down.
  const shown = arrivals.slice(-keep).reverse();
  const folded = arrivals.slice(0, Math.max(0, arrivals.length - keep));

  // Announce each arrival once. Comparing against the ids already spoken is
  // what keeps a dismissal from re-announcing whichever card is now last.
  const latest = arrivals[arrivals.length - 1];
  const [spoken, setSpoken] = React.useState<{ ids: string[]; text: string }>(
    () => ({ ids: arrivals.map((item) => item.id), text: "" }),
  );
  if (latest && !spoken.ids.includes(latest.id)) {
    setSpoken({
      ids: [...spoken.ids.slice(-9), latest.id],
      text: `${latest.name} joined ${room}`,
    });
  }

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      setHeight(Math.round(box ? box.blockSize : node.offsetHeight));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={cn("flex w-full flex-col", className)}>
      <motion.div
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className="overflow-hidden"
      >
        <div ref={innerRef}>
          <ul
            role="list"
            aria-label={`Arrivals in ${room}`}
            onPointerEnter={() => hold(true)}
            onPointerLeave={() => hold(false)}
            onFocus={() => hold(true)}
            onBlur={() => hold(false)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && arrivals.length > 0) {
                event.preventDefault();
                onClear?.();
              }
            }}
            className={cn(
              "flex flex-col gap-1.5",
              arrivals.length > 0 && "pb-3",
            )}
          >
            <AnimatePresence initial={false}>
              {shown.map((arrival) => (
                <ArrivalCard
                  key={arrival.id}
                  arrival={arrival}
                  room={room}
                  duration={duration}
                  held={held}
                  visible={visible}
                  motionSafe={motionSafe}
                  onDismiss={onDismiss}
                />
              ))}
            </AnimatePresence>

            {folded.length > 0 ? (
              <li
                aria-label={`${folded.length} more joined earlier`}
                className="flex items-center gap-1.5 px-1 text-[11px] text-ink-3"
              >
                {folded.map((arrival) => (
                  <FoldedTimer
                    key={arrival.id}
                    duration={duration}
                    held={held}
                    visible={visible}
                    onDone={() => onDismiss?.(arrival.id, "timer")}
                  />
                ))}
                <span aria-hidden className="grid overflow-hidden">
                  <AnimatePresence initial={false}>
                    <motion.span
                      key={folded.length}
                      initial={
                        motionSafe
                          ? { y: distances.step, opacity: 0 }
                          : { opacity: 0 }
                      }
                      animate={{ y: 0, opacity: 1 }}
                      exit={{
                        y: motionSafe ? -distances.step : 0,
                        opacity: 0,
                        transition: exitFor(durations.fast),
                      }}
                      transition={
                        motionSafe ? { y: springs.snap, opacity: FADE } : FADE
                      }
                      className="col-start-1 row-start-1 font-mono tabular-nums"
                    >
                      {folded.length}
                    </motion.span>
                  </AnimatePresence>
                </span>
                <span aria-hidden>more joined earlier</span>
              </li>
            ) : null}
          </ul>
        </div>
      </motion.div>

      {children}

      <span role="status" aria-live="polite" aria-atomic className="sr-only">
        {spoken.text}
      </span>
    </div>
  );
}
