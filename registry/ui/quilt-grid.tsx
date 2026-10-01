"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  safe,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type QuiltGridPalette = "farm" | "sea" | "candy";

/** A wave the visitor started, for a host that narrates it. */
export type QuiltGridWave = {
  /** The block it started from, counted from 0 at the top left. */
  col: number;
  row: number;
  /** Blocks that turned a quarter turn. */
  turned: number;
  /** Blocks that traded places (always an even number). */
  swapped: number;
  /** A re-stitch (click, tap, Enter, Space) rather than a hover or an arrow key. */
  press: boolean;
};

export type QuiltGridProps = {
  /** Blocks across the width, 6 to 16. A block is never drawn smaller than 32px, so a narrow quilt has fewer. @default 10 */
  blocks?: number;
  /** How far a wave carries, 0 to 1: the block and its four neighbours, up to the whole quilt. @default 0.5 */
  wave?: number;
  /** The fabrics. @default "farm" */
  palette?: QuiltGridPalette;
  /** Which quilt: the motifs, fabrics and prints of every block follow from it. @default 1 */
  seed?: number;
  /** The keyboard surface's accessible name. @default "Patchwork quilt" */
  label?: string;
  /** A hover, an arrow key or a re-stitch started a wave. Ambient waves are not reported. */
  onWave?: (wave: QuiltGridWave) => void;
  /** Ambient only: the quilt ignores the pointer and the keyboard and leaves the tab order. */
  disabled?: boolean;
  /** What sits on the quilt: a hero, a heading. Rendered in a layer above it. */
  children?: React.ReactNode;
  /** The root fills its container (`h-full w-full`); size it here. */
  className?: string;
};

/** One block's side in the drawing's own units. */
const S = 48;
/** The smallest a block may be on screen, in px. */
const MIN_PX = 32;
/** At most one hover wave this often, in ms, so a sweep reads as waves, not churn. */
const HOVER_GAP = 500;
/** An arrow key held down starts a wave no more often than this, in ms. */
const KEY_GAP = 150;
/** The background colour lightness the pigments are tuned between. */
const BG_LIGHT = 0.985;
const BG_DARK = 0.145;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

function hash(...parts: number[]): number {
  let h = 2166136261;
  for (const p of parts) {
    h = Math.imul(h ^ (p >>> 0), 16777619);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

/** A small seeded generator: the same quilt and the same waves every time. */
function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ------------------------------------------------------------------ motifs */

type Pt = readonly [number, number];
type Patch = readonly [slot: 1 | 2 | 3, pts: readonly Pt[]];
type MotifDef = { patches: readonly Patch[]; stitch: readonly string[] };

/** "x y, x y, …" in the block's own units, 0 to 48 (thirds are 16 and 32). */
const P = (text: string): Pt[] =>
  text.split(",").map((pair): Pt => {
    const [x = 0, y = 0] = pair.trim().split(" ").map(Number);
    return [x, y];
  });

/** A quarter turn about the block's centre, k times. */
const turned = (pts: readonly Pt[], k: number): Pt[] => {
  let out: Pt[] = [...pts];
  for (let i = 0; i < k; i += 1) out = out.map(([x, y]): Pt => [S - y, x]);
  return out;
};
const fourWay = (slot: 1 | 2 | 3, text: string): Patch[] =>
  [0, 1, 2, 3].map((k): Patch => [slot, turned(P(text), k)]);
const box = (x0: number, y0: number, x1: number, y1: number) =>
  `${x0} ${y0}, ${x1} ${y0}, ${x1} ${y1}, ${x0} ${y1}`;
const ring = (lo: number, hi: number) => `${box(lo, lo, hi, hi)}, ${lo} ${lo}`;
/** The dark half of one log-cabin round: its right and bottom logs. */
const logs = (lo: number, hi: number, LO: number, HI: number) =>
  `${hi} ${LO}, ${HI} ${LO}, ${HI} ${HI}, ${LO} ${HI}, ${LO} ${hi}, ${hi} ${hi}`;
const CROSS = ["8 8, 40 40", "40 8, 8 40"];

/*
 * Twelve classic blocks. Slot 0 is the ground fabric (the block's
 * background); 1 is the main fabric, 2 an accent, 3 a third. Each carries the
 * quilting line a maker would sew on it, besides the running stitch every
 * block gets just inside its edge.
 */
const MOTIFS: readonly MotifDef[] = [
  // Half-square triangle: two lines a quarter-inch either side of the seam.
  {
    patches: [[1, P("48 0, 48 48, 0 48")]],
    stitch: ["4 37, 37 4", "11 44, 44 11"],
  },
  // Pinwheel.
  {
    patches: fourWay(1, "0 0, 24 0, 24 24"),
    stitch: ["24 8, 24 40", "8 24, 40 24"],
  },
  // Hourglass.
  {
    patches: [
      [1, P("0 0, 48 0, 24 24")],
      [1, P("0 48, 48 48, 24 24")],
    ],
    stitch: CROSS,
  },
  // Flying geese, two of them.
  {
    patches: [
      [1, P("0 24, 48 24, 24 0")],
      [2, P("0 48, 48 48, 24 24")],
    ],
    stitch: ["11 19, 24 7, 37 19", "11 43, 24 31, 37 43"],
  },
  // Log cabin: the hearth, then three rounds with the dark logs on two sides.
  {
    patches: [
      [2, P(box(18, 18, 30, 30))],
      [1, P(logs(18, 30, 12, 36))],
      [3, P(logs(12, 36, 6, 42))],
      [1, P(logs(6, 42, 0, 48))],
    ],
    stitch: [ring(9, 39)],
  },
  // Nine-patch.
  {
    patches: [
      [1, P(box(0, 0, 16, 16))],
      [1, P(box(32, 0, 48, 16))],
      [1, P(box(16, 16, 32, 32))],
      [1, P(box(0, 32, 16, 48))],
      [1, P(box(32, 32, 48, 48))],
    ],
    stitch: CROSS,
  },
  // Churn dash.
  {
    patches: [
      ...fourWay(1, "16 0, 16 16, 0 16"),
      ...fourWay(1, box(16, 8, 32, 16)),
    ],
    stitch: [ring(16, 32)],
  },
  // Ohio star: eight points round a centre square.
  {
    patches: [
      [2, P(box(16, 16, 32, 32))],
      ...fourWay(1, "16 0, 16 16, 24 8"),
      ...fourWay(1, "32 0, 32 16, 24 8"),
      ...fourWay(3, "16 16, 32 16, 24 8"),
    ],
    stitch: ["24 8, 40 24, 24 40, 8 24, 24 8"],
  },
  // Bow tie.
  {
    patches: [
      [1, P("0 0, 24 0, 24 14, 14 24, 0 24")],
      [1, P("48 48, 24 48, 24 34, 34 24, 48 24")],
      [2, P("24 14, 34 24, 24 34, 14 24")],
    ],
    stitch: ["24 11, 37 24, 24 37, 11 24, 24 11"],
  },
  // Rail fence.
  {
    patches: [
      [1, P(box(16, 0, 32, 48))],
      [2, P(box(32, 0, 48, 48))],
    ],
    stitch: ["8 8, 8 40", "24 8, 24 40", "40 8, 40 40"],
  },
  // Square in a square.
  {
    patches: [...fourWay(1, "0 0, 24 0, 0 24"), [2, P(box(12, 12, 36, 36))]],
    stitch: ["24 7, 41 24, 24 41, 7 24, 24 7"],
  },
  // Shoo-fly.
  {
    patches: [...fourWay(1, "16 0, 16 16, 0 16"), [3, P(box(16, 16, 32, 32))]],
    stitch: CROSS,
  },
];

type Motif = { slots: [string, string, string]; stitch: string };

const shape = (pts: readonly Pt[], close: boolean) =>
  `M ${pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join(" L ")}${close ? " Z" : ""}`;

/** Every block's running stitch, just inside its edge. */
const EDGE_STITCH = shape(P(ring(4, 44)), false);

/** Each motif as one path per fabric slot and one for its quilting. */
const COMPILED: readonly Motif[] = MOTIFS.map((m) => {
  const slots: [string, string, string] = ["", "", ""];
  for (const [slot, pts] of m.patches) {
    const i = slot - 1;
    slots[i] = `${slots[i] ?? ""} ${shape(pts, true)}`.trim();
  }
  const stitch = [EDGE_STITCH, ...m.stitch.map((l) => shape(P(l), false))].join(
    " ",
  );
  return { slots, stitch };
});

/* ---------------------------------------------------------------- palettes */

/** A fabric: its lightness on the light theme and on the dark one, its chroma, its hue. */
type Pigment = readonly [
  light: number,
  dark: number,
  chroma: number,
  hue: number,
];

type PaletteDef = {
  grounds: readonly [Pigment, Pigment];
  fabrics: readonly Pigment[];
  backing: Pigment;
  thread: Pigment;
};

/*
 * Fabrics are pigment, not text colour: a fixed chroma and hue, with a
 * lightness that follows the page's own background — the full dye on the
 * light theme, dimmed as dusk on the dark one, so a hero over the quilt
 * reads in both. The thread does the opposite, so the stitches always show.
 */
const pigment = ([light, dark, c, h]: Pigment) => {
  const b = (light - dark) / (BG_LIGHT - BG_DARK);
  const a = dark - BG_DARK * b;
  return `oklch(from var(--background) calc(${r4(a)} + l * ${r4(b)}) ${c} ${h})`;
};

const PALETTES: Record<QuiltGridPalette, PaletteDef> = {
  farm: {
    grounds: [
      [0.95, 0.54, 0.035, 85],
      [0.89, 0.5, 0.055, 80],
    ],
    fabrics: [
      [0.52, 0.38, 0.15, 28],
      [0.79, 0.55, 0.12, 85],
      [0.66, 0.46, 0.06, 140],
      [0.5, 0.37, 0.08, 250],
      [0.61, 0.43, 0.13, 50],
      [0.44, 0.32, 0.06, 60],
      [0.71, 0.5, 0.1, 15],
    ],
    backing: [0.36, 0.22, 0.04, 60],
    thread: [0.38, 0.84, 0.06, 40],
  },
  sea: {
    grounds: [
      [0.97, 0.55, 0.018, 230],
      [0.92, 0.52, 0.035, 200],
    ],
    fabrics: [
      [0.38, 0.29, 0.08, 255],
      [0.56, 0.4, 0.09, 200],
      [0.8, 0.56, 0.06, 170],
      [0.7, 0.5, 0.13, 32],
      [0.85, 0.58, 0.05, 80],
      [0.55, 0.4, 0.03, 240],
      [0.74, 0.52, 0.08, 230],
    ],
    backing: [0.32, 0.21, 0.05, 250],
    thread: [0.34, 0.86, 0.05, 250],
  },
  candy: {
    grounds: [
      [0.96, 0.55, 0.03, 85],
      [0.93, 0.53, 0.04, 10],
    ],
    fabrics: [
      [0.76, 0.52, 0.12, 355],
      [0.86, 0.58, 0.08, 165],
      [0.91, 0.62, 0.11, 100],
      [0.77, 0.52, 0.09, 305],
      [0.83, 0.57, 0.09, 55],
      [0.8, 0.55, 0.08, 230],
      [0.6, 0.43, 0.17, 0],
    ],
    backing: [0.45, 0.28, 0.06, 330],
    thread: [0.5, 0.84, 0.13, 355],
  },
};

const PALETTE_VARS: Record<QuiltGridPalette, Record<string, string>> = {
  farm: varsOf(PALETTES.farm),
  sea: varsOf(PALETTES.sea),
  candy: varsOf(PALETTES.candy),
};

function varsOf(p: PaletteDef): Record<string, string> {
  const out: Record<string, string> = {
    "--qg-g0": pigment(p.grounds[0]),
    "--qg-g1": pigment(p.grounds[1]),
    "--qg-back": pigment(p.backing),
    "--qg-thread": pigment(p.thread),
  };
  p.fabrics.forEach((f, i) => {
    out[`--qg-f${i}`] = pigment(f);
  });
  return out;
}

const FABRICS = 7;
const PRINTS = ["dots", "gingham", "ticking"] as const;

/* ------------------------------------------------------------------- grid */

type BlockMotion = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  /** Where it is heading: the lift reads its distance from here. */
  tx: MotionValue<number>;
  ty: MotionValue<number>;
  rot: MotionValue<number>;
  /** Opacity: only the reduced-motion change marker moves it. */
  dim: MotionValue<number>;
};

type BlockSpec = {
  id: string;
  col: number;
  row: number;
  motif: number;
  /** Ground index (0 or 1), then fabric indices for slots 1–3. */
  fab: readonly [number, number, number, number];
  /** Index into PRINTS for the main fabric, or -1 for plain. */
  print: number;
  turns: number;
  mv: BlockMotion;
};

type Grid = { cols: number; rows: number; blocks: readonly BlockSpec[] };

function buildGrid(cols: number, rows: number, seed: number): Grid {
  const blocks: BlockSpec[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      // Seeded by its cell, so a re-cut quilt keeps the blocks it had.
      const rand = lcg(hash(seed, col, row, 0x9e3779b9));
      const motif = Math.floor(rand() * MOTIFS.length);
      const ground = rand() < 0.82 ? 0 : 1;
      const pool = Array.from({ length: FABRICS }, (_, i) => i);
      const pick = () =>
        pool.splice(Math.floor(rand() * pool.length), 1)[0] ?? 0;
      const fab = [ground, pick(), pick(), pick()] as const;
      const print = rand() < 0.38 ? Math.floor(rand() * PRINTS.length) : -1;
      const turns = Math.floor(rand() * 4);
      const x = col * S;
      const y = row * S;
      blocks.push({
        id: `${col}-${row}`,
        col,
        row,
        motif,
        fab,
        print,
        turns,
        mv: {
          x: motionValue(x),
          y: motionValue(y),
          tx: motionValue(x),
          ty: motionValue(y),
          rot: motionValue(turns * 90),
          dim: motionValue(1),
        },
      });
    }
  }
  return { cols, rows, blocks };
}

/** A block's live state: where it is now and how far it has turned. */
type Live = {
  id: string;
  col: number;
  row: number;
  turns: number;
  /** A swap is pending or under way until this time (performance.now ms). */
  busy: number;
  mv: BlockMotion;
};

type Sim = {
  cols: number;
  rows: number;
  byId: Map<string, Live>;
  /** The block id in each cell, row by row. */
  at: (string | undefined)[];
  waves: number;
  lastHover: number;
  lastKey: number;
  lastCell: number;
  lastX: number;
  dir: 1 | -1;
  inside: boolean;
};

const simOf = (grid: Grid): Sim => ({
  cols: grid.cols,
  rows: grid.rows,
  byId: new Map(
    grid.blocks.map((b) => [
      b.id,
      { id: b.id, col: b.col, row: b.row, turns: b.turns, busy: 0, mv: b.mv },
    ]),
  ),
  at: grid.blocks.map((b) => b.id),
  waves: 0,
  lastHover: -Infinity,
  lastKey: -Infinity,
  lastCell: -1,
  lastX: 0,
  dir: 1,
  inside: false,
});

/** Stands in until the first cut is live; nothing is ever written to it. */
const EMPTY_SIM: Sim = Object.freeze(simOf({ cols: 0, rows: 0, blocks: [] }));

type WaveKind = "hover" | "press" | "ambient" | "preview";

type Api = {
  idle: () => void;
  ambient: () => void;
  preview: () => void;
};

/** Presses on the hero's own controls are theirs, not the quilt's. */
const CONTROLS =
  "a,button,input,select,textarea,label,summary,[role='button'],[role='link'],[contenteditable='true']";

/* ------------------------------------------------------------------ block */

const SEAM = "color-mix(in oklab, black 24%, transparent)";
const SHADOW = "color-mix(in oklab, black 55%, transparent)";
const PRINT_INK = "color-mix(in oklab, white 34%, transparent)";
/**
 * Fabric fills follow the palette on a tween; each block's `--qg-d` delays
 * it by the block's distance from the centre, so a new palette is a dye wave.
 * One rule on the layer, not a style on every path.
 */
const DYE =
  "**:transition-[fill,stroke] **:delay-(--qg-d) **:duration-(--qg-t) **:ease-[cubic-bezier(0.22,1,0.36,1)]";

const QuiltBlock = React.memo(function QuiltBlock({
  block,
  delay,
  prints,
}: {
  block: BlockSpec;
  delay: string;
  prints: string;
}) {
  const { mv } = block;
  // The block lifts while it moves and lands flat: at mid-turn (45°) and at
  // mid-slide (half a block from where it is going), from the values alone.
  const lift = useTransform(
    [mv.x, mv.y, mv.tx, mv.ty, mv.rot] as MotionValue<number>[],
    ([x = 0, y = 0, tx = 0, ty = 0, rot = 0]: number[]) => {
      const slide = Math.sin(Math.PI * clamp01(Math.hypot(x - tx, y - ty) / S));
      const spin = Math.abs(Math.sin((Math.PI * rot) / 90));
      return r3(Math.max(slide, spin));
    },
  );
  const scale = useTransform(lift, (l) => r3(1 + 0.05 * l));
  const shade = useTransform(lift, (l) => r3(0.3 * l));
  const motif = COMPILED[block.motif] ?? COMPILED[0];
  const fill = (slot: number) =>
    slot === 0
      ? `var(--qg-g${block.fab[0]})`
      : `var(--qg-f${block.fab[slot] ?? 0})`;
  const print = PRINTS[block.print];

  return (
    <motion.g style={{ x: mv.x, y: mv.y, opacity: mv.dim }}>
      <g transform="translate(1.5 2.5)">
        <motion.rect
          width={S}
          height={S}
          rx={1.5}
          style={{
            rotate: mv.rot,
            scale,
            originX: 0.5,
            originY: 0.5,
            opacity: shade,
            fill: SHADOW,
          }}
        />
      </g>
      <motion.g style={{ rotate: mv.rot, scale, originX: 0.5, originY: 0.5 }}>
        <g style={{ "--qg-d": delay } as React.CSSProperties}>
          <rect width={S} height={S} style={{ fill: fill(0) }} />
          {motif?.slots.map((d, i) =>
            d ? <path key={i} d={d} style={{ fill: fill(i + 1) }} /> : null,
          )}
          {print && motif?.slots[0] ? (
            <path
              d={motif.slots[0]}
              style={{ fill: `url(#${prints}-${print})` }}
            />
          ) : null}
          <path
            d={motif?.stitch}
            fill="none"
            strokeWidth={0.9}
            strokeDasharray="2.6 2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.8}
            style={{ stroke: "var(--qg-thread)" }}
          />
          <rect
            x={0.25}
            y={0.25}
            width={S - 0.5}
            height={S - 0.5}
            fill="none"
            strokeWidth={0.5}
            style={{ stroke: SEAM }}
          />
        </g>
      </motion.g>
    </motion.g>
  );
});

/* -------------------------------------------------------------- component */

/**
 * A patchwork quilt as a backdrop: twelve classic blocks — half-square
 * triangles, pinwheels, flying geese, log cabins, Ohio stars — cut from the
 * palette's fabrics (some printed), each with its seam and its running
 * stitch, drawn in SVG so it is crisp at any size and re-coloured by the
 * theme for free.
 *
 * Waves re-stitch it from the pointer. Entering a block sends a wave out
 * ring by ring (the delay per ring from `cascade`, so even a wave across the
 * whole quilt lands inside the budget); each block it reaches either turns a
 * quarter turn on the snap spring — one crisp overshoot, like a block turned
 * on the cutting mat — or trades places with its outward neighbour on the
 * glide spring. Moving blocks lift (a little larger, a soft shadow) at the
 * middle of their move and land flat, and the latest are drawn on top. A
 * press re-stitches: a wave where about half the blocks swap. While nobody
 * is pointing, a gentle wave starts somewhere every few seconds.
 *
 * The keyboard path is a real `role="application"` surface: arrow keys move
 * a stitched marker and turn the blocks round it, Enter or Space re-stitch
 * from it, and a re-stitch is announced once. Under reduced motion nothing
 * turns, slides or wanders: a wave changes its blocks at once and marks each
 * one with a short fade, because the new pattern is the point.
 */
export function QuiltGrid({
  blocks = 10,
  wave = 0.5,
  palette = "farm",
  seed = 1,
  label = "Patchwork quilt",
  onWave,
  disabled = false,
  children,
  className,
}: QuiltGridProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const prints = `${uid}-print`;

  const [size, setSize] = React.useState<{ w: number; h: number } | null>(null);
  const wanted = clamp(Math.round(blocks), 6, 16);
  // Until the quilt is measured it is cut for a wide card; `slice` keeps the
  // first paint filled whatever the box really is.
  const width = size?.w ?? 760;
  const aspect = size ? size.h / size.w : 232 / 760;
  const cols = Math.max(3, Math.min(wanted, Math.floor(width / MIN_PX)));
  const rows = Math.max(1, Math.ceil(cols * aspect - 1e-3));
  const grid = React.useMemo(
    () => buildGrid(cols, rows, seed),
    [cols, rows, seed],
  );

  const [rank, setRank] = React.useState<Record<string, number>>({});
  const [cursor, setCursor] = React.useState<number | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const sim = React.useRef<Sim>(EMPTY_SIM);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const top = React.useRef(0);
  const idle = React.useRef({ timer: 0, seen: false, focused: false });
  const api = React.useRef<Api | null>(null);

  const reach = clamp01(wave);
  const pal = PALETTE_VARS[palette] ?? PALETTE_VARS.farm;

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };

  // A new cut gets fresh live state; whatever the old one was doing stops.
  React.useEffect(() => {
    sim.current = simOf(grid);
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, [grid]);

  /** Under reduced motion a changed block dips and comes back, instead of moving. */
  const mark = (b: Live) => {
    b.mv.dim.set(0.45);
    run(
      `${b.id}:o`,
      animate(b.mv.dim, 1, { duration: durations.slow, ease: easings.enter }),
    );
  };

  const turn = (b: Live, dir: 1 | -1, delay: number) => {
    b.turns += dir;
    const to = b.turns * 90;
    if (!motionSafe) {
      halt(`${b.id}:r`);
      b.mv.rot.set(to);
      mark(b);
      return;
    }
    run(`${b.id}:r`, animate(b.mv.rot, to, { ...springs.snap, delay }));
  };

  const swap = (a: Live, b: Live, delay: number, now: number) => {
    const s = sim.current;
    const col = a.col;
    const row = a.row;
    a.col = b.col;
    a.row = b.row;
    b.col = col;
    b.row = row;
    for (const blk of [a, b]) {
      s.at[blk.row * s.cols + blk.col] = blk.id;
      const x = blk.col * S;
      const y = blk.row * S;
      blk.mv.tx.set(x);
      blk.mv.ty.set(y);
      blk.busy = now + delay * 1000 + 650;
      if (!motionSafe) {
        halt(`${blk.id}:x`);
        halt(`${blk.id}:y`);
        blk.mv.x.set(x);
        blk.mv.y.set(y);
        mark(blk);
      } else {
        run(`${blk.id}:x`, animate(blk.mv.x, x, { ...springs.glide, delay }));
        run(`${blk.id}:y`, animate(blk.mv.y, y, { ...springs.glide, delay }));
      }
    }
  };

  /** A wave from one block: it turns or swaps every block within reach, ring by ring. */
  const startWave = (oc: number, or: number, kind: WaveKind, dir: 1 | -1) => {
    const s = sim.current;
    if (s.byId.size === 0) return null;
    const most = Math.hypot(s.cols - 1, s.rows - 1) + 0.5;
    const full = lerp(1.15, most, reach);
    const radius = kind === "ambient" ? Math.max(1.15, full * 0.5) : full;
    const perRing = cascade(Math.ceil(radius) + 1);
    const share = kind === "press" ? 0.55 : kind === "hover" ? 0.25 : 0.2;
    s.waves += 1;
    const rand = lcg(hash(seed, s.waves, oc, or, 0x2545f491));
    const now = performance.now();

    const cells: { c: number; r: number; d: number }[] = [];
    for (let r = 0; r < s.rows; r += 1) {
      for (let c = 0; c < s.cols; c += 1) {
        const d = Math.hypot(c - oc, r - or);
        if (d <= radius + 1e-6) cells.push({ c, r, d });
      }
    }
    cells.sort((p, q) => p.d - q.d);

    const taken = new Set<string>();
    const order: string[] = [];
    let turnedCount = 0;
    let swappedCount = 0;
    for (const cell of cells) {
      const id = s.at[cell.r * s.cols + cell.c];
      const b = id ? s.byId.get(id) : undefined;
      if (!id || !b || taken.has(id) || b.busy > now) continue;
      const delay = motionSafe ? r3(cell.d * perRing) : 0;
      if (rand() < share) {
        // Swap outward, along whichever axis the wave is mostly travelling.
        const dx = cell.c - oc;
        const dy = cell.r - or;
        let sx = 0;
        let sy = 0;
        if (dx === 0 && dy === 0) {
          const k = Math.floor(rand() * 4);
          sx = k === 0 ? 1 : k === 2 ? -1 : 0;
          sy = k === 1 ? 1 : k === 3 ? -1 : 0;
        } else if (Math.abs(dx) >= Math.abs(dy)) sx = Math.sign(dx);
        else sy = Math.sign(dy);
        const nc = cell.c + sx;
        const nr = cell.r + sy;
        if (nc >= 0 && nr >= 0 && nc < s.cols && nr < s.rows) {
          const nid = s.at[nr * s.cols + nc];
          const nb = nid ? s.byId.get(nid) : undefined;
          if (nid && nb && !taken.has(nid) && nb.busy <= now) {
            taken.add(id);
            taken.add(nid);
            swap(b, nb, delay, now);
            swappedCount += 2;
            // The block heading outward rides over the one coming in.
            order.push(id, nid);
            continue;
          }
        }
      }
      taken.add(id);
      turn(b, dir, delay);
      turnedCount += 1;
      order.push(id);
    }

    if (order.length > 0) {
      // Later rings are drawn over earlier ones, so a lifted corner is never
      // hidden under a neighbour that has already landed.
      const fresh: Record<string, number> = {};
      let n = top.current;
      for (const id of order) {
        n += 1;
        fresh[id] = n;
      }
      top.current = n;
      setRank((prev) => ({ ...prev, ...fresh }));
    }
    return { turned: turnedCount, swapped: swappedCount };
  };

  const report = (col: number, row: number, kind: WaveKind, dir: 1 | -1) => {
    const done = startWave(col, row, kind, dir);
    if (!done || kind === "ambient") return;
    const press = kind === "press";
    if (press) {
      const n = done.turned + done.swapped;
      setSaid((p) => ({
        n: p.n + 1,
        text: `Re-stitched ${n} block${n === 1 ? "" : "s"}.`,
      }));
    }
    onWave?.({ col, row, turned: done.turned, swapped: done.swapped, press });
  };

  const cellAt = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const rect = svg?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    const vw = cols * S;
    const vh = rows * S;
    const k = Math.max(rect.width / vw, rect.height / vh);
    const x = (clientX - rect.left - (rect.width - vw * k) / 2) / k;
    const y = (clientY - rect.top - (rect.height - vh * k) / 2) / k;
    const col = Math.floor(x / S);
    const row = Math.floor(y / S);
    if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
    return { col, row };
  };

  const fromControl = (target: EventTarget | null) => {
    const root = rootRef.current;
    if (!(target instanceof Element) || !root) return false;
    const hit = target.closest(CONTROLS);
    return Boolean(hit && root.contains(hit));
  };

  /* ---------------------------------------------------------- ambient life */

  const stopIdle = React.useCallback(() => {
    window.clearTimeout(idle.current.timer);
    idle.current.timer = 0;
  }, []);

  // Ambient waves only while the quilt is on screen, the page is visible,
  // motion is welcome and nobody is pointing at it or driving it.
  const reconcileIdle = () => {
    const l = idle.current;
    if (!motionSafe || !l.seen || document.hidden) {
      stopIdle();
      return;
    }
    if (l.timer) return;
    const s = sim.current;
    const gap = 4200 + lcg(hash(seed, s.waves, 0x68e31da4))() * 2400;
    l.timer = window.setTimeout(() => {
      l.timer = 0;
      api.current?.ambient();
      api.current?.idle();
    }, Math.round(gap));
  };

  const ambient = () => {
    const s = sim.current;
    if (s.inside || idle.current.focused || s.byId.size === 0) return;
    const rand = lcg(hash(seed, s.waves, 0x51ed270b));
    const index = Math.floor(rand() * s.cols * s.rows);
    report(
      index % s.cols,
      Math.floor(index / s.cols),
      "ambient",
      s.waves % 2 ? 1 : -1,
    );
  };

  React.useEffect(() => {
    api.current = {
      idle: reconcileIdle,
      ambient,
      preview: () => {
        const s = sim.current;
        if (!motionSafe || s === EMPTY_SIM) return;
        startWave(
          Math.round((s.cols - 1) / 2),
          Math.round((s.rows - 1) / 2),
          "preview",
          1,
        );
      },
    };
  });

  // A new reach shows itself: a wave from the middle carries exactly as far
  // as the new value says (not on the first run, and not under reduced
  // motion, where nothing moves on its own).
  const shownReach = React.useRef(reach);
  React.useEffect(() => {
    if (shownReach.current === reach) return;
    shownReach.current = reach;
    api.current?.preview();
  }, [reach]);

  // Reduced motion switched on mid-wave: everything lands where it was going.
  React.useEffect(() => {
    if (motionSafe) {
      api.current?.idle();
      return;
    }
    stopIdle();
    for (const c of anims.current.values()) c.stop();
    anims.current.clear();
    for (const b of sim.current.byId.values()) {
      b.mv.x.set(b.mv.tx.get());
      b.mv.y.set(b.mv.ty.get());
      b.mv.rot.set(b.turns * 90);
      b.mv.dim.set(1);
    }
  }, [motionSafe, stopIdle]);

  React.useEffect(() => {
    const onVisibility = () => api.current?.idle();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stopIdle();
    };
  }, [stopIdle]);

  // Size and visibility, bound to the node when it arrives.
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const measure = () => {
      const w = Math.round(node.clientWidth);
      const h = Math.round(node.clientHeight);
      if (w < 1 || h < 1) return;
      setSize((p) => (p && p.w === w && p.h === h ? p : { w, h }));
    };
    measure();
    const sizer = new ResizeObserver(measure);
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      idle.current.seen = Boolean(entry?.isIntersecting);
      api.current?.idle();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      idle.current.seen = false;
      window.clearTimeout(idle.current.timer);
      idle.current.timer = 0;
    };
  }, []);

  /* --------------------------------------------------------------- render */

  const ordered = React.useMemo(
    () =>
      [...grid.blocks].sort((a, b) => (rank[a.id] ?? 0) - (rank[b.id] ?? 0)),
    [grid, rank],
  );
  const centreCol = (cols - 1) / 2;
  const centreRow = (rows - 1) / 2;
  const middle = Math.round(centreRow) * cols + Math.round(centreCol);
  const shown = cursor === null ? null : Math.min(cursor, cols * rows - 1);

  const style = {
    ...pal,
    "--qg-t": motionSafe ? "480ms" : `${durations.fast * 1000}ms`,
  } as React.CSSProperties;

  return (
    <div
      ref={bindRoot}
      style={style}
      className={cn(
        "relative isolate h-full w-full touch-pan-y overflow-clip",
        className,
      )}
      onPointerMove={(event) => {
        const s = sim.current;
        if (disabled || s === EMPTY_SIM) return;
        s.inside = true;
        const dx = event.clientX - s.lastX;
        s.lastX = event.clientX;
        if (Math.abs(dx) > 0.5) s.dir = dx > 0 ? 1 : -1;
        const cell = cellAt(event.clientX, event.clientY);
        if (!cell) return;
        const index = cell.row * cols + cell.col;
        if (index === s.lastCell) return;
        s.lastCell = index;
        const now = performance.now();
        if (now - s.lastHover < HOVER_GAP) return;
        s.lastHover = now;
        report(cell.col, cell.row, "hover", s.dir);
      }}
      onPointerLeave={() => {
        const s = sim.current;
        if (s === EMPTY_SIM) return;
        s.inside = false;
        s.lastCell = -1;
      }}
      onClick={(event) => {
        if (disabled || fromControl(event.target)) return;
        const cell = cellAt(event.clientX, event.clientY);
        if (cell) report(cell.col, cell.row, "press", 1);
      }}
    >
      <svg
        ref={svgRef}
        aria-hidden
        viewBox={`0 0 ${cols * S} ${rows * S}`}
        preserveAspectRatio="xMidYMid slice"
        className="pointer-events-none absolute inset-0 block size-full"
      >
        <defs>
          <pattern
            id={`${prints}-dots`}
            width={6}
            height={6}
            patternUnits="userSpaceOnUse"
          >
            <circle cx={1.5} cy={1.5} r={0.8} style={{ fill: PRINT_INK }} />
            <circle cx={4.5} cy={4.5} r={0.8} style={{ fill: PRINT_INK }} />
          </pattern>
          <pattern
            id={`${prints}-gingham`}
            width={8}
            height={8}
            patternUnits="userSpaceOnUse"
          >
            <rect width={4} height={8} style={{ fill: PRINT_INK }} />
            <rect width={8} height={4} style={{ fill: PRINT_INK }} />
          </pattern>
          <pattern
            id={`${prints}-ticking`}
            width={5}
            height={5}
            patternUnits="userSpaceOnUse"
          >
            <rect width={1.1} height={5} style={{ fill: PRINT_INK }} />
          </pattern>
        </defs>
        <g className={DYE}>
          <rect
            width={cols * S}
            height={rows * S}
            style={{ fill: "var(--qg-back)" }}
          />
          {ordered.map((b) => (
            <QuiltBlock
              key={b.id}
              block={b}
              prints={prints}
              delay={
                motionSafe
                  ? `${Math.round(Math.hypot(b.col - centreCol, b.row - centreRow) * 45)}ms`
                  : "0ms"
              }
            />
          ))}
        </g>
        {shown !== null ? (
          <motion.g
            initial={false}
            animate={{
              x: (shown % cols) * S,
              y: Math.floor(shown / cols) * S,
            }}
            transition={safe(springs.snap, { duration: 0 })(motionSafe)}
          >
            <rect
              x={2.5}
              y={2.5}
              width={S - 5}
              height={S - 5}
              rx={3}
              fill="none"
              strokeWidth={4.5}
              style={{ stroke: "var(--background)" }}
            />
            <rect
              x={2.5}
              y={2.5}
              width={S - 5}
              height={S - 5}
              rx={3}
              fill="none"
              strokeWidth={2.2}
              strokeDasharray="4.5 3"
              strokeLinecap="round"
              style={{ stroke: "var(--ring)" }}
            />
          </motion.g>
        ) : null}
      </svg>

      <div
        role="application"
        aria-roledescription="quilt"
        aria-label={label}
        aria-describedby={hintId}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onFocus={(event) => {
          idle.current.focused = true;
          if (!disabled && event.currentTarget.matches(":focus-visible")) {
            setCursor((c) => c ?? middle);
          }
        }}
        onBlur={() => {
          idle.current.focused = false;
          setCursor(null);
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          const from = shown ?? middle;
          let c = from % cols;
          let r = Math.floor(from / cols);
          let dir: 1 | -1 = 1;
          switch (event.key) {
            case "ArrowRight":
              c = Math.min(cols - 1, c + 1);
              break;
            case "ArrowLeft":
              c = Math.max(0, c - 1);
              dir = -1;
              break;
            case "ArrowDown":
              r = Math.min(rows - 1, r + 1);
              break;
            case "ArrowUp":
              r = Math.max(0, r - 1);
              dir = -1;
              break;
            case "Home":
              c = 0;
              dir = -1;
              break;
            case "End":
              c = cols - 1;
              break;
            case "Enter":
            case " ":
              event.preventDefault();
              setCursor(from);
              if (!event.repeat) report(c, r, "press", 1);
              return;
            default:
              return;
          }
          event.preventDefault();
          const next = r * cols + c;
          setCursor(next);
          const s = sim.current;
          const now = performance.now();
          if (s === EMPTY_SIM) return;
          if ((next === from && shown !== null) || now - s.lastKey < KEY_GAP) {
            return;
          }
          s.lastKey = now;
          report(c, r, "hover", dir);
        }}
        className={cn(
          "absolute inset-0 rounded-[inherit] outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />

      {children !== undefined && children !== null ? (
        <div className="relative h-full w-full">{children}</div>
      ) : null}

      <p id={hintId} className="sr-only">
        Arrow keys move the stitch marker and turn the blocks around it; Enter
        or Space re-stitches the quilt from it.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
