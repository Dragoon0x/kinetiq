"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { clamp } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

export type TerritoryGridProps = {
  /** Board columns, clamped 5–9. @default 7 */
  cols?: number;
  /** Board rows, clamped 4–7. @default 5 */
  rows?: number;
  /** Fires once per claim that captures at least one enemy tile. */
  onCapture?: (count: number) => void;
  className?: string;
};

type Owner = "neutral" | "yours" | "theirs";
type Side = "yours" | "theirs";
type FlipStage = "idle" | "closing" | "opening";
type Direction = "up" | "right" | "down" | "left";

type Neighbor = { direction: Direction; index: number };

type TileRuntime = {
  /** Rendered colour — swaps to the logical owner exactly at the flip midpoint. */
  displayOwner: Owner;
  flipStage: FlipStage;
  rippleKey: number;
  rippleOrder: number;
  burstKey: number;
  contestedKey: number;
  contestedDirections: Direction[];
};

const MIN_COLS = 5;
const MAX_COLS = 9;
const DEFAULT_COLS = 7;
const MIN_ROWS = 4;
const MAX_ROWS = 7;
const DEFAULT_ROWS = 5;
const MAX_TILES = MAX_COLS * MAX_ROWS;

/** The beat before the opponent answers a claim. */
const OPPONENT_DELAY_MS = 600;
/** How long a "captured" caption holds before yielding to the resting one. */
const CAPTION_HOLD_MS = 1100;
/** Ripple stagger, drawn from the house cascade table for a 4-neighbour wave. */
const RIPPLE_STEP = cascade(4);

const EMPTY_DIRECTIONS: Direction[] = [];

const OPPOSITE_DIRECTION: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

const EDGE_CLASS: Record<Direction, string> = {
  up: "inset-x-0 top-0 h-[3px]",
  right: "inset-y-0 right-0 w-[3px]",
  down: "inset-x-0 bottom-0 h-[3px]",
  left: "inset-y-0 left-0 w-[3px]",
};

/** Four fixed cardinal offsets a capture's sparks throw toward. */
const CAPTURE_SPARK_VECTORS = [
  { dx: 0, dy: -12 },
  { dx: 12, dy: 0 },
  { dx: 0, dy: 12 },
  { dx: -12, dy: 0 },
] as const;

const ownerAt = (owners: Owner[], index: number): Owner =>
  owners[index] ?? "neutral";

const opposite = (side: Side): Side => (side === "yours" ? "theirs" : "yours");

const colorFor = (owner: Owner): string =>
  owner === "yours"
    ? "var(--primary)"
    : owner === "theirs"
      ? "var(--warning, #b45309)"
      : "var(--color-surface-2)";

/** Up to four in-bounds orthogonal neighbours, always in up/right/down/left order. */
function neighborsOf(index: number, cols: number, rows: number): Neighbor[] {
  const col = index % cols;
  const row = Math.floor(index / cols);
  const result: Neighbor[] = [];
  if (row > 0) result.push({ direction: "up", index: index - cols });
  if (col < cols - 1) result.push({ direction: "right", index: index + 1 });
  if (row < rows - 1) result.push({ direction: "down", index: index + cols });
  if (col > 0) result.push({ direction: "left", index: index - 1 });
  return result;
}

function isAdjacentToSide(
  index: number,
  owners: Owner[],
  side: Side,
  cols: number,
  rows: number,
): boolean {
  return neighborsOf(index, cols, rows).some(
    (n) => ownerAt(owners, n.index) === side,
  );
}

/** Fixed opening position: your corner top-left, their corner bottom-right. */
function makeOpeningOwners(cols: number, rows: number): Owner[] {
  const total = cols * rows;
  return Array.from({ length: total }, (_, i) => {
    if (i === 0) return "yours";
    if (i === total - 1) return "theirs";
    return "neutral";
  });
}

function makeTileRuntime(owners: Owner[]): TileRuntime[] {
  return owners.map((owner) => ({
    displayOwner: owner,
    flipStage: "idle",
    rippleKey: 0,
    rippleOrder: 0,
    burstKey: 0,
    contestedKey: 0,
    contestedDirections: [],
  }));
}

/**
 * The opponent's fixed reading order: starting from its home row and working
 * toward yours, each row alternates direction (a boustrophedon) beginning
 * nearest its own corner. Pure function of board size, so it never depends on
 * how the match has actually gone.
 */
function opponentOrderFor(cols: number, rows: number): number[] {
  const order: number[] = [];
  for (let r = rows - 1; r >= 0; r -= 1) {
    const stepFromBottom = rows - 1 - r;
    const rightToLeft = stepFromBottom % 2 === 0;
    for (let c = 0; c < cols; c += 1) {
      const col = rightToLeft ? cols - 1 - c : c;
      order.push(r * cols + col);
    }
  }
  return order;
}

/**
 * A 7×5 board (clamped 5–9 columns, 4–7 rows) where two sides claim tiles
 * outward from fixed opposite corners. Every neutral tile touching one of
 * your tiles is a real button — claiming it chains two 2-keyframe scaleX
 * tweens with the colour swapped at the midpoint, ripples a staggered scale
 * pulse into its neighbours, and opens the tiles beyond it as the new
 * frontier. The opponent replies after a ~600ms beat by working a fixed
 * reading-order list of tiles outward from its own corner, claiming the
 * first neutral one it can reach — never a coin flip, so the same sequence
 * of your choices always draws the same reply. A claim that fully encloses
 * an enemy tile on all four sides flips it with a bigger ring-and-spark
 * reaction and a "captured" caption, and an opponent claim landing beside
 * one of your tiles flashes the shared edge on both sides of the seam. Once
 * every tile is claimed the fuller side sweeps the board in its colour and
 * "new board" restores the fixed opening position.
 *
 * Reduced motion: tiles swap colour instantly with no flip, ripple, sweep,
 * or sparks, and captures land instantly with only the caption.
 */
export function TerritoryGrid({
  cols = DEFAULT_COLS,
  rows = DEFAULT_ROWS,
  onCapture,
  className,
}: TerritoryGridProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  // Board size is captured once at mount — the game's internal arrays are
  // sized to it, so it is a starting condition, not a live prop to track.
  const [dims] = React.useState(() => ({
    cols: clamp(Math.round(cols), MIN_COLS, MAX_COLS),
    rows: clamp(Math.round(rows), MIN_ROWS, MAX_ROWS),
  }));
  const effCols = dims.cols;
  const effRows = dims.rows;
  const tileCount = effCols * effRows;

  const [owners, setOwners] = React.useState<Owner[]>(() =>
    makeOpeningOwners(effCols, effRows),
  );
  const [tileRuntime, setTileRuntime] = React.useState<TileRuntime[]>(() =>
    makeTileRuntime(owners),
  );
  const [turn, setTurn] = React.useState<Side>("yours");
  const [gameOver, setGameOver] = React.useState(false);
  const [winner, setWinner] = React.useState<Side | null>(null);
  const [transientCaption, setTransientCaption] = React.useState<string | null>(
    null,
  );
  const [sweepKey, setSweepKey] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");

  // Refs are the source of truth for handlers — reading React state on a
  // rapid claim → opponent-reply chain would race a stale closure.
  const ownersRef = React.useRef<Owner[]>(owners);
  const turnRef = React.useRef<Side>("yours");
  const gameOverRef = React.useRef(false);

  const onCaptureRef = React.useRef(onCapture);
  React.useEffect(() => {
    onCaptureRef.current = onCapture;
  }, [onCapture]);

  const opponentTimerRef = React.useRef<number | null>(null);
  const captionTimerRef = React.useRef<number | null>(null);
  const flipMidTimersRef = React.useRef<(number | null)[]>(
    Array.from({ length: MAX_TILES }, () => null),
  );
  const flipEndTimersRef = React.useRef<(number | null)[]>(
    Array.from({ length: MAX_TILES }, () => null),
  );
  const pulseAnimRef = React.useRef<ReturnType<typeof animate> | null>(null);

  const pulseScale = useMotionValue(1);

  const opponentOrder = React.useMemo(
    () => opponentOrderFor(effCols, effRows),
    [effCols, effRows],
  );

  const claimableSet = React.useMemo(() => {
    const set = new Set<number>();
    owners.forEach((owner, index) => {
      if (
        owner === "neutral" &&
        isAdjacentToSide(index, owners, "yours", effCols, effRows)
      ) {
        set.add(index);
      }
    });
    return set;
  }, [owners, effCols, effRows]);

  const resetBoard = () => {
    if (opponentTimerRef.current !== null) {
      window.clearTimeout(opponentTimerRef.current);
      opponentTimerRef.current = null;
    }
    if (captionTimerRef.current !== null) {
      window.clearTimeout(captionTimerRef.current);
      captionTimerRef.current = null;
    }
    for (let i = 0; i < MAX_TILES; i += 1) {
      const mid = flipMidTimersRef.current[i] ?? null;
      if (mid !== null) window.clearTimeout(mid);
      flipMidTimersRef.current[i] = null;
      const end = flipEndTimersRef.current[i] ?? null;
      if (end !== null) window.clearTimeout(end);
      flipEndTimersRef.current[i] = null;
    }
    pulseAnimRef.current?.stop();
    pulseAnimRef.current = null;
    pulseScale.set(1);

    const freshOwners = makeOpeningOwners(effCols, effRows);
    ownersRef.current = freshOwners;
    turnRef.current = "yours";
    gameOverRef.current = false;

    setOwners(freshOwners);
    setTileRuntime(makeTileRuntime(freshOwners));
    setTurn("yours");
    setGameOver(false);
    setWinner(null);
    setTransientCaption(null);
    setSweepKey(0);
    setAnnounce("New board.");
  };

  // Every timer this component owns, torn down on unmount. Arrays are
  // aliased by reference here, not copied — resetBoard mutates their slots
  // in place, so this cleanup always sees whatever is currently pending.
  React.useEffect(() => {
    const flipMidTimers = flipMidTimersRef.current;
    const flipEndTimers = flipEndTimersRef.current;
    return () => {
      for (const t of flipMidTimers) if (t !== null) window.clearTimeout(t);
      for (const t of flipEndTimers) if (t !== null) window.clearTimeout(t);
      if (opponentTimerRef.current !== null)
        window.clearTimeout(opponentTimerRef.current);
      if (captionTimerRef.current !== null)
        window.clearTimeout(captionTimerRef.current);
      pulseAnimRef.current?.stop();
    };
  }, []);

  const flashCaption = (text: string, ms: number) => {
    if (captionTimerRef.current !== null)
      window.clearTimeout(captionTimerRef.current);
    setTransientCaption(text);
    captionTimerRef.current = window.setTimeout(() => {
      captionTimerRef.current = null;
      setTransientCaption(null);
    }, ms);
  };

  const triggerCountPulse = () => {
    pulseAnimRef.current?.stop();
    pulseAnimRef.current = animate(pulseScale, [1, 1.18, 1], {
      duration: durations.slow,
      ease: easings.move,
      times: [0, 0.45, 1],
    });
  };

  /** The whole claim: flip the tile, ripple its neighbours, resolve captures,
   * check the board, and hand the turn (or the opponent's timer) onward. */
  const performClaim = (index: number, side: Side) => {
    if (gameOverRef.current) return;
    if (ownerAt(ownersRef.current, index) !== "neutral") return;

    const nextOwners = ownersRef.current.slice();
    nextOwners[index] = side;

    const enemy = opposite(side);
    const claimNeighbors = neighborsOf(index, effCols, effRows);
    const capturedIndices: number[] = [];
    for (const n of claimNeighbors) {
      if (ownerAt(nextOwners, n.index) !== enemy) continue;
      const nn = neighborsOf(n.index, effCols, effRows);
      if (
        nn.length === 4 &&
        nn.every((m) => ownerAt(nextOwners, m.index) === side)
      ) {
        nextOwners[n.index] = side;
        capturedIndices.push(n.index);
      }
    }

    ownersRef.current = nextOwners;
    setOwners(nextOwners);

    const affected = [index, ...capturedIndices];

    if (!motionSafe) {
      setTileRuntime((prev) =>
        prev.map((t, i) =>
          affected.includes(i)
            ? { ...t, displayOwner: ownerAt(nextOwners, i), flipStage: "idle" }
            : t,
        ),
      );
    } else {
      setTileRuntime((prev) =>
        prev.map((t, i) =>
          affected.includes(i) ? { ...t, flipStage: "closing" } : t,
        ),
      );

      for (const i of affected) {
        const pendingMid = flipMidTimersRef.current[i] ?? null;
        if (pendingMid !== null) window.clearTimeout(pendingMid);
        const pendingEnd = flipEndTimersRef.current[i] ?? null;
        if (pendingEnd !== null) window.clearTimeout(pendingEnd);

        flipMidTimersRef.current[i] = window.setTimeout(() => {
          flipMidTimersRef.current[i] = null;
          const settled = ownerAt(ownersRef.current, i);
          setTileRuntime((prev) =>
            prev.map((t, j) =>
              j === i
                ? { ...t, displayOwner: settled, flipStage: "opening" }
                : t,
            ),
          );
          flipEndTimersRef.current[i] = window.setTimeout(() => {
            flipEndTimersRef.current[i] = null;
            setTileRuntime((prev) =>
              prev.map((t, j) => (j === i ? { ...t, flipStage: "idle" } : t)),
            );
          }, durations.base * 1000);
        }, durations.fast * 1000);
      }

      // Ripple: the primary claim's own neighbours pulse, staggered by order.
      setTileRuntime((prev) =>
        prev.map((t, i) => {
          const order = claimNeighbors.findIndex((n) => n.index === i);
          return order === -1
            ? t
            : { ...t, rippleKey: t.rippleKey + 1, rippleOrder: order };
        }),
      );

      if (capturedIndices.length > 0) {
        setTileRuntime((prev) =>
          prev.map((t, i) =>
            capturedIndices.includes(i)
              ? { ...t, burstKey: t.burstKey + 1 }
              : t,
          ),
        );
      }

      if (side === "theirs") {
        const contested = claimNeighbors.filter(
          (n) => ownerAt(nextOwners, n.index) === "yours",
        );
        if (contested.length > 0) {
          setTileRuntime((prev) =>
            prev.map((t, i) => {
              if (i === index) {
                return {
                  ...t,
                  contestedKey: t.contestedKey + 1,
                  contestedDirections: contested.map((n) => n.direction),
                };
              }
              const match = contested.find((n) => n.index === i);
              if (!match) return t;
              return {
                ...t,
                contestedKey: t.contestedKey + 1,
                contestedDirections: [OPPOSITE_DIRECTION[match.direction]],
              };
            }),
          );
        }
      }
    }

    if (capturedIndices.length > 0) {
      onCaptureRef.current?.(capturedIndices.length);
      flashCaption("captured", CAPTION_HOLD_MS);
    }

    const boardFull = nextOwners.every((o) => o !== "neutral");
    const yourTiles = nextOwners.filter((o) => o === "yours").length;
    const theirTiles = nextOwners.filter((o) => o === "theirs").length;

    let announceText = `${side === "yours" ? "You" : "They"} claim tile ${index + 1}.`;
    if (capturedIndices.length > 0) {
      announceText += ` Captured ${capturedIndices.length} tile${capturedIndices.length > 1 ? "s" : ""}.`;
    }

    if (boardFull) {
      gameOverRef.current = true;
      setGameOver(true);
      const win: Side | null =
        yourTiles === theirTiles
          ? null
          : yourTiles > theirTiles
            ? "yours"
            : "theirs";
      setWinner(win);
      if (motionSafe) {
        setSweepKey((k) => k + 1);
        triggerCountPulse();
      }
      announceText += win
        ? ` ${win === "yours" ? "You hold" : "They hold"} the yard.`
        : " The yard is split even.";
    } else {
      const nextTurn: Side = side === "yours" ? "theirs" : "yours";
      turnRef.current = nextTurn;
      setTurn(nextTurn);
      if (side === "yours") {
        if (opponentTimerRef.current !== null)
          window.clearTimeout(opponentTimerRef.current);
        opponentTimerRef.current = window.setTimeout(
          runOpponentTurn,
          OPPONENT_DELAY_MS,
        );
      }
    }

    setAnnounce(announceText);
  };

  const runOpponentTurn = () => {
    opponentTimerRef.current = null;
    if (gameOverRef.current) return;
    let target = -1;
    for (const idx of opponentOrder) {
      if (
        ownerAt(ownersRef.current, idx) === "neutral" &&
        isAdjacentToSide(idx, ownersRef.current, "theirs", effCols, effRows)
      ) {
        target = idx;
        break;
      }
    }
    if (target === -1) {
      turnRef.current = "yours";
      setTurn("yours");
      return;
    }
    performClaim(target, "theirs");
  };

  const handleTileClick = (index: number) => {
    if (gameOverRef.current || turnRef.current !== "yours") return;
    if (ownerAt(ownersRef.current, index) !== "neutral") return;
    if (!isAdjacentToSide(index, ownersRef.current, "yours", effCols, effRows))
      return;
    performClaim(index, "yours");
  };

  const handleNewBoard = () => resetBoard();

  const yourCount = owners.filter((o) => o === "yours").length;
  const theirCount = owners.filter((o) => o === "theirs").length;
  const yourShare = tileCount > 0 ? (yourCount / tileCount) * 100 : 0;
  const theirShare = tileCount > 0 ? (theirCount / tileCount) * 100 : 0;
  const disabledClaims = turn !== "yours" || gameOver;

  const restingCaption = gameOver
    ? winner
      ? `${winner === "yours" ? "you hold" : "they hold"} the yard`
      : "the yard is split even"
    : turn === "yours"
      ? "your move"
      : "their move";
  const captionText = transientCaption ?? restingCaption;

  const turnLabel = gameOver
    ? "game over"
    : turn === "yours"
      ? "your move"
      : "their move";
  const turnDotColor = gameOver
    ? winner === "yours"
      ? "var(--primary)"
      : winner === "theirs"
        ? "var(--warning, #b45309)"
        : "var(--ink-3)"
    : turn === "yours"
      ? "var(--primary)"
      : "var(--warning, #b45309)";

  return (
    <div
      role="group"
      aria-label="Territory grid"
      className={cn("flex w-full max-w-sm flex-col gap-3", className)}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 rounded-full"
            style={{ backgroundColor: "var(--primary)" }}
          />
          <motion.span className="inline-flex" style={{ scale: pulseScale }}>
            <Readout value={yourCount} size="md" />
          </motion.span>
        </div>
        <div className="flex items-center gap-1.5">
          <motion.span className="inline-flex" style={{ scale: pulseScale }}>
            <Readout value={theirCount} size="md" />
          </motion.span>
          <span
            aria-hidden
            className="size-2.5 rounded-full"
            style={{ backgroundColor: "var(--warning, #b45309)" }}
          />
        </div>
      </div>

      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <motion.span
          aria-hidden
          className="absolute inset-y-0 left-0"
          style={{ backgroundColor: "var(--primary)" }}
          initial={false}
          animate={{ width: `${yourShare}%` }}
          transition={
            motionSafe
              ? { duration: durations.base, ease: easings.enter }
              : { duration: 0 }
          }
        />
        <motion.span
          aria-hidden
          className="absolute inset-y-0 right-0"
          style={{ backgroundColor: "var(--warning, #b45309)" }}
          initial={false}
          animate={{ width: `${theirShare}%` }}
          transition={
            motionSafe
              ? { duration: durations.base, ease: easings.enter }
              : { duration: 0 }
          }
        />
      </div>

      <div className="relative">
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${effCols}, minmax(0, 1fr))` }}
        >
          {owners.map((owner, index) => {
            const runtime = tileRuntime[index];
            return (
              <TerritoryTile
                key={index}
                index={index}
                owner={owner}
                displayOwner={runtime?.displayOwner ?? owner}
                flipStage={runtime?.flipStage ?? "idle"}
                rippleKey={runtime?.rippleKey ?? 0}
                rippleOrder={runtime?.rippleOrder ?? 0}
                burstKey={runtime?.burstKey ?? 0}
                contestedKey={runtime?.contestedKey ?? 0}
                contestedDirections={
                  runtime?.contestedDirections ?? EMPTY_DIRECTIONS
                }
                claimable={claimableSet.has(index)}
                disabled={disabledClaims}
                motionSafe={motionSafe}
                onClaim={handleTileClick}
              />
            );
          })}
        </div>

        {motionSafe && gameOver && winner && sweepKey > 0 && (
          <span
            key={sweepKey}
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-2"
          >
            <motion.span
              aria-hidden
              className="absolute inset-y-0 w-1/3"
              style={{
                background: `linear-gradient(90deg, transparent, color-mix(in oklab, ${colorFor(winner)} 55%, transparent), transparent)`,
              }}
              initial={{ left: "-40%" }}
              animate={{ left: "140%" }}
              transition={{ duration: durations.page, ease: easings.move }}
            />
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-ink-2">
          <span
            aria-hidden
            className="size-1.5 rounded-full"
            style={{ backgroundColor: turnDotColor }}
          />
          {turnLabel}
        </span>

        <span className="flex h-4 items-center overflow-hidden font-mono text-[11px] text-ink-3">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={captionText}
              initial={motionSafe ? { opacity: 0, y: 4 } : false}
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
              {captionText}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>

      {gameOver && (
        <button
          type="button"
          onClick={handleNewBoard}
          className="mt-1 self-center font-mono text-xs font-medium text-ink-2 underline decoration-dotted underline-offset-4 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1"
        >
          new board
        </button>
      )}

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}

type TerritoryTileProps = {
  index: number;
  /** Logical owner — authoritative for adjacency, capture, and counts. */
  owner: Owner;
  /** Rendered owner — trails `owner` until the flip's midpoint. */
  displayOwner: Owner;
  flipStage: FlipStage;
  rippleKey: number;
  rippleOrder: number;
  burstKey: number;
  contestedKey: number;
  contestedDirections: Direction[];
  claimable: boolean;
  disabled: boolean;
  motionSafe: boolean;
  onClaim: (index: number) => void;
};

/**
 * One board cell. Owned and claimable-neutral tiles share the same visual
 * rig — a colour fill riding a scaleX tween (closing then opening, colour
 * swapped while it sits at zero) plus ripple, capture, and contested-edge
 * overlays — the only difference is whether the cell renders as a real
 * button or a decorative span. Non-adjacent neutrals render dimmer and
 * inert: there is nothing here to click until the frontier reaches them.
 */
function TerritoryTile({
  index,
  owner,
  displayOwner,
  flipStage,
  rippleKey,
  rippleOrder,
  burstKey,
  contestedKey,
  contestedDirections,
  claimable,
  disabled,
  motionSafe,
  onClaim,
}: TerritoryTileProps): React.JSX.Element {
  const fillColor = colorFor(displayOwner);
  const scaleXTarget = flipStage === "closing" ? 0 : 1;
  const flipTransition = motionSafe
    ? flipStage === "closing"
      ? { duration: durations.fast, ease: easings.exit }
      : { duration: durations.base, ease: easings.enter }
    : { duration: 0 };

  const inner = (
    <>
      <motion.span
        aria-hidden
        className="absolute inset-0"
        style={{ transformOrigin: "50% 50%", backgroundColor: fillColor }}
        initial={false}
        animate={{ scaleX: scaleXTarget }}
        transition={flipTransition}
      />

      {motionSafe && rippleKey > 0 && (
        <motion.span
          key={`ripple-${rippleKey}`}
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ backgroundColor: "var(--ring)" }}
          initial={{ scale: 1, opacity: 0 }}
          animate={{ scale: [1, 1.16, 1], opacity: [0, 0.3, 0] }}
          transition={{
            duration: durations.fast,
            times: [0, 0.5, 1],
            ease: easings.move,
            delay: rippleOrder * RIPPLE_STEP,
          }}
        />
      )}

      {motionSafe && burstKey > 0 && (
        <span
          key={`burst-${burstKey}`}
          aria-hidden
          className="pointer-events-none absolute inset-0"
        >
          <motion.span
            className="absolute inset-0 m-auto rounded-full border-2"
            style={{ width: "72%", height: "72%", borderColor: fillColor }}
            initial={{ scale: 0.5, opacity: 0.9 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: durations.slow, ease: easings.exit }}
          />
          <span className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            {CAPTURE_SPARK_VECTORS.map((v, i) => (
              <motion.span
                key={i}
                className="absolute size-1 rounded-full"
                style={{ backgroundColor: fillColor }}
                initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{ x: v.dx, y: v.dy, opacity: 0 }}
                transition={{ duration: durations.slow, ease: easings.exit }}
              />
            ))}
          </span>
        </span>
      )}

      {motionSafe && contestedKey > 0 && contestedDirections.length > 0 && (
        <span
          key={`contested-${contestedKey}`}
          aria-hidden
          className="pointer-events-none absolute inset-0"
        >
          {contestedDirections.map((dir) => (
            <motion.span
              key={dir}
              className={cn("absolute bg-[var(--ring)]", EDGE_CLASS[dir])}
              initial={{ opacity: 0.95 }}
              animate={{ opacity: 0 }}
              transition={{ duration: durations.slow, ease: easings.exit }}
            />
          ))}
        </span>
      )}
    </>
  );

  const baseClass = cn(
    "relative block aspect-square overflow-hidden rounded-2 border border-hairline",
    owner === "neutral" && "bg-surface-2",
    owner === "neutral" && !claimable && "opacity-40",
  );

  if (owner === "neutral" && claimable) {
    return (
      <button
        type="button"
        aria-label={`Claim tile ${index + 1}`}
        disabled={disabled}
        onClick={() => onClaim(index)}
        className={cn(
          baseClass,
          "transition-[filter,opacity] outline-none hover:brightness-110 active:brightness-95",
          "disabled:pointer-events-none disabled:opacity-60",
          "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
        )}
      >
        {inner}
      </button>
    );
  }

  return (
    <span aria-hidden className={baseClass}>
      {inner}
    </span>
  );
}
