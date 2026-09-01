"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";
import { ChevronUp, Undo2 } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { liftShadowCss, perspectives } from "@/registry/lib/spatial";
import { Readout } from "@/registry/ui/readout";
import { cn } from "@/registry/lib/utils";

const TAU = Math.PI * 2;

/** Card face text sits on materials kept mid-to-dark across every tier, so
 * one light ink works everywhere — no per-tier text-color branching. */
const FACE_INK = "oklch(0.98 0 0)";
const FACE_INK_DIM = "oklch(0.98 0 0 / 0.74)";
const FACE_INK_FAINT = "oklch(0.98 0 0 / 0.4)";

/** Five fixed rungs. Each carries its own tint, a visibly distinct material
 * gradient, a perk that changes with standing, and a limit that grows. */
const TIERS = [
  {
    name: "BRONZE",
    tint: "var(--warning, #b45309)",
    material:
      "linear-gradient(150deg, color-mix(in oklab, var(--warning, #b45309) 70%, black) 0%, color-mix(in oklab, var(--warning, #b45309) 92%, black) 45%, color-mix(in oklab, var(--warning, #b45309) 55%, black) 100%)",
    perk: "Standard limits. Standard line.",
    limit: 2500,
  },
  {
    name: "SILVER",
    tint: "var(--ink-2)",
    material:
      "linear-gradient(150deg, color-mix(in oklab, var(--ink-2) 78%, white) 0%, color-mix(in oklab, var(--ink-2) 88%, black) 45%, color-mix(in oklab, var(--ink-2) 55%, black) 100%)",
    perk: "Priority queue on every line.",
    limit: 10000,
  },
  {
    name: "GOLD",
    tint: "color-mix(in oklab, var(--warning, #b45309) 70%, white)",
    material:
      "linear-gradient(150deg, color-mix(in oklab, var(--warning, #b45309) 68%, white) 0%, color-mix(in oklab, var(--warning, #b45309) 92%, white) 45%, color-mix(in oklab, var(--warning, #b45309) 60%, black) 100%)",
    perk: "Concierge line. Fees waived.",
    limit: 50000,
  },
  {
    name: "PLATINUM",
    tint: "color-mix(in oklab, var(--ink-2) 65%, var(--primary))",
    material:
      "linear-gradient(150deg, color-mix(in oklab, color-mix(in oklab, var(--ink-2) 65%, var(--primary)) 65%, white) 0%, color-mix(in oklab, var(--ink-2) 60%, var(--primary)) 45%, color-mix(in oklab, color-mix(in oklab, var(--ink-2) 60%, var(--primary)) 55%, black) 100%)",
    perk: "Global lounge access.",
    limit: 250000,
  },
  {
    name: "OBSIDIAN",
    tint: "color-mix(in oklab, var(--ink-2) 55%, var(--primary))",
    material:
      "linear-gradient(150deg, color-mix(in oklab, var(--ink-2) 25%, black) 0%, color-mix(in oklab, var(--primary) 30%, black) 42%, color-mix(in oklab, var(--ink-2) 15%, black) 100%)",
    perk: "Uncapped. Invitation only.",
    limit: 1000000,
  },
] as const;

type Tier = (typeof TIERS)[number];

const MAX_TIER = TIERS.length - 1;

/** Literal-index tuple read, always defined — guards every variable-indexed
 * lookup below without a raw fallback object at each call site. */
const tierAt = (index: number): Tier => TIERS[index] ?? TIERS[0];

const clampTier = (value: number): number =>
  Number.isFinite(value)
    ? Math.min(MAX_TIER, Math.max(0, Math.round(value)))
    : 0;

/** Card geometry, px. */
const CARD_W = 288;
const CARD_H = 180;
/** Peak scale at the height of the lift. */
const LIFT_SCALE = 1.05;
/** Quick rise before the flip; the fall back to rest is the recoil settle. */
const LIFT_MS = 160;
/** Pause between the flip settling and the pip/figure/sweep/spark landing. */
const POST_LAND_BEAT_MS = 150;
const SWEEP_S = 0.55;
const SWEEP_W = 26;
const SWEEP_HIDDEN_LEFT = -(SWEEP_W + 16);
const SWEEP_VISIBLE_LEFT = CARD_W + 16;

const SHEEN =
  "linear-gradient(115deg, transparent 0%, oklch(1 0 0 / 0.05) 22%, oklch(1 0 0 / 0.55) 50%, oklch(1 0 0 / 0.05) 78%, transparent 100%)";

/** Six fixed spark vectors, evenly spaced. No Math.random. */
const SPARK_COUNT = 6;
const SPARK_SPREAD = 34;
const SPARKS = Array.from({ length: SPARK_COUNT }, (_, i) => {
  const angle = (i / SPARK_COUNT) * TAU - TAU / 4;
  return {
    dx: Math.cos(angle) * SPARK_SPREAD,
    dy: Math.sin(angle) * SPARK_SPREAD,
  };
});

type Phase = "idle" | "flipping";

const limitFormat = (v: number): string => `$${v.toLocaleString("en-US")}`;

export type TierUpgradeProps = {
  /** Cardholder name printed on the face. @default "J. Halvorsen" */
  holder?: string;
  /** Starting rung, 0 (bronze) through 4 (obsidian). @default 0 */
  startTier?: number;
  /** Fires as each upgrade begins, with the tier name being flipped to. */
  onUpgrade?: (tier: string) => void;
  className?: string;
};

/**
 * A membership card that climbs a five-tier ladder — bronze, silver, gold,
 * platinum, obsidian — by flipping into its next self. One card, one real 3D
 * flip: perspective lives on the wrapper, rotateY on the card, and
 * backface-visibility hides each face from the other, so the material,
 * name, and perk of the tier coming around are already painted on before
 * that face ever turns toward the viewer — nothing is revealed early. Pressing
 * "Upgrade tier" lifts the card, spins it on Y on a recoil spring that
 * overshoots and settles back, then a light sweep crosses the new face while
 * the limit figure rolls up and the tier pip advances, with six sparks
 * reserved for the instant the top, obsidian rung is reached, so the last
 * rung feels like something the others do not. "Step back" reverses the
 * same flip the other way — a real turn, not a repeat — with none of the
 * ceremony.
 * Reduced motion: no lift, flip, sweep, or sparks — the card swaps straight
 * to the new tier in place, the limit figure sets without rolling, and
 * captions still update.
 */
export function TierUpgrade({
  holder = "J. Halvorsen",
  startTier = 0,
  onUpgrade,
  className,
}: TierUpgradeProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const seedTier = clampTier(startTier);

  const [faceATier, setFaceATier] = React.useState(seedTier);
  const [faceBTier, setFaceBTier] = React.useState(seedTier);
  const [restTier, setRestTier] = React.useState(seedTier);
  const [frontIsA, setFrontIsA] = React.useState(true);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [sweepKey, setSweepKey] = React.useState(0);
  const [sparkKey, setSparkKey] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");

  const restTierRef = React.useRef(seedTier);
  const angleRef = React.useRef(0);
  const phaseRef = React.useRef<Phase>("idle");

  const motionSafeRef = React.useRef(motionSafe);
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  }, [motionSafe]);
  const onUpgradeRef = React.useRef(onUpgrade);
  React.useEffect(() => {
    onUpgradeRef.current = onUpgrade;
  }, [onUpgrade]);

  const rotY = useMotionValue<number>(0);
  const altitude = useMotionValue<number>(0);
  const cardScale = useTransform(altitude, [0, 1], [1, LIFT_SCALE]);
  const cardShadow = useTransform(altitude, (a) =>
    liftShadowCss(0.15 + a * 0.85),
  );

  const rotAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const altitudeAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const beatTimer = React.useRef<number | null>(null);
  const settleTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (beatTimer.current !== null) window.clearTimeout(beatTimer.current);
      if (settleTimer.current !== null)
        window.clearTimeout(settleTimer.current);
      rotAnim.current?.stop();
      altitudeAnim.current?.stop();
    };
  }, []);

  /** Runs one real flip. `ceremony` gates the upgrade-only lift, sweep, and
   * sparks; a downgrade always turns the other way with none of it. */
  const runFlip = (
    direction: 1 | -1,
    targetTier: number,
    ceremony: boolean,
  ) => {
    if (beatTimer.current !== null) {
      window.clearTimeout(beatTimer.current);
      beatTimer.current = null;
    }
    if (settleTimer.current !== null) {
      window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
    rotAnim.current?.stop();
    altitudeAnim.current?.stop();

    // The face not currently facing the viewer is the one about to turn
    // into view — bake its content now, while backface-hidden keeps it
    // invisible, so the reveal is never early.
    const wasFrontA = ((Math.round(angleRef.current / 180) % 2) + 2) % 2 === 0;
    if (wasFrontA) {
      setFaceBTier(targetTier);
    } else {
      setFaceATier(targetTier);
    }

    phaseRef.current = "flipping";
    setPhase("flipping");

    const newAngle = angleRef.current + 180 * direction;
    angleRef.current = newAngle;

    if (ceremony) {
      altitudeAnim.current = animate(altitude, 1, {
        duration: LIFT_MS / 1000,
        ease: easings.enter,
      });
      rotAnim.current = animate(rotY, newAngle, {
        ...springs.recoil,
        onComplete: () => {
          setFrontIsA(!wasFrontA);
          altitudeAnim.current = animate(altitude, 0, springs.recoil);
          beatTimer.current = window.setTimeout(() => {
            beatTimer.current = null;
            restTierRef.current = targetTier;
            setRestTier(targetTier);
            setSweepKey((k) => k + 1);
            if (targetTier === MAX_TIER) setSparkKey((k) => k + 1);
            settleTimer.current = window.setTimeout(
              () => {
                settleTimer.current = null;
                phaseRef.current = "idle";
                setPhase("idle");
              },
              SWEEP_S * 1000 + 150,
            );
          }, POST_LAND_BEAT_MS);
        },
      });
    } else {
      rotAnim.current = animate(rotY, newAngle, {
        ...springs.snap,
        onComplete: () => {
          setFrontIsA(!wasFrontA);
          restTierRef.current = targetTier;
          setRestTier(targetTier);
          phaseRef.current = "idle";
          setPhase("idle");
        },
      });
    }
  };

  const handleUpgrade = () => {
    if (phaseRef.current === "flipping") return;
    const from = restTierRef.current;
    if (from >= MAX_TIER) return;
    const to = from + 1;
    const nextName = tierAt(to).name;
    setAnnounce(`Upgraded to ${nextName}.`);
    onUpgradeRef.current?.(nextName);

    if (!motionSafeRef.current) {
      restTierRef.current = to;
      setRestTier(to);
      setFaceATier(to);
      setFaceBTier(to);
      return;
    }
    runFlip(1, to, true);
  };

  const handleDowngrade = () => {
    if (phaseRef.current === "flipping") return;
    const from = restTierRef.current;
    if (from <= 0) return;
    const to = from - 1;
    setAnnounce(`Stepped back to ${tierAt(to).name}.`);

    if (!motionSafeRef.current) {
      restTierRef.current = to;
      setRestTier(to);
      setFaceATier(to);
      setFaceBTier(to);
      return;
    }
    runFlip(-1, to, false);
  };

  const restDef = tierAt(restTier);
  const upgradeDisabled = phase === "flipping" || restTier >= MAX_TIER;
  const downgradeDisabled = phase === "flipping" || restTier <= 0;

  return (
    <div
      className={cn(
        "inline-flex flex-col items-center gap-3 select-none",
        className,
      )}
    >
      <div
        className="relative"
        style={{
          width: CARD_W,
          height: CARD_H,
          perspective: perspectives.near,
        }}
      >
        <motion.div
          className="relative h-full w-full"
          style={{
            rotateY: rotY,
            scale: cardScale,
            boxShadow: cardShadow,
            transformStyle: "preserve-3d",
            willChange: "transform",
          }}
        >
          <div
            aria-hidden={frontIsA ? undefined : true}
            className="absolute inset-0"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
            }}
          >
            <CardFace
              tierIndex={faceATier}
              holder={holder}
              pipTier={restTier}
              limitValue={restDef.limit}
            />
          </div>
          <div
            aria-hidden={frontIsA ? true : undefined}
            className="absolute inset-0"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            <CardFace
              tierIndex={faceBTier}
              holder={holder}
              pipTier={restTier}
              limitValue={restDef.limit}
            />
          </div>
        </motion.div>

        {motionSafe && sweepKey > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-4"
          >
            <motion.span
              key={sweepKey}
              className="absolute"
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
          </div>
        )}

        {motionSafe && sparkKey > 0 && (
          <span
            key={sparkKey}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            {SPARKS.map((s, i) => (
              <motion.span
                key={i}
                className="absolute size-[3px] rounded-full"
                style={{ background: tierAt(MAX_TIER).tint }}
                initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{ x: s.dx, y: s.dy, opacity: 0 }}
                transition={{ duration: durations.slow, ease: easings.exit }}
              />
            ))}
          </span>
        )}
      </div>

      <div className="relative h-5 w-64 overflow-hidden text-center">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p
            key={restTier}
            className="absolute inset-x-0 font-mono text-xs font-semibold tracking-[0.14em] whitespace-nowrap uppercase"
            style={{ color: restDef.tint }}
            initial={motionSafe ? { y: 10, opacity: 0 } : false}
            animate={{ y: 0, opacity: 1 }}
            exit={
              motionSafe
                ? { y: -10, opacity: 0, transition: exitFor(durations.base) }
                : { opacity: 0, transition: { duration: 0 } }
            }
            transition={
              motionSafe
                ? { duration: durations.base, ease: easings.enter }
                : { duration: 0 }
            }
          >
            {`Now ${restDef.name}`}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="mt-1 flex items-center gap-4">
        <button
          type="button"
          aria-label="Upgrade tier"
          onClick={handleUpgrade}
          disabled={upgradeDisabled}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-2 bg-primary px-3 py-1.5 font-mono text-xs font-semibold tracking-wide text-primary-foreground uppercase shadow-raised transition-[filter] outline-none",
            "hover:brightness-110 active:brightness-95",
            "disabled:pointer-events-none disabled:opacity-50",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
          )}
        >
          <ChevronUp className="size-3.5" aria-hidden />
          {restTier >= MAX_TIER ? "top tier" : "Upgrade"}
        </button>

        <button
          type="button"
          onClick={handleDowngrade}
          disabled={downgradeDisabled}
          className={cn(
            "inline-flex items-center gap-1 rounded-1 text-label text-ink-3 transition-colors outline-none",
            "hover:text-ink-2",
            "disabled:pointer-events-none disabled:opacity-40",
            "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
          )}
        >
          <Undo2 className="size-3.5" aria-hidden />
          step back
        </button>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}

type CardFaceProps = {
  /** Baked identity for this face: name, material, perk. Set once per slot
   * at the start of a flip, while the face is still back-culled. */
  tierIndex: number;
  holder: string;
  /** Shared, deferred: the pip and limit only advance in the post-land
   * beat, after the identity reveal has already turned into view. */
  pipTier: number;
  limitValue: number;
};

/** One face of the card — a real child component (never a called helper)
 * so its pip pop-in reads refs and hooks safely during its own render. */
function CardFace({ tierIndex, holder, pipTier, limitValue }: CardFaceProps) {
  const motionSafe = useMotionSafe();
  const tier = tierAt(tierIndex);

  return (
    <div
      className="relative flex h-full w-full flex-col justify-between overflow-hidden rounded-4 border p-4"
      style={{
        background: tier.material,
        borderColor: "color-mix(in oklab, black 30%, transparent)",
        boxShadow: "var(--edge-highlight)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className="font-mono text-xs font-semibold tracking-[0.16em] uppercase"
          style={{ color: FACE_INK }}
        >
          {tier.name}
        </span>
        <span className="flex items-center gap-1" aria-hidden>
          {TIERS.map((_, i) => (
            <motion.span
              key={i}
              className="block size-1.5 rounded-full"
              style={{
                backgroundColor:
                  i <= pipTier ? FACE_INK : "oklch(0.98 0 0 / 0.3)",
                transition: "background-color 220ms ease",
              }}
              animate={
                motionSafe && i === pipTier
                  ? { scale: [1, 1.35, 1] }
                  : { scale: 1 }
              }
              transition={
                motionSafe
                  ? { duration: 0.32, ease: easings.move, times: [0, 0.5, 1] }
                  : { duration: 0 }
              }
            />
          ))}
        </span>
      </div>

      <div className="flex flex-col gap-1.5" style={{ color: FACE_INK }}>
        <Readout value={limitValue} format={limitFormat} size="lg" />
        <p className="text-xs" style={{ color: FACE_INK_DIM }}>
          {tier.perk}
        </p>
      </div>

      <span
        className="font-mono text-[10px] tracking-[0.12em] uppercase"
        style={{ color: FACE_INK_FAINT }}
      >
        {holder}
      </span>
    </div>
  );
}
