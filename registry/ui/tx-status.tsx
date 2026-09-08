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

/** One block sitting on top of the transfer. `height` is the ledger height. */
export type TxStatusBlock = {
  id: string;
  height: number;
  txCount?: number;
};

export type TxStatusProps = {
  ref?: React.Ref<HTMLElement>;
  /** The transfer's identifier. Shown head-and-tail, spoken whole. */
  hash: string;
  /** The transferred amount, printed through `format`. */
  amount: number;
  /** Formats the amount. @default four decimal places */
  format?: (value: number) => string;
  /** Asset ticker printed after the amount. @default "BSN" */
  asset?: string;
  /** Confirming blocks, oldest first. Its length is the confirmation count. */
  blocks?: TxStatusBlock[];
  /** Confirmations needed for finality; also the number of slots drawn. @default 6 */
  threshold?: number;
  /** Marks the transfer as dropped from the queue. Suppresses the stamp. */
  dropped?: boolean;
  /** Heads the amount and names the card. @default "Transfer" */
  label?: string;
  /** Fires from the press that pins or unpins a block. */
  onBlockSelect?: (block: TxStatusBlock | null) => void;
  /** Fires once, when the threshold is first met. */
  onFinal?: (confirmations: number) => void;
  className?: string;
};

const NO_BLOCKS: TxStatusBlock[] = [];

const AMOUNT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
const COUNT = new Intl.NumberFormat("en-US");

const defaultFormat = (value: number): string => AMOUNT.format(value);

/** Tile face: the last three digits of the height, which is what people scan. */
const shortHeight = (height: number): string =>
  String(Math.abs(Math.trunc(height)) % 1000).padStart(3, "0");

/** Keeps a callback out of an effect's dependencies so it cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

type Phase = "pending" | "confirming" | "final" | "dropped";

const PILL: Record<Phase, { text: string; tone: string }> = {
  pending: {
    text: "Pending",
    tone: "border-hairline-strong bg-surface-2 text-ink-2",
  },
  confirming: {
    text: "Confirming",
    tone: "border-hairline-strong bg-cobalt-wash text-cobalt-bright",
  },
  final: {
    text: "Final",
    tone: "border-hairline-strong bg-cobalt-wash text-success",
  },
  dropped: {
    text: "Dropped",
    tone: "border-hairline-strong bg-surface-2 text-danger",
  },
};

/**
 * A transfer, watched until it is settled. Each block that lands takes the next
 * slot in the row: the tile arrives from a `step` to the right on `snap`,
 * because a block landing is an indicator taking its position and snap's single
 * crisp overshoot is that arrival. The track beneath extends on `glide` — a
 * progress quantity settling, not a switch — and the count swaps on `snap` so
 * the number moves with the tile rather than on its own clock.
 *
 * At the threshold the pill stamps: it lands from 1.2× on `recoil`, whose ζ0.53
 * gives the two bounces of a stamp hitting paper, and the check draws inside it
 * on `flick`. A dropped transfer only cross-fades, because a failure must never
 * celebrate.
 *
 * Landed tiles are buttons on a roving tabindex: Left and Right step, Home and
 * End jump, Enter or Space pins a block so its detail survives the pointer
 * leaving, Escape releases it. Nothing is timed inside the card — the host lands
 * blocks by appending to `blocks`. Under reduced motion tiles appear in place
 * and the track still extends, because how many blocks have landed is
 * information rather than flourish.
 */
export function TxStatus({
  ref,
  hash,
  amount,
  format = defaultFormat,
  asset = "BSN",
  blocks = NO_BLOCKS,
  threshold = 6,
  dropped = false,
  label = "Transfer",
  onBlockSelect,
  onFinal,
  className,
}: TxStatusProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const slots = Math.max(1, Math.trunc(threshold));
  const confirmations = blocks.length;
  const reached = Math.min(confirmations, slots);
  const isFinal = !dropped && confirmations >= slots;
  const phase: Phase = dropped
    ? "dropped"
    : isFinal
      ? "final"
      : confirmations > 0
        ? "confirming"
        : "pending";

  const [pinned, setPinned] = React.useState<string | null>(null);
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [focused, setFocused] = React.useState<string | null>(null);
  const [focusIndex, setFocusIndex] = React.useState(0);
  const tileRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  // The ledger keeps marching while a viewer reads: pausing the tab must not
  // leave a pulse running on the slot that is next to fill.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Reported from an effect rather than from the render that noticed it: a
  // parent callback fired during render is a cross-component update React
  // refuses. The ref latches so a seventh block does not report finality twice.
  const finalRef = useLatest(onFinal);
  const firedRef = React.useRef(false);
  React.useEffect(() => {
    if (!isFinal) {
      firedRef.current = false;
      return;
    }
    if (firedRef.current) return;
    firedRef.current = true;
    finalRef.current?.(confirmations);
  }, [isFinal, confirmations, finalRef]);

  const anchor = Math.min(focusIndex, Math.max(0, confirmations - 1));

  const focusAt = (to: number) => {
    const clamped = Math.min(confirmations - 1, Math.max(0, to));
    setFocusIndex(clamped);
    tileRefs.current[clamped]?.focus();
  };

  const pick = (block: TxStatusBlock) => {
    const next = pinned === block.id ? null : block.id;
    setPinned(next);
    onBlockSelect?.(next === null ? null : block);
  };

  const release = () => {
    if (pinned === null) return;
    setPinned(null);
    onBlockSelect?.(null);
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        focusAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(confirmations - 1);
        break;
      case "Escape":
        release();
        break;
      default:
        break;
    }
  };

  // Focus lights a tile exactly as the pointer does, so the detail line is
  // reachable without a mouse.
  const activeId = pinned ?? hovered ?? focused;
  const active = blocks.find((block) => block.id === activeId) ?? null;
  const activeIndex = active
    ? blocks.findIndex((block) => block.id === active.id)
    : -1;

  const detail = active
    ? `Block ${COUNT.format(active.height)}${
        active.txCount === undefined
          ? ""
          : ` · ${COUNT.format(active.txCount)} tx`
      } · confirmation ${activeIndex + 1} of ${slots}`
    : dropped
      ? "Dropped from the queue. Send it again to retry."
      : isFinal
        ? `Final after ${COUNT.format(confirmations)} confirmations.`
        : confirmations > 0
          ? `Waiting on ${COUNT.format(slots - confirmations)} more ${
              slots - confirmations === 1 ? "block" : "blocks"
            }.`
          : "In the queue. No blocks yet.";

  const headLength = Math.min(10, Math.max(4, hash.length - 6));
  const shortHash =
    hash.length > headLength + 6
      ? `${hash.slice(0, headLength)}…${hash.slice(-4)}`
      : hash;

  const valueText = dropped
    ? "Dropped before any confirmation"
    : `${COUNT.format(reached)} of ${COUNT.format(slots)} confirmations, ${
        isFinal ? "final" : confirmations > 0 ? "confirming" : "pending"
      }`;

  const trackTone = dropped
    ? "bg-danger"
    : isFinal
      ? "bg-success"
      : "bg-cobalt-bright";

  const pill = PILL[phase];

  return (
    <section
      ref={ref}
      role="group"
      aria-labelledby={labelId}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-card p-3",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span id={labelId} className="text-[11px] text-ink-3">
            {label}
          </span>
          <span className="flex items-baseline gap-1 font-mono text-base font-medium tabular-nums">
            <span className={dropped ? "text-ink-3 line-through" : "text-ink"}>
              {format(amount)}
            </span>
            <span className="text-[11px] text-ink-3">{asset}</span>
          </span>
        </div>

        {/* mode="wait" so two pills never sit side by side for a frame. Only
            the final pill lands on recoil; the rest cross-fade. */}
        <div className="flex h-6 shrink-0 items-center">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={phase}
              className={cn(
                "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium",
                pill.tone,
              )}
              initial={
                motionSafe && phase === "final"
                  ? { scale: 1.2, opacity: 0 }
                  : { opacity: 0 }
              }
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe && phase === "final"
                  ? springs.recoil
                  : { duration: durations.fast, ease: easings.enter }
              }
            >
              {phase === "final" ? (
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  className="size-3 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <motion.path
                    d="M3.4 8.4 6.4 11.4 12.6 4.8"
                    pathLength={1}
                    initial={{ pathLength: motionSafe ? 0 : 1 }}
                    animate={{ pathLength: 1 }}
                    transition={motionSafe ? springs.flick : { duration: 0 }}
                  />
                </svg>
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    dropped ? "bg-danger" : "bg-current",
                  )}
                />
              )}
              {pill.text}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-ink-3">
        {/* The abbreviation is decoration; the whole string is what a reader
            needs, and a name on a bare span is not reliably announced. */}
        <span aria-hidden className="shrink-0 tracking-[0.08em] uppercase">
          Hash
        </span>
        <span aria-hidden className="min-w-0 truncate" title={hash}>
          {shortHash}
        </span>
        <span className="sr-only">Hash {hash}</span>
      </div>

      <div className="flex flex-col gap-2 border-t border-hairline pt-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-ink-3">Confirmations</span>
          <span className="flex shrink-0 items-baseline gap-1 font-mono text-xs tabular-nums">
            {/* Keyed, so a landing block remounts the figure and it enters with
                the tile instead of morphing on a clock of its own. */}
            <motion.span
              key={confirmations}
              className={cn(
                "inline-block font-medium",
                isFinal ? "text-success" : dropped ? "text-ink-3" : "text-ink",
              )}
              initial={
                motionSafe
                  ? { y: -distances.nudge, opacity: 0 }
                  : { opacity: 0 }
              }
              animate={{ y: 0, opacity: 1 }}
              transition={
                motionSafe
                  ? springs.snap
                  : { duration: durations.fast, ease: easings.enter }
              }
            >
              {COUNT.format(confirmations)}
            </motion.span>
            <span className="text-ink-3">of {COUNT.format(slots)}</span>
          </span>
        </div>

        <div
          role="group"
          aria-label={`Confirming blocks for ${label}`}
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${slots}, minmax(0, 1fr))` }}
          onPointerLeave={() => setHovered(null)}
        >
          {Array.from({ length: slots }, (_, index) => {
            const block = blocks[index];
            if (!block) {
              const isNext = index === confirmations && !dropped && !isFinal;
              return (
                <span
                  key={`slot-${index}`}
                  aria-hidden
                  className="h-9 rounded-2 border border-dashed border-hairline-strong bg-surface-1"
                >
                  {/* The next slot breathes only while the page is watched and
                      motion is welcome; it is a hint, never information. */}
                  <motion.span
                    className="block size-full rounded-2 bg-cobalt-wash"
                    initial={{ opacity: 0 }}
                    animate={{
                      opacity:
                        isNext && motionSafe && visible ? [0.15, 0.6] : 0,
                    }}
                    transition={
                      isNext && motionSafe && visible
                        ? {
                            duration: durations.page,
                            ease: easings.move,
                            repeat: Infinity,
                            repeatType: "reverse",
                          }
                        : { duration: durations.fast }
                    }
                  />
                </span>
              );
            }

            const isActive = activeId === block.id;
            return (
              <motion.button
                key={block.id}
                type="button"
                ref={(node) => {
                  tileRefs.current[index] = node;
                }}
                tabIndex={index === anchor ? 0 : -1}
                aria-pressed={pinned === block.id}
                aria-label={`Block ${COUNT.format(block.height)}, confirmation ${
                  index + 1
                } of ${slots}${
                  block.txCount === undefined
                    ? ""
                    : `, ${COUNT.format(block.txCount)} transactions`
                }`}
                onClick={() => pick(block)}
                onFocus={() => {
                  setFocusIndex(index);
                  setFocused(block.id);
                }}
                onBlur={() => setFocused(null)}
                onKeyDown={(event) => onKeyDown(event, index)}
                onPointerEnter={() => setHovered(block.id)}
                className={cn(
                  "flex h-9 flex-col items-center justify-center rounded-2 border font-mono text-[10px] tabular-nums transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  isActive
                    ? "border-cobalt-bright bg-cobalt-wash text-cobalt-bright"
                    : "border-hairline-strong bg-surface-2 text-ink-2 hover:bg-accent",
                )}
                initial={
                  motionSafe
                    ? { x: distances.step, opacity: 0 }
                    : { opacity: 0 }
                }
                animate={{ x: 0, opacity: 1 }}
                transition={
                  motionSafe
                    ? springs.snap
                    : { duration: durations.fast, ease: easings.enter }
                }
              >
                <span aria-hidden className="leading-none">
                  {shortHeight(block.height)}
                </span>
              </motion.button>
            );
          })}
        </div>

        <div
          role="progressbar"
          aria-label={`${label} confirmations`}
          aria-valuemin={0}
          aria-valuemax={slots}
          aria-valuenow={reached}
          aria-valuetext={valueText}
          className="h-1 w-full overflow-hidden rounded-full bg-surface-2"
        >
          <motion.span
            aria-hidden
            className={cn("block h-full origin-left rounded-full", trackTone)}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: dropped ? 1 : reached / slots }}
            transition={
              motionSafe
                ? springs.glide
                : { duration: durations.base, ease: easings.enter }
            }
          />
        </div>

        <p
          className={cn(
            "truncate font-mono text-[10px] tracking-[0.02em]",
            dropped ? "text-danger" : "text-ink-3",
          )}
          title={detail}
        >
          {detail}
        </p>
      </div>

      <span role="status" className="sr-only">
        {dropped
          ? `${label} dropped from the queue.`
          : isFinal
            ? `${label} final.`
            : confirmations > 0
              ? `${label} confirming.`
              : `${label} pending.`}
      </span>
    </section>
  );
}
