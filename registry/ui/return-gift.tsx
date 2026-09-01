"use client";

import * as React from "react";

import {
  Coffee,
  Cookie,
  Crown,
  Gem,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

/** Stage geometry, px. */
const STAGE_W = 264;
const STAGE_H = 214;
const CENTER_X = STAGE_W / 2;

/** Parcel body — grows with tier so a longer absence is legible before the
 * lid ever lifts. */
const BODY_H = 52;
const BODY_TOP = 124;
const BODY_BOTTOM = BODY_TOP + BODY_H;
const BODY_W_BY_TIER = [86, 98, 112, 128] as const;

/** Lid — an HTML wrapper hinged at its own bottom-center, never an SVG
 * motion child: transformOrigin only holds still on HTML. */
const LID_H = 22;
const LID_TOP = BODY_TOP - LID_H;
const LID_W_BY_TIER = [98, 112, 128, 146] as const;
const LID_OPEN_ROTATE = -30;
const LID_OPEN_Y = -16;

/** Ribbon cross — thickness scales with tier for a "richer ribbon" read. */
const RIBBON_W_BY_TIER = [8, 10, 13, 16] as const;
/** How far each arm slides off the box, in opposite directions. */
const RIBBON_SLIDE = 90;
const RIBBON_STAGGER_S = 0.06;
const BOW_SIZE_BY_TIER = [30, 34, 38, 42] as const;

/** Wax seal — top-tier-only ornament on the lid, breaks away on open. */
const SEAL_D = 16;

/** Beam — a soft cone erupting from the mouth, clipped to a trapezoid. */
const BEAM_W = 64;
const BEAM_H = 100;
const BEAM_CLIP = "polygon(38% 100%, 62% 100%, 100% 0%, 0% 0%)";
const BEAM_INTENSITY_BY_TIER = [0.28, 0.4, 0.55, 0.72] as const;

/** Ground shadow. */
const GROUND_W = 112;
const GROUND_Y = BODY_BOTTOM + 8;

/** Gift tile row. */
const TILE_W = 56;
const TILE_H = 64;
const TILE_GAP = 8;
const TILE_ROW_TOP = 4;
/** How far below rest a tile starts, sunk near the parcel mouth. */
const TILE_SUNK = 30;

const RING_D = 54;
const TAU = Math.PI * 2;
const SPARK_COUNT = 8;
const SPARK_SPREAD = 22;

/** Eight fixed spark vectors, evenly spaced from the top — never Math.random. */
const BEST_SPARKS = Array.from({ length: SPARK_COUNT }, (_, i) => {
  const angle = (i / SPARK_COUNT) * TAU - TAU / 4;
  return {
    dx: Math.cos(angle) * SPARK_SPREAD,
    dy: Math.sin(angle) * SPARK_SPREAD,
  };
});

/** Authored timings. The lid (and the beam behind it) waits for the ribbon
 * to finish clearing before it moves; items wait for the lid. */
const UNTIE_S = 0.4;
const LIFT_S = 0.42;
const ITEMS_BASE_DELAY_S = UNTIE_S + LIFT_S;
/** Extra pause before the best item, on top of its cascade slot — the
 * reveal order is the reward. */
const BEST_HOLD_S = 0.3;

const PAPER =
  "color-mix(in oklab, var(--warning, #b45309) 14%, var(--color-surface-2))";
const PAPER_DEEP =
  "color-mix(in oklab, var(--warning, #b45309) 30%, var(--color-surface-2))";
const RIBBON = "color-mix(in oklab, var(--primary) 55%, var(--card))";
const BOW_FILL = "color-mix(in oklab, var(--primary) 70%, var(--card))";
const SEAL_FILL =
  "color-mix(in oklab, var(--warning, #b45309) 65%, var(--ink))";
const INTERIOR =
  "color-mix(in oklab, var(--ink-2) 32%, var(--color-surface-0))";
const EDGE = "color-mix(in oklab, var(--ink-2) 50%, transparent)";
const GROUND = "color-mix(in oklab, var(--ink-2) 18%, transparent)";
const BEAM_FILL =
  "linear-gradient(to top, color-mix(in oklab, var(--warning, #b45309) 55%, transparent) 0%, color-mix(in oklab, var(--warning, #b45309) 20%, transparent) 55%, transparent 100%)";
const PANEL_WASH =
  "radial-gradient(60% 50% at 50% 28%, color-mix(in oklab, var(--warning, #b45309) 10%, transparent) 0%, transparent 70%)";
const BEST_TINT = "var(--warning, #b45309)";

export type Absence = { id: string; label: string; tier: number };

/** Fixed four-stop absence scale — index order also drives box size and
 * gift count, so a longer absence always reads as a bigger parcel. */
const DEFAULT_ABSENCE: Absence[] = [
  { id: "1-day", label: "1 day", tier: 0 },
  { id: "4-days", label: "4 days", tier: 1 },
  { id: "2-weeks", label: "2 weeks", tier: 2 },
  { id: "1-month", label: "a month", tier: 3 },
];

const FALLBACK_ABSENCE: Absence = DEFAULT_ABSENCE[0] ?? {
  id: "1-day",
  label: "1 day",
  tier: 0,
};

type GiftKind = { icon: LucideIcon; name: string; count: number };

/** Fixed per-tier gift table — never rolled. The last entry in each row is
 * the "best" item: it always arrives last, held back on purpose. */
const TIER_GIFTS: GiftKind[][] = [
  [{ icon: Coffee, name: "coffee", count: 1 }],
  [
    { icon: Cookie, name: "cookie", count: 2 },
    { icon: Gem, name: "gem", count: 1 },
  ],
  [
    { icon: Coffee, name: "coffee", count: 3 },
    { icon: Cookie, name: "cookie", count: 2 },
    { icon: Ticket, name: "ticket", count: 1 },
  ],
  [
    { icon: Coffee, name: "coffee", count: 4 },
    { icon: Cookie, name: "cookie", count: 3 },
    { icon: Ticket, name: "ticket", count: 2 },
    { icon: Crown, name: "crown", count: 1 },
  ],
];

const FALLBACK_TIER_GIFTS: GiftKind[] = TIER_GIFTS[0] ?? [];

const clampTier = (tier: number): 0 | 1 | 2 | 3 => {
  const t = Math.trunc(tier);
  if (t <= 0) return 0;
  if (t === 1) return 1;
  if (t === 2) return 2;
  return 3;
};

const giftsForTier = (tier: number): GiftKind[] =>
  TIER_GIFTS[clampTier(tier)] ?? FALLBACK_TIER_GIFTS;

const totalForTier = (tier: number): number =>
  giftsForTier(tier).reduce((sum, g) => sum + g.count, 0);

const captionFor = (label: string, count: number): string =>
  `${label} away · ${count} gift${count === 1 ? "" : "s"}`;

/** Returns the rendered glyph, not the component type: handing a capitalized
 * component out of a helper during render trips react-hooks/static-components. */
function giftGlyph(icon: LucideIcon, color: string): React.JSX.Element {
  const Icon = icon;
  return (
    <Icon aria-hidden width={20} height={20} color={color} strokeWidth={2} />
  );
}

type Phase = "wrapped" | "opening" | "revealed" | "collected";

type GiftTileProps = {
  kind: GiftKind;
  index: number;
  count: number;
  left: number;
  top: number;
  isBest: boolean;
  motionSafe: boolean;
  onArrive?: () => void;
};

/** One rising gift tile — a real child component so its per-item entrance
 * delay and arrival callback never live inside the parent's .map(). */
function GiftTile({
  kind,
  index,
  count,
  left,
  top,
  isBest,
  motionSafe,
  onArrive,
}: GiftTileProps): React.JSX.Element {
  const delay =
    ITEMS_BASE_DELAY_S +
    index * cascade(count) +
    (isBest && count > 1 ? BEST_HOLD_S : 0);
  const tint = isBest ? BEST_TINT : "var(--ink-2)";

  return (
    <motion.div
      className="absolute flex flex-col items-center justify-center gap-1 rounded-2 border bg-surface-1 px-1.5 shadow-raised"
      style={{
        left,
        top,
        width: TILE_W,
        height: TILE_H,
        borderColor: isBest ? tint : "var(--hairline-strong)",
      }}
      initial={motionSafe ? { opacity: 0, scale: 0.4, y: TILE_SUNK } : false}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={
        motionSafe
          ? {
              opacity: 0,
              scale: 0.6,
              y: -6,
              transition: exitFor(durations.base),
            }
          : { opacity: 0, transition: { duration: 0 } }
      }
      transition={motionSafe ? { ...springs.flick, delay } : { duration: 0 }}
      onAnimationComplete={onArrive}
    >
      {giftGlyph(kind.icon, tint)}
      <span className="text-center text-[11px] leading-tight font-medium text-ink capitalize">
        {kind.name}
      </span>
      <span
        className="rounded-full border px-1.5 py-0.5 font-mono text-[10px] text-ink-2 tabular-nums"
        style={{ borderColor: "var(--hairline-strong)" }}
      >
        ×{kind.count}
      </span>
    </motion.div>
  );
}

export type ReturnGiftProps = {
  /** The absence scale, in ascending order. @default four built-in stops */
  absenceOptions?: Absence[];
  /** Fires once per collect, with the summed count of every gift inside. */
  onCollect?: (total: number) => void;
  className?: string;
};

/**
 * A parcel that is glad you are back. Pick how long you were away on the
 * segmented row and the box previews it before you ever open it — bigger,
 * with a richer ribbon, a wax seal at the top two tiers. Pressing "open"
 * unties the ribbon on two authored tweens sliding in opposite directions,
 * lifts and tips the lid, and lets a beam spill out sized to the tier; gift
 * tiles then rise out of the box one after another on `flick` and settle
 * into a row, with the best item at the top tiers deliberately held back to
 * arrive last, under a ring and eight sparks — the order of a reveal is the
 * reward. "Collect" gathers the tiles into a total that rolls through a
 * composed `Readout`, and "wrap another" reassembles the box so tiers can be
 * compared side by side. Changing the absence or wrapping again mid-open
 * cancels cleanly: every beat is driven by phase state, so retargeting it
 * simply interrupts whatever was mid-flight. The tone never turns on you —
 * there is no tally of missed days, only what came back with you.
 * Reduced motion: no untie, lift, beam, cascade, ring, or sparks — opening
 * presents the gifts in place at once, the caption still reads, and
 * collecting still updates the `Readout` total, which steps it instantly per
 * its own reduced-motion handling.
 */
export function ReturnGift({
  absenceOptions,
  onCollect,
  className,
}: ReturnGiftProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const options =
    absenceOptions && absenceOptions.length > 0
      ? absenceOptions
      : DEFAULT_ABSENCE;

  const [selectedId, setSelectedId] = React.useState<string>(
    () => options[1]?.id ?? options[0]?.id ?? FALLBACK_ABSENCE.id,
  );
  const [phase, setPhase] = React.useState<Phase>("wrapped");
  const [readoutValue, setReadoutValue] = React.useState(0);
  const [ringKey, setRingKey] = React.useState(0);
  const [sparkKey, setSparkKey] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");

  const phaseRef = React.useRef<Phase>("wrapped");
  const onCollectRef = React.useRef(onCollect);
  React.useEffect(() => {
    onCollectRef.current = onCollect;
  }, [onCollect]);

  const selectedOption =
    options.find((o) => o.id === selectedId) ?? options[0] ?? FALLBACK_ABSENCE;
  const tier = clampTier(selectedOption.tier);
  const items = giftsForTier(tier);
  const giftCount = items.length;

  const bodyW = BODY_W_BY_TIER[tier] ?? 86;
  const bodyLeft = CENTER_X - bodyW / 2;
  const lidW = LID_W_BY_TIER[tier] ?? 98;
  const lidLeft = CENTER_X - lidW / 2;
  const ribbonW = RIBBON_W_BY_TIER[tier] ?? 8;
  const bowSize = BOW_SIZE_BY_TIER[tier] ?? 30;
  const beamIntensity = BEAM_INTENSITY_BY_TIER[tier] ?? 0.28;

  const rowWidth = giftCount * TILE_W + (giftCount - 1) * TILE_GAP;
  const rowLeft = CENTER_X - rowWidth / 2;
  const bestLeft = rowLeft + (giftCount - 1) * (TILE_W + TILE_GAP);
  const bestCenterX = bestLeft + TILE_W / 2;
  const bestCenterY = TILE_ROW_TOP + TILE_H / 2;

  const lidOpen = phase !== "wrapped";
  const itemsVisible =
    phase === "opening" || phase === "revealed" || phase === "collected";

  const handleOpen = () => {
    if (phaseRef.current !== "wrapped") return;
    if (!motionSafe) {
      phaseRef.current = "revealed";
      setPhase("revealed");
      setAnnounce(captionFor(selectedOption.label, giftCount));
      return;
    }
    phaseRef.current = "opening";
    setPhase("opening");
    setAnnounce(`Opening, ${selectedOption.label} away.`);
  };

  const handleBestArrive = () => {
    if (phaseRef.current !== "opening") return;
    phaseRef.current = "revealed";
    setPhase("revealed");
    setAnnounce(captionFor(selectedOption.label, giftCount));
    if (tier >= 2) {
      setRingKey((k) => k + 1);
      setSparkKey((k) => k + 1);
    }
  };

  const handleCollect = () => {
    if (phaseRef.current !== "revealed") return;
    const total = totalForTier(tier);
    phaseRef.current = "collected";
    setPhase("collected");
    setReadoutValue(total);
    setAnnounce(`Collected ${total} total.`);
    onCollectRef.current?.(total);
  };

  const handleRewrap = () => {
    if (phaseRef.current === "wrapped") return;
    phaseRef.current = "wrapped";
    setPhase("wrapped");
    setReadoutValue(0);
    setAnnounce("Wrapped up. Ready for another.");
  };

  const handleAbsenceSelect = (option: Absence) => {
    if (option.id === selectedOption.id) return;
    phaseRef.current = "wrapped";
    setSelectedId(option.id);
    setPhase("wrapped");
    setReadoutValue(0);
    setAnnounce(`Switched to ${option.label} away.`);
  };

  return (
    <div
      className={cn(
        "relative w-full max-w-md overflow-hidden rounded-4 border border-hairline bg-surface-1 p-6",
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: PANEL_WASH }}
      />

      <div className="relative flex flex-col items-center gap-4">
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-base font-semibold text-ink">welcome back</span>
          <span className="font-mono text-xs text-ink-3">
            away {selectedOption.label}
          </span>
        </div>

        <div
          role="group"
          aria-label="How long were you away"
          className="inline-flex items-stretch gap-1 rounded-3 border border-hairline bg-surface-2 p-1"
        >
          {options.map((option) => {
            const active = option.id === selectedOption.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => handleAbsenceSelect(option)}
                className={cn(
                  "rounded-2 px-2.5 py-1.5 font-mono text-xs font-medium whitespace-nowrap transition-colors outline-none",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2",
                  active
                    ? "bg-surface-1 text-ink shadow-raised"
                    : "text-ink-3 hover:text-ink-2",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="relative" style={{ width: STAGE_W, height: STAGE_H }}>
          <span
            aria-hidden
            className="absolute rounded-full"
            style={{
              left: CENTER_X - GROUND_W / 2,
              top: GROUND_Y,
              width: GROUND_W,
              height: 8,
              background: GROUND,
            }}
          />

          <button
            type="button"
            aria-label="Open the parcel"
            onClick={handleOpen}
            disabled={phase !== "wrapped"}
            className={cn(
              "absolute inset-0 block cursor-pointer touch-manipulation rounded-4 outline-none select-none",
              "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
              "disabled:cursor-default",
              !motionSafe && phase === "wrapped" && "active:brightness-95",
            )}
          >
            <span aria-hidden className="absolute inset-0 overflow-visible">
              <span
                className="absolute rounded-2"
                style={{
                  left: bodyLeft,
                  top: BODY_TOP,
                  width: bodyW,
                  height: BODY_H,
                  background: PAPER,
                  border: `1px solid ${EDGE}`,
                  boxShadow: "var(--edge-highlight)",
                }}
              />
              <span
                className="absolute rounded-t-[4px]"
                style={{
                  left: bodyLeft + 8,
                  top: BODY_TOP - 4,
                  width: bodyW - 16,
                  height: 14,
                  background: INTERIOR,
                }}
              />

              <motion.span
                className="absolute"
                style={{
                  left: CENTER_X - BEAM_W / 2,
                  top: BODY_TOP - BEAM_H,
                  width: BEAM_W,
                  height: BEAM_H,
                  background: BEAM_FILL,
                  clipPath: BEAM_CLIP,
                  transformOrigin: "bottom center",
                }}
                initial={false}
                animate={{
                  opacity: lidOpen ? beamIntensity : 0,
                  scale: lidOpen ? 1 : 0.85,
                }}
                transition={
                  motionSafe
                    ? {
                        duration: LIFT_S,
                        ease: easings.enter,
                        delay: lidOpen ? UNTIE_S : 0,
                      }
                    : { duration: 0 }
                }
              />

              <motion.div
                className="absolute"
                style={{
                  left: lidLeft,
                  top: LID_TOP,
                  width: lidW,
                  height: LID_H,
                  transformOrigin: "bottom center",
                }}
                initial={false}
                animate={{
                  rotate: lidOpen ? LID_OPEN_ROTATE : 0,
                  y: lidOpen ? LID_OPEN_Y : 0,
                }}
                transition={
                  motionSafe
                    ? {
                        duration: LIFT_S,
                        ease: easings.enter,
                        delay: lidOpen ? UNTIE_S : 0,
                      }
                    : { duration: 0 }
                }
              >
                <span
                  className="absolute inset-0 rounded-t-[18px] rounded-b-[6px]"
                  style={{
                    background: PAPER_DEEP,
                    border: `1px solid ${EDGE}`,
                    boxShadow: "var(--edge-highlight)",
                  }}
                />
              </motion.div>

              <AnimatePresence>
                {phase === "wrapped" && (
                  <motion.span
                    key="ribbon-v"
                    className="absolute"
                    style={{
                      left: CENTER_X - ribbonW / 2,
                      top: BODY_TOP,
                      width: ribbonW,
                      height: BODY_H,
                      background: RIBBON,
                      border: `1px solid ${EDGE}`,
                    }}
                    initial={
                      motionSafe ? { x: -RIBBON_SLIDE, opacity: 0 } : false
                    }
                    animate={{ x: 0, opacity: 1 }}
                    transition={
                      motionSafe
                        ? { duration: durations.base, ease: easings.enter }
                        : { duration: 0 }
                    }
                    exit={
                      motionSafe
                        ? {
                            x: -RIBBON_SLIDE,
                            opacity: 0,
                            transition: {
                              duration: UNTIE_S,
                              ease: easings.exit,
                            },
                          }
                        : { opacity: 0, transition: { duration: 0 } }
                    }
                  />
                )}

                {phase === "wrapped" && (
                  <motion.span
                    key="ribbon-h"
                    className="absolute"
                    style={{
                      left: bodyLeft,
                      top: BODY_TOP + BODY_H / 2 - ribbonW / 2,
                      width: bodyW,
                      height: ribbonW,
                      background: RIBBON,
                      border: `1px solid ${EDGE}`,
                    }}
                    initial={
                      motionSafe ? { x: RIBBON_SLIDE, opacity: 0 } : false
                    }
                    animate={{ x: 0, opacity: 1 }}
                    transition={
                      motionSafe
                        ? {
                            duration: durations.base,
                            ease: easings.enter,
                            delay: RIBBON_STAGGER_S,
                          }
                        : { duration: 0 }
                    }
                    exit={
                      motionSafe
                        ? {
                            x: RIBBON_SLIDE,
                            opacity: 0,
                            transition: {
                              duration: UNTIE_S,
                              ease: easings.exit,
                              delay: RIBBON_STAGGER_S,
                            },
                          }
                        : { opacity: 0, transition: { duration: 0 } }
                    }
                  />
                )}

                {phase === "wrapped" && tier >= 2 && (
                  <motion.span
                    key="seal"
                    className="absolute rounded-full"
                    style={{
                      left: CENTER_X - SEAL_D / 2,
                      top: BODY_TOP - SEAL_D / 2 + 5,
                      width: SEAL_D,
                      height: SEAL_D,
                      background: SEAL_FILL,
                      border: `1px solid ${EDGE}`,
                      boxShadow: "var(--edge-highlight)",
                    }}
                    initial={motionSafe ? { scale: 0, opacity: 0 } : false}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={
                      motionSafe
                        ? { ...springs.flick, delay: 0.1 }
                        : { duration: 0 }
                    }
                    exit={
                      motionSafe
                        ? {
                            scale: 0.5,
                            opacity: 0,
                            transition: {
                              duration: durations.fast,
                              ease: easings.exit,
                            },
                          }
                        : { opacity: 0, transition: { duration: 0 } }
                    }
                  />
                )}

                {phase === "wrapped" && (
                  <motion.span
                    key="bow"
                    className="absolute"
                    style={{
                      left: CENTER_X - bowSize / 2,
                      top: BODY_TOP - bowSize * 0.75,
                      width: bowSize,
                      height: bowSize * 0.7,
                    }}
                    initial={motionSafe ? { scale: 0, opacity: 0 } : false}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                    exit={
                      motionSafe
                        ? {
                            scale: 0.6,
                            opacity: 0,
                            transition: {
                              duration: UNTIE_S,
                              ease: easings.exit,
                            },
                          }
                        : { opacity: 0, transition: { duration: 0 } }
                    }
                  >
                    <span
                      className="absolute rounded-full"
                      style={{
                        left: 0,
                        top: "20%",
                        width: "46%",
                        height: "60%",
                        background: BOW_FILL,
                        border: `1px solid ${EDGE}`,
                        transform: "rotate(-18deg)",
                      }}
                    />
                    <span
                      className="absolute rounded-full"
                      style={{
                        right: 0,
                        top: "20%",
                        width: "46%",
                        height: "60%",
                        background: BOW_FILL,
                        border: `1px solid ${EDGE}`,
                        transform: "rotate(18deg)",
                      }}
                    />
                    <span
                      className="absolute rounded-[3px]"
                      style={{
                        left: "38%",
                        top: "30%",
                        width: "24%",
                        height: "55%",
                        background: BOW_FILL,
                        border: `1px solid ${EDGE}`,
                      }}
                    />
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
          </button>

          <div aria-hidden className="pointer-events-none absolute inset-0">
            <AnimatePresence>
              {itemsVisible &&
                items.map((kind, index) => (
                  <GiftTile
                    key={`${tier}-${index}-${kind.name}`}
                    kind={kind}
                    index={index}
                    count={giftCount}
                    left={rowLeft + index * (TILE_W + TILE_GAP)}
                    top={TILE_ROW_TOP}
                    isBest={index === giftCount - 1}
                    motionSafe={motionSafe}
                    onArrive={
                      index === giftCount - 1 ? handleBestArrive : undefined
                    }
                  />
                ))}
            </AnimatePresence>

            {motionSafe && ringKey > 0 && (
              <motion.span
                key={`ring-${ringKey}`}
                className="absolute rounded-full"
                style={{
                  left: bestCenterX - RING_D / 2,
                  top: bestCenterY - RING_D / 2,
                  width: RING_D,
                  height: RING_D,
                  border: `2px solid ${BEST_TINT}`,
                }}
                initial={{ scale: 0.6, opacity: 0.85 }}
                animate={{ scale: 1.5, opacity: 0 }}
                transition={{ duration: durations.slow, ease: easings.exit }}
              />
            )}

            {motionSafe && sparkKey > 0 && (
              <span
                key={`sparks-${sparkKey}`}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: bestCenterX, top: bestCenterY }}
              >
                {BEST_SPARKS.map((s, i) => (
                  <motion.span
                    key={i}
                    className="absolute size-[3px] rounded-full"
                    style={{ background: BEST_TINT }}
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
          </div>
        </div>

        <div className="flex min-h-[20px] items-center">
          <AnimatePresence>
            {(phase === "revealed" || phase === "collected") && (
              <motion.span
                key="caption"
                className="font-mono text-xs text-ink-2"
                initial={motionSafe ? { opacity: 0, y: 4 } : { opacity: 1 }}
                animate={{ opacity: 1, y: 0 }}
                exit={
                  motionSafe
                    ? { opacity: 0, transition: exitFor(durations.base) }
                    : { opacity: 0, transition: { duration: 0 } }
                }
                transition={
                  motionSafe
                    ? { duration: durations.base, ease: easings.enter }
                    : { duration: 0 }
                }
              >
                {captionFor(selectedOption.label, giftCount)}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-3">
          {(phase === "revealed" || phase === "collected") && (
            <Readout value={readoutValue} size="md" />
          )}
          {phase === "revealed" && (
            <button
              type="button"
              onClick={handleCollect}
              className={cn(
                "rounded-2 bg-primary px-3 py-1.5 font-mono text-xs font-semibold tracking-wide text-primary-foreground uppercase shadow-raised transition-[filter] outline-none",
                "hover:brightness-110 active:brightness-95",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
              )}
            >
              collect
            </button>
          )}
        </div>

        <div className="flex h-5 items-center">
          {phase !== "wrapped" && (
            <button
              type="button"
              onClick={handleRewrap}
              className={cn(
                "rounded-1 px-1.5 py-1 font-mono text-[11px] text-ink-3 underline decoration-hairline-strong underline-offset-2 transition-colors outline-none",
                "hover:text-ink-2",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
              )}
            >
              wrap another
            </button>
          )}
        </div>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
