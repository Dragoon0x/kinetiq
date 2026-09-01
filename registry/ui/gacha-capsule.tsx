"use client";

import * as React from "react";

import {
  Award,
  Crown,
  Gem,
  Heart,
  Shield,
  Star,
  Trophy,
  Zap,
} from "lucide-react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { angleDelta } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Stage geometry, px — globe on top, crank rig front-right of the body. */
const STAGE_W = 224;
const STAGE_H = 356;

const GLOBE_CX = 100;
const GLOBE_CY = 56;
const GLOBE_R = 50;

const BODY_LEFT = 34;
const BODY_TOP = 112;
const BODY_W = 132;
const BODY_H = 80;
const BODY_RIGHT = BODY_LEFT + BODY_W;
const BODY_CX = BODY_LEFT + BODY_W / 2;

/** Crank rig, centered on the hub where it meets the body's right wall. */
const HUB_CX = BODY_RIGHT;
const HUB_CY = BODY_TOP + BODY_H / 2;
const ARM_LEN = 34;
const KNOB_D = 20;
const HUB_D = 14;
const SHAFT_W = 4;
const CRANK_BOX = 2 * (ARM_LEN + KNOB_D / 2 + 6);
const CRANK_LEFT = HUB_CX - CRANK_BOX / 2;
const CRANK_TOP = HUB_CY - CRANK_BOX / 2;
const CRANK_CENTER = CRANK_BOX / 2;

/** The dispensing port beneath the body, and the tray that catches it. */
const PORT_W = 36;
const PORT_TOP = BODY_TOP + BODY_H;
const PORT_LEFT = BODY_CX - PORT_W / 2;

const TRAY_TOP = PORT_TOP + 16;
const TRAY_W = 110;
const TRAY_H = 56;
const TRAY_LEFT = BODY_CX - TRAY_W / 2;

/** Where a landed capsule sits, wobbles, and cracks — px, in stage space. */
const REST_X = BODY_CX;
const REST_Y = TRAY_TOP + 20;

/** Capsule footprint, px. */
const CAPSULE_R = 15;

/**
 * The traveling capsule's keyframes — zigzagging off the chute walls as it
 * falls from the globe, through the body, out the port, to rest in the tray.
 */
const CHUTE_X = [GLOBE_CX, 80, 122, 84, 112, REST_X] as const;
const CHUTE_Y = [100, 132, 158, 182, 206, REST_Y] as const;
const CHUTE_TIMES = [0, 0.15, 0.35, 0.55, 0.75, 1] as const;
const DROP_S = 0.8;

/** Decaying wobble tween once landed — a tween, never a spring, since a
 * spring cannot hold the three-position rock this settle needs. */
const WOBBLE_KEYFRAMES = [0, -18, 14, -9, 4, -2, 0] as const;
const WOBBLE_TIMES = [0, 0.14, 0.3, 0.48, 0.66, 0.84, 1] as const;
const WOBBLE_S = 0.5;

/** Beat between the wobble settling and the crack starting, ms. */
const BEAT_MS = 260;

/** How far each shell half rises/falls and rotates apart on crack. */
const CRACK_RISE = 16;
const CRACK_ANGLE = 26;

/** How far below rest the prize starts before its `recoil` rise. */
const PRIZE_RISE = 14;

/** How long the "RAINBOW" caption holds before reverting to the tier name. */
const CAPTION_MS = 1400;

/** Full turn (deg) that dispenses; a keyboard press advances one quarter. */
const FULL_TURN = 360;
const QUARTER_TURN = 90;

/** Up to six kept prizes shown on the shelf, oldest fading first. */
const SHELF_MAX = 6;

/** Fixed capsule-shell color cycle for the globe cluster and the traveler —
 * cosmetic only, unrelated to the prize a capsule turns out to hold. */
const CAPSULE_COLORS = [
  "color-mix(in oklab, var(--primary) 75%, var(--card))",
  "color-mix(in oklab, var(--success, #047857) 75%, var(--card))",
  "color-mix(in oklab, var(--warning, #b45309) 75%, var(--card))",
  "color-mix(in oklab, var(--ink-2) 65%, var(--card))",
] as const;
const capsuleColorAt = (i: number): string =>
  CAPSULE_COLORS[i % CAPSULE_COLORS.length] ?? CAPSULE_COLORS[0];

/** The frosted lower half every capsule shares, regardless of shell color. */
const CAPSULE_CLEAR = "color-mix(in oklab, var(--card) 88%, var(--ink-2) 12%)";

/** Fixed cluster ledger — a center capsule plus a packed ring, offsets from
 * the globe center. Purely decorative: the globe never depletes. */
const CLUSTER = [
  { x: 0, y: 0, r: 12 },
  { x: 19, y: 0, r: 10 },
  { x: 9.5, y: 16.5, r: 10 },
  { x: -9.5, y: 16.5, r: 10 },
  { x: -19, y: 0, r: 10 },
  { x: -9.5, y: -16.5, r: 10 },
  { x: 9.5, y: -16.5, r: 10 },
] as const;

type Tier = "standard" | "silver" | "gold" | "rainbow";

/** Four tiers, ascending reaction intensity — each rank adds its effect on
 * top of the one below: silver adds a ring, gold adds sparks, rainbow adds
 * a rotating glow, a sweep, and its own caption flash. */
const TIER_DEFS: Record<Tier, { label: string; tint: string; rank: number }> = {
  standard: { label: "STANDARD", tint: "var(--ink-2)", rank: 0 },
  silver: { label: "SILVER", tint: "var(--primary)", rank: 1 },
  gold: { label: "GOLD", tint: "var(--warning, #b45309)", rank: 2 },
  rainbow: { label: "RAINBOW", tint: "var(--success, #047857)", rank: 3 },
};

type PrizeDef = {
  icon: typeof Star;
  name: string;
  tier: Tier;
};

/**
 * Fixed draw order, eight deep, cycled — never randomized. The rare tier
 * lands only once per cycle (index 7), so "rainbow" stays genuinely
 * infrequent rather than generous.
 */
const PRIZES = [
  { icon: Star, name: "Star Chip", tier: "standard" },
  { icon: Gem, name: "Gem Shard", tier: "silver" },
  { icon: Heart, name: "Heart Charm", tier: "standard" },
  { icon: Trophy, name: "Trophy Pin", tier: "gold" },
  { icon: Zap, name: "Volt Coin", tier: "standard" },
  { icon: Shield, name: "Aegis Token", tier: "silver" },
  { icon: Award, name: "Medal Stub", tier: "standard" },
  { icon: Crown, name: "Crown Jewel", tier: "rainbow" },
] as const satisfies readonly PrizeDef[];

const prizeAt = (index: number): PrizeDef =>
  PRIZES[index % PRIZES.length] ?? PRIZES[0];

const SHEEN =
  "linear-gradient(115deg, transparent 0%, oklch(1 0 0 / 0.05) 22%, oklch(1 0 0 / 0.55) 50%, oklch(1 0 0 / 0.05) 78%, transparent 100%)";

type Phase = "idle" | "dropping" | "wobbling" | "cracking" | "prize";
type ShelfItem = { key: number; icon: typeof Star; name: string; tier: Tier };
type CaptionMode = "normal" | "flash";

export type GachaCapsuleProps = {
  /** Fires once a prize is revealed, with its tier id. */
  onPrize?: (tier: string) => void;
  className?: string;
};

/**
 * A capsule machine you actually crank. Drag the crank in circles — angle
 * math off the hub's `getBoundingClientRect`, folded into an unwrapped
 * rotation ledger — or press it and Enter/Space turns a crisp quarter; a
 * full turn drops a capsule from the fixed globe cluster down an authored,
 * wall-bouncing chute, lands it in the tray to wobble on a decaying tween,
 * cracks it open with the halves flying apart on a beat, and pops the prize
 * up on a `recoil` spring. Prizes cycle through a fixed eight-draw table —
 * never random — where standard gets a plain settle, silver adds a ring,
 * gold adds sparks, and the rainbow tier (one draw in eight, deliberately
 * rare) adds a rotating glow, a sweep, and its own "RAINBOW" caption flash.
 * Keeping a prize banks it on the shelf, up to six, oldest fading first, and
 * re-arms the crank; a mono counter tracks turns taken.
 * Reduced motion: no drop, wobble, crack, or sparks — a full turn instantly
 * presents the already-open capsule with its prize, the shelf updates
 * instantly, and captions still flash.
 */
export function GachaCapsule({
  onPrize,
  className,
}: GachaCapsuleProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [phase, setPhase] = React.useState<Phase>("idle");
  const [crankedCount, setCrankedCount] = React.useState(0);
  const [currentPrize, setCurrentPrize] = React.useState<PrizeDef | null>(null);
  const [shelf, setShelf] = React.useState<ShelfItem[]>([]);
  const [captionMode, setCaptionMode] = React.useState<CaptionMode>("normal");
  const [ringKey, setRingKey] = React.useState(0);
  const [sparkKey, setSparkKey] = React.useState(0);
  const [sweepKey, setSweepKey] = React.useState(0);
  const [cycle, setCycle] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");

  /** The arm's rendered rotation, deg — unbounded, follows the pointer 1:1. */
  const armAngle = useMotionValue<number>(0);
  const capsuleX = useMotionValue<number>(GLOBE_CX);
  const capsuleY = useMotionValue<number>(100);
  const wobbleRotate = useMotionValue<number>(0);
  const halfTopY = useMotionValue<number>(0);
  const halfTopRotate = useMotionValue<number>(0);
  const halfBottomY = useMotionValue<number>(0);
  const halfBottomRotate = useMotionValue<number>(0);
  const prizeY = useMotionValue<number>(0);
  const prizeOpacity = useMotionValue<number>(0);
  const prizeScale = useMotionValue<number>(0.7);

  const phaseRef = React.useRef<Phase>("idle");
  const crankedRef = React.useRef(0);
  const currentPrizeRef = React.useRef<PrizeDef | null>(null);
  /** Total accumulated crank rotation, deg (signed, unbounded). */
  const accumulatedRef = React.useRef(0);
  const motionSafeRef = React.useRef(motionSafe);
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  }, [motionSafe]);
  const onPrizeRef = React.useRef(onPrize);
  React.useEffect(() => {
    onPrizeRef.current = onPrize;
  }, [onPrize]);

  const dragRef = React.useRef<{ pointerId: number; lastAngle: number } | null>(
    null,
  );
  const hubRef = React.useRef<HTMLSpanElement>(null);

  /** In-flight animations — stopped by a new gesture and on unmount. */
  const flightsRef = React.useRef<Set<ReturnType<typeof animate>>>(new Set());
  const track = (control: ReturnType<typeof animate>) => {
    const flights = flightsRef.current;
    flights.add(control);
    const drop = () => flights.delete(control);
    control.then(drop, drop);
    return control;
  };
  const seize = () => {
    const flights = flightsRef.current;
    flights.forEach((flight) => flight.stop());
    flights.clear();
  };

  const beatTimer = React.useRef<number | null>(null);
  const captionTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    const flights = flightsRef.current;
    return () => {
      flights.forEach((flight) => flight.stop());
      flights.clear();
      if (beatTimer.current !== null) window.clearTimeout(beatTimer.current);
      if (captionTimer.current !== null)
        window.clearTimeout(captionTimer.current);
    };
  }, []);

  const flashRainbowCaption = () => {
    setCaptionMode("flash");
    if (captionTimer.current !== null)
      window.clearTimeout(captionTimer.current);
    captionTimer.current = window.setTimeout(() => {
      captionTimer.current = null;
      setCaptionMode("normal");
    }, CAPTION_MS);
  };

  /** Crack has finished: the prize is revealed, tier reactions fire. */
  const handleCrackComplete = () => {
    const prize = currentPrizeRef.current;
    if (!prize) return;
    phaseRef.current = "prize";
    setPhase("prize");

    if (motionSafeRef.current) {
      prizeY.set(PRIZE_RISE);
      prizeOpacity.set(0);
      prizeScale.set(0.7);
      track(animate(prizeY, 0, springs.recoil));
      track(animate(prizeScale, 1, springs.recoil));
      track(
        animate(prizeOpacity, 1, {
          duration: durations.fast,
          ease: easings.enter,
        }),
      );
    } else {
      prizeY.jump(0);
      prizeOpacity.jump(1);
      prizeScale.jump(1);
    }

    const rank = TIER_DEFS[prize.tier].rank;
    if (rank >= 1) setRingKey((k) => k + 1);
    if (rank >= 2) setSparkKey((k) => k + 1);
    if (rank >= 3) {
      setSweepKey((k) => k + 1);
      flashRainbowCaption();
    }

    setAnnounce(`${prize.name} revealed. ${TIER_DEFS[prize.tier].label} tier.`);
    onPrizeRef.current?.(prize.tier);
  };

  /** Wobble settled: a beat, then the shell cracks open. */
  const startCrack = () => {
    phaseRef.current = "cracking";
    setPhase("cracking");
    halfTopY.set(0);
    halfTopRotate.set(0);
    halfBottomY.set(0);
    halfBottomRotate.set(0);
    track(
      animate(halfTopY, -CRACK_RISE, {
        duration: durations.slow,
        ease: easings.exit,
      }),
    );
    track(
      animate(halfTopRotate, -CRACK_ANGLE, {
        duration: durations.slow,
        ease: easings.exit,
        onComplete: handleCrackComplete,
      }),
    );
    track(
      animate(halfBottomY, CRACK_RISE, {
        duration: durations.slow,
        ease: easings.exit,
      }),
    );
    track(
      animate(halfBottomRotate, CRACK_ANGLE, {
        duration: durations.slow,
        ease: easings.exit,
      }),
    );
  };

  const handleWobbleComplete = () => {
    beatTimer.current = window.setTimeout(() => {
      beatTimer.current = null;
      startCrack();
    }, BEAT_MS);
  };

  const handleDropComplete = () => {
    phaseRef.current = "wobbling";
    setPhase("wobbling");
    wobbleRotate.set(0);
    track(
      animate(wobbleRotate, [...WOBBLE_KEYFRAMES], {
        duration: WOBBLE_S,
        ease: easings.move,
        times: [...WOBBLE_TIMES],
        onComplete: handleWobbleComplete,
      }),
    );
  };

  /** A full turn landed: reset every stage's motion values, then either play
   * the whole ceremony or, under reduced motion, present the result at once. */
  const startDispense = () => {
    const prize = prizeAt(crankedRef.current);
    crankedRef.current += 1;
    setCrankedCount(crankedRef.current);
    setCycle((c) => c + 1);
    currentPrizeRef.current = prize;
    setCurrentPrize(prize);
    setCaptionMode("normal");

    capsuleX.set(GLOBE_CX);
    capsuleY.set(100);
    wobbleRotate.set(0);
    halfTopY.set(0);
    halfTopRotate.set(0);
    halfBottomY.set(0);
    halfBottomRotate.set(0);
    prizeY.set(PRIZE_RISE);
    prizeOpacity.set(0);
    prizeScale.set(0.7);

    if (!motionSafeRef.current) {
      capsuleX.jump(REST_X);
      capsuleY.jump(REST_Y);
      halfTopY.jump(-CRACK_RISE);
      halfTopRotate.jump(-CRACK_ANGLE);
      halfBottomY.jump(CRACK_RISE);
      halfBottomRotate.jump(CRACK_ANGLE);
      handleCrackComplete();
      return;
    }

    phaseRef.current = "dropping";
    setPhase("dropping");
    setAnnounce("Cranking. Capsule dropping.");
    track(
      animate(capsuleX, [...CHUTE_X], {
        duration: DROP_S,
        ease: easings.move,
        times: [...CHUTE_TIMES],
      }),
    );
    track(
      animate(capsuleY, [...CHUTE_Y], {
        duration: DROP_S,
        ease: easings.move,
        times: [...CHUTE_TIMES],
        onComplete: handleDropComplete,
      }),
    );
  };

  /** Folds one signed angle delta into the ledger; crossing a full-turn
   * boundary (forward only) fires the dispense, once, while armed. */
  const advanceRotation = (deltaDeg: number): number => {
    const prev = accumulatedRef.current;
    const next = prev + deltaDeg;
    accumulatedRef.current = next;
    if (deltaDeg > 0 && phaseRef.current === "idle") {
      const fromBucket = Math.floor(prev / FULL_TURN);
      const toBucket = Math.floor(next / FULL_TURN);
      if (toBucket > fromBucket) startDispense();
    }
    return next;
  };

  const hubCenter = (): { x: number; y: number } | null => {
    const el = hubRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  const bearingTo = (
    clientX: number,
    clientY: number,
    center: { x: number; y: number },
  ): number =>
    Math.atan2(clientY - center.y, clientX - center.x) * (180 / Math.PI);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (dragRef.current || phaseRef.current !== "idle") return;
    const center = hubCenter();
    if (!center) return;
    seize();
    const angle = bearingTo(event.clientX, event.clientY, center);
    dragRef.current = { pointerId: event.pointerId, lastAngle: angle };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (phaseRef.current !== "idle") return;
    const center = hubCenter();
    if (!center) return;
    const angle = bearingTo(event.clientX, event.clientY, center);
    const delta = angleDelta(drag.lastAngle, angle);
    drag.lastAngle = angle;
    const next = advanceRotation(delta);
    armAngle.set(next);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (event.repeat || dragRef.current || phaseRef.current !== "idle") return;
    const next = advanceRotation(QUARTER_TURN);
    if (motionSafeRef.current) {
      track(animate(armAngle, next, springs.snap));
    } else {
      armAngle.jump(next);
    }
  };

  const handleKeep = () => {
    if (phaseRef.current !== "prize") return;
    const prize = currentPrizeRef.current;
    if (!prize) return;
    seize();
    setShelf((prev) => {
      const key = (prev[prev.length - 1]?.key ?? 0) + 1;
      const next = [
        ...prev,
        { key, icon: prize.icon, name: prize.name, tier: prize.tier },
      ];
      return next.length > SHELF_MAX
        ? next.slice(next.length - SHELF_MAX)
        : next;
    });
    setAnnounce(`${prize.name} kept.`);
    phaseRef.current = "idle";
    setPhase("idle");
    setCurrentPrize(null);
  };

  const tint = currentPrize
    ? TIER_DEFS[currentPrize.tier].tint
    : TIER_DEFS.standard.tint;
  const shellColor = capsuleColorAt(Math.max(0, crankedCount - 1));
  const busy = phase !== "idle";
  const captionText =
    captionMode === "flash"
      ? "RAINBOW"
      : currentPrize
        ? TIER_DEFS[currentPrize.tier].label
        : "";

  return (
    <div className={cn("inline-flex flex-col items-center gap-3", className)}>
      <div className="flex items-start gap-4">
        <div className="relative" style={{ width: STAGE_W, height: STAGE_H }}>
          {/* Globe — translucent glass over the fixed cluster. */}
          <div
            aria-hidden
            className="absolute overflow-hidden rounded-full border border-hairline-strong bg-surface-2/70 shadow-raised"
            style={{
              left: GLOBE_CX - GLOBE_R,
              top: GLOBE_CY - GLOBE_R,
              width: GLOBE_R * 2,
              height: GLOBE_R * 2,
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(circle at 32% 24%, var(--primary-foreground) 0%, transparent 55%)",
                opacity: 0.25,
              }}
            />
            {CLUSTER.map((c, i) => {
              const top = capsuleColorAt(i);
              return (
                <span
                  key={i}
                  className="absolute block rounded-full border border-hairline-strong"
                  style={{
                    left: GLOBE_R + c.x - c.r,
                    top: GLOBE_R + c.y - c.r,
                    width: c.r * 2,
                    height: c.r * 2,
                    background: `linear-gradient(to bottom, ${top} 0%, ${top} 46%, var(--hairline-strong) 46%, var(--hairline-strong) 54%, ${CAPSULE_CLEAR} 54%, ${CAPSULE_CLEAR} 100%)`,
                  }}
                />
              );
            })}
          </div>

          {/* Body — cabinet housing the crank mechanism. */}
          <div
            aria-hidden
            className="absolute rounded-3 border border-hairline-strong shadow-raised"
            style={{
              left: BODY_LEFT,
              top: BODY_TOP,
              width: BODY_W,
              height: BODY_H,
              background:
                "color-mix(in oklab, var(--ink-3) 12%, var(--color-surface-2))",
            }}
          >
            <span
              aria-hidden
              className="absolute inset-x-2 top-1.5 block h-px"
              style={{ background: "var(--hairline-strong)" }}
            />
            <span
              aria-hidden
              className="absolute inset-3 top-[38%] block rounded-2 border border-hairline/50"
            />
          </div>

          {/* Port — the dispensing outlet. */}
          <span
            aria-hidden
            className="absolute rounded-b-2"
            style={{
              left: PORT_LEFT,
              top: PORT_TOP - 2,
              width: PORT_W,
              height: 10,
              background:
                "color-mix(in oklab, var(--ink-3) 32%, var(--color-surface-2))",
            }}
          />

          {/* Tray — where the capsule lands, wobbles, and cracks open. */}
          <div
            aria-hidden
            className="absolute rounded-3 border border-hairline bg-surface-1 shadow-raised"
            style={{
              left: TRAY_LEFT,
              top: TRAY_TOP,
              width: TRAY_W,
              height: TRAY_H,
            }}
          />

          {/* Crank — hub, rotating arm, knob. A real button. */}
          <button
            type="button"
            aria-label="Crank the machine"
            aria-disabled={busy}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            onKeyDown={handleKeyDown}
            className={cn(
              "absolute z-30 cursor-grab touch-none rounded-full outline-none select-none",
              "focus-visible:ring-2 focus-visible:ring-ring/60 active:cursor-grabbing",
              busy && "cursor-not-allowed opacity-70",
            )}
            style={{
              left: CRANK_LEFT,
              top: CRANK_TOP,
              width: CRANK_BOX,
              height: CRANK_BOX,
            }}
          >
            <span
              ref={hubRef}
              aria-hidden
              className="absolute rounded-full border border-hairline-strong bg-surface-2 shadow-raised"
              style={{
                left: CRANK_CENTER - HUB_D / 2,
                top: CRANK_CENTER - HUB_D / 2,
                width: HUB_D,
                height: HUB_D,
              }}
            />
            <motion.span
              aria-hidden
              className="absolute inset-0 block"
              style={{ rotate: armAngle }}
            >
              <span
                className="absolute rounded-full"
                style={{
                  left: CRANK_CENTER,
                  top: CRANK_CENTER - SHAFT_W / 2,
                  width: ARM_LEN,
                  height: SHAFT_W,
                  background: "var(--ink-3)",
                }}
              />
              <span
                className="absolute rounded-full border border-hairline-strong bg-surface-1 shadow-raised"
                style={{
                  left: CRANK_CENTER + ARM_LEN - KNOB_D / 2,
                  top: CRANK_CENTER - KNOB_D / 2,
                  width: KNOB_D,
                  height: KNOB_D,
                }}
              >
                <span
                  className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ background: "var(--primary)" }}
                />
              </span>
            </motion.span>
          </button>

          {/* The traveling / landed / cracking capsule, and its prize. */}
          <AnimatePresence>
            {phase !== "idle" && (
              <motion.div
                key={cycle}
                aria-hidden
                className="pointer-events-none absolute top-0 left-0 z-20"
                style={{
                  x: capsuleX,
                  y: capsuleY,
                  marginLeft: -CAPSULE_R,
                  marginTop: -CAPSULE_R,
                }}
                exit={
                  motionSafe
                    ? {
                        opacity: 0,
                        transition: {
                          duration: durations.fast,
                          ease: easings.exit,
                        },
                      }
                    : { opacity: 0, transition: { duration: 0 } }
                }
              >
                <motion.div
                  className="relative"
                  style={{
                    width: CAPSULE_R * 2,
                    height: CAPSULE_R * 2,
                    rotate: wobbleRotate,
                  }}
                >
                  {/* Seam line — only reads as a whole capsule before it cracks. */}
                  {(phase === "dropping" || phase === "wobbling") && (
                    <span
                      className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
                      style={{ background: "var(--hairline-strong)" }}
                    />
                  )}

                  {/* Seam light — a beat of glow as the shell splits. */}
                  {motionSafe && phase === "cracking" && (
                    <motion.span
                      className="pointer-events-none absolute inset-x-0 top-1/2"
                      style={{ height: 4, marginTop: -2 }}
                      initial={{ opacity: 0, scaleX: 0.4 }}
                      animate={{ opacity: [0, 1, 0], scaleX: [0.4, 1.4, 1.6] }}
                      transition={{
                        duration: durations.slow,
                        ease: easings.exit,
                        times: [0, 0.35, 1],
                      }}
                    >
                      <span
                        className="block h-full w-full rounded-full"
                        style={{
                          background: `radial-gradient(ellipse, var(--card) 0%, ${tint} 55%, transparent 100%)`,
                        }}
                      />
                    </motion.span>
                  )}

                  {/* Prize — glyph on a small plinth, rising through the seam. */}
                  {currentPrize &&
                    (phase === "cracking" || phase === "prize") && (
                      <motion.div
                        className="absolute bottom-1/2 left-1/2"
                        style={{
                          y: prizeY,
                          opacity: prizeOpacity,
                          scale: prizeScale,
                          marginLeft: -20,
                        }}
                      >
                        <PrizeBadge
                          prize={currentPrize}
                          motionSafe={motionSafe}
                          sweepKey={sweepKey}
                        />
                      </motion.div>
                    )}

                  {motionSafe && ringKey > 0 && phase === "prize" && (
                    <motion.span
                      key={ringKey}
                      aria-hidden
                      className="pointer-events-none absolute top-1/2 left-1/2 rounded-full border-2"
                      style={{
                        width: 44,
                        height: 44,
                        marginLeft: -22,
                        marginTop: -22,
                        borderColor: tint,
                      }}
                      initial={{ scale: 0.6, opacity: 0.9 }}
                      animate={{ scale: 1.9, opacity: 0 }}
                      transition={{
                        duration: durations.slow,
                        ease: easings.exit,
                      }}
                    />
                  )}

                  {motionSafe && sparkKey > 0 && phase === "prize" && (
                    <span
                      key={sparkKey}
                      aria-hidden
                      className="pointer-events-none absolute top-1/2 left-1/2"
                      style={{ marginLeft: -1.5, marginTop: -1.5 }}
                    >
                      {SPARKS.map((s, i) => (
                        <motion.span
                          key={i}
                          className="absolute size-[3px] rounded-full"
                          style={{ background: TIER_DEFS.gold.tint }}
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

                  {motionSafe &&
                    phase === "prize" &&
                    currentPrize?.tier === "rainbow" && (
                      <motion.span
                        key={`glow-${cycle}`}
                        aria-hidden
                        className="pointer-events-none absolute top-1/2 left-1/2 rounded-full"
                        style={{
                          width: 52,
                          height: 52,
                          marginLeft: -26,
                          marginTop: -26,
                          background: `conic-gradient(from 0deg, ${TIER_DEFS.silver.tint}, ${TIER_DEFS.gold.tint}, ${TIER_DEFS.rainbow.tint}, ${TIER_DEFS.silver.tint})`,
                          opacity: 0.35,
                          filter: "blur(6px)",
                        }}
                        animate={{ rotate: 360 }}
                        transition={{
                          duration: 2.6,
                          ease: easings.linear,
                          repeat: Infinity,
                        }}
                      />
                    )}

                  {/* Shell halves — closed while dropping/wobbling, then fly apart. */}
                  <CapsuleHalves
                    color={shellColor}
                    halfTopY={halfTopY}
                    halfTopRotate={halfTopRotate}
                    halfBottomY={halfBottomY}
                    halfBottomRotate={halfBottomRotate}
                    radius={CAPSULE_R}
                  />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Name, tier caption, and the keep button. */}
          <div
            className="absolute flex flex-col items-center gap-1 text-center"
            style={{
              left: BODY_CX - 70,
              top: TRAY_TOP + TRAY_H + 10,
              width: 140,
            }}
          >
            <span className="flex h-4 items-center font-mono text-xs text-ink uppercase">
              {phase === "prize" && currentPrize ? currentPrize.name : ""}
            </span>
            <span aria-hidden className="flex h-4 items-center">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={captionText || "blank"}
                  className="font-mono text-[10px] tracking-[0.12em] text-ink-3"
                  initial={motionSafe ? { opacity: 0, y: 3 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  exit={
                    motionSafe
                      ? {
                          opacity: 0,
                          transition: {
                            duration: durations.fast,
                            ease: easings.exit,
                          },
                        }
                      : { opacity: 0, transition: { duration: 0 } }
                  }
                  transition={
                    motionSafe
                      ? { duration: durations.base, ease: easings.enter }
                      : { duration: 0 }
                  }
                >
                  {captionText}
                </motion.span>
              </AnimatePresence>
            </span>
            <span className="mt-1 flex h-7 items-center">
              {phase === "prize" && currentPrize && (
                <button
                  type="button"
                  aria-label={`Keep ${currentPrize.name}`}
                  onClick={handleKeep}
                  className={cn(
                    "rounded-2 bg-primary px-3 py-1 font-mono text-xs font-semibold text-primary-foreground uppercase shadow-raised transition-[filter] outline-none",
                    "hover:brightness-110 active:brightness-95",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
                  )}
                >
                  Keep
                </button>
              )}
            </span>
          </div>
        </div>

        {/* Collection shelf — up to six kept prizes, oldest fading first. */}
        <div className="flex w-16 flex-col items-center gap-2 pt-1">
          <span className="font-mono text-[10px] tracking-[0.12em] text-ink-3 uppercase">
            shelf
          </span>
          <div className="flex flex-col items-center gap-1.5">
            <AnimatePresence initial={false}>
              {shelf.map((item) => (
                <motion.span
                  key={item.key}
                  layout
                  className="flex items-center justify-center rounded-full border border-hairline-strong shadow-raised"
                  style={{
                    width: 26,
                    height: 26,
                    background: `color-mix(in oklab, ${TIER_DEFS[item.tier].tint} 30%, var(--card))`,
                  }}
                  initial={
                    motionSafe ? { opacity: 0, y: -8, scale: 0.6 } : false
                  }
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={
                    motionSafe
                      ? {
                          opacity: 0,
                          transition: {
                            duration: durations.fast,
                            ease: easings.exit,
                          },
                        }
                      : { opacity: 0, transition: { duration: 0 } }
                  }
                  transition={
                    motionSafe
                      ? {
                          y: springs.recoil,
                          scale: springs.recoil,
                          opacity: {
                            duration: durations.fast,
                            ease: easings.enter,
                          },
                          layout: springs.glide,
                        }
                      : { duration: 0 }
                  }
                >
                  <item.icon
                    className="size-3.5"
                    strokeWidth={1.75}
                    style={{ color: TIER_DEFS[item.tier].tint }}
                  />
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <span aria-hidden className="font-mono text-xs text-ink-3 tabular-nums">
        {crankedCount} cranked
      </span>

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}

const TAU = Math.PI * 2;
const SPARK_COUNT = 6;
const SPARK_SPREAD = 20;
/** Fixed spark vectors, evenly spaced from the top. No Math.random. */
const SPARKS = Array.from({ length: SPARK_COUNT }, (_, i) => {
  const angle = (i / SPARK_COUNT) * TAU - TAU / 4;
  return {
    dx: Math.cos(angle) * SPARK_SPREAD,
    dy: Math.sin(angle) * SPARK_SPREAD,
  };
});

/** Two half-circle shells, each independently offset/rotated by motion
 * values — coincident (closed) at rest, flown apart once cracked. */
function CapsuleHalves({
  color,
  halfTopY,
  halfTopRotate,
  halfBottomY,
  halfBottomRotate,
  radius,
}: {
  color: string;
  halfTopY: MotionValue<number>;
  halfTopRotate: MotionValue<number>;
  halfBottomY: MotionValue<number>;
  halfBottomRotate: MotionValue<number>;
  radius: number;
}) {
  const d = radius * 2;
  return (
    <>
      <motion.div
        className="absolute top-0 left-0 overflow-hidden"
        style={{
          width: d,
          height: radius,
          y: halfTopY,
          rotate: halfTopRotate,
          transformOrigin: "50% 100%",
        }}
      >
        <span
          className="absolute rounded-full border border-hairline-strong"
          style={{ left: 0, top: 0, width: d, height: d, background: color }}
        />
      </motion.div>
      <motion.div
        className="absolute left-0 overflow-hidden"
        style={{
          top: radius,
          width: d,
          height: radius,
          y: halfBottomY,
          rotate: halfBottomRotate,
          transformOrigin: "50% 0%",
        }}
      >
        <span
          className="absolute rounded-full border border-hairline-strong"
          style={{
            left: 0,
            top: -radius,
            width: d,
            height: d,
            background: CAPSULE_CLEAR,
          }}
        />
      </motion.div>
    </>
  );
}

/** The glyph and its plinth — one persistent look, tinted by tier. Reduced
 * motion and full motion share this markup; only the rise animation differs. */
function PrizeBadge({
  prize,
  motionSafe,
  sweepKey,
}: {
  prize: PrizeDef;
  motionSafe: boolean;
  sweepKey: number;
}) {
  const tint = TIER_DEFS[prize.tier].tint;
  const Icon = prize.icon;
  return (
    <div className="relative flex flex-col items-center">
      <span
        className="relative flex size-8 items-center justify-center rounded-full border border-hairline-strong shadow-raised"
        style={{
          background: `color-mix(in oklab, ${tint} 35%, var(--card))`,
        }}
      >
        <Icon className="size-4" strokeWidth={1.75} style={{ color: tint }} />
        {motionSafe && sweepKey > 0 && prize.tier === "rainbow" && (
          <span
            key={sweepKey}
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
          >
            <motion.span
              aria-hidden
              className="absolute top-[-30%] h-[160%] w-3"
              style={{ transform: "skewX(-20deg)", background: SHEEN }}
              initial={{ left: -20 }}
              animate={{ left: 40 }}
              transition={{ duration: 0.6, ease: easings.move }}
            />
          </span>
        )}
      </span>
      <span
        aria-hidden
        className="mt-1 h-2 w-6 rounded-full"
        style={{ background: `color-mix(in oklab, ${tint} 55%, var(--ink-3))` }}
      />
    </div>
  );
}
