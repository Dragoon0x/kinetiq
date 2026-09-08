"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type OrderStage = {
  id: string;
  /** Stop name under the rail. */
  label: string;
  /** One short line under the name — where the card is, in words. */
  note: string;
};

export type CardOrderProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Index of the furthest stop reached. Clamped to the stage list. @default 0 */
  stage?: number;
  /** The stops, in order. @default printed / posted / out for delivery / delivered */
  stages?: OrderStage[];
  /** Days until arrival; the digits roll when it tightens. @default 3 */
  etaDays?: number;
  /** The date under the count. @default "Thu 14 Mar" */
  etaDate?: string;
  /** Replaces the estimate once the last stop is reached. */
  deliveredNote?: string;
  /** Wordmark printed on the travelling slab. @default "Waylight" */
  network?: string;
  /** Last four digits printed on the slab. @default "4417" */
  last4?: string;
  /** Replacement fee; zero prints "No fee". @default 0 */
  fee?: number;
  /** Formats the fee; the order never invents a currency. */
  format?: (value: number) => string;
  /** Order reference, printed mono and selectable. @default "CBK-4417-2F" */
  reference?: string;
  /** Names the group for assistive technology. @default "Card order" */
  label?: string;
  className?: string;
};

const DEFAULT_STAGES: OrderStage[] = [
  { id: "printed", label: "Printed", note: "Fernworks press" },
  { id: "posted", label: "Posted", note: "Coldbrook depot" },
  { id: "out", label: "Out for delivery", note: "On the van" },
  { id: "delivered", label: "Delivered", note: "At your door" },
];

/** Explicit locale: the server and the first client render must agree. */
const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const formatMoney = (value: number): string => MONEY.format(value);

const FACES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** The slab, lit from its top-right corner. Tokens only, so both themes read. */
const SLAB_ART = [
  "radial-gradient(130% 110% at 100% 0%, color-mix(in oklab, var(--accent) 46%, transparent), transparent 62%)",
  "linear-gradient(150deg, var(--bg-2), var(--bg-1) 70%)",
].join(", ");

/**
 * A figure whose digits roll to their new place on `snap`. The column is ten
 * faces tall, so a `y` of one tenth of its own height moves exactly one digit;
 * a `1ch` `tabular-nums` cell keeps a rolling digit from nudging the word beside
 * it. Hidden from assistive technology — the status sentence already says the
 * figure, and a reader should not wade through ten faces per column.
 */
function Rolling({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex tabular-nums">
      {value.split("").map((char, index) => {
        const digit = FACES.indexOf(char as (typeof FACES)[number]);
        // Keyed from the right, so the units column keeps its identity when the
        // figure gains or loses a digit and only the new column mounts.
        const key = value.length - index;
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
            className="relative inline-block h-[1.15em] w-[1ch] overflow-hidden"
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
                  className="flex h-[1.15em] items-center justify-center"
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
 * A card on its way to you. A miniature slab rides a rail above the stops and
 * slides to the one the order has reached on `glide`, the layout spring,
 * because the card is a surface moving rather than a switch flipping. The last
 * stop is a landing, so the slab arrives on `recoil` and a tick stamps into the
 * final dot.
 *
 * Its travel is expressed as a percentage of the slab's own width: with the
 * slab exactly one column wide, one stage is exactly `x: "100%"`, which lands
 * every stop on its dot at any container width with nothing measured. A pixel
 * offset here is what overhangs a 342px column. The rail fills behind it on
 * `glide` and each reached dot flicks in, staggered by `cascade`, so a jump of
 * two stages lights in sequence rather than all at once. Under the rail the
 * estimate rolls on `snap` and the date cross-fades.
 *
 * Under reduced motion the slab swaps to its stop instantly and the dots simply
 * appear, but the rail still fills and the count still rolls over, because how
 * far a parcel has come is information rather than flourish.
 */
export function CardOrder({
  ref,
  stage = 0,
  stages = DEFAULT_STAGES,
  etaDays = 3,
  etaDate = "Thu 14 Mar",
  deliveredNote = "Signed for at the door",
  network = "Waylight",
  last4 = "4417",
  fee = 0,
  format = formatMoney,
  reference = "CBK-4417-2F",
  label = "Card order",
  className,
}: CardOrderProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const labelId = `${uid}-label`;

  const count = Math.max(stages.length, 1);
  const reached = Math.min(Math.max(0, Math.round(stage)), count - 1);
  const delivered = reached === count - 1;
  const step = cascade(count);
  const days = Math.max(0, Math.round(etaDays));

  // The cascade starts at the stop the order has just left, not at the head of
  // the rail: a jump of two stages should light the two new dots in sequence
  // rather than waiting out a run of stops that were already lit. The anchor
  // lives in state so the committed render knows where the parcel stood.
  const [anchor, setAnchor] = React.useState({ at: reached, from: reached });
  if (anchor.at !== reached) {
    setAnchor({ at: reached, from: Math.min(anchor.at, reached) });
  }

  const columnWidth = `${100 / count}%`;
  const fill = count > 1 ? reached / (count - 1) : 1;

  const sentence = delivered
    ? `${stages[reached]?.label ?? "Delivered"}. ${deliveredNote}.`
    : `${stages[reached]?.label ?? ""}. Arrives in ${days} ${
        days === 1 ? "day" : "days"
      }, ${etaDate}.`;

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={labelId}
      className={cn(
        "flex w-full flex-col gap-4 rounded-3 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span id={labelId} className="truncate text-sm font-semibold">
            {label}
          </span>
          <span className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {network} · {reference}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="font-mono text-[11px] font-medium tabular-nums">
            {fee > 0 ? format(fee) : "No fee"}
          </span>
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            ···· {last4}
          </span>
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {/* The slab is exactly one column wide, so one stage of travel is one
            of its own widths — the stop and the dot cannot drift apart. */}
        <div className="relative w-full">
          <motion.div
            aria-hidden
            className="flex flex-col justify-between rounded-2 border border-hairline-strong p-[7%] text-ink"
            style={{
              width: columnWidth,
              aspectRatio: "1.586",
              backgroundImage: SLAB_ART,
            }}
            initial={false}
            animate={{ x: `${reached * 100}%` }}
            transition={
              motionSafe
                ? delivered
                  ? springs.recoil
                  : springs.glide
                : { duration: 0 }
            }
          >
            <span className="h-[22%] w-[30%] shrink-0 rounded-[2px] border border-warn/70 bg-warn/45" />
            <span className="truncate font-mono text-[8px] tracking-[0.06em] tabular-nums">
              ···· {last4}
            </span>
          </motion.div>
        </div>

        <div className="relative flex items-center">
          {/* The line runs dot centre to dot centre, so it never pokes past the
              first or last stop. */}
          <span
            aria-hidden
            className="absolute top-1/2 h-px -translate-y-1/2 bg-hairline-strong"
            style={{ left: `${50 / count}%`, right: `${50 / count}%` }}
          />
          <motion.span
            aria-hidden
            className="absolute top-1/2 h-px origin-left -translate-y-1/2 bg-cobalt-bright"
            style={{ left: `${50 / count}%`, right: `${50 / count}%` }}
            initial={false}
            animate={{ scaleX: fill }}
            transition={
              motionSafe
                ? springs.glide
                : { duration: durations.base, ease: easings.enter }
            }
          />
          <div
            className="grid w-full"
            style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
          >
            {stages.map((entry, index) => {
              const done = index <= reached;
              const isLast = index === count - 1;
              return (
                <span
                  key={entry.id}
                  aria-hidden
                  className="flex items-center justify-center"
                >
                  <motion.span
                    className={cn(
                      "grid size-4 place-items-center rounded-full border transition-colors",
                      done
                        ? "border-cobalt-bright bg-cobalt-bright text-surface-0"
                        : "border-hairline-strong bg-surface-1 text-transparent",
                    )}
                    initial={false}
                    animate={{ scale: done ? 1 : 0.7 }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.flick,
                            delay: done
                              ? Math.max(0, index - anchor.from - 1) * step
                              : 0,
                          }
                        : { duration: 0 }
                    }
                  >
                    {done && isLast ? (
                      <svg
                        viewBox="0 0 16 16"
                        aria-hidden
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="size-2.5"
                      >
                        <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
                      </svg>
                    ) : null}
                  </motion.span>
                </span>
              );
            })}
          </div>
        </div>

        {/* Two subgrid rows: a stop whose name wraps to two lines cannot drop
            its note below the notes of the stops beside it. */}
        <ol
          role="list"
          className="grid w-full"
          style={{
            gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
            gridTemplateRows: "auto auto",
          }}
        >
          {stages.map((entry, index) => {
            const done = index <= reached;
            return (
              <li
                key={entry.id}
                aria-current={index === reached ? "step" : undefined}
                className="row-span-2 grid grid-rows-subgrid gap-0.5 px-0.5 text-center"
              >
                <span
                  className={cn(
                    "text-[10px] leading-tight font-medium transition-colors",
                    done ? "text-foreground" : "text-ink-3",
                  )}
                >
                  {entry.label}
                  <span className="sr-only">, {done ? "done" : "waiting"}</span>
                </span>
                <span className="text-[9px] leading-tight text-ink-3">
                  {entry.note}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex items-end justify-between gap-3 border-t border-hairline pt-3">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {delivered ? "Delivered" : "Arrives"}
          </span>
          <span aria-hidden className="flex items-baseline gap-1 text-sm">
            {delivered ? (
              <span className="font-medium text-success">{deliveredNote}</span>
            ) : (
              <>
                <span className="font-mono font-medium">
                  <Rolling value={String(days)} motionSafe={motionSafe} />
                </span>
                <span className="text-ink-2">
                  {days === 1 ? "day" : "days"} away
                </span>
              </>
            )}
          </span>
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={delivered ? "landed" : etaDate}
            aria-hidden
            className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            {etaDate}
          </motion.span>
        </AnimatePresence>
      </div>

      <p role="status" className="sr-only">
        {sentence}
      </p>
    </div>
  );
}
