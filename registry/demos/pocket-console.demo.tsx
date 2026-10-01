"use client";

import * as React from "react";

import { motion } from "motion/react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PocketConsole } from "@/registry/ui/pocket-console";

export const tweaks = defineTweaks({
  shell: {
    kind: "choice",
    label: "Shell",
    default: "teal",
    options: ["grey", "teal", "clear"],
    names: { grey: "Grey", teal: "Teal", clear: "Clear" },
  },
  grid: {
    kind: "range",
    label: "Pixel grid",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  backlight: {
    kind: "range",
    label: "Backlight",
    default: 0.8,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

type Facing = "up" | "down" | "left" | "right";
type Bed = { x: number; y: number; stage: number };

const COLS = 10;
const ROWS = 6;
const TILE = 8;
const TOP = 10;
const BEDS: Bed[] = [
  { x: 1, y: 1, stage: 4 },
  { x: 4, y: 1, stage: 2 },
  { x: 7, y: 1, stage: 0 },
  { x: 1, y: 4, stage: 1 },
  { x: 6, y: 4, stage: 3 },
  { x: 8, y: 3, stage: 0 },
];
/** Grass tufts, placed once: the same plot on the server and in the browser. */
const TUFTS = [
  [0, 0],
  [3, 0],
  [6, 2],
  [9, 1],
  [2, 2],
  [5, 5],
  [8, 5],
  [0, 3],
  [3, 4],
  [9, 4],
  [7, 3],
  [4, 5],
] as const;
const STEP: Record<Facing, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
const KEY_FACING: Record<string, Facing> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

type Game = {
  x: number;
  y: number;
  facing: Facing;
  beds: Bed[];
  paused: boolean;
  help: boolean;
  /** The last watering, where it fell: drops show there and fade. */
  splash: { n: number; x: number; y: number } | null;
};

const START: Game = {
  x: 4,
  y: 3,
  facing: "up",
  beds: BEDS,
  paused: false,
  help: false,
  splash: null,
};

const bedAt = (beds: Bed[], x: number, y: number) =>
  beds.findIndex((b) => b.x === x && b.y === y);

function play(game: Game, key: string): Game {
  if (key === "Enter") return { ...game, paused: !game.paused };
  if (game.paused) return game;
  if (key === "Shift") return { ...game, help: !game.help };
  const facing = KEY_FACING[key];
  if (facing) {
    const [dx, dy] = STEP[facing];
    const x = game.x + dx;
    const y = game.y + dy;
    const blocked =
      x < 0 || y < 0 || x >= COLS || y >= ROWS || bedAt(game.beds, x, y) >= 0;
    return blocked ? { ...game, facing } : { ...game, facing, x, y };
  }
  const [dx, dy] = STEP[game.facing];
  const i = bedAt(game.beds, game.x + dx, game.y + dy);
  if (i < 0) return game;
  const bed = game.beds[i] as Bed;
  // A waters a sown bed one stage on; B sows an empty one.
  const next =
    key === "a" && bed.stage > 0 && bed.stage < 4
      ? bed.stage + 1
      : key === "b" && bed.stage === 0
        ? 1
        : bed.stage;
  if (next === bed.stage) return game;
  const beds = game.beds.map((b, j) => (j === i ? { ...b, stage: next } : b));
  const splash =
    key === "a"
      ? { n: (game.splash?.n ?? 0) + 1, x: bed.x, y: bed.y }
      : game.splash;
  return { ...game, beds, splash };
}

function Plant({ stage, x, y }: { stage: number; x: number; y: number }) {
  const px = x * TILE;
  const py = TOP + y * TILE;
  return (
    <g>
      <rect
        x={px + 0.5}
        y={py + 0.5}
        width={TILE - 1}
        height={TILE - 1}
        className="fill-ink-3/40"
      />
      <rect
        x={px + 1}
        y={py + 2}
        width="6"
        height="1"
        className="fill-ink-3/30"
      />
      <rect
        x={px + 1}
        y={py + 5}
        width="6"
        height="1"
        className="fill-ink-3/30"
      />
      {stage === 1 ? (
        <rect
          x={px + 3}
          y={py + 4}
          width="2"
          height="1"
          className="fill-warn"
        />
      ) : null}
      {stage >= 2 ? (
        <>
          <rect
            x={px + 3.5}
            y={py + 3}
            width="1"
            height="4"
            className="fill-success"
          />
          <rect
            x={px + 2}
            y={py + 4}
            width="1.5"
            height="1"
            className="fill-success"
          />
          <rect
            x={px + 4.5}
            y={py + 3}
            width="1.5"
            height="1"
            className="fill-success"
          />
        </>
      ) : null}
      {stage === 3 ? (
        <rect
          x={px + 3}
          y={py + 1.5}
          width="2"
          height="2"
          className="fill-warn"
        />
      ) : null}
      {stage === 4 ? (
        <>
          <rect
            x={px + 2}
            y={py + 1}
            width="4"
            height="3"
            className="fill-danger"
          />
          <rect
            x={px + 3}
            y={py}
            width="2"
            height="5"
            className="fill-danger"
          />
          <rect
            x={px + 3}
            y={py + 1.5}
            width="2"
            height="2"
            className="fill-warn"
          />
        </>
      ) : null}
    </g>
  );
}

/** Fernworks Garden: walk with the d-pad, A waters, B sows, Start pauses. */
function GardenScreen({
  game,
  onKey,
}: {
  game: Game;
  onKey: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}) {
  const bloom = game.beds.filter((b) => b.stage === 4).length;
  const [dx, dy] = STEP[game.facing];
  const fx = game.x + dx;
  const fy = game.y + dy;
  const inside = fx >= 0 && fy >= 0 && fx < COLS && fy < ROWS;
  const gx = game.x * TILE;
  const gy = TOP + game.y * TILE;
  return (
    <div
      className="size-full bg-surface-2"
      onKeyDown={onKey}
      aria-label={`Fernworks Garden: ${bloom} of ${BEDS.length} beds in bloom`}
      role="img"
    >
      <svg
        viewBox="0 0 80 60"
        shapeRendering="crispEdges"
        className="block size-full"
        aria-hidden
      >
        <rect x="0" y="0" width="80" height="60" className="fill-surface-2" />
        <rect
          x="0"
          y={TOP}
          width="80"
          height="48"
          className="fill-success/15"
        />
        {TUFTS.map(([x, y]) => (
          <g key={`${x}-${y}`} className="fill-success/50">
            <rect
              x={x * TILE + 2}
              y={TOP + y * TILE + 5}
              width="1"
              height="2"
            />
            <rect
              x={x * TILE + 4}
              y={TOP + y * TILE + 4}
              width="1"
              height="3"
            />
          </g>
        ))}
        {game.beds.map((b) => (
          <Plant key={`${b.x}-${b.y}`} stage={b.stage} x={b.x} y={b.y} />
        ))}
        {inside ? (
          <g className="fill-foreground/60">
            <rect x={fx * TILE} y={TOP + fy * TILE} width="2" height="1" />
            <rect x={fx * TILE} y={TOP + fy * TILE} width="1" height="2" />
            <rect x={fx * TILE + 6} y={TOP + fy * TILE} width="2" height="1" />
            <rect x={fx * TILE + 7} y={TOP + fy * TILE} width="1" height="2" />
            <rect x={fx * TILE} y={TOP + fy * TILE + 7} width="2" height="1" />
            <rect x={fx * TILE} y={TOP + fy * TILE + 6} width="1" height="2" />
            <rect
              x={fx * TILE + 6}
              y={TOP + fy * TILE + 7}
              width="2"
              height="1"
            />
            <rect
              x={fx * TILE + 7}
              y={TOP + fy * TILE + 6}
              width="1"
              height="2"
            />
          </g>
        ) : null}
        <g>
          <rect x={gx + 2} y={gy} width="4" height="2" className="fill-warn" />
          <rect
            x={gx + 1}
            y={gy + 1}
            width="6"
            height="1"
            className="fill-warn"
          />
          <rect
            x={gx + 2}
            y={gy + 2}
            width="4"
            height="2"
            className="fill-ink-2"
          />
          {game.facing !== "up" ? (
            <rect
              x={
                gx +
                (game.facing === "left" ? 2 : game.facing === "right" ? 5 : 3)
              }
              y={gy + 2}
              width={game.facing === "down" ? 2 : 1}
              height="1"
              className="fill-foreground"
            />
          ) : null}
          <rect
            x={gx + 2}
            y={gy + 4}
            width="4"
            height="3"
            className="fill-cobalt-bright"
          />
          <rect
            x={gx + 2}
            y={gy + 7}
            width="1"
            height="1"
            className="fill-foreground"
          />
          <rect
            x={gx + 5}
            y={gy + 7}
            width="1"
            height="1"
            className="fill-foreground"
          />
          {game.facing === "left" || game.facing === "right" ? (
            <rect
              x={game.facing === "left" ? gx : gx + 6}
              y={gy + 4}
              width="2"
              height="2"
              className="fill-ink-3"
            />
          ) : null}
        </g>
        {game.splash ? (
          <motion.g
            key={game.splash.n}
            className="fill-cobalt-bright"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
          >
            <rect
              x={game.splash.x * TILE + 2}
              y={TOP + game.splash.y * TILE + 1}
              width="1"
              height="1"
            />
            <rect
              x={game.splash.x * TILE + 5}
              y={TOP + game.splash.y * TILE + 2}
              width="1"
              height="1"
            />
            <rect
              x={game.splash.x * TILE + 3}
              y={TOP + game.splash.y * TILE + 3}
              width="1"
              height="1"
            />
          </motion.g>
        ) : null}
        <rect
          x="0"
          y="0"
          width="80"
          height={TOP - 1}
          className="fill-background"
        />
        <text
          x="3"
          y="7"
          fontSize="6"
          className="fill-foreground font-mono"
          letterSpacing="0.3"
        >
          GARDEN
        </text>
        <rect x="56" y="2" width="4" height="4" className="fill-danger" />
        <rect x="57" y="3" width="2" height="2" className="fill-warn" />
        <text
          x="77"
          y="7"
          fontSize="6"
          textAnchor="end"
          className="fill-foreground font-mono"
        >
          {bloom}/{BEDS.length}
        </text>
        {game.help && !game.paused ? (
          <g>
            <rect
              x="10"
              y="40"
              width="60"
              height="16"
              className="fill-background"
            />
            <text
              x="40"
              y="47"
              fontSize="5"
              textAnchor="middle"
              className="fill-foreground font-mono"
            >
              A WATER · B SOW
            </text>
            <text
              x="40"
              y="53.5"
              fontSize="5"
              textAnchor="middle"
              className="fill-ink-3 font-mono"
            >
              START PAUSES
            </text>
          </g>
        ) : null}
        {game.paused ? (
          <g>
            <rect
              x="0"
              y={TOP}
              width="80"
              height="48"
              className="fill-background/70"
            />
            <text
              x="40"
              y="37"
              fontSize="8"
              textAnchor="middle"
              className="fill-foreground font-mono"
            >
              PAUSED
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

/**
 * Fernworks Garden on a pocket console: the d-pad walks, A waters the bed
 * in front, B sows an empty one, Start pauses and Select shows the help. The
 * game is an ordinary keyboard game — the console's keys reach it as key
 * events.
 */
export function PocketConsoleDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [game, setGame] = React.useState<Game>(START);
  const [power, setPower] = React.useState(true);

  const onKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const key = event.key;
    setGame((g) => play(g, key));
  };

  const device = (
    <PocketConsole
      label="Fernworks Pocket"
      power={power}
      onPowerChange={setPower}
      sound={sound}
      {...values}
    >
      <GardenScreen game={game} onKey={onKey} />
    </PocketConsole>
  );

  if (!chrome) {
    return <div className="flex w-full max-w-[280px]">{device}</div>;
  }

  const bloom = game.beds.filter((b) => b.stage === 4).length;
  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      <div className="flex w-full max-w-[260px] self-center">{device}</div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {!power ? (
          <>
            <span className="text-signal">power off</span> · slide the switch
          </>
        ) : game.paused ? (
          <>
            <span className="text-signal">paused</span> · start to resume
          </>
        ) : (
          <>
            <span className="text-signal">
              {bloom} of {BEDS.length} in bloom
            </span>{" "}
            · at {game.x + 1},{game.y + 1} · facing {game.facing}
          </>
        )}
      </p>
    </div>
  );
}
