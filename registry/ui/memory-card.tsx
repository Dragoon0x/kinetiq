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

export type MemoryItem = {
  id: string;
  /** The fact, one short line. */
  fact: string;
  /** A mono note under the fact — the turn it was learned on, say. */
  note?: string;
  /** Held at the top of the rail. */
  pinned?: boolean;
};

export type MemoryCardProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The saved facts in arrival order; the host owns the list. */
  items: MemoryItem[];
  /** Fires from a card's pin toggle. */
  onPin?: (id: string, pinned: boolean) => void;
  /** Fires from a card's forget button. */
  onForget?: (id: string) => void;
  /** Names the rail. */
  label: string;
  /** @default "Nothing remembered yet" */
  emptyText?: string;
  className?: string;
};

type Control = "pin" | "forget";

/** A pushpin from the side: head, body, base and needle, drawn in that order. */
const PIN = "M5.5 3h5M6.5 3l-.75 4.5M9.5 3l.75 4.5M4.5 7.5h7M8 7.5v6";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function PinGlyph({
  pinned,
  motionSafe,
}: {
  pinned: boolean;
  motionSafe: boolean;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0"
    >
      <path d={PIN} className="text-ink-3" />
      {/* The held pin draws over the outline on flick — the acknowledgement
          lands before the card travels. */}
      <motion.path
        d={PIN}
        className="text-cobalt-bright"
        pathLength={1}
        initial={false}
        animate={{ pathLength: pinned ? 1 : 0, opacity: pinned ? 1 : 0 }}
        transition={
          motionSafe
            ? { ...springs.flick, opacity: { duration: durations.blink } }
            : { duration: 0 }
        }
      />
    </svg>
  );
}

/**
 * A rail of the facts an assistant has saved, newest at the bottom and pinned
 * ones held at the top. A saved card slides in from `distances.shift` on
 * `snap` — one crisp overshoot, a card landing in its slot — while the rail's
 * height is measured by a ResizeObserver and glides on `glide` to make room.
 * Pressing the pin draws the glyph on `flick` and the card travels to the top
 * through a `layout` move on `glide`; forgetting slides the card out on the
 * exit ease with a fade, popped out of flow so the cards beneath close the gap
 * at once.
 *
 * Every card holds two real buttons, so Tab reaches each one; ArrowDown and
 * ArrowUp move to the same control on the next card, Home and End to the ends.
 * A status line announces a save, a pin and a forget once each, on settle.
 * Under reduced motion cards fade in place, reorders swap without a spring and
 * the pin appears complete — the order is the information.
 */
export function MemoryCard({
  ref,
  items,
  onPin,
  onForget,
  label,
  emptyText = "Nothing remembered yet",
  className,
}: MemoryCardProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const controlId = (control: Control, id: string) =>
    `${baseId}-${control}-${id}`;

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setHeight(Math.round(node.offsetHeight)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // A save is announced once, when its id first appears; the list of seen ids
  // is adjusted during render so the message belongs to that arrival. Cards
  // present at mount stay silent.
  const [seen, setSeen] = React.useState<{ ids: string[]; message: string }>(
    () => ({ ids: items.map((item) => item.id), message: "" }),
  );
  const ids = items.map((item) => item.id);
  const changed =
    ids.length !== seen.ids.length ||
    ids.some((id, index) => id !== seen.ids[index]);
  if (changed) {
    const fresh = items.filter((item) => !seen.ids.includes(item.id));
    setSeen({
      ids,
      message:
        fresh.length > 0
          ? `Saved: ${fresh.map((item) => item.fact).join(". ")}`
          : seen.message,
    });
  }

  const pin = (item: MemoryItem) => {
    const next = !item.pinned;
    setSeen((prev) => ({
      ...prev,
      message: `${next ? "Pinned" : "Unpinned"}: ${item.fact}`,
    }));
    onPin?.(item.id, next);
  };
  const forget = (item: MemoryItem) => {
    setSeen((prev) => ({ ...prev, message: `Forgot: ${item.fact}` }));
    onForget?.(item.id);
  };

  // Pinned cards first, each group in arrival order.
  const ordered = items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        Number(Boolean(b.item.pinned)) - Number(Boolean(a.item.pinned)) ||
        a.index - b.index,
    );
  const pinnedCount = items.filter((item) => item.pinned).length;
  const count =
    items.length === 0
      ? ""
      : `${items.length} saved${pinnedCount > 0 ? ` · ${pinnedCount} pinned` : ""}`;

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    position: number,
    control: Control,
  ) => {
    const targets: Record<string, number> = {
      ArrowDown: position + 1,
      ArrowUp: position - 1,
      Home: 0,
      End: ordered.length - 1,
    };
    const target = targets[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const entry = ordered[clamp(target, 0, ordered.length - 1)];
    if (!entry) return;
    document.getElementById(controlId(control, entry.item.id))?.focus();
  };

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const settle = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };
  const control =
    "grid size-8 shrink-0 place-items-center rounded-1 transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

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
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={count}
            className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={fade}
          >
            {count}
          </motion.span>
        </AnimatePresence>
      </div>

      <motion.div
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={settle}
        className="overflow-hidden"
      >
        <div ref={innerRef} className="px-3 pb-3">
          {items.length === 0 ? (
            // Held back for the exit's length so the hint arrives after the
            // last card has gone rather than beside it.
            <motion.p
              className="flex h-8 items-center text-xs text-ink-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...fade, delay: durations.base * 0.6 }}
            >
              {emptyText}
            </motion.p>
          ) : null}
          <ul
            aria-labelledby={labelId}
            className="relative flex flex-col gap-1.5 empty:hidden"
          >
            <AnimatePresence initial={false} mode="popLayout">
              {ordered.map(({ item }, position) => {
                const pinned = Boolean(item.pinned);
                return (
                  <motion.li
                    key={item.id}
                    layout={motionSafe ? "position" : false}
                    initial={
                      motionSafe
                        ? { x: distances.shift, opacity: 0 }
                        : { opacity: 0 }
                    }
                    animate={{ x: 0, opacity: 1 }}
                    exit={{
                      x: motionSafe ? distances.shift : 0,
                      opacity: 0,
                      transition: exitFor(),
                    }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.snap,
                            opacity: fade,
                            layout: springs.glide,
                          }
                        : fade
                    }
                    className={cn(
                      "flex w-full items-center gap-1.5 rounded-2 border p-1 transition-colors",
                      pinned
                        ? "border-cobalt-bright/50 bg-cobalt-wash"
                        : "border-hairline-strong bg-surface-2",
                    )}
                  >
                    <button
                      type="button"
                      id={controlId("pin", item.id)}
                      aria-pressed={pinned}
                      aria-label={`${pinned ? "Unpin" : "Pin"} ${item.fact}`}
                      onClick={() => pin(item)}
                      onKeyDown={(event) =>
                        handleKeyDown(event, position, "pin")
                      }
                      className={cn(
                        control,
                        pinned ? "text-cobalt-bright" : "text-ink-3",
                      )}
                    >
                      <PinGlyph pinned={pinned} motionSafe={motionSafe} />
                    </button>
                    <span className="flex min-w-0 flex-1 flex-col py-0.5">
                      <span className="text-sm leading-5 text-foreground">
                        {item.fact}
                      </span>
                      {item.note ? (
                        <span className="font-mono text-[10px] leading-4 tracking-[0.08em] text-ink-3 uppercase">
                          {item.note}
                        </span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      id={controlId("forget", item.id)}
                      aria-label={`Forget ${item.fact}`}
                      onClick={() => forget(item)}
                      onKeyDown={(event) =>
                        handleKeyDown(event, position, "forget")
                      }
                      className={cn(
                        control,
                        "text-ink-3 hover:text-foreground",
                      )}
                    >
                      <svg
                        viewBox="0 0 16 16"
                        aria-hidden
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        className="size-3.5"
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

      <span role="status" className="sr-only">
        {seen.message}
      </span>
    </div>
  );
}
