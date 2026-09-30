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

export type CanarySeries = {
  /** Named in the legend and in the plot's own sentence. */
  label: string;
  /** Error rate per sample, in percent, oldest first. */
  points: number[];
  /** The rate this series is at now, in percent. */
  rate: number;
};

export type CanaryVerdict =
  "watching" | "ready" | "failing" | "promoted" | "aborted";

export type SplitReading = {
  /** Percent of traffic on the canary. */
  canary: number;
  baseline: number;
  verdict: CanaryVerdict;
};

export type CanarySplitProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled share of traffic on the canary, in whole percent. */
  value?: number;
  /** Initial share for uncontrolled usage. @default 10 */
  defaultValue?: number;
  /** Fires from the setter behind the drag or key. */
  onValueChange?: (percent: number) => void;
  /** The most traffic the canary may take. @default 50 */
  max?: number;
  /** The current build's line, drawn quiet. */
  baseline: CanarySeries;
  /** The new build's line, drawn live. */
  canary: CanarySeries;
  /** Comes from the host; decides which controls are in. @default "watching" */
  verdict?: CanaryVerdict;
  /** One sentence explaining the verdict; printed and spoken. */
  note?: string;
  /** Fires from the press on Promote. */
  onPromote?: () => void;
  /** Fires from the press on Abort. */
  onAbort?: () => void;
  /** The whole reading — a state, so it also fires on the first commit. */
  onSplitChange?: (reading: SplitReading) => void;
  /** Renders both error rates. @default two decimals and a percent sign */
  formatRate?: (rate: number) => string;
  /** Names the control. @default "Traffic split" */
  label?: string;
  className?: string;
};

/** Fixed plot box: the width stretches, the height is real pixels. */
const VIEW_W = 240;
const VIEW_H = 56;
/** Travel before a press becomes a drag: below this a plain click still lands. */
const SLOP = 4;

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const VERDICT_WORD: Record<CanaryVerdict, string> = {
  watching: "Watching",
  ready: "Ready",
  failing: "Failing",
  promoted: "Promoted",
  aborted: "Aborted",
};

/** Three decimals before a share reaches a style: an unrounded ratio
 *  serialises differently in Node and the browser, which is a hydration error
 *  rather than a rounding one. */
const pct = (percent: number): string =>
  `${Number(Math.min(100, Math.max(0, percent)).toFixed(3))}%`;

const defaultRate = (rate: number): string => `${rate.toFixed(2)}%`;

/** Host copy read back as a sentence: capitalised even when the log line was
 *  lowercase, and given one full stop rather than the two it would carry if it
 *  already ended in one. */
const sentenceOf = (text: string): string => {
  const trimmed = text.trim();
  if (trimmed === "") return "";
  const capped = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
};

/** Every coordinate is rounded before it reaches the `d`: Node and the browser
 *  disagree in the last digits, and a mismatched attribute is a hydration
 *  error rather than a rounding one. */
const linePath = (points: number[], top: number): string => {
  if (points.length === 0) return "";
  const y = (value: number) =>
    Number(
      (
        VIEW_H -
        3 -
        Math.min(1, Math.max(0, value / top)) * (VIEW_H - 6)
      ).toFixed(3),
    );
  if (points.length === 1)
    return `M0 ${y(points[0] ?? 0)} L${VIEW_W} ${y(points[0] ?? 0)}`;
  return points
    .map((value, index) => {
      const x = Number(((index / (points.length - 1)) * VIEW_W).toFixed(3));
      return `${index === 0 ? "M" : "L"}${x} ${y(value)}`;
    })
    .join(" ");
};

/**
 * How much traffic the new build is taking, and what it is doing with it. The
 * canary holds the left of the split bar and the baseline the rest; the
 * boundary is a real `role="slider"` dragged with the pointer — captured only
 * after 4px of travel, inside try/catch, so a plain press still lands — or
 * driven with the arrow keys, and both shares settle on `glide`.
 *
 * Under the bar two lines share one fixed viewBox: the baseline's error rate in
 * ink, the canary's in the verdict's own colour. The canary's line draws itself
 * by sweeping a `<clipPath>` rect across the box on a tween — never a
 * `pathLength` dash, which measures against the painted length in a stretched
 * viewBox and leaves the line short of its own last sample — so the stroke
 * keeps an even width the whole way.
 *
 * When the host's verdict settles, the decision controls slide in from
 * `distances.step` on `snap` into a ResizeObserver-measured region: Promote and
 * Abort when the canary is ready, Abort alone when it is failing, and neither
 * while it is still being watched. Nothing is announced optimistically —
 * pressing Promote fires `onPromote` and the card waits for the host's next
 * verdict before it says anything happened. Under reduced motion both lines are
 * painted whole, the shares change without springing, and the controls fade in
 * where they will stand.
 */
export function CanarySplit({
  ref,
  value,
  defaultValue = 10,
  onValueChange,
  max = 50,
  baseline,
  canary,
  verdict = "watching",
  note,
  onPromote,
  onAbort,
  onSplitChange,
  formatRate = defaultRate,
  label = "Traffic split",
  className,
}: CanarySplitProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const sweepId = `${baseId}-sweep`;

  const ceiling = Math.min(100, Math.max(1, Math.round(max)));
  const [ownValue, setOwnValue] = React.useState(defaultValue);
  const share = Math.min(ceiling, Math.max(0, Math.round(value ?? ownValue)));
  const rest = 100 - share;

  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const gesture = React.useRef<{
    id: number;
    startX: number;
    dragging: boolean;
  } | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const commit = (next: number) => {
    const clamped = Math.min(ceiling, Math.max(0, Math.round(next)));
    if (clamped === share) return;
    if (value === undefined) setOwnValue(clamped);
    onValueChange?.(clamped);
  };

  const splitRef = React.useRef(onSplitChange);
  React.useEffect(() => {
    splitRef.current = onSplitChange;
  });
  // The split is a state, not an event: a host that mounts mid-canary sees the
  // same shares the control does, from the first commit.
  React.useEffect(() => {
    splitRef.current?.({ canary: share, baseline: 100 - share, verdict });
  }, [share, verdict]);

  // A verdict is settled before it is spoken, so the first commit says nothing
  // and a press never announces ahead of the host's own answer.
  const [spoken, setSpoken] = React.useState({ key: verdict, sentence: "" });
  if (spoken.key !== verdict) {
    const tail = note ? ` ${sentenceOf(note)}` : "";
    setSpoken({
      key: verdict,
      sentence:
        verdict === "ready"
          ? `Canary healthy at ${share} percent of traffic, ready to promote.${tail}`
          : verdict === "failing"
            ? `Canary failing.${tail}`
            : verdict === "promoted"
              ? `Canary promoted to all traffic.${tail}`
              : verdict === "aborted"
                ? `Canary aborted. All traffic is back on the baseline.${tail}`
                : `Watching the canary at ${share} percent of traffic.${tail}`,
    });
  }

  const shareFromClientX = (clientX: number): number => {
    const node = trackRef.current;
    if (!node) return share;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0) return share;
    return ((clientX - rect.left) / rect.width) * 100;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || gesture.current) return;
    gesture.current = {
      id: event.pointerId,
      startX: event.clientX,
      dragging: false,
    };
    // A press on the bar jumps to that share; a press on the boundary itself
    // waits for travel, so a click on the knob is never a jump.
    if (!(event.target as HTMLElement).closest("[role=slider]")) {
      commit(shareFromClientX(event.clientX));
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    if (!active.dragging) {
      if (Math.abs(event.clientX - active.startX) < SLOP) return;
      active.dragging = true;
      setDragging(true);
      try {
        // Captured only once the press has become a drag, and never letting a
        // synthetic sweep from a test suite throw on the way in.
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A pointer that already ended cannot be captured; carry on.
      }
    }
    commit(shareFromClientX(event.clientX));
  };

  const endGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    gesture.current = null;
    setDragging(false);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Releasing a capture the browser already dropped is not an error.
    }
  };

  const onKnobKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = {
      ArrowRight: 1,
      ArrowUp: 1,
      ArrowLeft: -1,
      ArrowDown: -1,
      PageUp: 10,
      PageDown: -10,
    };
    const step = steps[event.key];
    if (step !== undefined) {
      event.preventDefault();
      commit(share + step);
    } else if (event.key === "Home") {
      event.preventDefault();
      commit(0);
    } else if (event.key === "End") {
      event.preventDefault();
      commit(ceiling);
    }
  };

  // Measured, never reserved: the note and the decisions own their own height,
  // so a canary still being watched holds no empty room for buttons.
  const [footNode, setFootNode] = React.useState<HTMLDivElement | null>(null);
  const [footHeight, setFootHeight] = React.useState(0);
  React.useEffect(() => {
    if (!footNode) return;
    const observer = new ResizeObserver(() =>
      setFootHeight(footNode.offsetHeight),
    );
    observer.observe(footNode);
    return () => observer.disconnect();
  }, [footNode]);

  // A decision removes the control that was pressed, so focus is handed to the
  // region that answers it — bound to the node through a ref callback and moved
  // in an effect keyed on that node, never on a guessed frame — rather than
  // dropped on the body. Only this card's own press claims it, so a host
  // changing the verdict elsewhere never steals the keyboard.
  const [claim, setClaim] = React.useState(0);
  const claimed = React.useRef(0);
  React.useEffect(() => {
    if (!footNode || claim === 0 || claimed.current === claim) return;
    claimed.current = claim;
    if (footNode.textContent) footNode.focus();
  }, [footNode, claim]);

  const top = Math.max(
    0.0001,
    ...baseline.points,
    ...canary.points,
    baseline.rate,
    canary.rate,
  );
  const basePath = linePath(baseline.points, top * 1.15);
  const canaryPath = linePath(canary.points, top * 1.15);

  const tone =
    verdict === "failing"
      ? "text-danger"
      : verdict === "ready" || verdict === "promoted"
        ? "text-success"
        : verdict === "aborted"
          ? "text-ink-3"
          : "text-cobalt-bright";
  const fill =
    verdict === "failing"
      ? "bg-danger"
      : verdict === "ready" || verdict === "promoted"
        ? "bg-success"
        : verdict === "aborted"
          ? "bg-hairline-strong"
          : "bg-cobalt-bright";

  const decisions = verdict === "ready" || verdict === "failing";
  const hasFoot = decisions || Boolean(note);

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const settle = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };
  const move = dragging ? { duration: 0 } : settle;

  const plotSentence = `${canary.label} at ${formatRate(canary.rate)}, ${baseline.label} at ${formatRate(baseline.rate)}, over the last ${canary.points.length} samples. ${VERDICT_WORD[verdict]}.`;

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cn(
        "flex w-full flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {label}
        </span>
        <span className={cn("shrink-0 font-mono text-[11px]", tone)}>
          {VERDICT_WORD[verdict]}
        </span>
      </div>

      <div
        className="relative w-full touch-none py-1.5 select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
      >
        <div
          ref={trackRef}
          aria-hidden
          className="relative h-3 w-full overflow-clip rounded-full bg-hairline-strong [contain:paint]"
        >
          <motion.span
            className={cn(
              "absolute inset-y-0 left-0 w-full origin-left rounded-full transition-colors",
              fill,
            )}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: Number((share / 100).toFixed(6)) }}
            transition={move}
          />
        </div>
        {/* The boundary sits outside the clipped track, so it is never sliced
            in half at either end of its travel. */}
        <motion.div
          role="slider"
          tabIndex={0}
          aria-label={`${canary.label} share of traffic`}
          aria-valuemin={0}
          aria-valuemax={ceiling}
          aria-valuenow={share}
          aria-valuetext={`Canary takes ${share} percent of traffic, baseline ${rest} percent.`}
          onKeyDown={onKnobKeyDown}
          className={cn(
            "absolute inset-y-0 grid w-4 -translate-x-1/2 cursor-grab place-items-center rounded-full active:cursor-grabbing",
            focusRing,
          )}
          initial={false}
          animate={{ left: pct(share) }}
          transition={move}
        >
          <span
            aria-hidden
            className="h-6 w-1 rounded-full bg-ink shadow-raised"
          />
        </motion.div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono text-[10px] tabular-nums">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn("size-2 shrink-0 rounded-full", fill)}
          />
          <span className="max-w-28 truncate text-ink">{canary.label}</span>
          <span className={tone}>{formatRate(canary.rate)}</span>
          <span className="text-ink-3">{share}%</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full bg-hairline-strong"
          />
          <span className="max-w-28 truncate text-ink-2">{baseline.label}</span>
          <span className="text-ink-2">{formatRate(baseline.rate)}</span>
          <span className="text-ink-3">{rest}%</span>
        </span>
      </div>

      <div
        role="img"
        aria-label={plotSentence}
        className="w-full rounded-2 border border-hairline bg-surface-2 p-1"
      >
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          // Fixed pixel height, fluid width: the box stretches, and the strokes
          // hold their width because they do not scale with it.
          style={{ height: VIEW_H }}
          className="block w-full"
          aria-hidden
        >
          <path
            d={basePath}
            fill="none"
            stroke="currentColor"
            className="text-ink-3"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {/* A clip sweeps the canary's line into being. A pathLength dash
              would be measured against the painted length in a stretched
              viewBox and stop short of the last sample; a clip is measured in
              the same user units the path is. */}
          <defs>
            <clipPath id={sweepId}>
              <motion.rect
                x="0"
                y={-VIEW_H}
                height={VIEW_H * 3}
                initial={{ width: motionSafe ? 0 : VIEW_W }}
                animate={{ width: VIEW_W }}
                transition={
                  motionSafe
                    ? { duration: durations.page, ease: easings.enter }
                    : { duration: 0 }
                }
              />
            </clipPath>
          </defs>
          <g clipPath={`url(#${sweepId})`}>
            <path
              d={canaryPath}
              fill="none"
              stroke="currentColor"
              className={tone}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        </svg>
      </div>

      <motion.div
        initial={false}
        animate={{ height: footHeight }}
        transition={settle}
        // The negative margin cancels the column's own gap while the region is
        // empty, so a watched canary reserves no room for a decision.
        className="-mt-2 overflow-clip [contain:paint]"
      >
        <div
          ref={setFootNode}
          tabIndex={-1}
          className={cn("flex flex-col gap-2", hasFoot && "pt-2", focusRing)}
        >
          {note ? (
            <p className="text-[11px] text-ink-2">{sentenceOf(note)}</p>
          ) : null}
          <AnimatePresence initial={false}>
            {decisions ? (
              <motion.div
                key="decisions"
                className="flex flex-wrap items-center gap-2"
                initial={
                  motionSafe
                    ? { opacity: 0, y: distances.step }
                    : { opacity: 0, y: 0 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={motionSafe ? springs.snap : fade}
              >
                {verdict === "ready" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setClaim((stamp) => stamp + 1);
                      onPromote?.();
                    }}
                    className={cn(
                      "flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90",
                      focusRing,
                    )}
                  >
                    Promote to all traffic
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setClaim((stamp) => stamp + 1);
                    onAbort?.();
                  }}
                  className={cn(
                    "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium text-ink transition-colors hover:bg-accent",
                    focusRing,
                  )}
                >
                  Abort
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.sentence}
      </span>
    </div>
  );
}
