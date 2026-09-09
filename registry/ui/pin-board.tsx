"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PinnedSource = {
  who: "user" | "assistant";
  /** The turn the fact was said on. */
  turn: number;
  /** The line it came from. */
  quote: string;
};

export type PinnedFact = {
  id: string;
  /** The fact, one short line. */
  fact: string;
  source: PinnedSource;
};

export type PinBoardProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The pinned facts in pin order; the host owns the list. */
  items: PinnedFact[];
  /** Fires from a tile's unpin button or Delete on a focused tile. */
  onUnpin?: (id: string) => void;
  /** Fires when the source strip changes what it shows. */
  onSourceChange?: (id: string | null) => void;
  /** Name used for assistant sources. @default "Assistant" */
  assistantName?: string;
  /** Names the board for assistive technology. */
  label: string;
  /** @default "Nothing pinned yet" */
  emptyText?: string;
  className?: string;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * A board of facts the assistant is holding in view, laid out as wrapping
 * tiles whose widths follow their text. Pinning a fact lands its tile on
 * `recoil` from 0.9 scale — a pin pressed into a board, two visible bounces —
 * while every other tile reflows to its new place with a `layout` move on
 * `glide`; the leaving tile is popped out of layout so the reflow starts at
 * once, and the board's measured height glides with it. Hovering or focusing
 * a tile reads where it came from in a source strip under the board — who
 * said it, which turn, the quoted line — cross-fading between tiles; pressing
 * a tile holds its source open so touch has a path, and pressing again or
 * Escape lets it go.
 *
 * The fact buttons share a roving tabindex: arrows step, Home and End jump,
 * Delete or Backspace unpins the focused tile and moves focus to its
 * neighbour. The status line says a pin and an unpin once each, never a hover.
 * Under reduced motion tiles fade in place with no scale and no layout spring,
 * and the strip still cross-fades.
 */
export function PinBoard({
  ref,
  items,
  onUnpin,
  onSourceChange,
  assistantName = "Assistant",
  label,
  emptyText = "Nothing pinned yet",
  className,
}: PinBoardProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const sourceId = `${baseId}-source`;
  const factId = (id: string) => `${baseId}-fact-${id}`;

  const [held, setHeld] = React.useState<string | null>(null);
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [focused, setFocused] = React.useState<string | null>(null);
  const [active, setActive] = React.useState<string | null>(null);

  const has = (id: string | null) =>
    id !== null && items.some((item) => item.id === id);
  const shownId = [held, hovered, focused].find(has) ?? null;
  const shown = items.find((item) => item.id === shownId) ?? null;
  const activeId = has(active) ? active : (items[0]?.id ?? null);

  // What the strip shows is derived, so the host hears about every change
  // from one place — a hover, a hold, a focus move, or a tile the host itself
  // removed — after it has committed, never during render.
  const sourceChange = React.useRef(onSourceChange);
  React.useEffect(() => {
    sourceChange.current = onSourceChange;
  });
  const reported = React.useRef(shownId);
  React.useEffect(() => {
    if (reported.current === shownId) return;
    reported.current = shownId;
    sourceChange.current?.(shownId);
  }, [shownId]);

  const show = (next: {
    held?: string | null;
    hovered?: string | null;
    focused?: string | null;
  }) => {
    if (next.held !== undefined) setHeld(next.held);
    if (next.hovered !== undefined) setHovered(next.hovered);
    if (next.focused !== undefined) setFocused(next.focused);
  };

  // A pin is announced once, when its id first appears; the seen list is
  // adjusted during render so the message belongs to that arrival.
  const [seen, setSeen] = React.useState<{ ids: string[]; message: string }>(
    () => ({ ids: items.map((item) => item.id), message: "" }),
  );
  const ids = items.map((item) => item.id);
  if (
    ids.length !== seen.ids.length ||
    ids.some((id, index) => id !== seen.ids[index])
  ) {
    const fresh = items.filter((item) => !seen.ids.includes(item.id));
    setSeen({
      ids,
      message:
        fresh.length > 0
          ? `Pinned: ${fresh.map((item) => item.fact).join(". ")}`
          : seen.message,
    });
  }

  // Focus moves to the neighbour last: its focus handler runs synchronously,
  // and the state committed here must already agree with where focus lands.
  const unpin = (item: PinnedFact, position: number, fromKey: boolean) => {
    setSeen((prev) => ({ ...prev, message: `Unpinned: ${item.fact}` }));
    const neighbour = fromKey
      ? (items[position + 1] ?? items[position - 1] ?? null)
      : null;
    show({
      held: held === item.id ? null : undefined,
      hovered: hovered === item.id ? null : undefined,
      focused: neighbour
        ? neighbour.id
        : focused === item.id
          ? null
          : undefined,
    });
    if (neighbour) setActive(neighbour.id);
    onUnpin?.(item.id);
    if (neighbour) document.getElementById(factId(neighbour.id))?.focus();
  };

  const focusAt = (position: number) => {
    const item = items[clamp(position, 0, items.length - 1)];
    if (!item) return;
    setActive(item.id);
    document.getElementById(factId(item.id))?.focus();
  };

  const onKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    item: PinnedFact,
    position: number,
  ) => {
    const targets: Record<string, number> = {
      ArrowRight: position + 1,
      ArrowDown: position + 1,
      ArrowLeft: position - 1,
      ArrowUp: position - 1,
      Home: 0,
      End: items.length - 1,
    };
    const target = targets[event.key];
    if (target !== undefined) {
      event.preventDefault();
      focusAt(target);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      unpin(item, position, true);
    } else if (event.key === "Escape" && held !== null) {
      event.preventDefault();
      show({ held: null });
    }
  };

  const boardRef = React.useRef<HTMLDivElement | null>(null);
  const [boardHeight, setBoardHeight] = React.useState<number | null>(null);
  const stripRef = React.useRef<HTMLDivElement | null>(null);
  const [stripHeight, setStripHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const board = boardRef.current;
    const strip = stripRef.current;
    if (!board || !strip || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setBoardHeight(Math.round(board.offsetHeight));
      setStripHeight(Math.round(strip.offsetHeight));
    });
    observer.observe(board);
    observer.observe(strip);
    return () => observer.disconnect();
  }, []);

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const settle = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <div className="flex h-10 items-center justify-between gap-3 px-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span
          aria-hidden
          className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums"
        >
          {items.length} pinned
        </span>
      </div>

      <motion.div
        initial={false}
        animate={{ height: boardHeight ?? "auto" }}
        transition={settle}
        className="overflow-hidden"
      >
        <div ref={boardRef} className="px-3 pb-3">
          {items.length === 0 ? (
            <p className="flex h-8 items-center text-xs text-ink-3">
              {emptyText}
            </p>
          ) : null}
          <ul
            role="list"
            aria-labelledby={labelId}
            className="relative flex flex-wrap gap-1.5 empty:hidden"
          >
            <AnimatePresence initial={false} mode="popLayout">
              {items.map((item, position) => {
                const isShown = item.id === shownId;
                const isActive = item.id === activeId;
                return (
                  <motion.li
                    key={item.id}
                    layout={motionSafe ? "position" : false}
                    initial={
                      motionSafe ? { scale: 0.9, opacity: 0 } : { opacity: 0 }
                    }
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.recoil,
                            opacity: fade,
                            layout: springs.glide,
                          }
                        : fade
                    }
                    onPointerEnter={() => show({ hovered: item.id })}
                    onPointerLeave={() =>
                      show({ hovered: hovered === item.id ? null : undefined })
                    }
                    onFocus={() => show({ focused: item.id })}
                    onBlur={(event) => {
                      // Focus moving between a tile's own buttons keeps its source.
                      if (event.currentTarget.contains(event.relatedTarget))
                        return;
                      show({ focused: focused === item.id ? null : undefined });
                    }}
                    className={cn(
                      "flex h-8 max-w-full items-center rounded-full border pr-0.5 pl-0.5 transition-colors",
                      isShown
                        ? "border-cobalt-bright/50 bg-cobalt-wash"
                        : "border-hairline-strong bg-surface-2",
                    )}
                  >
                    <button
                      type="button"
                      id={factId(item.id)}
                      aria-expanded={held === item.id}
                      aria-controls={sourceId}
                      tabIndex={isActive ? 0 : -1}
                      onFocus={() => setActive(item.id)}
                      onKeyDown={(event) => onKeyDown(event, item, position)}
                      onClick={() =>
                        show({ held: held === item.id ? null : item.id })
                      }
                      className={cn(
                        "flex h-7 min-w-0 items-center gap-1.5 rounded-full pr-2 pl-1.5 text-xs font-medium text-foreground outline-none",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "size-1.5 shrink-0 rounded-full transition-colors",
                          held === item.id ? "bg-cobalt-bright" : "bg-ink-3",
                        )}
                      />
                      <span className="min-w-0 truncate" title={item.fact}>
                        {item.fact}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Unpin ${item.fact}`}
                      tabIndex={isActive ? 0 : -1}
                      onClick={() => unpin(item, position, false)}
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-full text-ink-3 transition-colors outline-none hover:bg-accent hover:text-foreground",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      )}
                    >
                      <svg
                        viewBox="0 0 16 16"
                        aria-hidden
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        className="size-3"
                      >
                        <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
                      </svg>
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </div>
      </motion.div>

      {/* Sources share one grid cell so the cross-fade never collapses the
          strip between them; the height glides to whichever is arriving. */}
      <motion.div
        initial={false}
        animate={{ height: stripHeight ?? "auto" }}
        transition={settle}
        className="overflow-hidden border-t border-hairline"
      >
        <div ref={stripRef} id={sourceId} className="grid px-3 py-2.5">
          <AnimatePresence initial={false}>
            <motion.div
              key={shown?.id ?? "none"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={fade}
              className="col-start-1 row-start-1 flex flex-col gap-0.5"
            >
              {shown ? (
                <>
                  <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                    {shown.source.who === "assistant" ? assistantName : "You"} ·
                    turn {shown.source.turn}
                  </span>
                  <span className="text-xs leading-4 text-ink-2">
                    “{shown.source.quote}”
                  </span>
                </>
              ) : (
                <span className="text-xs leading-4 text-ink-3">
                  {items.length > 0
                    ? "Hover or focus a fact for its source"
                    : "Sources show here"}
                </span>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {seen.message}
      </span>
    </div>
  );
}
