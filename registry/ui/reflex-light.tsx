"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

/** Lights in the start gantry — fixed, never configurable. */
const LIGHT_COUNT = 5;

/** Cadence between each light igniting during the arming climb, in ms. */
const ARM_CADENCE_MS = 420;

/**
 * Fixed, never-random cycle of GO delays, ms — drawn round-robin across
 * attempts so the same run is reproducible session to session. A practised
 * user can memorize this table; that is the deliberate trade for
 * determinism over pure unpredictability.
 */
const DEFAULT_DELAYS = [900, 1400, 700, 1900, 1150] as const;

/** How long the jump-start flash holds before the panel resets. */
const FAULT_HOLD_MS = 900;

/** Attempts kept in the history strip. */
const HISTORY_SIZE = 5;

/** Rating thresholds, ms — strictly-under checks, in order. */
const SHARP_MAX_MS = 200;
const GOOD_MAX_MS = 320;
const SLOW_MAX_MS = 450;

const WARNING_COLOR = "var(--warning, #b45309)";
const SUCCESS_COLOR = "var(--success, #047857)";
const SIGNAL_COLOR = "var(--signal)";
const MUTED_COLOR = "var(--ink-3)";

const LIGHT_LIT_BG = `color-mix(in oklab, ${WARNING_COLOR} 82%, var(--card))`;
const LIGHT_LIT_GLOW = `0 0 10px -2px color-mix(in oklab, ${WARNING_COLOR} 65%, transparent)`;
const LIGHT_FAULT_BG = `color-mix(in oklab, ${WARNING_COLOR} 95%, var(--card))`;
const LIGHT_FAULT_GLOW = `0 0 14px -1px color-mix(in oklab, ${WARNING_COLOR} 80%, transparent)`;
const FAULT_FLASH_BG = `color-mix(in oklab, ${WARNING_COLOR} 30%, transparent)`;
const PANEL_ARMED_BORDER = `color-mix(in oklab, ${WARNING_COLOR} 55%, var(--hairline-strong))`;
const PANEL_LIVE_BORDER = `color-mix(in oklab, ${SUCCESS_COLOR} 55%, var(--hairline-strong))`;

/** Sharp-result flourish geometry — fixed, deterministic, six-way symmetric. */
const SHARP_RING_SIZE = 72;
const SHARP_SPARK_SPREAD = 30;
const SHARP_SPARK_COUNT = 6;
const SHARP_SPARK_ANGLES: readonly number[] = Array.from(
  { length: SHARP_SPARK_COUNT },
  (_, i) => (i / SHARP_SPARK_COUNT) * Math.PI * 2 - Math.PI / 2,
);

type Phase = "idle" | "arming" | "armed" | "live" | "fault";
type RatingId = "sharp" | "good" | "slow" | "asleep";
type HistoryEntry = { key: number; ms: number; rating: RatingId };

const RATING_META: Record<RatingId, { label: string; tint: string }> = {
  sharp: { label: "sharp", tint: SUCCESS_COLOR },
  good: { label: "good", tint: SIGNAL_COLOR },
  slow: { label: "slow", tint: WARNING_COLOR },
  asleep: { label: "asleep", tint: MUTED_COLOR },
};

const ratingFor = (ms: number): RatingId => {
  if (ms < SHARP_MAX_MS) return "sharp";
  if (ms < GOOD_MAX_MS) return "good";
  if (ms < SLOW_MAX_MS) return "slow";
  return "asleep";
};

const formatMs = (value: number): string => `${value} ms`;

export type ReflexLightProps = {
  /**
   * Fixed cycle of GO delays, ms, drawn round-robin across attempts.
   * Never randomized. @default [900, 1400, 700, 1900, 1150]
   */
  delays?: number[];
  /** Fires with the reaction time in ms after a valid (non-fault) attempt. */
  onReaction?: (ms: number) => void;
  className?: string;
};

/**
 * A five-light start gantry with a reaction timer. Press Start and the five
 * lights climb on a fixed ~420ms cadence, then hold for a delay drawn from a
 * fixed cycle — never `Math.random()`, so every run is reproducible, and a
 * practised user really can learn the cycle, which is the trade this
 * component makes for determinism. All five cut out together as the GO
 * signal, and from that instant the panel itself is the target: pressing it
 * any earlier is a jump start — a void attempt, a warning flash, and a
 * reset — while pressing it after go times the reaction as `event.timeStamp`
 * minus a monotonic mark taken the moment the lights went dark, never
 * `Date.now()` and never sampled during render. The result rolls through a
 * composed `Readout` and lands in one of four fixed bands — sharp, good,
 * slow, asleep — each with its own tint; sharp alone adds a ring and six
 * sparks. The last five attempts sit in a history strip with the best one
 * marked, next to a running best/average line. Reduced motion: the light
 * sequence still runs, since it is discrete state rather than continuous
 * motion, but the sharp ring/sparks and the jump-start flash drop, leaving
 * only the underlying state changes.
 */
export function ReflexLight({
  delays = [...DEFAULT_DELAYS],
  onReaction,
  className,
}: ReflexLightProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [phase, setPhase] = React.useState<Phase>("idle");
  const [litCount, setLitCount] = React.useState(0);
  const [lastResult, setLastResult] = React.useState<{
    ms: number;
    rating: RatingId;
  } | null>(null);
  const [history, setHistory] = React.useState<HistoryEntry[]>([]);
  const [sharpBurstKey, setSharpBurstKey] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");

  // Timers — scalar refs, never ReturnType<typeof setTimeout>, cleared on
  // every jump start, every reset, and unmount.
  const armTimerRef = React.useRef<number | null>(null);
  const waitTimerRef = React.useRef<number | null>(null);
  const faultTimerRef = React.useRef<number | null>(null);

  // The instant the lights go dark, on a monotonic clock — never Date.now().
  const goTimeRef = React.useRef<number | null>(null);
  // Cursor into the fixed delay table; advances once per armed attempt.
  const cycleIndexRef = React.useRef(0);
  // Monotonic key source for history entries — never Date.now(), never random.
  const historyKeyRef = React.useRef(0);

  React.useEffect(() => {
    return () => {
      if (armTimerRef.current !== null)
        window.clearTimeout(armTimerRef.current);
      if (waitTimerRef.current !== null)
        window.clearTimeout(waitTimerRef.current);
      if (faultTimerRef.current !== null)
        window.clearTimeout(faultTimerRef.current);
    };
  }, []);

  const clearAllTimers = () => {
    if (armTimerRef.current !== null) {
      window.clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
    if (waitTimerRef.current !== null) {
      window.clearTimeout(waitTimerRef.current);
      waitTimerRef.current = null;
    }
    if (faultTimerRef.current !== null) {
      window.clearTimeout(faultTimerRef.current);
      faultTimerRef.current = null;
    }
  };

  const goLive = () => {
    waitTimerRef.current = null;
    // performance.now() and a click event's timeStamp share the same time
    // origin, so diffing them later is a real elapsed duration — sampled
    // here, in a timer callback, never in render and never Date.now().
    goTimeRef.current = performance.now();
    setLitCount(0);
    setPhase("live");
  };

  const scheduleLight = (litIndex: number) => {
    if (litIndex >= LIGHT_COUNT) {
      setPhase("armed");
      const delayTable = delays.length > 0 ? delays : DEFAULT_DELAYS;
      const delay =
        delayTable[cycleIndexRef.current % delayTable.length] ?? 900;
      cycleIndexRef.current += 1;
      waitTimerRef.current = window.setTimeout(goLive, delay);
      return;
    }
    armTimerRef.current = window.setTimeout(() => {
      armTimerRef.current = null;
      setLitCount(litIndex + 1);
      scheduleLight(litIndex + 1);
    }, ARM_CADENCE_MS);
  };

  const handleStart = () => {
    if (phase !== "idle") return;
    clearAllTimers();
    setPhase("arming");
    setLitCount(1); // first light ignites immediately on press
    scheduleLight(1);
    setAnnounce("Sequence started. Wait for the lights to go out.");
  };

  const triggerFault = () => {
    clearAllTimers();
    goTimeRef.current = null;
    setLitCount(0);
    setPhase("fault");
    setAnnounce("Jump start. Attempt void.");
    faultTimerRef.current = window.setTimeout(() => {
      faultTimerRef.current = null;
      setPhase("idle");
    }, FAULT_HOLD_MS);
  };

  const recordResult = (ms: number) => {
    const rating = ratingFor(ms);
    const key = historyKeyRef.current;
    historyKeyRef.current += 1;

    setPhase("idle");
    setLitCount(0);
    setLastResult({ ms, rating });
    setHistory((current) =>
      [{ key, ms, rating }, ...current].slice(0, HISTORY_SIZE),
    );
    if (motionSafe && rating === "sharp") setSharpBurstKey((k) => k + 1);
    onReaction?.(ms);
    setAnnounce(`${ms} ms. ${RATING_META[rating].label}.`);
  };

  const handlePanelPress = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (phase === "arming" || phase === "armed") {
      triggerFault();
      return;
    }
    if (phase === "live") {
      const goAt = goTimeRef.current;
      goTimeRef.current = null;
      const elapsed = Math.max(
        0,
        Math.round(event.timeStamp - (goAt ?? event.timeStamp)),
      );
      recordResult(elapsed);
    }
  };

  const panelActive =
    phase === "arming" || phase === "armed" || phase === "live";
  const panelLabel =
    phase === "live"
      ? "React now"
      : panelActive
        ? "Wait for the lights to go out"
        : "Reflex panel";

  const panelBorderStyle: React.CSSProperties =
    phase === "armed"
      ? { borderColor: PANEL_ARMED_BORDER }
      : phase === "live"
        ? { borderColor: PANEL_LIVE_BORDER }
        : {};

  const captionText =
    phase === "fault"
      ? "jump start"
      : phase === "arming" || phase === "armed"
        ? "wait for it"
        : phase === "live"
          ? "go"
          : lastResult
            ? RATING_META[lastResult.rating].label
            : "press start";

  const captionColor =
    phase === "fault"
      ? WARNING_COLOR
      : phase === "live"
        ? SUCCESS_COLOR
        : phase === "idle" && lastResult
          ? RATING_META[lastResult.rating].tint
          : undefined;

  const resultTintStyle: React.CSSProperties | undefined =
    phase === "idle" && lastResult
      ? { color: RATING_META[lastResult.rating].tint }
      : undefined;

  const bestMs =
    history.length > 0 ? Math.min(...history.map((h) => h.ms)) : null;
  const averageMs =
    history.length > 0
      ? Math.round(history.reduce((sum, h) => sum + h.ms, 0) / history.length)
      : null;
  const historySlots: (HistoryEntry | null)[] = Array.from(
    { length: HISTORY_SIZE },
    (_, i) => history[i] ?? null,
  );

  return (
    <div
      className={cn(
        "inline-flex w-72 flex-col items-center gap-4 rounded-4 border border-hairline bg-surface-1 p-6",
        className,
      )}
    >
      <span className="font-mono text-[10px] font-medium tracking-[0.16em] text-ink-3 uppercase">
        reflex test
      </span>

      <button
        type="button"
        onClick={handlePanelPress}
        disabled={!panelActive}
        aria-label={panelLabel}
        className={cn(
          "relative flex items-center justify-center gap-3 rounded-3 border border-hairline-strong bg-surface-2 px-6 py-5 transition-colors outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          "disabled:cursor-not-allowed",
          panelActive && "cursor-pointer",
        )}
        style={{
          transitionDuration: `${durations.base}s`,
          ...panelBorderStyle,
        }}
      >
        {motionSafe && phase === "fault" && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-3"
            style={{ background: FAULT_FLASH_BG }}
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            transition={{ duration: durations.slow, ease: easings.exit }}
          />
        )}
        {Array.from({ length: LIGHT_COUNT }, (_, i) => {
          const isFault = phase === "fault";
          // litCount is only ever nonzero mid-climb (arming/armed); "live"
          // and "idle" both hold it at 0, so no extra phase check is needed.
          const isLit = !isFault && i < litCount;
          const style: React.CSSProperties = isFault
            ? { backgroundColor: LIGHT_FAULT_BG, boxShadow: LIGHT_FAULT_GLOW }
            : isLit
              ? { backgroundColor: LIGHT_LIT_BG, boxShadow: LIGHT_LIT_GLOW }
              : {};
          return (
            <span
              key={i}
              aria-hidden
              className="size-5 rounded-full border border-hairline-strong bg-surface-1 transition-colors"
              style={{ transitionDuration: `${durations.base}s`, ...style }}
            />
          );
        })}
      </button>

      <div className="relative flex flex-col items-center gap-1">
        <span className="relative inline-flex" style={resultTintStyle}>
          <Readout value={lastResult?.ms ?? 0} format={formatMs} size="xl" />
          {motionSafe && sharpBurstKey > 0 && (
            // A shared aria-hidden/pointer-events-none anchor, matching the
            // spark-burst.tsx idiom: children center via margin (not
            // Tailwind's translate utilities), since motion's own x/y
            // animation would overwrite a transform-based offset outright.
            <span
              key={sharpBurstKey}
              aria-hidden
              className="pointer-events-none absolute inset-0"
            >
              <motion.span
                className="absolute top-1/2 left-1/2 rounded-full border-2"
                style={{
                  width: SHARP_RING_SIZE,
                  height: SHARP_RING_SIZE,
                  marginLeft: -SHARP_RING_SIZE / 2,
                  marginTop: -SHARP_RING_SIZE / 2,
                  borderColor: SUCCESS_COLOR,
                }}
                initial={{ scale: 0.5, opacity: 0.9 }}
                animate={{ scale: 1.6, opacity: 0 }}
                transition={{
                  scale: springs.glide,
                  opacity: { duration: durations.slow, ease: easings.exit },
                }}
              />
              {SHARP_SPARK_ANGLES.map((angle, i) => (
                <motion.span
                  key={i}
                  className="absolute top-1/2 left-1/2 rounded-full"
                  style={{
                    width: 4,
                    height: 4,
                    marginLeft: -2,
                    marginTop: -2,
                    background: SUCCESS_COLOR,
                  }}
                  initial={{ x: 0, y: 0, opacity: 1 }}
                  animate={{
                    x: Math.cos(angle) * SHARP_SPARK_SPREAD,
                    y: Math.sin(angle) * SHARP_SPARK_SPREAD,
                    opacity: 0,
                  }}
                  transition={{
                    x: springs.glide,
                    y: springs.glide,
                    opacity: { duration: durations.slow, ease: easings.exit },
                  }}
                />
              ))}
            </span>
          )}
        </span>

        <span
          className="flex h-4 items-center font-mono text-[11px] font-semibold text-ink-2"
          style={{ color: captionColor }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={captionText}
              initial={motionSafe ? { opacity: 0, y: 4 } : false}
              animate={{ opacity: 1, y: 0 }}
              exit={
                motionSafe
                  ? {
                      opacity: 0,
                      y: -4,
                      transition: {
                        duration: durations.fast,
                        ease: easings.exit,
                      },
                    }
                  : { opacity: 0, transition: { duration: 0 } }
              }
              transition={
                motionSafe
                  ? { duration: durations.base, ease: easings.enter }
                  : { duration: 0 }
              }
            >
              {captionText}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>

      <ul
        aria-label="Reaction history"
        className="m-0 flex list-none items-center gap-1.5 p-0"
      >
        {historySlots.map((entry, i) => {
          if (!entry) {
            return (
              <li
                key={`slot-${i}`}
                aria-hidden
                className="flex h-6 min-w-10 items-center justify-center rounded-2 border border-dashed border-hairline font-mono text-[10px] text-ink-3"
              >
                –
              </li>
            );
          }
          const isBest = entry.ms === bestMs;
          return (
            <li
              key={entry.key}
              className="flex h-6 min-w-10 items-center justify-center rounded-2 border px-1.5 font-mono text-[10px] font-semibold tabular-nums"
              style={{
                borderColor: RATING_META[entry.rating].tint,
                color: RATING_META[entry.rating].tint,
                boxShadow: isBest
                  ? `0 0 0 2px ${RATING_META[entry.rating].tint}`
                  : undefined,
              }}
            >
              {entry.ms}
              {isBest && <span className="sr-only"> best</span>}
            </li>
          );
        })}
      </ul>

      <p className="m-0 font-mono text-[11px] text-ink-3 tabular-nums">
        best {bestMs !== null ? `${bestMs} ms` : "—"} · avg{" "}
        {averageMs !== null ? `${averageMs} ms` : "—"}
      </p>

      <button
        type="button"
        aria-label="Start the reflex test"
        onClick={handleStart}
        disabled={phase !== "idle"}
        className={cn(
          "rounded-2 border border-hairline-strong bg-surface-2 px-4 py-1.5 font-mono text-xs font-semibold text-ink shadow-raised transition-colors outline-none",
          "hover:bg-surface-1",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        style={{ transitionDuration: `${durations.base}s` }}
      >
        Start
      </button>

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
