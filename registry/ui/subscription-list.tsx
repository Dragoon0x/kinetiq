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

export type SubscriptionCycle = "monthly" | "yearly";

export type SubscriptionItem = {
  id: string;
  /** The service being paid for. */
  name: string;
  /** The plan or seat line under the name. */
  plan?: string;
  /** Amount charged once per `cycle`, in major units. */
  amount: number;
  /** @default "monthly" */
  cycle?: SubscriptionCycle;
  /** Seconds until the next charge. The soonest of these gets the countdown. */
  dueInSeconds: number;
};

export type SubscriptionListProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The subscriptions. Order is by next charge; the soonest leads. */
  items: SubscriptionItem[];
  /** Fires from the press on a row's cancel — remove the item to play the exit. */
  onCancel?: (id: string) => void;
  /** Fires once a second from the countdown interval. */
  onTick?: (secondsLeft: number) => void;
  /** Turns an amount into its printed string. */
  format?: (value: number) => string;
  /** Names the list and the monthly total. @default "Subscriptions" */
  label?: string;
  /** Runs the countdown; it also stops while the document is hidden. @default true */
  running?: boolean;
  /** The designed empty state. @default "Nothing charges this account." */
  emptyLabel?: string;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server that formats in one locale and
 * a client that formats in another produce different text for the same number,
 * which is a hydration mismatch on the figure that matters most.
 */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => currency.format(value);

const FACES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

const DAY = 86400;
const HOUR = 3600;
const MINUTE = 60;

const pad = (value: number) => String(value).padStart(2, "0");

/** The ticking face: days fall away, then hours, and the seconds always run. */
function clockFace(total: number) {
  const seconds = Math.max(0, Math.floor(total));
  const days = Math.floor(seconds / DAY);
  const rest = seconds % DAY;
  const face = `${pad(Math.floor(rest / HOUR))}:${pad(Math.floor((rest % HOUR) / MINUTE))}:${pad(rest % MINUTE)}`;
  return days > 0 ? `${days}d ${face}` : face;
}

/** The same wait as a sentence, for the reader who cannot see the digits move. */
function spokenWait(total: number) {
  const seconds = Math.max(0, Math.floor(total));
  if (seconds <= 0) return "now";
  const days = Math.floor(seconds / DAY);
  const hours = Math.floor((seconds % DAY) / HOUR);
  const minutes = Math.floor((seconds % HOUR) / MINUTE);
  if (days > 0) {
    return `${days} day${days === 1 ? "" : "s"} ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  if (hours > 0) {
    return `${hours} hour${hours === 1 ? "" : "s"} ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  if (minutes > 0) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

/** What a row shows when it is not the one being counted down. */
function coarseWait(total: number) {
  const seconds = Math.max(0, Math.floor(total));
  if (seconds <= 0) return "due now";
  const days = Math.floor(seconds / DAY);
  if (days >= 1) return `in ${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.floor(seconds / HOUR);
  if (hours >= 1) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  return `in ${Math.max(1, Math.floor(seconds / MINUTE))} min`;
}

/**
 * A figure whose digit columns roll to their new value on `snap` — one crisp
 * overshoot, the physics of any indicator moving to a new position.
 *
 * Each column is a ten-face strip translated by a percentage of its own height,
 * so one `y` moves exactly one digit, and `1ch` in a monospaced face is exactly
 * a digit wide: the total can gain a column without the layout shifting under
 * it. Hidden from assistive technology, which is given the amount as a sentence.
 */
function RollingFigure({
  text,
  motionSafe,
  className,
}: {
  text: string;
  motionSafe: boolean;
  className?: string;
}) {
  const chars = text.split("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex items-center tabular-nums", className)}
    >
      {chars.map((char, index) => {
        const digit = FACES.indexOf(char);
        // Keyed from the right so the units column keeps its identity when the
        // figure gains or loses a digit, and only the new column mounts.
        const key = chars.length - index;
        if (digit < 0) {
          return (
            <span key={key} className="inline-block">
              {char}
            </span>
          );
        }
        return (
          <span
            key={key}
            className="relative inline-block h-[1.2em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {FACES.map((face) => (
                <span
                  key={face}
                  className="flex h-[1.2em] items-center justify-center"
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

/**
 * A row that owns its own height. The inner content is measured by a
 * ResizeObserver — which fires on observe, before paint — so the collapse on
 * removal runs from a real number instead of a reserved one. Until the first
 * measurement the row is simply `auto`, so nothing flashes closed on mount.
 */
function Row({
  item,
  monthly,
  soonest,
  waitSeconds,
  format,
  motionSafe,
  buttonId,
  onCancel,
}: {
  item: SubscriptionItem;
  monthly: number;
  soonest: boolean;
  waitSeconds: number;
  format: (value: number) => string;
  motionSafe: boolean;
  buttonId: string;
  onCancel: () => void;
}) {
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = React.useState(0);

  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setMeasured(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const cycle = item.cycle ?? "monthly";
  const perCycle = `${format(item.amount)}${cycle === "yearly" ? "/yr" : "/mo"}`;
  const wait = soonest ? clockFace(waitSeconds) : coarseWait(waitSeconds);
  const spoken = waitSeconds <= 0 ? "now" : `in ${spokenWait(waitSeconds)}`;
  // The leading row's wait is a queryable timer of its own, so its sentence
  // stops at the money and nothing is said twice.
  const sentence = `${item.name}, ${format(item.amount)} ${cycle === "yearly" ? "a year" : "a month"}${
    cycle === "yearly" ? `, ${format(monthly)} a month` : ""
  }${soonest ? "" : `, next charge ${spoken}`}`;

  return (
    <motion.li
      className="overflow-hidden"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: measured || "auto", opacity: 1 }}
      exit={{
        height: 0,
        opacity: 0,
        transition: motionSafe
          ? exitFor(durations.slow)
          : { duration: durations.fast, ease: easings.exit },
      }}
      transition={motionSafe ? springs.glide : { duration: 0 }}
    >
      {/* The slide lives on the content, clipped by the row: a row that
          travelled itself would overhang the column on its way out. Nested
          motion still hears the exit, so the two run together. */}
      <motion.div
        ref={innerRef}
        exit={
          motionSafe
            ? {
                x: -distances.shift * 2,
                opacity: 0,
                transition: exitFor(durations.slow),
              }
            : { opacity: 0, transition: { duration: durations.fast } }
        }
        className="flex items-center gap-2.5 border-t border-hairline py-2.5"
      >
        {/* The rail marks the charge that lands first. It is drawn on every row
            so the text column starts at the same x whichever row leads. */}
        <span
          aria-hidden
          className={cn(
            "h-8 w-0.5 shrink-0 rounded-full transition-colors",
            soonest ? "bg-cobalt-bright" : "bg-transparent",
          )}
        />

        <span className="sr-only">{sentence}</span>

        <div aria-hidden className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">
            {item.name}
          </div>
          <div className="truncate text-xs text-ink-3">
            {item.plan ? `${item.plan} · ` : ""}
            {cycle === "yearly" ? "Yearly" : "Monthly"}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span
            aria-hidden
            className="font-mono text-sm text-foreground tabular-nums"
          >
            {perCycle}
          </span>
          {/* `aria-live="off"`: a reader may ask the timer what it says, but a
              number that changes every second must never announce itself. */}
          <span
            role={soonest ? "timer" : undefined}
            aria-live={soonest ? "off" : undefined}
            aria-label={soonest ? `Next charge ${spoken}` : undefined}
            aria-hidden={soonest ? undefined : true}
            className={cn(
              "font-mono text-[11px] tabular-nums",
              soonest ? "text-signal" : "text-ink-3",
            )}
          >
            {wait}
          </span>
        </div>

        <button
          type="button"
          id={buttonId}
          onClick={onCancel}
          title={`Cancel ${item.name}`}
          aria-label={`Cancel ${item.name}`}
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors outline-none",
            "hover:bg-accent hover:text-foreground active:bg-cobalt-wash",
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
            className="size-3.5 shrink-0"
          >
            <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
          </svg>
        </button>
      </motion.div>
    </motion.li>
  );
}

/**
 * Everything that charges you, with the soonest charge alive at the top.
 *
 * The leading row's wait ticks once a second from an interval that stops when
 * the tab is hidden, so the countdown never marches to an empty room and never
 * reads the clock during render. Cancelling calls back from the press; when the
 * host drops the row it slides left as its measured height closes on the exit
 * ease — exits accelerate away, they never spring — and the rows below take up
 * the space in flow. The monthly total rolls its digit columns on `snap`, one
 * crisp overshoot, and a yearly plan is counted as a twelfth of itself so the
 * total answers the only question worth asking.
 *
 * Every cancel is a real button with the service's name on it, so the list is a
 * Tab away from being operable; the countdown sits in an `aria-live="off"` timer
 * so it can be queried rather than announced every second. Under reduced motion
 * the row closes without travel and the digits swap in place — the total still
 * changes, because the total is the information.
 */
export function SubscriptionList({
  ref,
  items,
  onCancel,
  onTick,
  format = defaultFormat,
  label = "Subscriptions",
  running = true,
  emptyLabel = "Nothing charges this account.",
  className,
}: SubscriptionListProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  // Nothing counts down to an empty room.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const ordered = items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) => a.item.dueInSeconds - b.item.dueInSeconds || a.index - b.index,
    )
    .map((entry) => entry.item);

  const soonest = ordered[0];
  const soonestId = soonest?.id ?? null;

  const [elapsed, setElapsed] = React.useState(0);
  const [clockKey, setClockKey] = React.useState(soonestId);
  // Adjusting state during render is how a countdown restarts when the row it
  // was counting is cancelled: the committed render already knows it is a new
  // wait, so no effect has to write state after the fact.
  if (clockKey !== soonestId) {
    setClockKey(soonestId);
    setElapsed(0);
  }

  // The interval reads its running total from a mirror rather than from state,
  // so a re-render between ticks cannot hand it a stale closure.
  const elapsedRef = React.useRef(0);
  React.useEffect(() => {
    elapsedRef.current = elapsed;
  });

  const tickRef = React.useRef(onTick);
  React.useEffect(() => {
    tickRef.current = onTick;
  });

  const soonestDue = soonest?.dueInSeconds ?? 0;

  React.useEffect(() => {
    if (!running || !visible || soonestId === null) return;
    if (elapsedRef.current >= soonestDue) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const next = Math.min(
        soonestDue,
        elapsedRef.current + (now - last) / 1000,
      );
      last = now;
      elapsedRef.current = next;
      setElapsed(next);
      // Reported from the tick that caused it, never from a state updater.
      tickRef.current?.(Math.max(0, Math.ceil(soonestDue - next)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running, visible, soonestId, soonestDue]);

  // A cancelled row takes its button with it, so the next row's button takes
  // the focus. The id is parked in a ref by the press and used by the effect
  // that runs once the list has actually changed.
  const focusRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const id = focusRef.current;
    if (!id) return;
    focusRef.current = null;
    document.getElementById(id)?.focus();
  }, [items]);

  const monthlyOf = (item: SubscriptionItem) =>
    (item.cycle ?? "monthly") === "yearly" ? item.amount / 12 : item.amount;

  const total = ordered.reduce((sum, item) => sum + monthlyOf(item), 0);
  const totalText = format(total);

  const cancel = (id: string, position: number) => {
    const next = ordered[position + 1] ?? ordered[position - 1];
    focusRef.current = next ? `${baseId}-cancel-${next.id}` : null;
    onCancel?.(id);
  };

  const waitFor = (item: SubscriptionItem) =>
    Math.max(0, item.dueInSeconds - elapsed);

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div id={labelId} className="truncate text-sm font-semibold">
            {label}
          </div>
          <div className="mt-0.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {ordered.length} active
          </div>
        </div>
        <div className="shrink-0 text-right">
          <span className="block font-mono text-xl leading-none font-medium text-foreground">
            <span className="sr-only">{`Monthly total, ${totalText}`}</span>
            <RollingFigure text={totalText} motionSafe={motionSafe} />
          </span>
          <span
            aria-hidden
            className="mt-1 block font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            Per month
          </span>
        </div>
      </div>

      {ordered.length === 0 ? (
        <p className="text-xs text-ink-3">{emptyLabel}</p>
      ) : (
        <ul aria-labelledby={labelId} className="flex flex-col">
          {/* `initial={false}` so a list that mounts with rows does not open
              five heights at once; a row added later still arrives. */}
          <AnimatePresence initial={false}>
            {ordered.map((item, position) => (
              <Row
                key={item.id}
                item={item}
                monthly={monthlyOf(item)}
                soonest={item.id === soonestId}
                waitSeconds={waitFor(item)}
                format={format}
                motionSafe={motionSafe}
                buttonId={`${baseId}-cancel-${item.id}`}
                onCancel={() => cancel(item.id, position)}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}

      <span role="status" className="sr-only">
        {`${totalText} a month across ${ordered.length} subscription${
          ordered.length === 1 ? "" : "s"
        }`}
      </span>
    </div>
  );
}
