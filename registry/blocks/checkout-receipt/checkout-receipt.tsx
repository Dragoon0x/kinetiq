"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";

export type ReceiptItem = {
  name: string;
  price: number;
};

export type CheckoutReceiptProps = {
  /** Line items summed into the total. */
  items?: ReceiptItem[];
  /** Currency symbol prefixed to every price. */
  currency?: string;
  /** Fires once when the hold-to-pay button confirms. */
  onPay?: () => void;
  className?: string;
};

const DEFAULT_ITEMS: ReceiptItem[] = [
  { name: "Field Kit MK-II", price: 149.0 },
  { name: "Calibration cert", price: 29.0 },
  { name: "Priority bench slot", price: 12.5 },
];

const RECEIPT_NO = "KQ-10442";

/** Seconds between printed receipt lines — the thermal-printer cadence. */
const PRINT_STEP_S = 0.12;

/** Fake barcode derived deterministically from the receipt number (SSR safe). */
const BARCODE_WIDTHS: number[] = (() => {
  let hash = 5381;
  for (let i = 0; i < RECEIPT_NO.length; i += 1) {
    hash = (Math.imul(hash, 33) + RECEIPT_NO.charCodeAt(i)) | 0;
  }
  const widths: number[] = [];
  for (let i = 0; i < 32; i += 1) {
    hash = (Math.imul(hash, 33) + i) | 0;
    widths.push(1 + ((hash >>> 0) % 3));
  }
  return widths;
})();

type Stage = "idle" | "printing" | "printed";

/**
 * Payment that prints its proof. Holding the pay button fills its gauge; on
 * confirm the total clears and rolls back up (`Readout` carry-roll), then a
 * receipt feeds out of a slot line by line — height grows on `drift`, each
 * line drops in 120ms apart on `flick`. When the tape finishes it gives one
 * tear-off wiggle and a PAID stamp slams down on `recoil`. Reduced motion
 * prints the whole receipt in a single fade and fades the stamp in.
 */
export function CheckoutReceipt({
  items = DEFAULT_ITEMS,
  currency = "$",
  onPay,
  className,
}: CheckoutReceiptProps) {
  const motionSafe = useMotionSafe();
  const [stage, setStage] = React.useState<Stage>("idle");
  const [paidAt, setPaidAt] = React.useState<string | null>(null);
  /** Post-confirm display value; null tracks the live total. */
  const [rolled, setRolled] = React.useState<number | null>(null);
  const rollTimer = React.useRef<number | null>(null);

  const total = items.reduce((sum, item) => sum + item.price, 0);
  const shownTotal = rolled ?? total;
  const money = (value: number) => `${currency}${value.toFixed(2)}`;
  const lineCount = items.length + 5;

  React.useEffect(
    () => () => {
      if (rollTimer.current !== null) window.clearTimeout(rollTimer.current);
    },
    [],
  );

  // The receipt is "done printing" once the last line has settled.
  React.useEffect(() => {
    if (stage !== "printing") return;
    const delay = motionSafe ? lineCount * PRINT_STEP_S * 1000 + 500 : 300;
    const timer = window.setTimeout(() => setStage("printed"), delay);
    return () => window.clearTimeout(timer);
  }, [stage, motionSafe, lineCount]);

  const handlePay = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    setPaidAt(
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    );
    setStage("printing");
    // Final roll: the register clears to zero, then the total rolls back up.
    setRolled(0);
    rollTimer.current = window.setTimeout(() => setRolled(total), 80);
    onPay?.();
  };

  const reset = () => {
    if (rollTimer.current !== null) window.clearTimeout(rollTimer.current);
    setStage("idle");
    setPaidAt(null);
    setRolled(null);
  };

  const receiptLines: { key: string; node: React.ReactNode }[] = [
    {
      key: "order",
      node: (
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-medium tracking-[0.08em] uppercase">
            Kinetiq Supply
          </span>
          <span className="text-muted-foreground shrink-0">
            NO. {RECEIPT_NO}
          </span>
        </div>
      ),
    },
    ...items.map((item) => ({
      key: `item-${item.name}`,
      node: (
        <div className="text-muted-foreground flex items-baseline justify-between gap-3">
          <span className="truncate uppercase">{item.name}</span>
          <span className="shrink-0 tabular-nums">{money(item.price)}</span>
        </div>
      ),
    })),
    {
      key: "rule",
      node: <div className="border-border border-t border-dashed" />,
    },
    {
      key: "total",
      node: (
        <div className="flex items-baseline justify-between gap-3 font-semibold">
          <span className="tracking-[0.08em] uppercase">Total</span>
          <span className="tabular-nums">{money(total)}</span>
        </div>
      ),
    },
    {
      key: "time",
      node: <div className="text-muted-foreground tabular-nums">{paidAt}</div>,
    },
    {
      key: "barcode",
      node: (
        <div
          aria-hidden
          className="flex h-8 items-stretch justify-center gap-px pt-1"
        >
          {BARCODE_WIDTHS.map((width, index) => (
            <span key={index} className="bg-foreground" style={{ width }} />
          ))}
        </div>
      ),
    },
  ];

  return (
    <div className={cn("w-full max-w-sm", className)}>
      <div className="border-border bg-card rounded-3 border p-4">
        <p className="text-muted-foreground font-mono text-[11px] font-medium tracking-[0.08em] uppercase">
          Checkout
        </p>

        <dl className="mt-3 space-y-2">
          {items.map((item) => (
            <div
              key={item.name}
              className="flex items-baseline justify-between gap-3"
            >
              <dt className="min-w-0 truncate text-sm">{item.name}</dt>
              <dd className="text-muted-foreground shrink-0 font-mono text-sm tabular-nums">
                {money(item.price)}
              </dd>
            </div>
          ))}
        </dl>

        <div className="border-border mt-3 flex items-baseline justify-between gap-3 border-t pt-3">
          <span className="text-muted-foreground font-mono text-[11px] font-medium tracking-[0.08em] uppercase">
            Total
          </span>
          <Readout
            size="lg"
            value={shownTotal}
            rollOn="increase"
            format={money}
            className="font-semibold"
          />
        </div>

        <PressureButton
          className="mt-4 w-full"
          variant={stage === "printed" ? "ghost" : "solid"}
          holdToConfirm={stage === "idle" ? 900 : undefined}
          onConfirm={handlePay}
          onClick={stage === "printed" ? reset : undefined}
        >
          {stage === "idle"
            ? "Hold to pay"
            : stage === "printing"
              ? "Printing receipt…"
              : "New order"}
        </PressureButton>
      </div>

      {/* printer slot */}
      <div aria-hidden className="bg-muted mx-auto mt-2 h-1 w-[94%] rounded-full" />

      <AnimatePresence>
        {stage !== "idle" && (
          <motion.div
            key="receipt"
            className="mx-auto w-[90%] overflow-hidden"
            initial={motionSafe ? { height: 0 } : { opacity: 0 }}
            animate={motionSafe ? { height: "auto" } : { opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.base) }}
            transition={
              motionSafe
                ? springs.drift
                : { duration: durations.fast, ease: easings.enter }
            }
          >
            <motion.div
              className="border-border bg-background relative rounded-b-2 border border-t-0 border-dashed p-3 font-mono text-xs"
              animate={
                stage === "printed" && motionSafe
                  ? { rotate: [0, -1.5, 1.5, 0] }
                  : { rotate: 0 }
              }
              transition={springs.flick}
            >
              <div className="space-y-1.5">
                {receiptLines.map((line, index) => (
                  <motion.div
                    key={line.key}
                    initial={motionSafe ? { opacity: 0, y: -4 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={
                      motionSafe
                        ? {
                            y: { ...springs.flick, delay: index * PRINT_STEP_S },
                            opacity: {
                              duration: durations.fast,
                              ease: easings.enter,
                              delay: index * PRINT_STEP_S,
                            },
                          }
                        : { duration: 0 }
                    }
                  >
                    {line.node}
                  </motion.div>
                ))}
              </div>

              {stage === "printed" && (
                <motion.div
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                  initial={
                    motionSafe
                      ? { opacity: 0, scale: 1.4, rotate: -12 }
                      : { opacity: 0 }
                  }
                  animate={
                    motionSafe
                      ? { opacity: 1, scale: 1, rotate: -12 }
                      : { opacity: 1 }
                  }
                  transition={
                    motionSafe
                      ? {
                          ...springs.recoil,
                          opacity: {
                            duration: durations.fast,
                            ease: easings.enter,
                          },
                        }
                      : { duration: durations.fast }
                  }
                >
                  <span className="border-primary text-primary bg-primary/10 rounded-1 border-2 px-3 py-0.5 font-mono text-base font-bold tracking-[0.25em] uppercase">
                    Paid
                  </span>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <span role="status" className="sr-only">
        {stage === "printed"
          ? `Payment complete. Receipt no. ${RECEIPT_NO}.`
          : ""}
      </span>
    </div>
  );
}
