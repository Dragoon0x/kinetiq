"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import {
  clamp,
  djb2,
  liftShadowCss,
  perspectives,
  seeded,
} from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type FanCard = {
  id: string;
  /** Short face label — also the voice of the "played" announcement. */
  label: string;
  content: React.ReactNode;
};

export type CardFanProps = {
  /** The hand. The first 7 cards are used. */
  cards: FanCard[];
  /** Controlled committed card id (`null` = nothing played). */
  value?: string | null;
  /** Initial committed card for uncontrolled usage. */
  defaultValue?: string | null;
  /** Fires on every pick, before the fan folds. */
  onSelect?: (id: string) => void;
  /** Controlled fan state. */
  open?: boolean;
  /** Initial fan state for uncontrolled usage. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Card width in px; card height is 1.45×. */
  cardWidth?: number;
  className?: string;
  /** Accessible name for the control. */
  "aria-label"?: string;
};

/** Only a hand's worth of cards — the fan reads past seven as clutter. */
const MAX_CARDS = 7;
/** Total sweep across the open hand, degrees. */
const FAN_SWEEP = 36;
/** Per-card angle never exceeds this, whatever the count. */
const FAN_CAP = 22;
/** Half the sweep — the widest any card leans, sizes the scene. */
const HALF_SWEEP = FAN_SWEEP / 2;
/** Whole-hand tilt into the fake-depth wrapper when open, degrees. */
const TILT_X = 8;
/** Browse raise: the card under the pointer/focus lifts this far. */
const RAISE_Y = -14;
const RAISE_SCALE = 1.06;
/** Extra splay (degrees) siblings part around the raised card. */
const SPLAY = 3;
/** Landing bump peak — set, then released onto `recoil`. */
const BUMP_Y = -4;
/** Clearance between the played slot and the hand, px. */
const GAP = 28;
/** Slot plate padding around a seated card, px. */
const SLOT_PAD = 6;
/** Breathing room under the stack for closed-jitter droop, px. */
const BOTTOM_PAD = 4;
/**
 * Shared pivot for every card: 230% of card height puts it ~1.8 heights
 * below center, so rotation alone carries a card along the fan's arc.
 */
const PIVOT_ORIGIN = "50% 230%";
const PIVOT_RADIUS_FACTOR = 1.8;

/** Contact shadows: grounded card vs the browse-raised card. */
const SHADOW_REST = liftShadowCss(0.08);
const SHADOW_RAISED = liftShadowCss(0.5);

/** Fixed indexed accent palette — one band per card position, never random. */
const ACCENTS = [
  "oklch(0.84 0.16 162)",
  "oklch(0.78 0.15 52)",
  "oklch(0.72 0.15 258)",
  "oklch(0.74 0.19 350)",
  "oklch(0.83 0.16 86)",
  "oklch(0.8 0.14 178)",
  "oklch(0.7 0.17 300)",
] as const;

const accentFor = (index: number): string =>
  ACCENTS[index % ACCENTS.length] ?? "oklch(0.84 0.16 162)";

/** Closed-stack pose: tiny deterministic offset + tilt (≤1.5°) per index. */
const closedJitterFor = (
  index: number,
): { rotate: number; x: number; y: number } => {
  const rand = seeded(djb2(`card-fan:${index}`));
  return {
    rotate: (rand() * 2 - 1) * 1.5,
    x: (rand() * 2 - 1) * 2,
    y: -index * 0.6,
  };
};

/** Open-hand angle for a card by its position in the fan. */
const fanAngle = (handIndex: number, handCount: number): number => {
  const center = (handCount - 1) / 2;
  const step = FAN_SWEEP / Math.max(handCount - 1, 1);
  return clamp((handIndex - center) * step, -FAN_CAP, FAN_CAP);
};

/**
 * A hand of cards that fans open in a shallow 3D arc; sweep to browse, pick
 * to commit. Closed, the deck rests as a neat jittered stack behind a real
 * button (`aria-expanded`); opening fans each card about a shared pivot well
 * below the stack (transform-origin 50% 230%) on `glide`, cascading from the
 * center outward — closing runs the cascade in reverse — while the whole hand
 * leans back 8° inside a `perspectives.base` wrapper (fake depth, flat
 * transforms, no preserve-3d). Hovering with a fine pointer or focusing a
 * card raises it on `snap` (−14px, ×1.06, `liftShadow` at half altitude) and
 * its neighbors part ±3° around it. Picking commits: `onSelect` fires, the
 * card glides up into the dashed played slot, straightens to 0°, lands with a
 * `recoil` bump (y set to −4, released to rest), and the fan folds beneath
 * it; picking another card returns the previous one to the hand on `glide`.
 *
 * Open, the control is a `role="radiogroup"` of `role="radio"` cards with a
 * roving tabindex — ArrowLeft/Right move the raise (wrapping), Enter/Space
 * commit, Escape folds without picking and hands focus back to the stack. A
 * polite region reads "Hand open, N cards" and "<label> played".
 *
 * Reduced motion: the arc renders instantly (no stagger, no tilt), the raise
 * is a static ring highlight, and a pick moves to the slot on a fast tween —
 * identical semantics throughout.
 */
export function CardFan({
  cards,
  value: valueProp,
  defaultValue = null,
  onSelect,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  cardWidth = 120,
  className,
  "aria-label": ariaLabel = "Card fan",
}: CardFanProps) {
  const motionSafe = useMotionSafe();

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = openProp ?? uncontrolledOpen;

  const [uncontrolledValue, setUncontrolledValue] = React.useState<
    string | null
  >(defaultValue);
  const committed = valueProp !== undefined ? valueProp : uncontrolledValue;

  /** The card currently raised by hover or focus (browse state). */
  const [raised, setRaised] = React.useState<string | null>(null);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const stackRef = React.useRef<HTMLButtonElement | null>(null);
  /** Set on Escape/pick so the close hands focus back to the stack button. */
  const returnFocusRef = React.useRef(false);
  /** The freshly picked card bumps on `recoil` when its glide lands. */
  const pendingBumpRef = React.useRef<string | null>(null);

  const deck = cards.slice(0, MAX_CARDS);
  const playedCard = deck.find((card) => card.id === committed) ?? null;
  const playedId = playedCard?.id ?? null;
  const hand = deck.filter((card) => card.id !== playedId);
  const handIndexById = new Map(hand.map((card, i) => [card.id, i]));

  // Scene geometry — every target below is a pure function of these numbers.
  const width = Math.max(48, Math.round(cardWidth));
  const height = Math.round(width * 1.45);
  const pivotRadius = height * PIVOT_RADIUS_FACTOR;
  const sweepRad = (HALF_SWEEP * Math.PI) / 180;
  const halfExtent =
    pivotRadius * Math.sin(sweepRad) +
    (width / 2) * Math.cos(sweepRad) +
    (height / 2) * Math.sin(sweepRad);
  const sceneWidth = Math.ceil(halfExtent * 2) + 8;
  const slotWidth = width + SLOT_PAD * 2;
  const slotHeight = height + SLOT_PAD * 2;
  const sceneHeight = slotHeight + GAP + height + BOTTOM_PAD;
  /** Travel from the stack seat up into the slot's inner rest. */
  const playedY = -(height + SLOT_PAD + GAP);
  const cardLeft = (sceneWidth - width) / 2;

  const setOpenState = React.useCallback(
    (next: boolean) => {
      if (openProp === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [openProp, onOpenChange],
  );

  // Plain function — `hand` is derived fresh each render, so manual
  // memoization can't be preserved; the compiler memoizes it with the render.
  const openHand = () => {
    if (open) return;
    // Initial raise (and tab stop): the committed card, else the center.
    const centerId =
      hand[Math.floor(Math.max(hand.length - 1, 0) / 2)]?.id ?? null;
    setRaised(playedId ?? centerId);
    setOpenState(true);
  };

  const foldHand = React.useCallback(() => {
    if (!open) return;
    returnFocusRef.current = true;
    setRaised(null);
    setOpenState(false);
  }, [open, setOpenState]);

  const pick = React.useCallback(
    (id: string) => {
      if (!open) return;
      // Only a genuinely new play travels, so only that landing bumps.
      if (motionSafe && id !== committed) pendingBumpRef.current = id;
      if (valueProp === undefined) setUncontrolledValue(id);
      onSelect?.(id);
      returnFocusRef.current = true;
      setRaised(null);
      setOpenState(false);
    },
    [open, motionSafe, committed, valueProp, onSelect, setOpenState],
  );

  const hoverCard = React.useCallback(
    (id: string, hovering: boolean, pointerType: string) => {
      if (!open || pointerType === "touch") return; // fine pointers only
      setRaised((prev) => (hovering ? id : prev === id ? null : prev));
    },
    [open],
  );

  const focusCard = React.useCallback((id: string) => setRaised(id), []);

  const blurCard = React.useCallback((id: string) => {
    setRaised((prev) => (prev === id ? null : prev));
  }, []);

  /** ArrowLeft/Right roam the radios (wrapping); focus carries the raise. */
  const moveRaise = React.useCallback(
    (current: HTMLButtonElement, dir: 1 | -1) => {
      const root = rootRef.current;
      if (!root) return;
      const radios = Array.from(
        root.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
      );
      const index = radios.indexOf(current);
      if (index === -1 || radios.length === 0) return;
      radios[(index + dir + radios.length) % radios.length]?.focus();
    },
    [],
  );

  const handleRootKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape" && open) {
        event.preventDefault();
        foldHand();
      }
    },
    [open, foldHand],
  );

  // Focus choreography: into the fan as it opens; back to the stack after an
  // Escape or a pick. DOM focus only — no state is written here.
  const prevOpenRef = React.useRef(open);
  React.useEffect(() => {
    const prev = prevOpenRef.current;
    prevOpenRef.current = open;
    if (open === prev) return;
    if (open) {
      rootRef.current
        ?.querySelector<HTMLButtonElement>('[role="radio"][tabindex="0"]')
        ?.focus();
    } else if (returnFocusRef.current) {
      returnFocusRef.current = false;
      stackRef.current?.focus();
    }
  }, [open]);

  /** Splay pivots around the raised card's position in the hand. */
  const raisedHandIndex =
    raised !== null && raised !== playedId
      ? (handIndexById.get(raised) ?? null)
      : null;

  const tabStopId =
    raised ??
    playedId ??
    hand[Math.floor(Math.max(hand.length - 1, 0) / 2)]?.id ??
    null;

  return (
    <div
      ref={rootRef}
      role={open ? "radiogroup" : "group"}
      aria-label={ariaLabel}
      onKeyDown={handleRootKeyDown}
      className={cn("relative select-none", className)}
      style={{ width: sceneWidth, height: sceneHeight, maxWidth: "100%" }}
    >
      {/* Fake-depth wrapper: perspective outside, one flat tilted plane inside. */}
      <div className="absolute inset-0" style={{ perspective: perspectives.base }}>
        <motion.div
          className="relative h-full w-full"
          style={{ transformOrigin: "50% 100%" }}
          initial={false}
          animate={{ rotateX: motionSafe && open ? TILT_X : 0 }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        >
          {/* The played slot — a dashed hairline plate above the hand. */}
          <div
            aria-hidden
            className="absolute top-0 rounded-3 border border-dashed border-hairline-strong"
            style={{
              width: slotWidth,
              height: slotHeight,
              left: (sceneWidth - slotWidth) / 2,
            }}
          />

          {deck.map((card, index) => {
            const played = card.id === playedId;
            const handIndex = handIndexById.get(card.id) ?? -1;
            const splay =
              open &&
              motionSafe &&
              raisedHandIndex !== null &&
              !played &&
              handIndex !== raisedHandIndex
                ? Math.sign(handIndex - raisedHandIndex) * SPLAY
                : 0;
            return (
              <FanBlade
                key={card.id}
                card={card}
                index={index}
                handIndex={handIndex}
                handCount={hand.length}
                open={open}
                played={played}
                raised={raised === card.id}
                splay={splay}
                tabStop={open && card.id === tabStopId}
                motionSafe={motionSafe}
                width={width}
                height={height}
                left={cardLeft}
                playedY={playedY}
                pendingBumpRef={pendingBumpRef}
                onPick={pick}
                onHover={hoverCard}
                onFocusCard={focusCard}
                onBlurCard={blurCard}
                onMove={moveRaise}
              />
            );
          })}
        </motion.div>
      </div>

      {/* The closed stack is a real button; open, it stands down inert. */}
      <button
        ref={stackRef}
        type="button"
        aria-expanded={open}
        aria-label={
          playedCard ? `${ariaLabel}, ${playedCard.label} played` : ariaLabel
        }
        tabIndex={open ? -1 : 0}
        onClick={openHand}
        className={cn(
          "absolute bottom-0 rounded-3 outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring",
          open ? "pointer-events-none" : "cursor-pointer",
        )}
        style={{
          width: slotWidth,
          height: slotHeight,
          left: (sceneWidth - slotWidth) / 2,
          zIndex: 60,
        }}
      />

      <span aria-live="polite" role="status" className="sr-only">
        {open
          ? `Hand open, ${hand.length} cards`
          : playedCard
            ? `${playedCard.label} played`
            : ""}
      </span>
    </div>
  );
}

type FanBladeProps = {
  card: FanCard;
  /** Position in the full deck — keys the jitter, accent, and corner index. */
  index: number;
  /** Position in the fanned hand; −1 while played. */
  handIndex: number;
  handCount: number;
  open: boolean;
  played: boolean;
  raised: boolean;
  /** Extra parting rotation (degrees) while a sibling is raised. */
  splay: number;
  tabStop: boolean;
  motionSafe: boolean;
  width: number;
  height: number;
  left: number;
  playedY: number;
  pendingBumpRef: React.RefObject<string | null>;
  onPick: (id: string) => void;
  onHover: (id: string, hovering: boolean, pointerType: string) => void;
  onFocusCard: (id: string) => void;
  onBlurCard: (id: string) => void;
  onMove: (current: HTMLButtonElement, dir: 1 | -1) => void;
};

/**
 * One card, three origin-matched layers: the shell owns fan geometry about
 * the shared below-stack pivot, a middle layer carries sibling splay and the
 * landing bump, and the plate itself raises about its own center.
 */
function FanBlade({
  card,
  index,
  handIndex,
  handCount,
  open,
  played,
  raised,
  splay,
  tabStop,
  motionSafe,
  width,
  height,
  left,
  playedY,
  pendingBumpRef,
  onPick,
  onHover,
  onFocusCard,
  onBlurCard,
  onMove,
}: FanBladeProps) {
  /** Landing bump rides its own value so the shell's glide owns y. */
  const bumpY = useMotionValue(0);
  const bumpControls = React.useRef<ReturnType<typeof animate> | null>(null);

  React.useEffect(
    () => () => {
      bumpControls.current?.stop();
    },
    [],
  );

  const jitter = closedJitterFor(index);
  const angle = played ? 0 : fanAngle(handIndex, handCount);
  const accent = accentFor(index);

  // Open: fan angle plus a slight lift along the arc, offsetting the shared
  // pivot's natural droop toward the fan's edges.
  const shellTarget = played
    ? { x: 0, y: playedY, rotate: 0 }
    : open
      ? { x: 0, y: -Math.abs(angle) * (height / 220), rotate: angle }
      : { x: jitter.x, y: jitter.y, rotate: jitter.rotate };

  // Cascade from the center outward on open; reverse order on close.
  const center = (handCount - 1) / 2;
  const dist = Math.abs(handIndex - center);
  const interval = cascade(Math.max(handCount, 1));
  const delay = played ? 0 : (open ? dist : center - dist) * interval;
  const shellTransition = motionSafe
    ? { ...springs.glide, delay }
    : played
      ? { duration: durations.fast }
      : { duration: 0 };

  /** The picked card's glide has landed — set the peak, release to rest. */
  const handleShellComplete = () => {
    if (!played || pendingBumpRef.current !== card.id) return;
    pendingBumpRef.current = null;
    bumpControls.current?.stop();
    bumpY.set(BUMP_Y);
    bumpControls.current = animate(bumpY, 0, springs.recoil);
  };

  const lifted = motionSafe && open && raised && !played;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      onMove(event.currentTarget, event.key === "ArrowRight" ? 1 : -1);
    }
  };

  return (
    <motion.div
      initial={false}
      animate={shellTarget}
      transition={shellTransition}
      onAnimationComplete={handleShellComplete}
      className="absolute"
      style={{
        width,
        height,
        left,
        bottom: BOTTOM_PAD,
        transformOrigin: PIVOT_ORIGIN,
        zIndex: played ? 40 : raised ? 30 : index,
      }}
    >
      <motion.div
        className="h-full w-full"
        initial={false}
        animate={{ rotate: splay }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
        style={{ y: bumpY, transformOrigin: PIVOT_ORIGIN }}
      >
        <motion.button
          type="button"
          role="radio"
          aria-checked={played}
          aria-hidden={open ? undefined : true}
          tabIndex={tabStop ? 0 : -1}
          onClick={() => onPick(card.id)}
          onPointerEnter={(event) => onHover(card.id, true, event.pointerType)}
          onPointerLeave={(event) => onHover(card.id, false, event.pointerType)}
          onFocus={() => onFocusCard(card.id)}
          onBlur={() => onBlurCard(card.id)}
          onKeyDown={handleKeyDown}
          initial={false}
          animate={{
            y: lifted ? RAISE_Y : 0,
            scale: lifted ? RAISE_SCALE : 1,
            boxShadow: lifted ? SHADOW_RAISED : SHADOW_REST,
          }}
          transition={
            motionSafe
              ? {
                  ...springs.snap,
                  boxShadow: { duration: durations.fast, ease: easings.move },
                }
              : { duration: 0 }
          }
          className={cn(
            "relative flex h-full w-full flex-col overflow-hidden rounded-3 border border-hairline bg-surface-2 text-left outline-none",
            "focus-visible:ring-2 focus-visible:ring-ring",
            open ? "cursor-pointer" : "pointer-events-none",
            // Reduced-motion browse: a static highlight instead of a lift.
            !motionSafe && open && raised && "ring-2 ring-ring/70",
          )}
        >
          {/* Indexed accent band — the card's fixed identity stripe. */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-1"
            style={{ background: accent }}
          />
          <span className="flex items-start justify-between p-2 pt-2.5">
            <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 tabular-nums">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span
              aria-hidden
              className="mt-0.5 size-1.5 rounded-full"
              style={{ background: accent }}
            />
          </span>
          <span className="mt-auto flex min-w-0 flex-col gap-1 p-2">
            <span className="text-label text-ink">{card.label}</span>
            <span className="min-w-0 text-ink-2">{card.content}</span>
          </span>
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
