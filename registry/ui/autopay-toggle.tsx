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

export type ScheduleItem = {
  id: string;
  label: string;
  /** Month 1–12. */
  month: number;
  day: number;
  amount: number;
};

export type AutopayToggleProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled switch state. */
  checked?: boolean;
  /** Initial switch state for uncontrolled usage. @default false */
  defaultChecked?: boolean;
  /** Fires from the press that flipped it. */
  onCheckedChange?: (checked: boolean) => void;
  /** What is being paid; names the switch. */
  label: string;
  /** The payment autopay will make. */
  amount: number;
  /** The next pay date. Explicit, so the render never reads the clock. */
  nextDate: { month: number; day: number };
  /** Other upcoming payments, in any order. */
  schedule?: ScheduleItem[];
  /** Turns an amount into its printed string. */
  format?: (value: number) => string;
  className?: string;
};

/**
 * An explicit locale: a server and a client formatting in different locales
 * print different strings for the same figure — a hydration mismatch.
 */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => currency.format(value);

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

const NO_ITEMS: ScheduleItem[] = [];

/** The reserved id of the row autopay adds; a host's items never collide. */
const AUTOPAY_ID = "__autopay";

export const payDateLabel = (date: { month: number; day: number }) =>
  `${date.day} ${MONTHS[date.month - 1] ?? ""}`;

/**
 * One face of the calendar glyph: a header strip and a body. Both faces are
 * always present, back faces hidden, so the turn is one `rotateY` and never a
 * swap of content half-way through.
 */
function Face({
  back,
  tone,
  children,
}: {
  back?: boolean;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <span
      aria-hidden
      className="absolute inset-0 flex flex-col overflow-hidden rounded-2 border border-hairline-strong bg-surface-0 [backface-visibility:hidden]"
      style={back ? { transform: "rotateY(180deg)" } : undefined}
    >
      <span className={cn("block h-2 w-full shrink-0", tone)} />
      <span className="flex flex-1 items-center justify-center font-mono text-sm leading-none font-semibold tabular-nums">
        {children}
      </span>
    </span>
  );
}

/**
 * A switch that puts a bill on autopay. The knob rides its track on `snap`,
 * and the calendar glyph beside it turns over on the same spring — a real
 * `rotateY` on a perspective, both faces present — from a dash to the pay
 * date's day. Below, the upcoming schedule is an ordered list: switching on
 * slides the autopay payment into its dated place, arriving a `step` from the
 * left on `snap` while the rows around it glide apart and the list grows to
 * its measured height; switching off sends it out on the exit ease and the
 * list closes up. Nothing is reserved for either state.
 *
 * It is a `role="switch"` button described by the line that names the date
 * and amount, so Space and Enter toggle and a reader hears what "on" means.
 * Under reduced motion the knob swaps position, the faces cross-fade instead
 * of turning, the row fades in place, and the height changes with a tween.
 */
export function AutopayToggle({
  ref,
  checked,
  defaultChecked = false,
  onCheckedChange,
  label,
  amount,
  nextDate,
  schedule = NO_ITEMS,
  format = defaultFormat,
  className,
}: AutopayToggleProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const hintId = `${baseId}-hint`;
  const listId = `${baseId}-list`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultChecked);
  const on = checked ?? uncontrolled;

  const toggle = () => {
    const next = !on;
    if (checked === undefined) setUncontrolled(next);
    onCheckedChange?.(next);
  };

  // The list's height is measured, never reserved: the observer's own callback
  // reports it (it fires once on observe), so no layout is read during render.
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeight(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const rows = React.useMemo(() => {
    const items = on
      ? [
          ...schedule,
          {
            id: AUTOPAY_ID,
            label,
            month: nextDate.month,
            day: nextDate.day,
            amount,
          },
        ]
      : schedule;
    return [...items].sort(
      (a, b) => a.month - b.month || a.day - b.day || a.id.localeCompare(b.id),
    );
  }, [on, schedule, label, nextDate.month, nextDate.day, amount]);

  const next = payDateLabel(nextDate);
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {/* The perspective lives on the wrapper so the face turning inside it
            has depth; the wrapper itself never transforms. */}
        <span className="relative size-9 shrink-0" style={{ perspective: 200 }}>
          {motionSafe ? (
            <motion.span
              className="absolute inset-0"
              style={{ transformStyle: "preserve-3d" }}
              initial={false}
              animate={{ rotateY: on ? 180 : 0 }}
              transition={springs.snap}
            >
              <Face tone="bg-ink-3/40">–</Face>
              <Face back tone="bg-primary">
                {nextDate.day}
              </Face>
            </motion.span>
          ) : (
            <span className="absolute inset-0">
              <motion.span
                className="absolute inset-0"
                initial={false}
                animate={{ opacity: on ? 0 : 1 }}
                transition={fade}
              >
                <Face tone="bg-ink-3/40">–</Face>
              </motion.span>
              <motion.span
                className="absolute inset-0"
                initial={false}
                animate={{ opacity: on ? 1 : 0 }}
                transition={fade}
              >
                <Face tone="bg-primary">{nextDate.day}</Face>
              </motion.span>
            </span>
          )}
        </span>

        <span className="flex min-w-0 flex-1 flex-col">
          <span id={labelId} className="truncate text-sm font-medium">
            {label}
          </span>
          <span id={hintId} className="grid text-xs text-ink-3">
            {/* Both hints share one cell so the swap never changes the row's
                height; the live one is the only one a reader gets. */}
            <motion.span
              aria-hidden={!on}
              className="col-start-1 row-start-1 truncate"
              initial={false}
              animate={{ opacity: on ? 1 : 0 }}
              transition={fade}
            >
              Pays {format(amount)} on {next}
            </motion.span>
            <motion.span
              aria-hidden={on}
              className="col-start-1 row-start-1 truncate"
              initial={false}
              animate={{ opacity: on ? 0 : 1 }}
              transition={fade}
            >
              Pay by hand
            </motion.span>
          </span>
        </span>

        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={labelId}
          aria-describedby={hintId}
          onClick={toggle}
          className={cn(
            "relative flex h-6 w-10 shrink-0 items-center rounded-full border p-0.5 transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            on
              ? "border-primary bg-primary"
              : "border-hairline-strong bg-surface-2",
          )}
        >
          <motion.span
            aria-hidden
            className={cn(
              "block size-4 rounded-full shadow-sm transition-colors",
              on ? "bg-primary-foreground" : "bg-ink-3",
            )}
            initial={false}
            animate={{ x: on ? 16 : 0 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          />
        </button>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-hairline pt-3">
        <span
          id={listId}
          className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          Upcoming
        </span>
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
            {/* The list stays mounted even when empty, so the first row to
                arrive still slides in rather than appearing with a fresh
                AnimatePresence that skips its initial. */}
            <ol aria-labelledby={listId} className="flex flex-col gap-1">
              <AnimatePresence initial={false}>
                {rows.map((row) => {
                  const auto = row.id === AUTOPAY_ID;
                  return (
                    <motion.li
                      key={row.id}
                      layout={motionSafe ? "position" : false}
                      initial={
                        auto
                          ? motionSafe
                            ? { opacity: 0, x: -distances.step }
                            : { opacity: 0 }
                          : false
                      }
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, transition: exitFor() }}
                      transition={
                        motionSafe ? { ...springs.snap, opacity: fade } : fade
                      }
                      className={cn(
                        "flex h-9 items-center gap-2 rounded-2 border px-2.5 text-xs",
                        auto
                          ? "border-cobalt-bright/40 bg-cobalt-wash"
                          : "border-hairline bg-surface-0",
                      )}
                    >
                      <span className="w-12 shrink-0 font-mono text-ink-3 tabular-nums">
                        {payDateLabel(row)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {row.label}
                      </span>
                      {auto ? (
                        <span className="shrink-0 rounded-full bg-cobalt-bright/15 px-1.5 py-px font-mono text-[10px] tracking-[0.08em] text-cobalt-bright uppercase">
                          auto
                        </span>
                      ) : null}
                      <span className="shrink-0 font-mono text-foreground tabular-nums">
                        {format(row.amount)}
                      </span>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ol>
            {rows.length === 0 ? (
              <p className="py-1 text-xs text-ink-3">Nothing scheduled.</p>
            ) : null}
          </div>
        </motion.div>
      </div>

      <span role="status" className="sr-only">
        {on ? `Autopay on, next payment ${next}` : "Autopay off"}
      </span>
    </div>
  );
}
