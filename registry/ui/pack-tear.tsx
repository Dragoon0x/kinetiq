"use client";

import * as React from "react";

import {
  Compass,
  Feather,
  Flame,
  Gem,
  Moon,
  Shield,
  Sparkle,
  Star,
  type LucideIcon,
} from "lucide-react";
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, value));

/** Stage geometry, px — the pack and the fanned hand share this coordinate space. */
const STAGE_W = 380;
const STAGE_H = 260;

/** The sealed pouch. */
const PACK_W = 168;
const PACK_H = 224;
const PACK_LEFT = (STAGE_W - PACK_W) / 2;
const PACK_TOP = (STAGE_H - PACK_H) / 2;

/** The cap — everything above the dashed tear line — is what flies off. */
const CAP_H = 56;
const CAP_FLY_Y = -150;
const CAP_FLY_ROTATE = -10;

/** The band the drag-tracked jagged cut lives in, straddling the tear line. */
const TEAR_BAND_TOP = CAP_H - 9;
const TEAR_BAND_H = 16;

/** Drag distance for a full tear, px. Keyboard steps take three presses to
 * cross COMMIT_THRESHOLD (0.22 × 3 = 0.66). */
const TEAR_TRAVEL_PX = 130;
const TEAR_KEY_STEP = 0.22;
const COMMIT_THRESHOLD = 0.65;
/** A fleck sheds every sixth of the travel — a handful of bursts per tear. */
const FLECK_STEP = 1 / 6;

/** Fixed zigzag teeth for the drag-tracked cut — never randomized. */
const TEAR_TEETH = [
  { t: 0, amp: 0 },
  { t: 0.2, amp: 6 },
  { t: 0.45, amp: -5 },
  { t: 0.7, amp: 7 },
  { t: 1, amp: 0 },
] as const;

const buildTearClip = (progress: number): string => {
  const cutPct = progress * 100;
  const points = TEAR_TEETH.map(
    (tooth) =>
      `${Math.max(0, cutPct + (tooth.amp / PACK_W) * 100)}% ${tooth.t * 100}%`,
  );
  return `polygon(0% 0%, ${points.join(", ")}, 0% 100%)`;
};

/** Fixed foil-fleck vectors shed at the tear point — never randomized. */
const FLECKS = [
  { dx: -10, dy: -14, rot: -50 },
  { dx: -2, dy: -18, rot: 15 },
  { dx: 7, dy: -12, rot: -20 },
  { dx: 13, dy: -4, rot: 40 },
] as const;

/** Static serrated crimp along the cap's top edge. */
const SERRATION_TEETH = 9;
const SERRATION_DEPTH = 6;
const CAP_SERRATION_CLIP = (() => {
  const points: string[] = ["0% 0%"];
  for (let i = 0; i <= SERRATION_TEETH; i++) {
    const x = (i / SERRATION_TEETH) * 100;
    const y = i % 2 === 0 ? 0 : SERRATION_DEPTH;
    points.push(`${x}% ${y}px`);
  }
  points.push("100% 100%", "0% 100%");
  return `polygon(${points.join(", ")})`;
})();

const PACK_GRADIENT = `linear-gradient(155deg,
  color-mix(in oklab, var(--accent-bright) 62%, var(--card)) 0%,
  color-mix(in oklab, var(--accent) 58%, var(--card)) 55%,
  color-mix(in oklab, var(--ink) 28%, var(--card)) 100%)`;

const PACK_BODY_GRADIENT = `linear-gradient(165deg,
  color-mix(in oklab, var(--accent) 40%, var(--card)) 0%,
  color-mix(in oklab, var(--ink) 22%, var(--card)) 100%)`;

const METAL_SHEEN = `linear-gradient(105deg,
  color-mix(in oklab, var(--card) 45%, transparent) 6%,
  transparent 32%,
  transparent 62%,
  color-mix(in oklab, var(--ink) 30%, transparent) 92%)`;

/** One collectible card face, at 76×108 — the fanned hand's fixed footprint. */
const CARD_W = 76;
const CARD_H = 108;
const CARD_LEFT = (STAGE_W - CARD_W) / 2;
const CARD_TOP = (STAGE_H - CARD_H) / 2;

/** Arc geometry — index math, not measurement. */
const FAN_X_STEP = 42;
const FAN_ROTATE_STEP = 8;
const FAN_LIFT = 14;
const FAN_DROOP = 3;

const fanTarget = (
  index: number,
  count: number,
): { x: number; y: number; rotate: number } => {
  const offset = index - (count - 1) / 2;
  return {
    x: offset * FAN_X_STEP,
    y: -FAN_LIFT + Math.abs(offset) * FAN_DROOP,
    rotate: offset * FAN_ROTATE_STEP,
  };
};

/** Six fixed spark vectors for an epic-or-higher reveal — trig, not chance. */
const CARD_SPARKS = Array.from({ length: 6 }, (_, i) => {
  const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
  return { dx: Math.cos(angle) * 28, dy: Math.sin(angle) * 28 };
});

/**
 * Four fixed rarity tiers, ascending tint and pip count. `key` doubles as the
 * value handed to `onReveal`.
 */
const RARITY_TIERS = [
  { key: "common", label: "Common", tint: "var(--ink-2)", pips: 1 },
  { key: "rare", label: "Rare", tint: "var(--accent-bright)", pips: 2 },
  { key: "epic", label: "Epic", tint: "var(--signal)", pips: 3 },
  {
    key: "legendary",
    label: "Legendary",
    tint: "color-mix(in oklab, var(--warning, #b45309) 60%, var(--accent-bright) 40%)",
    pips: 4,
  },
] as const;

type RarityTier = (typeof RARITY_TIERS)[number];
type RarityKey = RarityTier["key"];

/** `RARITY_TIERS[0]` is a literal-index tuple read — always defined — so this
 * guards every variable-indexed lookup without a raw fallback at each call. */
const rarityAt = (index: number): RarityTier =>
  RARITY_TIERS[index] ?? RARITY_TIERS[0];

/**
 * The fixed draw order: common-heavy, a rare every few pulls, epic rarer
 * still, one legendary far out. Never chance — a running cursor (pack index
 * × card count) walks this table, so "new pack" always queues the next fixed
 * slice rather than repeating or rolling.
 */
const RARITY_CYCLE = [
  0, 0, 1, 0, 2, 0, 0, 1, 0, 0, 3, 0, 1, 0, 0, 2, 1, 0, 0, 1, 0, 2, 0, 0,
] as const;

const rarityForCursor = (cursor: number, index: number): RarityTier => {
  const pos = (cursor + index) % RARITY_CYCLE.length;
  return rarityAt(RARITY_CYCLE[pos] ?? 0);
};

/** Seven fixed collectible identities — a card's slot always carries the same
 * name and glyph; only the rarity drawn into that slot changes pack to pack. */
const CARD_SLOTS = [
  { name: "Ironclad", glyph: Shield },
  { name: "Wisp", glyph: Feather },
  { name: "Ember", glyph: Flame },
  { name: "Compass Rose", glyph: Compass },
  { name: "Halcyon", glyph: Star },
  { name: "Nightfall", glyph: Moon },
  { name: "Facet", glyph: Gem },
] as const;

/** Same literal-index-tuple guarantee as `rarityAt` above. */
const slotAt = (index: number) => CARD_SLOTS[index] ?? CARD_SLOTS[0];

type FlipStage = "idle" | "closing" | "opening";

type CardRuntime = {
  revealed: boolean;
  flipStage: FlipStage;
  shownFace: "back" | "front";
  /** Bumped once the flip settles — remounts the rarity's reaction burst. */
  reactionKey: number;
};

const makeRuntime = (count: number): CardRuntime[] =>
  Array.from({ length: count }, () => ({
    revealed: false,
    flipStage: "idle",
    shownFace: "back",
    reactionKey: 0,
  }));

type Phase = "sealed" | "tearing" | "flying" | "open";

export type PackTearProps = {
  /** Cards per pack, clamped 3–7. @default 5 */
  cards?: number;
  /** Fires once per card, the moment its flip settles on a face. */
  onReveal?: (rarity: string) => void;
  className?: string;
};

/**
 * A foil collectible pack: drag horizontally across the tear strip and a
 * jagged cut tracks the motion 1:1, shedding fixed foil flecks as it goes;
 * cross ~65% and the top strip snaps off on an authored tween while the five
 * cards inside rise and fan into an arc on `glide`, staggered by `cascade`.
 * Each card is a real button — clicking chains two 2-keyframe scaleX tweens
 * with the face swapped at the midpoint, never a 3-keyframe spring — landing
 * on a glyph, a name, and a rarity drawn from a fixed four-tier table
 * (common/rare/epic/legendary); rare adds a ring, epic adds sparks, legendary
 * adds a sweep and a caption flash. "Reveal all" chains the rest on the same
 * cascade, and once every card is face up a mono line reads the haul before
 * "New pack" reseals with the next fixed slice of the rarity table queued —
 * rarities are never chance, only a running cursor through that table.
 * Reduced motion: a single press or click opens the pack outright (no drag
 * tracking, no flecks, no flight), cards appear already fanned, and every
 * flip is an instant face swap with no ring, sparks, or sweep.
 */
export function PackTear({
  cards = 5,
  onReveal,
  className,
}: PackTearProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const count = clamp(Math.round(cards), 3, 7);
  const deck = React.useMemo(
    () => Array.from({ length: count }, (_, i) => slotAt(i)),
    [count],
  );

  const [phase, setPhase] = React.useState<Phase>("sealed");
  const [packSerial, setPackSerial] = React.useState(0);
  const [cardRuntime, setCardRuntime] = React.useState<CardRuntime[]>(() =>
    makeRuntime(count),
  );
  const [fleckKey, setFleckKey] = React.useState(0);
  const [fleckX, setFleckX] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");

  const phaseRef = React.useRef<Phase>("sealed");
  const pointerIdRef = React.useRef<number | null>(null);
  const dragStartXRef = React.useRef(0);
  const lastFleckStepRef = React.useRef(0);
  const packButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const firstCardBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const prevOpenRef = React.useRef(false);

  const closeTimersRef = React.useRef<(number | null)[]>(
    Array.from({ length: count }, () => null),
  );
  const openTimersRef = React.useRef<(number | null)[]>(
    Array.from({ length: count }, () => null),
  );
  const revealAllTimersRef = React.useRef<(number | null)[]>([]);

  const onRevealRef = React.useRef(onReveal);
  React.useEffect(() => {
    onRevealRef.current = onReveal;
  }, [onReveal]);

  const tearProgress = useMotionValue<number>(0);
  const tearClip = useTransform(tearProgress, buildTearClip);

  // Every card timer this component owns, torn down on unmount. Arrays are
  // aliased by reference here, not copied: slots are rewritten in place as
  // reveals fire, so cleanup still sees whatever is currently pending.
  React.useEffect(() => {
    const closeTimers = closeTimersRef.current;
    const openTimers = openTimersRef.current;
    const revealAllTimers = revealAllTimersRef.current;
    return () => {
      for (const t of closeTimers) if (t !== null) window.clearTimeout(t);
      for (const t of openTimers) if (t !== null) window.clearTimeout(t);
      for (const t of revealAllTimers) if (t !== null) window.clearTimeout(t);
    };
  }, []);

  // Focus choreography only: hand focus to the first card the instant the
  // pack opens. DOM focus only — no state is written here.
  React.useEffect(() => {
    const isOpen = phase === "open";
    const was = prevOpenRef.current;
    prevOpenRef.current = isOpen;
    if (isOpen && !was) firstCardBtnRef.current?.focus();
  }, [phase]);

  const cursor = packSerial * count;
  const cardRarities = React.useMemo(
    () => Array.from({ length: count }, (_, i) => rarityForCursor(cursor, i)),
    [cursor, count],
  );

  const revealedCount = cardRuntime.filter((c) => c.revealed).length;
  const allRevealed = phase === "open" && revealedCount === count;

  const haulText = React.useMemo(() => {
    const counts: Record<RarityKey, number> = {
      common: 0,
      rare: 0,
      epic: 0,
      legendary: 0,
    };
    for (const r of cardRarities) counts[r.key] += 1;
    const notable = (["rare", "epic", "legendary"] as const)
      .filter((key) => counts[key] > 0)
      .map((key) => `${counts[key]} ${key}`);
    return notable.length > 0 ? notable.join(" · ") : `${counts.common} common`;
  }, [cardRarities]);

  /** The flip chain: close, swap the face at the midpoint, open, then react. */
  const startReveal = React.useCallback(
    (index: number) => {
      setCardRuntime((prev) =>
        prev.map((c, i) =>
          i === index && !c.revealed
            ? {
                ...c,
                revealed: true,
                flipStage: motionSafe ? "closing" : "idle",
                shownFace: motionSafe ? c.shownFace : "front",
              }
            : c,
        ),
      );
      const rarity = cardRarities[index] ?? RARITY_TIERS[0];

      if (!motionSafe) {
        setAnnounce(`${slotAt(index).name}, ${rarity.label}.`);
        onRevealRef.current?.(rarity.key);
        return;
      }

      closeTimersRef.current[index] = window.setTimeout(() => {
        closeTimersRef.current[index] = null;
        setCardRuntime((prev) =>
          prev.map((c, i) =>
            i === index
              ? { ...c, shownFace: "front", flipStage: "opening" }
              : c,
          ),
        );
        openTimersRef.current[index] = window.setTimeout(() => {
          openTimersRef.current[index] = null;
          setCardRuntime((prev) =>
            prev.map((c, i) =>
              i === index
                ? { ...c, flipStage: "idle", reactionKey: c.reactionKey + 1 }
                : c,
            ),
          );
          setAnnounce(`${slotAt(index).name}, ${rarity.label}.`);
          onRevealRef.current?.(rarity.key);
        }, durations.base * 1000);
      }, durations.fast * 1000);
    },
    [motionSafe, cardRarities],
  );

  const handleCardActivate = (index: number) => {
    if (phaseRef.current !== "open") return;
    if (cardRuntime[index]?.revealed) return;
    startReveal(index);
  };

  const handleRevealAll = () => {
    if (phaseRef.current !== "open") return;
    const pending = cardRuntime
      .map((c, i) => (c.revealed ? -1 : i))
      .filter((i) => i >= 0);
    if (pending.length === 0) return;

    if (!motionSafe) {
      for (const i of pending) startReveal(i);
      return;
    }

    for (const t of revealAllTimersRef.current)
      if (t !== null) window.clearTimeout(t);
    revealAllTimersRef.current.length = 0;

    const stepMs = cascade(pending.length) * 1000;
    pending.forEach((index, order) => {
      const t = window.setTimeout(() => startReveal(index), order * stepMs);
      revealAllTimersRef.current.push(t);
    });
  };

  const openImmediately = () => {
    if (phaseRef.current === "open") return;
    phaseRef.current = "open";
    setPhase("open");
    tearProgress.jump(1);
    setAnnounce("Pack opened.");
  };

  const commitTear = () => {
    if (phaseRef.current !== "tearing") return;
    phaseRef.current = "flying";
    setPhase("flying");
    if (pointerIdRef.current !== null) {
      try {
        packButtonRef.current?.releasePointerCapture(pointerIdRef.current);
      } catch {
        // Pointer capture may already be gone — nothing to clean up.
      }
      pointerIdRef.current = null;
    }
    setAnnounce("Pack torn open.");
  };

  useMotionValueEvent(tearProgress, "change", (v) => {
    if (motionSafe) {
      const step = Math.floor(v / FLECK_STEP);
      if (step > lastFleckStepRef.current && v > 0.02) {
        lastFleckStepRef.current = step;
        setFleckX(v * 100);
        setFleckKey((k) => k + 1);
      }
    }
    if (v >= COMMIT_THRESHOLD && phaseRef.current === "tearing") commitTear();
  });

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    if (phaseRef.current !== "sealed" && phaseRef.current !== "tearing") return;
    if (!motionSafe) {
      openImmediately();
      return;
    }
    dragStartXRef.current = event.clientX - tearProgress.get() * TEAR_TRAVEL_PX;
    pointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    if (phaseRef.current !== "sealed" && phaseRef.current !== "tearing") return;
    if (phaseRef.current === "sealed") {
      phaseRef.current = "tearing";
      setPhase("tearing");
    }
    const dx = event.clientX - dragStartXRef.current;
    tearProgress.set(clamp(dx / TEAR_TRAVEL_PX, 0, 1));
  };

  const settleTear = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    pointerIdRef.current = null;
    if (phaseRef.current !== "tearing") return;
    if (tearProgress.get() < COMMIT_THRESHOLD) {
      phaseRef.current = "sealed";
      setPhase("sealed");
      lastFleckStepRef.current = 0;
      animate(tearProgress, 0, motionSafe ? springs.snap : { duration: 0 });
    }
  };

  const stepTear = () => {
    if (phaseRef.current === "sealed") {
      phaseRef.current = "tearing";
      setPhase("tearing");
    }
    const next = clamp(tearProgress.get() + TEAR_KEY_STEP, 0, 1);
    tearProgress.set(next);
    if (next < COMMIT_THRESHOLD)
      setAnnounce(`Tearing, ${Math.round(next * 100)} percent.`);
  };

  const handlePackKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (
      event.key !== "Enter" &&
      event.key !== " " &&
      event.key !== "ArrowRight"
    )
      return;
    if (phaseRef.current !== "sealed" && phaseRef.current !== "tearing") return;
    event.preventDefault();
    if (!motionSafe) {
      openImmediately();
      return;
    }
    stepTear();
  };

  // Assistive tech sends a bare click with no key or pointer behind it —
  // pointer and keyboard interactions are already handled above.
  const handlePackClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.detail !== 0) return;
    if (phaseRef.current !== "sealed" && phaseRef.current !== "tearing") return;
    if (!motionSafe) {
      openImmediately();
      return;
    }
    stepTear();
  };

  const handleNewPack = () => {
    for (const t of closeTimersRef.current)
      if (t !== null) window.clearTimeout(t);
    for (const t of openTimersRef.current)
      if (t !== null) window.clearTimeout(t);
    for (const t of revealAllTimersRef.current)
      if (t !== null) window.clearTimeout(t);
    // Reset in place — the mount-time cleanup effect aliased these exact
    // array objects, so reassigning `.current` here would orphan it.
    for (let i = 0; i < closeTimersRef.current.length; i++)
      closeTimersRef.current[i] = null;
    for (let i = 0; i < openTimersRef.current.length; i++)
      openTimersRef.current[i] = null;
    revealAllTimersRef.current.length = 0;

    phaseRef.current = "sealed";
    setPhase("sealed");
    lastFleckStepRef.current = 0;
    setFleckKey(0);
    tearProgress.jump(0);
    setCardRuntime(makeRuntime(count));
    setPackSerial((s) => s + 1);
    setAnnounce("New pack sealed.");
  };

  const fanOpen = phase === "flying" || phase === "open";
  const packShown = phase !== "open";

  return (
    <div
      role="group"
      aria-label="Collectible card pack"
      className={cn(
        "inline-flex flex-col items-center gap-3 select-none",
        className,
      )}
    >
      <div className="relative" style={{ width: STAGE_W, height: STAGE_H }}>
        <div
          className="absolute inset-0"
          aria-hidden={phase === "open" ? undefined : true}
        >
          {deck.map((slot, index) => {
            const runtime =
              cardRuntime[index] ??
              ({
                revealed: false,
                flipStage: "idle",
                shownFace: "back",
                reactionKey: 0,
              } satisfies CardRuntime);
            const rarity = cardRarities[index] ?? RARITY_TIERS[0];
            const tierRank = RARITY_TIERS.findIndex(
              (t) => t.key === rarity.key,
            );
            const target = fanTarget(index, count);
            const stacked = { x: 0, y: 36, rotate: 0, scale: 0.6, opacity: 0 };
            const fanned = {
              x: target.x,
              y: target.y,
              rotate: target.rotate,
              scale: 1,
              opacity: 1,
            };
            const scaleXTarget = runtime.flipStage === "closing" ? 0 : 1;
            const flipTransition = motionSafe
              ? runtime.flipStage === "closing"
                ? { duration: durations.fast, ease: easings.exit }
                : { duration: durations.base, ease: easings.enter }
              : { duration: 0 };
            const Glyph = slot.glyph;
            const showRing = runtime.reactionKey > 0 && tierRank >= 1;
            const showSparks = runtime.reactionKey > 0 && tierRank >= 2;
            const showSweep = runtime.reactionKey > 0 && tierRank >= 3;

            return (
              <motion.div
                key={`${packSerial}-${index}`}
                className="absolute"
                style={{
                  width: CARD_W,
                  height: CARD_H,
                  left: CARD_LEFT,
                  top: CARD_TOP,
                  zIndex: index,
                }}
                initial={motionSafe ? stacked : false}
                animate={fanOpen ? fanned : stacked}
                transition={
                  motionSafe
                    ? { ...springs.glide, delay: index * cascade(count) }
                    : { duration: 0 }
                }
              >
                <button
                  ref={index === 0 ? firstCardBtnRef : undefined}
                  type="button"
                  aria-label={
                    runtime.revealed
                      ? `${slot.name}, ${rarity.label}`
                      : `Reveal card ${index + 1}`
                  }
                  aria-disabled={runtime.revealed || undefined}
                  disabled={phase !== "open"}
                  onClick={() => handleCardActivate(index)}
                  className={cn(
                    "relative block size-full rounded-2 outline-none",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
                    "disabled:pointer-events-none",
                    runtime.revealed ? "cursor-default" : "cursor-pointer",
                  )}
                >
                  <motion.div
                    className="relative size-full overflow-hidden rounded-2"
                    style={{ transformOrigin: "50% 50%" }}
                    initial={false}
                    animate={{ scaleX: scaleXTarget }}
                    transition={flipTransition}
                  >
                    {runtime.shownFace === "back" ? (
                      <CardBack />
                    ) : (
                      <CardFront
                        rarity={rarity}
                        name={slot.name}
                        Glyph={Glyph}
                      />
                    )}
                    {showSweep && <CardSweep motionSafe={motionSafe} />}
                  </motion.div>

                  {showRing && (
                    <motion.span
                      key={`ring-${runtime.reactionKey}`}
                      aria-hidden
                      className="pointer-events-none absolute inset-0 m-auto rounded-full"
                      style={{
                        width: "78%",
                        height: "78%",
                        border: `2px solid ${rarity.tint}`,
                      }}
                      initial={{ scale: 0.6, opacity: 0.9 }}
                      animate={{ scale: 1.35, opacity: 0 }}
                      transition={{
                        duration: durations.slow,
                        ease: easings.exit,
                      }}
                    />
                  )}

                  {showSparks && (
                    <span
                      key={`sparks-${runtime.reactionKey}`}
                      aria-hidden
                      className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                    >
                      {CARD_SPARKS.map((s, i) => (
                        <motion.span
                          key={i}
                          className="absolute size-[3px] rounded-full"
                          style={{ background: rarity.tint }}
                          initial={{ x: 0, y: 0, opacity: 1 }}
                          animate={{ x: s.dx, y: s.dy, opacity: 0 }}
                          transition={{
                            duration: durations.slow,
                            ease: easings.exit,
                          }}
                        />
                      ))}
                    </span>
                  )}

                  {showSweep && (
                    <motion.span
                      key={`caption-${runtime.reactionKey}`}
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 bottom-1.5 text-center font-mono text-[8px] font-bold tracking-[0.1em] uppercase"
                      style={{ color: "var(--warning, #b45309)" }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 1, 1, 0] }}
                      transition={{
                        duration: 1.1,
                        times: [0, 0.15, 0.7, 1],
                        ease: easings.move,
                      }}
                    >
                      {rarity.label}!
                    </motion.span>
                  )}
                </button>
              </motion.div>
            );
          })}
        </div>

        {packShown && (
          <button
            ref={packButtonRef}
            type="button"
            aria-label="Tear open the pack"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={settleTear}
            onPointerCancel={settleTear}
            onKeyDown={handlePackKeyDown}
            onClick={handlePackClick}
            className={cn(
              "absolute touch-none rounded-3 text-left outline-none select-none",
              "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
              phase === "flying"
                ? "pointer-events-none"
                : "cursor-grab active:cursor-grabbing",
            )}
            style={{
              left: PACK_LEFT,
              top: PACK_TOP,
              width: PACK_W,
              height: PACK_H,
              zIndex: 20,
            }}
          >
            {/* Body — the lower two-thirds of the pouch, stays put. */}
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-0 rounded-b-3 border border-hairline-strong"
              style={{ top: CAP_H, background: PACK_BODY_GRADIENT }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-b-3"
                style={{ background: METAL_SHEEN }}
              />
            </span>

            {/* Cap — serration, logo, dashed tear line. Flies off on commit. */}
            <motion.span
              aria-hidden
              className="absolute inset-x-0 top-0 block"
              style={{ height: CAP_H }}
              initial={false}
              animate={
                phase === "flying"
                  ? { y: CAP_FLY_Y, opacity: 0, rotate: CAP_FLY_ROTATE }
                  : { y: 0, opacity: 1, rotate: 0 }
              }
              transition={
                motionSafe
                  ? { duration: durations.page, ease: easings.exit }
                  : { duration: 0 }
              }
              onAnimationComplete={() => {
                if (phaseRef.current === "flying") {
                  phaseRef.current = "open";
                  setPhase("open");
                }
              }}
            >
              <span
                aria-hidden
                className="absolute inset-0 rounded-t-3"
                style={{
                  background: PACK_GRADIENT,
                  clipPath: CAP_SERRATION_CLIP,
                }}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-t-3"
                style={{ background: METAL_SHEEN }}
              />
              <span className="absolute inset-x-0 bottom-2 flex items-center justify-center">
                <Sparkle
                  aria-hidden
                  className="size-3.5"
                  style={{
                    color: "color-mix(in oklab, var(--card) 85%, transparent)",
                  }}
                />
              </span>
              <span
                aria-hidden
                className="absolute inset-x-3 bottom-0 border-t border-dashed"
                style={{
                  borderColor:
                    "color-mix(in oklab, var(--card) 55%, transparent)",
                }}
              />
            </motion.span>

            {/* The drag-tracked jagged cut, plus its shed foil flecks. */}
            {motionSafe && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0"
                style={{
                  top: TEAR_BAND_TOP,
                  height: TEAR_BAND_H,
                  overflow: "hidden",
                }}
              >
                <motion.span
                  className="absolute inset-0"
                  style={{
                    clipPath: tearClip,
                    background:
                      "color-mix(in oklab, var(--ink) 78%, transparent)",
                  }}
                />
              </span>
            )}
            {motionSafe && fleckKey > 0 && (
              <span
                key={fleckKey}
                aria-hidden
                className="pointer-events-none absolute"
                style={{
                  left: `${fleckX}%`,
                  top: TEAR_BAND_TOP + TEAR_BAND_H / 2,
                }}
              >
                {FLECKS.map((f, i) => (
                  <motion.span
                    key={i}
                    className="absolute size-1 rounded-full"
                    style={{
                      background:
                        "color-mix(in oklab, var(--card) 85%, var(--accent-bright))",
                    }}
                    initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                    animate={{ x: f.dx, y: f.dy, rotate: f.rot, opacity: 0 }}
                    transition={{
                      duration: durations.base,
                      ease: easings.exit,
                    }}
                  />
                ))}
              </span>
            )}
          </button>
        )}
      </div>

      <div className="flex min-h-[26px] items-center gap-3">
        {phase !== "open" && (
          <span className="font-mono text-xs text-ink-3">
            Drag the tear strip, or press Enter
          </span>
        )}
        {phase === "open" && !allRevealed && (
          <button
            type="button"
            onClick={handleRevealAll}
            className={cn(
              "font-mono text-[11px] font-medium text-ink-2 underline underline-offset-2 transition-colors outline-none",
              "hover:text-ink focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
            )}
          >
            Reveal all
          </button>
        )}
        {allRevealed && (
          <>
            <span className="font-mono text-xs text-ink-2 tabular-nums">
              {haulText}
            </span>
            <button
              type="button"
              onClick={handleNewPack}
              className={cn(
                "rounded-2 bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground shadow-raised transition-[filter] outline-none",
                "hover:brightness-110 active:brightness-95",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
              )}
            >
              New pack
            </button>
          </>
        )}
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}

/** The card back — a static diagonal weave and the pack's own mark. */
function CardBack(): React.JSX.Element {
  return (
    <div className="absolute inset-0 flex items-center justify-center border border-hairline-strong bg-surface-2">
      <span
        aria-hidden
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, color-mix(in oklab, var(--ink-3) 22%, transparent) 0px, color-mix(in oklab, var(--ink-3) 22%, transparent) 2px, transparent 2px, transparent 10px)",
        }}
      />
      <Sparkle aria-hidden className="relative size-5 text-ink-3" />
    </div>
  );
}

function CardFront({
  rarity,
  name,
  Glyph,
}: {
  rarity: RarityTier;
  name: string;
  Glyph: LucideIcon;
}): React.JSX.Element {
  return (
    <div
      className="absolute inset-0 border bg-surface-2"
      style={{ borderColor: rarity.tint }}
    >
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `color-mix(in oklab, ${rarity.tint} 14%, transparent)`,
        }}
      />
      <div className="relative flex size-full flex-col items-center justify-between p-2 text-center">
        <span
          aria-hidden
          className="mt-1 flex size-8 items-center justify-center rounded-full"
          style={{
            background: `color-mix(in oklab, ${rarity.tint} 24%, transparent)`,
          }}
        >
          <Glyph
            aria-hidden
            className="size-4"
            style={{ color: rarity.tint }}
          />
        </span>
        <span className="flex flex-col items-center gap-1">
          <span className="text-[11px] font-medium text-ink">{name}</span>
          <span
            className="font-mono text-[9px] font-semibold tracking-[0.12em] uppercase"
            style={{ color: rarity.tint }}
          >
            {rarity.label}
          </span>
          <span className="flex items-center gap-0.5">
            {Array.from({ length: rarity.pips }, (_, i) => (
              <span
                key={i}
                aria-hidden
                className="size-1 rounded-full"
                style={{ background: rarity.tint }}
              />
            ))}
          </span>
        </span>
      </div>
    </div>
  );
}

/** Legendary-only light sweep, clipped to the card's own rounded face. */
function CardSweep({
  motionSafe,
}: {
  motionSafe: boolean;
}): React.JSX.Element | null {
  if (!motionSafe) return null;
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 w-1/3"
      style={{
        skewX: -14,
        background:
          "linear-gradient(115deg, transparent, color-mix(in oklab, var(--card) 70%, transparent), transparent)",
      }}
      initial={{ x: "-160%" }}
      animate={{ x: "420%" }}
      transition={{ duration: 0.5, ease: easings.linear }}
    />
  );
}
