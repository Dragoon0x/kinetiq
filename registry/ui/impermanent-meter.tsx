"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ImpermanentMeterProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Position value at entry; both bars are scaled from it. */
  deposit: number;
  /** Price of the pair now against entry — 1 is unchanged, 2 has doubled. @default 1 */
  priceRatio?: number;
  /** Fees taken since entry; nets off the shortfall in the breakdown. @default 0 */
  feesEarned?: number;
  /** The two tickers, printed in the breakdown. @default ["A", "B"] */
  pair?: [string, string];
  /** Formats every cash figure. */
  format?: (value: number) => string;
  /** Shortfall fraction at which the gap turns warn. @default 0.02 */
  warnAt?: number;
  /** Shortfall fraction at which the gap turns danger. @default 0.06 */
  dangerAt?: number;
  /** Controlled pinned state of the breakdown. */
  open?: boolean;
  /** Initial pinned state of the breakdown. @default false */
  defaultOpen?: boolean;
  /** Fires from the press or the Escape that changed the pinned state. */
  onOpenChange?: (open: boolean) => void;
  /** Visible heading. Omit it and pass `aria-label`. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const defaultFormat = (value: number) => currency.format(value);

const percents = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** Hatching rather than a tint: a loss that reads only as a colour disappears
 *  in a monochrome rendering, and this one is the whole point of the meter. */
const HATCH =
  "repeating-linear-gradient(45deg, currentColor 0 1px, transparent 1px 5px)";

/**
 * A figure whose digit columns roll to their new value on `snap` — one crisp
 * overshoot, the physics of an indicator changing position. Hidden from
 * assistive technology, which reads the meter's sentence instead.
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
              {DIGITS.map((face) => (
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
 * Two bars on one scale: what the position would be worth had you held it, and
 * what it is worth inside the pool. The shortfall between the bar ends is drawn
 * as hatching, and it fills on `glide` as prices diverge — one quantity settling
 * over 450ms — while the percentage rolls its digits on `snap`.
 *
 * The arithmetic is the pool's own: for a price ratio `r` since entry a pooled
 * position is worth `2√r ÷ (1 + r)` of the held one, so the gap is derived
 * rather than handed in, and fees are netted off it honestly — when they cover
 * the shortfall the net line turns success, but the hatching stays, because the
 * divergence still happened. Hovering the gap or pressing the Difference row
 * opens a breakdown whose height is measured rather than reserved, and Escape
 * closes it. Under reduced motion the gap still fills and the figures still
 * change, on a fast tween with no overshoot.
 */
export function ImpermanentMeter({
  ref,
  deposit,
  priceRatio = 1,
  feesEarned = 0,
  pair = ["A", "B"],
  format = defaultFormat,
  warnAt = 0.02,
  dangerAt = 0.06,
  open,
  defaultOpen = false,
  onOpenChange,
  label,
  className,
  "aria-label": ariaLabel,
}: ImpermanentMeterProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const panelId = `${baseId}-panel`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
  const isControlled = open !== undefined;
  const pinned = isControlled ? open : uncontrolled;
  const [hovered, setHovered] = React.useState(false);
  // Hover previews on top of the pin without disturbing it.
  const shown = pinned || hovered;

  const setPinned = (next: boolean) => {
    if (next === pinned) return;
    if (!isControlled) setUncontrolled(next);
    onOpenChange?.(next);
  };

  const ratio = Math.max(priceRatio, 0.000001);
  const held = (deposit * (1 + ratio)) / 2;
  const pooled = deposit * Math.sqrt(ratio);
  const gap = Math.max(held - pooled, 0);
  const shortfall = held > 0 ? gap / held : 0;
  const net = feesEarned - gap;

  const poolPercent = held > 0 ? Math.min(100, (pooled / held) * 100) : 100;
  const gapPercent = Math.max(0, 100 - poolPercent);

  const severity =
    shortfall <= 0.0001
      ? "None"
      : shortfall < warnAt
        ? "Slight"
        : shortfall < dangerAt
          ? "Notable"
          : "Heavy";
  const tone =
    shortfall < warnAt
      ? "text-ink-3"
      : shortfall < dangerAt
        ? "text-warn"
        : "text-danger";

  const barTransition = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };

  // Measured, never reserved: the panel is only ever as tall as its own rows.
  const panelInnerRef = React.useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = React.useState(0);
  React.useEffect(() => {
    const node = panelInnerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const next = node.offsetHeight;
      setPanelHeight((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const rows: [string, string, string?][] = [
    ["Held", format(held), `${pair[0]} and ${pair[1]} kept in the wallet`],
    ["Pooled", format(pooled), "Position value in the pool"],
    ["Difference", `−${format(gap)}`, "What the pool cost against holding"],
    ["Fees", `+${format(feesEarned)}`, "Taken since entry"],
    [
      "Net",
      `${net >= 0 ? "+" : "−"}${format(Math.abs(net))}`,
      "Fees against the difference",
    ],
  ];

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        {label ? (
          <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
            {label}
          </span>
        ) : null}
        <span
          className={cn(
            "flex shrink-0 items-center gap-1.5 font-mono text-xs font-medium",
            tone,
          )}
        >
          <span className="text-[10px] tracking-[0.08em] uppercase">
            {severity}
          </span>
          <span aria-hidden>
            −
            <RollingFigure
              value={percents.format(shortfall * 100)}
              motionSafe={motionSafe}
            />
            %
          </span>
        </span>
      </div>

      <div
        className="relative grid grid-cols-[3.25rem_1fr] items-center gap-x-2 gap-y-1.5"
        aria-hidden
      >
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Held
        </span>
        <span className="h-3 overflow-hidden rounded-1 bg-surface-2">
          <span className="block h-full w-full rounded-1 bg-hairline-strong" />
        </span>

        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Pooled
        </span>
        <span className="h-3 overflow-hidden rounded-1 bg-surface-2">
          <motion.span
            className="block h-full rounded-1 bg-cobalt-bright"
            initial={false}
            animate={{ width: `${poolPercent}%` }}
            transition={barTransition}
          />
        </span>

        {/* The shortfall, spanning both bars so it reads as the space between
            them rather than a bar of its own. */}
        <motion.span
          className={cn(
            "pointer-events-none col-start-2 row-span-2 row-start-1 self-stretch justify-self-end rounded-1 border-l",
            shortfall < warnAt
              ? "border-hairline-strong text-ink-3"
              : shortfall < dangerAt
                ? "border-warn text-warn"
                : "border-danger text-danger",
          )}
          style={{ backgroundImage: HATCH }}
          initial={false}
          animate={{ width: `${gapPercent}%` }}
          transition={barTransition}
        />

        {/* A pointer shortcut on top of the real control below; the same
            breakdown is one Tab and one Enter away, so nothing lives here only. */}
        <span
          className="col-start-2 row-span-2 row-start-1 cursor-pointer self-stretch justify-self-end"
          style={{ width: `max(${gapPercent}%, 2rem)` }}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          onClick={() => setPinned(!pinned)}
        />
      </div>

      <div className="flex items-baseline justify-between gap-2 font-mono text-[11px] tabular-nums">
        <span>
          {format(held)}
          <span className="ml-1 text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            held
          </span>
        </span>
        <span>
          {format(pooled)}
          <span className="ml-1 text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            pooled
          </span>
        </span>
      </div>

      {/* The control and its panel share one container with no gap: a flex gap
          around a collapsed panel is dead space held for a state that is not
          showing. */}
      <div className="flex flex-col">
        <button
          type="button"
          aria-expanded={pinned}
          aria-controls={panelId}
          aria-label={`Difference against holding, ${format(gap)}`}
          onClick={() => setPinned(!pinned)}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || !pinned) return;
            event.preventDefault();
            setPinned(false);
          }}
          className={cn(
            "flex h-8 w-full items-center justify-between gap-2 rounded-2 border border-hairline bg-surface-2 px-2.5 text-xs font-medium transition-colors outline-none hover:bg-accent",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <span className="min-w-0 truncate">Difference</span>
          <span className="flex shrink-0 items-center gap-1.5">
            <span className={cn("font-mono tabular-nums", tone)}>
              −{format(gap)}
            </span>
            <motion.svg
              viewBox="0 0 16 16"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3.5 shrink-0 text-ink-3"
              style={{ originX: 0.5, originY: 0.5 }}
              initial={false}
              animate={{ rotate: pinned ? 180 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              <path d="m4 6 4 4 4-4" />
            </motion.svg>
          </span>
        </button>

        <motion.div
          id={panelId}
          aria-hidden={!shown}
          className="overflow-hidden"
          initial={false}
          animate={{ height: shown ? panelHeight : 0, opacity: shown ? 1 : 0 }}
          transition={
            motionSafe
              ? { ...springs.glide, opacity: { duration: durations.fast } }
              : { duration: durations.fast, ease: easings.move }
          }
        >
          <div ref={panelInnerRef} className="pt-2.5">
            <dl className="flex flex-col gap-1 border-t border-hairline pt-2.5 text-[11px]">
              {rows.map(([term, value, note]) => (
                <div
                  key={term}
                  className="flex items-baseline justify-between gap-3"
                >
                  <dt className="min-w-0 truncate text-ink-3" title={note}>
                    {term}
                  </dt>
                  <dd
                    className={cn(
                      "shrink-0 font-mono tabular-nums",
                      term === "Net"
                        ? net >= 0
                          ? "text-success"
                          : tone
                        : "text-foreground",
                    )}
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </motion.div>
      </div>

      <span
        role="meter"
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Number((shortfall * 100).toFixed(2))}
        aria-valuetext={`${percents.format(shortfall * 100)} percent below holding: ${format(
          pooled,
        )} pooled against ${format(held)} held, ${
          net >= 0 ? "net positive" : "net negative"
        } ${format(Math.abs(net))} after fees`}
        className="sr-only"
      />
    </div>
  );
}
