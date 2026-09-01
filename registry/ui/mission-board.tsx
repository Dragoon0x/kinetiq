"use client";

import * as React from "react";

import { Check, Pin } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

/** Board card and rail-slot footprint — identical, so a card never resizes
 * mid-flight. */
const CARD_W = 176;
const CARD_H = 148;
const COL_GAP = 14;
const ROW_GAP = 16;
const BOARD_COLS = 3;
const BOARD_ROWS = 2;
const BOARD_LENGTH = BOARD_COLS * BOARD_ROWS;
const SCENE_PAD_X = 18;
const BOARD_TOP = 16;
/** Room for the "your slots" caption between the board and the rail. */
const RAIL_GAP = 48;
const SCENE_BOTTOM_PAD = 16;

const BOARD_BOTTOM =
  BOARD_TOP + BOARD_ROWS * CARD_H + (BOARD_ROWS - 1) * ROW_GAP;
const RAIL_TOP = BOARD_BOTTOM + RAIL_GAP;
const SLOT_CELL_Y = RAIL_TOP + CARD_H / 2;
const SCENE_HEIGHT = RAIL_TOP + CARD_H + SCENE_BOTTOM_PAD;

/** Authored, not measured: every position below is arithmetic on fixed
 * constants, never a DOM read, so the board lays out identically on server,
 * client, and every revisit — the flight overlay can then target the exact
 * same coordinates the real cells render at. */
const boardCellX = (col: number): number =>
  SCENE_PAD_X + CARD_W / 2 + col * (CARD_W + COL_GAP);
const boardCellY = (row: number): number =>
  BOARD_TOP + CARD_H / 2 + row * (CARD_H + ROW_GAP);
const slotCellX = (index: number): number =>
  SCENE_PAD_X + CARD_W / 2 + index * (CARD_W + COL_GAP);
const sceneWidthFor = (cols: number): number =>
  SCENE_PAD_X * 2 + cols * CARD_W + Math.max(cols - 1, 0) * COL_GAP;

/** Fixed pinned-angle table — never random, one entry per board position. */
const PIN_ANGLES: number[] = [-3, 2.5, -2, 3.5, -1.5, 2];

/** Timings for the accept choreography: lift, then an arced travel, then the
 * slot's own settle spring plays as its mount transition. */
const LIFT_MS = 260;
const TRAVEL_S = 0.46;
const TRAVEL_MS = Math.round(TRAVEL_S * 1000);
const ARC_LIFT = 26;
const TUG_MS = 110;
const CAPTION_MS = 1500;
/** Reward-flight duration for a turn-in, and how long the caption holds. */
const TURN_IN_S = durations.page;
const TURN_IN_MS = Math.round(TURN_IN_S * 1000);

export type Difficulty = "routine" | "tricky" | "hard";

export type Mission = {
  id: string;
  title: string;
  difficulty: Difficulty;
  /** Paid out to the running total the moment the mission is turned in. */
  reward: number;
  /** Presses of "progress" needed before the mission is claimable. */
  target: number;
};

const DIFFICULTY_META: Record<
  Difficulty,
  { label: string; className: string }
> = {
  routine: { label: "routine", className: "border-hairline-strong text-ink-3" },
  tricky: { label: "tricky", className: "border-warn/50 text-warn" },
  hard: { label: "hard", className: "border-destructive/50 text-destructive" },
};

const DEFAULT_MISSIONS: Mission[] = [
  {
    id: "basin",
    title: "Chart the north basin",
    difficulty: "routine",
    reward: 30,
    target: 3,
  },
  {
    id: "causeway",
    title: "Re-flag the causeway",
    difficulty: "tricky",
    reward: 45,
    target: 4,
  },
  {
    id: "channel",
    title: "Sound the low channel",
    difficulty: "routine",
    reward: 25,
    target: 3,
  },
  {
    id: "flats",
    title: "Survey the reed flats",
    difficulty: "hard",
    reward: 60,
    target: 5,
  },
  {
    id: "weir",
    title: "Patch the weir gate",
    difficulty: "tricky",
    reward: 40,
    target: 4,
  },
  {
    id: "levee",
    title: "Walk the outer levee",
    difficulty: "routine",
    reward: 20,
    target: 2,
  },
];

/** Fixed rotation of spare postings — cycled deterministically on refresh,
 * never drawn at random. */
const SPARE_MISSIONS: Mission[] = [
  {
    id: "gauge",
    title: "Log the tide gauge",
    difficulty: "routine",
    reward: 20,
    target: 2,
  },
  {
    id: "silt",
    title: "Clear the silt trap",
    difficulty: "tricky",
    reward: 42,
    target: 4,
  },
  {
    id: "markers",
    title: "Resight the channel markers",
    difficulty: "hard",
    reward: 55,
    target: 5,
  },
  {
    id: "mooring",
    title: "Splice the mooring line",
    difficulty: "routine",
    reward: 28,
    target: 3,
  },
  {
    id: "culvert",
    title: "Trace the culvert leak",
    difficulty: "tricky",
    reward: 38,
    target: 4,
  },
  {
    id: "spoil",
    title: "Grade the spoil bank",
    difficulty: "hard",
    reward: 58,
    target: 5,
  },
];

const FALLBACK_MISSION: Mission = {
  id: "fallback",
  title: "Untitled posting",
  difficulty: "routine",
  reward: 0,
  target: 1,
};

const pickFromRotation = (list: Mission[], index: number): Mission => {
  const item = list[((index % list.length) + list.length) % list.length];
  return item ?? list[0] ?? FALLBACK_MISSION;
};

const CARD_SHADOW_REST = "0 1px 3px oklch(0 0 0 / 0.22)";
const CARD_SHADOW_LIFTED = "0 16px 30px -8px oklch(0 0 0 / 0.4)";

type SlotState = {
  mission: Mission;
  progress: number;
  phase: "active" | "complete";
};

type TugPhase = "tug" | "back" | null;

type MissionCardProps = {
  mission: Mission;
  index: number;
  angle: number;
  mode: "idle" | "lifting" | "tug" | "back";
  disabled: boolean;
  motionSafe: boolean;
  delay: number;
  refused: boolean;
  onAccept: (index: number) => void;
};

/** One pinned board card — a real child component so its lift/tug motion
 * never lives inside the board's `.map`. */
function MissionCard({
  mission,
  index,
  angle,
  mode,
  disabled,
  motionSafe,
  delay,
  refused,
  onAccept,
}: MissionCardProps): React.JSX.Element {
  const diff = DIFFICULTY_META[mission.difficulty];

  const target =
    mode === "lifting"
      ? { rotate: 0, scale: 1.06, x: 0, y: -6 }
      : mode === "tug"
        ? { rotate: angle - 3, scale: 1, x: -6, y: 0 }
        : { rotate: angle, scale: 1, x: 0, y: 0 };

  const transition = !motionSafe
    ? { duration: 0 }
    : mode === "lifting"
      ? springs.snap
      : mode === "tug"
        ? { duration: TUG_MS / 1000, ease: easings.move }
        : mode === "back"
          ? springs.recoil
          : { duration: durations.base, ease: easings.enter, delay };

  return (
    <motion.div
      initial={
        motionSafe
          ? { opacity: 0, y: -distances.step, scale: 0.92, rotate: angle }
          : false
      }
      animate={target}
      transition={transition}
      style={{
        width: CARD_W,
        height: CARD_H,
        left: boardCellX(index % BOARD_COLS),
        top: boardCellY(Math.floor(index / BOARD_COLS)),
        marginLeft: -CARD_W / 2,
        marginTop: -CARD_H / 2,
        transformOrigin: "50% 8%",
        boxShadow: mode === "lifting" ? CARD_SHADOW_LIFTED : CARD_SHADOW_REST,
        transitionProperty: "box-shadow",
        transitionDuration: motionSafe ? "220ms" : "0ms",
      }}
      className="absolute flex flex-col rounded-3 border border-hairline-strong bg-surface-2 p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-sm font-medium text-ink">
          {mission.title}
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-[0.06em] uppercase",
            diff.className,
          )}
        >
          {diff.label}
        </span>
      </div>

      <span className="mt-1 font-mono text-[11px] text-ink-3">
        +{mission.reward}
      </span>

      <button
        type="button"
        aria-label={`Accept ${mission.title}`}
        disabled={disabled}
        onClick={() => onAccept(index)}
        className={cn(
          "mt-auto w-fit rounded-2 bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground shadow-raised transition-[filter] outline-none",
          "hover:brightness-110 active:brightness-95",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        accept
      </button>

      <AnimatePresence>
        {refused && (
          <motion.span
            key="refused-caption"
            initial={motionSafe ? { opacity: 0, y: -2 } : { opacity: 1 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{
              opacity: 0,
              transition: { duration: durations.fast, ease: easings.exit },
            }}
            className="pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2 rounded-1 border border-hairline-strong bg-surface-1 px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap text-ink-3"
          >
            no free slots
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

type BoardMarkProps = {
  index: number;
  angle: number;
};

/** The pin and its empty hole — always present at a board position, so a
 * taken card still reads as a depleted spot rather than a gap. */
function BoardMark({ index, angle }: BoardMarkProps): React.JSX.Element {
  const col = index % BOARD_COLS;
  const row = Math.floor(index / BOARD_COLS);
  const x = boardCellX(col);
  const y = boardCellY(row) - CARD_H / 2;

  return (
    <React.Fragment>
      <Pin
        aria-hidden
        className="absolute size-3.5 text-ink-3"
        style={{
          left: x,
          top: y,
          marginLeft: -7,
          marginTop: -7,
          transform: `rotate(${angle * 3}deg)`,
        }}
      />
      <span
        aria-hidden
        className="absolute rounded-full border border-dashed border-hairline"
        style={{
          left: boardCellX(col),
          top: boardCellY(row),
          width: 30,
          height: 30,
          marginLeft: -15,
          marginTop: -15,
        }}
      />
    </React.Fragment>
  );
}

type FlightGhostProps = {
  mission: Mission;
  fromIndex: number;
  toSlot: number;
  motionSafe: boolean;
};

/** The lone traveling card: an authored tween arc from the board cell it
 * lifted from to the slot it is settling into. */
function FlightGhost({
  mission,
  fromIndex,
  toSlot,
  motionSafe,
}: FlightGhostProps): React.JSX.Element {
  const fromX = boardCellX(fromIndex % BOARD_COLS);
  const fromY = boardCellY(Math.floor(fromIndex / BOARD_COLS));
  const toX = slotCellX(toSlot);
  const toY = SLOT_CELL_Y;
  const dx = toX - fromX;
  const dy = toY - fromY;
  const diff = DIFFICULTY_META[mission.difficulty];

  return (
    <motion.div
      aria-hidden
      initial={{ x: 0, y: 0, rotate: 0 }}
      animate={
        motionSafe
          ? {
              x: [0, dx * 0.5, dx],
              y: [0, dy * 0.5 - ARC_LIFT, dy],
              rotate: [0, 4, 0],
            }
          : { x: dx, y: dy, rotate: 0 }
      }
      transition={
        motionSafe
          ? { duration: TRAVEL_S, times: [0, 0.5, 1], ease: easings.move }
          : { duration: 0 }
      }
      style={{
        width: CARD_W,
        height: CARD_H,
        left: fromX,
        top: fromY,
        marginLeft: -CARD_W / 2,
        marginTop: -CARD_H / 2,
        boxShadow: CARD_SHADOW_LIFTED,
      }}
      className="pointer-events-none absolute z-20 flex flex-col rounded-3 border border-hairline-strong bg-surface-2 p-3"
    >
      <span className="min-w-0 text-sm font-medium text-ink">
        {mission.title}
      </span>
      <span
        className={cn(
          "mt-1 w-fit shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-[0.06em] uppercase",
          diff.className,
        )}
      >
        {diff.label}
      </span>
      <span className="mt-auto font-mono text-[11px] text-ink-3">
        +{mission.reward}
      </span>
    </motion.div>
  );
}

type ActiveMissionCardProps = {
  slot: SlotState;
  index: number;
  motionSafe: boolean;
  onProgress: (index: number) => void;
  onTurnIn: (index: number) => void;
};

/** A held mission's own card: its progress bar, its claim glow, and — once
 * turned in — its own stamp, reward flight, and upward exit. */
function ActiveMissionCard({
  slot,
  index,
  motionSafe,
  onProgress,
  onTurnIn,
}: ActiveMissionCardProps): React.JSX.Element {
  const { mission, progress, phase } = slot;
  const diff = DIFFICULTY_META[mission.difficulty];
  const claimable = phase === "active" && progress >= mission.target;
  const pct =
    mission.target > 0 ? Math.min(100, (progress / mission.target) * 100) : 100;

  return (
    <motion.div
      initial={
        motionSafe ? { opacity: 0, scale: 0.85, y: -distances.shift } : false
      }
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={
        motionSafe
          ? {
              opacity: 0,
              y: -distances.shift * 2,
              transition: exitFor(durations.base),
            }
          : { opacity: 0, transition: { duration: 0 } }
      }
      transition={motionSafe ? springs.recoil : { duration: 0 }}
      style={{
        width: CARD_W,
        height: CARD_H,
        left: slotCellX(index),
        top: SLOT_CELL_Y,
        marginLeft: -CARD_W / 2,
        marginTop: -CARD_H / 2,
      }}
      className={cn(
        "absolute z-10 flex flex-col rounded-3 border bg-surface-2 p-3",
        claimable ? "border-success" : "border-hairline-strong",
      )}
    >
      {claimable && motionSafe && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -inset-1 rounded-3 border-2 border-success"
          animate={{ opacity: [0.25, 0.75, 0.25], scale: [1, 1.02, 1] }}
          transition={{ duration: 2.2, ease: easings.move, repeat: Infinity }}
        />
      )}

      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium text-ink">
          {mission.title}
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-[0.06em] uppercase",
            diff.className,
          )}
        >
          {diff.label}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-1">
          <motion.span
            aria-hidden
            className={cn(
              "absolute inset-y-0 left-0 rounded-full transition-colors duration-300",
              claimable ? "bg-success" : "bg-primary",
            )}
            animate={{ width: `${pct}%` }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
          />
        </div>
        <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
          {progress}/{mission.target}
        </span>
      </div>

      <span className="mt-1 font-mono text-[11px] text-ink-3">
        +{mission.reward}
      </span>

      <div className="mt-auto flex items-center justify-end">
        {phase === "complete" ? (
          <motion.span
            initial={
              motionSafe ? { scale: 0, opacity: 0, rotate: -8 } : { rotate: -8 }
            }
            animate={{ scale: 1, opacity: 1, rotate: -8 }}
            transition={motionSafe ? springs.flick : { duration: 0 }}
            className="flex items-center gap-1 rounded-2 border border-success/50 bg-surface-1 px-2 py-1 font-mono text-[10px] font-semibold tracking-[0.08em] text-success uppercase"
          >
            <Check aria-hidden className="size-3" />
            complete
          </motion.span>
        ) : claimable ? (
          <button
            type="button"
            aria-label={`Turn in ${mission.title}`}
            onClick={() => onTurnIn(index)}
            className={cn(
              "rounded-2 bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground shadow-raised transition-[filter] outline-none",
              "hover:brightness-110 active:brightness-95",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2",
            )}
          >
            turn in
          </button>
        ) : (
          <button
            type="button"
            aria-label={`Advance ${mission.title}`}
            onClick={() => onProgress(index)}
            className={cn(
              "rounded-2 border border-hairline-strong px-2.5 py-1 text-[11px] font-medium text-ink-2 transition-colors outline-none",
              "hover:text-ink",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2",
            )}
          >
            progress
          </button>
        )}
      </div>

      {phase === "complete" && motionSafe && (
        <motion.span
          aria-hidden
          initial={{ opacity: 1, y: 0, scale: 1 }}
          animate={{ opacity: 0, y: -56, scale: 0.85 }}
          transition={{ duration: TURN_IN_S, ease: easings.exit }}
          className="pointer-events-none absolute top-2 right-2 rounded-1 border border-hairline-strong bg-surface-1 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink-2"
        >
          +{mission.reward}
        </motion.span>
      )}
    </motion.div>
  );
}

type EmptySlotProps = {
  index: number;
};

/** The dashed socket a card left, or one that was never filled. Sits under
 * the rail's `AnimatePresence` layer (not inside it) so it is simply there
 * the instant a slot empties, with the outgoing card animating away above
 * it. */
function EmptySlot({ index }: EmptySlotProps): React.JSX.Element {
  return (
    <div
      style={{
        width: CARD_W,
        height: CARD_H,
        left: slotCellX(index),
        top: SLOT_CELL_Y,
        marginLeft: -CARD_W / 2,
        marginTop: -CARD_H / 2,
      }}
      className="absolute z-0 flex items-center justify-center rounded-3 border border-dashed border-hairline-strong"
    >
      <span className="font-mono text-[10px] tracking-[0.14em] text-ink-3 uppercase">
        open
      </span>
    </div>
  );
}

export type MissionBoardProps = {
  /** Active mission slots — the hard cap on work held at once. @default 3 */
  slots?: number;
  /** Fires each time a claimable mission is turned in, with its reward. */
  onTurnIn?: (reward: number) => void;
  className?: string;
};

/**
 * A cork board of pinned assignments, not a list of what is already claimed
 * — six missions wait on the board and only a few ACTIVE SLOTS exist to hold
 * work at once, so accepting is a real trade: the card lifts off its pin,
 * arcs down into an open slot on an authored tween, and settles there on
 * `recoil` while the pin and its empty hole stay behind, so the board reads
 * as depleted. A full rail refuses the next accept outright — the card tugs
 * against its pin and springs back with a plain "no free slots" caption; the
 * limit and the refusal are the design, not an edge case to smooth over.
 * Each held mission answers its own "progress" button until it glows
 * claimable; turning one in stamps it complete, sends its reward figure
 * toward the climbing `Readout` total, and clears the slot, while "new
 * postings" repins any depleted spot from a fixed rotation in a small
 * cascading drop.
 * Reduced motion: accepting moves a card into its slot in one step with no
 * lift, arc, or tug; a refusal is the caption alone; and turning in updates
 * the total directly with no stamp, flight, or exit.
 */
export function MissionBoard({
  slots: slotsProp = 3,
  onTurnIn,
  className,
}: MissionBoardProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const slotsCount = Math.max(1, Math.round(slotsProp));

  const [board, setBoard] = React.useState<Array<Mission | null>>(() => [
    ...DEFAULT_MISSIONS,
  ]);
  const [slots, setSlots] = React.useState<Array<SlotState | null>>(() =>
    Array.from({ length: slotsCount }, () => null),
  );
  const [liftingIndex, setLiftingIndex] = React.useState<number | null>(null);
  const [flight, setFlight] = React.useState<{
    mission: Mission;
    fromIndex: number;
    toSlot: number;
  } | null>(null);
  const [refuseIndex, setRefuseIndex] = React.useState<number | null>(null);
  const [tugPhase, setTugPhase] = React.useState<TugPhase>(null);
  const [totalReward, setTotalReward] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");

  const onTurnInRef = React.useRef(onTurnIn);
  React.useEffect(() => {
    onTurnInRef.current = onTurnIn;
  }, [onTurnIn]);

  const spareCursorRef = React.useRef(0);
  const liftTimer = React.useRef<number | null>(null);
  const travelTimer = React.useRef<number | null>(null);
  const tugTimer = React.useRef<number | null>(null);
  const refuseTimer = React.useRef<number | null>(null);
  const turnInTimers = React.useRef<Record<number, number>>({});

  const clearFlightTimers = (): void => {
    if (liftTimer.current !== null) window.clearTimeout(liftTimer.current);
    if (travelTimer.current !== null) window.clearTimeout(travelTimer.current);
    liftTimer.current = null;
    travelTimer.current = null;
  };

  const clearRefusalTimers = (): void => {
    if (tugTimer.current !== null) window.clearTimeout(tugTimer.current);
    if (refuseTimer.current !== null) window.clearTimeout(refuseTimer.current);
    tugTimer.current = null;
    refuseTimer.current = null;
  };

  React.useEffect(() => {
    const turnInT = turnInTimers.current;
    return () => {
      clearFlightTimers();
      clearRefusalTimers();
      for (const key of Object.keys(turnInT)) {
        const id = turnInT[Number(key)];
        if (id !== undefined) window.clearTimeout(id);
      }
    };
  }, []);

  const busy = liftingIndex !== null || flight !== null || refuseIndex !== null;
  const boardCascadeStep = cascade(BOARD_LENGTH);
  const sceneWidth = Math.max(
    sceneWidthFor(BOARD_COLS),
    sceneWidthFor(slotsCount),
  );

  const triggerRefusal = (index: number, mission: Mission): void => {
    clearRefusalTimers();
    setRefuseIndex(index);
    setAnnounce(`No free slots. ${mission.title} stays on the board.`);

    if (motionSafe) {
      setTugPhase("tug");
      tugTimer.current = window.setTimeout(() => {
        tugTimer.current = null;
        setTugPhase("back");
      }, TUG_MS);
    }

    refuseTimer.current = window.setTimeout(() => {
      refuseTimer.current = null;
      setRefuseIndex(null);
      setTugPhase(null);
    }, CAPTION_MS);
  };

  const handleAccept = (index: number): void => {
    if (busy) return;
    const mission = board[index];
    if (!mission) return;
    const targetSlot = slots.findIndex((s) => s === null);

    if (targetSlot === -1) {
      triggerRefusal(index, mission);
      return;
    }

    if (!motionSafe) {
      setBoard((prev) => prev.map((m, i) => (i === index ? null : m)));
      setSlots((prev) =>
        prev.map((s, i) =>
          i === targetSlot ? { mission, progress: 0, phase: "active" } : s,
        ),
      );
      setAnnounce(`${mission.title} accepted into slot ${targetSlot + 1}.`);
      return;
    }

    clearFlightTimers();
    setLiftingIndex(index);
    setAnnounce(`${mission.title} lifted off the board.`);

    liftTimer.current = window.setTimeout(() => {
      liftTimer.current = null;
      setLiftingIndex(null);
      setBoard((prev) => prev.map((m, i) => (i === index ? null : m)));
      setFlight({ mission, fromIndex: index, toSlot: targetSlot });

      travelTimer.current = window.setTimeout(() => {
        travelTimer.current = null;
        setFlight(null);
        setSlots((prev) =>
          prev.map((s, i) =>
            i === targetSlot ? { mission, progress: 0, phase: "active" } : s,
          ),
        );
        setAnnounce(`${mission.title} settled into slot ${targetSlot + 1}.`);
      }, TRAVEL_MS);
    }, LIFT_MS);
  };

  const handleProgress = (slotIndex: number): void => {
    setSlots((prev) =>
      prev.map((s, i) => {
        if (i !== slotIndex || !s || s.phase !== "active") return s;
        const nextProgress = Math.min(s.mission.target, s.progress + 1);
        return { ...s, progress: nextProgress };
      }),
    );
  };

  const handleTurnIn = (slotIndex: number): void => {
    const current = slots[slotIndex];
    if (!current || current.phase !== "active") return;
    if (current.progress < current.mission.target) return;
    const { mission } = current;

    if (!motionSafe) {
      setSlots((prev) => prev.map((s, i) => (i === slotIndex ? null : s)));
      setTotalReward((t) => t + mission.reward);
      onTurnInRef.current?.(mission.reward);
      setAnnounce(`${mission.title} turned in. Plus ${mission.reward}.`);
      return;
    }

    setSlots((prev) =>
      prev.map((s, i) =>
        i === slotIndex && s ? { ...s, phase: "complete" } : s,
      ),
    );
    setAnnounce(`${mission.title} complete.`);

    const existing = turnInTimers.current[slotIndex];
    if (existing !== undefined) window.clearTimeout(existing);
    turnInTimers.current[slotIndex] = window.setTimeout(() => {
      delete turnInTimers.current[slotIndex];
      setSlots((prev) => prev.map((s, i) => (i === slotIndex ? null : s)));
      setTotalReward((t) => t + mission.reward);
      onTurnInRef.current?.(mission.reward);
      setAnnounce(`${mission.title} turned in. Plus ${mission.reward}.`);
    }, TURN_IN_MS);
  };

  const openBoardCount = board.filter((m) => m === null).length;

  const handleRefresh = (): void => {
    if (openBoardCount === 0) return;
    const baseCursor = spareCursorRef.current;
    const emptyIndices = board
      .map((m, i) => (m === null ? i : -1))
      .filter((i) => i !== -1);

    setBoard((prev) =>
      prev.map((m, i) => {
        if (m !== null) return m;
        const order = emptyIndices.indexOf(i);
        return pickFromRotation(SPARE_MISSIONS, baseCursor + order);
      }),
    );
    spareCursorRef.current = baseCursor + emptyIndices.length;
    setAnnounce("New postings pinned to the board.");
  };

  return (
    <div
      aria-label="Mission board"
      className={cn(
        "relative w-full max-w-2xl rounded-4 border border-hairline bg-surface-1 p-5",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-label text-ink-3">Mission Board</span>
        <span className="flex items-baseline gap-1.5 font-mono text-[10px] text-ink-3">
          <span className="tracking-[0.06em] uppercase">reward</span>
          <Readout value={totalReward} size="sm" className="text-ink-2" />
        </span>
      </div>

      <div className="relative mt-4 overflow-x-auto">
        <div
          className="relative"
          style={{ width: sceneWidth, height: SCENE_HEIGHT }}
        >
          {board.map((_, index) => {
            const angle = PIN_ANGLES[index] ?? 0;
            return (
              <BoardMark key={`mark-${index}`} index={index} angle={angle} />
            );
          })}

          {board.map((mission, index) => {
            if (!mission) return null;
            const angle = PIN_ANGLES[index] ?? 0;
            const mode: MissionCardProps["mode"] =
              liftingIndex === index
                ? "lifting"
                : refuseIndex === index && motionSafe
                  ? (tugPhase ?? "idle")
                  : "idle";
            return (
              <MissionCard
                key={mission.id}
                mission={mission}
                index={index}
                angle={angle}
                mode={mode}
                disabled={busy}
                motionSafe={motionSafe}
                delay={index * boardCascadeStep}
                refused={refuseIndex === index}
                onAccept={handleAccept}
              />
            );
          })}

          <span
            className="absolute font-mono text-[10px] tracking-[0.14em] text-ink-3 uppercase"
            style={{ left: SCENE_PAD_X, top: BOARD_BOTTOM + 16 }}
          >
            your slots
          </span>

          {slots.map((slot, index) => (
            <React.Fragment key={index}>
              {!slot && <EmptySlot index={index} />}
              <AnimatePresence>
                {slot && (
                  <ActiveMissionCard
                    key={slot.mission.id}
                    slot={slot}
                    index={index}
                    motionSafe={motionSafe}
                    onProgress={handleProgress}
                    onTurnIn={handleTurnIn}
                  />
                )}
              </AnimatePresence>
            </React.Fragment>
          ))}

          {flight && (
            <FlightGhost
              mission={flight.mission}
              fromIndex={flight.fromIndex}
              toSlot={flight.toSlot}
              motionSafe={motionSafe}
            />
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-hairline pt-3">
        <span className="font-mono text-[11px] text-ink-3">
          {openBoardCount} open on the board
        </span>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={openBoardCount === 0}
          className={cn(
            "rounded-1 px-1.5 py-1 font-mono text-[11px] text-ink-3 underline decoration-hairline-strong underline-offset-2 transition-colors outline-none",
            "hover:text-ink-2",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
            openBoardCount === 0 && "pointer-events-none opacity-40",
          )}
        >
          new postings
        </button>
      </div>

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
