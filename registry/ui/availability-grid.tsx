"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type AvailabilityGridProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Column headings, in order. */
  days: string[];
  /** Row headings, in order. */
  times: string[];
  /** The room's size. Every count is out of it. */
  people: number;
  /** Everyone else's answers, keyed `"<dayIndex>-<timeIndex>"`. @default {} */
  votes?: Record<string, number>;
  /** Controlled list of slot keys you said yes to. */
  mine?: string[];
  /** Initial list for uncontrolled use. @default [] */
  defaultMine?: string[];
  /** Fires from the setter that toggled a cell, with the next whole list. */
  onMineChange?: (keys: string[]) => void;
  /** The posted slot key, or null. Only the host sets it. @default null */
  decided?: string | null;
  /** Fires from the post control with the leading slot's key. */
  onPost?: (key: string) => void;
  /** @default "Post this time" */
  postLabel?: string;
  /** Holds every cell and the control. @default false */
  disabled?: boolean;
  /** Names the grid for assistive technology. */
  label: string;
  className?: string;
};

const FADE = { duration: durations.fast, ease: easings.enter } as const;

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const keyOf = (day: number, time: number) => `${day}-${time}`;

/**
 * The count in a cell. Both readings live in one grid cell and cross-fade, so a
 * run of fast presses never queues behind an exit the way `mode="wait"` would.
 */
function Tally({ count, motionSafe }: { count: number; motionSafe: boolean }) {
  return (
    <span className="relative grid place-items-center">
      <AnimatePresence initial={false}>
        <motion.span
          key={count}
          className="col-start-1 row-start-1 font-mono text-[11px] font-medium tabular-nums"
          initial={motionSafe ? { y: 7, opacity: 0 } : { opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{
            y: motionSafe ? -7 : 0,
            opacity: 0,
            transition: exitFor(durations.fast),
          }}
          transition={motionSafe ? springs.snap : FADE}
        >
          {count}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/**
 * When everyone is free. Days run across, time bands run down, and each cell
 * fills from its bottom edge on `glide` by the share of the room that can make
 * that slot — a quantity settling, no overshoot — so the grid reads as a heat
 * map before a single figure is read. Pressing a cell adds or removes your own
 * answer, the only vote you can change, and the figure rolls to its new value
 * on `snap`.
 *
 * Whichever slot leads wears the crown: a ring that travels from the old leader
 * to the new one on `snap` through a `useId`-prefixed `layoutId`, one crisp
 * overshoot, so the lift reads as the same ring moving rather than two rings
 * blinking. Nothing under that ring scales — a travelling layout animation
 * measured inside a transforming parent is a travelling layout animation that
 * lands in the wrong place — so the lift is the ring, a shadow and a stronger
 * fill. Ties break by the earliest slot, deterministically, so the crown
 * never flickers between two equal cells. Posting the leader ends the vote: the
 * chosen cell stamps a tick on `recoil` and the grid stops taking answers.
 *
 * It is a real `role="grid"` with a roving tabindex, so every pointer path has
 * a keyboard path. Under reduced motion the fills still fill and the figures
 * still change — a count is information — but nothing travels and the crown
 * appears on the leader instead of flying to it.
 */
export function AvailabilityGrid({
  ref,
  days,
  times,
  people,
  votes = {},
  mine,
  defaultMine,
  onMineChange,
  decided = null,
  onPost,
  postLabel = "Post this time",
  disabled = false,
  label,
  className,
}: AvailabilityGridProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const crownId = `${baseId}-crown`;

  const [uncontrolled, setUncontrolled] = React.useState<string[]>(
    defaultMine ?? [],
  );
  const isControlled = mine !== undefined;
  const picked = isControlled ? mine : uncontrolled;
  const room = Math.max(1, people);
  const locked = disabled || decided !== null;

  const countAt = (key: string) =>
    Math.min(room, (votes[key] ?? 0) + (picked.includes(key) ? 1 : 0));

  // Day first, then time, and only a strictly larger count takes the lead, so
  // a tie always falls to the earliest slot and the crown has no reason to
  // flicker between two equal cells.
  const slots = days.flatMap((_, day) =>
    times.map((__, time) => keyOf(day, time)),
  );
  const top = slots.reduce(
    (held, key) => (countAt(key) > countAt(held) ? key : held),
    slots[0] ?? "",
  );
  const bestCount = top === "" ? 0 : countAt(top);
  const leader = bestCount > 0 ? top : null;
  const crowned = decided ?? leader;

  const toggle = (key: string) => {
    if (locked) return;
    const next = picked.includes(key)
      ? picked.filter((entry) => entry !== key)
      : [...picked, key];
    if (!isControlled) setUncontrolled(next);
    onMineChange?.(next);
  };

  const [cursor, setCursor] = React.useState({ day: 0, time: 0 });
  const moveTo = (day: number, time: number) => {
    const d = Math.min(days.length - 1, Math.max(0, day));
    const t = Math.min(times.length - 1, Math.max(0, time));
    setCursor({ day: d, time: t });
    document.getElementById(`${baseId}-c-${d}-${t}`)?.focus();
  };

  const onCellKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    day: number,
    time: number,
  ) => {
    const moves: Record<string, [number, number]> = {
      ArrowRight: [day + 1, time],
      ArrowLeft: [day - 1, time],
      ArrowDown: [day, time + 1],
      ArrowUp: [day, time - 1],
      Home: [0, time],
      End: [days.length - 1, time],
    };
    const next = moves[event.key];
    if (!next) return;
    event.preventDefault();
    moveTo(next[0], next[1]);
  };

  const nameOf = (key: string, day: string, time: string) => {
    const count = countAt(key);
    const yours = picked.includes(key)
      ? "you said yes"
      : "you have not said yes";
    const crown =
      decided === key
        ? ", this is the time"
        : leader === key && decided === null
          ? ", leading"
          : "";
    return `${day} at ${time}, ${count} of ${room} free, ${yours}${crown}.`;
  };

  // Frozen at the moment of the change, and worked out by diffing the answer
  // that actually arrived rather than the one the press hoped for: under a
  // controlled host the outcome is only spoken once the host has answered.
  // Compared by content, never by array identity: a host that rebuilds the
  // list on every render must not send this into a loop.
  const pickedKey = [...picked].sort().join("|");
  const [spoken, setSpoken] = React.useState(() => ({
    key: pickedKey,
    list: picked,
    decided,
    text: "",
  }));
  if (spoken.key !== pickedKey || spoken.decided !== decided) {
    const added = picked.find((key) => !spoken.list.includes(key));
    const gone = spoken.list.find((key) => !picked.includes(key));
    const changed = added ?? gone;
    const parts = (changed ?? "").split("-");
    const day = days[Number(parts[0])] ?? "";
    const time = times[Number(parts[1])] ?? "";
    const decidedParts = (decided ?? "").split("-");
    setSpoken({
      key: pickedKey,
      list: picked,
      decided,
      text:
        spoken.decided !== decided && decided !== null
          ? `Posted. ${days[Number(decidedParts[0])] ?? ""} at ${times[Number(decidedParts[1])] ?? ""}, ${countAt(decided)} of ${room} can make it.`
          : changed
            ? `${added ? "You are free" : "You are not free"} on ${day} at ${time}. That slot has ${countAt(changed)} of ${room}.`
            : "",
    });
  }

  const template = `2.75rem repeat(${days.length}, minmax(0, 1fr))`;
  const decidedLine =
    decided === null
      ? null
      : `${days[Number(decided.split("-")[0])] ?? ""} at ${times[Number(decided.split("-")[1])] ?? ""} it is, ${countAt(decided)} of ${room} can make it.`;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-2.5 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div role="grid" aria-label={label} className="flex flex-col gap-1">
        <div
          role="row"
          style={{ gridTemplateColumns: template }}
          className="grid gap-1"
        >
          <span role="columnheader" className="text-[11px] text-ink-3">
            <span className="sr-only">Time</span>
          </span>
          {days.map((day) => (
            <span
              key={day}
              role="columnheader"
              title={day}
              className="truncate text-center text-[11px] font-medium text-ink-3"
            >
              {day}
            </span>
          ))}
        </div>

        {times.map((time, t) => (
          <div
            key={time}
            role="row"
            style={{ gridTemplateColumns: template }}
            className="grid gap-1"
          >
            <span
              role="rowheader"
              className="flex items-center font-mono text-[11px] text-ink-3 tabular-nums"
            >
              {time}
            </span>
            {days.map((day, d) => {
              const key = keyOf(d, t);
              const count = countAt(key);
              const share = Number((count / room).toFixed(3));
              const isMine = picked.includes(key);
              const isCrowned = crowned === key && bestCount > 0;
              const isDecided = decided === key;

              return (
                <span key={key} role="gridcell" className="relative block">
                  {/* Not a `motion.button`: nothing here scales, because the
                      crown that travels between cells must never be measured
                      inside a parent transforming underneath it. The lift is
                      the ring, the shadow and a stronger fill. */}
                  <button
                    type="button"
                    id={`${baseId}-c-${d}-${t}`}
                    tabIndex={cursor.day === d && cursor.time === t ? 0 : -1}
                    aria-pressed={isMine}
                    aria-disabled={locked || undefined}
                    aria-label={nameOf(key, day, time)}
                    onClick={() => {
                      setCursor({ day: d, time: t });
                      toggle(key);
                    }}
                    onKeyDown={(event) => onCellKeyDown(event, d, t)}
                    className={cn(
                      "relative grid h-10 w-full place-items-center overflow-hidden rounded-2 border bg-surface-0 transition-shadow",
                      focusRing,
                      isMine ? "border-cobalt-bright/60" : "border-hairline",
                      isCrowned ? "shadow-sm" : null,
                      locked
                        ? "cursor-default"
                        : "hover:border-hairline-strong",
                    )}
                  >
                    <motion.span
                      aria-hidden
                      className={cn(
                        "absolute inset-0 origin-bottom transition-colors",
                        isCrowned
                          ? "bg-cobalt-bright/45"
                          : "bg-cobalt-bright/25",
                      )}
                      initial={false}
                      animate={{ scaleY: share }}
                      transition={
                        motionSafe
                          ? springs.glide
                          : { duration: durations.fast }
                      }
                    />

                    <span
                      aria-hidden
                      className={cn(
                        "relative flex items-center gap-1",
                        isMine ? "text-ink" : "text-ink-2",
                      )}
                    >
                      <Tally count={count} motionSafe={motionSafe} />
                      {isMine ? (
                        <span className="size-1.5 shrink-0 rounded-full bg-cobalt-bright" />
                      ) : null}
                    </span>

                    <AnimatePresence initial={false}>
                      {isDecided ? (
                        <motion.span
                          key="stamp"
                          aria-hidden
                          initial={
                            motionSafe
                              ? { scale: 1.6, opacity: 0 }
                              : { opacity: 0 }
                          }
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{
                            opacity: 0,
                            transition: exitFor(durations.fast),
                          }}
                          transition={motionSafe ? springs.recoil : FADE}
                          style={{ originX: 0.5, originY: 0.5 }}
                          className="absolute inset-0 grid place-items-center rounded-2 bg-surface-0 text-success"
                        >
                          <svg
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="size-4"
                          >
                            <path d="M3.5 8.4 6.6 11.5 12.5 5" />
                          </svg>
                        </motion.span>
                      ) : null}
                    </AnimatePresence>
                  </button>

                  {/* The crown lives outside the button, so the ring that
                      travels between cells is never measured inside a parent
                      that is scaling underneath it. */}
                  {isCrowned ? (
                    motionSafe ? (
                      <motion.span
                        aria-hidden
                        layoutId={crownId}
                        transition={springs.snap}
                        className="pointer-events-none absolute inset-0 rounded-2 border-2 border-cobalt-bright"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 rounded-2 border-2 border-cobalt-bright"
                      />
                    )
                  ) : null}
                </span>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 text-[11px] leading-snug text-ink-3">
          {decidedLine ??
            (bestCount > 0
              ? `${bestCount} of ${room} can make the best slot so far`
              : "No answers yet")}
        </span>
        {decided === null ? (
          <button
            type="button"
            disabled={disabled || leader === null}
            onClick={() => {
              if (leader !== null) onPost?.(leader);
            }}
            className={cn(
              "flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50",
              focusRing,
            )}
          >
            {postLabel}
          </button>
        ) : null}
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.text}
      </span>
    </div>
  );
}
