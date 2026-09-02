"use client";

import * as React from "react";

import { motion } from "motion/react";
import { ArrowRight, KeyRound } from "lucide-react";

import {
  BalanceCard,
  type BalanceActivity,
} from "@/registry/blocks/balance-card/balance-card";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { RevealStagger } from "@/registry/ui/reveal-stagger";
import { StatusSeal, type StatusSealVariant } from "@/registry/ui/status-seal";

export type SettlementRow = {
  id: string;
  /** Short mono ticker for the settling network. */
  asset: string;
  label: string;
  amount: string;
  state: "settled" | "pending" | "signing";
};

type ProofFigure = { value: number; label: string; suffix?: string };

export type HeroBalanceDeskProps = {
  eyebrow?: string;
  /** Two lines of headline; each renders on its own line. */
  headline?: [string, string];
  copy?: string;
  cta?: string;
  onCta?: () => void;
  secondary?: string;
  onSecondary?: () => void;
  balance?: number;
  series?: number[];
  rows?: SettlementRow[];
  proofs?: ProofFigure[];
  brand?: string;
  className?: string;
};

const DEFAULT_SERIES: number[] = [
  41200, 42800, 41950, 43600, 44100, 43700, 45300, 46820,
];

const DEFAULT_ACTIVITY: BalanceActivity[] = [
  { id: "a1", label: "Tideway settlement", amount: "+1,240.00", time: "07:12" },
  { id: "a2", label: "Northwater transfer", amount: "-86.50", time: "09:40" },
  { id: "a3", label: "Vault rebalance", amount: "+512.00", time: "11:05" },
  { id: "a4", label: "Cold storage sweep", amount: "+3,004.10", time: "13:30" },
];

const DEFAULT_ROWS: SettlementRow[] = [
  {
    id: "r1",
    asset: "TDW",
    label: "Tideway settlement",
    amount: "1,240.00 units",
    state: "settled",
  },
  {
    id: "r2",
    asset: "NWR",
    label: "Northwater transfer",
    amount: "86.50 units",
    state: "pending",
  },
  {
    id: "r3",
    asset: "TDW",
    label: "Vault rebalance",
    amount: "512.00 units",
    state: "signing",
  },
  {
    id: "r4",
    asset: "NWR",
    label: "Cold storage sweep",
    amount: "3,004.10 units",
    state: "settled",
  },
];

const DEFAULT_PROOFS: ProofFigure[] = [
  { value: 128400, label: "units in custody" },
  { value: 6, label: "networks bridged" },
  { value: 1.8, label: "avg settlement time", suffix: "s" },
];

const ROW_SEAL: Record<
  SettlementRow["state"],
  { variant: StatusSealVariant; label: string }
> = {
  settled: { variant: "success", label: "Settled" },
  pending: { variant: "warn", label: "Pending" },
  signing: { variant: "info", label: "Signing" },
};

/** Milliseconds before the row still pending at mount settles for real. */
const SETTLE_DELAY_MS = 2400;
/** Milliseconds the desk's action status line holds before it clears. */
const ACTION_STATUS_MS = 1800;

/**
 * A self-custody hero: the case for holding your own keys on the left, and
 * on the right the library's own `BalanceCard` seated on a desk, doing hero
 * duty as the product already at work. Beneath the card a settlement list
 * cascades in on mount, and the row still pending when the desk loads
 * settles for real on a fixed timer — a wallet that never settles anything
 * in front of the reader is only a picture of one. A drift wash of the
 * brand color, held low behind the desk, keeps the surface from reading
 * flat, and the copy column arrives on the same cascade as the family.
 *
 * Reduced motion: the copy column resolves in place, the wash never
 * animates, and the settlement rows fade in without stagger or offset; the
 * pending row still settles on its timer regardless, since that is a state
 * change rather than a transition, and the composed card and seals fall
 * back on their own terms.
 */
export function HeroBalanceDesk({
  brand = "Coldbrook",
  eyebrow = `${brand} · vault`,
  headline = ["Own the keys.", "Own the balance."],
  copy = `${brand} holds nothing on your behalf — every unit settles from keys only you carry, moving across Tideway and Northwater on a ledger you can read as plainly as a desk drawer.`,
  cta = "Open a vault",
  onCta,
  secondary = "Read the custody note",
  onSecondary,
  balance = 46820.35,
  series = DEFAULT_SERIES,
  rows = DEFAULT_ROWS,
  proofs = DEFAULT_PROOFS,
  className,
}: HeroBalanceDeskProps) {
  const motionSafe = useMotionSafe();
  const headingId = React.useId();
  const [settlementRows, setSettlementRows] =
    React.useState<SettlementRow[]>(rows);
  const [actionStatus, setActionStatus] = React.useState<string | null>(null);
  const actionTimer = React.useRef<number | null>(null);

  // Whichever row is pending when the desk mounts settles for real, once.
  React.useEffect(() => {
    const settleTimer = window.setTimeout(() => {
      setSettlementRows((current) => {
        const pendingIndex = current.findIndex(
          (row) => row.state === "pending",
        );
        if (pendingIndex === -1) return current;
        return current.map((row, index) =>
          index === pendingIndex ? { ...row, state: "settled" as const } : row,
        );
      });
    }, SETTLE_DELAY_MS);
    return () => window.clearTimeout(settleTimer);
  }, []);

  React.useEffect(
    () => () => {
      if (actionTimer.current !== null)
        window.clearTimeout(actionTimer.current);
    },
    [],
  );

  const handleAction = (action: "send" | "receive" | "convert") => {
    if (actionTimer.current !== null) window.clearTimeout(actionTimer.current);
    setActionStatus(`${action} · queued`);
    actionTimer.current = window.setTimeout(() => {
      setActionStatus(null);
    }, ACTION_STATUS_MS);
  };

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative overflow-hidden bg-surface-0", className)}
    >
      <div className="relative mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 px-6 py-20 sm:py-28 lg:grid-cols-2 lg:gap-16">
        <RevealStagger className="flex max-w-xl min-w-0 flex-col items-start gap-5">
          <p className="flex items-center gap-2 text-label text-ink-3">
            <KeyRound className="size-3.5" aria-hidden />
            {eyebrow}
          </p>
          <h1
            id={headingId}
            className="text-4xl leading-[1.06] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl"
          >
            {headline[0]}
            <br />
            {headline[1]}
          </h1>
          <p className="max-w-md text-base leading-relaxed text-ink-2 sm:text-lg">
            {copy}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <PressureButton size="lg" onClick={onCta}>
              {cta}
              <ArrowRight className="size-4" aria-hidden />
            </PressureButton>
            <PressureButton size="lg" variant="outline" onClick={onSecondary}>
              {secondary}
            </PressureButton>
          </div>
          <div className="mt-2 flex flex-wrap items-start gap-6">
            {proofs.map((proof) => (
              <div key={proof.label} className="flex flex-col gap-1">
                <Readout
                  value={proof.value}
                  format={(v) =>
                    `${v.toLocaleString("en-US", { maximumFractionDigits: 1 })}${proof.suffix ?? ""}`
                  }
                  size="md"
                />
                <span className="text-label text-ink-3">{proof.label}</span>
              </div>
            ))}
          </div>
        </RevealStagger>

        {/* The vignette: balance-card seated on a desk, settling for real. */}
        <div className="relative -mx-3 w-[calc(100%+1.5rem)] max-w-lg min-w-0 justify-self-center sm:mx-0 sm:w-full lg:justify-self-end">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-[-15%] bottom-[-20%] -z-10 h-3/4 blur-3xl"
            style={{
              background:
                "radial-gradient(60% 60% at 50% 100%, color-mix(in oklch, var(--primary) 32%, transparent), transparent 72%)",
            }}
          />
          <div className="relative rounded-4 border border-hairline bg-surface-1 p-3 shadow-raised sm:p-5">
            <BalanceCard
              balance={balance}
              // The unit lives in the card's title rather than beside the
              // numeral, so the readout keeps its full size on a phone instead
              // of being clipped by a suffix it cannot wrap.
              format={(v) =>
                v.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              }
              title={`${brand} vault · units`}
              series={series}
              delta={{ value: "+3.1%", direction: "up" }}
              activity={DEFAULT_ACTIVITY}
              onAction={handleAction}
              className="max-w-none"
            />
            <p
              role="status"
              aria-live="polite"
              className="mt-3 h-4 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
            >
              {actionStatus ?? ""}
            </p>

            <div className="mt-4 border-t border-hairline pt-4">
              <p className="mb-3 text-label text-ink-3">{brand} · settlement</p>
              <ul className="flex flex-col gap-2">
                {settlementRows.map((row, index) => {
                  const seal = ROW_SEAL[row.state];
                  return (
                    <motion.li
                      key={row.id}
                      initial={
                        motionSafe ? { opacity: 0, y: 8 } : { opacity: 0 }
                      }
                      animate={{ opacity: 1, y: 0 }}
                      transition={
                        motionSafe
                          ? {
                              ...springs.glide,
                              delay: index * cascade(settlementRows.length),
                            }
                          : { duration: durations.fast, ease: easings.move }
                      }
                      className="flex items-center justify-between gap-3 rounded-2 border border-hairline bg-surface-0 px-3 py-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="hidden shrink-0 rounded-1 border border-hairline-strong px-1.5 py-0.5 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase sm:inline-block">
                          {row.asset}
                        </span>
                        <span className="truncate text-sm font-medium text-ink">
                          {row.label}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="font-mono text-xs text-ink-2 tabular-nums">
                          {row.amount}
                        </span>
                        <StatusSeal
                          variant={seal.variant}
                          live={row.state !== "settled"}
                          className="shrink-0"
                        >
                          {seal.label}
                        </StatusSeal>
                      </div>
                    </motion.li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
