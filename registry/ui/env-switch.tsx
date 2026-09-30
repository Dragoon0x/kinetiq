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

export type EnvStop = {
  id: string;
  /** Short name printed on the rail: yard, dock, live. */
  name: string;
  /** Where this stop points; printed under the service. */
  host: string;
  /** A guarded stop arms a confirm instead of committing on the first press. */
  guarded?: boolean;
};

export type EnvSwitchProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The environments, left to right. */
  stops: EnvStop[];
  /** What is being pointed somewhere; printed in the head. */
  service: string;
  /** Controlled committed stop id. */
  value?: string;
  /** Initial committed stop id for uncontrolled usage. */
  defaultValue?: string;
  /** Fires from the press or key that committed a stop. */
  onValueChange?: (id: string) => void;
  /** The armed guarded stop, or null — a state, so it also fires on mount. */
  onArmedChange?: (id: string | null) => void;
  /** Copy on the confirm control. */
  armLabel?: (stop: EnvStop) => string;
  /** Names the rail for assistive technology. @default "Environment" */
  label?: string;
  className?: string;
};

type Tone = "quiet" | "cobalt" | "live";

const WASH: Record<Tone, string> = {
  quiet: "bg-surface-2",
  cobalt: "bg-cobalt-wash",
  live: "bg-warn/12",
};

const KNOB: Record<Tone, string> = {
  quiet: "bg-surface-2",
  cobalt: "bg-cobalt-wash",
  live: "bg-warn/15",
};

const TEXT: Record<Tone, string> = {
  quiet: "text-ink",
  cobalt: "text-cobalt-bright",
  live: "text-warn",
};

/** The first stop is the quiet one, a guarded stop is the loud one, and
 *  everything between is interactive cobalt — one rule, no per-stop colour prop. */
const toneOf = (stop: EnvStop, index: number): Tone =>
  stop.guarded ? "live" : index === 0 ? "quiet" : "cobalt";

/** Stop names are written lowercase; a spoken sentence still opens capitalised. */
const sentenceCase = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1);

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

/**
 * Where the next command lands. Three stops share one rail and the knob travels
 * between them on `glide` under a `useId()`-prefixed `layoutId` — crossing the
 * rail is a layout move, not a toggle's click, and the prefix keeps two switches
 * on a page from swapping knobs. The head washes as the stop changes: a tinted
 * layer cross-fades on a `durations.base` tween, quiet for the first stop,
 * cobalt for the middle, warn for a guarded one.
 *
 * A guarded stop never commits on the first press. It arms, and a confirm row
 * unfolds in flow beneath the rail at a ResizeObserver-measured height — never
 * an overlay hung outside the component's own box — with its button focused when
 * it ARRIVES, held in state by a ref callback and focused from an effect keyed
 * on that node, because a focus call aimed at a guessed frame lands on nothing
 * and drops the keyboard on the body. Escape or Cancel disarms and hands focus
 * back to the stop.
 *
 * Every host comes from props, so the switch never invents a name or reads a
 * clock. Under reduced motion the knob does not travel — the selected fill
 * cross-fades instead — while the wash and the host line still swap, because
 * which environment you are pointed at is information rather than flourish.
 */
export function EnvSwitch({
  ref,
  stops,
  service,
  value,
  defaultValue,
  onValueChange,
  onArmedChange,
  armLabel = (stop) => `Switch to ${stop.name}`,
  label = "Environment",
  className,
}: EnvSwitchProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const copyId = `${baseId}-confirm-copy`;

  const first = stops[0];
  const [ownValue, setOwnValue] = React.useState(
    defaultValue ?? first?.id ?? "",
  );
  const committedId = value !== undefined ? value : ownValue;
  const committed = stops.find((stop) => stop.id === committedId) ?? first;

  const [armedId, setArmedId] = React.useState<string | null>(null);
  const armed = armedId ? stops.find((stop) => stop.id === armedId) : undefined;
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [spoken, setSpoken] = React.useState("");

  // A stop that leaves the prop list can no longer be armed, and the caret has
  // to land somewhere real. Reconciled in render off an anchor rather than in an
  // effect, so no committed pass ever points at a stop that is gone.
  const roster = stops.map((stop) => stop.id).join(",");
  const [anchor, setAnchor] = React.useState(roster);
  if (anchor !== roster) {
    setAnchor(roster);
    if (armedId && !stops.some((stop) => stop.id === armedId)) setArmedId(null);
    if (focusId && !stops.some((stop) => stop.id === focusId)) setFocusId(null);
  }

  // A stop committed from outside settles the question the arm was asking, so
  // the pending confirm is stale and goes. Compared in render, off an anchor:
  // an effect would show one committed pass with a confirm for a decision that
  // has already been made.
  const [valueAnchor, setValueAnchor] = React.useState(committedId);
  if (valueAnchor !== committedId) {
    setValueAnchor(committedId);
    if (armedId) setArmedId(null);
  }

  const armedRef = React.useRef(onArmedChange);
  React.useEffect(() => {
    armedRef.current = onArmedChange;
  });
  // Armed is a state, not an event: a host that mounts beside the switch reads
  // the same thing the switch does, from the first commit.
  React.useEffect(() => {
    armedRef.current?.(armedId);
  }, [armedId]);

  const [rowNode, setRowNode] = React.useState<HTMLDivElement | null>(null);
  const [rowHeight, setRowHeight] = React.useState(0);
  React.useEffect(() => {
    if (!rowNode || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setRowHeight(Math.round(entry.contentRect.height));
    });
    observer.observe(rowNode);
    return () => observer.disconnect();
  }, [rowNode]);

  const [confirmNode, setConfirmNode] =
    React.useState<HTMLButtonElement | null>(null);
  // Bound to the node when it ARRIVES: the confirm does not exist on the frame
  // the press happened, so a focus call fired then would land nowhere.
  React.useEffect(() => {
    confirmNode?.focus();
  }, [confirmNode]);

  const focusStop = (id: string) => {
    setFocusId(id);
    document.getElementById(`${baseId}-stop-${id}`)?.focus();
  };

  const commit = (stop: EnvStop) => {
    if (value === undefined) setOwnValue(stop.id);
    setArmedId(null);
    setSpoken(`Now pointing at ${stop.name}, ${stop.host}.`);
    onValueChange?.(stop.id);
  };

  const arm = (stop: EnvStop) => {
    setArmedId(stop.id);
    setSpoken(
      `${sentenceCase(stop.name)} is armed. Confirm to point ${service} at ${stop.host}.`,
    );
  };

  const disarm = () => {
    if (!armed) return;
    setArmedId(null);
    setSpoken(
      `${sentenceCase(armed.name)} cancelled, still pointing at ${committed ? committed.name : "no stop"}.`,
    );
    focusStop(armed.id);
  };

  const select = (stop: EnvStop) => {
    if (stop.id === committedId) {
      if (armedId) disarm();
      return;
    }
    if (stop.guarded) arm(stop);
    else commit(stop);
  };

  const move = (index: number) => {
    const next = stops[Math.min(stops.length - 1, Math.max(0, index))];
    if (!next) return;
    focusStop(next.id);
    // Arrowing onto a guarded stop moves focus only. Arming here would pull
    // focus into the confirm row mid-travel and strand the arrow keys.
    if (!next.guarded && next.id !== committedId) commit(next);
  };

  const onStopKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      move(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      move(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      move(0);
    } else if (event.key === "End") {
      event.preventDefault();
      move(stops.length - 1);
    }
  };

  const tabbable =
    focusId && stops.some((stop) => stop.id === focusId)
      ? focusId
      : (committed?.id ?? "");
  const headTone: Tone = committed
    ? toneOf(committed, stops.indexOf(committed))
    : "quiet";
  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const wash = { duration: durations.base, ease: easings.enter } as const;
  const settle = motionSafe ? springs.glide : wash;

  return (
    <div
      ref={ref}
      onKeyDown={(event) => {
        if (event.key === "Escape" && armedId) {
          event.preventDefault();
          disarm();
        }
      }}
      className={cn(
        "w-full overflow-clip rounded-3 border border-hairline bg-surface-1 [contain:paint]",
        className,
      )}
    >
      <div className="relative border-b border-hairline px-3 py-2">
        {/* The wash is the head's own colour, not a badge: two layers stack in
            the same box and cross-fade so the change reads as a wash. */}
        <AnimatePresence initial={false}>
          <motion.span
            key={headTone}
            aria-hidden
            className={cn("absolute inset-0", WASH[headTone])}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.base) }}
            transition={wash}
          />
        </AnimatePresence>

        <div className="relative flex flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium text-ink">
              {service}
            </span>
            {committed?.guarded ? (
              <span className="shrink-0 rounded-1 bg-warn/15 px-1.5 py-px font-mono text-[10px] font-semibold tracking-[0.08em] text-warn uppercase">
                guarded
              </span>
            ) : null}
          </span>
          {/* Both readings share one cell and cross-fade: a host line that
              swapped through mode="wait" would blank under fast arrow keys. */}
          <span className="grid h-4 items-center">
            <AnimatePresence initial={false}>
              <motion.span
                key={committed?.id ?? "none"}
                className="col-start-1 row-start-1 truncate font-mono text-[11px] text-ink-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={fade}
              >
                {committed?.host ?? "no stop"}
              </motion.span>
            </AnimatePresence>
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 p-3">
        <div
          role="radiogroup"
          aria-label={label}
          className="flex w-full items-stretch gap-1 rounded-2 border border-hairline bg-surface-0 p-1"
        >
          {stops.map((stop, index) => {
            const tone = toneOf(stop, index);
            const isCommitted = stop.id === committedId;
            const isArmed = stop.id === armedId;
            return (
              <button
                key={stop.id}
                type="button"
                role="radio"
                id={`${baseId}-stop-${stop.id}`}
                aria-checked={isCommitted}
                aria-describedby={isArmed ? copyId : undefined}
                aria-label={`${stop.name}, ${stop.host}${stop.guarded ? ", guarded" : ""}`}
                tabIndex={stop.id === tabbable ? 0 : -1}
                onFocus={() => setFocusId(stop.id)}
                onClick={() => select(stop)}
                onKeyDown={(event) => onStopKeyDown(event, index)}
                className={cn(
                  "relative flex h-8 min-w-0 flex-1 items-center justify-center rounded-1 transition-colors",
                  focusRing,
                  !isCommitted && "hover:bg-accent",
                )}
              >
                {isCommitted ? (
                  motionSafe ? (
                    <motion.span
                      layoutId={`${baseId}-knob`}
                      aria-hidden
                      className={cn(
                        "absolute inset-0 rounded-1 transition-colors",
                        KNOB[tone],
                      )}
                      transition={springs.glide}
                    />
                  ) : (
                    // No travel under reduced motion: the fill arrives in the
                    // stop it belongs to, on a tween, so the state still reads.
                    <motion.span
                      aria-hidden
                      className={cn("absolute inset-0 rounded-1", KNOB[tone])}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={fade}
                    />
                  )
                ) : null}
                <span
                  className={cn(
                    "relative z-10 flex min-w-0 items-center gap-1 font-mono text-[11px] font-medium transition-colors",
                    isCommitted
                      ? TEXT[tone]
                      : isArmed
                        ? "text-warn"
                        : "text-ink-3",
                  )}
                >
                  <span className="truncate">{stop.name}</span>
                  {isArmed ? (
                    <motion.span
                      aria-hidden
                      className="size-1.5 shrink-0 rounded-full bg-warn"
                      initial={motionSafe ? { scale: 0.4 } : { opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={motionSafe ? springs.flick : fade}
                    />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>

        {/* Measured, never reserved: the wrapper holds nothing at all until the
            confirm exists, and glides to the height the row reports. */}
        <motion.div
          className="overflow-clip [contain:paint]"
          initial={false}
          animate={{ height: armed ? rowHeight : 0 }}
          transition={settle}
        >
          <AnimatePresence initial={false}>
            {armed ? (
              <motion.div
                key={armed.id}
                ref={setRowNode}
                className="flex flex-col gap-2 rounded-2 border border-warn/30 bg-warn/10 p-2"
                initial={
                  motionSafe
                    ? { opacity: 0, y: -distances.nudge }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={motionSafe ? springs.snap : fade}
              >
                <p
                  id={copyId}
                  className="font-mono text-[11px] leading-snug text-warn"
                >
                  {service} moves to {armed.host}. This stop is guarded.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    ref={setConfirmNode}
                    type="button"
                    onClick={() => {
                      commit(armed);
                      focusStop(armed.id);
                    }}
                    className={cn(
                      "flex h-8 items-center rounded-2 bg-warn/20 px-3 font-mono text-[11px] font-medium text-warn transition-colors hover:bg-warn/30",
                      focusRing,
                    )}
                  >
                    {armLabel(armed)}
                  </button>
                  <button
                    type="button"
                    onClick={disarm}
                    className={cn(
                      "flex h-8 items-center rounded-2 border border-hairline-strong px-3 font-mono text-[11px] font-medium text-ink-2 transition-colors hover:bg-accent",
                      focusRing,
                    )}
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken}
      </span>
    </div>
  );
}
