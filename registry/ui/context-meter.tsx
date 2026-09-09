"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ContextMessage = {
  id: string;
  /** Tokens this message occupies in the window. */
  tokens: number;
  /** Who wrote it; a summary is what older messages were folded into. @default "user" */
  kind?: "user" | "model" | "summary";
};

export type ContextMeterProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The window's contents, oldest first. */
  messages: ContextMessage[];
  /** The window size in tokens. */
  limit: number;
  /** Fraction of the window at which the ring warns and offers to summarise. @default 0.8 */
  warnAt?: number;
  /** Fires from the Summarise button; fold older messages into one here. */
  onSummarize?: () => void;
  /** Names the meter. */
  label: string;
  /** Token readout. @default compact, "38.4k" */
  format?: (tokens: number) => string;
  className?: string;
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
/** Breathing room between arcs, as a fraction of the ring. */
const GAP = 0.008;
const RADIUS = 42;
const STROKE = 9;

const round4 = (n: number) => Number(n.toFixed(4));
const compact = (tokens: number): string =>
  tokens >= 1000
    ? `${(tokens / 1000).toFixed(1).replace(/\.0$/, "")}k`
    : String(Math.round(tokens));
const plain = new Intl.NumberFormat("en-US");

/** Digits that roll on `snap`; hidden because the meter's value text carries the number. */
function RollingNumber({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const text = String(Math.max(0, Math.round(value)));
  return (
    <span aria-hidden className="inline-flex tabular-nums">
      {text.split("").map((char, index) => (
        <span
          // Keyed from the right so the units column keeps its identity.
          key={text.length - index}
          className="relative inline-block h-[1.25em] w-[1ch] overflow-hidden"
        >
          <motion.span
            className="absolute inset-x-0 top-0 flex flex-col"
            initial={false}
            animate={{
              y: `${Math.max(0, DIGITS.indexOf(char as (typeof DIGITS)[number])) * -10}%`,
            }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            {DIGITS.map((face) => (
              <span key={face} className="flex h-[1.25em] justify-center">
                {face}
              </span>
            ))}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/**
 * How much of the window is used. The ring's stroke is one arc per message,
 * laid end to end from twelve o'clock with a hairline gap between them. A
 * new message's arc draws from nothing to its share on `glide` — a quantity
 * settling, no overshoot — and every earlier arc slides to its new start on
 * the same spring, so the ring reads as a stack of contributions rather than
 * one fill. The centre percentage rolls its digits on `snap`. At `warnAt`
 * the ring turns warn, the status speaks once, and a note with a Summarise
 * control unfolds under measured height; the host answers `onSummarize` by
 * folding older messages into one, whose arc draws in while the folded arcs
 * fade on the exit ease. Past the limit the ring turns danger and the last
 * arc is cut at the end.
 *
 * A `role="meter"` whose value stays inside the window while the value text
 * names the overage; the arcs and rolling digits are decorative. The status
 * region speaks on threshold only — near, then over — never per message.
 * Under reduced motion arcs tween to length, digits swap, and the note fades
 * in without travel.
 */
export function ContextMeter({
  ref,
  messages,
  limit,
  warnAt = 0.8,
  onSummarize,
  label,
  format = compact,
  className,
}: ContextMeterProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const cap = Math.max(1, limit);
  const used = messages.reduce((sum, m) => sum + Math.max(0, m.tokens), 0);
  const fraction = used / cap;
  const over = used > cap;
  const near = !over && fraction >= warnAt;
  const percent = Math.min(999, Math.round(fraction * 100));

  // Each arc owns the slice after the ones before it, cut at the ring's end
  // so an overflowing message cannot lap the ring.
  type Arc = {
    id: string;
    kind: "user" | "model" | "summary";
    start: number;
    length: number;
  };
  const { arcs } = messages.reduce<{ arcs: Arc[]; cursor: number }>(
    (acc, message) => {
      const start = Math.min(1, acc.cursor);
      const share = Math.max(0, message.tokens) / cap;
      const length = Math.max(0, Math.min(1 - start, share) - GAP);
      return {
        cursor: acc.cursor + share,
        arcs: [
          ...acc.arcs,
          {
            id: message.id,
            kind: message.kind ?? "user",
            start: round4(start),
            length: round4(length),
          },
        ],
      };
    },
    { arcs: [], cursor: 0 },
  );

  const tone = over
    ? "text-danger"
    : near
      ? "text-warn"
      : {
          user: "text-cobalt-bright",
          model: "text-cobalt",
          summary: "text-signal",
        };
  const state = over
    ? "Over the window"
    : near
      ? "Near the limit"
      : "Within the window";
  const stateTone = over ? "text-danger" : near ? "text-warn" : "text-ink-3";
  const valueText = over
    ? `${plain.format(used)} of ${plain.format(cap)} tokens, ${plain.format(used - cap)} over the window, ${messages.length} messages`
    : `${plain.format(used)} of ${plain.format(cap)} tokens, ${percent} percent, ${messages.length} messages`;
  const threshold = over
    ? "Context limit reached"
    : near
      ? "Near the context limit"
      : "";
  const [announce, setAnnounce] = React.useState("");

  // The summary is the host's answer, so the region speaks when the messages
  // actually shrink rather than when the button is pressed. Said at arrival
  // with the room it freed, it is a fresh sentence every time, which a region
  // that repeated one line would not be.
  const [seenCount, setSeenCount] = React.useState(messages.length);
  if (messages.length !== seenCount) {
    if (messages.length < seenCount) {
      setAnnounce(`Summarised, ${percent} percent used`);
    }
    setSeenCount(messages.length);
  }

  // The note's height is measured from its content and never reserved, so
  // an idle meter is exactly the ring and its readout.
  const noteRef = React.useRef<HTMLDivElement | null>(null);
  const [noteHeight, setNoteHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = noteRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setNoteHeight(Math.round(node.getBoundingClientRect().height)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const settle = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex flex-col gap-3">
        <div className="flex h-6 items-center justify-between gap-3">
          <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
            {label}
          </span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={state}
              className={cn(
                "shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase",
                stateTone,
              )}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={fade}
            >
              {state}
            </motion.span>
          </AnimatePresence>
        </div>

        <div
          role="meter"
          aria-labelledby={labelId}
          aria-valuemin={0}
          aria-valuemax={cap}
          aria-valuenow={Math.min(used, cap)}
          aria-valuetext={valueText}
          className="flex items-center gap-4"
        >
          <div className="relative aspect-square w-1/3 max-w-32 shrink-0">
            <svg viewBox="0 0 100 100" aria-hidden className="size-full">
              <circle
                cx="50"
                cy="50"
                r={RADIUS}
                fill="none"
                stroke="currentColor"
                strokeWidth={STROKE}
                className={cn(
                  "transition-colors",
                  over ? "text-danger/20" : "text-hairline-strong",
                )}
              />
              {/* Rotated as a group so twelve o'clock is the start and the
                  arcs need no transform of their own. */}
              <g transform="rotate(-90 50 50)">
                <AnimatePresence initial={false}>
                  {arcs.map((arc) => (
                    <motion.circle
                      key={arc.id}
                      cx="50"
                      cy="50"
                      r={RADIUS}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={STROKE}
                      className={cn(
                        "transition-colors",
                        typeof tone === "string" ? tone : tone[arc.kind],
                      )}
                      initial={{ pathLength: 0, pathOffset: arc.start }}
                      animate={{
                        pathLength: arc.length,
                        pathOffset: arc.start,
                        opacity: 1,
                      }}
                      exit={{ opacity: 0, transition: exitFor() }}
                      transition={settle}
                    />
                  ))}
                </AnimatePresence>
              </g>
            </svg>
            <span
              aria-hidden
              className="absolute inset-0 flex flex-col items-center justify-center"
            >
              <span
                className={cn(
                  "flex items-baseline font-mono text-lg leading-none font-semibold tabular-nums transition-colors",
                  over ? "text-danger" : near ? "text-warn" : "text-foreground",
                )}
              >
                <RollingNumber value={percent} motionSafe={motionSafe} />
                <span className="text-xs">%</span>
              </span>
              <span className="mt-1 font-mono text-[9px] tracking-[0.08em] text-ink-3 uppercase">
                used
              </span>
            </span>
          </div>

          <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-ink-3">Used</dt>
            <dd className="min-w-0 truncate font-mono tabular-nums">
              <span className="font-medium text-foreground">
                {format(used)}
              </span>
              <span className="text-ink-3"> / {format(cap)}</span>
            </dd>
            <dt className="text-ink-3">Messages</dt>
            <dd className="font-mono text-foreground tabular-nums">
              {messages.length}
            </dd>
            <dt className="text-ink-3">Free</dt>
            <dd
              className={cn(
                "font-mono tabular-nums transition-colors",
                over ? "text-danger" : "text-foreground",
              )}
            >
              {over ? `−${format(used - cap)}` : format(cap - used)}
            </dd>
          </dl>
        </div>
      </div>

      <motion.div
        initial={false}
        animate={{ height: noteHeight ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className="overflow-hidden"
      >
        <div ref={noteRef} className="relative">
          <AnimatePresence initial={false}>
            {near || over ? (
              <motion.div
                key="note"
                className="flex flex-wrap items-center gap-2 pt-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{
                  opacity: 0,
                  position: "absolute",
                  transition: exitFor(durations.fast),
                }}
                transition={fade}
              >
                <p className="min-w-0 flex-1 text-xs leading-5 text-ink-2">
                  {over
                    ? "The window is full. Summarise older messages to keep going."
                    : "Near the limit. Summarise older messages to free room."}
                </p>
                <button
                  type="button"
                  onClick={() => onSummarize?.()}
                  className={cn(
                    "flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent active:bg-cobalt-wash",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  )}
                >
                  Summarise
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {threshold}
      </span>
      <span role="status" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
