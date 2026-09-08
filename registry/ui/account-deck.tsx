"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DeckAccount = {
  id: string;
  /** The account's name, as the holder would say it. */
  name: string;
  /** What kind of account it is — printed small above the name. */
  kind: string;
  /** A masked reference, e.g. `"•• 4182"`. */
  tail?: string;
  balance: number;
};

export type AccountDeckProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The accounts, left to right. */
  accounts: DeckAccount[];
  /** Controlled account id. */
  value?: string;
  /** Initial account id for uncontrolled usage. */
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  /** Formats the balance under the deck. */
  format?: (value: number) => string;
  /** Visible group label. Omit it and pass `aria-label` to label invisibly. */
  label?: React.ReactNode;
  /** Caption over the rolling figure. @default "Balance" */
  balanceLabel?: string;
  className?: string;
  "aria-label"?: string;
};

/** An explicit locale keeps the server's string and the client's identical. */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => currency.format(value);

const DIGITS = "0123456789";

/** Card geometry in px, shared by the layout and the centring maths. A fixed
 *  card (rather than a measured share of the frame) is what lets the strip's
 *  first paint land centred without waiting for a measurement. */
const CARD_W = 168;
const GAP = 12;
const PITCH = CARD_W + GAP;
/** Travel that commits one step of the pick, then re-anchors. */
const STEP_PX = 48;
/** Rails give each account a constant identity across the deck. */
const RAILS = [
  "bg-cobalt-bright",
  "bg-signal",
  "bg-success",
  "bg-warn",
] as const;

/**
 * The balance under the deck. Digit columns are ten faces tall, so a `y` of one
 * tenth of the strip's own height moves exactly one digit; they roll on `snap`
 * because the roll belongs to the pick that caused it, not to a separate event.
 */
function RollingAmount({
  text,
  motionSafe,
}: {
  text: string;
  motionSafe: boolean;
}) {
  const chars = text.split("");
  const stagger = cascade(chars.length);

  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {chars.map((char, index) => {
        const digit = DIGITS.indexOf(char);
        // Keyed from the right so the units column survives a change of length.
        const key = chars.length - index;
        if (digit < 0) {
          return (
            <span key={key} className="inline-block">
              {char}
            </span>
          );
        }
        return (
          <span
            key={key}
            className="relative inline-block h-[1.15em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
              transition={
                motionSafe
                  ? {
                      ...springs.snap,
                      delay: (chars.length - 1 - index) * stagger,
                    }
                  : { duration: 0 }
              }
            >
              {DIGITS.split("").map((face) => (
                <span
                  key={face}
                  className="flex h-[1.15em] items-center justify-center"
                >
                  {face}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * A deck of accounts with one card forward. The pick lifts on `snap` — one crisp
 * overshoot, the physics of a switch changing position — and every other card
 * recedes exactly one step, so the deck reads as two planes rather than a
 * perspective trick. The strip centres the pick by animating a motion value's
 * `x` on `snap`; half the frame is carried by a CSS translate on the wrapper, so
 * the deck is already centred on its first paint rather than sliding in once a
 * measurement lands.
 *
 * A pointer drag steps the pick: travel under 4px is ignored, which leaves plain
 * clicks intact, and the capture is taken and released inside `try`/`catch` so a
 * synthetic sweep through the deck cannot throw. Every 48px of further travel
 * commits one step and re-anchors, so a long sweep walks the deck rather than
 * jumping to an end.
 *
 * It is a `radiogroup` with a roving tabindex: Left and Right (or Up and Down)
 * step without wrapping, Home and End jump to the outer accounts, Space selects.
 * Under reduced motion nothing lifts or scales — the pick is carried by its rail,
 * border and wash — the strip jumps to the centred position, and the balance's
 * digits swap.
 */
export function AccountDeck({
  ref,
  accounts,
  value,
  defaultValue,
  onValueChange,
  format = defaultFormat,
  label,
  balanceLabel = "Balance",
  className,
  "aria-label": ariaLabel,
}: AccountDeckProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState(
    defaultValue ?? accounts[0]?.id ?? "",
  );
  const isControlled = value !== undefined;
  const current = isControlled ? value : uncontrolled;
  const index = Math.max(
    0,
    accounts.findIndex((account) => account.id === current),
  );
  const account = accounts[index];

  const cardRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  // Half the frame comes from a CSS translate on the wrapper, so the motion
  // value only carries the part that can be known without measuring anything.
  const offsetFor = (at: number) => -CARD_W / 2 - at * PITCH;
  const x = useMotionValue(offsetFor(index));
  const seeded = React.useRef(false);
  const drag = React.useRef<{
    pointerId: number;
    startX: number;
    anchorX: number;
    captured: boolean;
  } | null>(null);
  const swallowClick = React.useRef(false);

  const target = offsetFor(index);

  React.useEffect(() => {
    if (!seeded.current) {
      // The mount position is already correct, so nothing animates into place;
      // a deck that slides in on load reads as a glitch, not as a movement.
      seeded.current = true;
      x.set(target);
      return;
    }
    const controls = animate(
      x,
      target,
      motionSafe ? springs.snap : { duration: 0 },
    );
    return () => controls.stop();
  }, [target, motionSafe, x]);

  const select = (id: string) => {
    if (!id || id === current) return;
    if (!isControlled) setUncontrolled(id);
    onValueChange?.(id);
  };

  const focusAt = (to: number) => {
    const clamped = Math.min(accounts.length - 1, Math.max(0, to));
    const next = accounts[clamped];
    if (!next) return;
    cardRefs.current[clamped]?.focus();
    select(next.id);
  };

  const step = (direction: number) => {
    const clamped = Math.min(
      accounts.length - 1,
      Math.max(0, index + direction),
    );
    const next = accounts[clamped];
    if (next) select(next.id);
  };

  const handleKeyDown = (event: React.KeyboardEvent, at: number) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusAt(at + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusAt(at - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(accounts.length - 1);
        break;
      case " ":
        event.preventDefault();
        select(accounts[at]?.id ?? "");
        break;
      default:
        break;
    }
  };

  const handlePointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // A fresh press clears any suppression left by a drag that never produced
    // the click it was meant to swallow.
    swallowClick.current = false;
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      anchorX: event.clientX,
      captured: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (!state.captured) {
      if (Math.abs(event.clientX - state.startX) <= 4) return;
      state.captured = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A synthetic sweep has no live pointer to capture; the step still runs.
      }
    }
    const moved = event.clientX - state.anchorX;
    if (Math.abs(moved) < STEP_PX) return;
    state.anchorX = event.clientX;
    // Dragging right pulls the previous card into the middle, as a real deck of
    // cards moves with the hand rather than against it.
    step(moved > 0 ? -1 : 1);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    if (!state.captured) return;
    swallowClick.current = true;
    try {
      event.currentTarget.releasePointerCapture(state.pointerId);
    } catch {
      // Already released, or never captured — nothing to undo.
    }
  };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      {label ? (
        <span
          id={labelId}
          className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          {label}
        </span>
      ) : null}

      <div
        role="radiogroup"
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        // Clip, not hidden: a hidden overflow is still a scroll container, and a
        // programmatic scroll (focus-into-view, a test's click) would offset the
        // strip under the transforms that position it. A clipped box cannot scroll.
        className="relative w-full overflow-clip rounded-3 border border-hairline bg-surface-1"
      >
        <div
          className="w-full translate-x-1/2 touch-pan-y"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <motion.div style={{ x }} className="flex w-max gap-3 py-3">
            {accounts.map((entry, at) => {
              const chosen = entry.id === current;
              return (
                <motion.button
                  key={entry.id}
                  ref={(node) => {
                    cardRefs.current[at] = node;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  tabIndex={at === index ? 0 : -1}
                  style={{ width: CARD_W }}
                  onClick={() => {
                    if (swallowClick.current) {
                      swallowClick.current = false;
                      return;
                    }
                    select(entry.id);
                  }}
                  onKeyDown={(event) => handleKeyDown(event, at)}
                  // Without this the deck would play its whole recede on mount,
                  // and a page that settles as it loads reads as a glitch.
                  initial={false}
                  animate={
                    motionSafe
                      ? {
                          scale: chosen ? 1 : 0.94,
                          y: chosen ? -6 : 0,
                          opacity: chosen ? 1 : 0.7,
                        }
                      : { scale: 1, y: 0, opacity: 1 }
                  }
                  transition={
                    motionSafe
                      ? springs.snap
                      : { duration: durations.fast, ease: easings.move }
                  }
                  className={cn(
                    "flex shrink-0 flex-col gap-2 rounded-3 border p-3 text-left outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    chosen
                      ? "border-hairline-strong bg-surface-0 shadow-raised"
                      : "border-hairline bg-surface-2",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "h-1 w-8 rounded-full transition-opacity",
                      RAILS[at % RAILS.length],
                      chosen ? "opacity-100" : "opacity-40",
                    )}
                  />
                  <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                    {entry.kind}
                  </span>
                  <span className="min-w-0">
                    <span
                      title={entry.name}
                      className="block truncate text-sm font-medium text-foreground"
                    >
                      {entry.name}
                    </span>
                    {entry.tail ? (
                      <span className="block font-mono text-[11px] text-ink-3 tabular-nums">
                        {entry.tail}
                      </span>
                    ) : null}
                  </span>
                  <span className="sr-only">{format(entry.balance)}</span>
                </motion.button>
              );
            })}
          </motion.div>
        </div>

        {/* Fades match the well's own surface, so the deck runs out of the frame
            instead of stopping at a hard edge. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-surface-1 to-transparent"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-surface-1 to-transparent"
        />
      </div>

      {/* The chosen card already names the account, so the figure stands alone
          here rather than repeating it in a second voice. */}
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {balanceLabel}
        </span>
        <span className="font-mono text-2xl leading-none font-medium text-ink">
          <RollingAmount
            text={format(account?.balance ?? 0)}
            motionSafe={motionSafe}
          />
        </span>
      </div>

      <span role="status" className="sr-only">
        {account ? `${account.name}, ${format(account.balance)}` : ""}
      </span>
    </div>
  );
}
