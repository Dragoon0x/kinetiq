"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

type Phase = "hour" | "minute";

/** The phase a caller sees: the two dials, plus the settled state after Enter. */
export type TimeDialPhase = Phase | "done";

const FACE = 208;
const OUTER_R = 82;
const INNER_R = 52;
const PUCK = 32;
/** Digit cell height in px — fixed, so the readout never waits on a measure. */
const CELL = 32;
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

const pad = (n: number) => String(n).padStart(2, "0");

/** Places a face label on the band, centred on its own point. */
const seat = (angle: number, radius: number): React.CSSProperties => {
  const radians = (angle * Math.PI) / 180;
  return {
    left: `calc(50% + ${Math.sin(radians) * radius}px)`,
    top: `calc(50% - ${Math.cos(radians) * radius}px)`,
    width: PUCK - 6,
    height: PUCK - 6,
  };
};
const wrap360 = (deg: number) => ((deg % 360) + 360) % 360;

/** Signed delta that never takes the long way round the face. */
const shortestDelta = (from: number, to: number) =>
  ((((to - from) % 360) + 540) % 360) - 180;

const parseTime = (raw: string | undefined): { h: number; m: number } => {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(raw ?? "");
  if (!match) return { h: 9, m: 30 };
  return {
    h: Math.min(23, Math.max(0, Number(match[1]))),
    m: Math.min(59, Math.max(0, Number(match[2]))),
  };
};

const spoken = (h: number, m: number, format: 12 | 24) =>
  format === 24
    ? `${pad(h)}:${pad(m)}`
    : `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h >= 12 ? "PM" : "AM"}`;

function DigitRoll({
  text,
  motionSafe,
}: {
  text: string;
  motionSafe: boolean;
}) {
  return (
    <span className="inline-flex tabular-nums" aria-hidden>
      {text.split("").map((char, index) => (
        <span
          key={index}
          className="relative h-8 w-[1ch] overflow-hidden text-center"
        >
          <motion.span
            className="absolute inset-x-0 top-0 flex flex-col"
            animate={{ y: -DIGITS.indexOf(char) * CELL }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
          >
            {DIGITS.map((digit) => (
              <span key={digit} className="h-8 leading-8">
                {digit}
              </span>
            ))}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/**
 * Pointer handlers for a round track. Capture waits for 4px of travel, because
 * taking the pointer on pointerdown swallows the plain tap — a dial's most
 * common gesture — and leaves a synthetic sweep with nothing to release.
 */
function useRingDrag(
  pick: (clientX: number, clientY: number) => void,
  onRelease: () => void,
) {
  const origin = React.useRef<{ x: number; y: number } | null>(null);
  const captured = React.useRef(false);

  const end = (event: React.PointerEvent<HTMLElement>) => {
    if (
      captured.current &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    origin.current = null;
    captured.current = false;
  };

  return {
    onPointerDown(event: React.PointerEvent<HTMLElement>) {
      if (event.button !== 0) return;
      origin.current = { x: event.clientX, y: event.clientY };
      captured.current = false;
      pick(event.clientX, event.clientY);
      event.currentTarget.focus();
    },
    onPointerMove(event: React.PointerEvent<HTMLElement>) {
      const from = origin.current;
      if (!from) return;
      if (!captured.current) {
        if (Math.hypot(event.clientX - from.x, event.clientY - from.y) < 4) {
          return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        captured.current = true;
      }
      pick(event.clientX, event.clientY);
    },
    onPointerUp(event: React.PointerEvent<HTMLElement>) {
      const pressed = origin.current !== null;
      end(event);
      if (pressed) onRelease();
    },
    onPointerCancel: end,
  };
}

export type TimeDialProps = {
  /** Controlled value, "HH:mm" in 24-hour form. */
  value?: string;
  /** Initial value for uncontrolled usage. */
  defaultValue?: string;
  /** Fires on every change, always "HH:mm" in 24-hour form. */
  onValueChange?: (value: string) => void;
  /** Face and readout style. */
  format?: 12 | 24;
  /** Minute detent. */
  minuteStep?: number;
  /** Group label. */
  label?: string;
  /** Fires when the dial moves between hour, minute and done. */
  onPhaseChange?: (phase: TimeDialPhase) => void;
  className?: string;
};

/**
 * A clock face for picking a time. Tapping or dragging the ring swings the hand
 * to that hour on `snap` — by the shortest arc, so 11 to 1 never unwinds a whole
 * turn — then the face cross-fades to minutes and the hand `glide`s across to
 * the new scale. The readout rolls only the digits that changed.
 *
 * Each phase is a real slider whose value text reads the whole time. Arrows step
 * the phase you are in, Enter advances hour to minute to done, Escape steps
 * back. Reduced motion puts the hand straight on its angle and swaps the face.
 */
export function TimeDial({
  value,
  defaultValue,
  onValueChange,
  format = 12,
  minuteStep = 5,
  label = "Time",
  onPhaseChange,
  className,
}: TimeDialProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState(() =>
    parseTime(defaultValue),
  );
  const { h: hour, m: minute } =
    value !== undefined ? parseTime(value) : uncontrolled;

  const [phase, setPhase] = React.useState<Phase>("hour");
  const [confirmed, setConfirmed] = React.useState(false);

  const faceRef = React.useRef<HTMLDivElement | null>(null);
  const lastPhase = React.useRef<Phase>(phase);

  const step = Math.min(30, Math.max(1, Math.round(minuteStep)));
  const meridiem = hour >= 12 ? "PM" : "AM";
  const handAngle = phase === "hour" ? (hour % 12) * 30 : minute * 6;
  const handLength =
    phase === "hour" && format === 24 && hour >= 12 ? INNER_R : OUTER_R;

  const rotation = useMotionValue(handAngle);

  // The hand carries an unwrapped angle so it always takes the short arc; a
  // phase change is a longer move onto another scale, so it glides instead.
  React.useEffect(() => {
    const from = rotation.get();
    const target = from + shortestDelta(from, handAngle);
    const crossed = lastPhase.current !== phase;
    lastPhase.current = phase;
    if (!motionSafe) {
      rotation.set(target);
      return;
    }
    const controls = animate(
      rotation,
      target,
      crossed ? springs.glide : springs.snap,
    );
    return () => controls.stop();
  }, [handAngle, phase, motionSafe, rotation]);

  const goPhase = (next: Phase, done = false) => {
    setPhase(next);
    setConfirmed(done);
    onPhaseChange?.(done ? "done" : next);
  };

  const to24 = (h12: number, half: string) =>
    half === "PM" ? (h12 % 12) + 12 : h12 % 12;

  const commit = (h: number, m: number) => {
    const next = { h: ((h % 24) + 24) % 24, m: ((m % 60) + 60) % 60 };
    if (next.h === hour && next.m === minute) return;
    // A new reading unsettles a confirmed time; the phase itself is unchanged.
    if (confirmed) {
      setConfirmed(false);
      onPhaseChange?.(phase);
    }
    if (value === undefined) setUncontrolled(next);
    onValueChange?.(`${pad(next.h)}:${pad(next.m)}`);
  };

  const drag = useRingDrag(
    (clientX, clientY) => {
      const rect = faceRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const dx = clientX - (rect.left + rect.width / 2);
      const dy = clientY - (rect.top + rect.height / 2);
      const angle = wrap360((Math.atan2(dx, -dy) * 180) / Math.PI);
      if (phase === "minute") {
        commit(hour, (Math.round(angle / 6 / step) * step) % 60);
        return;
      }
      const slot = Math.round(angle / 30) % 12;
      if (format === 24) {
        const inner = Math.hypot(dx, dy) < (OUTER_R + INNER_R) / 2;
        commit(inner ? slot + 12 : slot, minute);
        return;
      }
      commit(to24(slot === 0 ? 12 : slot, meridiem), minute);
    },
    // Releasing on an hour hands the face to the minutes: pick the hour, then
    // refine it, which is the flow the cross-fade is describing.
    () => phase === "hour" && goPhase("minute"),
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    const { key } = event;
    if (key === "Enter" || key === "Escape") {
      event.preventDefault();
      if (key === "Enter") goPhase("minute", phase === "minute");
      else if (confirmed) goPhase("minute");
      else if (phase === "minute") goPhase("hour");
      return;
    }
    const hourPhase = phase === "hour";
    const grain = hourPhase ? 1 : step;
    const now = hourPhase ? hour : minute;
    const forward = key === "ArrowRight" || key === "ArrowUp";
    const back = key === "ArrowLeft" || key === "ArrowDown";
    const next = forward
      ? now + grain
      : back
        ? now - grain
        : key === "Home"
          ? 0
          : key === "End"
            ? hourPhase
              ? 23
              : 60 - step
            : null;
    if (next === null) return;
    event.preventDefault();
    if (hourPhase) commit(next, minute);
    else commit(hour, next);
  };

  const slots =
    phase === "minute"
      ? Array.from({ length: 12 }, (_, i) => ({
          key: i * 5,
          text: pad(i * 5),
          angle: i * 30,
          radius: OUTER_R,
          on: i * 5 === minute,
        }))
      : Array.from({ length: format === 24 ? 24 : 12 }, (_, i) => {
          // 12-hour faces read 12 at the top; 24-hour faces put 00–11 on the
          // outer band and 12–23 on the inner one, so both halves are reachable.
          const h = format === 24 ? i : i === 0 ? 12 : i;
          return {
            key: h,
            text: format === 24 ? pad(h) : String(h),
            angle: (i % 12) * 30,
            radius: format === 24 && i >= 12 ? INNER_R : OUTER_R,
            on: (format === 24 ? h : to24(h, meridiem)) === hour,
          };
        });

  const hourText =
    format === 24 ? pad(hour) : pad(hour % 12 === 0 ? 12 : hour % 12);

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className={cn("flex w-full flex-col items-center gap-4", className)}
    >
      <span id={labelId} className="sr-only">
        {label}
      </span>
      <span role="status" className="sr-only">
        {confirmed ? "Time set" : `Picking ${phase}`}
      </span>

      <div className="flex items-center gap-1">
        {(["hour", "minute"] as const).map((target) => (
          <React.Fragment key={target}>
            {target === "minute" && (
              <span className="h-8 font-mono text-2xl leading-8 text-ink-3">
                :
              </span>
            )}
            <button
              type="button"
              aria-label={`Set ${target}`}
              aria-pressed={phase === target}
              onClick={() => goPhase(target)}
              className={cn(
                "rounded-1 border-b-2 px-1 font-mono text-2xl leading-8 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                phase === target
                  ? "border-primary text-foreground"
                  : "border-transparent text-ink-3 hover:text-foreground",
              )}
            >
              <DigitRoll
                text={target === "hour" ? hourText : pad(minute)}
                motionSafe={motionSafe}
              />
            </button>
          </React.Fragment>
        ))}
        <AnimatePresence>
          {confirmed && (
            <motion.span
              initial={{ scale: motionSafe ? 0.6 : 1, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: durations.fast } }}
              transition={motionSafe ? springs.recoil : { duration: 0 }}
              style={{ originX: 0.5, originY: 0.5 }}
              className="ml-1 font-mono text-[10px] tracking-[0.08em] text-success uppercase"
            >
              Set
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div
        ref={faceRef}
        className="relative rounded-full border border-hairline bg-surface-1"
        style={{ width: FACE, height: FACE }}
      >
        <motion.div
          className="pointer-events-none absolute inset-0"
          style={{ rotate: rotation }}
        >
          {/* The puck hangs off the hand's tip, so one height animation moves
              both and they can never disagree about where the hand ends. */}
          <motion.div
            className="absolute bottom-1/2 left-1/2 w-0.5 rounded-full bg-primary"
            style={{ marginLeft: -1 }}
            initial={false}
            animate={{ height: handLength }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
          >
            <span
              className="absolute top-0 left-1/2 rounded-full bg-primary"
              style={{
                width: PUCK,
                height: PUCK,
                marginLeft: -PUCK / 2,
                marginTop: -PUCK / 2,
              }}
            />
          </motion.div>
        </motion.div>
        <span className="pointer-events-none absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />

        {/* Both faces overlap while they cross-fade, so no mode is wanted. */}
        <AnimatePresence initial={false}>
          <motion.div
            key={phase}
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{
              opacity: 0,
              transition: { duration: durations.fast, ease: easings.exit },
            }}
            transition={{ duration: durations.base, ease: easings.enter }}
            className="pointer-events-none absolute inset-0"
          >
            {slots.map((slot) => (
              <span
                key={slot.key}
                className={cn(
                  "absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center font-mono text-[11px] tabular-nums",
                  slot.on
                    ? "font-semibold text-primary-foreground"
                    : "text-ink-2",
                )}
                style={seat(slot.angle, slot.radius)}
              >
                {slot.text}
              </span>
            ))}
          </motion.div>
        </AnimatePresence>

        {/* One slider element that re-identifies with the phase: two would
            strand focus on the finished phase the moment Enter advanced it. */}
        <div
          role="slider"
          tabIndex={0}
          aria-label={`${label} ${phase}`}
          aria-valuemin={0}
          aria-valuemax={phase === "hour" ? 23 : 59}
          aria-valuenow={phase === "hour" ? hour : minute}
          aria-valuetext={spoken(hour, minute, format)}
          onKeyDown={onKeyDown}
          {...drag}
          className="absolute inset-0 cursor-pointer rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </div>

      {format === 12 && (
        <div
          role="radiogroup"
          aria-label={`${label} meridiem`}
          className="inline-flex h-8 items-stretch rounded-full border border-hairline bg-surface-2 p-1"
        >
          {(["AM", "PM"] as const).map((half) => (
            <button
              key={half}
              type="button"
              role="radio"
              aria-checked={meridiem === half}
              tabIndex={meridiem === half ? 0 : -1}
              onClick={() => commit(to24(hour, half), minute)}
              onKeyDown={(event) => {
                if (!event.key.startsWith("Arrow")) return;
                event.preventDefault();
                commit(to24(hour, half === "AM" ? "PM" : "AM"), minute);
              }}
              className={cn(
                "relative flex w-12 items-center justify-center rounded-full font-mono text-[11px] tracking-[0.08em] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                meridiem === half
                  ? "text-foreground"
                  : "text-ink-3 hover:text-foreground",
              )}
            >
              {meridiem === half && (
                <motion.span
                  aria-hidden
                  layoutId={motionSafe ? `${baseId}-meridiem` : undefined}
                  transition={springs.snap}
                  className="absolute inset-0 rounded-full border border-hairline bg-surface-0"
                />
              )}
              <span className="relative">{half}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
