"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TaskDelivery = "sent" | "delivered" | "read";

export type ChatTaskAssignee = {
  id: string;
  name: string;
};

export type ChatTask = {
  id: string;
  /** Own tasks sit on the right and carry the delivery mark. */
  from: "me" | "peer";
  /** What has to happen — one line, imperative. */
  title: string;
  /** Who holds it. */
  assignee: ChatTaskAssignee;
  /** Already formatted — "Friday, before the run". */
  due?: string;
  /** Printed under the card, already formatted. */
  time?: string;
  /** Read for own tasks only. @default "sent" */
  delivery?: TaskDelivery;
};

export type TaskCardChatProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The task message. */
  task: ChatTask;
  /** Controlled done state. */
  checked?: boolean;
  /** Initial done state for uncontrolled usage. @default false */
  defaultChecked?: boolean;
  /** Fires from the press or key that toggles the box. */
  onCheckedChange?: (checked: boolean) => void;
  /** Already formatted; printed in the done line. */
  doneAt?: string;
  /** Warms the due line and rewords it. @default false */
  overdue?: boolean;
  /** Who is credited in the done line. @default the assignee's name */
  doneBy?: string;
  /** Names the sender in the delivery sentence. @default "Them" */
  peerName?: string;
  /** Names the thread for assistive technology. @default "Thread" */
  label?: string;
  /** Holds the checkbox; the card still reads. @default false */
  disabled?: boolean;
  className?: string;
};

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const CHECK = "M2 8.5 5 11.5 10.5 5.5";
const CHECK_TRAIL = "M6.5 11.5 12 5.5";
const TICK = "M3.2 8.2 6.4 11.4 12.8 4.6";

/** Two initials at most; a one-word name keeps one. */
const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase() || "?";

/** Strips a stop the words already carry, so a sentence never doubles one. */
const bareOf = (line: string): string => line.trim().replace(/[.!?]+$/, "");

const deliverySentence = (delivery: TaskDelivery, peerName: string) =>
  ({
    sent: "Sent",
    delivered: `Delivered to ${peerName}`,
    read: `Read by ${peerName}`,
  })[delivery];

/**
 * A job handed to somebody in a thread, and the moment it is finished. One
 * checkbox is the whole control, and the rest of the card answers to it in the
 * order the work actually happens in: tick, strike, stamp.
 *
 * The tick is *drawn* rather than revealed — its `pathLength` runs 0 to 1 on
 * `flick`, ζ0.99 and about 120ms, the stroke arriving in the time a pen would
 * take. The line then strikes: a rule grows across the words as a background
 * wipe, which is a clip and so takes a tween rather than a spring, and — cloned
 * per line fragment — it crosses a title that has wrapped instead of ruling
 * through the gap between its lines. Last, the assignee's tile takes its mark:
 * a check badge lands from 1.18× on `recoil`, ζ0.53 and two visible bounces,
 * while the due line cross-fades to the done line inside one shared grid cell,
 * so no height is reserved for either and checking never moves the card.
 * Unchecking runs the three back on `exitFor()`, which accelerates away and
 * never springs, because undoing is not a landing.
 *
 * The control is a real `role="checkbox"` named by the task line and described
 * by the line under it, so its name is the job and its description is the
 * deadline; Space or Enter toggles it and it keeps its place in the tab order
 * while disabled. The due line carries a sentence rather than a colour — "Due
 * Friday, before the run." against "Overdue since Friday, before the run." —
 * and an sr-only status speaks the change once, from the value the host
 * answered with. Under reduced motion the tick appears whole, the rule appears
 * at full width and the badge fades on: all three still show, because a
 * finished task is information and not flourish.
 */
export function TaskCardChat({
  ref,
  task,
  checked,
  defaultChecked = false,
  onCheckedChange,
  doneAt,
  overdue = false,
  doneBy,
  peerName = "Them",
  label = "Thread",
  disabled = false,
  className,
}: TaskCardChatProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const titleId = `${baseId}-title`;
  const metaId = `${baseId}-meta`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultChecked);
  const isChecked = checked ?? uncontrolled;

  const bare = bareOf(task.title);

  // The sentence is frozen the moment the value actually changes — adjusted in
  // render rather than pushed from an effect — so a controlled parent that
  // refuses the press is never spoken as though it had agreed.
  const [seen, setSeen] = React.useState(isChecked);
  const [said, setSaid] = React.useState("");
  if (seen !== isChecked) {
    setSeen(isChecked);
    setSaid(isChecked ? `Marked done: ${bare}.` : `Reopened: ${bare}.`);
  }

  const toggle = () => {
    if (disabled) return;
    const next = !isChecked;
    if (checked === undefined) setUncontrolled(next);
    onCheckedChange?.(next);
  };

  const credited = doneBy ?? task.assignee.name;
  const doneLine = doneAt
    ? `${credited} marked this done at ${doneAt}.`
    : `${credited} marked this done.`;
  const dueLine = task.due
    ? overdue
      ? `${task.assignee.name} · overdue since ${task.due}`
      : `${task.assignee.name} · due ${task.due}`
    : task.assignee.name;

  const own = task.from === "me";
  const delivery = task.delivery ?? "sent";
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <ol role="list" aria-label={label} className="flex flex-col gap-1">
        <li
          className={cn(
            "flex flex-col gap-1",
            own ? "items-end" : "items-start",
          )}
        >
          <div
            className={cn(
              "flex w-full max-w-[92%] flex-col gap-2.5 rounded-3 px-3 py-2.5",
              own
                ? "rounded-br-1 bg-primary text-primary-foreground"
                : "rounded-bl-1 bg-surface-2 text-foreground",
            )}
          >
            <div className="flex items-start gap-2.5">
              <button
                type="button"
                role="checkbox"
                aria-checked={isChecked}
                aria-labelledby={titleId}
                aria-describedby={metaId}
                aria-disabled={disabled || undefined}
                onClick={toggle}
                className={cn(
                  "mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-1 border transition-colors",
                  isChecked
                    ? "border-current bg-current/15"
                    : "border-current/40 hover:border-current/70",
                  disabled && "opacity-50",
                  focusRing,
                )}
              >
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3"
                >
                  {/* pathLength normalises the stroke to 1, so the draw reads
                      the same whatever the glyph's real length is. */}
                  <motion.path
                    d={TICK}
                    pathLength={1}
                    initial={false}
                    animate={{ pathLength: isChecked ? 1 : 0 }}
                    transition={
                      motionSafe
                        ? isChecked
                          ? springs.flick
                          : exitFor(durations.fast)
                        : { duration: 0 }
                    }
                  />
                </svg>
              </button>

              <p
                id={titleId}
                className={cn(
                  "min-w-0 flex-1 text-[13px] leading-5 transition-colors",
                  isChecked ? "opacity-60" : "opacity-100",
                )}
              >
                {/* The rule is a background wipe cloned onto every line
                    fragment, so a title that has wrapped is struck line by line
                    rather than ruled through the gap between its lines. A clip
                    takes a tween; only the tick springs. */}
                <span
                  style={{
                    backgroundImage:
                      "linear-gradient(currentColor, currentColor)",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "0 0.58em",
                    backgroundSize: `${isChecked ? 100 : 0}% 1px`,
                    boxDecorationBreak: "clone",
                    WebkitBoxDecorationBreak: "clone",
                    transition: motionSafe
                      ? isChecked
                        ? `background-size ${durations.slow}s cubic-bezier(${easings.enter.join(",")})`
                        : `background-size ${durations.slow * 0.6}s cubic-bezier(${easings.exit.join(",")})`
                      : "none",
                  }}
                >
                  {task.title}
                </span>
              </p>
            </div>

            <div className="flex items-center gap-2 border-t border-current/15 pt-2.5">
              <span className="relative shrink-0">
                <span
                  aria-hidden
                  className="grid size-6 place-items-center rounded-full bg-current/15 text-[10px] font-semibold"
                >
                  {initialsOf(task.assignee.name)}
                </span>
                <AnimatePresence initial={false}>
                  {isChecked ? (
                    <motion.span
                      key="stamp"
                      aria-hidden
                      initial={{ opacity: 0, scale: motionSafe ? 1.18 : 1 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={
                        motionSafe
                          ? {
                              scale: { ...springs.recoil, delay: 0.12 },
                              opacity: { ...fade, delay: 0.12 },
                            }
                          : { duration: durations.fast }
                      }
                      // Opaque, because it lands on top of the initials: a wash
                      // would let them read straight through the mark.
                      className="absolute -right-1 -bottom-1 grid size-3.5 place-items-center rounded-full border border-success/50 bg-surface-0 text-success"
                    >
                      <svg
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="size-2.5"
                      >
                        <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
                      </svg>
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </span>

              {/* Both readings share one grid cell and cross-fade, so the card
                  keeps its height whichever one is showing. */}
              <span id={metaId} className="grid min-w-0 flex-1">
                <motion.span
                  aria-hidden={isChecked}
                  className="col-start-1 row-start-1 flex items-center text-[12px] leading-4"
                  initial={false}
                  animate={{ opacity: isChecked ? 0 : 1 }}
                  transition={fade}
                >
                  <span className={cn(overdue ? "text-warn" : "opacity-80")}>
                    {dueLine}
                  </span>
                </motion.span>
                <motion.span
                  aria-hidden={!isChecked}
                  className="col-start-1 row-start-1 flex items-center text-[12px] leading-4 font-medium"
                  initial={false}
                  animate={{ opacity: isChecked ? 1 : 0 }}
                  transition={fade}
                >
                  {doneLine}
                </motion.span>
              </span>
            </div>
          </div>

          <span className="flex items-center gap-1.5 px-1">
            {task.time ? (
              <span className="text-[11px] text-ink-3 tabular-nums">
                {task.time}
              </span>
            ) : null}
            {own ? (
              <span
                role="img"
                aria-label={deliverySentence(delivery, peerName)}
                className={cn(
                  "inline-flex size-3.5 items-center justify-center",
                  delivery === "read" ? "text-cobalt-bright" : "text-ink-3",
                )}
              >
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3.5"
                >
                  <path d={CHECK} />
                  {delivery === "sent" ? null : <path d={CHECK_TRAIL} />}
                </svg>
              </span>
            ) : null}
          </span>
        </li>
      </ol>

      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
