"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SamplingCandidate = {
  token: string;
  /** The model's raw score for this token. */
  logit: number;
  /** Already in the context; the repetition penalty applies. */
  seen?: boolean;
};

export type SamplingPick = {
  token: string;
  /** Rounded to six decimals. */
  probability: number;
  /** 1 is the most likely token. */
  rank: number;
};

export type SamplingParams = {
  temperature: number;
  penalty: number;
  topP: number;
  seed: number;
};

export type SamplingRow = SamplingPick & {
  /** Length relative to the top bar, 0–1, rounded to three decimals. */
  share: number;
  /** Outside the nucleus: never drawn from. */
  cut: boolean;
  picked: boolean;
};

export type SamplingGraphProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** At most a dozen rows read well. */
  candidates: SamplingCandidate[];
  /** Softmax temperature; clamped to 0.05 or more. @default 1 */
  temperature?: number;
  /** Divides the logit of `seen` tokens; 1 is off. @default 1 */
  penalty?: number;
  /** Nucleus share; tokens past it are cut. @default 1 */
  topP?: number;
  /** Seeds the draw that picks the token. @default 1 */
  seed?: number;
  /** Fires from the settle timer once the parameters have been still for 500ms. */
  onSettle?: (pick: SamplingPick) => void;
  /** Names the chart. */
  label: string;
  className?: string;
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
/** How long the parameters must be still before the pick is spoken. */
const SETTLE_MS = 500;
const round3 = (n: number) => Number(n.toFixed(3));
const round6 = (n: number) => Number(n.toFixed(6));

/** Cut is drawn, not merely dimmed — hatching survives both themes and colour blindness. */
const HATCH =
  "repeating-linear-gradient(-45deg, var(--hairline-strong) 0 1px, transparent 1px 5px)";

/** A seeded uniform in [0, 1): integer arithmetic only, so it agrees everywhere. */
const uniform = (seed: number): number => {
  let a = (Math.floor(seed) + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  a = (t ^ (t >>> 14)) >>> 0;
  return a / 4294967296;
};

/**
 * The distribution the chart draws: softmax at `temperature` after the
 * repetition penalty, sorted, cut at `topP`, and one token drawn by a seeded
 * walk over the nucleus. Exported so a host can read the same pick the chart
 * shows without waiting for the settle.
 */
export function sampleDistribution(
  candidates: SamplingCandidate[],
  params: SamplingParams,
): SamplingRow[] {
  const t = Math.max(0.05, params.temperature);
  const pen = Math.max(1, params.penalty);
  const scaled = candidates.map((candidate) => {
    const logit = candidate.seen
      ? candidate.logit > 0
        ? candidate.logit / pen
        : candidate.logit * pen
      : candidate.logit;
    return logit / t;
  });
  const top = Math.max(...scaled, -Infinity);
  const weights = scaled.map((z) => Math.exp(z - top));
  const total = weights.reduce((sum, w) => sum + w, 0) || 1;
  const order = candidates
    .map((candidate, index) => ({
      token: candidate.token,
      probability: round6((weights[index] ?? 0) / total),
      index,
    }))
    .sort((a, b) => b.probability - a.probability || a.index - b.index);

  const topP = Math.min(1, Math.max(0, params.topP));
  let cumulative = 0;
  let nucleus = 0;
  for (const row of order) {
    nucleus += 1;
    cumulative += row.probability;
    if (cumulative >= topP) break;
  }
  const inside = order.slice(0, nucleus);
  const mass = inside.reduce((sum, row) => sum + row.probability, 0) || 1;
  const u = uniform(params.seed) * mass;
  let walked = 0;
  let picked = inside.length - 1;
  for (let i = 0; i < inside.length; i += 1) {
    walked += inside[i]?.probability ?? 0;
    if (u < walked) {
      picked = i;
      break;
    }
  }
  const max = order[0]?.probability || 1;
  return order.map((row, rank) => ({
    token: row.token,
    probability: row.probability,
    rank: rank + 1,
    share: round3(row.probability / max),
    cut: rank >= nucleus,
    picked: rank === picked,
  }));
}

/** Digits that roll on `snap`; hidden because the row's text carries the percentage. */
function RollingNumber({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {value.split("").map((char, index) => {
        const digit = Math.max(
          0,
          DIGITS.indexOf(char as (typeof DIGITS)[number]),
        );
        return (
          <span
            // Keyed from the right so the units column keeps its identity.
            key={value.length - index}
            className="relative inline-block h-[1.25em] w-[1ch] overflow-hidden"
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
                  className="flex h-[1.25em] items-center justify-center"
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
 * A bar chart of next-token probabilities. The host's logits go through a
 * softmax at `temperature`, a repetition `penalty` on tokens already seen,
 * and a `topP` nucleus that cuts the tail; the rows are keyed by token and
 * sorted by probability, so a parameter change that reorders them is a FLIP
 * `layout` move on `glide` — a reorder is a layout shift, no overshoot —
 * while each bar scales from the left on `glide` to its share of the top bar
 * and the percentages roll on `snap`. Cut tokens dim under a hatch with the
 * word "cut". One token is drawn by a seeded walk over the nucleus and its
 * bar lights: the fill turns signal and a pip lands on `flick`.
 *
 * The chart takes no input; every parameter is a prop the host's own
 * controls drive. A settle timer fires `onSettle` and speaks the pick once
 * the parameters have been still for half a second — never per tick — and
 * holds while the document is hidden. Under reduced motion rows swap into
 * their new order without travelling, bars tween, digits swap and the light
 * is a colour swap.
 */
export function SamplingGraph({
  ref,
  candidates,
  temperature = 1,
  penalty = 1,
  topP = 1,
  seed = 1,
  onSettle,
  label,
  className,
}: SamplingGraphProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();
  const [announcement, setAnnouncement] = React.useState("");

  const rows = React.useMemo(
    () => sampleDistribution(candidates, { temperature, penalty, topP, seed }),
    [candidates, temperature, penalty, topP, seed],
  );
  const pick = rows.find((row) => row.picked);
  const pickToken = pick?.token ?? "";
  const pickProbability = pick?.probability ?? 0;
  const pickRank = pick?.rank ?? 0;
  const pickPercent = Math.round(pickProbability * 100);

  // A hidden tab holds the timer rather than speaking to no one.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // The settle timer restarts on every change; the ref holds what was last
  // spoken, so a re-render with nothing new never speaks and the mount pick
  // is never announced to a reader who changed nothing.
  const onSettleRef = React.useRef(onSettle);
  React.useEffect(() => {
    onSettleRef.current = onSettle;
  });
  const spoken = React.useRef({
    token: pickToken,
    probability: pickProbability,
  });
  React.useEffect(() => {
    if (!visible) return;
    const last = spoken.current;
    if (last.token === pickToken && last.probability === pickProbability)
      return;
    const timer = window.setTimeout(() => {
      spoken.current = { token: pickToken, probability: pickProbability };
      setAnnouncement(`Picked ${pickToken}, ${pickPercent} percent`);
      onSettleRef.current?.({
        token: pickToken,
        probability: pickProbability,
        rank: pickRank,
      });
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [visible, pickToken, pickProbability, pickPercent, pickRank]);

  const barTransition = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.move };
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex h-6 items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Next
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={pickToken}
              className="tracking-normal text-signal normal-case"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={fade}
            >
              {pickToken}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>

      <ol role="list" aria-labelledby={labelId} className="flex flex-col gap-1">
        {rows.map((row) => {
          const percent = Math.round(row.probability * 100);
          return (
            <motion.li
              key={row.token}
              layout={motionSafe ? "position" : false}
              transition={motionSafe ? springs.glide : { duration: 0 }}
              aria-current={row.picked ? "true" : undefined}
              className="grid h-7 grid-cols-[8px_minmax(0,4.5rem)_1fr_4.5rem] items-center gap-2"
            >
              <span
                aria-hidden
                className="relative flex size-2 items-center justify-center"
              >
                <motion.span
                  className="size-1.5 rounded-full bg-signal"
                  initial={false}
                  animate={{
                    opacity: row.picked ? 1 : 0,
                    scale: row.picked || !motionSafe ? 1 : 0.4,
                  }}
                  // The pip lands on flick: a confirmation, over in a beat.
                  transition={
                    motionSafe ? { ...springs.flick, opacity: fade } : fade
                  }
                />
              </span>
              <span
                title={row.token}
                className={cn(
                  "truncate font-mono text-xs transition-colors",
                  row.picked
                    ? "text-foreground"
                    : row.cut
                      ? "text-ink-3"
                      : "text-ink-2",
                )}
              >
                {row.token}
              </span>
              <span
                aria-hidden
                style={{ backgroundImage: row.cut ? HATCH : undefined }}
                className="relative h-2 overflow-hidden rounded-full bg-hairline-strong"
              >
                <motion.span
                  className={cn(
                    "absolute inset-y-0 left-0 w-full origin-left rounded-full transition-colors duration-300",
                    row.picked
                      ? "bg-signal"
                      : row.cut
                        ? "bg-ink-3/40"
                        : "bg-cobalt-bright",
                  )}
                  initial={false}
                  animate={{ scaleX: row.share }}
                  transition={barTransition}
                />
              </span>
              <span className="flex items-center justify-end gap-1.5 font-mono text-[11px]">
                <AnimatePresence initial={false}>
                  {row.cut ? (
                    <motion.span
                      key="cut"
                      className="rounded-1 border border-hairline px-1 text-[9px] tracking-[0.08em] text-ink-3 uppercase"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={fade}
                    >
                      cut
                    </motion.span>
                  ) : null}
                </AnimatePresence>
                <span
                  className={cn(
                    "flex items-center tabular-nums transition-colors",
                    row.picked ? "text-foreground" : "text-ink-3",
                  )}
                >
                  <RollingNumber
                    value={String(percent)}
                    motionSafe={motionSafe}
                  />
                  %
                  <span className="sr-only">
                    {" "}
                    {percent} percent{row.cut ? ", cut" : ""}
                    {row.picked ? ", picked" : ""}
                  </span>
                </span>
              </span>
            </motion.li>
          );
        })}
      </ol>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
