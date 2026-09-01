"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";
import { Anchor, Shield } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

/** Sub-tiers within a division, ascending toward promotion: III is the
 * entry rung, I is one win from the next division. */
const TIER_LABELS = ["III", "II", "I"] as const;
const TIERS_PER_DIVISION = TIER_LABELS.length;
const tierLabelAt = (index: number): string => TIER_LABELS[index] ?? "III";

const DEFAULT_DIVISIONS = [
  "Deckhand",
  "Bosun",
  "Mate",
  "Skipper",
  "Master",
  "Harbourmaster",
] as const;

const DEFAULT_AT = { division: 1, tier: 1 } as const;
const DEFAULT_PER_WIN = 34;
const DEFAULT_PER_LOSS = 28;

/** Progress points to fill one tier. */
const TARGET = 100;

/** Ladder geometry, px — fixed so marker position is pure arithmetic and
 * never needs a DOM measurement. */
const BAND_H = 64;
const BAND_GAP = 8;
const ROW_H = BAND_H + BAND_GAP;
const RAIL_W = 28;
const CONTAINER_H = 224;
const MARKER_D = 16;
const MARKER_R = MARKER_D / 2;
const RING_D = 26;
const TRAIL_DOT_D = 6;
const MAX_TRAIL = 6;

const MAX_SHIELD = 1;
const SHIELD_REGEN_WINS = 2;

const CAPTION_MS = 1300;
/** Busy window while a division-crossing promotion plays its full sequence. */
const PROMO_SEQUENCE_MS = 1150;
/** Busy window while a division-crossing demotion dims its band. */
const DEMOTE_SEQUENCE_MS = 480;
const BANNER_S = 1.1;

const TAU = Math.PI * 2;
const SPARK_COUNT = 8;
const SPARK_SPREAD = 22;
/** Eight fixed spark vectors, evenly spaced from the top. No Math.random. */
const SPARKS = Array.from({ length: SPARK_COUNT }, (_, i) => {
  const angle = (i / SPARK_COUNT) * TAU - TAU / 4;
  return {
    dx: Math.cos(angle) * SPARK_SPREAD,
    dy: Math.sin(angle) * SPARK_SPREAD,
  };
});

const LIGHT_KEYFRAMES = [0, 0.4, 0] as const;
const LIGHT_TIMES = [0, 0.3, 1] as const;
const DIM_KEYFRAMES = [0, 0.55, 0] as const;
const DIM_TIMES = [0, 0.45, 1] as const;
const BANNER_OPACITY_KEYFRAMES = [0, 1, 1, 0] as const;
const BANNER_SCALE_KEYFRAMES = [0, 1, 1, 1] as const;
const BANNER_TIMES = [0, 0.16, 0.82, 1] as const;

const clampIndex = (value: number, max: number): number =>
  Number.isFinite(value)
    ? Math.min(Math.max(0, max), Math.max(0, Math.round(value)))
    : 0;

/** Visual row counted from the top of the stack — 0 is the topmost band. */
const rowFromTop = (divisionIndex: number, total: number): number =>
  total - 1 - divisionIndex;

const bandTopPx = (divisionIndex: number, total: number): number =>
  rowFromTop(divisionIndex, total) * ROW_H;

/** Where the marker sits inside its band: tier I rides near the top third,
 * tier III near the bottom third, so climbing a tier nudges it upward. */
const tierOffsetPx = (tierIndex: number): number => {
  const third = BAND_H / TIERS_PER_DIVISION;
  return third * (TIERS_PER_DIVISION - 1 - tierIndex) + third / 2;
};

const markerTopPx = (
  divisionIndex: number,
  tierIndex: number,
  total: number,
): number => bandTopPx(divisionIndex, total) + tierOffsetPx(tierIndex);

const totalRailHeight = (total: number): number =>
  Math.max(BAND_H, total * ROW_H - BAND_GAP);

/** Cool at the bottom, warming toward the top — a two-stop mix so it works
 * for any division count, not just the default six. */
const divisionTint = (index: number, total: number): string => {
  const t = total > 1 ? index / (total - 1) : 1;
  const warmPct = Math.round(t * 100);
  const strength = Math.round(16 + t * 20);
  return `color-mix(in oklab, color-mix(in oklab, var(--warn) ${warmPct}%, var(--ink-3) ${100 - warmPct}%) ${strength}%, var(--card))`;
};

const nextTargetLabel = (
  divisions: string[],
  divisionIndex: number,
  tierIndex: number,
): string | null => {
  if (tierIndex < TIERS_PER_DIVISION - 1) {
    const name = divisions[divisionIndex] ?? "";
    return `${name} ${tierLabelAt(tierIndex + 1)}`;
  }
  if (divisionIndex < divisions.length - 1) {
    const name = divisions[divisionIndex + 1] ?? "";
    return `${name} ${tierLabelAt(0)}`;
  }
  return null;
};

type TrailEntry = { division: number; tier: number };
type CaptionKind = "promote" | "demote" | "shield";
type Caption = { token: number; kind: CaptionKind; text: string };
type PromoFx = { division: number; token: number; text: string; top: number };
type DemoFx = { division: number; token: number };

type DivisionBandProps = {
  name: string;
  tint: string;
  isCurrent: boolean;
  currentTierIndex: number;
  motionSafe: boolean;
  promoActive: boolean;
  promoToken: number;
  bannerText: string;
  demoActive: boolean;
  demoToken: number;
};

/** One division row — name, warming tint, and its "III · II · I" tier
 * count. Pure props, no hooks, so it is safe to call from inside `.map`. */
function DivisionBand({
  name,
  tint,
  isCurrent,
  currentTierIndex,
  motionSafe,
  promoActive,
  promoToken,
  bannerText,
  demoActive,
  demoToken,
}: DivisionBandProps): React.JSX.Element {
  return (
    <div
      className={cn(
        "relative flex h-16 shrink-0 flex-col justify-center overflow-hidden rounded-2 border px-3 transition-colors duration-300",
        isCurrent ? "border-primary/60" : "border-hairline",
      )}
      style={{ backgroundColor: tint }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "truncate text-sm font-semibold",
            isCurrent ? "text-ink" : "text-ink-2",
          )}
        >
          {name}
        </span>
        <span className="flex shrink-0 items-center font-mono text-[10px] tracking-wide text-ink-3">
          {TIER_LABELS.map((label, i) => (
            <React.Fragment key={label}>
              {i > 0 && <span className="mx-1 text-ink-3/50">·</span>}
              <span
                className={cn(
                  isCurrent &&
                    i === currentTierIndex &&
                    "font-semibold text-ink",
                )}
              >
                {label}
              </span>
            </React.Fragment>
          ))}
        </span>
      </div>

      {motionSafe && promoActive && (
        <motion.span
          key={promoToken}
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-primary-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: [...LIGHT_KEYFRAMES] }}
          transition={{
            duration: 0.5,
            ease: easings.move,
            times: [...LIGHT_TIMES],
          }}
        />
      )}

      {motionSafe && demoActive && (
        <motion.span
          key={demoToken}
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-surface-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: [...DIM_KEYFRAMES] }}
          transition={{
            duration: 0.45,
            ease: easings.move,
            times: [...DIM_TIMES],
          }}
        />
      )}

      {motionSafe && promoActive && (
        <motion.span
          key={`banner-${promoToken}`}
          aria-hidden
          className="pointer-events-none absolute inset-x-2 top-1 origin-left rounded-1 bg-primary px-1.5 py-0.5 text-center font-mono text-[9px] font-semibold tracking-[0.14em] text-primary-foreground uppercase"
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{
            opacity: [...BANNER_OPACITY_KEYFRAMES],
            scaleX: [...BANNER_SCALE_KEYFRAMES],
          }}
          transition={{
            duration: BANNER_S,
            ease: easings.move,
            times: [...BANNER_TIMES],
          }}
        >
          {bannerText}
        </motion.span>
      )}
    </div>
  );
}

export type LadderClimbProps = {
  /** Division names, bottom to top. @default the six ranks below */
  divisions?: string[];
  /** Starting division + tier index (0 = "III", 2 = "I"). @default { division: 1, tier: 1 } — Bosun II */
  at?: { division: number; tier: number };
  /** Progress added to the current tier per win. @default 34 */
  perWin?: number;
  /** Progress removed from the current tier per loss. @default 28 */
  perLoss?: number;
  /** Fires the moment a win carries you into a new division, naming it. */
  onPromote?: (division: string) => void;
  className?: string;
};

/**
 * A vertical rank ladder — division bands stacked bottom to top, each
 * warming in tint the higher it sits, with your marker riding a rail beside
 * them and a thin trail marking every tier this season has passed through.
 * A promotion bar beneath tracks progress toward the next tier; "Win a
 * match" fills it on `springs.glide`, and clearing a whole division lights
 * its band, unfurls a naming banner, pulses a ring, and throws eight
 * sparks. "Lose a match" drains the bar and drops a tier on the harder
 * `springs.snap` — falling is built to read worse than climbing reads
 * good — and crossing a division downward only dims the band and prints a
 * muted caption, with no lights or sparks attached. A demotion shield
 * spares the first division-crossing loss taken at a division's bottom
 * tier, consuming its pip instead of the fall and regenerating after two
 * wins, so the drop always reads as fair rather than arbitrary.
 * Reduced motion: the marker jumps straight between tiers with no scroll
 * easing, and promotions and demotions skip the lights, banner, ring, and
 * sparks — only their captions still mark the change.
 */
export function LadderClimb({
  divisions: divisionsProp,
  at: atProp,
  perWin: perWinProp,
  perLoss: perLossProp,
  onPromote,
  className,
}: LadderClimbProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const divisions = divisionsProp ?? [...DEFAULT_DIVISIONS];
  const at = atProp ?? { ...DEFAULT_AT };
  const perWin = perWinProp ?? DEFAULT_PER_WIN;
  const perLoss = perLossProp ?? DEFAULT_PER_LOSS;

  const initialDivision = clampIndex(at.division, divisions.length - 1);
  const initialTier = clampIndex(at.tier, TIERS_PER_DIVISION - 1);

  const [divisionIndex, setDivisionIndex] = React.useState(initialDivision);
  const [tierIndex, setTierIndex] = React.useState(initialTier);
  const [progress, setProgress] = React.useState(0);
  const [lastMove, setLastMove] = React.useState<"climb" | "drop">("climb");
  const [shield, setShield] = React.useState(MAX_SHIELD);
  const [winsSinceShield, setWinsSinceShield] = React.useState(0);
  const [trail, setTrail] = React.useState<TrailEntry[]>([]);
  const [caption, setCaption] = React.useState<Caption | null>(null);
  const [promoFx, setPromoFx] = React.useState<PromoFx | null>(null);
  const [demoFx, setDemoFx] = React.useState<DemoFx | null>(null);
  const [announce, setAnnounce] = React.useState("");

  const divisionRef = React.useRef(initialDivision);
  const tierRef = React.useRef(initialTier);
  const progressRef = React.useRef(0);
  const shieldRef = React.useRef(MAX_SHIELD);
  const winsSinceShieldRef = React.useRef(0);
  const idCounterRef = React.useRef(0);

  const motionSafeRef = React.useRef(motionSafe);
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  }, [motionSafe]);
  const perWinRef = React.useRef(perWin);
  React.useEffect(() => {
    perWinRef.current = perWin;
  }, [perWin]);
  const perLossRef = React.useRef(perLoss);
  React.useEffect(() => {
    perLossRef.current = perLoss;
  }, [perLoss]);
  const onPromoteRef = React.useRef(onPromote);
  React.useEffect(() => {
    onPromoteRef.current = onPromote;
  }, [onPromote]);

  const progressFraction = useMotionValue<number>(0);
  const progressFillAnim = React.useRef<ReturnType<typeof animate> | null>(
    null,
  );

  const captionTimer = React.useRef<number | null>(null);
  const promoFxTimer = React.useRef<number | null>(null);
  const demoFxTimer = React.useRef<number | null>(null);

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const mountedRef = React.useRef(false);

  React.useEffect(() => {
    return () => {
      if (captionTimer.current !== null)
        window.clearTimeout(captionTimer.current);
      if (promoFxTimer.current !== null)
        window.clearTimeout(promoFxTimer.current);
      if (demoFxTimer.current !== null)
        window.clearTimeout(demoFxTimer.current);
      progressFillAnim.current?.stop();
    };
  }, []);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const total = divisions.length;
    const target = markerTopPx(divisionIndex, tierIndex, total);
    const maxScroll = Math.max(0, totalRailHeight(total) - CONTAINER_H);
    const desired = Math.min(maxScroll, Math.max(0, target - CONTAINER_H / 2));
    el.scrollTo({
      top: desired,
      behavior: mountedRef.current && motionSafe ? "smooth" : "auto",
    });
    mountedRef.current = true;
  }, [divisionIndex, tierIndex, divisions.length, motionSafe]);

  const setProgressFill = (target: number, drain?: boolean) => {
    progressFillAnim.current?.stop();
    if (!motionSafeRef.current) {
      progressFraction.jump(target);
      return;
    }
    const rising = target >= progressFraction.get();
    progressFillAnim.current = animate(
      progressFraction,
      target,
      drain
        ? { duration: durations.slow, ease: easings.exit }
        : rising
          ? springs.glide
          : springs.snap,
    );
  };

  const fireCaption = (kind: CaptionKind, text: string, token: number) => {
    setCaption({ token, kind, text });
    if (captionTimer.current !== null)
      window.clearTimeout(captionTimer.current);
    captionTimer.current = window.setTimeout(() => {
      captionTimer.current = null;
      setCaption(null);
    }, CAPTION_MS);
  };

  const applyClimb = () => {
    const fromDivision = divisionRef.current;
    const fromTier = tierRef.current;
    const total = divisions.length;

    setLastMove("climb");

    if (fromTier < TIERS_PER_DIVISION - 1) {
      const toTier = fromTier + 1;
      setTrail((prev) =>
        [...prev, { division: fromDivision, tier: fromTier }].slice(-MAX_TRAIL),
      );
      tierRef.current = toTier;
      setTierIndex(toTier);
      progressRef.current = 0;
      setProgress(0);
      setProgressFill(0, true);
      setAnnounce(
        `Climbed to ${divisions[fromDivision] ?? ""} ${tierLabelAt(toTier)}.`,
      );
      return;
    }

    if (fromDivision >= total - 1) {
      progressRef.current = TARGET;
      setProgress(TARGET);
      setProgressFill(1);
      setAnnounce("Win logged. Top of the ladder.");
      return;
    }

    const toDivision = fromDivision + 1;
    const toTier = 0;
    const name = divisions[toDivision] ?? "";

    setTrail((prev) =>
      [...prev, { division: fromDivision, tier: fromTier }].slice(-MAX_TRAIL),
    );
    divisionRef.current = toDivision;
    tierRef.current = toTier;
    setDivisionIndex(toDivision);
    setTierIndex(toTier);
    progressRef.current = 0;
    setProgress(0);
    setProgressFill(0, true);

    onPromoteRef.current?.(name);
    setAnnounce(`Promoted to ${name}.`);

    idCounterRef.current += 1;
    const token = idCounterRef.current;
    fireCaption("promote", `promoted · ${name}`, token);

    if (motionSafeRef.current) {
      setPromoFx({
        division: toDivision,
        token,
        text: name,
        top: markerTopPx(toDivision, toTier, total),
      });
      if (promoFxTimer.current !== null)
        window.clearTimeout(promoFxTimer.current);
      promoFxTimer.current = window.setTimeout(() => {
        promoFxTimer.current = null;
        setPromoFx(null);
      }, PROMO_SEQUENCE_MS);
    }
  };

  const applyDrop = () => {
    const fromDivision = divisionRef.current;
    const fromTier = tierRef.current;

    setLastMove("drop");

    if (fromTier > 0) {
      const toTier = fromTier - 1;
      setTrail((prev) =>
        [...prev, { division: fromDivision, tier: fromTier }].slice(-MAX_TRAIL),
      );
      tierRef.current = toTier;
      setTierIndex(toTier);
      progressRef.current = 0;
      setProgress(0);
      setProgressFill(0);
      setAnnounce(
        `Dropped to ${divisions[fromDivision] ?? ""} ${tierLabelAt(toTier)}.`,
      );
      return;
    }

    if (fromDivision <= 0) {
      progressRef.current = 0;
      setProgress(0);
      setProgressFill(0);
      setAnnounce("Loss logged. Bottom of the ladder.");
      return;
    }

    if (shieldRef.current > 0) {
      shieldRef.current = 0;
      setShield(0);
      winsSinceShieldRef.current = 0;
      setWinsSinceShield(0);
      progressRef.current = 0;
      setProgress(0);
      setProgressFill(0);

      idCounterRef.current += 1;
      fireCaption("shield", "shield held", idCounterRef.current);
      setAnnounce("Shield held. No demotion.");
      return;
    }

    const toDivision = fromDivision - 1;
    const toTier = TIERS_PER_DIVISION - 1;
    const name = divisions[toDivision] ?? "";

    setTrail((prev) =>
      [...prev, { division: fromDivision, tier: fromTier }].slice(-MAX_TRAIL),
    );
    divisionRef.current = toDivision;
    tierRef.current = toTier;
    setDivisionIndex(toDivision);
    setTierIndex(toTier);
    progressRef.current = 0;
    setProgress(0);
    setProgressFill(0);

    setAnnounce(`Demoted to ${name}.`);

    idCounterRef.current += 1;
    const token = idCounterRef.current;
    fireCaption("demote", `demoted · ${name}`, token);

    if (motionSafeRef.current) {
      setDemoFx({ division: toDivision, token });
      if (demoFxTimer.current !== null)
        window.clearTimeout(demoFxTimer.current);
      demoFxTimer.current = window.setTimeout(() => {
        demoFxTimer.current = null;
        setDemoFx(null);
      }, DEMOTE_SEQUENCE_MS);
    }
  };

  const handleWin = () => {
    if (promoFx || demoFx) return;

    if (shieldRef.current < MAX_SHIELD) {
      const nextWins = winsSinceShieldRef.current + 1;
      if (nextWins >= SHIELD_REGEN_WINS) {
        winsSinceShieldRef.current = 0;
        shieldRef.current = MAX_SHIELD;
        setShield(MAX_SHIELD);
        setWinsSinceShield(0);
      } else {
        winsSinceShieldRef.current = nextWins;
        setWinsSinceShield(nextWins);
      }
    }

    const total = divisions.length;
    const atCeiling =
      divisionRef.current >= total - 1 &&
      tierRef.current >= TIERS_PER_DIVISION - 1;
    const amount = perWinRef.current;
    const next = progressRef.current + amount;

    if (atCeiling) {
      const capped = Math.min(TARGET, next);
      progressRef.current = capped;
      setProgress(capped);
      setProgressFill(capped / TARGET);
      setAnnounce(
        capped >= TARGET
          ? "Win logged. Top of the ladder."
          : `Win logged. ${Math.round(capped)} of ${TARGET}.`,
      );
      return;
    }

    if (next >= TARGET) {
      progressRef.current = TARGET;
      setProgress(TARGET);
      setProgressFill(1);
      applyClimb();
    } else {
      progressRef.current = next;
      setProgress(next);
      setProgressFill(next / TARGET);
      setAnnounce(`Win logged. ${Math.round(next)} of ${TARGET}.`);
    }
  };

  const handleLose = () => {
    if (promoFx || demoFx) return;

    const amount = perLossRef.current;
    const next = progressRef.current - amount;

    if (next <= 0) {
      progressRef.current = 0;
      setProgress(0);
      setProgressFill(0);
      applyDrop();
    } else {
      progressRef.current = next;
      setProgress(next);
      setProgressFill(next / TARGET);
      setAnnounce(`Loss logged. ${Math.round(next)} of ${TARGET}.`);
    }
  };

  const busy = promoFx !== null || demoFx !== null;
  const divisionName = divisions[divisionIndex] ?? "";
  const targetLabel = nextTargetLabel(divisions, divisionIndex, tierIndex);
  const shieldLabel =
    shield > 0
      ? "shield ready"
      : `shield in ${Math.max(0, SHIELD_REGEN_WINS - winsSinceShield)}`;
  const standingText = `${divisionName} ${tierLabelAt(tierIndex)} · ${Math.round(progress)} / ${TARGET} · ${shieldLabel}`;
  const markerTop = markerTopPx(divisionIndex, tierIndex, divisions.length);

  return (
    <div
      role="group"
      aria-label="Rank ladder"
      className={cn(
        "w-full max-w-md rounded-4 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      <div className="mb-3 text-label text-ink-3">ladder</div>

      <div
        ref={scrollRef}
        aria-hidden
        className="relative overflow-y-auto rounded-3 border border-hairline-strong bg-surface-2"
        style={{ height: CONTAINER_H }}
      >
        <div
          className="relative flex gap-2"
          style={{ height: totalRailHeight(divisions.length) }}
        >
          <div className="relative shrink-0" style={{ width: RAIL_W }}>
            {trail.map((t, i) => (
              <span
                key={`${t.division}-${t.tier}-${i}`}
                className="absolute left-1/2 rounded-full bg-ink-3"
                style={{
                  top:
                    markerTopPx(t.division, t.tier, divisions.length) -
                    TRAIL_DOT_D / 2,
                  marginLeft: -(TRAIL_DOT_D / 2),
                  width: TRAIL_DOT_D,
                  height: TRAIL_DOT_D,
                  opacity: 0.12 + (0.4 * (i + 1)) / trail.length,
                }}
              />
            ))}

            <motion.div
              className="absolute left-1/2 flex items-center justify-center rounded-full bg-primary shadow-raised"
              style={{
                width: MARKER_D,
                height: MARKER_D,
                marginLeft: -MARKER_R,
              }}
              initial={false}
              animate={{ top: markerTop - MARKER_R }}
              transition={
                motionSafe
                  ? springs[lastMove === "climb" ? "glide" : "snap"]
                  : { duration: 0 }
              }
            >
              <Anchor className="size-2.5 text-primary-foreground" />
            </motion.div>

            <span
              className="absolute left-1/2"
              style={{ top: markerTop - MARKER_R - 15, marginLeft: -7 }}
            >
              <Shield
                className={cn(
                  "size-3.5",
                  shield > 0 ? "text-primary" : "text-ink-3/40",
                )}
                fill={shield > 0 ? "currentColor" : "none"}
              />
            </span>

            {motionSafe && promoFx && (
              <motion.span
                key={`ring-${promoFx.token}`}
                className="pointer-events-none absolute left-1/2 rounded-full border-2 border-primary"
                style={{
                  top: promoFx.top - RING_D / 2,
                  marginLeft: -(RING_D / 2),
                  width: RING_D,
                  height: RING_D,
                }}
                initial={{ scale: 0.6, opacity: 0.9 }}
                animate={{ scale: 1.8, opacity: 0 }}
                transition={{ duration: durations.slow, ease: easings.exit }}
              />
            )}

            {motionSafe && promoFx && (
              <span
                className="pointer-events-none absolute left-1/2"
                style={{ top: promoFx.top }}
              >
                {SPARKS.map((s, i) => (
                  <motion.span
                    key={i}
                    className="absolute size-[3px] rounded-full bg-signal"
                    initial={{ x: 0, y: 0, opacity: 1 }}
                    animate={{ x: s.dx, y: s.dy, opacity: 0 }}
                    transition={{
                      duration: durations.slow,
                      ease: easings.exit,
                      delay: i * cascade(SPARK_COUNT),
                    }}
                  />
                ))}
              </span>
            )}
          </div>

          <div className="flex flex-1 flex-col-reverse gap-2">
            {divisions.map((name, index) => (
              <DivisionBand
                key={`${name}-${index}`}
                name={name}
                tint={divisionTint(index, divisions.length)}
                isCurrent={index === divisionIndex}
                currentTierIndex={tierIndex}
                motionSafe={motionSafe}
                promoActive={promoFx?.division === index}
                promoToken={promoFx?.token ?? 0}
                bannerText={promoFx?.text ?? ""}
                demoActive={demoFx?.division === index}
                demoToken={demoFx?.token ?? 0}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="relative h-4 overflow-hidden font-mono text-[10px] font-semibold tracking-[0.14em] text-ink-2 uppercase">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={`${divisionIndex}-${tierIndex}`}
                className="absolute inset-x-0 left-0"
                initial={
                  motionSafe
                    ? { y: lastMove === "drop" ? -10 : 10, opacity: 0 }
                    : false
                }
                animate={{ y: 0, opacity: 1 }}
                exit={
                  motionSafe
                    ? {
                        y: lastMove === "drop" ? 10 : -10,
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
                {divisionName} {tierLabelAt(tierIndex)}
              </motion.span>
            </AnimatePresence>
          </span>

          <span className="flex items-center gap-1 font-mono text-[10px] text-ink-3">
            <Readout
              value={progress}
              format={(v) => `${Math.round(v)} / ${TARGET}`}
              size="sm"
            />
            {targetLabel ? (
              <span>to {targetLabel}</span>
            ) : (
              <span>top of the ladder</span>
            )}
          </span>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
          <motion.div
            aria-hidden
            className="h-full origin-left rounded-full bg-primary"
            style={{ scaleX: progressFraction }}
          />
        </div>
      </div>

      <div className="mt-2 flex h-4 items-center justify-center overflow-hidden font-mono text-[11px]">
        <AnimatePresence mode="wait" initial={false}>
          {caption && (
            <motion.span
              key={caption.token}
              initial={motionSafe ? { opacity: 0, y: 4 } : { opacity: 1 }}
              animate={{ opacity: 1, y: 0 }}
              exit={
                motionSafe
                  ? {
                      opacity: 0,
                      y: -4,
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
              className={cn(
                "tracking-[0.06em] uppercase",
                caption.kind === "promote" && "text-success",
                caption.kind === "demote" && "text-ink-3",
                caption.kind === "shield" && "text-primary",
              )}
            >
              {caption.text}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="font-mono text-xs text-ink-2">{standingText}</span>
        <div className="flex shrink-0 gap-2">
          <motion.button
            type="button"
            aria-label="Lose a match"
            onClick={handleLose}
            disabled={busy}
            whileTap={motionSafe ? { scale: 0.94 } : undefined}
            transition={springs.flick}
            className={cn(
              "rounded-2 border border-hairline-strong bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink-2 shadow-raised transition-[filter] outline-none",
              "hover:brightness-110 active:brightness-95",
              "disabled:pointer-events-none disabled:opacity-50",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
            )}
          >
            lose
          </motion.button>
          <motion.button
            type="button"
            aria-label="Win a match"
            onClick={handleWin}
            disabled={busy}
            whileTap={motionSafe ? { scale: 0.94 } : undefined}
            transition={springs.flick}
            className={cn(
              "rounded-2 bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-raised transition-[filter] outline-none",
              "hover:brightness-110 active:brightness-95",
              "disabled:pointer-events-none disabled:opacity-50",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
            )}
          >
            win
          </motion.button>
        </div>
      </div>

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
