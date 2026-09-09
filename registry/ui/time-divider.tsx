"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TimeDividerMessage = {
  id: string;
  author: string;
  text: string;
  /** Local time as `YYYY-MM-DDTHH:mm`. A string, never a Date, so the server and the browser agree on the day. */
  at: string;
  mine?: boolean;
};

export type TimeDividerProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The thread in order. */
  messages: TimeDividerMessage[];
  /** The current day as `YYYY-MM-DD`; Today and Yesterday are measured from it. */
  today: string;
  /** Overrides the divider wording. @default describeDay */
  formatDay?: (day: string, today: string) => string;
  /** Fires from an effect when a new day's divider mounts after the first render. */
  onDayCross?: (label: string) => void;
  /** Names the thread for assistive technology. @default "Thread" */
  label?: string;
  className?: string;
};

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` to a UTC midnight, or null when the string is not a date. */
const utcOf = (day: string): number | null => {
  const [y, m, d] = day.split("-").map(Number);
  if (y === undefined || m === undefined || d === undefined) return null;
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d))
    return null;
  return Date.UTC(y, m - 1, d);
};

/**
 * Today, Yesterday, a weekday inside the week, and a date beyond it. The
 * arithmetic is all UTC so a prerender in one zone and a browser in another
 * print the same label — a divider that hydrates to different text is a bug.
 */
export function describeDay(day: string, today: string): string {
  const at = utcOf(day);
  const now = utcOf(today);
  if (at === null || now === null) return day;
  const diff = Math.round((now - at) / DAY_MS);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  const date = new Date(at);
  if (diff > 1 && diff < 7) return WEEKDAYS[date.getUTCDay()] ?? day;
  const month = MONTHS[date.getUTCMonth()] ?? "";
  const sameYear = new Date(now).getUTCFullYear() === date.getUTCFullYear();
  return `${date.getUTCDate()} ${month}${sameYear ? "" : ` ${date.getUTCFullYear()}`}`;
}

const dayOf = (at: string) => at.slice(0, 10);
const timeOf = (at: string) => at.slice(11, 16);

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

type Row =
  | { kind: "divider"; key: string; day: string; label: string }
  | { kind: "message"; key: string; message: TimeDividerMessage };

/** Keeps a callback out of effect dependencies so a re-render never re-fires it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * A thread that draws a line where the day changes. Wherever two neighbours
 * fall on different days a divider sits between them; one that mounts because
 * a new message crossed into a new day draws its rule from the centre outward
 * on `glide` — the layout spring, since a rule settling across a column must
 * not overshoot — and the label fades in over it once the line is most of the
 * way out. Messages arrive with a four-pixel rise, secondary to the divider.
 *
 * Rows present at first render mount settled: the draw is for a day the
 * viewer watched the thread cross, not for a page that loaded with history.
 * Each divider is a separator labelled with its day, so a reader walking the
 * list hears the change where it happens, and one polite sentence per arrival
 * names the day only when the message opened it. Under reduced motion the
 * line and label fade in together and nothing travels.
 */
export function TimeDivider({
  ref,
  messages,
  today,
  formatDay = describeDay,
  onDayCross,
  label = "Thread",
  className,
}: TimeDividerProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const rows: Row[] = [];
  let lastDay: string | null = null;
  for (const message of messages) {
    const day = dayOf(message.at);
    if (day !== lastDay) {
      rows.push({
        kind: "divider",
        key: `day-${day}`,
        day,
        label: formatDay(day, today),
      });
      lastDay = day;
    }
    rows.push({ kind: "message", key: `msg-${message.id}`, message });
  }

  // Whatever was on screen at mount is history and renders settled; only rows
  // added later animate in. Captured once, so a re-render never re-arms it.
  const [settledKeys] = React.useState(
    () => new Set(rows.map((row) => row.key)),
  );

  const dividers = rows.filter((row) => row.kind === "divider");
  const dayKeys = dividers.map((row) => row.day).join("|");
  const labelsRef = useLatest(
    new Map(dividers.map((row) => [row.day, row.label])),
  );
  const onDayCrossRef = useLatest(onDayCross);
  const seenRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const previous = seenRef.current;
    seenRef.current = dayKeys;
    if (previous === null) return;
    const before = new Set(previous.split("|"));
    for (const day of dayKeys.split("|")) {
      if (!day || before.has(day)) continue;
      onDayCrossRef.current?.(labelsRef.current.get(day) ?? day);
    }
  }, [dayKeys, labelsRef, onDayCrossRef]);

  // One sentence per arrival, with the day in front only when this message
  // opened it — a reader should hear "Yesterday" once, not on every line.
  const latest = messages[messages.length - 1];
  const previous = messages[messages.length - 2];
  const opened =
    latest !== undefined &&
    (previous === undefined || dayOf(previous.at) !== dayOf(latest.at));
  const announcement = latest
    ? `${opened ? `${formatDay(dayOf(latest.at), today)}. ` : ""}${latest.author}: ${latest.text}`
    : "";

  const fade = { duration: durations.fast } as const;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <span id={labelId} className="sr-only">
        {label}
      </span>
      <ol
        role="list"
        aria-labelledby={labelId}
        className="flex flex-col gap-1.5"
      >
        {rows.map((row) => {
          const fresh = !settledKeys.has(row.key);
          if (row.kind === "divider") {
            return (
              <li
                key={row.key}
                role="separator"
                aria-label={row.label}
                className="relative flex items-center justify-center py-1.5"
              >
                <motion.span
                  aria-hidden
                  className="absolute inset-x-0 top-1/2 h-px bg-hairline-strong"
                  style={{ originX: 0.5 }}
                  initial={
                    fresh
                      ? motionSafe
                        ? { scaleX: 0 }
                        : { opacity: 0 }
                      : false
                  }
                  animate={{ scaleX: 1, opacity: 1 }}
                  transition={motionSafe ? springs.glide : fade}
                />
                <motion.span
                  className="relative rounded-full border border-hairline bg-surface-1 px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
                  initial={fresh ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  transition={
                    motionSafe
                      ? {
                          duration: durations.base,
                          ease: easings.enter,
                          delay: 0.18,
                        }
                      : fade
                  }
                >
                  {row.label}
                </motion.span>
              </li>
            );
          }

          const { message } = row;
          const mine = message.mine === true;
          return (
            <li
              key={row.key}
              className={cn(
                "flex items-end gap-2",
                mine ? "flex-row-reverse" : "flex-row",
              )}
            >
              {!mine && (
                <span
                  aria-hidden
                  className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-[10px] text-ink-2"
                >
                  {initialsOf(message.author)}
                </span>
              )}
              <motion.div
                className={cn(
                  "max-w-[82%] rounded-3 px-3 py-2 text-sm leading-snug",
                  mine
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-2 text-foreground",
                )}
                initial={
                  fresh
                    ? motionSafe
                      ? { opacity: 0, y: distances.nudge }
                      : { opacity: 0 }
                    : false
                }
                animate={{ opacity: 1, y: 0 }}
                transition={
                  motionSafe
                    ? {
                        ...springs.glide,
                        opacity: {
                          duration: durations.base,
                          ease: easings.enter,
                        },
                      }
                    : fade
                }
              >
                <span className="sr-only">
                  {message.author}, {timeOf(message.at)}.{" "}
                </span>
                {message.text}
                <span
                  aria-hidden
                  className="ml-2 font-mono text-[10px] tabular-nums opacity-70"
                >
                  {timeOf(message.at)}
                </span>
              </motion.div>
            </li>
          );
        })}
      </ol>
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
