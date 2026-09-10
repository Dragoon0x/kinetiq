"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CallQualityState = "live" | "reconnecting" | "lost";

export type CallQualityProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Grade 0–4, clamped and rounded. 4 is a clean line, 0 is nothing. */
  level: number;
  /** The transport's own state. @default "live" */
  state?: CallQualityState;
  /** Round-trip in milliseconds; printed in the pill and the panel. */
  rttMs?: number;
  /** Packet loss as a percentage; printed with one decimal. */
  lossPercent?: number;
  /** Jitter in milliseconds. */
  jitterMs?: number;
  /** One sentence about the last drop, printed at the foot of the panel. */
  dropNote?: string;
  /** Steps in the staircase. @default 5 */
  bars?: number;
  /** Controlled disclosure state. */
  open?: boolean;
  /** Initial disclosure state for uncontrolled usage. @default false */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Fires once per frozen change sentence ("The line dropped to poor"). */
  onGradeChange?: (sentence: string) => void;
  /** Names the meter for assistive technology. */
  label: string;
  className?: string;
};

const WORDS = ["No line", "Poor", "Fair", "Good", "Excellent"] as const;

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const clampGrade = (value: number): number =>
  Math.min(4, Math.max(0, Math.round(value)));

const ms = (value: number): string =>
  `${Math.round(value)} ${Math.round(value) === 1 ? "millisecond" : "milliseconds"}`;

const subscribeVisibility = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => typeof document === "undefined" || !document.hidden;
const getServerVisible = () => true;

/** A hidden tab paints nothing, so the wait stops turning while it is away. */
function useDocumentVisible(): boolean {
  return React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
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

/** A wait turns at a constant rate; a lost line stops turning and holds an arc. */
function ReconnectRing({
  spinning,
  tone,
}: {
  spinning: boolean;
  tone: string;
}) {
  return (
    <motion.svg
      viewBox="0 0 28 28"
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 size-full", tone)}
      style={{ originX: 0.5, originY: 0.5 }}
      initial={{ opacity: 0 }}
      animate={spinning ? { opacity: 1, rotate: 360 } : { opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={
        spinning
          ? {
              rotate: { duration: 1.1, ease: easings.linear, repeat: Infinity },
              opacity: { duration: durations.fast, ease: easings.enter },
            }
          : { duration: durations.fast, ease: easings.enter }
      }
    >
      <circle
        cx="14"
        cy="14"
        r="12.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={spinning ? "0.3 0.7" : "0.16 0.09"}
      />
    </motion.svg>
  );
}

/**
 * How good the line is. Five bars rise and fall with the grade on `flick` — a
 * level meter follows the signal rather than settling into it — with the steps
 * it has lost left behind as hairline ghosts, so a fall is visible as height
 * that went missing. A reconnecting line flattens the bars and spins a ring
 * around them at a constant linear rate; a lost line holds a broken arc. The
 * pill is a real disclosure whose panel opens in flow at a ResizeObserver-read
 * height, so nothing above it is ever covered.
 *
 * The grade is a `role="meter"` whose `aria-valuetext` is one sentence, and a
 * polite status speaks each change once, frozen at the moment it happened.
 * Under reduced motion the bars still change height — a grade is information —
 * on a tween, and the ring holds still.
 */
export function CallQuality({
  ref,
  level,
  state = "live",
  rttMs,
  lossPercent,
  jitterMs,
  dropNote,
  bars = 5,
  open,
  defaultOpen = false,
  onOpenChange,
  onGradeChange,
  label,
  className,
}: CallQualityProps) {
  const motionSafe = useMotionSafe();
  const visible = useDocumentVisible();
  const uid = React.useId();
  const panelId = `${uid}-panel`;

  const grade = clampGrade(level);
  const live = state === "live";
  const shown = live ? grade : 0;
  const steps = Math.max(3, Math.round(bars));
  const lit = Math.round((shown / 4) * steps);

  const word = live
    ? (WORDS[shown] ?? WORDS[0])
    : state === "reconnecting"
      ? "Reconnecting"
      : "No line";

  // The change is frozen the moment the reading differs, so the sentence and
  // the amber it turns belong to that change and not to a later re-render.
  const [seen, setSeen] = React.useState(() => ({
    grade: shown,
    state,
    sentence: "",
    dropped: false,
    stamp: 0,
  }));
  if (seen.grade !== shown || seen.state !== state) {
    const fell = shown < seen.grade;
    // The lowest grade is a state, not an adjective: "dropped to no line" is
    // not a sentence a person would say, so grade zero is phrased whole.
    const adjective = (WORDS[shown] ?? WORDS[0]).toLowerCase();
    const sentence =
      state === "reconnecting"
        ? "The line is reconnecting"
        : state === "lost"
          ? "The line dropped out"
          : shown === 0
            ? "The line dropped out"
            : seen.state !== "live"
              ? `The line is back, ${adjective}`
              : fell
                ? `The line dropped to ${adjective}`
                : `The line is back to ${adjective}`;
    setSeen({
      grade: shown,
      state,
      sentence,
      dropped:
        state !== "live"
          ? true
          : shown >= 3
            ? false
            : (fell && seen.grade - shown >= 2) || seen.dropped,
      stamp: seen.stamp + 1,
    });
  }

  const announceRef = useLatest(onGradeChange);
  const firstRun = React.useRef(true);
  React.useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (seen.sentence) announceRef.current?.(seen.sentence);
  }, [seen.stamp, seen.sentence, announceRef]);

  const tone =
    state === "lost"
      ? "text-danger"
      : state === "reconnecting" || seen.dropped
        ? "text-warn"
        : "text-cobalt-bright";

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isOpen = open ?? uncontrolledOpen;
  const toggle = () => {
    const next = !isOpen;
    if (open === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  // The panel's height comes from the node when it arrives, not from a
  // mount-only effect reading a ref that is still null.
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [panelHeight, setPanelHeight] = React.useState(0);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      setPanelHeight(Math.round(box ? box.blockSize : node.offsetHeight));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Same reason as the sentence above: at grade zero the meter names the
  // state rather than pretending "no line" is a quality the line has.
  const reading =
    word === "No line"
      ? "There is no line"
      : `The line is ${word.toLowerCase()}`;
  const valueText =
    rttMs === undefined ? reading : `${reading}, round-trip ${ms(rttMs)}`;

  const rows: [string, string][] = [
    ["Round-trip", rttMs === undefined ? "—" : `${Math.round(rttMs)} ms`],
    [
      "Packet loss",
      lossPercent === undefined ? "—" : `${lossPercent.toFixed(1)}%`,
    ],
    ["Jitter", jitterMs === undefined ? "—" : `${Math.round(jitterMs)} ms`],
  ];

  return (
    <div ref={ref} className={cn("w-full", className)}>
      <div className="flex items-center gap-3 rounded-3 border border-hairline bg-surface-1 px-3 py-2">
        <div
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={4}
          aria-valuenow={shown}
          aria-valuetext={valueText}
          className="flex min-w-0 flex-1 items-center gap-2.5"
        >
          <span
            aria-hidden
            className="relative grid size-7 shrink-0 place-items-center"
          >
            <span className="flex h-3 items-end gap-[2px]">
              {Array.from({ length: steps }, (_, index) => {
                const height = 4 + index * 2;
                const on = index < lit;
                return (
                  <span
                    key={index}
                    className="relative w-[3px] overflow-hidden rounded-[1px] bg-hairline-strong"
                    style={{ height: `${height}px` }}
                  >
                    <motion.span
                      className={cn(
                        "absolute inset-x-0 bottom-0 h-full origin-bottom rounded-[1px] bg-current transition-colors",
                        tone,
                      )}
                      initial={false}
                      animate={{ scaleY: on ? 1 : 0 }}
                      transition={
                        motionSafe
                          ? springs.flick
                          : { duration: durations.base, ease: easings.enter }
                      }
                    />
                  </span>
                );
              })}
            </span>
            <AnimatePresence initial={false}>
              {live ? null : (
                <ReconnectRing
                  key="ring"
                  spinning={state === "reconnecting" && motionSafe && visible}
                  tone={tone}
                />
              )}
            </AnimatePresence>
          </span>

          {/* Both readings share one grid cell and cross-fade, so a fast
              script cannot queue a stale word behind the current one. */}
          <span className="grid min-w-0 flex-1">
            <AnimatePresence initial={false}>
              <motion.span
                key={word}
                className={cn(
                  "col-start-1 row-start-1 truncate text-sm font-medium",
                  tone,
                )}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.fast, ease: easings.enter }}
              >
                {word}
              </motion.span>
            </AnimatePresence>
          </span>

          {rttMs === undefined ? null : (
            <span
              aria-hidden
              className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums"
            >
              {Math.round(rttMs)} ms
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={toggle}
          aria-expanded={isOpen}
          aria-controls={panelId}
          aria-label={isOpen ? "Hide line details" : "Show line details"}
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-hairline-strong px-2.5 text-xs font-medium text-ink-2 transition-colors hover:bg-accent",
            focusRing,
          )}
        >
          Details
          <motion.svg
            viewBox="0 0 16 16"
            aria-hidden
            className="size-3.5 shrink-0"
            style={{ originX: 0.5, originY: 0.5 }}
            initial={false}
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={
              motionSafe
                ? springs.snap
                : { duration: durations.fast, ease: easings.move }
            }
          >
            <path
              d="M4 6.5 8 10.5 12 6.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </motion.svg>
        </button>
      </div>

      <motion.div
        id={panelId}
        aria-hidden={!isOpen}
        className="overflow-hidden"
        initial={false}
        animate={{ height: isOpen ? panelHeight : 0 }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.base, ease: easings.move }
        }
      >
        <div ref={innerRef} className="px-3 pt-2">
          <dl className="flex flex-col gap-1.5 border-l border-hairline-strong pl-3">
            {rows.map(([term, value]) => (
              <div key={term} className="flex items-baseline gap-3">
                <dt className="min-w-0 flex-1 truncate text-xs text-ink-3">
                  {term}
                </dt>
                <dd className="shrink-0 font-mono text-[11px] text-ink-2 tabular-nums">
                  {value}
                </dd>
              </div>
            ))}
            {dropNote ? (
              <div className="flex pt-0.5">
                <dt className="sr-only">Last drop</dt>
                <dd className="text-xs text-ink-3">{dropNote}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </motion.div>

      <span role="status" aria-live="polite" className="sr-only">
        {seen.sentence}
      </span>
    </div>
  );
}
