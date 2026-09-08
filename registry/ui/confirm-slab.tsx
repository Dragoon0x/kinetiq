"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ConfirmStage = "idle" | "detent" | "sent";

export type ConfirmSlabProps = {
  /** The sum being confirmed; the card's headline figure. */
  amount: number;
  /** Formats the amount, the fee, and the total. */
  format?: (value: number) => string;
  /** Who is being paid. */
  recipient: string;
  /** The masked account line under the recipient. */
  account?: string;
  /** Added to the amount for the total row. @default 0 */
  fee?: number;
  /** Optional last row — what the transfer is for. */
  note?: string;
  /** Track copy while idle. @default "Slide to send" */
  confirmLabel?: string;
  /** Copy for the line the slab collapses to. @default "Sent" */
  sentLabel?: string;
  /** Locks the track and dims the slab. */
  disabled?: boolean;
  /** Fires once, from the gesture or key that landed the slide. */
  onConfirm?: () => void;
  /** Fires from the Cancel button. */
  onCancel?: () => void;
  /** Fires as the control moves between its stages. */
  onStageChange?: (stage: ConfirmStage) => void;
  className?: string;
};

const TRACK_H = 44;
const THUMB = 36;
const PAD = 4;
/** Where the notch sits: far enough that a brush of the thumb cannot reach it. */
const DETENT = 0.62;
/** Past this the slide has been meant, so it slams home. */
const COMMIT = 0.85;
/** Travel past the notch returns less than it costs — that is the resistance. */
const RESIST = 0.7;
/** Slack around the notch, so a thumb resting on it counts as being on it. */
const SLACK = 0.02;
/** Pointer travel before capture: capturing on pointerdown eats plain clicks. */
const CAPTURE_PX = 4;

const MONEY = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number): string => MONEY.format(value);

const clamp = (value: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, value));

/** Linear up to the notch, then compressed: the thumb has to be pushed through. */
const resisted = (raw: number, travel: number) => {
  const notch = travel * DETENT;
  return clamp(raw <= notch ? raw : notch + (raw - notch) * RESIST, 0, travel);
};

type SlabRow = {
  id: string;
  label: string;
  value: string;
  title?: string;
  strong?: boolean;
};

/**
 * Measures the slab so it can collapse from a height it actually has. The node
 * arrives through a callback ref, so the height is ordinary state and nothing
 * has to be read out of a ref to render.
 */
function useMeasuredHeight() {
  const [node, attach] = React.useState<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeight(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [attach, height] as const;
}

function Tick({ motionSafe }: { motionSafe: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0"
    >
      <motion.path
        d="M6 12.5 10 16.5 18 7.5"
        pathLength={1}
        initial={{ pathLength: motionSafe ? 0 : 1 }}
        animate={{ pathLength: 1 }}
        transition={motionSafe ? springs.flick : { duration: 0 }}
      />
    </svg>
  );
}

/**
 * Read it before you press it. The facts reveal one after another on a
 * `cascade()` — amount, recipient, fee, total — each rising `distances.step` on
 * `glide`, so the eye is walked down the card in the order the numbers matter.
 * The control at the foot is a track with a detent: the thumb follows the pointer
 * to a drawn notch at 62%, meets resistance past it, and parks at the notch when
 * released, so a slip stops at a rest point instead of firing or falling back.
 * Pushed through the resistance it slams home on `flick` and confirms; released
 * short of the notch it springs back on `snap`, the refusal carried by the spring
 * that carried the travel. Confirming sinks the slab on the exit ease — a payment
 * leaving is not a celebration — and the space it held collapses on `glide` to one
 * confirmed line with a tick drawn on `flick`.
 *
 * The track is a `role="slider"`: Arrow keys move to the notch and then past it,
 * Home and Escape return it, End runs it home, Enter confirms from the notch.
 * Pointer capture is taken only after 4px of travel and inside a try/catch, so a
 * plain click is never swallowed. Under reduced motion the rows fade without
 * travel, the thumb is set rather than sprung, and the sink becomes a fade.
 */
export function ConfirmSlab({
  amount,
  format = defaultFormat,
  recipient,
  account,
  fee = 0,
  note,
  confirmLabel = "Slide to send",
  sentLabel = "Sent",
  disabled = false,
  onConfirm,
  onCancel,
  onStageChange,
  className,
}: ConfirmSlabProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const titleId = `${baseId}-title`;
  const hintId = `${baseId}-hint`;

  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const travelRef = React.useRef(0);
  const controls = React.useRef<AnimationPlaybackControls | null>(null);
  const grab = React.useRef<{ x: number; from: number } | null>(null);
  const captured = React.useRef(false);

  const [travel, setTravel] = React.useState(0);
  const [percent, setPercent] = React.useState(0);
  const [stage, setStage] = React.useState<ConfirmStage>("idle");
  const [attachSlab, slabHeight] = useMeasuredHeight();

  const x = useMotionValue(0);
  const fillWidth = useTransform(x, (value) => value + THUMB + PAD * 2);
  const labelOpacity = useTransform(x, (value) =>
    travelRef.current > 0
      ? clamp(1 - value / (travelRef.current * 0.5), 0, 1)
      : 1,
  );

  useMotionValueEvent(x, "change", (value) => {
    const next =
      travelRef.current > 0 ? Math.round((value / travelRef.current) * 100) : 0;
    setPercent((previous) => (previous === next ? previous : next));
  });

  React.useEffect(() => {
    const node = trackRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    // The observer's own callback carries the measurement, so the width is never
    // read synchronously inside the effect body.
    const observer = new ResizeObserver(() => {
      const next = Math.max(
        0,
        node.getBoundingClientRect().width - PAD * 2 - THUMB,
      );
      travelRef.current = next;
      setTravel(next);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => () => controls.current?.stop(), []);

  const settle = (to: number, transition: object) => {
    controls.current?.stop();
    if (!motionSafe) {
      x.set(to);
      return;
    }
    controls.current = animate(x, to, transition);
  };

  const moveTo = (next: ConfirmStage) => {
    if (next === stage) return;
    setStage(next);
    onStageChange?.(next);
  };

  const ratio = () => (travelRef.current > 0 ? x.get() / travelRef.current : 0);

  const park = () => {
    settle(travelRef.current * DETENT, springs.snap);
    moveTo("detent");
  };

  const reset = () => {
    settle(0, springs.snap);
    moveTo("idle");
  };

  const complete = () => {
    if (stage === "sent" || disabled) return;
    setStage("sent");
    settle(travelRef.current, springs.flick);
    onConfirm?.();
    onStageChange?.("sent");
  };

  // The keyboard reads the stage rather than the thumb's live position: a second
  // press while the spring is still carrying the thumb to the notch should land
  // the slide, not park it again.
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (disabled || stage === "sent") return;
    const { key } = event;
    const atDetent = stage === "detent";
    if (key === "ArrowRight" || key === "ArrowUp") {
      if (atDetent) complete();
      else park();
    } else if (key === "ArrowLeft" || key === "ArrowDown") reset();
    else if (key === "Home" || key === "Escape") reset();
    else if (key === "End") complete();
    else if (key === "Enter" || key === " ") {
      // Enter lands the slide only once it has actually been slid to the notch.
      if (atDetent) complete();
    } else return;
    event.preventDefault();
  };

  const sent = stage === "sent";
  const live = !disabled && !sent;
  const total = amount + fee;

  const source: (SlabRow | null)[] = [
    { id: "to", label: "To", value: recipient, title: recipient },
    account ? { id: "account", label: "Account", value: account } : null,
    { id: "fee", label: "Fee", value: format(fee) },
    { id: "total", label: "Total", value: format(total), strong: true },
    note ? { id: "note", label: "For", value: note, title: note } : null,
  ];
  const rows = source.filter((row): row is SlabRow => row !== null);

  const stagger = cascade(rows.length + 2);
  const reveal = (index: number) => ({
    initial: motionSafe
      ? { opacity: 0, y: distances.step }
      : { opacity: 0, y: 0 },
    animate: { opacity: 1, y: 0 },
    transition: motionSafe
      ? { ...springs.glide, delay: index * stagger }
      : { duration: durations.fast, ease: easings.enter },
  });

  return (
    <div className={cn("flex w-full flex-col", className)}>
      <motion.div
        initial={false}
        animate={{ height: sent ? 0 : (slabHeight ?? "auto") }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
        className="overflow-hidden"
      >
        <motion.div
          ref={attachSlab}
          inert={sent}
          aria-hidden={sent}
          role="group"
          aria-labelledby={titleId}
          initial={false}
          animate={{
            opacity: sent ? 0 : 1,
            y: sent && motionSafe ? distances.step : 0,
            scale: sent && motionSafe ? 0.98 : 1,
          }}
          transition={{
            duration: sent ? durations.base : durations.fast,
            ease: sent ? easings.exit : easings.enter,
          }}
          className={cn(
            "flex flex-col gap-3 rounded-3 border border-hairline bg-card p-4",
            disabled && "opacity-60",
          )}
        >
          <motion.div
            {...reveal(0)}
            className="flex items-start justify-between gap-3"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span
                id={titleId}
                className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
              >
                Confirm transfer
              </span>
              <span className="font-mono text-2xl leading-none text-ink tabular-nums">
                {format(amount)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onCancel?.()}
              disabled={disabled}
              className={cn(
                "flex h-7 shrink-0 cursor-pointer items-center rounded-2 px-2 text-xs font-medium text-ink-3 transition-colors outline-none hover:bg-accent hover:text-foreground",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              Cancel
            </button>
          </motion.div>

          <dl className="flex flex-col gap-1.5 border-t border-hairline pt-3">
            {rows.map((row, index) => (
              <motion.div
                key={row.id}
                {...reveal(index + 1)}
                className="flex items-baseline justify-between gap-3 text-xs"
              >
                <dt className="shrink-0 text-ink-3">{row.label}</dt>
                <dd
                  title={row.title}
                  className={cn(
                    "min-w-0 truncate text-right tabular-nums",
                    row.strong ? "font-medium text-ink" : "text-ink-2",
                  )}
                >
                  {row.value}
                </dd>
              </motion.div>
            ))}
          </dl>

          <motion.div
            {...reveal(rows.length + 1)}
            ref={trackRef}
            style={{ height: TRACK_H }}
            className={cn(
              "relative w-full rounded-full border border-hairline bg-surface-2 select-none",
              disabled && "opacity-60",
            )}
          >
            <motion.span
              aria-hidden
              style={{ width: fillWidth }}
              className={cn(
                "absolute top-0 bottom-0 left-0 rounded-full transition-colors",
                stage === "idle" ? "bg-cobalt-wash" : "bg-primary/20",
              )}
            />

            {/* The notch is placed from the measured travel, so it sits under
                the thumb's centre at any track width rather than at a guessed
                pixel that drifts as the container changes. */}
            <span
              aria-hidden
              style={{ left: PAD + THUMB / 2 + DETENT * travel }}
              className={cn(
                "absolute top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 transition-colors",
                stage === "idle" ? "bg-ink-3" : "bg-primary",
              )}
            />

            {/* Only the copy is clipped: overflow-hidden on the track itself
                would cut the thumb's focus ring off at the rail. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden px-12">
              <motion.span
                style={{ opacity: labelOpacity }}
                className="min-w-0 truncate font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase"
              >
                {confirmLabel}
              </motion.span>
            </div>

            <motion.div
              role="slider"
              tabIndex={live ? 0 : -1}
              aria-label={confirmLabel}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-valuetext={
                sent
                  ? sentLabel
                  : stage === "detent"
                    ? "Held at the detent, push past to send"
                    : `${percent} percent slid`
              }
              aria-disabled={disabled || undefined}
              aria-describedby={hintId}
              onKeyDown={handleKeyDown}
              onPointerDown={(event) => {
                if (!live || event.button !== 0) return;
                grab.current = { x: event.clientX, from: x.get() };
                captured.current = false;
                controls.current?.stop();
                event.currentTarget.focus();
              }}
              onPointerMove={(event) => {
                const from = grab.current;
                if (!from || !live) return;
                const dx = event.clientX - from.x;
                if (!captured.current) {
                  if (Math.abs(dx) < CAPTURE_PX) return;
                  try {
                    event.currentTarget.setPointerCapture(event.pointerId);
                  } catch {
                    // A synthetic sweep has no stream to claim; the drag still
                    // tracks, it just cannot own the pointer.
                  }
                  captured.current = true;
                }
                x.set(resisted(from.from + dx, travelRef.current));
                if (ratio() >= COMMIT) {
                  grab.current = null;
                  captured.current = false;
                  complete();
                }
              }}
              onPointerUp={(event) => {
                if (!grab.current) return;
                try {
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }
                } catch {
                  // Nothing to release — a synthetic pointer never captured.
                }
                const dragged = captured.current;
                grab.current = null;
                captured.current = false;
                if (!dragged) return;
                if (ratio() >= DETENT - SLACK) park();
                else reset();
              }}
              onPointerCancel={() => {
                if (!grab.current) return;
                grab.current = null;
                captured.current = false;
                reset();
              }}
              style={{ x, width: THUMB, height: THUMB, top: PAD, left: PAD }}
              className={cn(
                "absolute flex items-center justify-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                sent
                  ? "bg-success text-background"
                  : "bg-primary text-primary-foreground",
                live ? "cursor-grab active:cursor-grabbing" : "cursor-default",
              )}
            >
              {sent ? (
                <Tick motionSafe={motionSafe} />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="size-4 shrink-0"
                >
                  <path d="M9 8v8M13 8v8M17 8v8" />
                </svg>
              )}
            </motion.div>

            <span id={hintId} className="sr-only">
              Arrow keys move the thumb to the detent and then past it; Enter at
              the detent sends; Escape returns it.
            </span>
          </motion.div>
        </motion.div>
      </motion.div>

      {sent ? (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          transition={
            motionSafe
              ? { ...springs.glide, opacity: { duration: durations.base } }
              : { duration: 0 }
          }
          className="overflow-hidden"
        >
          <div className="flex items-center gap-2 rounded-3 border border-hairline bg-surface-1 px-4 py-3 text-success">
            <Tick motionSafe={motionSafe} />
            <span className="min-w-0 truncate text-sm font-medium text-foreground">
              {sentLabel} {format(total)}
            </span>
          </div>
        </motion.div>
      ) : null}

      {/* The live region sits outside the collapsing blocks: a status inside a
          subtree that is still aria-hidden when it fills can go unannounced. */}
      <span role="status" className="sr-only">
        {sent ? `${sentLabel} ${format(total)}` : ""}
      </span>
    </div>
  );
}
