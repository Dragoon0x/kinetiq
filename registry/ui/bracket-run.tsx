"use client";

import * as React from "react";

import { Crown, Play } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Eight harbour-yard entrants, seeded 1-8 in table order. */
const DEFAULT_ENTRANTS = [
  "Basinworks",
  "Fernworks",
  "Drydock Union",
  "Cinder Reach",
  "Tallow & Sons",
  "Nettle Yard",
  "Harborlight",
  "Saltmark Co.",
] as const;

/** Slot box geometry, viewBox px. */
const SLOT_W = 132;
const SLOT_H = 28;
/** Champion slot is a bigger card — same column, its own box. */
const CHAMPION_W = 170;
const CHAMPION_H = 64;

/** Column x, left to right: round 1, semis, final, champion. */
const COL0 = 16;
const COL1 = 212;
const COL2 = 408;
const COL3 = 604;

const CHAMPION_X = COL3;
const CHAMPION_Y = 153;

const VIEW_W = 790;
const VIEW_H = 370;

/** How long a match tenses before its winner is decided. */
const TENSE_MS = 220;
/** Flight duration for the winner's name travelling its connector, seconds
 * and ms kept in sync — the spec asks for "~0.6s". */
const FLIGHT_S = 0.6;
const FLIGHT_MS = FLIGHT_S * 1000;
/** Connector draws in over the same span as the flight it carries. */
const LINK_DRAW_S = FLIGHT_S;
/** Champion sweep + spark hold before the moment settles. */
const CELEBRATE_MS = 1600;

const IDLE_CAPTION = "eight enter, one remains";

/** A slot's occupant, once resolved: the original entrant name and seed. */
type Seed = { name: string; seed: number };

type MatchDef = {
  id: string;
  round: 0 | 1 | 2;
  x: number;
  y0: number;
  y1: number;
  centerY: number;
  /** Round 0 only — indexes into the entrants table. */
  entrantIndex0: number | null;
  entrantIndex1: number | null;
  /** Where this match's winner goes next: another match's slot, or the
   * champion slot. */
  destTo: string;
  destSlot?: 0 | 1;
};

/**
 * The whole bracket, authored as a fixed table — nothing here is measured.
 * Y positions are hand-placed so each round's slot sits at the midpoint of
 * the pair feeding it, which is what keeps the connector lines symmetric.
 */
const MATCHES: readonly MatchDef[] = [
  {
    id: "m0",
    round: 0,
    x: COL0,
    y0: 16,
    y1: 50,
    centerY: 47,
    entrantIndex0: 0,
    entrantIndex1: 1,
    destTo: "s0",
    destSlot: 0,
  },
  {
    id: "m1",
    round: 0,
    x: COL0,
    y0: 108,
    y1: 142,
    centerY: 139,
    entrantIndex0: 2,
    entrantIndex1: 3,
    destTo: "s0",
    destSlot: 1,
  },
  {
    id: "m2",
    round: 0,
    x: COL0,
    y0: 200,
    y1: 234,
    centerY: 231,
    entrantIndex0: 4,
    entrantIndex1: 5,
    destTo: "s1",
    destSlot: 0,
  },
  {
    id: "m3",
    round: 0,
    x: COL0,
    y0: 292,
    y1: 326,
    centerY: 323,
    entrantIndex0: 6,
    entrantIndex1: 7,
    destTo: "s1",
    destSlot: 1,
  },
  {
    id: "s0",
    round: 1,
    x: COL1,
    y0: 33,
    y1: 125,
    centerY: 93,
    entrantIndex0: null,
    entrantIndex1: null,
    destTo: "f0",
    destSlot: 0,
  },
  {
    id: "s1",
    round: 1,
    x: COL1,
    y0: 217,
    y1: 309,
    centerY: 277,
    entrantIndex0: null,
    entrantIndex1: null,
    destTo: "f0",
    destSlot: 1,
  },
  {
    id: "f0",
    round: 2,
    x: COL2,
    y0: 79,
    y1: 263,
    centerY: 185,
    entrantIndex0: null,
    entrantIndex1: null,
    destTo: "champion",
  },
];

/** Fixed play order — every dependency (a match never plays before both of
 * its feeders have) falls out of this sequence for free. */
const MATCH_ORDER: readonly string[] = MATCHES.map((m) => m.id);
const TOTAL_MATCHES = MATCH_ORDER.length;

const MATCH_BY_ID = new Map<string, MatchDef>(MATCHES.map((m) => [m.id, m]));

/** matchId -> [feeder for slot 0, feeder for slot 1]. Derived once from the
 * `destTo`/`destSlot` each match already carries. */
const FEEDER_FOR = new Map<string, [string | null, string | null]>();
for (const m of MATCHES) {
  if (m.destTo === "champion") continue;
  const existing = FEEDER_FOR.get(m.destTo) ?? [null, null];
  FEEDER_FOR.set(
    m.destTo,
    m.destSlot === 1 ? [existing[0], m.id] : [m.id, existing[1]],
  );
}

/**
 * The fixed bracket outcome — which slot (0 = top, 1 = bottom) wins each
 * match. Never rolled: the tournament plays out identically on every visit,
 * which is the only way a reader can follow it.
 */
const OUTCOME = new Map<string, 0 | 1>([
  ["m0", 0],
  ["m1", 1],
  ["m2", 0],
  ["m3", 1],
  ["s0", 0],
  ["s1", 1],
  ["f0", 0],
]);

function destPointOf(matchId: string): { x: number; y: number } {
  const m = MATCH_BY_ID.get(matchId);
  if (!m) return { x: 0, y: 0 };
  if (m.destTo === "champion") {
    return { x: CHAMPION_X, y: CHAMPION_Y + CHAMPION_H / 2 };
  }
  const target = MATCH_BY_ID.get(m.destTo);
  if (!target) return { x: 0, y: 0 };
  const y = m.destSlot === 1 ? target.y1 : target.y0;
  return { x: target.x, y: y + SLOT_H / 2 };
}

type ConnectorDef = {
  id: string;
  matchId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

/** One connector per match, source fixed at its own box, target fixed at
 * wherever its winner goes next. Never touches who actually wins. */
const CONNECTORS: readonly ConnectorDef[] = MATCHES.map((m) => {
  const dest = destPointOf(m.id);
  return {
    id: `c-${m.id}`,
    matchId: m.id,
    x1: m.x + SLOT_W,
    y1: m.centerY,
    x2: dest.x,
    y2: dest.y,
  };
});

/** Smooth cubic with horizontal control handles at the column midpoint. */
function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  return `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
}

/** The entrant (and its seed) occupying one slot of one match — recurses
 * through winners for any round past the first. Pure: depends only on the
 * entrants table and the fixed OUTCOME map, never on runtime state. */
function slotOf(
  matchId: string,
  slot: 0 | 1,
  entrants: readonly string[],
): Seed {
  const m = MATCH_BY_ID.get(matchId);
  if (!m) return { name: "TBD", seed: 0 };
  if (m.round === 0) {
    const idx = (slot === 0 ? m.entrantIndex0 : m.entrantIndex1) ?? 0;
    return {
      name: entrants[idx] ?? DEFAULT_ENTRANTS[idx] ?? `Seed ${idx + 1}`,
      seed: idx + 1,
    };
  }
  const feeders = FEEDER_FOR.get(matchId);
  const feederId = feeders ? feeders[slot] : null;
  if (!feederId) return { name: "TBD", seed: 0 };
  return winnerOf(feederId, entrants);
}

function winnerOf(matchId: string, entrants: readonly string[]): Seed {
  return slotOf(matchId, OUTCOME.get(matchId) ?? 0, entrants);
}

function loserOf(matchId: string, entrants: readonly string[]): Seed {
  return slotOf(matchId, (OUTCOME.get(matchId) ?? 0) === 0 ? 1 : 0, entrants);
}

/** Stagger index (reversed) for a match undoing during reseed. */
function reverseDelay(id: string, drainOrder: readonly string[]): number {
  const idx = drainOrder.indexOf(id);
  if (idx === -1) return 0;
  return (
    (drainOrder.length - 1 - idx) * cascade(Math.max(drainOrder.length, 1))
  );
}

const TAU = Math.PI * 2;
const SPARK_COUNT = 8;
const SPARK_SPREAD = 26;

/** Eight fixed spark vectors fired from the champion slot — deterministic,
 * no Math.random. */
const SPARKS = Array.from({ length: SPARK_COUNT }, (_, i) => {
  const angle = (i / SPARK_COUNT) * TAU - TAU / 4;
  return {
    dx: Math.cos(angle) * SPARK_SPREAD,
    dy: Math.sin(angle) * SPARK_SPREAD,
  };
});

type FlyState = {
  key: number;
  name: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type BracketRunProps = {
  /** The eight entrants, seed order. Fewer than eight are padded from the
   * house defaults; clamped to exactly eight either way. */
  entrants?: string[];
  /** Fires once, the instant the final's winner lands in the champion slot. */
  onChampion?: (name: string) => void;
  className?: string;
};

/**
 * An eight-entrant single-elimination bracket laid out across four fixed
 * columns — four openers, two semis, a final, a champion slot — with every
 * connector drawn from an authored layout table, never measured. "Play the
 * next match" tenses both slots of the next unresolved match on `flick`,
 * decides it from a fixed outcome table (never rolled, so the same bracket
 * plays out the same way on every visit), dims and strikes the loser, and
 * flies the winner's name along its connector on an authored tween while the
 * connector itself draws in behind it, landing with `snap`. The final's
 * winner promotes into the champion slot with a crown stamp, a sweep across
 * the whole bracket, and eight sparks. "play all" clears every remaining
 * match on a `cascade()` stagger; "reseed" drains the bracket back to round
 * one, connectors undrawing in the reverse order they were drawn.
 * Reduced motion: no tension pulses, flights, connector draws, or sweeps —
 * advancing swaps slot state instantly and a winner simply appears in the
 * next round; result and champion captions still update.
 */
export function BracketRun({
  entrants: entrantsProp,
  onChampion,
  className,
}: BracketRunProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const entrants = React.useMemo<string[]>(() => {
    const source = entrantsProp ?? DEFAULT_ENTRANTS;
    return Array.from(
      { length: 8 },
      (_, i) => source[i] ?? DEFAULT_ENTRANTS[i] ?? `Seed ${i + 1}`,
    );
  }, [entrantsProp]);

  const info = React.useMemo(() => {
    const map = new Map<
      string,
      { slot0: Seed; slot1: Seed; winner: Seed; loser: Seed }
    >();
    for (const id of MATCH_ORDER) {
      map.set(id, {
        slot0: slotOf(id, 0, entrants),
        slot1: slotOf(id, 1, entrants),
        winner: winnerOf(id, entrants),
        loser: loserOf(id, entrants),
      });
    }
    return map;
  }, [entrants]);

  const [resolved, setResolved] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [landed, setLanded] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [order, setOrder] = React.useState<string[]>([]);
  const [drainOrder, setDrainOrder] = React.useState<string[]>([]);
  const [tensingId, setTensingId] = React.useState<string | null>(null);
  const [flying, setFlying] = React.useState<FlyState | null>(null);
  const [celebrating, setCelebrating] = React.useState(false);
  const [lastResult, setLastResult] = React.useState<{
    winner: string;
    loser: string;
  } | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [announce, setAnnounce] = React.useState("");

  const timersRef = React.useRef<number[]>([]);
  const flyKeyRef = React.useRef(0);
  const onChampionRef = React.useRef(onChampion);

  React.useEffect(() => {
    onChampionRef.current = onChampion;
  }, [onChampion]);

  React.useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const id of timers) window.clearTimeout(id);
      timers.length = 0;
    };
  }, []);

  const clearAllTimers = () => {
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current.length = 0;
  };

  /** Runs one match end to end: tense, decide, fly, land. Calls `onLanded`
   * once the winner has actually landed (synchronously under reduced
   * motion), so callers can chain the next match. */
  const playMatch = React.useCallback(
    (matchId: string, onLanded?: () => void) => {
      const match = MATCH_BY_ID.get(matchId);
      const seedInfo = info.get(matchId);
      if (!match || !seedInfo) {
        onLanded?.();
        return;
      }
      const isChampionMatch = match.destTo === "champion";
      const winnerName = seedInfo.winner.name;
      const loserName = seedInfo.loser.name;

      const decide = () => {
        setResolved((prev) => new Set(prev).add(matchId));
        setOrder((prev) => [...prev, matchId]);
        setTensingId(null);
        setLastResult({ winner: winnerName, loser: loserName });
        setAnnounce(`${winnerName} over ${loserName}.`);

        const land = () => {
          setLanded((prev) => new Set(prev).add(matchId));
          setFlying(null);
          if (isChampionMatch) {
            onChampionRef.current?.(winnerName);
            setAnnounce(`${winnerName} takes the yard.`);
            if (motionSafe) {
              setCelebrating(true);
              const ct = window.setTimeout(() => {
                setCelebrating(false);
              }, CELEBRATE_MS);
              timersRef.current.push(ct);
            }
          }
          onLanded?.();
        };

        if (motionSafe) {
          const dest = destPointOf(matchId);
          flyKeyRef.current += 1;
          setFlying({
            key: flyKeyRef.current,
            name: winnerName,
            x1: match.x + SLOT_W,
            y1: match.centerY,
            x2: dest.x,
            y2: dest.y,
          });
          const ft = window.setTimeout(land, FLIGHT_MS);
          timersRef.current.push(ft);
        } else {
          land();
        }
      };

      if (motionSafe) {
        setTensingId(matchId);
        const tt = window.setTimeout(decide, TENSE_MS);
        timersRef.current.push(tt);
      } else {
        decide();
      }
    },
    [info, motionSafe],
  );

  const nextMatchId = MATCH_ORDER.find((id) => !resolved.has(id)) ?? null;

  const handleAdvance = () => {
    if (playing || !nextMatchId) return;
    setPlaying(true);
    playMatch(nextMatchId, () => setPlaying(false));
  };

  const handlePlayAll = () => {
    if (playing) return;
    const remaining = MATCH_ORDER.filter((id) => !resolved.has(id));
    if (remaining.length === 0) return;
    setPlaying(true);
    const stepMs = motionSafe
      ? cascade(Math.max(remaining.length, 1)) * 1000
      : 0;

    const runFrom = (index: number) => {
      const id = remaining[index];
      if (id === undefined) {
        setPlaying(false);
        return;
      }
      playMatch(id, () => {
        if (index + 1 < remaining.length) {
          const t = window.setTimeout(() => runFrom(index + 1), stepMs);
          timersRef.current.push(t);
        } else {
          setPlaying(false);
        }
      });
    };
    runFrom(0);
  };

  const handleReseed = () => {
    clearAllTimers();
    setDrainOrder(order);
    setOrder([]);
    setResolved(new Set());
    setLanded(new Set());
    setTensingId(null);
    setFlying(null);
    setCelebrating(false);
    setPlaying(false);
    setLastResult(null);
    setAnnounce("Reseeded. Bracket reset.");
  };

  const championDecided = landed.has("f0");
  const championSeed = info.get("f0")?.winner;
  const progressText = `match ${resolved.size} of ${TOTAL_MATCHES}`;
  const captionText = championDecided
    ? `${championSeed?.name ?? "Champion"} takes the yard`
    : lastResult
      ? `${lastResult.winner} over ${lastResult.loser}`
      : IDLE_CAPTION;
  const captionKey = championDecided
    ? "champion"
    : lastResult
      ? `result-${order.length}`
      : "idle";

  return (
    <div
      className={cn(
        "w-full max-w-3xl rounded-4 border border-hairline bg-surface-1 shadow-raised",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <span className="text-sm font-semibold text-ink">Bracket Run</span>
        <span className="font-mono text-xs text-ink-3 tabular-nums">
          {progressText}
        </span>
      </div>

      <div className="overflow-x-auto px-4 py-5">
        <div
          className="relative shrink-0"
          style={{ width: VIEW_W, height: VIEW_H }}
        >
          <svg
            aria-hidden
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="absolute inset-0 size-full"
          >
            {CONNECTORS.map((c) => {
              const drawn = landed.has(c.matchId);
              const delay = drawn ? 0 : reverseDelay(c.matchId, drainOrder);
              return (
                <ConnectorView
                  key={c.id}
                  connector={c}
                  drawn={drawn}
                  delay={delay}
                  motionSafe={motionSafe}
                />
              );
            })}
          </svg>

          {MATCHES.map((m) => {
            const isResolved = resolved.has(m.id);
            const tense = tensingId === m.id;
            const strikeDelay = reverseDelay(m.id, drainOrder);
            const seed0 = info.get(m.id)?.slot0;
            const seed1 = info.get(m.id)?.slot1;
            const feeders = FEEDER_FOR.get(m.id);
            const filled0 =
              m.round === 0 ? true : landed.has(feeders?.[0] ?? "");
            const filled1 =
              m.round === 0 ? true : landed.has(feeders?.[1] ?? "");
            const winSlot = OUTCOME.get(m.id) ?? 0;
            return (
              <React.Fragment key={m.id}>
                <SlotView
                  x={m.x}
                  y={m.y0}
                  seed={seed0?.seed ?? 0}
                  name={seed0?.name ?? "—"}
                  filled={filled0}
                  tense={tense}
                  resolved={isResolved}
                  isWinner={isResolved && winSlot === 0}
                  strikeDelay={strikeDelay}
                  motionSafe={motionSafe}
                />
                <SlotView
                  x={m.x}
                  y={m.y1}
                  seed={seed1?.seed ?? 0}
                  name={seed1?.name ?? "—"}
                  filled={filled1}
                  tense={tense}
                  resolved={isResolved}
                  isWinner={isResolved && winSlot === 1}
                  strikeDelay={strikeDelay}
                  motionSafe={motionSafe}
                />
              </React.Fragment>
            );
          })}

          <ChampionSlotView
            x={CHAMPION_X}
            y={CHAMPION_Y}
            w={CHAMPION_W}
            h={CHAMPION_H}
            seed={championSeed?.seed ?? 0}
            name={championSeed?.name ?? "—"}
            filled={championDecided}
            celebrating={celebrating}
            motionSafe={motionSafe}
          />

          <AnimatePresence>
            {motionSafe && celebrating && (
              <motion.div
                aria-hidden
                className="pointer-events-none absolute inset-y-0"
                style={{
                  width: VIEW_W * 0.4,
                  background:
                    "linear-gradient(100deg, transparent, color-mix(in oklab, var(--primary) 55%, transparent), transparent)",
                }}
                initial={{ x: -VIEW_W * 0.5, opacity: 0 }}
                animate={{ x: VIEW_W * 1.05, opacity: [0, 1, 0] }}
                exit={{ opacity: 0 }}
                transition={{
                  x: { duration: 0.7, ease: easings.move },
                  opacity: {
                    duration: 0.7,
                    ease: easings.move,
                    times: [0, 0.5, 1],
                  },
                }}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {motionSafe && flying && (
              <FlyingChip key={flying.key} flying={flying} />
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-4 py-3">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={captionKey}
            className="font-mono text-xs text-ink-3"
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

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handlePlayAll}
            disabled={playing || !nextMatchId}
            className="text-label text-ink-3 transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-40"
          >
            play all
          </button>
          <button
            type="button"
            onClick={handleReseed}
            disabled={order.length === 0}
            className="text-label text-ink-3 transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-40"
          >
            reseed
          </button>
          <button
            type="button"
            aria-label="Play the next match"
            onClick={handleAdvance}
            disabled={playing || !nextMatchId}
            className="inline-flex items-center gap-1.5 rounded-2 bg-primary px-3 py-1.5 font-mono text-xs font-semibold tracking-wide text-primary-foreground uppercase shadow-raised transition-opacity disabled:pointer-events-none disabled:opacity-40"
          >
            <Play aria-hidden className="size-3.5" />
            advance
          </button>
        </div>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}

type ConnectorViewProps = {
  connector: ConnectorDef;
  drawn: boolean;
  delay: number;
  motionSafe: boolean;
};

function ConnectorView({
  connector,
  drawn,
  delay,
  motionSafe,
}: ConnectorViewProps) {
  return (
    <motion.path
      d={bezierPath(connector.x1, connector.y1, connector.x2, connector.y2)}
      fill="none"
      stroke={drawn ? "var(--primary)" : "var(--hairline-strong)"}
      strokeWidth={2}
      strokeLinecap="round"
      style={{ transition: "stroke 240ms ease" }}
      initial={false}
      animate={{ pathLength: drawn ? 1 : 0 }}
      transition={
        motionSafe
          ? {
              duration: LINK_DRAW_S,
              ease: drawn ? easings.enter : easings.exit,
              delay: drawn ? 0 : delay,
            }
          : { duration: 0 }
      }
    />
  );
}

type SlotViewProps = {
  x: number;
  y: number;
  seed: number;
  name: string;
  filled: boolean;
  tense: boolean;
  resolved: boolean;
  isWinner: boolean;
  strikeDelay: number;
  motionSafe: boolean;
};

function SlotView({
  x,
  y,
  seed,
  name,
  filled,
  tense,
  resolved,
  isWinner,
  strikeDelay,
  motionSafe,
}: SlotViewProps) {
  const isLoser = resolved && filled && !isWinner;
  const strikeTransition = motionSafe
    ? { duration: durations.base, ease: easings.enter }
    : { duration: 0 };
  const strikeExit = motionSafe
    ? { duration: durations.fast, ease: easings.exit, delay: strikeDelay }
    : { duration: 0 };

  return (
    <motion.div
      className="absolute flex items-center gap-1.5 overflow-hidden rounded-2 border border-hairline bg-surface-1 px-2"
      style={{ left: x, top: y, width: SLOT_W, height: SLOT_H }}
      initial={false}
      animate={{ scale: tense ? 1.05 : 1 }}
      transition={motionSafe ? springs.flick : { duration: 0 }}
    >
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-1 bg-accent font-mono text-[9px] text-ink-2 tabular-nums transition-opacity",
          !filled && "opacity-0",
        )}
      >
        {filled ? seed : ""}
      </span>
      <span className="relative flex-1 truncate">
        {/* `initial={false}` on the group means a round-1 (opening round)
            slot — filled from the very first render — never plays the
            landing pop. Only a slot that actually transitions from "—" to a
            name, later, gets the bounce. */}
        <AnimatePresence initial={false}>
          {filled ? (
            <motion.span
              key="name"
              initial={motionSafe ? { scale: 0.85, opacity: 0 } : false}
              animate={{ scale: 1, opacity: 1 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
              style={{ display: "inline-block" }}
              className={cn(
                "text-xs",
                isLoser && "text-ink-3",
                isWinner && "font-semibold text-ink",
                !resolved && "text-ink-2",
              )}
            >
              {name}
            </motion.span>
          ) : (
            <motion.span
              key="tbd"
              initial={false}
              style={{ display: "inline-block" }}
              className="text-xs text-ink-3 opacity-40"
            >
              —
            </motion.span>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {isLoser && (
            <motion.span
              aria-hidden
              className="absolute top-1/2 left-0 h-px w-full bg-ink-3"
              style={{ originX: 0 }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              exit={{ scaleX: 0, transition: strikeExit }}
              transition={strikeTransition}
            />
          )}
        </AnimatePresence>
      </span>
    </motion.div>
  );
}

type ChampionSlotViewProps = {
  x: number;
  y: number;
  w: number;
  h: number;
  seed: number;
  name: string;
  filled: boolean;
  celebrating: boolean;
  motionSafe: boolean;
};

function ChampionSlotView({
  x,
  y,
  w,
  h,
  seed,
  name,
  filled,
  celebrating,
  motionSafe,
}: ChampionSlotViewProps) {
  return (
    <div
      className="absolute flex flex-col items-center justify-center gap-1.5 overflow-hidden rounded-3 border-2 bg-surface-1 px-3 text-center transition-colors"
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
        borderColor: filled ? "var(--primary)" : "var(--hairline-strong)",
      }}
    >
      <span className="flex items-center gap-1">
        {filled && (
          <motion.span
            initial={motionSafe ? { scale: 0, rotate: -20 } : false}
            animate={{ scale: 1, rotate: 0 }}
            transition={motionSafe ? springs.flick : { duration: 0 }}
          >
            <Crown
              aria-hidden
              className="size-3.5"
              style={{ color: "var(--primary)" }}
            />
          </motion.span>
        )}
        <span
          className={cn(
            "font-mono text-[10px] tracking-wide uppercase",
            filled ? "text-ink" : "text-ink-3",
          )}
        >
          champion
        </span>
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            "flex size-4 items-center justify-center rounded-1 bg-accent font-mono text-[9px] text-ink-2 tabular-nums transition-opacity",
            !filled && "opacity-0",
          )}
        >
          {filled ? seed : ""}
        </span>
        <span
          className={cn(
            "truncate text-sm font-semibold transition-colors",
            filled ? "text-ink" : "text-ink-3 opacity-40",
          )}
        >
          {filled ? name : "—"}
        </span>
      </span>

      <AnimatePresence>
        {motionSafe && celebrating && (
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-1/2"
          >
            {SPARKS.map((s, i) => (
              <motion.span
                key={i}
                className="absolute size-[3px] rounded-full bg-signal"
                initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{ x: s.dx, y: s.dy, opacity: 0 }}
                transition={{ duration: durations.slow, ease: easings.exit }}
              />
            ))}
          </span>
        )}
      </AnimatePresence>
    </div>
  );
}

type FlyingChipProps = { flying: FlyState };

/** A copy of the winner's name, tweened along an authored (never measured)
 * x/y path from its match to wherever it lands next. */
function FlyingChip({ flying }: FlyingChipProps) {
  const mx = (flying.x1 + flying.x2) / 2;
  const my = (flying.y1 + flying.y2) / 2;
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute z-10"
      style={{ left: 0, top: 0 }}
      initial={{ x: flying.x1, y: flying.y1 }}
      animate={{
        x: [flying.x1, mx, flying.x2],
        y: [flying.y1, my, flying.y2],
      }}
      exit={{
        opacity: 0,
        transition: { duration: durations.fast, ease: easings.exit },
      }}
      transition={{
        duration: FLIGHT_S,
        ease: easings.move,
        times: [0, 0.5, 1],
      }}
    >
      <span
        className="block -translate-x-1/2 -translate-y-1/2 truncate rounded-1 bg-primary px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary-foreground shadow-raised"
        style={{ maxWidth: SLOT_W }}
      >
        {flying.name}
      </span>
    </motion.div>
  );
}
