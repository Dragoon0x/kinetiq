"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  durations,
  easings,
  exitFor,
  springs,
  distances,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PoolReserve = {
  /** Ticker of this side of the pair. */
  symbol: string;
  /** Units of that asset sitting in the pool. */
  amount: number;
};

export type PoolShareProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The pair's name, e.g. "BSN / FRN". */
  poolName: string;
  /** Your position's value in the pool. */
  contributed: number;
  /** The pool's total value; the wedge is the ratio of the two. */
  poolTotal: number;
  /** Fees earned so far. Rolls when it changes. @default 0 */
  fees?: number;
  /** Both sides of the pair, printed as the pool's totals reading. */
  reserves: [PoolReserve, PoolReserve];
  /** Formats every cash figure. */
  format?: (value: number) => string;
  /** The sum the Add control offers. @default 500 */
  addStep?: number;
  /** Fires from the Add press; raise `contributed` and the wedge follows. */
  onAdd?: (amount: number) => void;
  /** Controlled state of the second reading. */
  showTotals?: boolean;
  /** Initial state of the second reading. @default false */
  defaultShowTotals?: boolean;
  /** Fires from the press or the Escape that changed the pinned reading. */
  onShowTotalsChange?: (shown: boolean) => void;
  /** Visible heading. Omit it and pass `aria-label`. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

/** Explicit locales keep the server's string and the client's identical. */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const units = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const defaultFormat = (value: number) => currency.format(value);

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * A figure whose digits roll to their new value on `snap` — one crisp
 * overshoot, the physics of an indicator changing position. Hidden from
 * assistive technology because the card speaks the same figures in a sentence.
 */
function RollingFigure({
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
        // Keyed from the right so the units column keeps its identity when the
        // figure gains or loses a digit, and only the new column mounts.
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
            className="relative inline-block h-[1.2em] w-[1ch] overflow-hidden"
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

/** How long the added sum stays stamped over the ring. */
const STAMP_MS = 1400;
/** Milliseconds of quiet before the live region reads the settled position. */
const SETTLE_MS = 500;

const BUTTON_CLASS =
  "flex h-8 items-center justify-center rounded-2 border px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * A liquidity position drawn as one wedge of a ring. The wedge is a single
 * stroked circle whose dash offset is your share of the pool, so adding
 * liquidity animates exactly one number: the arc grows from where it stood to
 * where it belongs on `glide`, a quantity settling over 450ms rather than a bar
 * snapping into place. The position and the fees roll their digits on `snap` at
 * the same beat, and the added sum stamps over the ring on `recoil` — the one
 * place that celebrates, because liquidity landing in a pool is a thing coming
 * to rest.
 *
 * The ring carries two readings in one grid cell. Hovering it, or pressing the
 * totals control, cross-fades the hub and the figures beside it from your
 * position to the pool's own — a whole reading swapping, which is why it fades
 * rather than counts. The control is a real `aria-pressed` button so the
 * keyboard reaches the second reading exactly as the pointer does, and Escape
 * hands the card back to your share.
 *
 * The graphic is decorative: every figure it draws is printed as text, the
 * share is exposed as a `role="meter"` with a spoken `aria-valuetext`, and a
 * visually hidden status announces the settled position after an add. Under
 * reduced motion the wedge still grows and the figures still change — a share
 * is information — but on a short tween, and the stamp appears in place rather
 * than rising.
 */
export function PoolShare({
  ref,
  poolName,
  contributed,
  poolTotal,
  fees = 0,
  reserves,
  format = defaultFormat,
  addStep = 500,
  onAdd,
  showTotals,
  defaultShowTotals = false,
  onShowTotalsChange,
  label,
  className,
  "aria-label": ariaLabel,
}: PoolShareProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultShowTotals);
  const isControlled = showTotals !== undefined;
  const [hovered, setHovered] = React.useState(false);
  // Hover is a transient reading and the press is the committed one, so the
  // pointer can borrow the pool's totals without changing what the card holds.
  const pinned = isControlled ? showTotals : uncontrolled;
  const totals = pinned || hovered;

  const setTotals = (next: boolean) => {
    if (!isControlled) setUncontrolled(next);
    onShowTotalsChange?.(next);
  };

  const share =
    poolTotal > 0 ? Math.min(1, Math.max(0, contributed / poolTotal)) : 0;
  const percent = share * 100;
  // Two decimals below a tenth of the pool, where the moving digits actually
  // live; a large holder reads in whole points.
  const percentText = percent >= 10 ? percent.toFixed(1) : percent.toFixed(2);

  const [stamp, setStamp] = React.useState<{
    id: number;
    amount: number;
  } | null>(null);

  React.useEffect(() => {
    if (!stamp) return;
    const timer = window.setTimeout(() => setStamp(null), STAMP_MS);
    return () => window.clearTimeout(timer);
  }, [stamp]);

  const add = () => {
    // The id only has to differ from the last one for AnimatePresence to treat
    // a second add as a second stamp rather than a re-render of the first.
    setStamp((previous) => ({
      id: (previous?.id ?? 0) + 1,
      amount: addStep,
    }));
    onAdd?.(addStep);
  };

  const valueText = `${percentText} percent of the pool, ${format(contributed)} of ${format(poolTotal)}`;
  const sentence = `Position ${format(contributed)}, ${percentText} percent of the ${poolName} pool. Fees earned ${format(fees)}.`;
  const [announced, setAnnounced] = React.useState("");
  React.useEffect(() => {
    // The wedge takes 450ms to settle; announcing before then would narrate a
    // figure the viewer has not finished seeing.
    const timer = window.setTimeout(() => setAnnounced(sentence), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [sentence]);

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const grow = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };

  /**
   * Both readings are always rendered so the cross-fade has something to fade
   * to; each is two rows of the same shape, so the cell they share is sized by
   * either one and no room is held for the taller.
   */
  const rowsFor = (
    mode: boolean,
  ): { caption: string; figure: string; rolls: boolean }[] =>
    mode
      ? reserves.map((reserve) => ({
          caption: `${reserve.symbol} reserve`,
          figure: units.format(reserve.amount),
          rolls: false,
        }))
      : [
          {
            caption: "Your position",
            figure: format(contributed),
            rolls: true,
          },
          { caption: "Fees earned", figure: format(fees), rolls: true },
        ];

  return (
    <div
      ref={ref}
      className={cn("flex w-full flex-col gap-4", className)}
      aria-label={label ? undefined : ariaLabel}
      aria-labelledby={label ? labelId : undefined}
      role="group"
    >
      <div className="flex items-baseline justify-between gap-3">
        {label ? (
          <span id={labelId} className="text-sm font-semibold text-foreground">
            {label}
          </span>
        ) : null}
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {poolName}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div
          className="relative size-28 shrink-0"
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
        >
          <svg
            viewBox="0 0 120 120"
            aria-hidden
            className="absolute inset-0 size-full -rotate-90"
          >
            <circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              className="text-hairline-strong"
            />
            {/* A butt cap keeps a small share honest: a round cap would add
                half a stroke width at each end and read as twice the wedge. */}
            <motion.circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              strokeLinecap="butt"
              pathLength={1}
              strokeDasharray="1 1"
              className={cn(
                "transition-colors",
                totals ? "text-ink-3" : "text-cobalt-bright",
              )}
              initial={{ strokeDashoffset: 1 }}
              animate={{ strokeDashoffset: 1 - share }}
              transition={grow}
            />
          </svg>

          <span className="absolute inset-0 grid place-items-center px-3 text-center">
            <motion.span
              aria-hidden={totals}
              className="col-start-1 row-start-1 flex flex-col items-center"
              animate={{ opacity: totals ? 0 : 1 }}
              transition={fade}
            >
              <span className="font-mono text-base leading-none font-medium text-foreground tabular-nums">
                {percentText}%
              </span>
              <span className="mt-1 font-mono text-[9px] tracking-[0.08em] text-ink-3 uppercase">
                of pool
              </span>
            </motion.span>
            <motion.span
              aria-hidden={!totals}
              className="col-start-1 row-start-1 flex flex-col items-center"
              animate={{ opacity: totals ? 1 : 0 }}
              transition={fade}
            >
              <span className="font-mono text-[11px] leading-none font-medium text-foreground tabular-nums">
                {format(poolTotal)}
              </span>
              <span className="mt-1 font-mono text-[9px] tracking-[0.08em] text-ink-3 uppercase">
                pooled
              </span>
            </motion.span>
          </span>

          {/* Inset rather than centred on the rim, so the stamp can never
              overhang the ring's own box at any width. */}
          <div className="pointer-events-none absolute inset-x-1 bottom-0 flex justify-center">
            <AnimatePresence>
              {stamp ? (
                <motion.span
                  key={stamp.id}
                  aria-hidden
                  className="rounded-full border border-hairline-strong bg-popover px-2 py-0.5 font-mono text-[10px] font-medium text-success tabular-nums shadow-raised"
                  initial={
                    motionSafe
                      ? { opacity: 0, y: distances.step }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: exitFor() }}
                  transition={
                    motionSafe
                      ? { ...springs.recoil, opacity: fade }
                      : { duration: durations.fast }
                  }
                >
                  +{format(stamp.amount)}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </div>

          {/* The graphic is decorative; this is where its value is spoken. */}
          <span
            role="meter"
            aria-label={`Your share of the ${poolName} pool`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Number(percentText)}
            aria-valuetext={valueText}
            className="sr-only"
          />
        </div>

        <div className="grid min-w-0 flex-1">
          {[false, true].map((mode) => (
            <motion.dl
              key={String(mode)}
              aria-hidden={mode !== totals}
              className={cn(
                "col-start-1 row-start-1 flex flex-col gap-2",
                // The faded reading still sits over the live one in the shared
                // cell, so it must not catch a selection or a pointer.
                mode !== totals && "pointer-events-none",
              )}
              animate={{ opacity: mode === totals ? 1 : 0 }}
              transition={fade}
            >
              {rowsFor(mode).map(({ caption, figure, rolls }) => (
                <div key={caption} className="flex flex-col gap-0.5">
                  <dt className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                    {caption}
                  </dt>
                  <dd className="overflow-hidden font-mono text-[13px] leading-tight font-medium text-foreground">
                    {rolls ? (
                      <>
                        <RollingFigure value={figure} motionSafe={motionSafe} />
                        <span className="sr-only">{figure}</span>
                      </>
                    ) : (
                      figure
                    )}
                  </dd>
                </div>
              ))}
            </motion.dl>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={add}
          className={cn(
            BUTTON_CLASS,
            "border-transparent bg-primary text-primary-foreground hover:opacity-90",
          )}
        >
          Add {format(addStep)}
        </button>
        <button
          type="button"
          aria-pressed={pinned}
          onClick={() => setTotals(!pinned)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setTotals(false);
            }
          }}
          className={cn(
            BUTTON_CLASS,
            pinned
              ? "border-hairline-strong bg-cobalt-wash text-foreground"
              : "border-input bg-surface-1 text-ink-2 hover:bg-accent hover:text-foreground",
          )}
        >
          Pool totals
        </button>
      </div>

      <span role="status" className="sr-only">
        {announced}
      </span>
    </div>
  );
}
