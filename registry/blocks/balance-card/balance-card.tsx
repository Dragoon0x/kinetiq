"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import { ArrowDownLeft, ArrowUpRight, Eye, EyeOff, Repeat } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { Readout } from "@/registry/ui/readout";
import { cn } from "@/registry/lib/utils";

export type BalanceActivity = {
  id: string;
  label: string;
  amount: string;
  time: string;
};

export type BalanceCardProps = {
  balance: number;
  format?: (value: number) => string;
  /** Sparkline series, oldest → newest. */
  series?: number[];
  delta?: { value: string; direction: "up" | "down" };
  activity?: BalanceActivity[];
  onAction?: (action: "send" | "receive" | "convert") => void;
  defaultHidden?: boolean;
  title?: string;
  className?: string;
};

const ACTIONS = [
  { id: "send", label: "Send", icon: ArrowUpRight },
  { id: "receive", label: "Receive", icon: ArrowDownLeft },
  { id: "convert", label: "Convert", icon: Repeat },
] as const;

function sparklinePath(series: number[], width: number, height: number) {
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  return series
    .map((value, index) => {
      const x = (index / (series.length - 1)) * width;
      const y = height - 4 - ((value - min) / span) * (height - 8);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/**
 * A balance with a private side: the numeral carry-rolls, the privacy eye
 * blurs it, a sparkline draws itself on mount, and the details flip lands
 * the whole card on its back face — where the activity list cascades in.
 */
export function BalanceCard({
  balance,
  format = (v) =>
    v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  series,
  delta,
  activity = [],
  onAction,
  defaultHidden = false,
  title = "Balance",
  className,
}: BalanceCardProps) {
  const motionSafe = useMotionSafe();
  const [hidden, setHidden] = React.useState(defaultHidden);
  const [flipped, setFlipped] = React.useState(false);

  const face =
    "border-border bg-card absolute inset-0 flex flex-col rounded-4 border p-5 [backface-visibility:hidden]";

  return (
    <div
      className={cn("relative h-64 w-full max-w-sm", className)}
      style={{ perspective: 1000 }}
    >
      <motion.div
        className="relative size-full"
        style={{ transformStyle: "preserve-3d" }}
        animate={
          motionSafe
            ? { rotateY: flipped ? 180 : 0 }
            : { rotateY: flipped ? 180 : 0, transition: { duration: 0 } }
        }
        transition={motionSafe ? springs.snap : { duration: 0 }}
      >
        {/* front face */}
        <div
          className={face}
          aria-hidden={flipped}
          // The hidden face must not trap pointer or tab focus.
          style={{ pointerEvents: flipped ? "none" : "auto" }}
          // @ts-expect-error inert is a valid DOM attribute not yet in the React types used here
          inert={flipped ? "" : undefined}
        >
          <div className="flex items-start justify-between">
            <p className="text-muted-foreground font-mono text-[10px] tracking-[0.08em] uppercase">
              {title}
            </p>
            <button
              type="button"
              aria-pressed={hidden}
              aria-label={hidden ? "Show balance" : "Hide balance"}
              onClick={() => setHidden((h) => !h)}
              className="text-muted-foreground hover:text-foreground rounded-1 p-1 transition-colors"
            >
              {hidden ? (
                <EyeOff aria-hidden className="size-4" />
              ) : (
                <Eye aria-hidden className="size-4" />
              )}
            </button>
          </div>

          <div className="mt-1 flex items-baseline gap-2">
            <motion.div
              animate={{ filter: hidden ? "blur(8px)" : "blur(0px)" }}
              transition={{ duration: durations.base, ease: easings.move }}
              aria-hidden={hidden}
            >
              <Readout value={balance} format={format} size="xl" delta={delta} />
            </motion.div>
            {hidden ? <span className="sr-only">Balance hidden</span> : null}
          </div>

          {series && series.length > 1 ? (
            <svg
              viewBox="0 0 240 48"
              aria-hidden
              className="mt-3 h-12 w-full"
              preserveAspectRatio="none"
            >
              <motion.path
                d={sparklinePath(series, 240, 48)}
                fill="none"
                stroke="var(--signal, var(--primary))"
                strokeWidth={1.5}
                initial={motionSafe ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={motionSafe ? springs.glide : { duration: 0 }}
              />
            </svg>
          ) : null}

          <div className="mt-auto flex items-center justify-between gap-2">
            <div className="flex gap-2">
              {ACTIONS.map((action) => (
                <motion.button
                  key={action.id}
                  type="button"
                  onClick={() => onAction?.(action.id)}
                  whileTap={motionSafe ? { scaleY: 0.94, scaleX: 1.03 } : undefined}
                  transition={springs.flick}
                  className="border-input hover:bg-accent flex items-center gap-1.5 rounded-2 border px-2.5 py-1.5 text-xs font-medium transition-colors"
                >
                  <action.icon aria-hidden className="size-3.5" />
                  {action.label}
                </motion.button>
              ))}
            </div>
            <button
              type="button"
              aria-expanded={flipped}
              onClick={() => setFlipped(true)}
              className="text-muted-foreground hover:text-foreground text-xs font-medium transition-colors"
            >
              Details →
            </button>
          </div>
        </div>

        {/* back face */}
        <div
          className={face}
          style={{
            transform: "rotateY(180deg)",
            pointerEvents: flipped ? "auto" : "none",
          }}
          aria-hidden={!flipped}
          // @ts-expect-error inert is a valid DOM attribute not yet in the React types used here
          inert={flipped ? undefined : ""}
        >
          <div className="flex items-start justify-between">
            <p className="text-muted-foreground font-mono text-[10px] tracking-[0.08em] uppercase">
              Last activity
            </p>
            <button
              type="button"
              onClick={() => setFlipped(false)}
              className="text-muted-foreground hover:text-foreground text-xs font-medium transition-colors"
            >
              ← Back
            </button>
          </div>
          <ul className="mt-3 space-y-1">
            <AnimatePresence>
              {flipped
                ? activity.slice(0, 4).map((entry, index) => (
                    <motion.li
                      key={entry.id}
                      initial={
                        motionSafe
                          ? { opacity: 0, y: 8 }
                          : { opacity: 0 }
                      }
                      animate={{
                        opacity: 1,
                        y: 0,
                        transition: motionSafe
                          ? {
                              ...springs.glide,
                              delay:
                                0.15 + index * cascade(Math.min(activity.length, 4)),
                            }
                          : { duration: durations.fast },
                      }}
                      exit={{ opacity: 0, transition: { duration: durations.fast } }}
                      className="border-border flex items-baseline justify-between border-b pb-1.5 text-sm last:border-0"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {entry.label}
                        </span>
                        <span className="text-muted-foreground font-mono text-[10px]">
                          {entry.time}
                        </span>
                      </span>
                      <span className="font-mono text-xs tabular-nums">
                        {entry.amount}
                      </span>
                    </motion.li>
                  ))
                : null}
            </AnimatePresence>
          </ul>
        </div>
      </motion.div>
    </div>
  );
}
