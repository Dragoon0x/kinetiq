"use client";

import * as React from "react";

import { Lock, Waves } from "lucide-react";
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

const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, value));

/** A set is always five — the fifth slot is the whole premise. */
const SLOT_COUNT = 5;
const SLOT_INDICES = Array.from({ length: SLOT_COUNT }, (_, i) => i);
const CONNECTOR_COUNT = SLOT_COUNT - 1;

/** Mini-card + connector geometry, px. */
const CARD_W = 58;
const CARD_H = 80;
const CONNECTOR_W = 16;

/** How far above rest the dropping card starts, and how far the pulled card
 * retreats on the way out — bigger than a standard UI enter, this is a
 * physical drop, not a menu fade. */
const CARD_DROP_Y = -34;
const CARD_EXIT_Y = -18;

/** The neighbour's tiny "make room" bump and the completion lift. Both are
 * three-keyframe bounces, so both are tweens with `times`, never springs. */
const NUDGE_PX = 3;
const NUDGE_DELAY_S = 0.12;
const LIFT_PX = 4;

/** The connector waits for its card to mostly land before it draws. */
const CONNECTOR_DRAW_DELAY_S = 0.15;

/** Completion waits one beat after the fifth card lands before the cascade
 * fires, so the payoff reads as a reaction, not a pile-up. */
const POST_LAND_MS = 340;
const CAPTION_MS = 1400;
const SPARK_MS = 550;
const SHEEN_S = 0.5;
const PULSE_S = 0.4;

const CARD_CASCADE_STEP = cascade(SLOT_COUNT);
const CONNECTOR_CASCADE_STEP = cascade(CONNECTOR_COUNT);
const SHEEN_TOTAL_MS =
  Math.round((SLOT_COUNT - 1) * CARD_CASCADE_STEP * 1000) + SHEEN_S * 1000;
const PULSE_TOTAL_MS =
  Math.round((CONNECTOR_COUNT - 1) * CONNECTOR_CASCADE_STEP * 1000) +
  PULSE_S * 1000;

/** Ten fixed spark vectors fanning from the bonus panel — trig, not chance. */
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

/** Every card in the set shares one tint — this is a set, not a rarity pull. */
const CARD_FILL = "color-mix(in oklab, var(--accent) 16%, var(--card))";
const SHEEN_GRADIENT =
  "linear-gradient(115deg, transparent, color-mix(in oklab, var(--card) 70%, transparent), transparent)";
const PANEL_UNLOCKED_BG =
  "color-mix(in oklab, var(--success) 16%, var(--card))";
const PANEL_UNLOCKED_BORDER =
  "color-mix(in oklab, var(--success) 45%, transparent)";

export type SetCard = {
  id: string;
  name: string;
  rank: string;
};

const DEFAULT_CARDS = [
  { id: "tide-chart", name: "Tide Chart", rank: "01" },
  { id: "current-log", name: "Current Log", rank: "02" },
  { id: "reef-line", name: "Reef Line", rank: "03" },
  { id: "depth-gauge", name: "Depth Gauge", rank: "04" },
  { id: "abyss-mark", name: "Abyss Mark", rank: "05" },
] as const;

/** Literal-index tuple read — always defined — guards every variable-indexed
 * lookup below without a raw fallback at each call site. */
const defaultCardAt = (i: number): SetCard =>
  DEFAULT_CARDS[i] ?? DEFAULT_CARDS[0];

type Nudge = { index: number; token: number };
type Caption = { text: string; tone: "complete" | "broken" };

/** The staggered light sweep a card gets during the completion cascade. Pure
 * props, no hooks — safe to invoke from the row's index loop. */
function CardFoilSheen({ delay }: { delay: number }): React.JSX.Element {
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 w-1/3"
      style={{ skewX: -14, background: SHEEN_GRADIENT }}
      initial={{ x: "-160%" }}
      animate={{ x: "420%" }}
      transition={{ duration: 0.5, ease: easings.linear, delay }}
    />
  );
}

type ConnectorProps = {
  lit: boolean;
  pulseActive: boolean;
  pulseDelay: number;
  motionSafe: boolean;
};

/** The thin link between two adjacent slots. `lit` alone drives both the
 * draw (ADD) and the going-dark (REMOVE) — no separate state needed. */
function Connector({
  lit,
  pulseActive,
  pulseDelay,
  motionSafe,
}: ConnectorProps): React.JSX.Element {
  return (
    <div
      aria-hidden
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: CONNECTOR_W, height: CARD_H }}
    >
      <motion.span
        className="h-[2px] w-full origin-left rounded-full"
        style={{ background: "var(--accent-bright)" }}
        initial={false}
        animate={{ scaleX: lit ? 1 : 0, opacity: lit ? 1 : 0 }}
        transition={
          motionSafe
            ? {
                duration: durations.base,
                ease: lit ? easings.enter : easings.exit,
                delay: lit ? CONNECTOR_DRAW_DELAY_S : 0,
              }
            : { duration: 0 }
        }
      />
      {pulseActive && lit && motionSafe && (
        <motion.span
          className="absolute inset-x-0 h-[2px] rounded-full bg-success"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{
            duration: PULSE_S,
            times: [0, 0.4, 1],
            ease: easings.move,
            delay: pulseDelay,
          }}
        />
      )}
    </div>
  );
}

type CardSlotProps = {
  card: SetCard;
  placed: boolean;
  motionSafe: boolean;
  isNudging: boolean;
  nudgeToken: number;
  sheenActive: boolean;
  cascadeDelay: number;
};

/** One slot: an always-present dashed frame with a greyed silhouette, plus
 * the placed card mounted over it through `AnimatePresence` so arriving and
 * leaving get their own honest transitions. Pure props, no hooks — safe to
 * call from the row's index loop; nudge and lift replay via a `key` remount
 * rather than a motion value, since each is a one-shot three-keyframe tween. */
function CardSlot({
  card,
  placed,
  motionSafe,
  isNudging,
  nudgeToken,
  sheenActive,
  cascadeDelay,
}: CardSlotProps): React.JSX.Element {
  return (
    <div className="relative" style={{ width: CARD_W, height: CARD_H }}>
      <div
        aria-hidden={placed || undefined}
        className={cn(
          "absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-2 border border-dashed border-hairline-strong px-1 text-center",
          motionSafe && "transition-opacity duration-300",
          placed ? "opacity-0" : "opacity-100",
        )}
      >
        <Waves aria-hidden className="size-5 text-ink-3" />
        <span className="font-mono text-[9px] leading-tight text-ink-3">
          {card.name}
        </span>
      </div>

      <AnimatePresence initial={false}>
        {placed && (
          <motion.div
            key="card"
            className="absolute inset-0"
            initial={motionSafe ? { y: CARD_DROP_Y, opacity: 0 } : false}
            animate={{ y: 0, opacity: 1 }}
            exit={
              motionSafe
                ? {
                    y: CARD_EXIT_Y,
                    opacity: 0,
                    transition: exitFor(durations.base),
                  }
                : { opacity: 0, transition: { duration: 0 } }
            }
            transition={motionSafe ? springs.glide : { duration: 0 }}
          >
            <motion.div
              key={isNudging ? `nudge-${nudgeToken}` : "nudge-idle"}
              className="size-full"
              initial={{ x: 0 }}
              animate={
                isNudging && motionSafe ? { x: [0, NUDGE_PX, 0] } : { x: 0 }
              }
              transition={
                isNudging && motionSafe
                  ? {
                      duration: durations.fast,
                      times: [0, 0.5, 1],
                      ease: easings.move,
                      delay: NUDGE_DELAY_S,
                    }
                  : { duration: 0 }
              }
            >
              <motion.div
                key={sheenActive ? "lift-active" : "lift-idle"}
                className="size-full"
                initial={{ y: 0 }}
                animate={
                  sheenActive && motionSafe ? { y: [0, -LIFT_PX, 0] } : { y: 0 }
                }
                transition={
                  sheenActive && motionSafe
                    ? {
                        duration: SHEEN_S,
                        times: [0, 0.4, 1],
                        ease: easings.move,
                        delay: cascadeDelay,
                      }
                    : { duration: 0 }
                }
              >
                <div
                  className="relative flex size-full flex-col items-center justify-between overflow-hidden rounded-2 border p-1.5 text-center"
                  style={{
                    borderColor: "var(--accent-bright)",
                    background: CARD_FILL,
                  }}
                >
                  <Waves
                    aria-hidden
                    className="mt-1 size-5"
                    style={{ color: "var(--accent-bright)" }}
                  />
                  <span className="text-[10px] font-medium text-ink">
                    {card.name}
                  </span>
                  <span
                    className="absolute top-1 right-1 rounded-full px-1 py-px font-mono text-[8px] font-bold text-ink-2"
                    style={{
                      background:
                        "color-mix(in oklab, var(--card) 55%, transparent)",
                    }}
                  >
                    {card.rank}
                  </span>
                  {sheenActive && motionSafe && (
                    <CardFoilSheen delay={cascadeDelay} />
                  )}
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export type SetCompleteProps = {
  /** The set's five cards. @default five built-in TIDEWATER cards */
  cards?: SetCard[];
  /** What the completed set grants. @default "+15% morning throughput" */
  bonus?: string;
  /** How many slots begin filled, left to right. @default 3 */
  start?: number;
  /** Fires every time the fifth card lands. */
  onComplete?: () => void;
  className?: string;
};

/**
 * Five slots, filled in fixed order: each ADD drops the next card into its
 * frame on `glide`, solidifies the dashed outline into a border, gives its
 * placed neighbour a small nudge, rolls the header count through a composed
 * `Readout`, and draws a thin connector back to the card before it. Empty
 * frames stay dashed and greyed on purpose — seeing exactly what is missing
 * is the whole pull of collecting. The fifth card tips the set over: every
 * connector cascades a pulse, each card lifts under a staggered foil sheen,
 * and the SET BONUS panel breaks its lock, fills with colour, brightens, and
 * springs on `recoil` while ten fixed sparks fire and a mono caption flashes
 * "SET COMPLETE". "Break the set" pulls the last card back out, snaps the
 * bonus back under its lock on `snap`, and darkens the connectors with a
 * muted "set broken" caption — the loss has to read as clearly as the gain,
 * or completing the set never meant anything.
 * Reduced motion: no drops, nudges, connector draws, sheens, or sparks —
 * placing a card fills its frame instantly, and completion swaps the bonus
 * panel straight to its active state with the caption still shown.
 */
export function SetComplete({
  cards: cardsProp,
  bonus = "+15% morning throughput",
  start = 3,
  onComplete,
  className,
}: SetCompleteProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const cards = React.useMemo(
    () =>
      Array.from(
        { length: SLOT_COUNT },
        (_, i) => cardsProp?.[i] ?? defaultCardAt(i),
      ),
    [cardsProp],
  );
  const cardAt = (i: number): SetCard => cards[i] ?? defaultCardAt(i);

  const [placedCount, setPlacedCount] = React.useState(() =>
    clamp(Math.round(start), 0, SLOT_COUNT),
  );
  const [nudge, setNudge] = React.useState<Nudge | null>(null);
  const [sparkActive, setSparkActive] = React.useState(false);
  const [sheenActive, setSheenActive] = React.useState(false);
  const [pulseActive, setPulseActive] = React.useState(false);
  const [caption, setCaption] = React.useState<Caption | null>(null);
  const [announce, setAnnounce] = React.useState("");

  const nudgeCounterRef = React.useRef(0);
  const celebrationTimersRef = React.useRef<number[]>([]);
  const captionTimerRef = React.useRef<number | null>(null);
  const onCompleteRef = React.useRef(onComplete);

  React.useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Every timer this component owns, torn down on unmount. The array is
  // aliased by reference here, not copied — cleanup sees whatever is
  // currently pending, since entries are pushed and cleared in place.
  React.useEffect(() => {
    const celebration = celebrationTimersRef.current;
    return () => {
      for (const t of celebration) window.clearTimeout(t);
      if (captionTimerRef.current !== null)
        window.clearTimeout(captionTimerRef.current);
    };
  }, []);

  const isComplete = placedCount === SLOT_COUNT;

  const clearCelebrationTimers = () => {
    for (const t of celebrationTimersRef.current) window.clearTimeout(t);
    celebrationTimersRef.current.length = 0;
  };

  const showCaption = (text: string, tone: Caption["tone"]) => {
    setCaption({ text, tone });
    if (captionTimerRef.current !== null)
      window.clearTimeout(captionTimerRef.current);
    captionTimerRef.current = window.setTimeout(() => {
      captionTimerRef.current = null;
      setCaption(null);
    }, CAPTION_MS);
  };

  const triggerCompletion = () => {
    onCompleteRef.current?.();
    if (!motionSafe) {
      showCaption("SET COMPLETE", "complete");
      return;
    }
    clearCelebrationTimers();
    const landT = window.setTimeout(() => {
      setSparkActive(true);
      setSheenActive(true);
      setPulseActive(true);
      showCaption("SET COMPLETE", "complete");

      const sparkT = window.setTimeout(() => setSparkActive(false), SPARK_MS);
      celebrationTimersRef.current.push(sparkT);
      const sheenT = window.setTimeout(
        () => setSheenActive(false),
        SHEEN_TOTAL_MS,
      );
      celebrationTimersRef.current.push(sheenT);
      const pulseT = window.setTimeout(
        () => setPulseActive(false),
        PULSE_TOTAL_MS,
      );
      celebrationTimersRef.current.push(pulseT);
    }, POST_LAND_MS);
    celebrationTimersRef.current.push(landT);
  };

  const triggerBreak = () => {
    clearCelebrationTimers();
    setSparkActive(false);
    setSheenActive(false);
    setPulseActive(false);
    showCaption("set broken", "broken");
  };

  const handleAdd = () => {
    if (placedCount >= SLOT_COUNT) return;
    const index = placedCount;
    const card = cardAt(index);
    const next = index + 1;

    if (motionSafe && index > 0) {
      nudgeCounterRef.current += 1;
      setNudge({ index: index - 1, token: nudgeCounterRef.current });
    }

    setPlacedCount(next);
    setAnnounce(`${card.name} placed. ${next} of ${SLOT_COUNT}.`);
    if (next === SLOT_COUNT) triggerCompletion();
  };

  const handleRemove = () => {
    if (placedCount <= 0) return;
    const index = placedCount - 1;
    const card = cardAt(index);
    const wasComplete = placedCount === SLOT_COUNT;
    const next = index;

    setPlacedCount(next);
    setAnnounce(`${card.name} removed. ${next} of ${SLOT_COUNT}.`);
    if (wasComplete) triggerBreak();
  };

  return (
    <div
      role="group"
      aria-label="Tidewater set"
      className={cn(
        "w-full max-w-sm rounded-4 border border-hairline bg-surface-1 p-5",
        className,
      )}
    >
      <div className="flex items-baseline gap-1.5">
        <span className="text-label text-ink-3">tidewater set</span>
        <span aria-hidden className="text-label text-ink-3">
          ·
        </span>
        <Readout
          value={placedCount}
          format={(v) => `${v} of ${SLOT_COUNT}`}
          size="sm"
          className="text-ink-2"
        />
      </div>

      <div className="mt-4 flex items-center justify-center">
        {SLOT_INDICES.map((index) => {
          const card = cardAt(index);
          const placed = index < placedCount;
          const isNudging = nudge !== null && nudge.index === index;
          return (
            <React.Fragment key={index}>
              <CardSlot
                card={card}
                placed={placed}
                motionSafe={motionSafe}
                isNudging={isNudging}
                nudgeToken={nudge?.token ?? 0}
                sheenActive={sheenActive}
                cascadeDelay={index * CARD_CASCADE_STEP}
              />
              {index < SLOT_COUNT - 1 && (
                <Connector
                  lit={placedCount > index + 1}
                  pulseActive={pulseActive}
                  pulseDelay={index * CONNECTOR_CASCADE_STEP}
                  motionSafe={motionSafe}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      <motion.div
        className={cn(
          "relative mt-4 flex items-center gap-3 overflow-hidden rounded-3 border border-hairline-strong bg-surface-2 p-3",
          motionSafe && "transition-colors duration-300",
        )}
        style={
          isComplete
            ? {
                background: PANEL_UNLOCKED_BG,
                borderColor: PANEL_UNLOCKED_BORDER,
              }
            : undefined
        }
        animate={{ scale: isComplete ? 1 : 0.97 }}
        transition={
          motionSafe
            ? isComplete
              ? springs.recoil
              : springs.snap
            : { duration: 0 }
        }
      >
        <span className="relative flex size-8 shrink-0 items-center justify-center">
          <AnimatePresence initial={false}>
            {!isComplete && (
              <motion.span
                key="lock"
                className="absolute inset-0 flex items-center justify-center"
                initial={motionSafe ? { scale: 0.5, opacity: 0 } : false}
                animate={{ scale: 1, opacity: 1 }}
                exit={
                  motionSafe
                    ? {
                        opacity: 0,
                        y: 8,
                        rotate: 24,
                        transition: exitFor(durations.base),
                      }
                    : { opacity: 0, transition: { duration: 0 } }
                }
                transition={motionSafe ? springs.snap : { duration: 0 }}
              >
                <Lock aria-hidden className="size-4 text-ink-3" />
              </motion.span>
            )}
          </AnimatePresence>
        </span>

        <div className="flex min-w-0 flex-col gap-0.5">
          <span
            className={cn(
              "text-label",
              motionSafe && "transition-colors duration-300",
              isComplete ? "text-success" : "text-ink-3",
            )}
          >
            set bonus
          </span>
          <span
            className={cn(
              "truncate text-sm font-medium",
              motionSafe && "transition-colors duration-300",
              isComplete ? "text-ink" : "text-ink-3",
            )}
          >
            {bonus}
          </span>
        </div>

        {sparkActive && motionSafe && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            {SPARKS.map((s, i) => (
              <motion.span
                key={i}
                className="absolute size-1 rounded-full bg-success"
                initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{ x: s.dx, y: s.dy, opacity: 0 }}
                transition={{ duration: durations.slow, ease: easings.exit }}
              />
            ))}
          </span>
        )}
      </motion.div>

      <div
        aria-hidden
        className="mt-2 flex h-4 items-center justify-center overflow-hidden"
      >
        <AnimatePresence mode="wait" initial={false}>
          {caption && (
            <motion.span
              key={caption.text}
              className={cn(
                "font-mono text-[11px] tracking-[0.08em] whitespace-nowrap uppercase",
                caption.tone === "complete" ? "text-success" : "text-ink-3",
              )}
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
              {caption.text}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleRemove}
          disabled={placedCount <= 0}
          className={cn(
            "rounded-1 px-1.5 py-1 font-mono text-[11px] text-ink-3 underline decoration-hairline-strong underline-offset-2 transition-colors outline-none",
            "hover:text-ink-2",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
            placedCount <= 0 && "pointer-events-none opacity-40",
          )}
        >
          break the set
        </button>

        <button
          type="button"
          aria-label="Add the next card"
          onClick={handleAdd}
          disabled={placedCount >= SLOT_COUNT}
          className={cn(
            "rounded-2 bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-raised transition-[filter] outline-none",
            "hover:brightness-110 active:brightness-95",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
            placedCount >= SLOT_COUNT && "pointer-events-none opacity-40",
          )}
        >
          add
        </button>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
