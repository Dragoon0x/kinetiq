"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

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

export type ReadReader = {
  id: string;
  name: string;
  /** When they read it, already formatted. */
  at: string;
  /** Derived from the name when omitted. */
  initials?: string;
};

export type ReadWaveProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The message body. */
  text: string;
  /** When it was sent, printed under the bubble. */
  time?: string;
  /** Everyone who has read it, in read order. Append to it as they do. */
  readers: ReadReader[];
  /** People who could read it; the count then reads "3 of 5". */
  total?: number;
  /** Avatars shown before the rest collapse into a "+N" pip. @default 5 */
  maxAvatars?: number;
  /** Controlled fan state — pinned open regardless of hover or focus. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Names the thread list. @default "Thread" */
  label?: string;
  className?: string;
};

const FADE = { duration: durations.fast, ease: easings.enter } as const;
const EXIT = { opacity: 0, transition: exitFor(durations.fast) } as const;
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const TONES = [
  "bg-cobalt-wash text-cobalt-bright",
  "bg-surface-2 text-ink-2",
  "bg-accent text-accent-foreground",
] as const;

const initialsOf = (reader: ReadReader) =>
  reader.initials ??
  reader.name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();

/** A stable tone per reader so the same person keeps the same disc. */
const toneOf = (id: string) => {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return TONES[hash % TONES.length] ?? "bg-surface-2 text-ink-2";
};

/**
 * Digits that roll to their new face on `snap`, hidden from assistive
 * technology because the control's name already carries the number.
 */
function RollingNumber({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Keyed from the right so the units column keeps its identity when
        // the number gains a digit.
        const key = value.length - index;
        if (digit < 0) return <span key={key}>{char}</span>;
        return (
          <span
            key={key}
            className="relative inline-block h-[1.25em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((face) => (
                <span
                  key={face}
                  className="flex h-[1.25em] items-center justify-center"
                >
                  {face}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

function Disc({
  reader,
  className,
}: {
  reader: ReadReader;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-full border border-surface-0 text-[9px] leading-none font-semibold",
        toneOf(reader.id),
        className,
      )}
    >
      {initialsOf(reader)}
    </span>
  );
}

/**
 * Seen by whom, and when. Under a sent bubble sits a row of reader discs:
 * each new reader slides in from `distances.step` below on `snap` and tucks
 * into the overlapping tail while the "Seen by" count rolls its digits on the
 * same spring. Hovering, focusing, or pressing the row fans the discs apart —
 * a layout FLIP on `snap` — and unfolds a list of names and times beneath,
 * measured and glided on `glide`, its rows cascading in. Escape, leaving, or
 * pressing again folds it.
 *
 * The row is a button with `aria-expanded` whose name carries the count; the
 * fanned list is a real list; a status region speaks each arrival once. Under
 * reduced motion discs and rows fade in place, digits swap, and the fan does
 * not spread.
 */
export function ReadWave({
  ref,
  text,
  time,
  readers,
  total,
  maxAvatars = 5,
  open,
  defaultOpen = false,
  onOpenChange,
  label = "Thread",
  className,
}: ReadWaveProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const listId = `${baseId}-readers`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
  const pinned = open ?? uncontrolled;
  const setPinned = (next: boolean) => {
    if (open === undefined) setUncontrolled(next);
    onOpenChange?.(next);
  };
  // Hover and focus open the fan on their own; Escape dismisses until the
  // pointer leaves or focus moves, so the fan cannot spring straight back.
  const [hover, setHover] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);

  const count = readers.length;
  const expanded = count > 0 && (pinned || (!dismissed && (hover || focused)));
  const shown = readers.slice(0, Math.max(0, maxAvatars));
  const overflow = count - shown.length;

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      setHeight(Math.round(box ? box.blockSize : node.offsetHeight));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Speak each arrival once. Adjusted during render so the sentence belongs
  // to the render that brought the reader, not to a later one.
  const [seen, setSeen] = React.useState<{ ids: string[]; message: string }>(
    () => ({ ids: readers.map((reader) => reader.id), message: "" }),
  );
  const fresh = readers.filter((reader) => !seen.ids.includes(reader.id));
  if (fresh.length > 0 || seen.ids.length !== count) {
    const only = fresh.length === 1 ? fresh[0] : undefined;
    setSeen({
      ids: readers.map((reader) => reader.id),
      message: only
        ? `Read by ${only.name} at ${only.at}`
        : fresh.length > 1
          ? `Read by ${fresh.map((reader) => reader.name).join(" and ")}`
          : seen.message,
    });
  }

  const rise = motionSafe ? { opacity: 0, y: distances.step } : { opacity: 0 };
  const tuck = motionSafe
    ? { layout: springs.snap, y: springs.snap, opacity: FADE }
    : FADE;

  const name =
    count === 0
      ? "Not seen yet"
      : `Seen by ${count}${total !== undefined ? ` of ${total}` : ""}`;

  return (
    <div ref={ref} className={cn("flex w-full flex-col", className)}>
      <ol role="list" aria-label={label} className="flex flex-col">
        <li className="flex flex-col items-end gap-1">
          <div className="max-w-[82%] rounded-3 rounded-br-1 bg-primary px-3 py-2 text-sm leading-snug wrap-break-word text-primary-foreground">
            {text}
          </div>
          {time ? (
            <span className="px-1 text-[11px] text-ink-3 tabular-nums">
              {time}
            </span>
          ) : null}

          <div
            className="flex max-w-full flex-col items-end"
            onPointerEnter={() => setHover(true)}
            onPointerLeave={() => {
              setHover(false);
              // A dismissal outlives the pointer while focus is still here,
              // or leaving would pop the fan straight back open.
              if (!focused) setDismissed(false);
            }}
          >
            <button
              type="button"
              aria-label={name}
              aria-expanded={count > 0 ? expanded : undefined}
              aria-controls={expanded ? listId : undefined}
              disabled={count === 0}
              onClick={() => {
                // Unpinning while hovered would leave the fan open until the
                // pointer left, so a second press dismisses outright.
                setDismissed(pinned);
                setPinned(!pinned);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false);
                if (!hover) setDismissed(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape" && expanded) {
                  event.preventDefault();
                  event.stopPropagation();
                  if (pinned) setPinned(false);
                  setDismissed(true);
                }
              }}
              className={cn(
                "flex h-7 max-w-full items-center gap-1.5 rounded-full py-1 pr-2 pl-1 text-[11px] text-ink-3 transition-colors outline-none hover:bg-accent disabled:hover:bg-transparent",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                expanded && "bg-accent text-foreground",
              )}
            >
              <span aria-hidden className="flex items-center">
                <AnimatePresence initial={false}>
                  {shown.map((reader, index) => (
                    <motion.span
                      key={reader.id}
                      layout={motionSafe}
                      initial={rise}
                      animate={{ opacity: 1, y: 0 }}
                      exit={EXIT}
                      transition={tuck}
                      className={cn(
                        "flex",
                        index > 0 && (expanded ? "ml-0.5" : "-ml-1.5"),
                      )}
                    >
                      <Disc reader={reader} />
                    </motion.span>
                  ))}
                  {overflow > 0 ? (
                    <motion.span
                      key="overflow"
                      layout={motionSafe}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={EXIT}
                      transition={tuck}
                      className={cn(
                        "grid h-5 min-w-5 place-items-center rounded-full border border-surface-0 bg-muted px-1 text-[9px] leading-none font-semibold text-muted-foreground",
                        expanded ? "ml-0.5" : "-ml-1.5",
                      )}
                    >
                      +
                      <RollingNumber
                        value={String(overflow)}
                        motionSafe={motionSafe}
                      />
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </span>
              <span aria-hidden className="flex items-center gap-1">
                {count === 0 ? (
                  "Not seen yet"
                ) : (
                  <>
                    Seen by
                    <RollingNumber
                      value={String(count)}
                      motionSafe={motionSafe}
                    />
                    {total !== undefined ? `of ${total}` : null}
                  </>
                )}
              </span>
            </button>

            <motion.div
              initial={false}
              animate={{ height: height ?? (expanded ? "auto" : 0) }}
              transition={
                motionSafe
                  ? springs.glide
                  : { duration: durations.base, ease: easings.move }
              }
              className="w-full overflow-hidden"
            >
              <div ref={innerRef}>
                <AnimatePresence initial={false}>
                  {expanded ? (
                    <motion.ul
                      key="list"
                      id={listId}
                      role="list"
                      exit={EXIT}
                      className="flex flex-col items-end gap-1 pt-1.5 pb-0.5"
                    >
                      {readers.map((reader, index) => (
                        <motion.li
                          key={reader.id}
                          initial={
                            motionSafe
                              ? { opacity: 0, y: distances.nudge }
                              : { opacity: 0 }
                          }
                          animate={{ opacity: 1, y: 0 }}
                          transition={
                            motionSafe
                              ? {
                                  ...springs.snap,
                                  delay: index * cascade(count),
                                }
                              : FADE
                          }
                          className="flex h-6 items-center gap-2 text-xs"
                        >
                          <Disc reader={reader} />
                          <span className="font-medium text-foreground">
                            {reader.name}
                          </span>
                          <span className="text-ink-3 tabular-nums">
                            {reader.at}
                          </span>
                        </motion.li>
                      ))}
                    </motion.ul>
                  ) : null}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        </li>
      </ol>

      <span role="status" aria-live="polite" className="sr-only">
        {seen.message}
      </span>
    </div>
  );
}
