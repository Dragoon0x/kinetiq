"use client";

import * as React from "react";

import { motion } from "motion/react";
import { ArrowDownUp } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { Readout } from "@/registry/ui/readout";
import { Select, type SelectItem } from "@/registry/ui/select";
import { cn } from "@/registry/lib/utils";

export type ExchangeUnit = {
  id: string;
  label: string;
  /** Linear factor to one common base unit. */
  factor: number;
};

export type ExchangeGroup = { label: string; units: ExchangeUnit[] };

export type ExchangePanelProps = {
  /** Flat units or labeled groups (grouped select). */
  units: ExchangeUnit[] | ExchangeGroup[];
  defaultAmount?: number;
  from?: string;
  to?: string;
  onDirectionChange?: (from: string, to: string) => void;
  /** Fraction (0.004 = 0.4%) applied to the converted side. */
  feeRate?: number;
  onChange?: (state: {
    from: string;
    to: string;
    amount: number;
    converted: number;
  }) => void;
  debounceMs?: number;
  className?: string;
};

function isGrouped(
  units: ExchangeUnit[] | ExchangeGroup[],
): units is ExchangeGroup[] {
  return units.length > 0 && "units" in (units[0] as ExchangeGroup);
}

function flatten(units: ExchangeUnit[] | ExchangeGroup[]): ExchangeUnit[] {
  return isGrouped(units) ? units.flatMap((g) => g.units) : units;
}

function toSelectItems(units: ExchangeUnit[] | ExchangeGroup[]): SelectItem[] {
  if (isGrouped(units)) {
    return units.map((group) => ({
      label: group.label,
      options: group.units.map((u) => ({ value: u.id, label: u.label })),
    }));
  }
  return units.map((u) => ({ value: u.id, label: u.label }));
}

/**
 * Two units, one clean swap: the edited side is a live input while the
 * computed side carry-rolls through a Readout after a short debounce.
 * Swapping spins the center button on `recoil` while the two rows slide
 * past each other — transforms only, no DOM reorder, so focus never drops.
 */
export function ExchangePanel({
  units,
  defaultAmount = 1,
  from: fromProp,
  to: toProp,
  onDirectionChange,
  feeRate = 0,
  onChange,
  debounceMs = 200,
  className,
}: ExchangePanelProps) {
  const motionSafe = useMotionSafe();
  const flat = React.useMemo(() => flatten(units), [units]);
  const selectItems = React.useMemo(() => toSelectItems(units), [units]);

  const firstId = flat[0]?.id ?? "";
  const secondId = flat[1]?.id ?? firstId;
  const [from, setFrom] = React.useState(fromProp ?? firstId);
  const [to, setTo] = React.useState(toProp ?? secondId);
  const [amountText, setAmountText] = React.useState(String(defaultAmount));
  /** Which row currently holds authority; the other is always derived. */
  const [swapCount, setSwapCount] = React.useState(0);
  const [settled, setSettled] = React.useState({ amount: defaultAmount });
  const fromInputRef = React.useRef<HTMLInputElement>(null);
  const debounceRef = React.useRef<number | undefined>(undefined);

  React.useEffect(() => () => window.clearTimeout(debounceRef.current), []);

  const factorOf = React.useCallback(
    (id: string) => flat.find((u) => u.id === id)?.factor ?? 1,
    [flat],
  );

  const amount = settled.amount;
  const rate = factorOf(from) / factorOf(to);
  const gross = amount * rate;
  const fee = gross * feeRate;
  const converted = gross - fee;

  const commitAmount = (raw: string) => {
    setAmountText(raw);
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      const parsed = Number.parseFloat(raw);
      const next = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
      setSettled({ amount: next });
      onChange?.({ from, to, amount: next, converted: next * rate - next * rate * feeRate });
    }, debounceMs);
  };

  const swap = () => {
    // Authority transfers with the gesture: the current converted value
    // becomes the new edited amount.
    const nextFrom = to;
    const nextTo = from;
    setFrom(nextFrom);
    setTo(nextTo);
    const nextAmount = Number(converted.toFixed(6));
    setSettled({ amount: nextAmount });
    setAmountText(String(nextAmount));
    setSwapCount((n) => n + 1);
    onDirectionChange?.(nextFrom, nextTo);
    requestAnimationFrame(() => fromInputRef.current?.focus());
  };

  const labelOf = (id: string) => flat.find((u) => u.id === id)?.label ?? id;
  // Rows keep their DOM positions (focus never drops); on swap, each row's
  // CONTENT slides through in the direction the values travelled.
  const swapKey = `${from}->${to}`;

  return (
    <div
      className={cn(
        "border-border bg-card w-full max-w-sm rounded-3 border p-4",
        className,
      )}
    >
      <div className="relative flex flex-col gap-2">
        {/* FROM row */}
        <div className="border-input bg-background overflow-hidden rounded-2 border p-3">
          <motion.div
            key={`from-${swapKey}`}
            initial={
              motionSafe ? { y: distances.step, opacity: 0 } : { opacity: 0 }
            }
            animate={{ y: 0, opacity: 1 }}
            transition={
              motionSafe ? springs.glide : { duration: durations.fast }
            }
          >
            <label className="text-muted-foreground block font-mono text-[10px] tracking-[0.08em] uppercase">
              From amount
              <input
                ref={fromInputRef}
                inputMode="decimal"
                value={amountText}
                onChange={(e) => commitAmount(e.target.value)}
                className="text-foreground mt-1 block w-full bg-transparent font-mono text-xl tabular-nums outline-none"
                aria-label={`From amount in ${labelOf(from)}`}
              />
            </label>
            <div className="mt-2">
              <Select
                items={selectItems}
                value={from}
                onValueChange={(next) => {
                  if (next === to) setTo(from);
                  setFrom(next);
                }}
                label="From unit"
              />
            </div>
          </motion.div>
        </div>

        {/* swap button */}
        <div className="relative z-10 -my-4 flex justify-center">
          <motion.button
            type="button"
            onClick={swap}
            aria-label={`Swap direction — currently converting ${labelOf(from)} to ${labelOf(to)}`}
            animate={{ rotate: swapCount * 180 }}
            transition={motionSafe ? springs.recoil : { duration: 0 }}
            whileTap={motionSafe ? { scale: 0.92 } : undefined}
            className="border-border bg-card hover:bg-accent flex size-9 items-center justify-center rounded-full border shadow-sm transition-colors"
          >
            <ArrowDownUp aria-hidden className="size-4" />
          </motion.button>
        </div>

        {/* TO row */}
        <div className="border-border bg-muted/40 overflow-hidden rounded-2 border p-3">
          <motion.div
            key={`to-${swapKey}`}
            initial={
              motionSafe ? { y: -distances.step, opacity: 0 } : { opacity: 0 }
            }
            animate={{ y: 0, opacity: 1 }}
            transition={
              motionSafe ? springs.glide : { duration: durations.fast }
            }
          >
            <p className="text-muted-foreground font-mono text-[10px] tracking-[0.08em] uppercase">
              To amount
            </p>
            <div className="mt-1">
              <Readout
                value={Number(converted.toFixed(4))}
                format={(v) =>
                  v.toLocaleString("en-US", { maximumFractionDigits: 4 })
                }
                size="lg"
              />
            </div>
            <div className="mt-2">
              <Select
                items={selectItems}
                value={to}
                onValueChange={(next) => {
                  if (next === from) setFrom(to);
                  setTo(next);
                }}
                label="To unit"
              />
            </div>
          </motion.div>
        </div>
      </div>

      {/* rate + fee */}
      <div className="text-muted-foreground mt-3 space-y-1 font-mono text-xs">
        <motion.p
          key={`${from}-${to}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: durations.fast, ease: easings.enter }}
          className="flex justify-between"
        >
          <span>RATE</span>
          <span className="tabular-nums">
            1 {labelOf(from)} ≈ {rate.toLocaleString("en-US", { maximumFractionDigits: 6 })}{" "}
            {labelOf(to)}
          </span>
        </motion.p>
        {feeRate > 0 ? (
          <p className="flex items-center justify-between">
            <span>FEE ({(feeRate * 100).toFixed(2)}%)</span>
            <span className="tabular-nums">
              <Readout
                value={Number(fee.toFixed(4))}
                format={(v) =>
                  v.toLocaleString("en-US", { maximumFractionDigits: 4 })
                }
                size="sm"
              />
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
