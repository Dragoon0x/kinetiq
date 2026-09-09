"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type Transition,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TipChoice =
  | { kind: "preset"; percent: number }
  | { kind: "custom"; amount: number }
  | { kind: "none" };

export type TipTerminalProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The bill before the tip. */
  subtotal: number;
  /** Percentages offered as chips. @default [15, 18, 20] */
  presets?: number[];
  /** Controlled choice. */
  value?: TipChoice;
  /** Initial choice for uncontrolled usage. @default the middle preset */
  defaultValue?: TipChoice;
  /** Fires from the chip or pad key that changed the tip. */
  onValueChange?: (choice: TipChoice, tip: number) => void;
  /** Fires from the release or key that confirmed the payment. */
  onConfirm?: (total: number, tip: number) => void;
  /** Formats every amount the terminal prints. */
  format?: (value: number) => string;
  /** The merchant's name, printed above the subtotal. @default "Tip" */
  label?: string;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and
 * a client in another print different text for the same figure, which is a
 * hydration mismatch on the number the customer is about to pay.
 */
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const defaultFormat = (value: number) => money.format(value);

const DEFAULT_PRESETS = [15, 18, 20];

/** Pointer travel before a press on the knob becomes a slide. */
const SLOP = 4;
/** The knob's diameter and its inset from the track, in px. */
const KNOB = 36;
const INSET = 4;
/** How far along the track a release still counts as a confirm. */
const COMMIT_AT = 0.8;

const PAD_KEYS = "1 2 3 4 5 6 7 8 9 . 0 delete".split(" ");

/** Arrows step through the chips; Home and End jump to the ends. */
const KEY_MOVES: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

const tipOf = (choice: TipChoice, subtotal: number): number => {
  if (choice.kind === "none") return 0;
  if (choice.kind === "custom") return Math.max(0, round2(choice.amount));
  return Math.max(0, round2((subtotal * choice.percent) / 100));
};

/** Two choices land on the same chip; a custom tip is the same chip at any amount. */
const sameChip = (a: TipChoice, b: TipChoice): boolean =>
  a.kind === b.kind &&
  (a.kind !== "preset" || b.kind !== "preset" || a.percent === b.percent);

/** Four digits, one point, two places — the pad never holds junk. */
const pressKey = (draft: string, key: string): string => {
  if (key === "delete") return draft.slice(0, -1);
  if (key === ".")
    return draft.includes(".") ? draft : draft === "" ? "0." : `${draft}.`;
  const dot = draft.indexOf(".");
  if (dot < 0)
    return draft.length >= 4 ? draft : draft === "0" ? key : draft + key;
  return draft.length - dot > 2 ? draft : draft + key;
};

type RolledMoneyProps = {
  value: number;
  format: (value: number) => string;
  motionSafe: boolean;
  className?: string;
};

/**
 * A figure that counts to its new value on `glide` through a motion value, so
 * the roll runs outside React and re-renders nothing. Hidden from assistive
 * technology: the status sentence already carries every figure, once.
 */
function RolledMoney({
  value,
  format,
  motionSafe,
  className,
}: RolledMoneyProps) {
  const progress = useMotionValue(value);
  const text = useTransform(progress, (latest) => format(latest));

  React.useEffect(() => {
    // Reduced motion still reports the figure — only the travel is dropped.
    if (!motionSafe) {
      progress.set(value);
      return;
    }
    const controls = animate(progress, value, springs.glide);
    return () => controls.stop();
  }, [motionSafe, progress, value]);

  return (
    <motion.span
      aria-hidden
      className={cn("font-mono tabular-nums", className)}
    >
      {text}
    </motion.span>
  );
}

/**
 * The customer's turn. Preset chips, a no-tip chip and a custom chip form one
 * radio group whose highlight travels between them on `snap`; picking Custom
 * opens a numeric pad inside the card, its height measured by a ResizeObserver
 * and grown on `glide` so no room is ever reserved for it. The tip and the
 * total count to each new figure on `glide` through motion values.
 *
 * The confirm is a slide, because a tap should not be able to spend money by
 * accident: the knob follows the finger with no lag once the press has moved
 * 4px (capture is taken only then), springs back on `snap` from a short pull,
 * and past 80% of the track glides home, draws its check on `flick` and fires
 * `onConfirm` from that release. Enter, Space or End confirm by keyboard, and a
 * plain tap only nudges the knob to show which way it goes. Under reduced
 * motion the knob still tracks a drag, returns instantly, and the paid state
 * swaps in by opacity alone.
 */
export function TipTerminal({
  ref,
  subtotal,
  presets = DEFAULT_PRESETS,
  value,
  defaultValue,
  onValueChange,
  onConfirm,
  format = defaultFormat,
  label = "Tip",
  className,
}: TipTerminalProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const padLabelId = `${baseId}-pad-label`;
  const ringId = `${baseId}-ring`;

  const middle = presets[Math.floor(presets.length / 2)];
  const [uncontrolled, setUncontrolled] = React.useState<TipChoice>(
    defaultValue ??
      (middle === undefined
        ? { kind: "none" }
        : { kind: "preset", percent: middle }),
  );
  const isControlled = value !== undefined;
  const choice = isControlled ? value : uncontrolled;
  const [draft, setDraft] = React.useState(() =>
    choice.kind === "custom" && choice.amount > 0 ? String(choice.amount) : "",
  );
  const [confirmed, setConfirmed] = React.useState(false);

  const tip = tipOf(choice, subtotal);
  const total = round2(subtotal + tip);
  const showPad = choice.kind === "custom";

  // Presets take two columns each and the two plain chips split the same
  // width beneath them; floored at one so an empty preset list still lays out.
  const columns = Math.max(1, presets.length) * 2;

  const chips: {
    id: string;
    choice: TipChoice;
    label: string;
    sub?: string;
  }[] = [
    ...presets.map((percent) => ({
      id: `preset-${percent}`,
      choice: { kind: "preset", percent } as TipChoice,
      label: `${percent}%`,
      sub: format(round2((subtotal * percent) / 100)),
    })),
    { id: "none", choice: { kind: "none" }, label: "No tip" },
    { id: "custom", choice: { kind: "custom", amount: 0 }, label: "Custom" },
  ];
  const checkedIndex = Math.max(
    0,
    chips.findIndex((chip) => sameChip(chip.choice, choice)),
  );

  const commit = (next: TipChoice) => {
    if (confirmed) return;
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next, tipOf(next, subtotal));
  };

  const pick = (index: number) => {
    const chip = chips[index];
    if (!chip || sameChip(chip.choice, choice)) return;
    if (chip.choice.kind === "custom") setDraft("");
    commit(chip.choice);
  };

  const focusChip = (index: number) => {
    const clamped = clamp(index, 0, chips.length - 1);
    document.getElementById(`${baseId}-chip-${chips[clamped]?.id}`)?.focus();
    pick(clamped);
  };

  const handleChipKeyDown = (event: React.KeyboardEvent, index: number) => {
    const move = KEY_MOVES[event.key];
    const target =
      move !== undefined
        ? index + move
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? chips.length - 1
            : event.key === " "
              ? index
              : null;
    if (target === null) return;
    event.preventDefault();
    if (target === index) pick(index);
    else focusChip(target);
  };

  const pressPad = (key: string) => {
    const next = pressKey(draft, key);
    if (next === draft) return;
    setDraft(next);
    commit({ kind: "custom", amount: round2(Number.parseFloat(next) || 0) });
  };

  // The pad stays mounted (inert while closed) so one observer knows its
  // height before it is asked to open, and the wrapper animates to a measured
  // number rather than to "auto".
  const padRef = React.useRef<HTMLDivElement | null>(null);
  const [padHeight, setPadHeight] = React.useState(0);
  React.useEffect(() => {
    const node = padRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setPadHeight(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // The slide lives in motion values: the knob's offset and the track's
  // travel, both read in event handlers and never during render.
  const knobX = useMotionValue(0);
  const travel = useMotionValue(0);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const confirmedRef = React.useRef(false);
  // A click that follows a pointer press is a tap on the knob, not a confirm;
  // a click with no press behind it came from a key or assistive technology.
  const pressed = React.useRef(false);
  const running = React.useRef<AnimationPlaybackControls | null>(null);
  const gesture = React.useRef<{
    id: number;
    startX: number;
    startKnob: number;
    dragging: boolean;
  } | null>(null);

  React.useEffect(() => {
    const node = trackRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      travel.set(Math.max(0, node.clientWidth - KNOB - INSET * 2));
      // A confirmed knob stays pinned to the far end when the card resizes.
      if (confirmedRef.current) knobX.set(travel.get());
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [knobX, travel]);

  React.useEffect(() => () => running.current?.stop(), []);

  const fillWidth = useTransform(knobX, (x) => x + KNOB + INSET * 2);
  const hintOpacity = useTransform(
    [knobX, travel],
    ([x = 0, span = 0]: number[]) =>
      span > 0 ? Math.max(0, 1 - x / (span * 0.5)) : 1,
  );

  const settle = (to: number, spring: Transition) => {
    running.current?.stop();
    if (!motionSafe) {
      knobX.set(to);
      return;
    }
    running.current = animate(knobX, to, spring);
  };

  const confirm = () => {
    if (confirmed) return;
    confirmedRef.current = true;
    setConfirmed(true);
    // Past the commit point the knob glides home — a surface settling, not a
    // switch snapping; the check that follows is the acknowledgement.
    settle(travel.get(), springs.glide);
    onConfirm?.(total, tip);
  };

  /** A tap is not a slide; the knob shows which way it wants to go. */
  const nudge = () => {
    if (!motionSafe) return;
    running.current?.stop();
    running.current = animate(knobX, 12, {
      ...springs.flick,
      onComplete: () => {
        running.current = animate(knobX, 0, springs.snap);
      },
    });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || confirmed) return;
    pressed.current = true;
    running.current?.stop();
    gesture.current = {
      id: event.pointerId,
      startX: event.clientX,
      startKnob: knobX.get(),
      dragging: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    const dx = event.clientX - active.startX;
    if (!active.dragging) {
      if (Math.abs(dx) < SLOP) return;
      active.dragging = true;
      try {
        // Capture only once the press has become a slide — and never let a
        // synthetic sweep from a test suite throw on the way in.
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A pointer that already ended cannot be captured; carry on.
      }
    }
    knobX.set(clamp(active.startKnob + dx, 0, travel.get()));
  };

  const endGesture = (event: React.PointerEvent<HTMLButtonElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    gesture.current = null;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Releasing a capture the browser already dropped is not an error.
    }
    if (!active.dragging) {
      nudge();
      return;
    }
    const span = travel.get();
    if (span > 0 && knobX.get() / span >= COMMIT_AT) confirm();
    else settle(0, springs.snap);
  };

  const heightMove = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };
  const fade = { duration: durations.fast, ease: easings.enter };

  const announced = confirmed
    ? `Paid ${format(total)}`
    : `Tip ${format(tip)}, total ${format(total)}`;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-4 rounded-3 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium">{label}</span>
        <span className="shrink-0 font-mono text-xs text-ink-3 tabular-nums">
          Subtotal {format(subtotal)}
        </span>
      </div>

      <div className="flex flex-col">
        <div
          role="radiogroup"
          aria-label="Tip"
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          }}
        >
          {chips.map((chip, index) => {
            const checked = index === checkedIndex;
            return (
              <button
                key={chip.id}
                id={`${baseId}-chip-${chip.id}`}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                disabled={confirmed}
                onClick={() => pick(index)}
                onKeyDown={(event) => handleChipKeyDown(event, index)}
                style={{ gridColumn: `span ${chip.sub ? 2 : columns / 2}` }}
                className={cn(
                  "relative flex min-w-0 flex-col items-center justify-center rounded-2 border border-hairline-strong bg-surface-2 transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60",
                  chip.sub ? "h-14 gap-0.5" : "h-9",
                  checked ? "text-ink" : "text-ink-2 hover:bg-accent",
                )}
              >
                {checked ? (
                  <motion.span
                    aria-hidden
                    // Without the layoutId the ring simply appears on its chip.
                    layoutId={motionSafe ? ringId : undefined}
                    transition={springs.snap}
                    className="absolute -inset-px rounded-2 border-2 border-cobalt-bright bg-cobalt-wash"
                  />
                ) : null}
                <span className="relative text-sm font-medium">
                  {chip.label}
                </span>
                {chip.sub ? (
                  <span className="relative font-mono text-[11px] text-ink-3 tabular-nums">
                    {chip.sub}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <motion.div
          className="overflow-hidden"
          initial={false}
          animate={{ height: showPad ? padHeight : 0 }}
          transition={heightMove}
        >
          <div
            ref={padRef}
            role="group"
            aria-labelledby={padLabelId}
            aria-hidden={!showPad}
            inert={!showPad}
            className="flex flex-col gap-2 pt-2"
          >
            <div className="flex h-9 items-center justify-between rounded-2 border border-hairline bg-surface-0 px-3">
              <span id={padLabelId} className="text-xs text-ink-3">
                Custom tip
              </span>
              <span
                className={cn(
                  "font-mono text-sm tabular-nums",
                  draft === "" ? "text-ink-3" : "text-ink",
                )}
              >
                {draft === "" ? "0.00" : draft}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {PAD_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  disabled={confirmed}
                  aria-label={key === "delete" ? "Delete" : undefined}
                  onClick={() => pressPad(key)}
                  className={cn(
                    "flex h-9 items-center justify-center rounded-2 border border-hairline bg-surface-2 font-mono text-sm text-ink tabular-nums transition-colors outline-none hover:bg-accent active:bg-cobalt-wash",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60",
                  )}
                >
                  {key === "delete" ? (
                    <svg
                      viewBox="0 0 16 16"
                      aria-hidden
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-4 shrink-0"
                    >
                      <path d="M6 3.5h7.5v9H6L2.5 8z" />
                      <path d="m8 6.5 3 3M11 6.5l-3 3" />
                    </svg>
                  ) : (
                    key
                  )}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      <div className="flex flex-col gap-1 border-t border-hairline pt-3">
        <div className="flex items-center justify-between gap-3 text-xs text-ink-3">
          <span>Tip</span>
          <RolledMoney value={tip} format={format} motionSafe={motionSafe} />
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium">Total</span>
          <RolledMoney
            value={total}
            format={format}
            motionSafe={motionSafe}
            className="text-xl leading-none font-semibold text-ink"
          />
        </div>
      </div>

      <div
        ref={trackRef}
        className="relative h-11 w-full overflow-hidden rounded-full border border-hairline bg-surface-2 select-none"
      >
        <motion.span
          aria-hidden
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-colors",
            confirmed ? "bg-success/20" : "bg-cobalt-wash",
          )}
          style={{ width: fillWidth }}
        />
        <motion.span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center pl-9 text-sm font-medium text-ink-2"
          style={{ opacity: confirmed ? 0 : hintOpacity }}
        >
          Slide to confirm
        </motion.span>
        <motion.span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center pr-9 font-mono text-sm font-medium text-ink tabular-nums"
          initial={false}
          animate={{ opacity: confirmed ? 1 : 0 }}
          transition={fade}
        >
          Paid {format(total)}
        </motion.span>
        <motion.button
          type="button"
          disabled={confirmed}
          aria-label={
            confirmed
              ? `Paid ${format(total)}`
              : `Slide to confirm ${format(total)}`
          }
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          onLostPointerCapture={endGesture}
          onPointerLeave={() => {
            // A press that wanders off before it becomes a slide would
            // otherwise never see its own pointerup.
            if (gesture.current?.dragging === false) gesture.current = null;
          }}
          onClick={() => {
            if (pressed.current) {
              pressed.current = false;
              return;
            }
            confirm();
          }}
          onKeyDown={(event) => {
            pressed.current = false;
            if (event.key === "End") {
              event.preventDefault();
              confirm();
            }
          }}
          style={{ x: knobX }}
          className={cn(
            "absolute top-1 left-1 flex size-9 cursor-grab touch-none items-center justify-center rounded-full text-primary-foreground shadow-sm transition-colors outline-none active:cursor-grabbing",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            confirmed ? "bg-success" : "bg-primary",
          )}
        >
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
              d="M3 8h9M8.5 4.5 12 8l-3.5 3.5"
              initial={false}
              animate={{ opacity: confirmed ? 0 : 1 }}
              transition={fade}
            />
            <motion.path
              d="M3.5 8.5 6.5 11.5 12.5 4.5"
              pathLength={1}
              initial={false}
              // The check is the acknowledgement: drawn on flick, instant under
              // reduced motion, never absent.
              animate={{
                pathLength: confirmed ? 1 : 0,
                opacity: confirmed ? 1 : 0,
              }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
            />
          </svg>
        </motion.button>
      </div>

      <span role="status" className="sr-only">
        {announced}
      </span>
    </div>
  );
}
