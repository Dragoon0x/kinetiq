"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CardFaceProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Card number; non-digits are stripped and the rest padded to sixteen. */
  number?: string;
  /** Name printed on both faces. */
  holder?: string;
  /** Expiry exactly as printed. */
  expiry?: string;
  /** Three or four digits on the signature panel. */
  securityCode?: string;
  /** Invented network wordmark on the front. */
  network?: string;
  /** Names the card for assistive technology. */
  label?: string;
  /** Controlled reveal state. */
  revealed?: boolean;
  /** Initial reveal for uncontrolled usage. */
  defaultRevealed?: boolean;
  /** Fires from the click on the reveal switch. */
  onRevealedChange?: (revealed: boolean) => void;
  /** Frosts the face, hides the details and locks the switch. */
  frozen?: boolean;
  /** Reveal switch copy. @default "Show card details" */
  revealLabel?: string;
  className?: string;
};

const PANEL_DIGITS = 16;

const digitsOnly = (raw: string, max: number): string =>
  raw.replace(/\D/g, "").slice(0, max);

const inFours = (value: string): string[] => value.match(/.{1,4}/g) ?? [];

/**
 * A magnetic stripe is black and a signature panel is cream — fixed art, not
 * theme colour, so both are mixed against absolute keywords rather than tokens.
 * Everything else on the slab is token-driven and reads in either theme.
 */
const MAG_BAND = "color-mix(in oklab, black 80%, var(--bg-1))";
const PANEL = "color-mix(in oklab, white 92%, var(--accent-wash))";
const PANEL_INK = "color-mix(in oklab, black 74%, transparent)";

const FRONT_ART = [
  "radial-gradient(130% 105% at 100% 0%, color-mix(in oklab, var(--accent) 44%, transparent), transparent 58%)",
  "radial-gradient(85% 85% at 0% 100%, color-mix(in oklab, var(--signal) 20%, transparent), transparent 70%)",
  "linear-gradient(160deg, var(--bg-2), var(--bg-1) 62%, var(--bg-2))",
].join(", ");
const BACK_ART = "linear-gradient(200deg, var(--bg-2), var(--bg-1) 70%)";
/** Crystal seams, drawn as repeating gradients so the veneer carries no SVG. */
const FROST_ART = [
  "repeating-linear-gradient(118deg, transparent 0 11px, color-mix(in oklab, var(--accent-bright) 26%, transparent) 11px 12px)",
  "repeating-linear-gradient(-46deg, transparent 0 17px, color-mix(in oklab, var(--accent-bright) 18%, transparent) 17px 18px)",
  "linear-gradient(150deg, color-mix(in oklab, var(--accent-bright) 20%, transparent), color-mix(in oklab, var(--accent-bright) 8%, transparent))",
].join(", ");

const FACE =
  "absolute inset-0 flex flex-col justify-between overflow-hidden rounded-3 border border-hairline-strong p-4 text-ink";
const CAPTION = "font-mono text-[9px] tracking-[0.14em] text-ink-3 uppercase";

/** The contact plate, drawn from tokens so it survives a theme flip. */
function ChipPlate() {
  return (
    <svg viewBox="0 0 30 22" aria-hidden className="h-5 w-7 shrink-0">
      <rect
        x="0.75"
        y="0.75"
        width="28.5"
        height="20.5"
        rx="3.5"
        fill="color-mix(in oklab, var(--warn) 58%, transparent)"
        stroke="color-mix(in oklab, var(--warn) 80%, transparent)"
        strokeWidth="1.5"
      />
      <path
        d="M11 1v20M19 1v20M1 7.5h28M1 14.5h28"
        stroke="color-mix(in oklab, var(--bg-0) 55%, transparent)"
        strokeWidth="1.25"
      />
    </svg>
  );
}

type DigitCellProps = {
  digit: string;
  shown: boolean;
  delay: number;
  motionSafe: boolean;
};

/**
 * One column of the number. The bullet fades out while the digit scales up from
 * 0.86 on `flick` — a tick-draw spring, two keyframes — so the reveal reads as
 * printing rather than sliding. `w-[1ch]` with `tabular-nums` above pins the
 * cell, so a digit landing can never nudge the row it sits in.
 */
function DigitCell({ digit, shown, delay, motionSafe }: DigitCellProps) {
  const fade = { duration: durations.fast, ease: easings.enter, delay };
  return (
    <span className="relative grid w-[1ch] place-items-center">
      <motion.span
        className="col-start-1 row-start-1 text-ink-3"
        initial={false}
        animate={{ opacity: shown ? 0 : 1 }}
        transition={motionSafe ? fade : { duration: 0 }}
      >
        •
      </motion.span>
      <motion.span
        className="col-start-1 row-start-1"
        initial={false}
        animate={{ opacity: shown ? 1 : 0, scale: shown ? 1 : 0.86 }}
        transition={
          motionSafe
            ? { delay, opacity: { duration: durations.fast }, ...springs.flick }
            : { duration: 0 }
        }
      >
        {digit}
      </motion.span>
    </span>
  );
}

/**
 * A card that turns to show its back. The front is numbered but masked; the
 * reveal switch turns the whole slab on `snap` — a real `rotateY` from 0 to
 * 180, one crisp overshoot, because a card turning in the hand is a switch
 * taking a position rather than a layout gliding. Both faces carry
 * `backfaceVisibility: "hidden"` inline: a utility for that is easy to assume
 * and easy to miss, and without it the faces print through each other.
 *
 * The full number lives on the back and un-masks digit by digit as the turn
 * lands — a `cascade(16)` of `flick`s, offset just enough that the first digit
 * arrives as the face passes 90°. Hiding runs it backwards, last digit first.
 *
 * `frozen` settles a frost veneer over the slab on a tween — a frost is colour
 * arriving, not a thing travelling — turns the card home and locks the switch.
 * Freezing hides the details for as long as it lasts; clear `revealed` too if a
 * controlled card should stay shut after it thaws.
 *
 * Under reduced motion the faces cross-fade in place and every digit un-masks
 * at once, because which digits are showing is information, not flourish.
 */
export function CardFace({
  ref,
  number = "8412550722644417",
  holder = "R. ALDERWICK",
  expiry = "04/29",
  securityCode = "418",
  network = "Waylight",
  label = "Virtual card",
  revealed,
  defaultRevealed = false,
  onRevealedChange,
  frozen = false,
  revealLabel = "Show card details",
  className,
}: CardFaceProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const labelId = `${uid}-label`;
  const frostId = `${uid}-frost`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultRevealed);
  // Adjusting state while a prop changes, the supported way: a freeze closes an
  // uncontrolled reveal for good, so thawing cannot pop the digits back open.
  const [wasFrozen, setWasFrozen] = React.useState(frozen);
  if (wasFrozen !== frozen) {
    setWasFrozen(frozen);
    if (frozen && uncontrolled) setUncontrolled(false);
  }

  const isControlled = revealed !== undefined;
  const asked = isControlled ? revealed : uncontrolled;
  const open = asked && !frozen;

  const digits = digitsOnly(number, PANEL_DIGITS).padEnd(PANEL_DIGITS, "0");
  const code = digitsOnly(securityCode, 4) || "000";
  const last4 = digits.slice(-4);
  const spaced = inFours(digits).join(" ");
  const step = cascade(PANEL_DIGITS);

  const toggle = () => {
    const next = !asked;
    if (!isControlled) setUncontrolled(next);
    onRevealedChange?.(next);
  };

  const state = frozen
    ? "Card frozen"
    : open
      ? "Details shown"
      : "Details hidden";

  return (
    <div
      ref={ref}
      className={cn("flex w-full flex-col gap-3", className)}
      role="group"
      aria-labelledby={labelId}
    >
      <span id={labelId} className="sr-only">
        {label}
      </span>

      <div
        className="relative w-full"
        style={{ perspective: 1100, aspectRatio: "1.586" }}
      >
        <motion.div
          className="absolute inset-0"
          style={{ transformStyle: "preserve-3d" }}
          initial={false}
          animate={{ rotateY: motionSafe && open ? 180 : 0 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        >
          {/* Front */}
          <motion.div
            aria-hidden={open}
            className={FACE}
            style={{ backfaceVisibility: "hidden", backgroundImage: FRONT_ART }}
            initial={false}
            animate={{ opacity: motionSafe || !open ? 1 : 0 }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="truncate text-sm font-semibold tracking-tight">
                {network}
              </span>
              <span className={cn(CAPTION, "shrink-0")}>Virtual</span>
            </div>

            <ChipPlate />

            <div className="flex flex-col gap-2">
              <span className="font-mono text-[15px] tracking-[0.06em] tabular-nums">
                <span className="sr-only">
                  Card number ending {last4}, hidden
                </span>
                <span aria-hidden>•••• •••• •••• {last4}</span>
              </span>
              <div className="flex items-end justify-between gap-3">
                <span className="min-w-0 truncate font-mono text-[11px] tracking-[0.1em] text-ink-2 uppercase">
                  {holder}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className={CAPTION}>Thru</span>
                  <span className="font-mono text-[11px] tabular-nums">
                    {expiry}
                  </span>
                </span>
              </div>
            </div>
          </motion.div>

          {/* Back */}
          <motion.div
            aria-hidden={!open}
            className={cn(FACE, "gap-2 px-0 py-4")}
            style={{
              backfaceVisibility: "hidden",
              backgroundImage: BACK_ART,
              // The back carries its own half-turn so its content reads the
              // right way round once the parent has turned. Without rich
              // motion nothing turns, and the half-turn would leave the face
              // pointing away from the viewer with its backface hidden.
              transform: motionSafe ? "rotateY(180deg)" : undefined,
            }}
            initial={false}
            animate={{ opacity: motionSafe || open ? 1 : 0 }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            <div
              className="h-7 w-full"
              style={{ background: MAG_BAND }}
              aria-hidden
            />

            <div className="flex items-center gap-2 px-4">
              <span
                className="flex h-7 flex-1 items-center rounded-1 px-2"
                style={{ background: PANEL }}
                aria-hidden
              >
                <span className="h-px flex-1 bg-hairline-strong" />
              </span>
              <span
                className="flex h-7 shrink-0 items-center rounded-1 px-2 font-mono text-xs tabular-nums"
                style={{ background: PANEL, color: PANEL_INK }}
              >
                <span className="sr-only">Security code </span>
                {code}
              </span>
            </div>

            <div className="flex flex-col gap-1.5 px-4">
              <span className={CAPTION}>Card number</span>
              <span className="font-mono text-[15px] tracking-[0.06em] tabular-nums">
                <span className="sr-only">
                  {open ? `Card number ${spaced}` : "Card number hidden"}
                </span>
                <span aria-hidden className="flex items-center gap-2">
                  {inFours(digits).map((group, groupIndex) => (
                    <span key={groupIndex} className="flex">
                      {group.split("").map((digit, digitIndex) => {
                        const index = groupIndex * 4 + digitIndex;
                        // Forwards on reveal, backwards on hide: the number
                        // closes the way a shutter does, from the far end.
                        const order = open ? index : PANEL_DIGITS - 1 - index;
                        return (
                          <DigitCell
                            key={index}
                            digit={digit}
                            shown={open}
                            delay={0.09 + order * step}
                            motionSafe={motionSafe}
                          />
                        );
                      })}
                    </span>
                  ))}
                </span>
              </span>
            </div>

            <div className="flex items-end justify-between gap-3 px-4">
              <span className="min-w-0 truncate font-mono text-[11px] tracking-[0.1em] text-ink-2 uppercase">
                {holder}
              </span>
              <span className={cn(CAPTION, "shrink-0")}>{network}</span>
            </div>
          </motion.div>
        </motion.div>

        {/* The veneer sits outside the turning slab, so the frost stays on the
            surface rather than rotating away with the face beneath it. */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-3"
          style={{
            backdropFilter: "blur(3px) saturate(0.5)",
            WebkitBackdropFilter: "blur(3px) saturate(0.5)",
            backgroundImage: FROST_ART,
          }}
          initial={false}
          animate={{ opacity: frozen ? 1 : 0 }}
          transition={{ duration: durations.base, ease: easings.enter }}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={open}
          disabled={frozen}
          aria-describedby={frozen ? frostId : undefined}
          onClick={toggle}
          className={cn(
            "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            frozen
              ? "cursor-not-allowed opacity-50"
              : "hover:bg-accent active:bg-cobalt-wash",
          )}
        >
          {revealLabel}
        </button>

        {frozen ? (
          <span
            id={frostId}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-cobalt-bright"
          >
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full bg-cobalt-bright"
            />
            Frozen
          </span>
        ) : null}
      </div>

      <span role="status" className="sr-only">
        {state}
      </span>
    </div>
  );
}
