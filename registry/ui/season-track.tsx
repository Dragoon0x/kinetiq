"use client";

import * as React from "react";

import { Check, Lock, Waves } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { clamp } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

const MIN_TIERS = 5;
const MAX_TIERS = 10;
const DEFAULT_TIERS = 8;
const DEFAULT_PER_CLICK = 40;
const DEFAULT_DAYS_LEFT = 12;
/** Progress a tier costs — fixed, independent of `perClick`. */
const PROGRESS_PER_TIER = 100;

const SEASON_NAME = "Tidewater";
/** Starting season number, so the header reads "Season 4" and the first
 * reset button reads "season 5" — the two numbers were always meant to
 * agree. */
const INITIAL_SEASON = 4;

/** Reward chip footprint (px). */
const CELL_SIZE = 36;
/** Per-tier column budget (px) for the horizontal scroller's min-width. */
const COLUMN_BUDGET = 64;

/** Slow breathing loop for a `ready` chip's outline. */
const PULSE_S = 2.2;
/** How far a claimed chip's glyph flies before it fades. */
const FLY_DISTANCE = 26;
const FLY_DURATION_S = 0.5;
const FLY_DURATION_MS = Math.round(FLY_DURATION_S * 1000);
/** How long a flare caption holds before it clears on its own. */
const CAPTION_FLASH_MS = 1700;

const PREMIUM_FILL =
  "color-mix(in oklab, var(--warning, #b45309) 70%, var(--primary))";
const PREMIUM_WASH =
  "color-mix(in oklab, var(--warning, #b45309) 14%, transparent)";

type Lane = "free" | "premium";
type CellStatus = "claimed" | "ready" | "locked" | "gated";

/** Ten themed flavor names per lane — sliced to whatever `tiers` asks for.
 * `as const` tuples, read only by index, never assigned to a mutable type. */
const FREE_LABELS = [
  "Driftwood",
  "Sea Glass",
  "Tide Charm",
  "Coral Bit",
  "Pearl Shard",
  "Kelp Coin",
  "Anchor Chip",
  "Current Badge",
  "Reef Token",
  "Moonpool Relic",
] as const;

const PREMIUM_LABELS = [
  "Gilded Driftwood",
  "Amber Sea Glass",
  "Warden Tide Charm",
  "Sunken Coral",
  "Black Pearl",
  "Kelp Crown",
  "Storm Anchor",
  "Riptide Badge",
  "Abyssal Token",
  "Tidewater Crown",
] as const;

const labelFor = (lane: Lane, tierIndex: number): string => {
  const table = lane === "free" ? FREE_LABELS : PREMIUM_LABELS;
  return table[tierIndex] ?? "Reward";
};

/** A tier is reached the moment progress passes its start line — tier 0
 * needs none, so the first reward on each lane is live before any earning. */
const tierUnlocked = (progress: number, tierIndex: number): boolean =>
  progress >= tierIndex * PROGRESS_PER_TIER;

function freeStatus(claimed: boolean, unlocked: boolean): CellStatus {
  if (claimed) return "claimed";
  return unlocked ? "ready" : "locked";
}

function premiumStatus(
  claimed: boolean,
  unlocked: boolean,
  premiumUnlocked: boolean,
): CellStatus {
  if (claimed) return "claimed";
  if (!unlocked) return "locked";
  return premiumUnlocked ? "ready" : "gated";
}

/** Per-status enter recipe for a cell's button — a pure lookup, never a
 * hook, safe to call from inside the lane map. */
function cellMotionFor(
  status: CellStatus,
  motionSafe: boolean,
  cascadeDelay: number,
) {
  if (status === "locked") {
    return {
      initial: motionSafe ? { opacity: 0, y: distances.nudge } : false,
      animate: { opacity: 1, y: 0 },
      transition: motionSafe
        ? { duration: durations.base, ease: easings.enter, delay: cascadeDelay }
        : { duration: 0 },
    };
  }
  return {
    initial: motionSafe ? { scale: 0.55, opacity: 0.6 } : false,
    animate: { scale: 1, opacity: 1 },
    transition: motionSafe
      ? { ...springs.flick, delay: cascadeDelay }
      : { duration: 0 },
  };
}

type SeasonCellProps = {
  lane: Lane;
  tierIndex: number;
  status: CellStatus;
  expired: boolean;
  motionSafe: boolean;
  flyToken: number | null;
  cascadeDelay: number;
  onClaim: (lane: Lane, tierIndex: number) => void;
};

/** One reward chip. Owns no motion values — like the reference track's own
 * node, every reaction is a props-driven token or a key-forced remount, so
 * the lane's map above never has to call a hook. */
function SeasonCell({
  lane,
  tierIndex,
  status,
  expired,
  motionSafe,
  flyToken,
  cascadeDelay,
  onClaim,
}: SeasonCellProps): React.JSX.Element {
  const label = labelFor(lane, tierIndex);
  const isPremium = lane === "premium";
  const isClaimable = status === "ready" && !expired;
  const isFlying = flyToken !== null;
  const { initial, animate, transition } = cellMotionFor(
    status,
    motionSafe,
    cascadeDelay,
  );

  const ariaLabel = expired
    ? `${label}, expired`
    : isClaimable
      ? `Claim ${label}`
      : status === "claimed"
        ? `${label}, claimed`
        : status === "gated"
          ? `${label}, premium locked`
          : `${label}, locked`;

  return (
    <div className="flex flex-col items-center gap-1">
      <motion.button
        key={status}
        type="button"
        aria-label={ariaLabel}
        disabled={!isClaimable}
        tabIndex={isClaimable ? 0 : -1}
        onClick={isClaimable ? () => onClaim(lane, tierIndex) : undefined}
        whileTap={isClaimable && motionSafe ? { scale: 0.92 } : undefined}
        whileHover={isClaimable && motionSafe ? { scale: 1.05 } : undefined}
        initial={initial}
        animate={animate}
        transition={transition}
        className={cn(
          "relative flex items-center justify-center rounded-2 border outline-none",
          expired &&
            (motionSafe
              ? "transition-[opacity,filter] duration-300 ease-out"
              : ""),
          status === "locked" &&
            "border-hairline-strong bg-surface-1 text-ink-3 opacity-55",
          status === "gated" &&
            "border-warn/35 bg-surface-1 text-warn/70 opacity-80",
          status === "ready" &&
            "border-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          status === "ready" &&
            (isPremium
              ? "border-warn bg-surface-2 text-warn"
              : "border-primary bg-surface-2 text-primary"),
          status === "claimed" && "border-transparent text-primary-foreground",
          status === "claimed" && !isPremium && "bg-primary",
          expired && "opacity-45 grayscale",
        )}
        style={{
          width: CELL_SIZE,
          height: CELL_SIZE,
          ...(status === "claimed" && isPremium
            ? { background: PREMIUM_FILL }
            : null),
        }}
      >
        {status === "ready" && !expired && motionSafe && (
          <motion.span
            aria-hidden
            className={cn(
              "absolute -inset-1 rounded-2 border-2",
              isPremium ? "border-warn" : "border-primary",
            )}
            animate={{ opacity: [0.25, 0.8, 0.25], scale: [1, 1.06, 1] }}
            transition={{
              duration: PULSE_S,
              ease: easings.move,
              repeat: Infinity,
            }}
          />
        )}

        {status === "claimed" ? (
          <motion.span
            aria-hidden
            className="flex items-center justify-center"
            initial={motionSafe ? { scale: 0, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={
              motionSafe ? { ...springs.flick, delay: 0.1 } : { duration: 0 }
            }
          >
            <Check className="size-3.5" />
          </motion.span>
        ) : status === "gated" ? (
          <Lock aria-hidden className="size-3.5" />
        ) : (
          <Waves aria-hidden className="size-3.5" />
        )}
      </motion.button>

      {(status !== "claimed" || isFlying) && (
        <motion.span
          aria-hidden
          className={cn(
            "max-w-[62px] truncate text-center font-mono text-[9px]",
            expired ? "text-ink-3 line-through" : "text-ink-3",
          )}
          initial={false}
          animate={
            isFlying
              ? { y: -FLY_DISTANCE, opacity: 0 }
              : { y: 0, opacity: status === "locked" ? 0.45 : 1 }
          }
          transition={
            isFlying
              ? motionSafe
                ? { duration: FLY_DURATION_S, ease: easings.exit }
                : { duration: 0 }
              : { duration: durations.fast, ease: easings.enter }
          }
        >
          {label}
        </motion.span>
      )}
    </div>
  );
}

export type SeasonTrackProps = {
  /** Reward tiers spanning the pass. Clamped to 5–10. @default 8 */
  tiers?: number;
  /** Progress a single "earn" click adds; each tier costs a fixed 100.
   * @default 40 */
  perClick?: number;
  /** Days left in the window. A static prop, never read from the clock —
   * pass a live value from your own countdown if you want it current.
   * @default 12 */
  daysLeft?: number;
  /** Fires the instant a chip is claimed, with its 1-indexed tier and lane. */
  onClaim?: (tier: number, lane: "free" | "premium") => void;
  className?: string;
};

/**
 * A two-lane season pass racing a closing window. Free and premium rows run
 * side by side across a fixed run of tiers under a shared column header,
 * whose marker slides to the current tier on `springs.glide` as "earn"
 * advances progress; crossing a boundary pops that tier's pair of chips into
 * view in a `cascade()` and rolls the header's level `Readout`. Every ready
 * chip is its own claim button that fills, stamps a check, and sends its
 * glyph flying off before settling, while the premium lane sits behind a
 * lock wash until "unlock premium" sweeps it away and promotes every
 * already-earned premium chip to claimable at once — the retroactive payout
 * is the whole reason the pattern works. "End season" is the other half of
 * that bargain: every chip still unclaimed greys out with a strike right on
 * the board, tallied in a caption, before a "season N" button starts the
 * run over.
 * Reduced motion: no marker slide, chip pop, glyph flight, or gate sweep —
 * claiming, unlocking, expiring, and resetting all commit instantly, with
 * captions and counts still updating.
 */
export function SeasonTrack({
  tiers,
  perClick,
  daysLeft,
  onClaim,
  className,
}: SeasonTrackProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const tiersCount = clamp(
    Math.round(tiers ?? DEFAULT_TIERS),
    MIN_TIERS,
    MAX_TIERS,
  );
  const step = Math.max(1, Math.round(perClick ?? DEFAULT_PER_CLICK));
  const daysLeftValue = Math.max(0, Math.round(daysLeft ?? DEFAULT_DAYS_LEFT));
  const trackMax = tiersCount * PROGRESS_PER_TIER;
  const cascadeStep = cascade(tiersCount);
  const tierIndices = Array.from({ length: tiersCount }, (_, i) => i);

  const [progress, setProgress] = React.useState(0);
  const [freeClaimed, setFreeClaimed] = React.useState<boolean[]>(() =>
    tierIndices.map(() => false),
  );
  const [premiumClaimed, setPremiumClaimed] = React.useState<boolean[]>(() =>
    tierIndices.map(() => false),
  );
  const [premiumUnlocked, setPremiumUnlocked] = React.useState(false);
  const [seasonEnded, setSeasonEnded] = React.useState(false);
  const [expiredCount, setExpiredCount] = React.useState(0);
  const [freeFly, setFreeFly] = React.useState<Array<number | null>>(() =>
    tierIndices.map(() => null),
  );
  const [premiumFly, setPremiumFly] = React.useState<Array<number | null>>(() =>
    tierIndices.map(() => null),
  );
  const [flareCaption, setFlareCaption] = React.useState<string | null>(null);
  const [season, setSeason] = React.useState(INITIAL_SEASON);
  const [announce, setAnnounce] = React.useState("");

  const progressRef = React.useRef(0);
  const freeClaimedRef = React.useRef<boolean[]>(tierIndices.map(() => false));
  const premiumClaimedRef = React.useRef<boolean[]>(
    tierIndices.map(() => false),
  );
  const premiumUnlockedRef = React.useRef(false);
  const seasonEndedRef = React.useRef(false);
  const motionSafeRef = React.useRef(motionSafe);
  const onClaimRef = React.useRef(onClaim);
  const idCounter = React.useRef(0);

  const freeFlyTimers = React.useRef<Array<number | null>>(
    tierIndices.map(() => null),
  );
  const premiumFlyTimers = React.useRef<Array<number | null>>(
    tierIndices.map(() => null),
  );
  const flareCaptionTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  }, [motionSafe]);

  React.useEffect(() => {
    onClaimRef.current = onClaim;
  }, [onClaim]);

  React.useEffect(() => {
    const freeT = freeFlyTimers.current;
    const premiumT = premiumFlyTimers.current;
    return () => {
      for (const t of freeT) if (t !== null) window.clearTimeout(t);
      for (const t of premiumT) if (t !== null) window.clearTimeout(t);
      if (flareCaptionTimer.current !== null)
        window.clearTimeout(flareCaptionTimer.current);
    };
  }, []);

  const currentTierIndex = clamp(
    Math.floor(progress / PROGRESS_PER_TIER),
    0,
    tiersCount - 1,
  );
  const tierProgress = progress - currentTierIndex * PROGRESS_PER_TIER;
  const tierFraction = tierProgress / PROGRESS_PER_TIER;
  const level = currentTierIndex + 1;

  const freeStatuses = tierIndices.map((i) =>
    freeStatus(freeClaimed[i] ?? false, tierUnlocked(progress, i)),
  );
  const premiumStatuses = tierIndices.map((i) =>
    premiumStatus(
      premiumClaimed[i] ?? false,
      tierUnlocked(progress, i),
      premiumUnlocked,
    ),
  );
  const unclaimedCount =
    freeStatuses.filter((s) => s === "ready").length +
    premiumStatuses.filter((s) => s === "ready" || s === "gated").length;

  const claimCell = (lane: Lane, tierIndex: number) => {
    if (seasonEndedRef.current) return;
    const claimedArr =
      lane === "free" ? freeClaimedRef.current : premiumClaimedRef.current;
    if (claimedArr[tierIndex]) return;
    if (!tierUnlocked(progressRef.current, tierIndex)) return;
    if (lane === "premium" && !premiumUnlockedRef.current) return;

    const nextArr = claimedArr.map((v, i) => (i === tierIndex ? true : v));
    if (lane === "free") {
      freeClaimedRef.current = nextArr;
      setFreeClaimed(nextArr);
    } else {
      premiumClaimedRef.current = nextArr;
      setPremiumClaimed(nextArr);
    }

    const label = labelFor(lane, tierIndex);
    onClaimRef.current?.(tierIndex + 1, lane);
    setAnnounce(`${label} claimed.`);

    if (motionSafeRef.current) {
      idCounter.current += 1;
      const token = idCounter.current;
      const timers =
        lane === "free" ? freeFlyTimers.current : premiumFlyTimers.current;
      const setFly = lane === "free" ? setFreeFly : setPremiumFly;

      setFly((prev) => prev.map((v, i) => (i === tierIndex ? token : v)));
      const existing = timers[tierIndex];
      if (existing !== null && existing !== undefined)
        window.clearTimeout(existing);
      timers[tierIndex] = window.setTimeout(() => {
        timers[tierIndex] = null;
        setFly((prev) => prev.map((v, i) => (i === tierIndex ? null : v)));
      }, FLY_DURATION_MS);
    }
  };

  const handleEarn = () => {
    if (seasonEndedRef.current) return;
    if (progressRef.current >= trackMax) return;
    const next = Math.min(trackMax, progressRef.current + step);
    progressRef.current = next;
    setProgress(next);
    const reachedTier = clamp(
      Math.floor(next / PROGRESS_PER_TIER),
      0,
      tiersCount - 1,
    );
    setAnnounce(`Progress advanced. Tier ${reachedTier + 1} of ${tiersCount}.`);
  };

  const handleUnlockPremium = () => {
    if (premiumUnlockedRef.current || seasonEndedRef.current) return;
    let retro = 0;
    for (const i of tierIndices) {
      if (
        tierUnlocked(progressRef.current, i) &&
        !(premiumClaimedRef.current[i] ?? false)
      ) {
        retro += 1;
      }
    }
    premiumUnlockedRef.current = true;
    setPremiumUnlocked(true);

    setFlareCaption(
      retro > 0 ? `premium unlocked · ${retro} to claim` : "premium unlocked",
    );
    if (flareCaptionTimer.current !== null)
      window.clearTimeout(flareCaptionTimer.current);
    flareCaptionTimer.current = window.setTimeout(() => {
      flareCaptionTimer.current = null;
      setFlareCaption(null);
    }, CAPTION_FLASH_MS);

    setAnnounce(
      retro > 0
        ? `Premium unlocked. ${retro} reward${retro === 1 ? "" : "s"} newly ready.`
        : "Premium unlocked.",
    );
  };

  const handleEndSeason = () => {
    if (seasonEndedRef.current) return;
    let count = 0;
    for (const i of tierIndices) {
      const unlocked = tierUnlocked(progressRef.current, i);
      if (unlocked && !(freeClaimedRef.current[i] ?? false)) count += 1;
      if (unlocked && !(premiumClaimedRef.current[i] ?? false)) count += 1;
    }
    seasonEndedRef.current = true;
    setSeasonEnded(true);
    setExpiredCount(count);
    setFlareCaption(null);
    if (flareCaptionTimer.current !== null) {
      window.clearTimeout(flareCaptionTimer.current);
      flareCaptionTimer.current = null;
    }
    setAnnounce(
      `Season ended. ${count} reward${count === 1 ? "" : "s"} expired.`,
    );
  };

  const handleNewSeason = () => {
    for (let i = 0; i < freeFlyTimers.current.length; i += 1) {
      const t = freeFlyTimers.current[i];
      if (t !== null && t !== undefined) window.clearTimeout(t);
      freeFlyTimers.current[i] = null;
    }
    for (let i = 0; i < premiumFlyTimers.current.length; i += 1) {
      const t = premiumFlyTimers.current[i];
      if (t !== null && t !== undefined) window.clearTimeout(t);
      premiumFlyTimers.current[i] = null;
    }
    if (flareCaptionTimer.current !== null) {
      window.clearTimeout(flareCaptionTimer.current);
      flareCaptionTimer.current = null;
    }

    progressRef.current = 0;
    freeClaimedRef.current = tierIndices.map(() => false);
    premiumClaimedRef.current = tierIndices.map(() => false);
    premiumUnlockedRef.current = false;
    seasonEndedRef.current = false;

    setProgress(0);
    setFreeClaimed([...freeClaimedRef.current]);
    setPremiumClaimed([...premiumClaimedRef.current]);
    setPremiumUnlocked(false);
    setSeasonEnded(false);
    setExpiredCount(0);
    setFreeFly(tierIndices.map(() => null));
    setPremiumFly(tierIndices.map(() => null));
    setFlareCaption(null);
    setSeason((s) => s + 1);
    setAnnounce("New season. Track reset.");
  };

  const trackMinWidth = tiersCount * COLUMN_BUDGET;
  const markerPct = (currentTierIndex / tiersCount) * 100;
  const markerWidthPct = 100 / tiersCount;
  const captionText =
    flareCaption ?? (seasonEnded ? `${expiredCount} rewards expired` : "");
  const earnDisabled = seasonEnded || progress >= trackMax;

  return (
    <div
      className={cn(
        "w-full max-w-3xl rounded-4 border border-hairline bg-surface-1 p-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-label text-ink-3">{`Season ${season} · ${SEASON_NAME}`}</span>
          <span className="font-mono text-xs text-ink-3 tabular-nums">
            {daysLeftValue} day{daysLeftValue === 1 ? "" : "s"} left
          </span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-label text-ink-3">level</span>
          <Readout value={level} format={(v) => `LV ${v}`} size="sm" />
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <div style={{ minWidth: trackMinWidth }}>
          <div className="relative">
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${tiersCount}, minmax(0, 1fr))`,
              }}
            >
              {tierIndices.map((i) => (
                <span
                  key={i}
                  className={cn(
                    "text-center font-mono text-[10px] tabular-nums",
                    i === currentTierIndex
                      ? "font-semibold text-ink"
                      : i < currentTierIndex
                        ? "text-ink-2"
                        : "text-ink-3",
                  )}
                >
                  {i + 1}
                </span>
              ))}
            </div>
            <motion.span
              aria-hidden
              className="absolute -bottom-1 h-0.5 rounded-full bg-primary"
              style={{ width: `${markerWidthPct}%` }}
              initial={false}
              animate={{ left: `${markerPct}%` }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2">
            <div
              className="grid items-start gap-1.5"
              style={{
                gridTemplateColumns: `repeat(${tiersCount}, minmax(0, 1fr))`,
              }}
            >
              {tierIndices.map((i) => (
                <div key={i} className="flex justify-center">
                  <SeasonCell
                    lane="free"
                    tierIndex={i}
                    status={freeStatuses[i] ?? "locked"}
                    expired={
                      seasonEnded &&
                      freeStatuses[i] !== "claimed" &&
                      freeStatuses[i] !== "locked"
                    }
                    motionSafe={motionSafe}
                    flyToken={freeFly[i] ?? null}
                    cascadeDelay={i * cascadeStep}
                    onClaim={claimCell}
                  />
                </div>
              ))}
            </div>

            <div className="relative">
              <div
                className="grid items-start gap-1.5"
                style={{
                  gridTemplateColumns: `repeat(${tiersCount}, minmax(0, 1fr))`,
                }}
              >
                {tierIndices.map((i) => (
                  <div key={i} className="flex justify-center">
                    <SeasonCell
                      lane="premium"
                      tierIndex={i}
                      status={premiumStatuses[i] ?? "locked"}
                      expired={
                        seasonEnded &&
                        premiumStatuses[i] !== "claimed" &&
                        premiumStatuses[i] !== "locked"
                      }
                      motionSafe={motionSafe}
                      flyToken={premiumFly[i] ?? null}
                      cascadeDelay={i * cascadeStep + cascadeStep / 2}
                      onClaim={claimCell}
                    />
                  </div>
                ))}
              </div>

              <AnimatePresence>
                {!premiumUnlocked && !seasonEnded && (
                  <motion.div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 -m-1 flex items-center justify-center gap-1.5 rounded-2 border border-warn/25 backdrop-blur-[1px]"
                    style={{ background: PREMIUM_WASH }}
                    initial={false}
                    exit={
                      motionSafe
                        ? {
                            x: "100%",
                            opacity: 0,
                            transition: {
                              duration: durations.slow,
                              ease: easings.exit,
                            },
                          }
                        : { opacity: 0, transition: { duration: 0 } }
                    }
                  >
                    <Lock aria-hidden className="size-3 text-warn" />
                    <span className="text-label text-warn">premium</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <motion.span
          className="absolute inset-y-0 left-0 origin-left rounded-full bg-primary"
          style={{ width: "100%" }}
          initial={false}
          animate={{ scaleX: tierFraction }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-ink-3 tabular-nums">
        <span>progress</span>
        <span>
          {tierProgress}/{PROGRESS_PER_TIER}
        </span>
      </div>

      <div
        aria-hidden
        className="mt-2 flex h-4 items-center justify-center overflow-hidden font-mono text-[11px] text-ink-2"
      >
        <AnimatePresence mode="wait" initial={false}>
          {captionText && (
            <motion.span
              key={captionText}
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
              className="tracking-[0.06em] uppercase"
            >
              {captionText}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {!seasonEnded && unclaimedCount > 0 && (
            <Readout
              value={unclaimedCount}
              format={(v) => `${v} to claim`}
              size="sm"
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          {!seasonEnded && !premiumUnlocked && (
            <button
              type="button"
              onClick={handleUnlockPremium}
              className={cn(
                "rounded-1 px-1.5 py-1 font-mono text-[11px] text-ink-3 underline decoration-hairline-strong underline-offset-2 transition-colors outline-none",
                "hover:text-warn",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
              )}
            >
              unlock premium
            </button>
          )}

          {!seasonEnded && (
            <button
              type="button"
              onClick={handleEndSeason}
              className={cn(
                "rounded-1 px-1.5 py-1 font-mono text-[11px] text-ink-3 underline decoration-hairline-strong underline-offset-2 transition-colors outline-none",
                "hover:text-destructive",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
              )}
            >
              end season
            </button>
          )}

          {seasonEnded ? (
            <motion.button
              type="button"
              onClick={handleNewSeason}
              whileTap={motionSafe ? { scale: 0.95 } : undefined}
              transition={springs.flick}
              className={cn(
                "rounded-2 border border-hairline-strong bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors outline-none",
                "hover:text-ink",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
              )}
            >
              {`season ${season + 1}`}
            </motion.button>
          ) : (
            <motion.button
              type="button"
              aria-label="Earn season progress"
              onClick={handleEarn}
              disabled={earnDisabled}
              whileTap={
                !earnDisabled && motionSafe ? { scale: 0.94 } : undefined
              }
              transition={springs.flick}
              className={cn(
                "rounded-2 border border-transparent bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-raised transition-[filter] outline-none",
                "hover:brightness-110 active:brightness-95",
                "disabled:pointer-events-none disabled:opacity-50",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
              )}
            >
              earn
            </motion.button>
          )}
        </div>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
