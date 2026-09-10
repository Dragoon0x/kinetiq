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

export type TypingClusterProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Who is typing, in the order they started. Empty collapses the strip. */
  typing?: string[];
  /** Typers needed before the separate rows merge into one cluster. @default 3 */
  mergeAt?: number;
  /** Milliseconds each name holds the merged row's slot. @default 2200 */
  rotateMs?: number;
  /** Discs drawn in the stack before the rest become a rolling +N. @default 4 */
  maxFaces?: number;
  /** Controlled spread state for the merged cluster. */
  expanded?: boolean;
  /** Initial spread state. @default false */
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** Fires when the rotating slot lands on a different name. */
  onFocusNameChange?: (name: string | null) => void;
  /** Names the strip for assistive technology. */
  label: string;
  className?: string;
};

const FADE = { duration: durations.fast, ease: easings.enter } as const;

const TONES = [
  "bg-cobalt-wash text-cobalt-bright",
  "bg-success/15 text-success",
  "bg-warn/15 text-warn",
  "bg-signal/15 text-signal",
] as const;

/** A name always lands on the same tone, on the server and the client alike. */
const toneFor = (name: string) => {
  let sum = 0;
  for (let i = 0; i < name.length; i += 1) sum += name.charCodeAt(i);
  return TONES[sum % TONES.length] ?? TONES[0];
};

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] ?? name;

const sentenceFor = (names: string[]) => {
  if (names.length === 0) return "";
  const who =
    names.length === 1
      ? (names[0] ?? "")
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${who} ${names.length === 1 ? "is" : "are"} typing`;
};

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => !document.hidden;
const getServerVisible = () => true;

/** Keeps a callback out of an effect's dependencies so a re-render cannot restart the rotation. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

function Face({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full border-2 border-surface-0 text-[9px] font-semibold",
        toneFor(name),
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/** The bar a message is about to come out of. Opacity has no physical meaning, so it blinks on a tween. */
function Caret({
  motionSafe,
  visible,
}: {
  motionSafe: boolean;
  visible: boolean;
}) {
  const blink = motionSafe && visible;
  return (
    <motion.span
      aria-hidden
      className="block h-3 w-0.5 shrink-0 rounded-full bg-ink-2"
      animate={{ opacity: blink ? [1, 0.15] : 1 }}
      transition={
        blink
          ? {
              duration: 0.55,
              ease: easings.move,
              repeat: Infinity,
              repeatType: "reverse",
            }
          : { duration: durations.fast }
      }
    />
  );
}

/**
 * Several people, typing. One typer gets a row of their own — disc, name,
 * caret — and so does a second; the moment a third starts the rows **merge**
 * into one cluster: every disc keeps its own element and slides into the
 * overlapped stack on `glide`, because a layout shift is a layout shift and
 * `layout="position"` moves the row without scaling the initials inside it.
 * The merged row's name slot rotates through the typers, each name rolling out
 * of the slot as the next rolls in on `snap`, on an interval that resets when
 * the roster changes and holds while the document is hidden.
 *
 * The cluster is a real disclosure: pressing it spreads the stack back into the
 * named rows so everyone is legible at once, Escape re-merges without moving
 * focus, and the discs glide down into their rows rather than blinking there.
 * The whole strip sits in a height measured by a ResizeObserver, so one row,
 * three rows and none of them are all the same glide, and nothing reserves
 * space for a state that is not there. Rows fade away on the exit ease when
 * someone stops — a departure never bounces.
 *
 * Each spread row carries its own sentence, the merged button carries all the
 * names at once, and a polite status line speaks once per change, so the
 * rotation is decoration and never the only way to know who is typing. Under
 * reduced motion nothing travels: the discs take their positions, the names
 * cross-fade in the slot, and the caret holds steady instead of blinking.
 */
export function TypingCluster({
  ref,
  typing = [],
  mergeAt = 3,
  rotateMs = 2200,
  maxFaces = 4,
  expanded,
  defaultExpanded = false,
  onExpandedChange,
  onFocusNameChange,
  label,
  className,
}: TypingClusterProps) {
  const motionSafe = useMotionSafe();
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );
  const baseId = React.useId();
  const listId = `${baseId}-list`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultExpanded);
  const isControlled = expanded !== undefined;
  const isSpread = isControlled ? expanded : uncontrolled;

  // A name keys its own row, so the same person cannot appear twice: a repeated
  // name in the roster would be two siblings sharing one React key.
  const names = typing.filter((name, at) => typing.indexOf(name) === at);
  const total = names.length;
  const clustered = total >= Math.max(2, Math.floor(mergeAt));
  const merged = clustered && !isSpread;
  const sentence = sentenceFor(names);

  const setSpread = (next: boolean) => {
    if (!isControlled) setUncontrolled(next);
    onExpandedChange?.(next);
  };

  // The rotation phase belongs to one roster: a new set of typers starts the
  // slot again at the first name rather than mid-cycle. Adjusting during render
  // keeps the shown name and the roster from ever disagreeing for a frame.
  const rosterKey = names.join(" ");
  const [rot, setRot] = React.useState({ key: rosterKey, index: 0 });
  if (rot.key !== rosterKey) setRot({ key: rosterKey, index: 0 });
  const focusName =
    total === 0 ? null : (names[rot.index % total] ?? names[0] ?? null);

  React.useEffect(() => {
    if (!merged || total < 2 || !visible) return;
    const period = Math.max(600, Math.round(rotateMs));
    const timer = window.setInterval(() => {
      setRot((prev) => ({ key: prev.key, index: prev.index + 1 }));
    }, period);
    return () => window.clearInterval(timer);
  }, [merged, total, visible, rotateMs, rosterKey]);

  const focusRef = useLatest(onFocusNameChange);
  React.useEffect(() => {
    focusRef.current?.(focusName);
  }, [focusName, focusRef]);

  // The strip's room is measured, never reserved: an empty list measures zero
  // and the box closes on the same spring that opened it.
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

  const faces = names.slice(0, Math.max(1, Math.floor(maxFaces)));
  const overflow = total - faces.length;

  return (
    <div ref={ref} className={cn("flex w-full flex-col", className)}>
      <motion.div
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className="overflow-hidden"
      >
        <div ref={innerRef}>
          <div
            className={cn(
              "flex min-w-0 gap-2",
              total > 0 && "pt-2",
              merged ? "flex-row items-center" : "flex-col items-stretch",
            )}
          >
            <ul
              role="list"
              id={listId}
              aria-label={label}
              className={cn(
                "flex min-w-0",
                merged ? "flex-row items-center" : "flex-col gap-1.5",
              )}
            >
              <AnimatePresence initial={false}>
                {(merged ? faces : names).map((name) => (
                  <motion.li
                    key={name}
                    aria-hidden={merged || undefined}
                    aria-label={merged ? undefined : `${name} is typing`}
                    layout={motionSafe ? "position" : false}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{ layout: springs.glide, opacity: FADE }}
                    className={cn(
                      "flex min-w-0 items-center",
                      merged ? "-ml-2 first:ml-0" : "gap-2",
                    )}
                  >
                    <Face name={name} />
                    {!merged && (
                      <>
                        <span className="min-w-0 truncate text-xs text-ink-2">
                          {name} is typing
                        </span>
                        <Caret motionSafe={motionSafe} visible={visible} />
                      </>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
              {merged && overflow > 0 && (
                <li
                  aria-hidden
                  className="-ml-2 grid size-6 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-surface-0 bg-surface-2 text-[9px] font-semibold text-ink-3"
                >
                  <AnimatePresence initial={false}>
                    <motion.span
                      key={overflow}
                      initial={
                        motionSafe
                          ? { y: distances.step, opacity: 0 }
                          : { opacity: 0 }
                      }
                      animate={{ y: 0, opacity: 1 }}
                      exit={{
                        y: motionSafe ? -distances.step : 0,
                        opacity: 0,
                        transition: exitFor(durations.fast),
                      }}
                      transition={
                        motionSafe ? { y: springs.snap, opacity: FADE } : FADE
                      }
                      className="col-start-1 row-start-1 tabular-nums"
                    >
                      +{overflow}
                    </motion.span>
                  </AnimatePresence>
                </li>
              )}
            </ul>

            {clustered && (
              <button
                type="button"
                aria-expanded={isSpread}
                aria-controls={listId}
                aria-label={`${sentence}. ${isSpread ? "Merge" : "Show each"}`}
                onClick={() => setSpread(!isSpread)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && isSpread) {
                    event.preventDefault();
                    setSpread(false);
                  }
                }}
                className={cn(
                  "flex h-7 min-w-0 items-center gap-2 rounded-2 px-2 text-left transition-colors outline-none",
                  "hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  merged ? "flex-1" : "self-start",
                )}
              >
                <Caret motionSafe={motionSafe} visible={visible} />
                {merged ? (
                  // Both readings share one grid cell, so the outgoing name
                  // rolls out under the incoming one instead of resizing the row.
                  <span className="grid min-w-0 flex-1 overflow-hidden">
                    <AnimatePresence initial={false}>
                      <motion.span
                        key={focusName ?? "none"}
                        initial={
                          motionSafe
                            ? { y: distances.shift, opacity: 0 }
                            : { opacity: 0 }
                        }
                        animate={{ y: 0, opacity: 1 }}
                        exit={{
                          y: motionSafe ? -distances.shift : 0,
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                        transition={
                          motionSafe ? { y: springs.snap, opacity: FADE } : FADE
                        }
                        className="col-start-1 row-start-1 truncate text-xs text-ink-2"
                      >
                        {focusName ? `${firstNameOf(focusName)} is typing` : ""}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                ) : (
                  <span className="truncate text-xs text-ink-3">
                    {total} people typing
                  </span>
                )}
                <motion.svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3.5 shrink-0 text-ink-3"
                  animate={{ rotate: isSpread ? 180 : 0 }}
                  transition={
                    motionSafe ? springs.snap : { duration: durations.fast }
                  }
                  style={{ originX: 0.5, originY: 0.5 }}
                >
                  <path d="m4 6 4 4 4-4" />
                </motion.svg>
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Mounted whether or not anyone is typing, so each roster change is
          announced exactly once and silence announces nothing. */}
      <span role="status" aria-live="polite" aria-atomic className="sr-only">
        {sentence}
      </span>
    </div>
  );
}
