"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import { Crown } from "lucide-react";

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

/** Stage geometry (px). */
const STAGE_W = 340;
const STAGE_H = 256;

/** Column + plinth geometry. */
const COLUMN_W = 100;
const PLINTH_W = 84;
const PLINTH_H_FIRST = 108;
const PLINTH_H_SECOND = 80;
const PLINTH_H_THIRD = 56;
/** How far below the visible floor a sunk plinth sits — clipped by the
 * stage's own overflow-hidden, never visible. */
const PLINTH_SUNK_Y = 130;

/** Winner card. */
const CARD_W = 92;
const CARD_SLOT_H = 96;
const CARD_GAP = 10;
/** Cards drop in from above rest by this much. */
const CARD_DROP_Y = -30;

/** Ring pulse (second place's extra flourish), centered on the card. */
const RING_D = 112;

/** Glint sweep — a skewed band crossing one plinth face. */
const GLINT_W = 20;
const GLINT_HIDDEN_LEFT = -(GLINT_W + 10);
const GLINT_SWEEP_S = 0.6;
const GLINT_SWEEP_MS = 600;

/** The podium-wide sweep that plays once, for first place only. */
const SWEEP_W = 60;
const SWEEP_HIDDEN_LEFT = -(SWEEP_W + 16);
const SWEEP_VISIBLE_LEFT = STAGE_W + 16;
const SWEEP_S = 0.65;
const SWEEP_MS = 650;

const RING_MS = 400;
const SPARK_MS = 400;

/** Timing (ms) of the reverse-order ceremony. */
const CARD_SETTLE_MS = 300;
const BEAT_AFTER_THIRD_MS = 700;
const BEAT_AFTER_SECOND_MS = 900;
/** Pause between the champion's card landing and the crown/sweep/sparks/caption. */
const POST_LAND_BEAT_MS = 160;
/** How long the "<name> takes it" caption holds before it clears. */
const CAPTION_MS = 1400;

const SHEEN =
  "linear-gradient(115deg, transparent 0%, oklch(1 0 0 / 0.05) 22%, oklch(1 0 0 / 0.55) 50%, oklch(1 0 0 / 0.05) 78%, transparent 100%)";

/** Ten fixed spark vectors fanning up from the crown — trig, not randomness. */
const TAU = Math.PI * 2;
const SPARK_COUNT = 10;
const SPARK_SPREAD = 30;
const SPARKS: readonly { dx: number; dy: number }[] = Array.from(
  { length: SPARK_COUNT },
  (_, i) => {
    const angle = (i / SPARK_COUNT) * TAU - TAU / 4;
    return {
      dx: Math.cos(angle) * SPARK_SPREAD,
      dy: Math.sin(angle) * SPARK_SPREAD,
    };
  },
);

/** Each tier's base hue — bronze is a color-mixed warm blend, not a token. */
const GOLD = "var(--warning, #b45309)";
const SILVER = "var(--ink-2)";
const BRONZE = "color-mix(in oklab, var(--warning, #b45309) 58%, #7c2d12 42%)";

type RankId = "first" | "second" | "third";

const PLACE_COUNT = 3;
/** Reset stagger — the plinths sink in forward order on this interval. */
const SINK_STAGGER = cascade(PLACE_COUNT);

type RankMeta = {
  id: RankId;
  numeral: string;
  tint: string;
  height: number;
  /** CSS flex order — the classic arrangement reads silver, gold, bronze. */
  layoutOrder: number;
  isChampion: boolean;
  sinkDelay: number;
};

/** Fixed podium geometry — order, tints and heights never change at runtime.
 * Array order matches `Place[]` (first, second, third); `layoutOrder` is
 * what actually arranges them left to right on stage. */
const RANKS = [
  {
    id: "first",
    numeral: "1",
    tint: GOLD,
    height: PLINTH_H_FIRST,
    layoutOrder: 2,
    isChampion: true,
    sinkDelay: 0,
  },
  {
    id: "second",
    numeral: "2",
    tint: SILVER,
    height: PLINTH_H_SECOND,
    layoutOrder: 1,
    isChampion: false,
    sinkDelay: SINK_STAGGER,
  },
  {
    id: "third",
    numeral: "3",
    tint: BRONZE,
    height: PLINTH_H_THIRD,
    layoutOrder: 3,
    isChampion: false,
    sinkDelay: SINK_STAGGER * 2,
  },
] as const satisfies readonly RankMeta[];

export type Place = {
  id: string;
  name: string;
  score: number;
};

/** Default cast, ordered first, second, third. */
const DEFAULT_PLACES: readonly [Place, Place, Place] = [
  { id: "marisol", name: "Marisol Kendrick", score: 12480 },
  { id: "dashiell", name: "Dashiell Corwin", score: 11050 },
  { id: "ingrid", name: "Ingrid Solace", score: 9870 },
];

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  const initials = `${first}${last}`.toUpperCase();
  return initials || "?";
}

function plinthGradient(tint: string): string {
  return `linear-gradient(180deg, color-mix(in oklab, ${tint} 85%, var(--card)) 0%, color-mix(in oklab, ${tint} 45%, var(--card)) 100%)`;
}

type Phase = "idle" | "revealing" | "revealed";

type PlinthColumnProps = {
  meta: RankMeta;
  place: Place;
  revealed: boolean;
  scoreValue: number;
  glintActive: boolean;
  ringActive: boolean;
  crownShown: boolean;
  sparkActive: boolean;
  motionSafe: boolean;
  skipActive: boolean;
};

/** One plinth + winner card. Pure props, no hooks — safe to call from the
 * parent's `.map` over the fixed three-entry RANKS table. */
function PlinthColumn({
  meta,
  place,
  revealed,
  scoreValue,
  glintActive,
  ringActive,
  crownShown,
  sparkActive,
  motionSafe,
  skipActive,
}: PlinthColumnProps): React.JSX.Element {
  /** Entrance flourishes play only under full motion and never mid-skip;
   * the skip is what jumps everything straight to its finished pose. */
  const playEntrance = motionSafe && !skipActive;

  const riseTransition = !revealed
    ? motionSafe
      ? { ...springs.glide, delay: meta.sinkDelay }
      : { duration: 0 }
    : playEntrance
      ? meta.id === "first"
        ? springs.recoil
        : springs.glide
      : { duration: 0 };

  const numeralColor = `color-mix(in oklab, var(--card) 82%, ${meta.tint} 18%)`;
  const avatarBg = `color-mix(in oklab, ${meta.tint} 30%, var(--surface-1))`;
  const avatarColor = `color-mix(in oklab, ${meta.tint} 70%, var(--ink))`;

  return (
    <div
      className="relative flex flex-col items-center"
      style={{ width: COLUMN_W, order: meta.layoutOrder }}
    >
      <div
        className="relative flex items-end justify-center"
        style={{ height: CARD_SLOT_H, marginBottom: CARD_GAP }}
      >
        <AnimatePresence>
          {crownShown && (
            <motion.span
              key="crown"
              aria-hidden
              className="pointer-events-none absolute top-0 left-1/2"
              style={{ marginLeft: -9, color: meta.tint }}
              initial={playEntrance ? { scale: 0, opacity: 0 } : false}
              animate={{ scale: 1, opacity: 1 }}
              exit={
                motionSafe
                  ? {
                      scale: 0,
                      opacity: 0,
                      transition: {
                        duration: durations.fast,
                        ease: easings.exit,
                      },
                    }
                  : { opacity: 0, transition: { duration: 0 } }
              }
              transition={playEntrance ? springs.flick : { duration: 0 }}
            >
              <Crown className="size-[18px]" fill="currentColor" />
            </motion.span>
          )}
        </AnimatePresence>

        {meta.isChampion && (
          <span
            aria-hidden
            className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2"
          >
            <AnimatePresence>
              {motionSafe &&
                sparkActive &&
                SPARKS.map((s, i) => (
                  <motion.span
                    key={i}
                    className="absolute size-[3px] rounded-full"
                    style={{ background: meta.tint }}
                    initial={{ x: 0, y: 0, opacity: 1 }}
                    animate={{ x: s.dx, y: s.dy, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: durations.slow,
                      ease: easings.exit,
                    }}
                  />
                ))}
            </AnimatePresence>
          </span>
        )}

        <AnimatePresence>
          {ringActive && motionSafe && (
            <motion.span
              key="ring"
              aria-hidden
              className="pointer-events-none absolute rounded-full"
              style={{
                left: "50%",
                top: "50%",
                width: RING_D,
                height: RING_D,
                marginLeft: -(RING_D / 2),
                marginTop: -(RING_D / 2),
                border: `2px solid ${meta.tint}`,
              }}
              initial={{ scale: 0.6, opacity: 0.85 }}
              animate={{ scale: 1.6, opacity: 0 }}
              transition={{ duration: durations.slow, ease: easings.exit }}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {revealed && (
            <motion.div
              key="card"
              className="relative flex flex-col items-center gap-1 rounded-2 border border-hairline bg-surface-2 px-2.5 py-2 shadow-raised"
              style={{ width: CARD_W }}
              initial={playEntrance ? { y: CARD_DROP_Y, opacity: 0 } : false}
              animate={{ y: 0, opacity: 1 }}
              exit={{
                opacity: 0,
                transition: motionSafe
                  ? exitFor(durations.base)
                  : { duration: 0 },
              }}
              transition={playEntrance ? springs.snap : { duration: 0 }}
            >
              <span
                aria-hidden
                className="flex size-7 items-center justify-center rounded-full font-mono text-[10px] font-semibold"
                style={{ background: avatarBg, color: avatarColor }}
              >
                {initialsFor(place.name)}
              </span>
              <span className="max-w-full truncate text-center text-[11px] font-medium text-ink">
                {place.name}
              </span>
              <Readout value={scoreValue} size="sm" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <motion.div
        aria-hidden
        className="relative overflow-hidden rounded-t-2"
        style={{
          width: PLINTH_W,
          height: meta.height,
          background: plinthGradient(meta.tint),
        }}
        initial={{ y: PLINTH_SUNK_Y }}
        animate={{ y: revealed ? 0 : PLINTH_SUNK_Y }}
        transition={riseTransition}
      >
        <span
          className="absolute inset-0 flex items-center justify-center font-mono text-lg font-bold"
          style={{ color: numeralColor }}
        >
          {meta.numeral}
        </span>

        <AnimatePresence>
          {glintActive && motionSafe && (
            <motion.span
              key="glint"
              aria-hidden
              className="pointer-events-none absolute"
              style={{
                top: "-10%",
                height: "120%",
                width: GLINT_W,
                transform: "skewX(-20deg)",
                background: SHEEN,
              }}
              initial={{ left: GLINT_HIDDEN_LEFT }}
              animate={{ left: PLINTH_W + 12 }}
              exit={{
                opacity: 0,
                transition: { duration: durations.fast, ease: easings.exit },
              }}
              transition={{ duration: GLINT_SWEEP_S, ease: easings.move }}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

export type PodiumRiseProps = {
  /** Podium cast, ordered first, second, third. @default three built-in names */
  places?: Place[];
  /** Fires once, the moment the reveal ceremony begins. */
  onReveal?: () => void;
  className?: string;
};

/**
 * A three-place podium that reveals backwards — third, then second, then
 * first — because holding the winner back is the whole performance. Each
 * place's plinth rises from below on a spring, its winner card drops in
 * above it, a glint sweeps the plinth face, and the card's score rolls up
 * from zero in a composed Readout. First gets the full treatment: its
 * tallest plinth rises with an overshoot, a crown stamps above the landed
 * card, a light sweep crosses the whole stage, ten fixed sparks fire, and a
 * mono caption flashes who took it — no confetti, this is a results screen.
 * The ceremony is fully skippable: pressing reveal again mid-sequence jumps
 * straight to the finished state instead of trapping the viewer, and AGAIN
 * sinks the plinths back down in forward order, staggered, for another run.
 * Reduced motion: pressing reveal shows all three places at once in their
 * final state with the caption still flashing, and the skip behavior is
 * harmless since nothing is left to skip.
 */
export function PodiumRise({
  places: placesProp,
  onReveal,
  className,
}: PodiumRiseProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const places = placesProp ?? DEFAULT_PLACES;

  const placesByRank: Record<RankId, Place> = {
    first: places[0] ?? DEFAULT_PLACES[0],
    second: places[1] ?? DEFAULT_PLACES[1],
    third: places[2] ?? DEFAULT_PLACES[2],
  };

  const [phase, setPhase] = React.useState<Phase>("idle");
  const [revealed, setRevealed] = React.useState<Record<RankId, boolean>>({
    first: false,
    second: false,
    third: false,
  });
  const [scoreValue, setScoreValue] = React.useState<Record<RankId, number>>({
    first: 0,
    second: 0,
    third: 0,
  });
  const [glintActive, setGlintActive] = React.useState<Record<RankId, boolean>>(
    {
      first: false,
      second: false,
      third: false,
    },
  );
  const [ringActive, setRingActive] = React.useState(false);
  const [crownShown, setCrownShown] = React.useState(false);
  const [sparkActive, setSparkActive] = React.useState(false);
  const [sweepActive, setSweepActive] = React.useState(false);
  const [skipActive, setSkipActive] = React.useState(false);
  const [caption, setCaption] = React.useState<string | null>(null);
  const [announce, setAnnounce] = React.useState("");

  const timersRef = React.useRef<number[]>([]);

  const motionSafeRef = React.useRef(motionSafe);
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  }, [motionSafe]);

  const placesRef = React.useRef(placesByRank);
  React.useEffect(() => {
    placesRef.current = placesByRank;
  });

  const onRevealRef = React.useRef(onReveal);
  React.useEffect(() => {
    onRevealRef.current = onReveal;
  }, [onReveal]);

  React.useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, []);

  const track = (id: number) => {
    timersRef.current.push(id);
  };

  const clearAllTimers = () => {
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current.length = 0;
  };

  const showCaption = (text: string) => {
    setCaption(text);
    track(
      window.setTimeout(() => {
        setCaption(null);
      }, CAPTION_MS),
    );
  };

  const revealRank = (rankId: RankId) => {
    setRevealed((prev) => ({ ...prev, [rankId]: true }));

    setGlintActive((prev) => ({ ...prev, [rankId]: true }));
    track(
      window.setTimeout(() => {
        setGlintActive((prev) => ({ ...prev, [rankId]: false }));
      }, GLINT_SWEEP_MS),
    );

    if (rankId === "second") {
      setRingActive(true);
      track(
        window.setTimeout(() => {
          setRingActive(false);
        }, RING_MS),
      );
    }

    track(
      window.setTimeout(() => {
        setScoreValue((prev) => ({
          ...prev,
          [rankId]: placesRef.current[rankId].score,
        }));
      }, CARD_SETTLE_MS),
    );

    if (rankId === "first") {
      track(
        window.setTimeout(() => {
          setCrownShown(true);
          setSparkActive(true);
          setSweepActive(true);
          showCaption(`${placesRef.current.first.name} takes it`);
          setPhase("revealed");

          track(
            window.setTimeout(() => {
              setSparkActive(false);
            }, SPARK_MS),
          );
          track(
            window.setTimeout(() => {
              setSweepActive(false);
            }, SWEEP_MS),
          );
        }, CARD_SETTLE_MS + POST_LAND_BEAT_MS),
      );
    }
  };

  const startReveal = () => {
    setPhase("revealing");
    setSkipActive(false);
    setAnnounce("Revealing the results.");
    onRevealRef.current?.();

    if (!motionSafeRef.current) {
      setRevealed({ first: true, second: true, third: true });
      setScoreValue({
        first: placesRef.current.first.score,
        second: placesRef.current.second.score,
        third: placesRef.current.third.score,
      });
      setCrownShown(true);
      setPhase("revealed");
      showCaption(`${placesRef.current.first.name} takes it`);
      return;
    }

    revealRank("third");
    track(window.setTimeout(() => revealRank("second"), BEAT_AFTER_THIRD_MS));
    track(
      window.setTimeout(
        () => revealRank("first"),
        BEAT_AFTER_THIRD_MS + BEAT_AFTER_SECOND_MS,
      ),
    );
  };

  const skipToEnd = () => {
    clearAllTimers();
    setSkipActive(true);
    setRevealed({ first: true, second: true, third: true });
    setScoreValue({
      first: placesRef.current.first.score,
      second: placesRef.current.second.score,
      third: placesRef.current.third.score,
    });
    setGlintActive({ first: false, second: false, third: false });
    setRingActive(false);
    setSparkActive(false);
    setSweepActive(false);
    setCrownShown(true);
    setPhase("revealed");
    showCaption(`${placesRef.current.first.name} takes it`);
    setAnnounce(`${placesRef.current.first.name} takes it.`);
  };

  const handleRevealClick = () => {
    if (phase === "idle") startReveal();
    else if (phase === "revealing") skipToEnd();
  };

  const handleReset = () => {
    clearAllTimers();
    setSkipActive(false);
    setCaption(null);
    setSparkActive(false);
    setSweepActive(false);
    setRingActive(false);
    setGlintActive({ first: false, second: false, third: false });
    setCrownShown(false);
    setRevealed({ first: false, second: false, third: false });
    setScoreValue({ first: 0, second: 0, third: 0 });
    setPhase("idle");
    setAnnounce("Podium reset.");
  };

  return (
    <div
      className={cn(
        "inline-flex flex-col items-center gap-3 select-none",
        className,
      )}
    >
      <div
        className="relative overflow-hidden rounded-4 border border-hairline bg-surface-1 shadow-raised"
        style={{ width: STAGE_W, height: STAGE_H }}
      >
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-center gap-3 px-4 pb-3">
          {RANKS.map((meta) => (
            <PlinthColumn
              key={meta.id}
              meta={meta}
              place={placesByRank[meta.id]}
              revealed={revealed[meta.id]}
              scoreValue={scoreValue[meta.id]}
              glintActive={glintActive[meta.id]}
              ringActive={meta.id === "second" && ringActive}
              crownShown={meta.isChampion && crownShown}
              sparkActive={meta.isChampion && sparkActive}
              motionSafe={motionSafe}
              skipActive={skipActive}
            />
          ))}
        </div>

        <AnimatePresence>
          {sweepActive && motionSafe && (
            <motion.span
              key="podium-sweep"
              aria-hidden
              className="pointer-events-none absolute inset-y-0"
              style={{
                width: SWEEP_W,
                transform: "skewX(-20deg)",
                background: SHEEN,
              }}
              initial={{ left: SWEEP_HIDDEN_LEFT }}
              animate={{ left: SWEEP_VISIBLE_LEFT }}
              exit={{
                opacity: 0,
                transition: { duration: durations.fast, ease: easings.exit },
              }}
              transition={{ duration: SWEEP_S, ease: easings.move }}
            />
          )}
        </AnimatePresence>
      </div>

      <div
        className="flex h-4 items-center justify-center overflow-hidden"
        style={{ width: STAGE_W }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {caption && (
            <motion.span
              key={caption}
              className="font-mono text-[11px] tracking-[0.08em] whitespace-nowrap text-ink-2 uppercase"
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
            >
              {caption}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {phase !== "revealed" ? (
        <button
          type="button"
          aria-label="Reveal the results"
          onClick={handleRevealClick}
          className={cn(
            "rounded-2 bg-primary px-4 py-1.5 font-mono text-xs font-semibold tracking-wide text-primary-foreground uppercase shadow-raised transition-[filter] outline-none",
            "hover:brightness-110 active:brightness-95",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
          )}
        >
          reveal
        </button>
      ) : (
        <button
          type="button"
          onClick={handleReset}
          className={cn(
            "rounded-1 font-mono text-xs font-semibold tracking-wide text-ink-3 uppercase underline-offset-4 transition-colors outline-none",
            "hover:text-ink hover:underline",
            "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
          )}
        >
          again
        </button>
      )}

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
