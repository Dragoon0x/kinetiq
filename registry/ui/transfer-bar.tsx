"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TransferBytes = {
  /** Bytes moved so far. */
  done: number;
  /** Bytes in the whole transfer. */
  total: number;
};

export type TransferBarProps = {
  /** 0–1. Clamped, and compressed past the tail so it cannot draw a full bar early. */
  progress: number;
  /** @default "active" */
  status?: "active" | "done" | "error";
  /** Feeds the byte, rate and remaining-time readouts. */
  bytes?: TransferBytes;
  /** File name. Truncates with a title attribute. */
  label: string;
  /** Fires from the Retry button in the error state. */
  onRetry?: () => void;
  className?: string;
};

/** Where the fill stops being linear and starts approaching the end. */
const TAIL = 0.9;
/** How hard the tail compresses: e^-4 leaves ~0.2% of the track unclaimed. */
const TAIL_FALLOFF = 4;
/** Rate is sampled on its own clock so the readout does not twitch per frame. */
const SAMPLE_MS = 500;
/**
 * The stripe repeats every 13.8564px along a 120° gradient line, which is
 * exactly 16px of horizontal travel (13.8564 ÷ sin 120°) — so translating the
 * sheet by 16px lands on the identical pattern and the loop has no seam.
 */
const STRIPE_TRAVEL = 16;
const STRIPE_IMAGE =
  "repeating-linear-gradient(120deg, var(--primary-foreground) 0 6.9282px, transparent 6.9282px 13.8564px)";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

const UNITS = ["B", "KB", "MB", "GB", "TB"];

function formatBytes(value: number): string {
  let scaled = Math.max(0, value);
  let unit = 0;
  while (scaled >= 1000 && unit < UNITS.length - 1) {
    scaled /= 1000;
    unit += 1;
  }
  return `${scaled.toFixed(unit === 0 ? 0 : 1)} ${UNITS[unit]}`;
}

function formatLeft(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  if (whole < 60) return `${whole}s left`;
  const minutes = Math.min(99, Math.floor(whole / 60));
  return `${minutes}m ${String(whole % 60).padStart(2, "0")}s left`;
}

/**
 * Past the tail the remaining tenth is spent exponentially: the fill keeps
 * moving, but it can only approach the end. A stall at 99% therefore reads as
 * a stall rather than as a bar that has quietly finished.
 */
function easeTail(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  if (clamped <= TAIL) return clamped;
  const into = (clamped - TAIL) / (1 - TAIL);
  return TAIL + (1 - TAIL) * (1 - Math.exp(-TAIL_FALLOFF * into));
}

/**
 * Digits roll on their own wheel; everything else holds still, so only the
 * numbers draw the eye. A strip of ten beats swapping two keyed spans: under a
 * fast feed the same digit can return before its own exit has finished, and two
 * children sharing a key is a React collision, not an animation.
 */
function Roll({
  text,
  motionSafe,
  className,
}: {
  text: string;
  motionSafe: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex items-center tabular-nums", className)}
    >
      {text.split("").map((char, index) => (
        <span
          key={index}
          className="relative inline-block h-[1.2em] w-[1ch] overflow-hidden"
        >
          {char >= "0" && char <= "9" ? (
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              style={{ height: "1000%" }}
              initial={false}
              animate={{ y: `${Number(char) * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((digit) => (
                <span
                  key={digit}
                  className="flex h-[10%] items-center justify-center"
                >
                  {digit}
                </span>
              ))}
            </motion.span>
          ) : (
            <span className="absolute inset-0 flex items-center justify-center">
              {char}
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

/**
 * A transfer bar that stays honest at the end. The fill is linear to 90% and
 * then approaches the finish asymptotically, so the last percent belongs to the
 * transfer rather than to the animation; a stripe rides the fill while bytes are
 * actually moving, and the rate and remaining-time readouts roll on `snap`.
 *
 * Done stamps a check on `recoil` — the one place this component celebrates —
 * and the body folds away on `glide` to a one-line summary, its height measured
 * rather than reserved. Error tints warn, stops the stripe and offers Retry as a
 * real button. The track is a `progressbar` carrying `aria-valuetext`, terminal
 * states announce once, and under reduced motion the stripe never runs while the
 * fill still fills: progress is information, not decoration.
 */
export function TransferBar({
  progress,
  status = "active",
  bytes,
  label,
  onRetry,
  className,
}: TransferBarProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [rate, setRate] = React.useState<number | null>(null);
  const [bodyHeight, setBodyHeight] = React.useState<number | null>(null);
  const bodyRef = React.useRef<HTMLDivElement | null>(null);

  // The sampler reads bytes from a ref so a new rate reading never restarts the
  // interval — the clock has to be steady for the division to mean anything.
  const bytesRef = React.useRef(bytes);
  React.useEffect(() => {
    bytesRef.current = bytes;
  });

  React.useEffect(() => {
    if (status !== "active") return;
    let lastAt = performance.now();
    let lastDone = bytesRef.current?.done ?? 0;
    let smoothed: number | null = null;
    const timer = window.setInterval(() => {
      const now = performance.now();
      const done = bytesRef.current?.done ?? 0;
      const elapsed = (now - lastAt) / 1000;
      if (elapsed <= 0) return;
      const instant = Math.max(0, (done - lastDone) / elapsed);
      lastAt = now;
      lastDone = done;
      // An exponential average: real links jitter, and a readout that jitters
      // with them is unreadable.
      smoothed = smoothed === null ? instant : smoothed * 0.7 + instant * 0.3;
      setRate(smoothed);
    }, SAMPLE_MS);
    return () => window.clearInterval(timer);
  }, [status]);

  // Measured, never reserved: the fold has to land on the height the summary
  // actually needs, and that height changes with the label's wrapping.
  React.useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      setBodyHeight(node.getBoundingClientRect().height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const isDone = status === "done";
  const isError = status === "error";
  const clamped = Math.min(1, Math.max(0, progress));
  const fill = isDone ? 1 : easeTail(clamped);
  // The readout holds at 99 until the transfer says it is done, for the same
  // reason the fill does.
  const percent = isDone ? 100 : Math.min(99, Math.floor(clamped * 100));

  const remaining = bytes ? Math.max(0, bytes.total - bytes.done) : 0;
  const showRate = !isDone && !isError && rate !== null && rate > 1;
  const leftLabel =
    showRate && rate !== null && remaining > 0
      ? formatLeft(remaining / rate)
      : null;

  const readouts = [
    bytes ? `${formatBytes(bytes.done)} / ${formatBytes(bytes.total)}` : null,
    showRate && rate !== null ? `${formatBytes(rate)}/s` : null,
    leftLabel,
  ].filter((entry): entry is string => entry !== null);

  const spokenBytes = bytes
    ? `${formatBytes(bytes.done)} of ${formatBytes(bytes.total)}`
    : null;
  const valueText = isDone
    ? `Complete, ${bytes ? formatBytes(bytes.total) : "100 percent"}`
    : isError
      ? `Stopped at ${percent} percent`
      : [`${percent} percent`, spokenBytes, leftLabel]
          .filter(Boolean)
          .join(", ");

  const foldTransition = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };

  return (
    <div
      className={cn(
        "w-full rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <motion.svg
          key={status}
          viewBox="0 0 16 16"
          aria-hidden
          className={cn(
            "size-4 shrink-0",
            isDone ? "text-success" : isError ? "text-warn" : "text-ink-3",
          )}
          // Remounting on status replays the stamp, and only the outcome worth
          // celebrating gets the recoil.
          initial={motionSafe && isDone ? { scale: 0.5 } : false}
          animate={{ scale: 1 }}
          transition={springs.recoil}
          style={{ originX: 0.5, originY: 0.5 }}
        >
          <g
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {isDone ? (
              <>
                <circle cx="8" cy="8" r="7" strokeOpacity="0.3" />
                <motion.path
                  d="M4.6 8.3 6.9 10.6 11.4 5.7"
                  strokeWidth="1.8"
                  pathLength={1}
                  initial={motionSafe ? { pathLength: 0 } : false}
                  animate={{ pathLength: 1 }}
                  transition={springs.flick}
                />
              </>
            ) : isError ? (
              <path d="M8 1.8 15 14.2H1zM8 6.2v3.4M8 11.9v.1" />
            ) : (
              <path d="M8 13V3.6M4.2 7.4 8 3.6l3.8 3.8" />
            )}
          </g>
        </motion.svg>

        <span
          id={labelId}
          title={label}
          className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
        >
          {label}
        </span>

        <span
          className={cn(
            "shrink-0 font-mono text-[11px] leading-none",
            isError ? "text-warn" : isDone ? "text-success" : "text-ink-2",
          )}
        >
          {isDone ? (
            <span className="tabular-nums">
              {bytes ? formatBytes(bytes.total) : "Done"}
            </span>
          ) : isError ? (
            <span>Failed</span>
          ) : (
            <Roll text={`${percent}%`} motionSafe={motionSafe} />
          )}
        </span>
      </div>

      <motion.div
        initial={false}
        animate={bodyHeight === null ? undefined : { height: bodyHeight }}
        transition={foldTransition}
        style={{
          overflow: "hidden",
          height: bodyHeight === null ? "auto" : undefined,
        }}
      >
        <div ref={bodyRef}>
          {isDone ? null : (
            <div className="flex flex-col gap-2 pt-2.5">
              <div
                role="progressbar"
                aria-labelledby={labelId}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-valuetext={valueText}
                className="relative h-2 w-full overflow-hidden rounded-full border border-hairline bg-surface-2"
              >
                <motion.div
                  className={cn(
                    "absolute inset-y-0 left-0 overflow-hidden rounded-full",
                    isError ? "bg-warn" : "bg-primary",
                  )}
                  initial={false}
                  animate={{ width: `${fill * 100}%` }}
                  transition={
                    motionSafe
                      ? springs.glide
                      : { duration: durations.fast, ease: easings.move }
                  }
                >
                  {/* The stripe is the only claim that bytes are moving, so it
                      stops the moment they are not. */}
                  {!isError && motionSafe ? (
                    <motion.span
                      aria-hidden
                      className="absolute -inset-x-4 inset-y-0 opacity-20"
                      style={{ backgroundImage: STRIPE_IMAGE }}
                      initial={{ x: 0 }}
                      animate={{ x: STRIPE_TRAVEL }}
                      transition={{
                        duration: 0.7,
                        ease: easings.linear,
                        repeat: Infinity,
                      }}
                    />
                  ) : null}
                </motion.div>
              </div>

              {isError ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[10px] tracking-[0.06em] text-warn uppercase">
                    Stopped at {percent}%
                  </span>
                  <button
                    type="button"
                    onClick={onRetry}
                    className="inline-flex h-8 shrink-0 items-center rounded-2 border border-input px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <div
                  aria-hidden
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase"
                >
                  {readouts.map((entry, index) => (
                    <React.Fragment key={index}>
                      {index > 0 ? <span className="opacity-40">·</span> : null}
                      <Roll text={entry} motionSafe={motionSafe} />
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {isDone
          ? `${label} transferred`
          : isError
            ? `${label} stopped at ${percent} percent`
            : ""}
      </span>
    </div>
  );
}
