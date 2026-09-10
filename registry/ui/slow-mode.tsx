"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SlowModeProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled draft. */
  value?: string;
  /** Initial draft for uncontrolled usage. @default "" */
  defaultValue?: string;
  /** Fires from every keystroke and from the clear after a send. */
  onValueChange?: (value: string) => void;
  /** The slow-mode window, in seconds. @default 60 */
  interval?: number;
  /** Controlled seconds left. Passing it hands the clock to the host. */
  remaining?: number;
  /** Seconds left on the first paint — a plain number, never a clock. @default 0 */
  defaultRemaining?: number;
  /** Fires on every tick, on a send, and on the wake, with whole seconds. */
  onRemainingChange?: (seconds: number) => void;
  /** Fires from Enter or the Send button with the trimmed draft. */
  onSend?: (text: string) => void;
  /** Fires once when the wait reaches zero. */
  onWake?: () => void;
  /** The rest reading under the composer. Built from `interval` by default. */
  ruleLabel?: string;
  /** @default "Message the room" */
  placeholder?: string;
  /** Holds the composer and the button. @default false */
  disabled?: boolean;
  /** Names the textarea for assistive technology. */
  label: string;
  className?: string;
};

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const FADE = { duration: durations.fast, ease: easings.enter } as const;

const subscribeVisibility = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};

/** A wait should not run out while nobody is looking at it. */
function useDocumentVisible(): boolean {
  return React.useSyncExternalStore(
    subscribeVisibility,
    () => typeof document === "undefined" || !document.hidden,
    () => true,
  );
}

/** Keeps callbacks out of effect dependencies, so an inline arrow prop cannot
 *  restart the countdown on every render and stall it forever. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** Any float that reaches a motion value is rounded first: motion re-serialises
 *  what it painted on the server, and an unrounded ratio never hydrates clean. */
const ratio = (part: number, whole: number): number =>
  Number((Math.max(0, part) / Math.max(1, whole)).toFixed(4));

/** Pluralised in one string: never "1 seconds". */
const secondsPhrase = (count: number): string =>
  count === 1 ? "1 second" : `${count} seconds`;

const defaultRule = (interval: number): string =>
  interval === 60
    ? "One message a minute."
    : `One message every ${secondsPhrase(interval)}.`;

/**
 * Slow mode is a rule you can watch expire. The wait lives on the send button
 * itself: a shutter fills it edge to edge and drains away, `scaleX` from a left
 * origin on a linear tween whose duration is exactly one second per step, so
 * the ink on the button is the honest remainder and not a decoration. Over it
 * the button's word gives way to a mono countdown fed by a timeout that lives in
 * an effect, is torn down on unmount, and never runs while the tab is hidden.
 * When the drain empties the button wakes: the fill returns to primary and one
 * `snap` overshoot from 1.06× says the control is live again.
 *
 * The wait reads on hover and on focus — not in a tooltip that would float over
 * the host's page, but in the hint line under the composer, where the rule and
 * the remainder share one grid cell and cross-fade, so a fast pointer cannot
 * drop a reading behind another. The textarea is real (Enter sends, Shift+Enter
 * breaks a line, an IME composition never sends) and Send stays in the tab
 * order while held, `aria-disabled` with the wait spoken in its name rather than
 * left to be inferred from a grey box. Pass `remaining` to hand the clock to the
 * host; leave it off and the component keeps its own. Under reduced motion the
 * shutter still shows the remainder, because a fill that fills is information,
 * but it steps rather than drains and the wake swaps colour without overshoot.
 */
export function SlowMode({
  ref,
  value,
  defaultValue = "",
  onValueChange,
  interval = 60,
  remaining,
  defaultRemaining = 0,
  onRemainingChange,
  onSend,
  onWake,
  ruleLabel,
  placeholder = "Message the room",
  disabled = false,
  label,
  className,
}: SlowModeProps) {
  const motionSafe = useMotionSafe();
  const visible = useDocumentVisible();
  const baseId = React.useId();
  const hintId = `${baseId}-hint`;
  const keysId = `${baseId}-keys`;

  const windowSeconds = Math.max(1, Math.round(interval));
  const [ownValue, setOwnValue] = React.useState(defaultValue);
  const draft = value ?? ownValue;
  const [ownRemaining, setOwnRemaining] = React.useState(() =>
    Math.max(0, Math.round(defaultRemaining)),
  );
  const hostDrivesClock = remaining !== undefined;
  const left = Math.max(0, Math.round(remaining ?? ownRemaining));
  const held = left > 0;

  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const probing = (hovered || focused) && held;

  const drain = useMotionValue(held ? ratio(left, windowSeconds) : 0);
  const scale = useMotionValue(1);
  const latest = useLatest({
    onRemainingChange,
    onSend,
    onWake,
    onValueChange,
  });

  // One frozen sentence per change, decided at the change and never
  // optimistically ahead of it.
  const wake = "Slow mode has lifted. You can send again.";
  const [beat, setBeat] = React.useState(() => ({
    held,
    sentence: "",
    stamp: 0,
    woke: false,
  }));
  if (beat.held !== held) {
    setBeat((prev) => ({
      held,
      sentence: held ? `Slow mode holds you for ${secondsPhrase(left)}.` : wake,
      stamp: prev.stamp + 1,
      woke: !held,
    }));
  }

  const firstBeat = React.useRef(true);
  React.useEffect(() => {
    if (firstBeat.current) {
      firstBeat.current = false;
      return;
    }
    if (!beat.woke) return;
    latest.current.onWake?.();
    if (!motionSafe) return;
    // The wake is the one moment the control celebrates itself: a single crisp
    // overshoot, which is exactly one `snap` between two keyframes.
    scale.set(1.06);
    const controls = animate(scale, 1, springs.snap);
    return () => controls.stop();
  }, [beat.stamp, beat.woke, latest, motionSafe, scale]);

  // The clock: one timeout per second, re-armed by its own effect, so no stale
  // closure can hold an old count and nothing runs while the tab is away.
  React.useEffect(() => {
    if (hostDrivesClock || !visible || left <= 0) return;
    const timer = window.setTimeout(() => {
      const next = left - 1;
      setOwnRemaining(next);
      latest.current.onRemainingChange?.(next);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [hostDrivesClock, visible, left, latest]);

  // The drain runs one second ahead of the count, so the bar lands exactly on
  // each step instead of stuttering behind it.
  React.useEffect(() => {
    const to = left <= 0 ? 0 : ratio(left - 1, windowSeconds);
    if (!motionSafe || !visible || left <= 0) {
      drain.set(left <= 0 ? 0 : ratio(left, windowSeconds));
      return;
    }
    const controls = animate(drain, to, {
      duration: 1,
      ease: easings.linear,
    });
    return () => controls.stop();
  }, [left, windowSeconds, drain, motionSafe, visible]);

  const commitValue = (next: string) => {
    if (value === undefined) setOwnValue(next);
    onValueChange?.(next);
  };

  const send = () => {
    const text = draft.trim();
    if (disabled || held || text === "") return;
    onSend?.(text);
    commitValue("");
    if (!hostDrivesClock) setOwnRemaining(windowSeconds);
    onRemainingChange?.(windowSeconds);
    drain.set(1);
    setBeat((prev) => ({
      held: true,
      sentence: `Message sent. Slow mode holds you for ${secondsPhrase(windowSeconds)}.`,
      stamp: prev.stamp + 1,
      woke: false,
    }));
  };

  const sendName = held
    ? `Send. Slow mode holds you for ${secondsPhrase(left)} more.`
    : draft.trim() === ""
      ? "Send. Write a message first."
      : "Send the message.";

  const rule = ruleLabel ?? defaultRule(windowSeconds);

  return (
    <div ref={ref} className={cn("w-full", className)}>
      <div className="rounded-3 border border-hairline bg-surface-1 p-2">
        <div className="flex items-start gap-2">
          <textarea
            rows={1}
            value={draft}
            disabled={disabled}
            placeholder={placeholder}
            aria-label={label}
            aria-describedby={`${keysId} ${hintId}`}
            onChange={(event) => commitValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey) return;
              if (event.nativeEvent.isComposing) return;
              event.preventDefault();
              send();
            }}
            className={cn(
              "h-9 min-w-0 flex-1 resize-none overflow-y-auto rounded-2 border border-input bg-surface-0 px-2.5 py-2 text-xs leading-snug text-foreground placeholder:text-ink-3 disabled:opacity-50",
              focusRing,
            )}
          />

          <motion.button
            type="button"
            style={{ scale }}
            aria-disabled={held || disabled || draft.trim() === ""}
            aria-label={sendName}
            onClick={send}
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className={cn(
              "relative h-9 w-16 shrink-0 overflow-hidden rounded-2 text-xs font-semibold transition-colors",
              held || disabled || draft.trim() === ""
                ? "bg-muted text-muted-foreground"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
              focusRing,
            )}
          >
            {/* The remainder, drawn as ink on the control it is holding. */}
            <motion.span
              aria-hidden
              style={{ scaleX: drain }}
              className="absolute inset-0 origin-left bg-cobalt-wash"
            />
            <span className="relative grid place-items-center">
              <motion.span
                aria-hidden={!held}
                animate={{ opacity: held ? 1 : 0 }}
                transition={FADE}
                className="col-start-1 row-start-1 font-mono text-cobalt-bright tabular-nums"
              >
                {left}
              </motion.span>
              <motion.span
                aria-hidden={held}
                animate={{ opacity: held ? 0 : 1 }}
                transition={FADE}
                className="col-start-1 row-start-1"
              >
                Send
              </motion.span>
            </span>
          </motion.button>
        </div>

        {/* Two readings, one grid cell, a cross-fade: a line that must follow
            the pointer cannot wait for another reading to leave first. */}
        <div id={hintId} className="mt-1.5 grid h-4 items-center px-1">
          <motion.span
            aria-hidden={probing}
            animate={{ opacity: probing ? 0 : 1 }}
            transition={FADE}
            className="col-start-1 row-start-1 truncate font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase"
          >
            {rule}
          </motion.span>
          <motion.span
            aria-hidden={!probing}
            animate={{ opacity: probing ? 1 : 0 }}
            transition={FADE}
            className="col-start-1 row-start-1 truncate font-mono text-[10px] tracking-[0.06em] text-cobalt-bright uppercase tabular-nums"
          >
            {`${secondsPhrase(left)} left`}
          </motion.span>
        </div>
      </div>

      <span id={keysId} className="sr-only">
        Enter sends, Shift and Enter breaks the line.
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {beat.sentence}
      </span>
    </div>
  );
}
