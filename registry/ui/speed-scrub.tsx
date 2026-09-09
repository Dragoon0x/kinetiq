"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SpeedScrubProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The finished answer. */
  text: string;
  /** Controlled replay position in characters. */
  position?: number;
  /** Initial position for uncontrolled usage. @default 0 */
  defaultPosition?: number;
  /** Fires from the interval, a key press, or a pointer scrub. */
  onPositionChange?: (position: number) => void;
  /** Controlled play state. */
  playing?: boolean;
  /** Initial play state for uncontrolled usage. @default false */
  defaultPlaying?: boolean;
  /** Fires from the play control, Space, a press on the text, or reaching the end. */
  onPlayingChange?: (playing: boolean) => void;
  /** Controlled multiplier. */
  speed?: number;
  /** Initial multiplier for uncontrolled usage. @default 1 */
  defaultSpeed?: number;
  /** Fires from the speed row. */
  onSpeedChange?: (speed: number) => void;
  /** The multipliers offered. @default [0.5, 1, 2, 4] */
  speeds?: number[];
  /** Characters per second at 1×. @default 40 */
  charsPerSecond?: number;
  /** Names the answer and the scrubber for assistive technology. */
  label: string;
  /** The model's name for the header chip. */
  model?: string;
  className?: string;
};

const DEFAULT_SPEEDS = [0.5, 1, 2, 4];
/** Interval period; a fixed step so the replay never samples a clock. */
const TICK = 33;
/** Pointer travel before a press becomes a drag and captures the pointer. */
const SLOP = 4;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

type Word = { start: number; end: number; word: string };
type Gesture = { id: number; x: number; y: number; dragging: boolean };

/** Keeps a callback out of an effect's dependencies so a re-render cannot restart the interval. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * A finished answer whose arrival can be replayed at a chosen pace. The whole
 * text is present from the first frame — full ink before the position, faint
 * ink after — and the thumb sits inline at the boundary, so it rides the text
 * through every line wrap without a measurement. Play advances the position
 * from a fixed-step interval that runs only while playing and the tab is
 * visible; nothing here reads a clock. Pause holds mid-word: the thumb swells
 * on `snap` to say it is held and the readout names the word. The speed row's
 * indicator glides between stops on `snap`. Pressing the text scrubs to the
 * character under the pointer (the caret hit-test, with a proportional
 * fallback); a drag past four pixels captures the pointer inside a try/catch.
 *
 * The paragraph is real text; a transparent slider sized by it carries the
 * position — Left/Right a word, Up/Down five, Home/End, Space plays. Under
 * reduced motion the thumb marks the hold by opacity, the speed indicator
 * swaps without gliding, and the replay still runs: a replay is the content.
 */
export function SpeedScrub({
  ref,
  text,
  position: positionProp,
  defaultPosition = 0,
  onPositionChange,
  playing: playingProp,
  defaultPlaying = false,
  onPlayingChange,
  speed: speedProp,
  defaultSpeed = 1,
  onSpeedChange,
  speeds = DEFAULT_SPEEDS,
  charsPerSecond = 40,
  label,
  model,
  className,
}: SpeedScrubProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const speedLabelId = `${baseId}-speed`;

  const length = text.length;
  const [ownPosition, setOwnPosition] = React.useState(defaultPosition);
  const [ownPlaying, setOwnPlaying] = React.useState(defaultPlaying);
  const [ownSpeed, setOwnSpeed] = React.useState(defaultSpeed);
  const position = clamp(Math.round(positionProp ?? ownPosition), 0, length);
  const playing = playingProp ?? ownPlaying;
  const speed = speedProp ?? ownSpeed;
  const [note, setNote] = React.useState("");

  const words = React.useMemo<Word[]>(
    () =>
      Array.from(text.matchAll(/\S+/g), (match) => ({
        start: match.index,
        end: match.index + match[0].length,
        word: match[0],
      })),
    [text],
  );
  const wordIndex = (at: number) => words.filter((w) => w.start < at).length;
  const heldIn = (at: number) =>
    words.find((w) => w.start < at && at < w.end)?.word;
  const describe = (at: number) => {
    const held = heldIn(at);
    const where = `word ${wordIndex(at)} of ${words.length}`;
    return held ? `Held in ${held}, ${where}` : where;
  };

  const commitPosition = (next: number) => {
    const clamped = clamp(Math.round(next), 0, length);
    if (clamped === position) return;
    if (positionProp === undefined) setOwnPosition(clamped);
    onPositionChange?.(clamped);
  };
  const commitPlaying = (next: boolean, at: number) => {
    if (next === playing) return;
    if (playingProp === undefined) setOwnPlaying(next);
    onPlayingChange?.(next);
    setNote(
      next
        ? `Playing at ${speed}×.`
        : at >= length
          ? "End of answer."
          : `Paused, ${describe(at).toLowerCase()}.`,
    );
  };
  const commitSpeed = (next: number) => {
    if (next === speed) return;
    if (speedProp === undefined) setOwnSpeed(next);
    onSpeedChange?.(next);
  };
  const togglePlay = () => {
    if (playing) return commitPlaying(false, position);
    // Play at the end is a request to see it again.
    const from = position >= length ? 0 : position;
    if (from !== position) commitPosition(from);
    commitPlaying(true, from);
  };

  const positionRef = useLatest(position);
  const commitPositionRef = useLatest(commitPosition);
  const commitPlayingRef = useLatest(commitPlaying);

  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    if (!playing || !visible || length === 0) return;
    // Fractions accumulate locally; a key step while playing moves the
    // committed value, so the accumulator re-seeds whenever they disagree.
    let acc = positionRef.current;
    let last = Math.floor(acc);
    const perTick = (charsPerSecond * speed * TICK) / 1000;
    const timer = window.setInterval(() => {
      if (positionRef.current !== last) acc = positionRef.current;
      acc = Math.min(length, acc + perTick);
      last = Math.floor(acc);
      commitPositionRef.current(last);
      if (acc >= length) commitPlayingRef.current(false, length);
    }, TICK);
    return () => window.clearInterval(timer);
  }, [
    playing,
    visible,
    speed,
    charsPerSecond,
    length,
    positionRef,
    commitPositionRef,
    commitPlayingRef,
  ]);

  // --- pointer scrub -------------------------------------------------------
  const textRef = React.useRef<HTMLParagraphElement | null>(null);
  const sliderRef = React.useRef<HTMLDivElement | null>(null);
  const gesture = React.useRef<Gesture | null>(null);

  const offsetAt = (clientX: number, clientY: number): number | null => {
    const node = textRef.current;
    if (!node) return null;
    let hit: { node: Node; offset: number } | null = null;
    try {
      // The standard API first; the older WebKit range form where that is
      // all there is. Either may throw on a point outside the document.
      if (typeof document.caretPositionFromPoint === "function") {
        const caret = document.caretPositionFromPoint(clientX, clientY);
        if (caret) hit = { node: caret.offsetNode, offset: caret.offset };
      } else {
        const range = document.caretRangeFromPoint(clientX, clientY);
        if (range)
          hit = { node: range.startContainer, offset: range.startOffset };
      }
    } catch {
      hit = null;
    }
    if (
      hit &&
      node.contains(hit.node) &&
      hit.node.nodeType === Node.TEXT_NODE
    ) {
      // Characters before the hit node, counted through the paragraph's text
      // nodes in order — the thumb has none, so it never shifts the count.
      let total = 0;
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      for (let cur = walker.nextNode(); cur; cur = walker.nextNode()) {
        if (cur === hit.node) return total + hit.offset;
        total += cur.textContent?.length ?? 0;
      }
    }
    // No caret API: read the block as rows of equal length.
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const lineHeight = parseFloat(getComputedStyle(node).lineHeight) || 20;
    const rows = Math.max(1, Math.round(rect.height / lineHeight));
    const fy = clamp((clientY - rect.top) / rect.height, 0, 1);
    const fx = clamp((clientX - rect.left) / rect.width, 0, 1);
    const row = Math.min(rows - 1, Math.floor(fy * rows));
    return Math.round((length * (row + fx)) / rows);
  };

  const scrubTo = (clientX: number, clientY: number) => {
    const offset = offsetAt(clientX, clientY);
    if (offset !== null) commitPosition(offset);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const { pointerId: id, clientX: x, clientY: y } = event;
    gesture.current = { id, x, y, dragging: false };
    // A press is a hold: the replay stops where the finger lands, and the
    // slider takes focus so Space can resume it.
    if (playing) commitPlaying(false, position);
    sliderRef.current?.focus({ preventScroll: true });
    scrubTo(x, y);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    if (!active.dragging) {
      const dx = Math.abs(event.clientX - active.x);
      const dy = Math.abs(event.clientY - active.y);
      if (dx < SLOP && dy < SLOP) return;
      active.dragging = true;
      try {
        // Capture only once the press has become a drag — and never let a
        // synthetic sweep from a test suite throw on the way in.
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A pointer that already ended cannot be captured; carry on.
      }
    }
    scrubTo(event.clientX, event.clientY);
  };

  const endGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    gesture.current = null;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Releasing a capture the browser already dropped is not an error.
    }
  };

  // --- keyboard ------------------------------------------------------------
  const stepWords = (by: number) => {
    // Inside a word, one step back reaches that word's start.
    const back = by < 0 && heldIn(position) !== undefined ? 1 : 0;
    const target = clamp(wordIndex(position) + by + back, 0, words.length);
    commitPosition(target === 0 ? 0 : (words[target - 1]?.end ?? length));
  };

  const handleSliderKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const actions: Record<string, () => void> = {
      ArrowRight: () => stepWords(1),
      ArrowLeft: () => stepWords(-1),
      ArrowUp: () => stepWords(5),
      ArrowDown: () => stepWords(-5),
      Home: () => commitPosition(0),
      End: () => commitPosition(length),
      " ": togglePlay,
      Enter: togglePlay,
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  const speedIndex = Math.max(0, speeds.indexOf(speed));
  const handleSpeedKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const targets: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowUp: index + 1,
      ArrowLeft: index - 1,
      ArrowDown: index - 1,
      Home: 0,
      End: speeds.length - 1,
    };
    const target = targets[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const next = speeds[clamp(target, 0, speeds.length - 1)];
    if (next === undefined) return;
    document.getElementById(`${baseId}-speed-${next}`)?.focus();
    commitSpeed(next);
  };

  const ended = position >= length && length > 0;
  const held = playing ? undefined : heldIn(position);
  const control =
    "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      <div className="flex h-7 items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className={cn(
              "size-1.5 shrink-0 rounded-full transition-colors",
              playing ? "bg-cobalt-bright" : "bg-ink-3",
            )}
          />
          <span id={labelId} className="sr-only">
            {label}
          </span>
          <span
            aria-hidden
            className="truncate text-xs font-medium text-ink-2"
            title={model ?? label}
          >
            {model ?? label}
          </span>
        </span>
        <button
          type="button"
          aria-pressed={playing}
          onClick={togglePlay}
          className={cn(
            "flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-hairline-strong bg-surface-0 px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent",
            control,
          )}
        >
          <svg viewBox="0 0 16 16" aria-hidden className="size-3 shrink-0">
            <path
              d={playing ? "M4 3h3v10H4zM9 3h3v10H9z" : "M5 3.2v9.6L12.5 8z"}
              fill="currentColor"
            />
          </svg>
          {playing ? "Pause" : ended ? "Replay" : "Play"}
        </button>
      </div>

      <div
        className="relative"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
      >
        <p
          ref={textRef}
          className="min-w-0 cursor-ew-resize text-sm leading-relaxed whitespace-pre-wrap text-foreground select-none"
        >
          <span>{text.slice(0, position)}</span>
          <motion.span
            aria-hidden
            className="mx-px inline-block h-[1em] w-[3px] rounded-full bg-cobalt-bright align-[-0.15em]"
            initial={false}
            animate={{
              scaleX: motionSafe && !playing ? 1.4 : 1,
              scaleY: motionSafe && !playing ? 1.25 : 1,
              opacity: !motionSafe && playing ? 0.6 : 1,
            }}
            transition={
              motionSafe ? springs.snap : { duration: durations.fast }
            }
          />
          <span className="opacity-40">{text.slice(position)}</span>
        </p>
        {/* The slider is a transparent layer that lets the pointer through
            to the text, so the caret hit-test lands on real characters. */}
        <div
          ref={sliderRef}
          role="slider"
          tabIndex={0}
          aria-labelledby={labelId}
          aria-valuemin={0}
          aria-valuemax={length}
          aria-valuenow={position}
          aria-valuetext={describe(position)}
          onKeyDown={handleSliderKeyDown}
          className={cn(
            "pointer-events-none absolute -inset-1 rounded-2",
            control,
          )}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-2">
        <span id={speedLabelId} className="sr-only">
          Speed
        </span>
        <div
          role="radiogroup"
          aria-labelledby={speedLabelId}
          className="flex h-7 items-stretch rounded-full border border-hairline bg-surface-2 p-0.5"
        >
          {speeds.map((option, index) => {
            const checked = option === speed;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={checked}
                id={`${baseId}-speed-${option}`}
                tabIndex={index === speedIndex ? 0 : -1}
                onClick={() => commitSpeed(option)}
                onKeyDown={(event) => handleSpeedKeyDown(event, index)}
                className={cn(
                  "relative flex min-w-9 items-center justify-center rounded-full px-2 font-mono text-[11px] font-medium tabular-nums transition-colors",
                  checked
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                  control,
                )}
              >
                {checked ? (
                  // Without a layoutId the knob simply appears at its stop,
                  // which is the reduced-motion state.
                  <motion.span
                    aria-hidden
                    layoutId={motionSafe ? `${baseId}-knob` : undefined}
                    transition={springs.snap}
                    className="absolute inset-0 rounded-full border border-hairline bg-surface-0 shadow-sm"
                  />
                ) : null}
                <span className="relative">{option}×</span>
              </button>
            );
          })}
        </div>
        <span
          aria-hidden
          className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase tabular-nums"
        >
          {held ? `held in ${held} · ` : ""}
          word {wordIndex(position)} / {words.length}
        </span>
      </div>

      <span role="status" className="sr-only">
        {note}
      </span>
    </div>
  );
}
