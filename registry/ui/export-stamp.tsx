"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ExportTarget = {
  /** Stable identity; the value the group reports. */
  id: string;
  /** Short name on the chip. */
  label: string;
  /** Where exactly it goes, shown under the row for the chosen target. */
  detail?: string;
};

export type ExportStage = "idle" | "exporting" | "stamped";

export type ExportStampProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Destinations, in order. */
  targets: ExportTarget[];
  /** Controlled target id. */
  value?: string;
  /** Initial target id for uncontrolled usage. Defaults to the first target. */
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  /** Where the export stands; the host drives it. @default "idle" */
  stage?: ExportStage;
  /** 0..1 of the export while `stage` is "exporting". @default 0 */
  progress?: number;
  /** Fires from the Export control with the chosen target. */
  onExport?: (id: string) => void;
  /** Names the control group for assistive technology. */
  label: string;
  /** Copy on the control while idle. @default "Export" */
  exportLabel?: string;
  className?: string;
};

/**
 * Done, and sent where you said. A row of target chips is a radiogroup: the
 * chosen chip takes the strong hairline and the cobalt wash on a colour
 * tween, and its detail line glides open beneath the row on `glide` from a
 * measured height. Export hands the host `onExport` and the host drives
 * `stage` and `progress`; the button's own fill runs left to right as a bar
 * on `glide` while the label reads Exporting. On "stamped" a seal lands over
 * the chosen chip on `recoil` — from 1.4× and a few degrees of tilt to rest,
 * two visible bounces, a stamp hitting paper — the chip turns success and
 * the button reads Exported until the host resets. The seal is decoration:
 * the chip's own text and the live region carry the fact.
 *
 * Left and Right step the chips without wrapping, Home and End jump, Space
 * selects; picking is ignored while an export runs. Under reduced motion the
 * bar still fills on a tween, the detail swaps without gliding, and the seal
 * fades in at rest with no tilt or bounce.
 */
export function ExportStamp({
  ref,
  targets,
  value,
  defaultValue,
  onValueChange,
  stage = "idle",
  progress = 0,
  onExport,
  label,
  exportLabel = "Export",
  className,
}: ExportStampProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const labelId = `${uid}-label`;

  const [uncontrolled, setUncontrolled] = React.useState<string>(
    () => defaultValue ?? targets[0]?.id ?? "",
  );
  const isControlled = value !== undefined;
  const current = isControlled ? value : uncontrolled;
  const currentIndex = Math.max(
    0,
    targets.findIndex((target) => target.id === current),
  );
  const chosen = targets[currentIndex];

  const exporting = stage === "exporting";
  const stamped = stage === "stamped";
  const fraction = stamped
    ? 1
    : exporting
      ? Math.round(Math.min(1, Math.max(0, progress)) * 1000) / 1000
      : 0;

  const select = (next: string) => {
    if (exporting || next === current) return;
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next);
  };

  const focusAt = (index: number) => {
    const clamped = Math.min(targets.length - 1, Math.max(0, index));
    const target = targets[clamped];
    if (!target) return;
    document.getElementById(`${uid}-chip-${target.id}`)?.focus();
    select(target.id);
  };

  const onKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusAt(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusAt(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusAt(targets.length - 1);
    } else if (event.key === " ") {
      event.preventDefault();
      select(targets[index]?.id ?? current);
    }
  };

  const [detail, attachDetail] = React.useState<HTMLElement | null>(null);
  const [detailHeight, setDetailHeight] = React.useState(0);
  React.useEffect(() => {
    if (!detail || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setDetailHeight(detail.offsetHeight),
    );
    observer.observe(detail);
    return () => observer.disconnect();
  }, [detail]);

  const word = stamped ? "Sent" : exporting ? "Exporting" : "Ready";
  const announcement =
    chosen && exporting
      ? `Exporting to ${chosen.label}`
      : chosen && stamped
        ? `Exported to ${chosen.label}`
        : "";
  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const layout = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      <div className="flex h-6 items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-medium">
          {label}
        </span>
        <span
          aria-hidden
          className="grid shrink-0 text-right font-mono text-[10px] tracking-[0.08em] uppercase"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={word}
              className={cn(
                "col-start-1 row-start-1",
                stamped
                  ? "text-success"
                  : exporting
                    ? "text-ink-2"
                    : "text-ink-3",
              )}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={fade}
            >
              {word}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>

      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="flex flex-wrap gap-2"
      >
        {targets.map((target, index) => {
          const checked = target.id === current;
          const sent = checked && stamped;
          return (
            <button
              key={target.id}
              type="button"
              role="radio"
              id={`${uid}-chip-${target.id}`}
              aria-checked={checked}
              aria-disabled={exporting || undefined}
              tabIndex={index === currentIndex ? 0 : -1}
              onClick={() => select(target.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "relative flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors duration-200 outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                sent
                  ? "border-success/50 bg-success/10 text-success"
                  : checked
                    ? "border-hairline-strong bg-cobalt-wash text-cobalt-bright"
                    : "border-hairline text-muted-foreground hover:bg-accent hover:text-foreground",
                exporting && !checked && "opacity-60",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "size-1.5 shrink-0 rounded-full transition-colors duration-200",
                  sent
                    ? "bg-success"
                    : checked
                      ? "bg-cobalt-bright"
                      : "bg-hairline-strong",
                )}
              />
              {target.label}
              {sent ? <span className="sr-only">, sent</span> : null}
              {/* The seal lands on the chip's shoulder and is decoration only;
                  the chip already says it was sent. */}
              <AnimatePresence initial={false}>
                {sent ? (
                  <motion.span
                    key="seal"
                    aria-hidden
                    className="pointer-events-none absolute -top-2.5 -right-2 rounded-1 border-2 border-success bg-surface-1 px-1 font-mono text-[9px] leading-4 font-semibold tracking-[0.1em] text-success uppercase"
                    initial={
                      motionSafe
                        ? { opacity: 0, scale: 1.4, rotate: -14 }
                        : { opacity: 0, scale: 1, rotate: -8 }
                    }
                    animate={{ opacity: 1, scale: 1, rotate: -8 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.recoil,
                            opacity: { duration: durations.blink },
                          }
                        : { duration: durations.fast }
                    }
                  >
                    Sent
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </button>
          );
        })}
      </div>

      {/* No room is reserved for the detail: the wrapper sits at zero for a
          target without one and glides to the line the chosen target needs. */}
      <motion.div
        className="overflow-hidden"
        initial={false}
        animate={{ height: chosen?.detail ? detailHeight : 0 }}
        transition={layout}
      >
        <div ref={attachDetail}>
          <AnimatePresence mode="wait" initial={false}>
            {chosen?.detail ? (
              <motion.p
                key={chosen.id}
                className="truncate text-xs text-ink-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={fade}
              >
                {chosen.detail}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>

      <button
        type="button"
        onClick={() => {
          if (!chosen || exporting || stamped) return;
          onExport?.(chosen.id);
        }}
        disabled={exporting || stamped}
        aria-busy={exporting || undefined}
        className={cn(
          "relative flex h-9 w-full items-center justify-center overflow-hidden rounded-2 border text-sm font-medium transition-colors duration-300 outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          "disabled:cursor-default",
          stamped
            ? "border-success/40 bg-success/10 text-success"
            : "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
        )}
      >
        {/* The bar is the button's own fill, so progress runs where the
            reader is already looking. */}
        <motion.span
          aria-hidden
          className={cn(
            "absolute inset-y-0 left-0 w-full origin-left",
            stamped ? "bg-success/10" : "bg-primary-foreground/20",
          )}
          initial={false}
          animate={{ scaleX: fraction, opacity: stamped ? 0 : 1 }}
          transition={{ ...layout, opacity: fade }}
        />
        <span className="relative flex items-center gap-1.5">
          {stamped ? (
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4 shrink-0"
            >
              <motion.path
                d="M3.5 8.5 6.5 11.5 12.5 4.5"
                initial={motionSafe ? { pathLength: 0 } : { opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={
                  motionSafe ? springs.flick : { duration: durations.fast }
                }
              />
            </svg>
          ) : null}
          {stamped ? "Exported" : exporting ? "Exporting" : exportLabel}
        </span>
      </button>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
