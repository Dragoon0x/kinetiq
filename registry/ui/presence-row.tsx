"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PresencePerson = {
  id: string;
  /** Full name; drawn as initials, spoken in the group's sentence. */
  name: string;
  /** Any CSS colour — pass a theme token so both themes read. */
  tint: string;
};

export type PresenceRowProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Who is present, in the order they should be stacked. */
  people: PresencePerson[];
  /** Faces shown before the overflow chip. @default 4 */
  max?: number;
  /** Fires when the +N chip is pressed. */
  onOverflowClick?: () => void;
  /** Names what the row is presence for; used in the spoken sentence. */
  context?: string;
  className?: string;
};

/** Two initials at most; a one-word name keeps one. */
const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase() || "?";

const sentenceFor = (names: string[], context: string) => {
  const tail = ` on ${context}`;
  if (names.length === 0) return `No one is${tail}`;
  if (names.length === 1) return `${names[0]} is${tail}`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are${tail}`;
  const rest = names.length - 2;
  return `${names[0]}, ${names[1]} and ${rest} ${
    rest === 1 ? "other" : "others"
  } are${tail}`;
};

/**
 * A presence stack that makes room. A face arriving scales from 0.6 into a
 * `snap` — one crisp overshoot, the squeeze of someone stepping into a row —
 * while its neighbours slide over on the same spring through `layout`, so the
 * row opens rather than reflowing in a single frame. A face leaving fades on
 * the exit ease (departures never celebrate) and `popLayout` lets the row close
 * behind it. The overflow chip rolls its count in the direction it moved.
 *
 * Hovering or focusing the row fans the stack apart so every face is legible;
 * the row itself is focusable, which is the keyboard's path to that gesture,
 * and Escape closes the fan without moving focus. Faces are procedural initials
 * on a tinted disc, so a presence row costs no image requests. Every name is in
 * a title and in the group's spoken sentence, and a polite status line lets the
 * count catch up for a screen reader. Under reduced motion nothing fans and the
 * faces simply appear.
 */
export function PresenceRow({
  ref,
  people,
  max = 4,
  onOverflowClick,
  context = "this document",
  className,
}: PresenceRowProps) {
  const motionSafe = useMotionSafe();

  const [open, setOpen] = React.useState(false);
  // The fan is a hover flourish, not information: every name is in a title and
  // in the group's sentence, so reduced motion drops it entirely.
  const fanned = motionSafe && open;

  const shown = Math.max(1, max);
  const visible = people.slice(0, shown);
  const hidden = people.slice(shown);
  const overflow = hidden.length;

  const sentence = sentenceFor(
    people.map((person) => person.name),
    context,
  );

  return (
    <div ref={ref} className={cn("flex w-full items-center", className)}>
      <div
        role="group"
        tabIndex={0}
        aria-label={sentence}
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={(event) => {
          // Leaving with focus still inside would snap the fan shut under the
          // keyboard user who opened it.
          if (!event.currentTarget.contains(document.activeElement)) {
            setOpen(false);
          }
        }}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setOpen(false);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className="inline-flex rounded-full py-0.5 outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      >
        <ul className="flex items-center">
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((person, index) => (
              <motion.li
                key={person.id}
                aria-hidden
                title={person.name}
                layout={motionSafe}
                style={{ zIndex: visible.length - index }}
                initial={
                  motionSafe
                    ? { scale: 0.6, opacity: 0 }
                    : { scale: 1, opacity: 0 }
                }
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor() }}
                transition={
                  motionSafe
                    ? springs.snap
                    : { duration: durations.fast, ease: easings.enter }
                }
                className={cn(
                  "relative",
                  index > 0 && (fanned ? "ml-1" : "-ml-2"),
                )}
              >
                <span
                  className="flex size-8 items-center justify-center rounded-full border-2 border-card text-[11px] font-semibold"
                  style={{
                    color: person.tint,
                    // Opaque, so overlapping discs read as discs rather than
                    // stacked panes of glass.
                    backgroundColor: `color-mix(in oklab, ${person.tint} 20%, var(--card))`,
                  }}
                >
                  {initialsOf(person.name)}
                </span>
              </motion.li>
            ))}

            {overflow > 0 ? (
              <motion.li
                key="overflow"
                layout={motionSafe}
                initial={
                  motionSafe ? { scale: 0.6, opacity: 0 } : { opacity: 0 }
                }
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor() }}
                transition={
                  motionSafe
                    ? springs.snap
                    : { duration: durations.fast, ease: easings.enter }
                }
                className={cn("relative", fanned ? "ml-1" : "-ml-2")}
              >
                <button
                  type="button"
                  onClick={onOverflowClick}
                  title={hidden.map((person) => person.name).join(", ")}
                  aria-label={`Show ${overflow} more ${
                    overflow === 1 ? "person" : "people"
                  }`}
                  className="flex size-8 items-center justify-center rounded-full border-2 border-card bg-surface-2 font-mono text-[11px] font-medium text-ink-2 outline-none hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <span aria-hidden className="flex items-center leading-none">
                    +
                    <span
                      className="relative inline-flex justify-center overflow-hidden"
                      style={{
                        width: `${String(overflow).length}ch`,
                        height: "1.1em",
                      }}
                    >
                      <AnimatePresence initial={false} mode="popLayout">
                        <motion.span
                          key={overflow}
                          initial={motionSafe ? { y: "110%" } : { opacity: 0 }}
                          animate={{ y: "0%", opacity: 1 }}
                          exit={
                            motionSafe
                              ? { y: "-110%", transition: exitFor() }
                              : { opacity: 0, transition: exitFor() }
                          }
                          transition={
                            motionSafe
                              ? springs.snap
                              : { duration: durations.fast }
                          }
                          className="flex items-center tabular-nums"
                        >
                          {overflow}
                        </motion.span>
                      </AnimatePresence>
                    </span>
                  </span>
                </button>
              </motion.li>
            ) : null}
          </AnimatePresence>
        </ul>
      </div>

      {/* The sentence is the group's name as well, but a name only speaks when
          the group is reached; the status line is what lets a screen reader
          hear that someone arrived. */}
      <span role="status" className="sr-only">
        {sentence}
      </span>
    </div>
  );
}
