"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CopyChipProps = {
  /** What is written to the clipboard. */
  value: string;
  /** Idle copy, and the accessible name in the icon variant. @default "Copy" */
  label?: string;
  /** Copied copy. @default "Copied" */
  copiedLabel?: string;
  /** Milliseconds before the chip reverts to idle. @default 1500 */
  timeout?: number;
  /** With or without a visible label. @default "chip" */
  variant?: "chip" | "icon";
  /** Fires with the value once the clipboard has taken it. */
  onCopy?: (value: string) => void;
  className?: string;
};

/** Every browser reads this pair; naming one platform would be wrong on the other. */
const MANUAL_HINT = "Press Ctrl/Cmd+C";

/**
 * A copy button that shows its own result. Pressing writes the value and the
 * glyph morphs rather than swaps: the two squares fade out on a tween while the
 * tick draws over them with `pathLength` on `flick`, the fastest spring in the
 * set, because a confirmation should be finished by the time you look back at
 * it. A wash flashes once across the chip and drains on the exit ease, the label
 * swaps to the copied copy, and the whole thing reverts after `timeout`.
 *
 * When the clipboard refuses — an insecure origin, a denied permission — the
 * chip does not shrug: it selects the value in a field over its own box and asks
 * for Ctrl/Cmd+C, so the copy is still one keystroke away, and Escape or blur
 * returns it to idle. A polite status line announces each outcome once. Under
 * reduced motion the icon simply swaps, wash and draw included, because the
 * result still has to be visible.
 */
export function CopyChip({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  timeout = 1500,
  variant = "chip",
  onCopy,
  className,
}: CopyChipProps) {
  const motionSafe = useMotionSafe();
  const [phase, setPhase] = React.useState<"idle" | "copied" | "failed">(
    "idle",
  );
  // Also the flash key: a second copy has to re-flash and restart the clock,
  // and the phase alone has not changed.
  const [seq, setSeq] = React.useState(0);
  const fallbackRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (phase !== "copied") return;
    const timer = window.setTimeout(() => setPhase("idle"), timeout);
    return () => window.clearTimeout(timer);
  }, [phase, seq, timeout]);

  React.useEffect(() => {
    if (phase !== "failed") return;
    const node = fallbackRef.current;
    if (!node) return;
    // The selection is the whole point of the fallback: Ctrl/Cmd+C has to have
    // something to take.
    node.focus();
    node.select();
  }, [phase]);

  const copy = () => {
    const clipboard =
      typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (!clipboard?.writeText) {
      setPhase("failed");
      return;
    }
    clipboard.writeText(value).then(
      () => {
        setSeq((count) => count + 1);
        setPhase("copied");
        onCopy?.(value);
      },
      () => setPhase("failed"),
    );
  };

  const copied = phase === "copied";
  const failed = phase === "failed";
  const text = copied ? copiedLabel : failed ? MANUAL_HINT : label;

  return (
    <span className={cn("relative inline-flex max-w-full", className)}>
      <button
        type="button"
        onClick={copy}
        aria-label={
          variant === "icon" ? (failed ? MANUAL_HINT : label) : undefined
        }
        title={variant === "icon" ? label : undefined}
        className={cn(
          "relative inline-flex h-8 max-w-full shrink-0 items-center justify-center overflow-hidden rounded-2 border border-input font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          variant === "icon" ? "w-8" : "gap-1.5 px-2.5 text-xs",
          copied ? "text-success" : "text-foreground",
          // Focus has moved into the invisible fallback field over this box, so
          // the box has to show where the keyboard is.
          failed && "outline-2 outline-offset-2 outline-ring",
        )}
      >
        {seq > 0 ? (
          <motion.span
            key={seq}
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-cobalt-wash"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: durations.slow, ease: easings.exit }}
          />
        ) : null}

        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className="relative size-4 shrink-0"
        >
          <motion.g
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
            initial={false}
            animate={{ opacity: copied ? 0 : 1 }}
            transition={{
              duration: motionSafe ? durations.fast : 0,
              ease: copied ? easings.exit : easings.enter,
            }}
          >
            <path d="M5.6 4.2V3.1a1.6 1.6 0 0 1 1.6-1.6h5.7a1.6 1.6 0 0 1 1.6 1.6v5.7a1.6 1.6 0 0 1-1.6 1.6h-1.1" />
            <rect x="1.5" y="5.6" width="8.9" height="8.9" rx="1.6" />
          </motion.g>
          <motion.path
            d="M3.4 8.4 6.4 11.4 12.6 4.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            initial={false}
            animate={{ pathLength: copied ? 1 : 0 }}
            transition={motionSafe ? springs.flick : { duration: 0 }}
          />
        </svg>

        {variant === "chip" ? (
          <motion.span
            key={text}
            className="relative min-w-0 truncate"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            {text}
          </motion.span>
        ) : null}
      </button>

      {failed ? (
        <input
          ref={fallbackRef}
          readOnly
          value={value}
          aria-label={`${label} value — ${MANUAL_HINT}`}
          onBlur={() => setPhase("idle")}
          onKeyDown={(event) => {
            if (event.key === "Escape") setPhase("idle");
          }}
          className="absolute inset-0 size-full rounded-2 border-0 bg-transparent px-2 font-mono text-xs opacity-0 outline-none"
        />
      ) : null}

      <span role="status" className="sr-only">
        {copied
          ? `Copied ${value}`
          : failed
            ? `Copy blocked. ${MANUAL_HINT}`
            : ""}
      </span>
    </span>
  );
}
