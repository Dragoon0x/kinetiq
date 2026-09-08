"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SettleStatus = "pending" | "settled" | "returned";

export type SettlePulseProps = {
  /** Which state the pill shows; changing it runs the settle. @default "pending" */
  status?: SettleStatus;
  /** Optional sum. It joins the pill once the network settles or returns it. */
  amount?: number;
  /** Formats the amount. */
  format?: (value: number) => string;
  /** Overrides the word for any state. */
  labels?: Partial<Record<SettleStatus, string>>;
  /** Who has to say so — printed under the pill and named in the label. */
  network?: string;
  /** Pill height. @default "md" */
  size?: "sm" | "md";
  /** Fires once the stamp has landed, from the animation's own completion. */
  onSettled?: (status: SettleStatus) => void;
  className?: string;
};

const MONEY = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number): string => MONEY.format(value);

const WORDS: Record<SettleStatus, string> = {
  pending: "Pending",
  settled: "Settled",
  returned: "Returned",
};

/** The pill is border-box, so its width has to carry the 1px rail either side. */
const BORDER = 2;

/** Enough swell to read as a breath across a 9px-tall pill, not as a wobble. */
const BREATH = 1.035;

const TONE: Record<SettleStatus, string> = {
  pending: "text-warn",
  settled: "text-success",
  returned: "text-danger",
};

/**
 * Pending until the network says so. Waiting, the pill breathes: it scales
 * between two keyframes on `springs.drift` with `repeatType: "mirror"` — ζ1.00,
 * the ambient spring, because an overshoot here would read as a twitch — while a
 * halo behind it swells in opposition and fades as the pill fills, so the pair
 * reads as one slow pulse. The breath stops while the tab is hidden. When the
 * status settles the breathing returns to rest on `drift` and the pill widens on
 * `snap` to the width its new word and the settled sum need, measured rather than
 * guessed, clipped by the pill so they are revealed as the surface arrives. The
 * sum joins only on settlement, because until then nothing has moved. The tick
 * then stamps: a `1.6 → 1` scale on `recoil`, ζ0.53's two visible bounces, with
 * the check drawing on `flick` behind it. A returned transfer takes the same
 * widening and no stamp — the glyph fades in on a tween, because a failure never
 * celebrates.
 *
 * The pill is a polite `role="status"` carrying a whole sentence for assistive
 * technology, so the state is never colour or pulse alone. Under reduced
 * motion there is no breath and no halo, the widening is instant, and the tick is
 * already drawn when it appears — the word still changes, which is the
 * information the motion was carrying.
 */
export function SettlePulse({
  status = "pending",
  amount,
  format = defaultFormat,
  labels,
  network,
  size = "md",
  onSettled,
  className,
}: SettlePulseProps) {
  const motionSafe = useMotionSafe();

  // Nothing breathes to an empty room: the pulse rests while the tab is hidden.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // The content keeps its natural width inside the clipped pill, so the pill has
  // a real target to widen to instead of an animated "auto".
  const [content, attachContent] = React.useState<HTMLSpanElement | null>(null);
  const [width, setWidth] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setWidth(content.offsetWidth));
    observer.observe(content);
    return () => observer.disconnect();
  }, [content]);

  const pending = status === "pending";
  const breathing = pending && motionSafe && visible;
  const word = labels?.[status] ?? WORDS[status];

  const sentence = [
    amount === undefined ? "Transfer" : `Transfer of ${format(amount)}`,
    `${word.toLowerCase()}${network ? ` on ${network}` : ""}`,
  ].join(", ");

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("inline-flex flex-col items-start gap-1", className)}
    >
      {/* The sentence is the region's own text, not an aria-label: a live region
          announces content that changes, and every visual part is hidden. */}
      <span className="sr-only">{sentence}</span>

      <span aria-hidden className="relative inline-flex">
        {/* The halo sits outside the pill so the pill can clip its own word
            without clipping the pulse around it. */}
        <motion.span
          className="absolute inset-0 rounded-full bg-warn/20"
          initial={{ scale: BREATH, opacity: 0 }}
          animate={{
            scale: breathing ? 1 : BREATH,
            opacity: breathing ? 0.55 : 0,
          }}
          transition={
            breathing
              ? { ...springs.drift, repeat: Infinity, repeatType: "mirror" }
              : { duration: durations.base, ease: easings.exit }
          }
        />

        <motion.span
          initial={false}
          animate={{
            width: width === null ? "auto" : width + BORDER,
            scale: breathing ? BREATH : 1,
          }}
          transition={{
            width: motionSafe ? springs.snap : { duration: 0 },
            scale: breathing
              ? { ...springs.drift, repeat: Infinity, repeatType: "mirror" }
              : springs.drift,
          }}
          className={cn(
            "relative flex overflow-hidden rounded-full border border-hairline bg-surface-1",
            size === "sm" ? "h-7" : "h-9",
          )}
        >
          <span
            ref={attachContent}
            // shrink-0 and w-max together: a narrower pill must clip the
            // content, never squeeze it, or the words would compress instead of
            // being revealed as the surface widens.
            className={cn(
              "flex h-full w-max shrink-0 items-center gap-1.5 px-3 whitespace-nowrap",
              size === "sm" ? "text-[11px]" : "text-xs",
            )}
          >
            <motion.span
              key={status}
              className={cn("flex shrink-0 items-center", TONE[status])}
              initial={
                motionSafe && status === "settled"
                  ? { scale: 1.6 }
                  : { scale: 1, opacity: 0 }
              }
              animate={{ scale: 1, opacity: 1 }}
              // Only a settlement lands: the stamp is recoil's two bounces, and
              // a return simply arrives.
              transition={
                motionSafe && status === "settled"
                  ? springs.recoil
                  : { duration: motionSafe ? durations.fast : 0 }
              }
              onAnimationComplete={() => {
                if (!pending) onSettled?.(status);
              }}
            >
              {pending ? (
                <span className="block size-1.5 rounded-full bg-warn" />
              ) : (
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3.5 shrink-0"
                >
                  <motion.path
                    d={
                      status === "settled"
                        ? "M3.5 8.5 6.5 11.5 12.5 4.5"
                        : "M12.5 5.5H5.5a2.5 2.5 0 0 0 0 5h1M8 3 5 5.5 8 8"
                    }
                    pathLength={1}
                    initial={{ pathLength: motionSafe ? 0 : 1 }}
                    animate={{ pathLength: 1 }}
                    transition={motionSafe ? springs.flick : { duration: 0 }}
                  />
                </svg>
              )}
            </motion.span>

            {/* Keyed on the word: a new word mounts and fades in while the pill
                widens under it, rather than cross-fading two words in a box
                sized for the longer of them. */}
            <motion.span
              key={word}
              className={cn("font-medium whitespace-nowrap", TONE[status])}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={motionSafe ? fade : { duration: 0 }}
            >
              {word}
            </motion.span>

            {/* The sum joins the pill only once the network has spoken — which
                is the widening the pill is for: nothing has moved until then. */}
            {pending || amount === undefined ? null : (
              <motion.span
                className="font-mono text-ink tabular-nums"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={motionSafe ? fade : { duration: 0 }}
              >
                {format(amount)}
              </motion.span>
            )}
          </span>
        </motion.span>
      </span>

      {network ? (
        <span
          aria-hidden
          className="max-w-full truncate text-[11px] text-ink-3"
        >
          {pending ? `Waiting on ${network}` : network}
        </span>
      ) : null}
    </span>
  );
}
