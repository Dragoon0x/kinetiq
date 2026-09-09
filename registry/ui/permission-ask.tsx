"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PermissionRisk = "low" | "medium" | "high";

export type PermissionDecision = "allowed" | "denied";

export type PermissionAskProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Raises the card. Close it from `onAllow` or `onDeny`. @default false */
  open?: boolean;
  /** The tool's name, printed in mono on the row and the card. */
  tool: string;
  /** What the call acts on, printed after the name. */
  target?: string;
  /** Why the call needs asking, in one sentence. */
  reason: string;
  /** Risk level printed on the card's chip, by word and tone. @default "medium" */
  risk?: PermissionRisk;
  /** Milliseconds before Allow can be pressed. 0 arms it at once. @default 700 */
  armDelay?: number;
  /** The outcome, owned by the host; greys the row when denied. */
  decision?: PermissionDecision;
  /** Fires from the armed Allow control. */
  onAllow?: () => void;
  /** Fires from Deny or Escape. */
  onDeny?: () => void;
  /** Fires once when the Allow control arms. */
  onArmed?: () => void;
  /** Names the frame for assistive technology. */
  label: string;
  className?: string;
};

const RISK_TONE: Record<PermissionRisk, string> = {
  low: "border-hairline-strong text-ink-3",
  medium: "border-warn/50 text-warn",
  high: "border-danger/50 text-danger",
};

/** Keeps callbacks out of effect dependencies so a re-render never restarts the arming. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

type AskCardProps = {
  tool: string;
  reason: string;
  risk: PermissionRisk;
  armDelay: number;
  motionSafe: boolean;
  onAllow?: () => void;
  onDeny?: () => void;
  onArmed?: () => void;
};

/**
 * The card is its own component so that each ask mounts fresh: the arming
 * fill starts from nothing and focus is taken and returned per card.
 */
function AskCard({
  tool,
  reason,
  risk,
  armDelay,
  motionSafe,
  onAllow,
  onDeny,
  onArmed,
}: AskCardProps) {
  const baseId = React.useId();
  const titleId = `${baseId}-title`;
  const reasonId = `${baseId}-reason`;
  const hintId = `${baseId}-hint`;
  const denyRef = React.useRef<HTMLButtonElement | null>(null);
  const allowRef = React.useRef<HTMLButtonElement | null>(null);
  const armedRef = useLatest(onArmed);

  const instant = armDelay <= 0;
  const [armed, setArmed] = React.useState(instant);
  // The fill lives in a motion value, not state: a hidden tab stops it and
  // leaving resumes from what is left, with nothing re-rendering in between.
  const progress = useMotionValue(instant ? 1 : 0);

  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    if (armed || !visible) return;
    const controls = animate(progress, 1, {
      // The wait is information, so the fill runs at the same linear rate
      // under reduced motion.
      duration: (armDelay / 1000) * (1 - progress.get()),
      ease: easings.linear,
      onComplete: () => {
        setArmed(true);
        armedRef.current?.();
      },
    });
    return () => controls.stop();
  }, [armed, visible, armDelay, progress, armedRef]);

  // Focus lands on Deny — the safe answer, and the only one live yet — and
  // goes back to whatever had it once the card has finished leaving.
  React.useEffect(() => {
    const previous = document.activeElement;
    denyRef.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus();
      }
    };
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onDeny?.();
      return;
    }
    if (event.key !== "Tab") return;
    const stops = [denyRef.current, allowRef.current].filter(
      (node): node is HTMLButtonElement => node !== null && !node.disabled,
    );
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <motion.div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={reasonId}
      onKeyDown={handleKeyDown}
      variants={{
        hidden: { opacity: 0, y: motionSafe ? distances.shift : 0 },
        shown: { opacity: 1, y: 0 },
        // Deny sinks; Allow lifts. The direction arrives through `custom`
        // because the decision is only known in the render that removes it.
        exit: (decision?: PermissionDecision) => ({
          opacity: 0,
          y: !motionSafe
            ? 0
            : decision === "allowed"
              ? -distances.step
              : distances.shift,
          transition: exitFor(),
        }),
      }}
      initial="hidden"
      animate="shown"
      exit="exit"
      transition={
        motionSafe
          ? { ...springs.snap, opacity: { duration: durations.fast } }
          : { duration: durations.fast }
      }
      className="mt-2 flex flex-col gap-3 rounded-2 border border-hairline-strong bg-popover p-3 text-popover-foreground shadow-raised"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p id={titleId} className="text-sm font-semibold">
            Allow <span className="font-mono font-medium">{tool}</span>?
          </p>
          <p id={reasonId} className="text-xs leading-relaxed text-ink-2">
            {reason}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex h-6 shrink-0 items-center rounded-full border px-2 text-[11px] font-medium capitalize",
            RISK_TONE[risk],
          )}
        >
          {risk} risk
        </span>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          ref={denyRef}
          type="button"
          onClick={() => onDeny?.()}
          className={cn(
            "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          Deny
        </button>
        <button
          ref={allowRef}
          type="button"
          disabled={!armed}
          aria-describedby={armed ? undefined : hintId}
          onClick={() => {
            if (armed) onAllow?.();
          }}
          className={cn(
            "relative flex h-8 items-center overflow-hidden rounded-2 border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-[opacity,background-color] duration-150 outline-none hover:bg-primary/90",
            "disabled:cursor-default disabled:opacity-55",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <span className="relative">Allow</span>
          {/* The fill is a scale, not a width, so it never reflows the label. */}
          <motion.span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary-foreground/70"
            style={{ scaleX: progress }}
          />
        </button>
      </div>
      <span id={hintId} className="sr-only">
        Arms after a moment.
      </span>
    </motion.div>
  );
}

/**
 * A risky tool call held at the gate. The frame shows the call as a row — the
 * tool in mono, its target, a state chip — and when the host opens the ask a
 * card rises beneath it from `distances.shift` on `snap`, one crisp
 * overshoot, while the frame grows to a height measured by a ResizeObserver
 * on `glide`. Allow is disarmed as the card rises: a hairline fill runs
 * along its foot for `armDelay` on a linear tween, and only when it reaches
 * the end does the control enable — a control that can be pressed the
 * instant it appears is a control that gets pressed by accident.
 *
 * Deny sinks the card downward on the exit ease and greys the row on a
 * colour tween; Allow lifts it upward on the same ease. The card is an alert
 * dialog: focus lands on Deny, Tab cycles between the two answers, Escape
 * denies, and focus returns to where it was. Under reduced motion the card
 * fades in place, the height changes on a tween, and the arming fill still
 * runs, because the wait is information.
 */
export function PermissionAsk({
  ref,
  open = false,
  tool,
  target,
  reason,
  risk = "medium",
  armDelay = 700,
  decision,
  onAllow,
  onDeny,
  onArmed,
  label,
  className,
}: PermissionAskProps) {
  const motionSafe = useMotionSafe();

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = React.useState(0);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    // Fires once on observe and again when the card mounts or has finished
    // leaving, so the frame follows the card rather than reserving room.
    const observer = new ResizeObserver(() => setMeasured(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const denied = !open && decision === "denied";
  const allowed = !open && decision === "allowed";
  const chip = open
    ? "Asking"
    : allowed
      ? "Allowed"
      : denied
        ? "Denied"
        : "Held";
  const announcement = open
    ? `Permission asked for ${tool}`
    : decision
      ? `${tool} ${decision}`
      : "";

  const fade = { duration: durations.base, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cn("flex w-full flex-col", className)}
    >
      <div
        className={cn(
          "flex h-9 items-center gap-2.5 rounded-2 border border-hairline bg-surface-1 px-3 transition-colors duration-300",
          denied ? "text-ink-3" : "text-foreground",
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5 font-mono text-xs">
          <span className="shrink-0 font-medium">{tool}</span>
          {target ? (
            <span
              className={cn(
                "min-w-0 truncate transition-colors duration-300",
                denied ? "text-ink-3" : "text-ink-2",
              )}
              title={target}
            >
              {target}
            </span>
          ) : null}
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={chip}
            className={cn(
              "inline-flex h-6 shrink-0 items-center rounded-full border px-2 text-[11px] font-medium",
              allowed
                ? "border-success/50 text-success"
                : open
                  ? "border-cobalt-bright/50 text-cobalt-bright"
                  : "border-hairline-strong text-ink-3",
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={fade}
          >
            {chip}
          </motion.span>
        </AnimatePresence>
      </div>

      <motion.div
        initial={false}
        animate={{ height: measured }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className="overflow-hidden"
      >
        {/* A flex column keeps the card's top margin inside the measurement
            instead of collapsing through the wrapper. */}
        <div ref={innerRef} className="flex flex-col">
          <AnimatePresence initial={false} custom={decision}>
            {open ? (
              <AskCard
                key="ask"
                tool={tool}
                reason={reason}
                risk={risk}
                armDelay={armDelay}
                motionSafe={motionSafe}
                onAllow={onAllow}
                onDeny={onDeny}
                onArmed={onArmed}
              />
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
