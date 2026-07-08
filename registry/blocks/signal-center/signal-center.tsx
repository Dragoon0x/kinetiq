"use client";

import * as React from "react";

import {
  AnimatePresence,
  motion,
  type PanInfo,
  type Variants,
} from "motion/react";
import { Archive, Bell, Inbox } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

/** Swipe power (offset + velocity × weight) a release must exceed to archive. */
const SWIPE_THRESHOLD = 96;
/** Release velocity's weight in the swipe power calculation. */
const VELOCITY_WEIGHT = 0.2;
/** The brake squash releases once the drift approach has mostly landed. */
const SQUASH_DELAY_S = 0.26;
/** Clear-all rows sweep out by this many px as they fade. */
const CLEAR_SWEEP_X = 24;

export type Signal = {
  id: string;
  /** Group label the signal files under, e.g. "CI". */
  source: string;
  title: string;
  detail?: string;
  /** Preformatted timestamp, e.g. "2m". */
  time: string;
  read?: boolean;
};

export type SignalCenterProps = {
  /** Controlled signal list. */
  signals?: Signal[];
  defaultSignals?: Signal[];
  onSignalsChange?: (signals: Signal[]) => void;
  /** Fires per signal as it archives — swipe, row button, or clear all. */
  onArchive?: (signal: Signal) => void;
  title?: string;
  className?: string;
};

/**
 * An inbox that files itself. New signals feed in from the top on `drift`
 * and land with a brake squash on `snap` while siblings close ranks on
 * `glide`; rows swipe out horizontally to archive (offset + velocity decide),
 * clicking marks read with a dot pop, and "Clear all" sweeps the floor
 * top-to-bottom on a `cascade` stagger before the empty state rises and
 * draws its check. Reduced motion trades all of it for fast crossfades and
 * keeps the swipe 1:1.
 */
export function SignalCenter({
  signals: controlledSignals,
  defaultSignals = [],
  onSignalsChange,
  onArchive,
  title = "Signals",
  className,
}: SignalCenterProps) {
  const motionSafe = useMotionSafe();
  const [uncontrolledSignals, setUncontrolledSignals] =
    React.useState<Signal[]>(defaultSignals);
  const signals = controlledSignals ?? uncontrolledSignals;
  const [announcement, setAnnouncement] = React.useState("");

  /** Swipe direction per exiting row id, read at exit-animation time. */
  const exitDirRef = React.useRef(new Map<string, 1 | -1>());
  /** Visual order snapshot while a clear-all sweep is exiting. */
  const clearRef = React.useRef<{
    order: Map<string, number>;
    count: number;
  } | null>(null);
  /** A completed drag suppresses the click it releases into. */
  const suppressClickRef = React.useRef(false);
  const suppressTimerRef = React.useRef(0);

  React.useEffect(
    () => () => window.clearTimeout(suppressTimerRef.current),
    [],
  );

  const unread = signals.filter((signal) => !signal.read).length;

  const setSignals = (next: Signal[]) => {
    if (controlledSignals === undefined) setUncontrolledSignals(next);
    onSignalsChange?.(next);
  };

  /** Feed order: groups appear in first-seen order, rows in list order. */
  const groups = React.useMemo(() => {
    const map = new Map<string, Signal[]>();
    for (const signal of signals) {
      const bucket = map.get(signal.source);
      if (bucket) bucket.push(signal);
      else map.set(signal.source, [signal]);
    }
    return [...map.entries()];
  }, [signals]);

  const archive = (signal: Signal, direction: 1 | -1) => {
    clearRef.current = null;
    exitDirRef.current.set(signal.id, direction);
    setSignals(signals.filter((s) => s.id !== signal.id));
    onArchive?.(signal);
    setAnnouncement(`${signal.title} archived`);
  };

  const markRead = (signal: Signal) => {
    if (signal.read) return;
    setSignals(
      signals.map((s) => (s.id === signal.id ? { ...s, read: true } : s)),
    );
  };

  const clearAll = () => {
    if (signals.length === 0) return;
    const visualOrder = groups.flatMap(([, rows]) => rows);
    clearRef.current = {
      order: new Map(visualOrder.map((s, index) => [s.id, index])),
      count: visualOrder.length,
    };
    setSignals([]);
    for (const signal of signals) onArchive?.(signal);
    setAnnouncement("All signals archived");
  };

  const handleDragStart = () => {
    suppressClickRef.current = true;
  };

  const handleDragEnd = (signal: Signal) => (_: unknown, info: PanInfo) => {
    // The click this release produces is stale; let it die, then re-arm.
    window.clearTimeout(suppressTimerRef.current);
    suppressTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
    const power = info.offset.x + info.velocity.x * VELOCITY_WEIGHT;
    if (Math.abs(power) > SWIPE_THRESHOLD) {
      archive(signal, power > 0 ? 1 : -1);
    }
  };

  const guarded = (action: () => void) => () => {
    if (suppressClickRef.current) return;
    action();
  };

  /** Exit resolves at animation time: clear-all sweep beats swipe direction. */
  const rowVariants = (id: string): Variants => ({
    enter: motionSafe
      ? { y: -distances.shift, scaleY: 0.97, opacity: 0 }
      : { opacity: 0 },
    settle: motionSafe
      ? {
          y: 0,
          scaleY: 1,
          opacity: 1,
          transition: {
            // The drift approach reads as the conveyor brake; the delayed
            // squash release lands the row in its slot.
            y: springs.drift,
            scaleY: { ...springs.snap, delay: SQUASH_DELAY_S },
            opacity: { duration: durations.base, ease: easings.enter },
          },
        }
      : { opacity: 1, transition: { duration: durations.fast } },
    exit: () => {
      if (!motionSafe) {
        return { opacity: 0, transition: { duration: durations.fast } };
      }
      const clearing = clearRef.current;
      if (clearing) {
        const index = clearing.order.get(id) ?? 0;
        return {
          x: CLEAR_SWEEP_X,
          opacity: 0,
          transition: {
            ...exitFor(durations.base),
            delay: index * cascade(clearing.count),
          },
        };
      }
      const direction = exitDirRef.current.get(id) ?? 1;
      return {
        x: direction > 0 ? "110%" : "-110%",
        opacity: 0,
        transition: exitFor(durations.base),
      };
    },
  });

  return (
    <section
      aria-label="Notifications"
      className={cn(
        "border-border bg-card relative w-full max-w-sm overflow-hidden rounded-3 border",
        className,
      )}
    >
      <header className="border-border flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Bell aria-hidden className="text-muted-foreground size-4 shrink-0" />
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          <span className="border-border flex shrink-0 items-center rounded-1 border px-1.5 py-0.5">
            <Readout value={unread} size="sm" />
            <span className="sr-only">unread</span>
          </span>
        </div>
        <button
          type="button"
          onClick={clearAll}
          disabled={signals.length === 0}
          className="text-muted-foreground hover:bg-accent hover:text-foreground shrink-0 rounded-2 px-2 py-1 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50"
        >
          Clear all
        </button>
      </header>

      <div className="p-2">
        <AnimatePresence mode="popLayout" initial={false}>
          {/* eslint-disable-next-line react-hooks/refs -- exit variants are
              resolved by AnimatePresence at animation time, after render;
              the refs are how clear-all order beats swipe direction. */}
          {groups.flatMap(([source, rows]) => [
            <motion.div
              key={`label:${source}`}
              layout={motionSafe}
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                transition: { duration: durations.base, ease: easings.enter },
              }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ layout: springs.glide }}
              className="text-muted-foreground px-2.5 pt-2 pb-1 font-mono text-[10px] font-medium tracking-[0.08em] uppercase"
            >
              {source}
            </motion.div>,
            ...rows.map((signal) => (
              <motion.article
                key={signal.id}
                aria-label={`${signal.source}: ${signal.title}, ${signal.time}${signal.read ? "" : ", unread"}`}
                layout={motionSafe}
                variants={rowVariants(signal.id)}
                initial="enter"
                animate="settle"
                exit="exit"
                transition={{ layout: springs.glide }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={motionSafe ? 0.3 : 1}
                dragTransition={{ bounceStiffness: 640, bounceDamping: 42 }}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd(signal)}
                className="group relative origin-top cursor-grab active:cursor-grabbing"
              >
                <div className="bg-card hover:bg-accent flex items-start gap-1 rounded-2 py-2 pr-1.5 pl-2.5 transition-colors">
                  <button
                    type="button"
                    onClick={guarded(() => markRead(signal))}
                    className="flex min-w-0 flex-1 items-start gap-2 rounded-1 text-left"
                  >
                    <span
                      aria-hidden
                      className="flex h-5 w-1.5 shrink-0 items-center justify-center"
                    >
                      <AnimatePresence initial={false}>
                        {!signal.read && (
                          <motion.span
                            key="dot"
                            exit={
                              motionSafe
                                ? {
                                    scale: [1, 1.4, 0],
                                    opacity: [1, 1, 0],
                                    transition: exitFor(durations.base),
                                  }
                                : {
                                    opacity: 0,
                                    transition: { duration: durations.fast },
                                  }
                            }
                            className="bg-primary size-1.5 rounded-full"
                          />
                        )}
                      </AnimatePresence>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-sm font-medium",
                          signal.read && "text-muted-foreground",
                        )}
                      >
                        {signal.title}
                      </span>
                      {signal.detail && (
                        <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                          {signal.detail}
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground shrink-0 pt-0.5 font-mono text-[10px] tabular-nums">
                      {signal.time}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Archive ${signal.title}`}
                    onClick={guarded(() => archive(signal, 1))}
                    className="text-muted-foreground hover:bg-accent hover:text-foreground shrink-0 rounded-1 p-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                  >
                    <Archive aria-hidden className="size-3.5" />
                  </button>
                </div>
              </motion.article>
            )),
          ])}
        </AnimatePresence>

        {signals.length === 0 && (
          <motion.div
            initial={
              motionSafe ? { opacity: 0, y: distances.shift } : { opacity: 0 }
            }
            animate={{ opacity: 1, y: 0 }}
            transition={
              motionSafe
                ? {
                    y: { ...springs.drift, delay: 0.2 },
                    opacity: {
                      duration: durations.base,
                      ease: easings.enter,
                      delay: 0.2,
                    },
                  }
                : { duration: durations.fast }
            }
            className="flex flex-col items-center gap-2 px-4 py-10"
          >
            <Inbox aria-hidden className="text-muted-foreground size-5" />
            <p className="text-muted-foreground font-mono text-[10px] font-medium tracking-[0.08em] uppercase">
              Signal floor clear
            </p>
            <svg viewBox="0 0 16 16" aria-hidden className="size-4">
              <motion.path
                d="M3 8.5 L6.5 12 L13 4.5"
                fill="none"
                stroke="var(--signal, var(--primary))"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: motionSafe ? 0 : 1 }}
                animate={{ pathLength: 1 }}
                transition={
                  motionSafe
                    ? { ...springs.flick, delay: 0.45 }
                    : { duration: 0 }
                }
              />
            </svg>
          </motion.div>
        )}
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </section>
  );
}
