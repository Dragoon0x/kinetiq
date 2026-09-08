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

/** One mined block. `txCount` against `capacity` draws the fullness bar. */
export type StreamBlock = {
  id: string;
  height: number;
  txCount: number;
};

export type BlockStreamProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Blocks oldest first; the newest sits at the right of the rail. */
  blocks: StreamBlock[];
  /** Tiles kept on the rail. Older ones leave to the left. @default 5 */
  max?: number;
  /** Transactions a full block holds; sets each fullness bar. @default 2400 */
  capacity?: number;
  /** Host-driven hold, OR-ed with the pointer and focus hold. */
  paused?: boolean;
  /** Fires from the pointer or focus event that changed the hold. */
  onPauseChange?: (paused: boolean) => void;
  /** Fires from the press that pins or unpins a tile. */
  onSelect?: (block: StreamBlock | null) => void;
  /** Formats heights and transaction counts. @default grouped integers */
  format?: (value: number) => string;
  /** Announces each settled block politely. Turn it off in a busy page. @default true */
  announce?: boolean;
  /** Names the rail for assistive technology. @default "Block stream" */
  label?: string;
  /** Shown while the rail is empty. @default "No blocks yet." */
  emptyLabel?: string;
  className?: string;
};

const COUNT = new Intl.NumberFormat("en-US");
const defaultFormat = (value: number): string => COUNT.format(value);

/**
 * A rail of blocks that fills from the right. A new block enters from a `shift`
 * beyond the right edge on `snap` — an arrival is an indicator taking its
 * position, one crisp overshoot — while the tiles already on the rail slide one
 * place left under a `layout` animation on `glide`, because the shuffle it
 * causes is a layout shift. The tile pushed off the end leaves on the exit ease,
 * since exits accelerate away and never spring. Each tile carries its height,
 * its transaction count, and a fullness bar that extends on `glide`.
 *
 * Pointing at the rail or focusing any tile holds the stream: the hold is
 * reported through `onPauseChange` so the host stops feeding, a Held chip fades
 * in, and the live dot dims. Focus does exactly what the pointer does, so the
 * keyboard can read a tile without it sliding away.
 *
 * Tiles are buttons on a roving tabindex: Left and Right step, Home and End jump
 * to the ends of the rail, Enter or Space pins a tile so its detail survives the
 * pointer leaving, Escape releases it. Nothing is timed inside the rail — the
 * host mines blocks by appending to `blocks`. Under reduced motion tiles appear
 * in place and the bars still extend, because how full a block is is
 * information.
 */
export function BlockStream({
  ref,
  blocks,
  max = 5,
  capacity = 2400,
  paused = false,
  onPauseChange,
  onSelect,
  format = defaultFormat,
  announce = true,
  label = "Block stream",
  emptyLabel = "No blocks yet.",
  className,
}: BlockStreamProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [pointerIn, setPointerIn] = React.useState(false);
  const [focusIn, setFocusIn] = React.useState(false);
  const [pinned, setPinned] = React.useState<string | null>(null);
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [lit, setLit] = React.useState<string | null>(null);
  const [focusIndex, setFocusIndex] = React.useState(0);
  const tileRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const shown = blocks.slice(-Math.max(1, Math.trunc(max)));
  const newest = shown[shown.length - 1] ?? null;
  const held = paused || pointerIn || focusIn;

  // Reported from the event that caused it, never from a state updater: the
  // handler already knows what the hold is about to become.
  const report = (next: boolean) => {
    if (next !== held) onPauseChange?.(next);
  };

  const anchor = Math.min(focusIndex, Math.max(0, shown.length - 1));

  const focusAt = (to: number) => {
    const clamped = Math.min(shown.length - 1, Math.max(0, to));
    setFocusIndex(clamped);
    tileRefs.current[clamped]?.focus();
  };

  const pick = (block: StreamBlock) => {
    const next = pinned === block.id ? null : block.id;
    setPinned(next);
    onSelect?.(next === null ? null : block);
  };

  const release = () => {
    if (pinned === null) return;
    setPinned(null);
    onSelect?.(null);
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        focusAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(shown.length - 1);
        break;
      case "Escape":
        release();
        break;
      default:
        break;
    }
  };

  const share = (block: StreamBlock) =>
    Math.min(1, Math.max(0, block.txCount / Math.max(1, capacity)));
  const percent = (block: StreamBlock) => Math.round(share(block) * 100);

  // Focus lights a tile exactly as the pointer does, so the caption is
  // reachable without a mouse.
  const activeId = pinned ?? hovered ?? lit;
  const active = shown.find((block) => block.id === activeId) ?? newest;

  const caption = active
    ? `Block ${format(active.height)} · ${format(active.txCount)} tx · ${percent(
        active,
      )}% full`
    : emptyLabel;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-2 rounded-3 border border-hairline bg-card p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          id={labelId}
          className="min-w-0 truncate text-[11px] font-medium text-ink-2"
        >
          {label}
        </span>
        <span className="flex h-5 shrink-0 items-center gap-2">
          <AnimatePresence initial={false}>
            {held ? (
              <motion.span
                key="held"
                className="inline-flex h-5 items-center rounded-full border border-hairline-strong bg-surface-2 px-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.fast, ease: easings.enter }}
              >
                Held
              </motion.span>
            ) : null}
          </AnimatePresence>
          <motion.span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full bg-cobalt-bright"
            animate={{ opacity: held ? 0.3 : 1 }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          />
        </span>
      </div>

      {/* Clipped so the entering tile travels in from outside the rail; the
          tiles themselves flex, so none is ever cut off and focus can never
          scroll the rail out from under the reader. */}
      <div
        className="overflow-hidden rounded-2 bg-surface-1 p-1"
        onPointerEnter={() => {
          report(true);
          setPointerIn(true);
        }}
        onPointerLeave={() => {
          report(paused || focusIn);
          setPointerIn(false);
          setHovered(null);
        }}
        onFocus={() => {
          report(true);
          setFocusIn(true);
        }}
        onBlur={(event) => {
          // focusout bubbles, so stepping from one tile to the next would
          // otherwise drop the hold for a frame and restart the host's feed.
          if (event.currentTarget.contains(event.relatedTarget)) return;
          report(paused || pointerIn);
          setFocusIn(false);
        }}
      >
        <ol
          aria-labelledby={labelId}
          className="flex items-stretch justify-end gap-1.5"
        >
          <AnimatePresence initial={false} mode="popLayout">
            {shown.map((block, index) => {
              const isActive = activeId === block.id;
              const isNewest = block.id === newest?.id;
              return (
                <motion.li
                  key={block.id}
                  layout={motionSafe ? "position" : false}
                  className="max-w-[112px] min-w-0 flex-1"
                  initial={
                    motionSafe
                      ? { x: distances.shift, opacity: 0 }
                      : { opacity: 0 }
                  }
                  animate={{ x: 0, opacity: 1 }}
                  exit={{
                    opacity: 0,
                    x: motionSafe ? -distances.step : 0,
                    transition: exitFor(),
                  }}
                  transition={
                    motionSafe
                      ? { ...springs.snap, layout: springs.glide }
                      : { duration: durations.fast, ease: easings.enter }
                  }
                >
                  <motion.button
                    type="button"
                    ref={(node) => {
                      tileRefs.current[index] = node;
                    }}
                    tabIndex={index === anchor ? 0 : -1}
                    aria-pressed={pinned === block.id}
                    aria-label={`Block ${format(block.height)}, ${format(
                      block.txCount,
                    )} transactions, ${percent(block)} percent full`}
                    onClick={() => pick(block)}
                    onFocus={() => {
                      setFocusIndex(index);
                      setLit(block.id);
                    }}
                    onBlur={() => setLit(null)}
                    onKeyDown={(event) => onKeyDown(event, index)}
                    onPointerEnter={() => setHovered(block.id)}
                    className={cn(
                      "flex w-full flex-col gap-1 rounded-2 border px-1.5 py-1.5 text-left transition-colors outline-none",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      isActive
                        ? "border-cobalt-bright bg-cobalt-wash"
                        : "border-hairline-strong bg-surface-2 hover:bg-accent",
                    )}
                    animate={{
                      y: motionSafe && isActive ? -2 : 0,
                    }}
                    transition={
                      motionSafe ? springs.glide : { duration: durations.fast }
                    }
                  >
                    <span
                      aria-hidden
                      className="flex items-center gap-1 font-mono text-[10px] text-ink-3 tabular-nums"
                    >
                      <span className="min-w-0 truncate">
                        {format(block.height)}
                      </span>
                      {isNewest ? (
                        <span className="size-1 shrink-0 rounded-full bg-cobalt-bright" />
                      ) : null}
                    </span>
                    <span
                      aria-hidden
                      className="truncate font-mono text-[11px] font-medium text-ink tabular-nums"
                    >
                      {format(block.txCount)}
                    </span>
                    <span
                      aria-hidden
                      className="h-1 w-full overflow-hidden rounded-full bg-hairline-strong"
                    >
                      <motion.span
                        className={cn(
                          "block h-full origin-left rounded-full",
                          share(block) >= 0.9 ? "bg-warn" : "bg-cobalt-bright",
                        )}
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: share(block) }}
                        transition={
                          motionSafe
                            ? springs.glide
                            : { duration: durations.base, ease: easings.enter }
                        }
                      />
                    </span>
                  </motion.button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      </div>

      <p
        className="truncate font-mono text-[10px] text-ink-3"
        title={caption}
        aria-hidden={shown.length > 0}
      >
        {caption}
      </p>

      <span role="status" className="sr-only">
        {announce && newest
          ? `Block ${format(newest.height)}, ${format(newest.txCount)} transactions.`
          : ""}
      </span>
    </div>
  );
}
