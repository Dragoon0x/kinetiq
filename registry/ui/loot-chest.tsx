"use client";

import * as React from "react";

import { Crown, Gem, Package, Sparkles } from "lucide-react";
import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Stage geometry, px. */
const STAGE_W = 200;
const STAGE_H = 196;
const CENTER_X = STAGE_W / 2;

/** Chest body — the seam between body and lid sits at SEAM_Y. */
const BODY_W = 130;
const BODY_H = 56;
const BODY_X = (STAGE_W - BODY_W) / 2;
const SEAM_Y = 110;
const BODY_BOTTOM = SEAM_Y + BODY_H;

const INTERIOR_W = BODY_W - 16;
const INTERIOR_X = BODY_X + 8;
const INTERIOR_H = 16;

const BAND_W = 10;
const BAND_LEFT_X = BODY_X + BODY_W * 0.26 - BAND_W / 2;
const BAND_RIGHT_X = BODY_X + BODY_W * 0.74 - BAND_W / 2;

/** Lid — an HTML wrapper hinged at its own bottom-center, which sits right
 * at the seam. Never an SVG motion child: transformOrigin only holds still
 * on HTML. */
const LID_W = 140;
const LID_H = 32;
const LID_X = (STAGE_W - LID_W) / 2;
const LID_Y = SEAM_Y - LID_H;
const LID_OPEN_DEG = -108;

/** Clasp — detached from the lid, pops off the seam on its own spring. */
const CLASP_W = 16;
const CLASP_H = 14;
const CLASP_X = CENTER_X - CLASP_W / 2;
const CLASP_Y = SEAM_Y - CLASP_H / 2;
const CLASP_POP_Y = -9;

/** Seam light leak — a thin bright line, scales in from the center. */
const SEAM_W = 70;

/** Beam — a soft cone erupting from the mouth, clipped to a trapezoid. */
const BEAM_W = 60;
const BEAM_H = 112;
const BEAM_X = CENTER_X - BEAM_W / 2;
const BEAM_Y = SEAM_Y - BEAM_H;
const BEAM_CLIP = "polygon(38% 100%, 62% 100%, 100% 0%, 0% 0%)";

/** Item card. */
const CARD_W = 92;
const CARD_H = 108;
const CARD_X = CENTER_X - CARD_W / 2;
const CARD_TOP = 6;
const CARD_CENTER_Y = CARD_TOP + CARD_H / 2;
/** How far below rest the card starts, sunk near the chest mouth. */
const CARD_SUNK_OFFSET = 88;

const RING_D = 104;
const GLOW_D = 156;

/** Ground shadow. */
const GROUND_W = 96;
const GROUND_Y = BODY_BOTTOM + 8;

/** Authored timings. */
const ANTICIPATION_S = 0.55;
const OPEN_S = 0.5;
const POST_LAND_BEAT_MS = 150;
const SWEEP_S = 0.6;
const GLOW_SPIN_S = 7;
const CAPTION_FLASH_S = 1.1;

/** Three shudders, rising amplitude — a tween, never a spring. */
const SHUDDER_X = [0, -3, 3, -6, 6, -10, 10, 0] as const;
const SHUDDER_TIMES = [0, 0.14, 0.28, 0.42, 0.56, 0.7, 0.85, 1] as const;

/** Caption blink — two dips before it holds, a tween. */
const CAPTION_FLASH_OPACITY = [0, 1, 0.25, 1, 0.25, 1] as const;
const CAPTION_FLASH_TIMES = [0, 0.12, 0.32, 0.52, 0.72, 1] as const;

/** Eight fixed spark vectors, evenly spaced from the top. No Math.random. */
const TAU = Math.PI * 2;
const SPARK_COUNT = 8;
const SPARK_SPREAD = 44;
const SPARKS = Array.from({ length: SPARK_COUNT }, (_, i) => {
  const angle = (i / SPARK_COUNT) * TAU - TAU / 4;
  return {
    dx: Math.cos(angle) * SPARK_SPREAD,
    dy: Math.sin(angle) * SPARK_SPREAD,
  };
});

const SWEEP_W = 22;
const SWEEP_HIDDEN_LEFT = -(SWEEP_W + 16);
const SWEEP_VISIBLE_LEFT = CARD_W + 16;
const SHEEN =
  "linear-gradient(115deg, transparent 0%, oklch(1 0 0 / 0.05) 22%, oklch(1 0 0 / 0.55) 50%, oklch(1 0 0 / 0.05) 78%, transparent 100%)";

/** Fixed corner order for rarity pips — top-left, top-right, bottom-left,
 * bottom-right. */
const PIP_CORNERS = [
  { top: -5, left: -5 },
  { top: -5, right: -5 },
  { bottom: -5, left: -5 },
  { bottom: -5, right: -5 },
] as const;

/** Chest chrome is warm and fixed; only the card takes on a rarity tint. */
const CHEST_WOOD =
  "color-mix(in oklab, var(--warning, #b45309) 24%, var(--color-surface-2))";
const CHEST_WOOD_DEEP =
  "color-mix(in oklab, var(--warning, #b45309) 42%, var(--color-surface-2))";
const CHEST_BAND = "color-mix(in oklab, var(--ink-2) 55%, transparent)";
const CHEST_INTERIOR =
  "color-mix(in oklab, var(--ink-2) 42%, var(--color-surface-0))";
const CLASP_FILL =
  "color-mix(in oklab, var(--warning, #b45309) 55%, var(--ink-2))";
const EDGE = "color-mix(in oklab, var(--ink-2) 50%, transparent)";
const GROUND = "color-mix(in oklab, var(--ink-2) 18%, transparent)";
const SEAM_LIGHT =
  "color-mix(in oklab, var(--warning, #b45309) 75%, var(--ink) 25%)";
const BEAM_FILL =
  "linear-gradient(to top, color-mix(in oklab, var(--warning, #b45309) 55%, transparent) 0%, color-mix(in oklab, var(--warning, #b45309) 22%, transparent) 55%, transparent 100%)";

export type Rarity = {
  id: string;
  name: string;
  label: string;
  tint: string;
  pips: number;
};

/** Fixed four-tier rarity cycle — never randomized. A click always advances
 * to the next entry, wrapping forever, so the odds are exactly what the
 * order shows. */
const DEFAULT_RARITIES: Rarity[] = [
  {
    id: "common",
    name: "COMMON",
    label: "common",
    tint: "var(--ink-2)",
    pips: 1,
  },
  {
    id: "rare",
    name: "RARE",
    label: "rare",
    tint: "var(--primary)",
    pips: 2,
  },
  {
    id: "epic",
    name: "EPIC",
    label: "epic",
    tint: "var(--success, #047857)",
    pips: 3,
  },
  {
    id: "legendary",
    name: "LEGENDARY",
    label: "legendary",
    tint: "var(--warning, #b45309)",
    pips: 4,
  },
];

/** `DEFAULT_RARITIES[0]` is a literal-index read of a fixed four-entry
 * table — always defined — but every dynamic lookup still needs a real
 * fallback object under noUncheckedIndexedAccess. */
const FALLBACK_RARITY: Rarity = DEFAULT_RARITIES[0] ?? {
  id: "common",
  name: "COMMON",
  label: "common",
  tint: "var(--ink-2)",
  pips: 1,
};

/** Glyph and reaction intensity both escalate with a rarity's position in
 * the cycle, clamped at the fourth tier's full treatment — a longer custom
 * cycle never runs out of spectacle, it just holds at "legendary". */
const TIER_ICONS = [Package, Gem, Sparkles, Crown] as const;
/** Returns the rendered glyph, not the component type: handing a capitalized
 * component out of a helper during render trips react-hooks/static-components. */
const tierGlyph = (tier: number, tint: string) => {
  const Glyph = TIER_ICONS[tier] ?? Package;
  return <Glyph width={26} height={26} color={tint} strokeWidth={2} />;
};
const reactionTier = (index: number): 0 | 1 | 2 | 3 =>
  index <= 0 ? 0 : index === 1 ? 1 : index === 2 ? 2 : 3;

type Phase = "closed" | "anticipating" | "opening" | "revealed" | "closing";

export type LootChestProps = {
  /** The rarity cycle, in fixed order. @default four built-in tiers */
  rarities?: Rarity[];
  /** Fires once the rarity is determined, right as the card begins to
   * rise, with that rarity's label. */
  onOpen?: (rarity: string) => void;
  className?: string;
};

/**
 * A chest that turns a click into a small ceremony. Press it and the
 * anticipation runs first — three rising shudders on a tween, the clasp
 * popping open on `flick`, light leaking through the seam — before the
 * domed lid swings open on an HTML wrapper and a beam erupts from the
 * mouth. An item card rises out of that beam on `recoil` (set to a sunk
 * peak, then released to rest) and settles into one of four rarities,
 * cycled in a FIXED order — common, rare, epic, legendary — never rolled:
 * the same click always produces the same next tier, so the odds are
 * exactly what they look like. Reaction escalates with rarity: common just
 * settles, rare adds a ring pulse, epic adds eight sparks and a sweep
 * across the card, and legendary adds all of that plus a slow rotating
 * glow and a flashing mono caption. A "take it" button closes the chest —
 * the lid drops on `snap` and the card shrinks back into it — and re-arms
 * for the next open, already queued.
 * Reduced motion: a click swaps straight to the open chest with the card
 * sitting at rest, rarity tint, pips, and ring/glow styling intact; the
 * shudder, beam, sparks, and sweep are skipped, and the caption still
 * flashes for legendary.
 */
export function LootChest({
  rarities = DEFAULT_RARITIES,
  onOpen,
  className,
}: LootChestProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [phase, setPhase] = React.useState<Phase>("closed");
  const [rarity, setRarity] = React.useState<Rarity | null>(null);
  const [tier, setTier] = React.useState<0 | 1 | 2 | 3>(0);
  const [opensCount, setOpensCount] = React.useState(0);
  const [bestLabel, setBestLabel] = React.useState<string | null>(null);
  const [ringKey, setRingKey] = React.useState(0);
  const [sparkKey, setSparkKey] = React.useState(0);
  const [sweepKey, setSweepKey] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");

  const phaseRef = React.useRef<Phase>("closed");
  const rarityIndexRef = React.useRef(0);
  const bestIndexRef = React.useRef(-1);

  const motionSafeRef = React.useRef(motionSafe);
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  }, [motionSafe]);
  const raritiesRef = React.useRef(rarities);
  React.useEffect(() => {
    raritiesRef.current = rarities;
  }, [rarities]);
  const onOpenRef = React.useRef(onOpen);
  React.useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);

  const shudderX = useMotionValue<number>(0);
  const claspY = useMotionValue<number>(0);
  const seamScale = useMotionValue<number>(0);
  const lidRotate = useMotionValue<number>(0);
  const beamScale = useMotionValue<number>(0);
  const beamOpacity = useMotionValue<number>(0);
  const cardY = useMotionValue<number>(CARD_SUNK_OFFSET);
  const cardOpacity = useMotionValue<number>(0);
  const cardScale = useMotionValue<number>(1);
  const glowRotate = useMotionValue<number>(0);
  const captionFlashOpacity = useMotionValue<number>(0);

  const shudderAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const claspAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const seamAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const lidAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const beamScaleAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const beamOpacityAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const cardYAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const cardOpacityAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const cardScaleAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const glowAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const captionFlashAnim = React.useRef<ReturnType<typeof animate> | null>(
    null,
  );
  const beatTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      shudderAnim.current?.stop();
      claspAnim.current?.stop();
      seamAnim.current?.stop();
      lidAnim.current?.stop();
      beamScaleAnim.current?.stop();
      beamOpacityAnim.current?.stop();
      cardYAnim.current?.stop();
      cardOpacityAnim.current?.stop();
      cardScaleAnim.current?.stop();
      glowAnim.current?.stop();
      captionFlashAnim.current?.stop();
      if (beatTimer.current !== null) window.clearTimeout(beatTimer.current);
    };
  }, []);

  const jumpToRevealed = () => {
    shudderX.jump(0);
    claspY.jump(CLASP_POP_Y);
    seamScale.jump(0);
    lidRotate.jump(LID_OPEN_DEG);
    beamScale.jump(0);
    beamOpacity.jump(0);
    cardY.jump(0);
    cardOpacity.jump(1);
    cardScale.jump(1);
  };

  const resetToClosed = () => {
    phaseRef.current = "closed";
    setPhase("closed");
    setRarity(null);
    shudderX.jump(0);
    claspY.jump(0);
    seamScale.jump(0);
    lidRotate.jump(0);
    beamScale.jump(0);
    beamOpacity.jump(0);
    cardY.jump(CARD_SUNK_OFFSET);
    cardOpacity.jump(0);
    cardScale.jump(1);
    setAnnounce("Chest closed.");
  };

  const fireReaction = (chosenTier: 0 | 1 | 2 | 3) => {
    if (chosenTier >= 1) setRingKey((k) => k + 1);
    if (chosenTier >= 2) {
      setSparkKey((k) => k + 1);
      setSweepKey((k) => k + 1);
    }
  };

  const beginReveal = (chosen: Rarity, chosenTier: 0 | 1 | 2 | 3) => {
    phaseRef.current = "revealed";
    setPhase("revealed");
    setOpensCount((n) => n + 1);
    onOpenRef.current?.(chosen.label);
    setAnnounce(`Opened ${chosen.label}.`);

    cardOpacityAnim.current?.stop();
    cardOpacity.set(0);
    cardOpacityAnim.current = animate(cardOpacity, 1, {
      duration: durations.fast,
      ease: easings.enter,
    });

    cardYAnim.current?.stop();
    cardY.set(CARD_SUNK_OFFSET);
    cardYAnim.current = animate(cardY, 0, {
      ...springs.recoil,
      onComplete: () => {
        beatTimer.current = window.setTimeout(() => {
          beatTimer.current = null;
          fireReaction(chosenTier);
        }, POST_LAND_BEAT_MS);
      },
    });

    glowAnim.current?.stop();
    captionFlashAnim.current?.stop();
    if (chosenTier >= 3) {
      glowRotate.set(0);
      glowAnim.current = animate(glowRotate, 360, {
        duration: GLOW_SPIN_S,
        ease: easings.linear,
        repeat: Infinity,
      });
      captionFlashOpacity.set(0);
      captionFlashAnim.current = animate(
        captionFlashOpacity,
        [...CAPTION_FLASH_OPACITY],
        {
          duration: CAPTION_FLASH_S,
          times: [...CAPTION_FLASH_TIMES],
          ease: easings.move,
        },
      );
    }
  };

  const beginOpen = (chosen: Rarity, chosenTier: 0 | 1 | 2 | 3) => {
    phaseRef.current = "opening";
    setPhase("opening");

    lidAnim.current?.stop();
    lidAnim.current = animate(lidRotate, LID_OPEN_DEG, {
      duration: OPEN_S,
      ease: easings.enter,
      onComplete: () => beginReveal(chosen, chosenTier),
    });

    beamScaleAnim.current?.stop();
    beamScale.set(0);
    beamScaleAnim.current = animate(beamScale, 1, {
      duration: OPEN_S,
      ease: easings.enter,
    });

    beamOpacityAnim.current?.stop();
    beamOpacity.set(0);
    beamOpacityAnim.current = animate(beamOpacity, 1, {
      duration: OPEN_S,
      ease: easings.enter,
    });
  };

  const handleOpen = () => {
    if (phaseRef.current !== "closed") return;

    const list =
      raritiesRef.current.length > 0 ? raritiesRef.current : DEFAULT_RARITIES;
    const index = rarityIndexRef.current % list.length;
    const chosen = list[index] ?? FALLBACK_RARITY;
    rarityIndexRef.current = (index + 1) % list.length;

    const chosenTier = reactionTier(index);
    bestIndexRef.current = Math.max(bestIndexRef.current, index);
    const bestEntry = list[bestIndexRef.current] ?? chosen;

    setRarity(chosen);
    setTier(chosenTier);
    setBestLabel(bestEntry.label);

    if (!motionSafeRef.current) {
      phaseRef.current = "revealed";
      jumpToRevealed();
      setPhase("revealed");
      setOpensCount((n) => n + 1);
      onOpenRef.current?.(chosen.label);
      setAnnounce(`Opened ${chosen.label}.`);

      glowAnim.current?.stop();
      captionFlashAnim.current?.stop();
      if (chosenTier >= 3) {
        captionFlashOpacity.set(0);
        captionFlashAnim.current = animate(
          captionFlashOpacity,
          [...CAPTION_FLASH_OPACITY],
          {
            duration: CAPTION_FLASH_S,
            times: [...CAPTION_FLASH_TIMES],
            ease: easings.move,
          },
        );
      }
      return;
    }

    phaseRef.current = "anticipating";
    setPhase("anticipating");

    shudderAnim.current?.stop();
    shudderX.set(0);
    shudderAnim.current = animate(shudderX, [...SHUDDER_X], {
      duration: ANTICIPATION_S,
      ease: easings.move,
      times: [...SHUDDER_TIMES],
      onComplete: () => {
        shudderX.set(0);
        beginOpen(chosen, chosenTier);
      },
    });

    claspAnim.current?.stop();
    claspAnim.current = animate(claspY, CLASP_POP_Y, springs.flick);

    seamAnim.current?.stop();
    seamScale.set(0);
    seamAnim.current = animate(seamScale, 1, {
      duration: ANTICIPATION_S,
      ease: easings.enter,
    });
  };

  const handleTakeIt = () => {
    if (phaseRef.current !== "revealed") return;
    phaseRef.current = "closing";
    setPhase("closing");

    glowAnim.current?.stop();
    captionFlashAnim.current?.stop();
    captionFlashOpacity.set(0);

    if (!motionSafeRef.current) {
      resetToClosed();
      return;
    }

    cardScaleAnim.current?.stop();
    cardScaleAnim.current = animate(cardScale, 0, {
      duration: durations.base,
      ease: easings.exit,
    });
    cardOpacityAnim.current?.stop();
    cardOpacityAnim.current = animate(cardOpacity, 0, {
      duration: durations.base,
      ease: easings.exit,
    });
    cardYAnim.current?.stop();
    cardYAnim.current = animate(cardY, CARD_SUNK_OFFSET, {
      duration: durations.base,
      ease: easings.exit,
    });

    claspAnim.current?.stop();
    claspAnim.current = animate(claspY, 0, springs.snap);

    seamAnim.current?.stop();
    seamAnim.current = animate(seamScale, 0, {
      duration: durations.fast,
      ease: easings.exit,
    });

    beamOpacityAnim.current?.stop();
    beamOpacityAnim.current = animate(beamOpacity, 0, {
      duration: durations.fast,
      ease: easings.exit,
    });

    lidAnim.current?.stop();
    lidAnim.current = animate(lidRotate, 0, {
      ...springs.snap,
      onComplete: () => resetToClosed(),
    });
  };

  const activeRarity = rarity ?? rarities[0] ?? FALLBACK_RARITY;
  const cardTint = activeRarity.tint;
  const pipCount = Math.max(0, Math.min(4, Math.trunc(activeRarity.pips)));
  const revealed = phase === "revealed";

  return (
    <div className={cn("inline-flex flex-col items-center gap-3", className)}>
      <div className="relative" style={{ width: STAGE_W, height: STAGE_H }}>
        <span
          aria-hidden
          className="absolute rounded-full"
          style={{
            left: CENTER_X - GROUND_W / 2,
            top: GROUND_Y,
            width: GROUND_W,
            height: 10,
            background: GROUND,
          }}
        />

        <button
          type="button"
          aria-label="Open the chest"
          onClick={handleOpen}
          disabled={phase !== "closed"}
          className={cn(
            "absolute inset-0 block cursor-pointer touch-manipulation rounded-4 outline-none select-none",
            "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
            "disabled:cursor-default",
            !motionSafe && phase === "closed" && "active:brightness-95",
          )}
        >
          <span aria-hidden className="absolute inset-0 overflow-visible">
            <motion.div className="absolute inset-0" style={{ x: shudderX }}>
              <span
                className="absolute"
                style={{
                  left: BODY_X,
                  top: SEAM_Y,
                  width: BODY_W,
                  height: BODY_H,
                  borderRadius: "8px 8px 16px 16px",
                  background: CHEST_WOOD,
                  border: `1px solid ${EDGE}`,
                  boxShadow: "var(--edge-highlight)",
                }}
              />
              <span
                className="absolute rounded-t-[4px]"
                style={{
                  left: INTERIOR_X,
                  top: SEAM_Y - 4,
                  width: INTERIOR_W,
                  height: INTERIOR_H,
                  background: CHEST_INTERIOR,
                }}
              />
              <span
                className="absolute"
                style={{
                  left: BAND_LEFT_X,
                  top: SEAM_Y,
                  width: BAND_W,
                  height: BODY_H,
                  background: CHEST_BAND,
                }}
              />
              <span
                className="absolute"
                style={{
                  left: BAND_RIGHT_X,
                  top: SEAM_Y,
                  width: BAND_W,
                  height: BODY_H,
                  background: CHEST_BAND,
                }}
              />

              <motion.span
                className="absolute rounded-full"
                style={{
                  left: CENTER_X - SEAM_W / 2,
                  top: SEAM_Y - 1.5,
                  width: SEAM_W,
                  height: 3,
                  background: SEAM_LIGHT,
                  boxShadow: `0 0 10px 2px ${SEAM_LIGHT}`,
                  transformOrigin: "50% 50%",
                  scaleX: seamScale,
                }}
              />

              <motion.div
                className="absolute"
                style={{
                  left: LID_X,
                  top: LID_Y,
                  width: LID_W,
                  height: LID_H,
                  transformOrigin: "bottom center",
                  rotate: lidRotate,
                }}
              >
                <span
                  className="absolute inset-0"
                  style={{
                    borderRadius: "28px 28px 6px 6px",
                    background: CHEST_WOOD_DEEP,
                    border: `1px solid ${EDGE}`,
                    boxShadow: "var(--edge-highlight)",
                  }}
                />
              </motion.div>

              <motion.span
                className="absolute rounded-[3px]"
                style={{
                  left: CLASP_X,
                  top: CLASP_Y,
                  width: CLASP_W,
                  height: CLASP_H,
                  background: CLASP_FILL,
                  border: `1px solid ${EDGE}`,
                  y: claspY,
                }}
              />
            </motion.div>

            <motion.span
              className="absolute"
              style={{
                left: BEAM_X,
                top: BEAM_Y,
                width: BEAM_W,
                height: BEAM_H,
                background: BEAM_FILL,
                clipPath: BEAM_CLIP,
                transformOrigin: "bottom center",
                scale: beamScale,
                opacity: beamOpacity,
              }}
            />
          </span>
        </button>

        <div aria-hidden className="pointer-events-none absolute inset-0">
          {tier >= 3 && revealed && (
            <motion.div
              className="absolute rounded-full"
              style={{
                left: CENTER_X - GLOW_D / 2,
                top: CARD_CENTER_Y - GLOW_D / 2,
                width: GLOW_D,
                height: GLOW_D,
                background: `radial-gradient(circle at 32% 32%, color-mix(in oklab, ${cardTint} 45%, transparent) 0%, transparent 62%)`,
                filter: "blur(4px)",
                rotate: motionSafe ? glowRotate : 0,
              }}
            />
          )}

          {tier >= 1 && revealed && !motionSafe && (
            <span
              className="absolute rounded-full"
              style={{
                left: CENTER_X - RING_D / 2,
                top: CARD_CENTER_Y - RING_D / 2,
                width: RING_D,
                height: RING_D,
                border: `2px solid ${cardTint}`,
                opacity: 0.5,
              }}
            />
          )}

          {motionSafe && ringKey > 0 && (
            <motion.span
              key={ringKey}
              className="absolute rounded-full"
              style={{
                left: CENTER_X - RING_D / 2,
                top: CARD_CENTER_Y - RING_D / 2,
                width: RING_D,
                height: RING_D,
                border: `2px solid ${cardTint}`,
              }}
              initial={{ scale: 0.6, opacity: 0.85 }}
              animate={{ scale: 1.6, opacity: 0 }}
              transition={{ duration: durations.slow, ease: easings.exit }}
            />
          )}

          <motion.div
            className="absolute rounded-3 border bg-surface-1 shadow-raised"
            style={{
              left: CARD_X,
              top: CARD_TOP,
              width: CARD_W,
              height: CARD_H,
              borderColor: cardTint,
              y: cardY,
              scale: cardScale,
              opacity: cardOpacity,
            }}
          >
            <div className="relative flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-3 px-3">
              {tierGlyph(tier, cardTint)}
              <span className="text-center font-mono text-xs font-semibold tracking-wide text-ink uppercase">
                {activeRarity.name}
              </span>
              <span
                className="rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wide uppercase"
                style={{ borderColor: cardTint, color: cardTint }}
              >
                {activeRarity.label}
              </span>

              {motionSafe && sweepKey > 0 && (
                <motion.span
                  key={sweepKey}
                  className="pointer-events-none absolute"
                  style={{
                    top: "-20%",
                    height: "140%",
                    width: SWEEP_W,
                    transform: "skewX(-20deg)",
                    background: SHEEN,
                  }}
                  initial={{ left: SWEEP_HIDDEN_LEFT }}
                  animate={{ left: SWEEP_VISIBLE_LEFT }}
                  transition={{ duration: SWEEP_S, ease: easings.move }}
                />
              )}
            </div>

            {PIP_CORNERS.map((corner, i) => (
              <span
                key={i}
                className="absolute size-[7px] rounded-full"
                style={{
                  ...corner,
                  background: i < pipCount ? cardTint : "transparent",
                  border: `1px solid ${i < pipCount ? cardTint : "var(--hairline-strong)"}`,
                  transition:
                    "background-color 200ms ease, border-color 200ms ease",
                }}
              />
            ))}
          </motion.div>

          {motionSafe && sparkKey > 0 && (
            <span
              key={sparkKey}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: CENTER_X, top: CARD_CENTER_Y }}
            >
              {SPARKS.map((s, i) => (
                <motion.span
                  key={i}
                  className="absolute size-[3px] rounded-full"
                  style={{ background: cardTint }}
                  initial={{ x: 0, y: 0, opacity: 1 }}
                  animate={{ x: s.dx, y: s.dy, opacity: 0 }}
                  transition={{ duration: durations.slow, ease: easings.exit }}
                />
              ))}
            </span>
          )}

          {tier >= 3 && revealed && (
            <span
              className="absolute inset-x-0 text-center text-label text-ink"
              style={{ top: CARD_TOP + CARD_H + 8 }}
            >
              <motion.span style={{ opacity: captionFlashOpacity }}>
                {activeRarity.name}
              </motion.span>
            </span>
          )}
        </div>
      </div>

      {revealed && (
        <motion.button
          type="button"
          onClick={handleTakeIt}
          initial={motionSafe ? { opacity: 0, y: 6 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={
            motionSafe
              ? { duration: durations.base, ease: easings.enter }
              : { duration: 0 }
          }
          className={cn(
            "rounded-2 bg-primary px-3 py-1.5 font-mono text-xs font-semibold tracking-wide text-primary-foreground uppercase shadow-raised transition-[filter] outline-none",
            "hover:brightness-110 active:brightness-95",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
          )}
        >
          Take it
        </motion.button>
      )}

      <div className="flex flex-col items-center gap-0.5 font-mono text-xs text-ink-3 tabular-nums">
        <span>{opensCount} opened</span>
        <span>best: {bestLabel ?? "—"}</span>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
