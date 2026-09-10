"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RailLevel = "info" | "warn" | "error";

export type RailLine = {
  id: string;
  /** The printed clock for this line — the component never reads one itself. */
  clock: string;
  /** Milliseconds from the first line, used for the elapsed reading and the gaps. */
  at: number;
  level: RailLevel;
  message: string;
};

export type RailMode = "clock" | "elapsed";

export type TimestampRailHandle = {
  /** Jumps to the line after the longest gap, as the rail's own controls do. */
  jumpToLongestGap: () => void;
};

export type TimestampRailProps = {
  ref?: React.Ref<TimestampRailHandle>;
  /** The log in order, each line carrying its own clock and offset. */
  lines: RailLine[];
  /** Controlled reading in the gutter. */
  mode?: RailMode;
  /** Initial reading for uncontrolled usage. @default "clock" */
  defaultMode?: RailMode;
  /** Fires from the press that flipped the reading. */
  onModeChange?: (mode: RailMode) => void;
  /** Distance between two lines before the rail draws a gap marker. @default 1000 */
  gapMs?: number;
  /** Fires when a gap is activated, with the line it landed on. */
  onJump?: (id: string, gapMs: number) => void;
  /** Fires as a gap is hovered or focused, and with null when it is released. */
  onGapFocus?: (gapMs: number | null) => void;
  /** The scroller's height in pixels; the log scrolls inside it, never the page. @default 208 */
  maxHeight?: number;
  /** Names the scrollable log for assistive technology. @default "Log" */
  label?: string;
  className?: string;
};

type Gap = {
  /** Index of the line the gap sits above. */
  index: number;
  ms: number;
};

const LEVEL_TONE: Record<RailLevel, string> = {
  info: "text-ink-3",
  warn: "text-warn",
  error: "text-danger",
};

/** Every reading is rounded before it is printed: no raw float reaches the page. */
const readGap = (ms: number): string =>
  ms >= 1000
    ? `${(Math.round(ms) / 1000).toFixed(1)} s`
    : `${Math.round(ms)} ms`;

const readElapsed = (ms: number): string => `+${readGap(ms)}`;

const speakGap = (ms: number): string =>
  ms >= 1000
    ? `${(Math.round(ms) / 1000).toFixed(1)} seconds`
    : `${Math.round(ms)} milliseconds`;

const STEM_MIN = 8;
const STEM_RANGE = 16;
const STEM_LIFT = 8;

/**
 * When each line happened. The gutter carries each line's clock, and a switch
 * condenses it to elapsed offsets from the first line; the two readings live in
 * one grid cell and cross-fade, so the column never changes width and the rows
 * never move under the reading.
 *
 * Where two consecutive lines sit further apart than `gapMs`, the rail grows a
 * dashed stem between them whose length is that gap's share of the largest one.
 * Hovering or focusing a gap lifts the stem on `snap`, swaps its compact
 * reading for a spoken one in the same cell, and tints the two lines it spans,
 * so a quiet stretch reads as a shape rather than as arithmetic. Pressing a gap
 * scrolls the box — its own box, never the page — to the line after it and
 * washes that row in `bg-cobalt-wash` on `flick`, fading out on the slow exit
 * ease so the eye is handed the landing and then released.
 *
 * Every time comes from props, so nothing here reads a clock. The gaps carry a
 * roving tabindex: Arrow Up and Down step, Home and End jump, Enter and Space
 * land. Under reduced motion the stems still size themselves to their durations,
 * the jump scrolls without smoothing, and the landing wash only fades.
 */
export function TimestampRail({
  ref,
  lines,
  mode,
  defaultMode = "clock",
  onModeChange,
  gapMs = 1000,
  onJump,
  onGapFocus,
  maxHeight = 208,
  label = "Log",
  className,
}: TimestampRailProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const [uncontrolledMode, setUncontrolledMode] =
    React.useState<RailMode>(defaultMode);
  const isControlled = mode !== undefined;
  const current = isControlled ? mode : uncontrolledMode;
  const elapsed = current === "elapsed";

  const [activeGap, setActiveGap] = React.useState(0);
  const [liveGap, setLiveGap] = React.useState<number | null>(null);
  const [glow, setGlow] = React.useState<{ id: string; n: number } | null>(
    null,
  );
  const [announcement, setAnnouncement] = React.useState("");

  const listRef = React.useRef<HTMLOListElement | null>(null);

  const origin = lines[0]?.at ?? 0;

  const gaps = React.useMemo(() => {
    const out: Gap[] = [];
    for (let index = 1; index < lines.length; index += 1) {
      const line = lines[index];
      const previous = lines[index - 1];
      if (!line || !previous) continue;
      const delta = line.at - previous.at;
      if (delta >= gapMs) out.push({ index, ms: delta });
    }
    return out;
  }, [lines, gapMs]);

  const longestGap = gaps.reduce((max, gap) => Math.max(max, gap.ms), 1);
  const activeIndex = Math.min(activeGap, Math.max(0, gaps.length - 1));

  const rowDomId = (id: string) => `${baseId}-row-${id}`;
  const gapDomId = (index: number) => `${baseId}-gap-${index}`;

  const jump = React.useCallback(
    (gap: Gap) => {
      const target = lines[gap.index];
      if (!target) return;
      const scroller = listRef.current;
      const node = document.getElementById(`${baseId}-row-${target.id}`);
      if (scroller && node) {
        scroller.scrollTo({
          top: Math.max(0, node.offsetTop - 8),
          behavior: motionSafe ? "smooth" : "auto",
        });
      }
      // The wash is keyed by this counter, so landing twice on the same row
      // replays it — no timer, and nothing to clean up.
      setGlow((previous) => ({ id: target.id, n: (previous?.n ?? 0) + 1 }));
      setAnnouncement(
        `Jumped to ${target.clock}, after a gap of ${speakGap(gap.ms)}.`,
      );
      onJump?.(target.id, gap.ms);
    },
    [baseId, lines, motionSafe, onJump],
  );

  React.useImperativeHandle(
    ref,
    () => ({
      jumpToLongestGap: () => {
        let best = -1;
        let bestMs = -1;
        gaps.forEach((gap, index) => {
          if (gap.ms > bestMs) {
            bestMs = gap.ms;
            best = index;
          }
        });
        const gap = gaps[best];
        if (!gap) return;
        setActiveGap(best);
        jump(gap);
      },
    }),
    [gaps, jump],
  );

  const focusGap = (index: number) => {
    const clamped = Math.min(gaps.length - 1, Math.max(0, index));
    if (!gaps[clamped]) return;
    setActiveGap(clamped);
    document.getElementById(gapDomId(clamped))?.focus();
  };

  const handleGapKeys = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      focusGap(index + 1);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      focusGap(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusGap(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusGap(gaps.length - 1);
    }
  };

  const setMode = (next: RailMode) => {
    if (!isControlled) setUncontrolledMode(next);
    onModeChange?.(next);
  };

  const holdGap = (gap: Gap | null, index: number | null) => {
    setLiveGap(index);
    onGapFocus?.(gap ? gap.ms : null);
  };

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const stemTransition = motionSafe ? springs.snap : fade;

  return (
    <div className={cn("flex w-full flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {label} · {gaps.length} {gaps.length === 1 ? "gap" : "gaps"}
        </p>
        <button
          type="button"
          role="switch"
          aria-checked={elapsed}
          aria-label="Elapsed times"
          onClick={() => setMode(elapsed ? "clock" : "elapsed")}
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-hairline-strong pr-2 pl-1 transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span
            aria-hidden
            className={cn(
              "flex h-4 w-7 shrink-0 items-center rounded-full px-0.5 transition-colors",
              elapsed ? "bg-cobalt-bright" : "bg-hairline-strong",
            )}
          >
            <motion.span
              className="block size-3 rounded-full bg-surface-0"
              initial={false}
              animate={{ x: elapsed ? 12 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            />
          </span>
          <span className="font-mono text-[10px] font-medium text-ink">
            Elapsed
          </span>
        </button>
      </div>

      <ol
        ref={listRef}
        role="list"
        aria-label={label}
        tabIndex={0}
        style={{ maxHeight }}
        className={cn(
          "relative flex w-full flex-col overflow-x-clip overflow-y-auto rounded-3 border border-hairline bg-surface-1 p-1.5 [contain:paint] focus-visible:outline-ring",
          "focus-visible:outline-2 focus-visible:-outline-offset-2",
        )}
      >
        {lines.map((line, index) => {
          const gapIndex = gaps.findIndex((gap) => gap.index === index);
          const gap = gaps[gapIndex];
          const lit =
            liveGap !== null &&
            (gaps[liveGap]?.index === index ||
              gaps[liveGap]?.index === index + 1);
          const open = liveGap === gapIndex && gapIndex >= 0;
          const share = gap ? Math.min(1, gap.ms / longestGap) : 0;
          const stem = Math.round(STEM_MIN + STEM_RANGE * share);

          return (
            <li key={line.id} id={rowDomId(line.id)}>
              {gap ? (
                <button
                  type="button"
                  id={gapDomId(gapIndex)}
                  tabIndex={gapIndex === activeIndex ? 0 : -1}
                  aria-label={`Gap of ${speakGap(gap.ms)}. Jump to ${line.clock}, ${line.message}.`}
                  onClick={() => {
                    setActiveGap(gapIndex);
                    jump(gap);
                  }}
                  onKeyDown={(event) => handleGapKeys(event, gapIndex)}
                  onPointerEnter={() => holdGap(gap, gapIndex)}
                  onPointerLeave={() => holdGap(null, null)}
                  onFocus={() => holdGap(gap, gapIndex)}
                  onBlur={() => holdGap(null, null)}
                  className="flex w-full items-center gap-2 rounded-2 px-1.5 py-0.5 text-left transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                >
                  <span className="flex w-[3.4rem] shrink-0 justify-center">
                    <motion.span
                      aria-hidden
                      className="block w-0 border-l border-dashed border-hairline-strong"
                      initial={false}
                      animate={{ height: open ? stem + STEM_LIFT : stem }}
                      transition={stemTransition}
                    />
                  </span>
                  {/* Both readings share one cell so the swap cannot move the
                      row or change the rail's width mid-hover. */}
                  <span className="grid min-w-0">
                    <motion.span
                      aria-hidden
                      className="col-start-1 row-start-1 truncate font-mono text-[10px] text-ink-3 tabular-nums"
                      initial={false}
                      animate={{ opacity: open ? 0 : 1 }}
                      transition={fade}
                    >
                      {readElapsed(gap.ms)}
                    </motion.span>
                    <motion.span
                      aria-hidden
                      className="col-start-1 row-start-1 truncate font-mono text-[10px] font-medium text-ink tabular-nums"
                      initial={false}
                      animate={{ opacity: open ? 1 : 0 }}
                      transition={fade}
                    >
                      waited {readGap(gap.ms)}
                    </motion.span>
                  </span>
                </button>
              ) : null}

              <div
                className={cn(
                  "relative flex items-center gap-2 rounded-2 px-1.5 py-0.5 transition-colors",
                  lit && "bg-surface-2",
                )}
              >
                {glow?.id === line.id ? (
                  <motion.span
                    key={`${line.id}-${glow.n}`}
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-2 bg-cobalt-wash"
                    initial={{ opacity: 0 }}
                    // Three keyframes, so this is a tween: the wash arrives
                    // fast and leaves slowly. A spring would drop the middle.
                    animate={{ opacity: [0, 0.95, 0] }}
                    transition={{
                      duration: durations.page,
                      times: [0, 0.12, 1],
                      ease: easings.exit,
                    }}
                  />
                ) : null}
                <span className="grid w-[3.4rem] shrink-0">
                  <motion.span
                    aria-hidden={elapsed}
                    className="col-start-1 row-start-1 font-mono text-[10px] text-ink-3 tabular-nums"
                    initial={false}
                    animate={{ opacity: elapsed ? 0 : 1 }}
                    transition={fade}
                  >
                    {line.clock}
                  </motion.span>
                  <motion.span
                    aria-hidden={!elapsed}
                    className="col-start-1 row-start-1 font-mono text-[10px] text-ink-3 tabular-nums"
                    initial={false}
                    animate={{ opacity: elapsed ? 1 : 0 }}
                    transition={fade}
                  >
                    {readElapsed(Math.max(0, line.at - origin))}
                  </motion.span>
                </span>
                <span
                  className={cn(
                    "relative w-9 shrink-0 font-mono text-[10px] font-medium",
                    LEVEL_TONE[line.level],
                  )}
                >
                  {line.level}
                </span>
                <span
                  title={line.message}
                  className="relative min-w-0 flex-1 truncate font-mono text-[11px] text-ink"
                >
                  {line.message}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
