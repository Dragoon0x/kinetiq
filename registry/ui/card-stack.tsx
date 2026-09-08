"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type StackCard = {
  id: string;
  /** Card name, printed on the strip that stays visible when tucked. */
  name: string;
  /** Last four digits, printed beside the name. */
  last4: string;
  /** Invented network wordmark on the face. */
  network?: string;
  /** Balance printed on the face; omit it and the face carries only the name. */
  balance?: number;
};

export type CardStackProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The wallet, front first. The first five are used. */
  cards: StackCard[];
  /** Controlled id of the front card. */
  value?: string;
  /** Initial front card for uncontrolled usage. @default the first card */
  defaultValue?: string;
  /** Fires from the click or key that brought a card forward. */
  onValueChange?: (id: string) => void;
  /** Formats every balance; the wallet never invents a currency. */
  format?: (value: number) => string;
  /** Forces the fan open; leave it out and hover or focus opens it. */
  expanded?: boolean;
  /** Visible heading, also the group's name. @default "Cards" */
  label?: string;
  className?: string;
};

/** A wallet reads as clutter past five. */
const MAX_CARDS = 5;
/** Step between card tops, as a share of one card's own height. */
const FAN_STEP = 30;
const TUCK_STEP = 17;
/** A card's own aspect, used to turn the count into the stage's height. */
const CARD_RATIO = 1.586;

/** Explicit locale: the server and the first client render must agree. */
const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const formatMoney = (value: number): string => MONEY.format(value);

/** Four house tints, cycled by position: no two neighbours read alike. */
const TINTS = [
  "var(--accent)",
  "var(--signal)",
  "var(--warn)",
  "var(--accent-bright)",
] as const;

/**
 * Face art from tokens alone, so a card reads in both themes and ships without
 * an asset: one tinted corner light over the surface ramp, angled by position.
 */
const faceArt = (index: number): string =>
  [
    `radial-gradient(120% 105% at ${18 + index * 16}% 0%, color-mix(in oklab, ${
      TINTS[index % TINTS.length]
    } 42%, transparent), transparent 62%)`,
    `linear-gradient(${142 + index * 12}deg, var(--bg-2), var(--bg-1) 72%)`,
  ].join(", ");

/**
 * A wallet. Cards shingle down the stage with the strip that names each one
 * left showing; hovering the stack, or moving focus into it, fans it — every
 * card slides to a wider step on `glide`, the layout spring, because a stack
 * opening is a set of surfaces shifting rather than a switch taking a position.
 * Picking a card brings it to the front on `snap`, one crisp overshoot, and the
 * others tuck behind it in the order they were in, so working through the
 * wallet reads as rotation rather than a reshuffle.
 *
 * Every offset is a percentage of a card's own height and the stage's height is
 * a percentage of its own width, computed from the count — nothing is measured,
 * nothing is reserved, and the whole instrument scales with its column instead
 * of overhanging a narrow one.
 *
 * It is a radio group with a roving tabindex: Down and Right take the next card
 * to the front, Up and Left the previous, Home and End the ends of the wallet.
 * Under reduced motion the fan stays open from the first paint, so the wallet is
 * legible without a hover, and picking swaps the order instantly — which card
 * leads is still plain from its ring and its weight.
 */
export function CardStack({
  ref,
  cards,
  value,
  defaultValue,
  onValueChange,
  format = formatMoney,
  expanded,
  label = "Cards",
  className,
}: CardStackProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const labelId = `${uid}-label`;

  const wallet = cards.slice(0, MAX_CARDS);
  const count = Math.max(wallet.length, 1);

  const [uncontrolled, setUncontrolled] = React.useState<string>(
    defaultValue ?? wallet[0]?.id ?? "",
  );
  const isControlled = value !== undefined;
  const currentId = isControlled ? value : uncontrolled;
  const currentIndex = Math.max(
    0,
    wallet.findIndex((card) => card.id === currentId),
  );

  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  // Which gesture moved the cards last: a fan glides, a pick snaps. Keeping it
  // in state means the render never has to guess which physics to use.
  const [picked, setPicked] = React.useState(false);

  const fanned = expanded ?? (!motionSafe || hovered || focused);
  const buttons = React.useRef<(HTMLButtonElement | null)[]>([]);

  const select = (index: number) => {
    const card = wallet[index];
    if (!card) return;
    setPicked(true);
    if (card.id === currentId) return;
    if (!isControlled) setUncontrolled(card.id);
    onValueChange?.(card.id);
  };

  const focusAt = (index: number) => {
    const wrapped = ((index % count) + count) % count;
    buttons.current[wrapped]?.focus();
    select(wrapped);
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        event.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        event.preventDefault();
        focusAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(count - 1);
        break;
      case " ":
      case "Enter":
        event.preventDefault();
        select(index);
        break;
      default:
        break;
    }
  };

  // The stage holds the fanned stack at any width: one card plus a step for
  // each card behind it, expressed against the card's own aspect.
  const stageHeight = ((1 + (count - 1) * (FAN_STEP / 100)) / CARD_RATIO) * 100;
  // Tucked, the stack is shorter than the stage, so it sits centred in it
  // rather than leaving all its slack under the last card.
  const tuckOffset = ((count - 1) * (FAN_STEP - TUCK_STEP)) / 2;

  const front = wallet[currentIndex];
  const sentence = front
    ? `${front.name}, ending ${front.last4}${
        front.balance === undefined ? "" : `, balance ${format(front.balance)}`
      }`
    : "No cards";

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {count} in wallet
        </span>
      </div>

      <div
        role="radiogroup"
        aria-labelledby={labelId}
        onPointerEnter={() => {
          setHovered(true);
          setPicked(false);
        }}
        onPointerLeave={() => {
          setHovered(false);
          setPicked(false);
        }}
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          // Moving between two cards blurs one and focuses the next; without
          // this the fan would shut for a frame between them.
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setFocused(false);
            setPicked(false);
          }
        }}
        className="relative w-full"
        style={{ paddingBottom: `${stageHeight}%` }}
      >
        {wallet.map((card, index) => {
          // Position in the fanned order: the chosen card leads, the rest
          // follow in the order they were in, so the wallet rotates.
          const place = (index - currentIndex + count) % count;
          const chosen = index === currentIndex;
          // A shingle only works one way round: the card in front sits lowest
          // and covers the one above it, which is what leaves every card's
          // naming strip showing. Put the chosen card at the top of the stage
          // instead and it would hide the strip of every card behind it.
          const depth = count - 1 - place;
          const offset = fanned
            ? depth * FAN_STEP
            : depth * TUCK_STEP + tuckOffset;
          return (
            <motion.button
              key={card.id}
              ref={(node) => {
                buttons.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={chosen}
              tabIndex={chosen ? 0 : -1}
              aria-label={`${card.name}, ending ${card.last4}${
                card.balance === undefined
                  ? ""
                  : `, balance ${format(card.balance)}`
              }`}
              onClick={() => select(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              style={{
                aspectRatio: String(CARD_RATIO),
                backgroundImage: faceArt(index),
                zIndex: count - place,
              }}
              initial={false}
              animate={{
                y: `${offset}%`,
                scale: 1 - Math.min(place, 3) * 0.02,
              }}
              transition={
                motionSafe
                  ? picked
                    ? springs.snap
                    : springs.glide
                  : { duration: 0 }
              }
              className={cn(
                "absolute top-0 left-0 flex w-full origin-top flex-col justify-between rounded-3 border p-[4.5%] text-left text-ink shadow-sm outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                chosen
                  ? "border-cobalt-bright"
                  : "border-hairline-strong hover:border-ink-3",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "min-w-0 truncate text-[13px]",
                    chosen ? "font-semibold" : "font-medium text-ink-2",
                  )}
                >
                  {card.name}
                </span>
                <span
                  aria-hidden
                  className="shrink-0 font-mono text-[11px] tracking-[0.06em] tabular-nums"
                >
                  ···· {card.last4}
                </span>
              </span>

              <span
                aria-hidden
                className="flex items-end justify-between gap-2"
              >
                <span className="min-w-0 truncate font-mono text-[10px] tracking-[0.1em] text-ink-3 uppercase">
                  {card.network ?? "Waylight"}
                </span>
                {card.balance === undefined ? null : (
                  <span className="shrink-0 font-mono text-sm font-medium tabular-nums">
                    {format(card.balance)}
                  </span>
                )}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Decoration: the live region below is what a reader is told, so the
          front card is announced once rather than twice in two voices. */}
      <p
        aria-hidden
        className="flex items-center gap-1.5 border-t border-hairline pt-3 text-[11px] text-ink-3"
      >
        <span className="size-1.5 shrink-0 rounded-full bg-cobalt-bright" />
        <span className="min-w-0 truncate">
          {front ? `${front.name} at the front` : "Wallet empty"}
        </span>
      </p>

      <p role="status" className="sr-only">
        {sentence} is at the front.
      </p>
    </div>
  );
}
