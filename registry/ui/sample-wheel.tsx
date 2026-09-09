"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type WheelScore = { name: string; value: number };

export type WheelSample = {
  id: string;
  /** The short id printed on the rim chip: "S-07". */
  label: string;
  /** What the sample is; prints beneath the wheel. */
  title: string;
  /** The overall score, 0–100. */
  score: number;
  passed: boolean;
  /** Up to three named scores on 0–100. */
  scores: WheelScore[];
};

export type SampleWheelProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Clockwise from the front. */
  samples: WheelSample[];
  /** Controlled sample id. */
  value?: string;
  /** Initial sample id for uncontrolled usage. @default the first sample */
  defaultValue?: string;
  /** Fires from the step, key, chip press or drag release that changed the pick. */
  onValueChange?: (id: string) => void;
  /** Names the wheel for assistive technology. */
  label: string;
  className?: string;
};

/** Chip centres sit this far from the square's centre, as a share of its side. */
const RIM = 0.37;
/** Travel before a press becomes a drag, so a chip click is never swallowed. */
const DRAG_SLOP = 4;
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** Node and the browser can differ in a float's last digits; round before an attribute. */
const round3 = (value: number) => Number(value.toFixed(3));
const mod = (n: number, m: number) => ((n % m) + m) % m;

/** Where each key sends the pick, from the focused chip's index and the last. */
const KEYS: Record<string, (index: number, last: number) => number> = {
  ArrowRight: (index) => index + 1,
  ArrowDown: (index) => index + 1,
  ArrowLeft: (index) => index - 1,
  ArrowUp: (index) => index - 1,
  Home: () => 0,
  End: (_, last) => last,
  " ": (index) => index,
};

const CONTROL =
  "flex size-8 shrink-0 items-center justify-center rounded-2 border border-hairline-strong bg-surface-0 text-ink-2 transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 disabled:hover:bg-surface-0";

function Chevron({ back }: { back?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-4", back && "-scale-x-100")}
    >
      <path d="m6 4 4 4-4 4" />
    </svg>
  );
}

/** Digits that roll to their value on `snap`; hidden because the status line speaks it. */
function RollingNumber({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {value.split("").map((char, index) => (
        // Keyed from the right so the units column keeps its identity when
        // the figure gains or loses a digit.
        <span
          key={value.length - index}
          className="relative inline-block h-[1.25em] w-[1ch] overflow-hidden"
        >
          <motion.span
            className="absolute inset-x-0 top-0 flex flex-col"
            initial={false}
            animate={{ y: `${Number(char) * -10}%` }}
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
      ))}
    </span>
  );
}

/**
 * One chip in its slot. The slot turns with the ring; the chip turns back by
 * the ring's angle plus its own slot, derived from the same motion value, so
 * the label stays upright through a drag and the settle alike.
 */
function WheelChip({
  sample,
  theta,
  angle,
  checked,
  tabbable,
  refs,
  onSelect,
  onKeyDown,
}: {
  sample: WheelSample;
  /** The chip's slot on the rim, clockwise from the front, in degrees. */
  theta: number;
  angle: MotionValue<number>;
  checked: boolean;
  tabbable: boolean;
  refs: Map<string, HTMLButtonElement>;
  onSelect: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const upright = useTransform(angle, (value) => round3(-(value + theta)));
  const radians = (theta * Math.PI) / 180;
  const left = round3(50 + RIM * 100 * Math.sin(radians));
  const top = round3(50 - RIM * 100 * Math.cos(radians));

  return (
    <div
      className="absolute"
      style={{
        left: `${left}%`,
        top: `${top}%`,
        transform: `translate(-50%, -50%) rotate(${round3(theta)}deg)`,
      }}
    >
      {/* The failure tick sits outward of the chip in the slot's frame, so it
          stays radial from any angle and reads before the chip is chosen. */}
      {sample.passed ? null : (
        <span
          aria-hidden
          className="absolute -top-3 left-1/2 h-2 w-0.5 -translate-x-1/2 rounded-full bg-danger"
        />
      )}
      <motion.button
        ref={(node) => {
          if (node) refs.set(sample.id, node);
          else refs.delete(sample.id);
        }}
        type="button"
        role="radio"
        aria-checked={checked}
        aria-label={`Sample ${sample.label}, ${sample.passed ? "pass" : "fail"}, score ${sample.score}`}
        tabIndex={tabbable ? 0 : -1}
        onClick={onSelect}
        onKeyDown={onKeyDown}
        style={{ rotate: upright }}
        className={cn(
          "flex h-6 items-center rounded-full border px-2 font-mono text-[10px] font-medium tabular-nums transition-colors outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          checked
            ? sample.passed
              ? "border-primary bg-primary text-primary-foreground"
              : "border-danger bg-danger text-destructive-foreground"
            : sample.passed
              ? "border-hairline-strong bg-surface-0 text-ink-2 hover:bg-accent"
              : "border-danger bg-surface-0 text-danger hover:bg-danger/10",
        )}
      >
        {sample.label}
      </motion.button>
    </div>
  );
}

type Drag = {
  id: number;
  x: number;
  y: number;
  /** The ring's angle when the press began. */
  base: number;
  /** The pointer's last bearing from the centre, so a turn past 180° adds up. */
  last: number;
  turned: number;
  live: boolean;
};

/**
 * Evaluation samples as chips around a rim, inside a square that clips its
 * own corners. The ring turns so the chosen sample sits at the front under a
 * fixed notch: Prev, Next and the arrow keys turn it one detent on `snap`,
 * the crisp overshoot of a wheel finding its stop, while every chip turns
 * back by the same angle so its label stays upright. Dragging anywhere on
 * the ring turns it with the pointer — capture begins after four pixels, so
 * a chip click is never swallowed — and release settles to the nearest
 * detent on `snap`, choosing whatever landed at the front. Failed samples
 * carry a danger tick outside their chip and a danger stroke on it, visible
 * from any angle. The hub reads the front sample, its score rolling on
 * `snap`; beneath, its title and score bars filling on `glide`.
 *
 * It is a radiogroup with a roving tabindex: Right and Down step clockwise,
 * Left and Up anticlockwise, Home and End jump, Space selects. Under reduced
 * motion the ring jumps to its detent, the chips set upright at once, the
 * digits swap and the bars fill on a tween.
 */
export function SampleWheel({
  ref,
  samples,
  value,
  defaultValue,
  onValueChange,
  label,
  className,
}: SampleWheelProps) {
  const motionSafe = useMotionSafe();
  const count = samples.length;
  const step = 360 / Math.max(1, count);

  const [uncontrolled, setUncontrolled] = React.useState(
    () => defaultValue ?? samples[0]?.id ?? "",
  );
  const isControlled = value !== undefined;
  const current = isControlled ? value : uncontrolled;
  const currentIndex = Math.max(
    0,
    samples.findIndex((sample) => sample.id === current),
  );
  const front = samples[currentIndex];

  // The ring's angle lives in a motion value so a drag never re-renders;
  // sample i sits at the front when the ring has turned by −i steps.
  const angle = useMotionValue(round3(-currentIndex * step));
  const settling = React.useRef<{ stop: () => void } | null>(null);
  const drag = React.useRef<Drag | null>(null);
  const [released, setReleased] = React.useState(0);
  // A stable map, keyed by id rather than index because motion memoises a
  // chip's ref callback; state rather than a ref so render may hand it out.
  const [refs] = React.useState(() => new Map<string, HTMLButtonElement>());

  const select = (id: string) => {
    if (id === current) return;
    if (!isControlled) setUncontrolled(id);
    onValueChange?.(id);
  };

  // Every pick, and every release, settles the ring on the nearest turn that
  // puts the pick at the front: a wrap from last to first is one step, not a
  // whole spin back.
  React.useEffect(() => {
    if (count === 0 || drag.current) return;
    const detent = -currentIndex * step;
    const here = angle.get();
    const target = round3(detent + 360 * Math.round((here - detent) / 360));
    if (!motionSafe) {
      angle.set(target);
      return;
    }
    const controls = animate(angle, target, springs.snap);
    settling.current = controls;
    return () => controls.stop();
  }, [currentIndex, step, count, released, motionSafe, angle]);

  const moveTo = (index: number) => {
    const sample = samples[mod(index, Math.max(1, count))];
    if (!sample) return;
    refs.get(sample.id)?.focus({ preventScroll: true });
    select(sample.id);
  };

  const onChipKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const move = KEYS[event.key];
    if (!move) return;
    event.preventDefault();
    moveTo(move(index, count - 1));
  };

  const bearing = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const dy = event.clientY - (box.top + box.height / 2);
    const dx = event.clientX - (box.left + box.width / 2);
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (count === 0 || event.button !== 0) return;
    // A press takes the ring from wherever a settle has got it.
    settling.current?.stop();
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      base: angle.get(),
      last: bearing(event),
      turned: 0,
      live: false,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    // A release the square never saw (a mouse let go outside it) must not
    // leave a press behind for the next hover to drag with.
    if (event.buttons === 0) {
      drag.current = null;
      return;
    }
    if (!state.live) {
      const travel = Math.hypot(
        event.clientX - state.x,
        event.clientY - state.y,
      );
      if (travel < DRAG_SLOP) return;
      state.live = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A synthetic pointer may refuse capture; the turn still follows it.
      }
    }
    const now = bearing(event);
    let diff = now - state.last;
    if (diff > 180) diff -= 360;
    else if (diff < -180) diff += 360;
    state.last = now;
    state.turned += diff;
    angle.set(round3(state.base + state.turned));
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    drag.current = null;
    // Every release re-settles, so a press that stopped a settle mid-flight
    // cannot leave the ring between detents.
    setReleased((tick) => tick + 1);
    // Under four pixels this was a click, and the chip beneath it answers.
    if (!state.live) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Nothing to release when capture never took.
    }
    const landed = samples[mod(Math.round(-angle.get() / step), count)];
    if (landed) select(landed.id);
  };

  const fill = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };
  const inset = round3((0.5 - RIM) * 100);

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        className="relative aspect-square w-full cursor-grab touch-none overflow-clip rounded-3 border border-hairline bg-surface-1 select-none active:cursor-grabbing"
      >
        {/* The notch is fixed to the square: the front is wherever it points. */}
        <span
          aria-hidden
          className="absolute top-1.5 left-1/2 z-10 h-2.5 w-0.5 -translate-x-1/2 rounded-full bg-ink"
        />

        <motion.div
          role="radiogroup"
          aria-label={label}
          className="absolute inset-0"
          style={{ rotate: angle }}
        >
          <span
            aria-hidden
            className="absolute rounded-full border border-hairline-strong"
            style={{ inset: `${inset}%` }}
          />
          {samples.map((sample, index) => (
            <WheelChip
              // Keyed with the count so a change of ring re-slots every chip.
              key={`${sample.id}-${count}`}
              sample={sample}
              theta={index * step}
              angle={angle}
              checked={index === currentIndex}
              tabbable={index === currentIndex}
              refs={refs}
              onSelect={() => select(sample.id)}
              onKeyDown={(event) => onChipKey(event, index)}
            />
          ))}
        </motion.div>

        {/* The hub repeats what the checked radio already says, so it stays
            out of the tree and the status line speaks the change. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5"
        >
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {front?.label ?? "No samples"}
          </span>
          <span className="font-mono text-2xl font-medium text-ink">
            <RollingNumber
              value={String(Math.round(front?.score ?? 0))}
              motionSafe={motionSafe}
            />
          </span>
          <span
            className={cn(
              "font-mono text-[10px] font-medium tracking-[0.08em] uppercase",
              front?.passed ? "text-success" : "text-danger",
            )}
          >
            {front ? (front.passed ? "Pass" : "Fail") : ""}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Previous sample"
          disabled={count < 2}
          onClick={() => moveTo(currentIndex - 1)}
          className={CONTROL}
        >
          <Chevron back />
        </button>
        <span
          title={front?.title}
          className="min-w-0 flex-1 truncate text-center text-sm font-medium"
        >
          {front?.title ?? "—"}
        </span>
        <button
          type="button"
          aria-label="Next sample"
          disabled={count < 2}
          onClick={() => moveTo(currentIndex + 1)}
          className={CONTROL}
        >
          <Chevron />
        </button>
      </div>

      <ul className="flex list-none flex-col gap-1.5">
        {(front?.scores ?? []).slice(0, 3).map((score) => {
          const scoreValue = Math.round(
            Math.min(100, Math.max(0, score.value)),
          );
          return (
            <li key={score.name} className="flex flex-col gap-1">
              <span className="flex h-4 items-center justify-between gap-3 text-[11px]">
                <span className="min-w-0 truncate text-ink-2">
                  {score.name}
                </span>
                <span className="shrink-0 font-mono text-ink-3 tabular-nums">
                  {scoreValue}
                </span>
              </span>
              <div
                role="meter"
                aria-label={score.name}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={scoreValue}
                className="h-1.5 w-full overflow-hidden rounded-full bg-hairline-strong"
              >
                <motion.span
                  className="block h-full origin-left rounded-full bg-cobalt-bright"
                  initial={false}
                  animate={{ scaleX: scoreValue / 100 }}
                  transition={fill}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <span role="status" className="sr-only">
        {front
          ? `Sample ${front.label}, ${front.passed ? "pass" : "fail"}, score ${front.score}`
          : ""}
      </span>
    </div>
  );
}
