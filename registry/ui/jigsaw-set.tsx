"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import {
  project,
  rubberClamp,
  useDrag,
  type DragInfo,
} from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type JigsawSetPieces = "3" | "4" | "5";

export type JigsawSetProps = {
  /** What the picture shows. Always its accessible name. */
  alt: string;
  /** The picture's address. Without it, `children` is the picture. */
  src?: string;
  /** The finished picture when there is no `src`: an inline SVG or an image. */
  children?: React.ReactNode;
  /** Controlled: the picture may show. Uncontrolled, it is ready once it exists and the board is all but done. */
  ready?: boolean;
  /** 0 to 1: how much of the board may be put together while not ready. */
  progress?: number;
  /** Fires once the last piece is in and the seams have gone. */
  onReady?: () => void;
  /** Every piece that locks into place, by hand or not, with the count so far. */
  onPlace?: (placed: number, total: number) => void;
  /** How fast the pieces arrive and are put together, 0.5 to 2. @default 1 */
  speed?: number;
  /** The cut: 3 × 3, 4 × 4 or 5 × 5 pieces. @default "4" */
  pieces?: JigsawSetPieces;
  /** How far from home, and how turned, the tipped-out pieces lie, 0 to 1. @default 0.6 */
  scatter?: number;
  /** Play the snap and click of a piece placed by hand. Off unless asked for. @default false */
  sound?: boolean;
  /** The puzzle still assembles itself; pieces cannot be moved. */
  disabled?: boolean;
  /** Sizes the tray. @default "aspect-[4/3] w-full" */
  className?: string;
};

/** How far a tab reaches past its cell, in cells: the tray's rim. */
const TAB = 0.28;
/** Clock seconds (at speed 1) to put a whole board together. */
const SOLVE = 2.6;
/** The last piece hovers this long before an uncontrolled picture is ready. */
const HOVER = 0.6;
/** How high the last piece hovers over its slot. */
const HOVER_Y = -distances.step;
/** A released piece within this share of a cell of home is pulled in. */
const REACH = 0.42;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const pct = (v: number) => `${r3(v * 100)}%`;

/** A small seeded generator: the same cut every time. */
function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}

/** x0 y0, x1 y1, x2 y2, x3 y3: one cubic, in cells. */
type Cubic = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

const straight = (ax: number, ay: number, bx: number, by: number): Cubic[] => [
  [
    ax,
    ay,
    ax + (bx - ax) / 3,
    ay + (by - ay) / 3,
    ax + ((bx - ax) * 2) / 3,
    ay + ((by - ay) * 2) / 3,
    bx,
    by,
  ],
];

const reverse = (edge: Cubic[]): Cubic[] =>
  [...edge]
    .reverse()
    .map((q) => [q[6], q[7], q[4], q[5], q[2], q[3], q[0], q[1]] as const);

/**
 * A tab along an edge from (0, 0) to (1, 0), bulging toward +y: a short
 * shoulder, a neck that pinches in, a round head, and back. `c` is where it
 * sits along the edge and `s` its size.
 */
function tab(c: number, s: number): [number, number][][] {
  return [
    [
      [0, 0],
      [(c - 0.17 * s) / 3, 0],
      [((c - 0.17 * s) * 2) / 3, 0],
      [c - 0.17 * s, 0],
    ],
    [
      [c - 0.17 * s, 0],
      [c - 0.07 * s, 0],
      [c - 0.04 * s, 0.035 * s],
      [c - 0.075 * s, 0.095 * s],
    ],
    [
      [c - 0.075 * s, 0.095 * s],
      [c - 0.12 * s, 0.16 * s],
      [c - 0.15 * s, 0.25 * s],
      [c, 0.25 * s],
    ],
    [
      [c, 0.25 * s],
      [c + 0.15 * s, 0.25 * s],
      [c + 0.12 * s, 0.16 * s],
      [c + 0.075 * s, 0.095 * s],
    ],
    [
      [c + 0.075 * s, 0.095 * s],
      [c + 0.04 * s, 0.035 * s],
      [c + 0.07 * s, 0],
      [c + 0.17 * s, 0],
    ],
    [
      [c + 0.17 * s, 0],
      [c + 0.17 * s + (1 - c - 0.17 * s) / 3, 0],
      [c + 0.17 * s + ((1 - c - 0.17 * s) * 2) / 3, 0],
      [1, 0],
    ],
  ];
}

type PieceGeo = {
  id: number;
  r: number;
  c: number;
  border: boolean;
  /** The outline in the piece's own box, 0 to 1: its clip and its edge. */
  local: string;
  /** The outline on the board, in cells: its slot. */
  slot: string;
};

type Cut = { n: number; pieces: PieceGeo[]; lines: string };

/**
 * The cut. Every inner edge is made once, globally, with a seeded tab, so the
 * two pieces either side of it share exactly the same curve: one runs it
 * forward, the other reversed.
 */
function makeCut(n: number): Cut {
  const rand = lcg(0x1209 + n * 7919);
  const shaped = (
    map: (x: number, y: number) => readonly [number, number],
  ): Cubic[] => {
    const dir = rand() < 0.5 ? 1 : -1;
    const c = 0.5 + (rand() - 0.5) * 0.12;
    const s = 1 + (rand() - 0.5) * 0.14;
    return tab(c, s).map((seg) => {
      const pts = seg.map(([x, y]) => map(x, y * dir));
      return [
        pts[0]![0],
        pts[0]![1],
        pts[1]![0],
        pts[1]![1],
        pts[2]![0],
        pts[2]![1],
        pts[3]![0],
        pts[3]![1],
      ] as const;
    });
  };
  // Horizontal edges under row r, from (c, r + 1) to (c + 1, r + 1).
  const across: Cubic[][][] = [];
  for (let r = 0; r < n - 1; r += 1) {
    across.push(
      Array.from({ length: n }, (_, c) =>
        shaped((x, y) => [c + x, r + 1 + y] as const),
      ),
    );
  }
  // Vertical edges right of column c, from (c + 1, r) to (c + 1, r + 1).
  const down: Cubic[][][] = [];
  for (let c = 0; c < n - 1; c += 1) {
    down.push(
      Array.from({ length: n }, (_, r) =>
        shaped((x, y) => [c + 1 + y, r + x] as const),
      ),
    );
  }
  const draw = (
    edges: Cubic[][],
    at: (x: number, y: number) => readonly [number, number],
  ) => {
    const first = edges[0]?.[0];
    if (!first) return "";
    const [sx, sy] = at(first[0], first[1]);
    let d = `M${r3(sx)} ${r3(sy)}`;
    for (const edge of edges) {
      for (const q of edge) {
        const a = at(q[2], q[3]);
        const b = at(q[4], q[5]);
        const e = at(q[6], q[7]);
        d += `C${r3(a[0])} ${r3(a[1])} ${r3(b[0])} ${r3(b[1])} ${r3(e[0])} ${r3(e[1])}`;
      }
    }
    return `${d}Z`;
  };
  const pieces: PieceGeo[] = [];
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      const top = r === 0 ? straight(c, r, c + 1, r) : across[r - 1]![c]!;
      const right =
        c === n - 1 ? straight(c + 1, r, c + 1, r + 1) : down[c]![r]!;
      const bottom =
        r === n - 1
          ? straight(c + 1, r + 1, c, r + 1)
          : reverse(across[r]![c]!);
      const left =
        c === 0 ? straight(c, r + 1, c, r) : reverse(down[c - 1]![r]!);
      const edges = [top, right, bottom, left];
      const span = 1 + 2 * TAB;
      pieces.push({
        id: r * n + c,
        r,
        c,
        border: r === 0 || c === 0 || r === n - 1 || c === n - 1,
        local: draw(edges, (x, y) => [
          (x - c + TAB) / span,
          (y - r + TAB) / span,
        ]),
        slot: draw(edges, (x, y) => [x, y]),
      });
    }
  }
  let lines = "";
  const line = (edge: Cubic[]) => {
    const f = edge[0];
    if (!f) return;
    lines += `M${r3(f[0])} ${r3(f[1])}`;
    for (const q of edge) {
      lines += `C${r3(q[2])} ${r3(q[3])} ${r3(q[4])} ${r3(q[5])} ${r3(q[6])} ${r3(q[7])}`;
    }
  };
  for (const row of across) for (const edge of row) line(edge);
  for (const col of down) for (const edge of col) line(edge);
  return { n, pieces, lines };
}

const CUTS: Record<JigsawSetPieces, Cut> = {
  "3": makeCut(3),
  "4": makeCut(4),
  "5": makeCut(5),
};

/* ----------------------------------------------------------------- piece */

type Handle = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  rotate: MotionValue<number>;
  scale: MotionValue<number>;
  lift: MotionValue<number>;
  shine: MotionValue<number>;
  opacity: MotionValue<number>;
  z: MotionValue<number>;
  node: HTMLButtonElement | null;
};

type PieceProps = {
  geo: PieceGeo;
  n: number;
  clipId: string;
  label: string;
  hintId: string;
  placed: boolean;
  focusable: boolean;
  disabled: boolean;
  register: (id: number, handle: Handle | null) => void;
  onGrab: (id: number) => void;
  onMove: (id: number, info: DragInfo) => void;
  onRelease: (id: number, info: DragInfo | null) => void;
  onPlace: (id: number) => void;
  onKey: (id: number, event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onFocusPiece: (id: number) => void;
  picture: React.ReactNode;
};

const JigsawPiece = React.memo(function JigsawPiece({
  geo,
  n,
  clipId,
  label,
  hintId,
  placed,
  focusable,
  disabled,
  register,
  onGrab,
  onMove,
  onRelease,
  onPlace,
  onKey,
  onFocusPiece,
  picture,
}: PieceProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useMotionValue(0);
  const scale = useMotionValue(1);
  const lift = useMotionValue(0);
  const shine = useMotionValue(0);
  const opacity = useMotionValue(0);
  const z = useMotionValue(1);

  const shadow = useTransform(lift, (l) =>
    l < 0.01
      ? "none"
      : `drop-shadow(0 ${r2(1 + 7 * l)}px ${r2(1.5 + 7 * l)}px color-mix(in oklab, black ${Math.round(16 + 16 * l)}%, transparent))`,
  );
  const shineOpacity = useTransform(shine, (v) => r2(v));

  const bind = React.useCallback(
    (node: HTMLButtonElement | null) => {
      register(geo.id, {
        x,
        y,
        rotate,
        scale,
        lift,
        shine,
        opacity,
        z,
        node,
      });
      return () => register(geo.id, null);
    },
    [geo.id, lift, opacity, register, rotate, scale, shine, x, y, z],
  );

  const drag = useDrag({
    threshold: 3,
    disabled: disabled || placed,
    onStart: () => onGrab(geo.id),
    onMove: (info) => onMove(geo.id, info),
    onEnd: (info) => onRelease(geo.id, info),
    onCancel: () => onRelease(geo.id, null),
    onTap: () => onPlace(geo.id),
  });

  const span = 1 + 2 * TAB;
  const whole = n + 2 * TAB;
  return (
    <motion.button
      ref={bind}
      type="button"
      tabIndex={focusable ? 0 : -1}
      inert={placed || undefined}
      disabled={disabled}
      aria-label={label}
      aria-describedby={hintId}
      onClick={(event) => {
        // Pointer presses arrive through the drag's tap; a click with no
        // pointer behind it (Enter, Space) places the piece the same way.
        if (event.detail === 0) onPlace(geo.id);
      }}
      onKeyDown={(event) => onKey(geo.id, event)}
      onFocus={() => onFocusPiece(geo.id)}
      className={cn(
        "pointer-events-none absolute rounded-2 outline-none",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
      )}
      style={{
        left: pct(geo.c / whole),
        top: pct(geo.r / whole),
        width: pct(span / whole),
        height: pct(span / whole),
        x,
        y,
        rotate,
        scale,
        opacity,
        zIndex: z,
        filter: shadow,
      }}
    >
      <span
        {...drag}
        className={cn(
          "absolute inset-0 touch-none select-none [-webkit-touch-callout:none]",
          placed || disabled
            ? "pointer-events-none"
            : "pointer-events-auto cursor-grab active:cursor-grabbing",
        )}
        style={{ clipPath: `url(#${clipId})` }}
      >
        <span
          aria-hidden
          inert
          className="absolute bg-surface-1 [&>img]:size-full [&>svg]:block [&>svg]:size-full"
          style={{
            left: pct((TAB - geo.c) / span),
            top: pct((TAB - geo.r) / span),
            width: pct(n / span),
            height: pct(n / span),
          }}
        >
          {picture}
        </span>
      </span>
      <svg
        aria-hidden
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 size-full overflow-visible"
      >
        <path
          d={geo.local}
          fill="none"
          vectorEffect="non-scaling-stroke"
          strokeWidth={1}
          style={{
            stroke: "color-mix(in oklab, black 30%, transparent)",
          }}
        />
        <motion.path
          d={geo.local}
          fill="none"
          vectorEffect="non-scaling-stroke"
          strokeWidth={1.5}
          style={{
            stroke: "color-mix(in oklab, white 85%, transparent)",
            opacity: shineOpacity,
          }}
        />
      </svg>
    </motion.button>
  );
});

/* ------------------------------------------------------------- component */

type Status = "box" | "out" | "moving" | "hover" | "held" | "placed";

type PieceRun = {
  status: Status;
  /** Where it lies, as a share of the tray, from home. */
  dx: number;
  dy: number;
  rot: number;
  anims: AnimationPlaybackControls[];
  start: { x: number; y: number };
};

const freshRuns = (count: number): PieceRun[] =>
  Array.from({ length: count }, () => ({
    status: "box" as Status,
    dx: 0,
    dy: 0,
    rot: 0,
    anims: [],
    start: { x: 0, y: 0 },
  }));

type Api = {
  kick: () => void;
  readyChanged: (ready: boolean) => void;
  resize: () => void;
};

/**
 * An image placeholder that puts the picture together as a jigsaw in its
 * tray. The pieces are the picture itself, cut with real tabs that interlock;
 * they are tipped out across the tray, then put together edges first, each
 * lifting, travelling home and dropping in with a lock. The last piece
 * hovers over its slot until the picture is ready, then clicks in, and the
 * seams fade.
 *
 * Any piece not yet in place can be dragged by hand: it straightens under
 * the finger, its slot lights as it nears, and released close enough it is
 * pulled in on a spring with a snap and a click. Pieces are real buttons in
 * one roving group: arrow keys move between them and Enter places one.
 * Under reduced motion nothing travels or bounces: pieces fade in where
 * they lie, each placement is an instant move into its slot, and the last
 * piece waits there at half strength until ready.
 */
export function JigsawSet({
  alt,
  src,
  children,
  ready,
  progress,
  onReady,
  onPlace,
  speed = 1,
  pieces = "4",
  scatter = 0.6,
  sound = false,
  disabled = false,
  className,
}: JigsawSetProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const clipBase = `${uid.replace(/[^a-zA-Z0-9_-]/g, "")}-piece`;
  const cut = CUTS[pieces] ?? CUTS["4"];
  const n = cut.n;
  const total = n * n;
  const spd = Math.max(0.25, Math.min(4, speed));
  const spread = Math.min(1, Math.max(0, scatter));
  const whole = n + 2 * TAB;

  const [loadedSrc, setLoadedSrc] = React.useState<string | null>(null);
  const loaded = src === undefined || loadedSrc === src;
  const [ownReady, setOwnReady] = React.useState(false);
  const controlled = ready !== undefined;
  const isReady = controlled ? ready : ownReady && loaded;
  const [placed, setPlaced] = React.useState<boolean[]>(() =>
    Array.from({ length: total }, () => false),
  );
  const [focusId, setFocusId] = React.useState(0);
  const [done, setDone] = React.useState(false);
  const [lifting, setLifting] = React.useState(false);
  const [slot, setSlot] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  // A new cut is a new puzzle: the placed set belongs to the cut it was made for.
  const [shownTotal, setShownTotal] = React.useState(total);
  if (shownTotal !== total) {
    setShownTotal(total);
    setPlaced(Array.from({ length: total }, () => false));
    setFocusId(0);
    setDone(false);
    setLifting(false);
  }

  const wholeOpacity = useMotionValue(0);
  const glow = useMotionValue(0);
  const glowOpacity = useTransform(glow, (v) => r2(v));

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const pictureRef = React.useRef<HTMLDivElement | null>(null);
  const groupRef = React.useRef<HTMLDivElement | null>(null);
  const handles = React.useRef(new Map<number, Handle>());
  const runs = React.useRef<PieceRun[]>(freshRuns(total));
  const size = React.useRef({ w: 0, h: 0 });
  const frame = React.useRef(0);
  const visible = React.useRef(true);
  const stack = React.useRef(20);
  const others = React.useRef<AnimationPlaybackControls[]>([]);
  const timeline = React.useRef({
    clock: 0,
    last: 0,
    arrived: 0,
    nextAt: 0,
    hoverSince: -1,
    ownReady: false,
    resolving: false,
    placedCount: 0,
  });

  // The order pieces are tipped out in, and the order they are put together:
  // edges first, then the inside, the last piece an inside one.
  const plan = React.useMemo(() => {
    const rand = lcg(0x7177 + total);
    const ids = cut.pieces.map((p) => p.id);
    const tip = shuffle(ids, rand);
    const edge = shuffle(
      cut.pieces.filter((p) => p.border).map((p) => p.id),
      rand,
    );
    const inside = shuffle(
      cut.pieces.filter((p) => !p.border).map((p) => p.id),
      rand,
    );
    const lie = ids.map(() => ({ fx: rand(), fy: rand(), turn: rand() }));
    return { tip, solve: [...edge, ...inside], lie };
  }, [cut, total]);

  const latest = React.useRef({
    isReady,
    controlled,
    progress,
    spd,
    spread,
    motionSafe,
    disabled,
    onReady,
    onPlace,
    plan,
    total,
    n,
  });
  React.useEffect(() => {
    latest.current = {
      isReady,
      controlled,
      progress,
      spd,
      spread,
      motionSafe,
      disabled,
      onReady,
      onPlace,
      plan,
      total,
      n,
    };
  });

  const halt = (id: number) => {
    const run = runs.current[id];
    if (!run) return;
    for (const a of run.anims) a.stop();
    run.anims = [];
  };

  /** Home, in px, and the piece's size, for the tray as it is now. */
  const geometry = (id: number) => {
    const { w, h } = size.current;
    const L = latest.current;
    const wh = L.n + 2 * TAB;
    const c = id % L.n;
    const r = Math.floor(id / L.n);
    return {
      left: (c / wh) * w,
      top: (r / wh) * h,
      pw: ((1 + 2 * TAB) / wh) * w,
      ph: ((1 + 2 * TAB) / wh) * h,
      cell: Math.min(w, h) / wh,
    };
  };

  /** Where a piece tipped out of the box lies: inside the tray, turned. */
  const lieOf = (id: number) => {
    const L = latest.current;
    const { w, h } = size.current;
    const g = geometry(id);
    const spec = L.plan.lie[id] ?? { fx: 0.5, fy: 0.5, turn: 0.5 };
    const rot = (spec.turn - 0.5) * 2 * 28 * L.spread;
    const a = (Math.abs(rot) * Math.PI) / 180;
    // A turned piece needs more room: its box grows by the turn.
    const growX = (g.pw * (Math.cos(a) + Math.sin(a)) - g.pw) / 2;
    const growY = (g.ph * (Math.cos(a) + Math.sin(a)) - g.ph) / 2;
    const fx = growX + spec.fx * Math.max(0, w - g.pw - 2 * growX);
    const fy = growY + spec.fy * Math.max(0, h - g.ph - 2 * growY);
    const dx = (fx - g.left) * L.spread;
    const dy = (fy - g.top) * L.spread + (1 - L.spread) * -distances.step;
    return { dx, dy, rot };
  };

  const run = (id: number, controls: AnimationPlaybackControls) => {
    runs.current[id]?.anims.push(controls);
  };

  const placedCount = () =>
    runs.current.filter((r) => r.status === "placed").length;

  const resolve = () => {
    const t = timeline.current;
    if (t.resolving) return;
    t.resolving = true;
    setLifting(true);
    if (groupRef.current?.contains(document.activeElement)) {
      pictureRef.current?.focus({ preventScroll: true });
    }
    const L = latest.current;
    others.current.push(
      animate(wholeOpacity, 1, {
        duration: L.motionSafe ? durations.slow : durations.base,
        ease: easings.enter,
        onComplete: () => {
          setDone(true);
          latest.current.onReady?.();
        },
      }),
    );
  };

  const settle = () => {
    const t = timeline.current;
    const L = latest.current;
    if (t.resolving) return;
    if (!L.controlled && !t.ownReady && placedCount() === L.total) {
      t.ownReady = true;
      setOwnReady(true);
    }
    if (L.isReady && placedCount() === L.total) resolve();
  };

  /** A piece locks into its slot: a shine round its edge, and the count. */
  const seat = (id: number, byHand: boolean) => {
    const r = runs.current[id];
    const hd = handles.current.get(id);
    if (!r || !hd || r.status === "placed") return;
    halt(id);
    r.status = "placed";
    const L = latest.current;
    // A placed piece leaves the tab order; focus on it goes to the next free
    // piece, or to the picture once there is none.
    if (hd.node && hd.node === document.activeElement) {
      const next = nextFree(id, 1);
      const to = next === null ? null : handles.current.get(next)?.node;
      if (to && next !== null) {
        setFocusId(next);
        to.focus({ preventScroll: true });
      } else {
        pictureRef.current?.focus({ preventScroll: true });
      }
    }
    hd.z.set(1);
    hd.x.set(0);
    hd.y.set(0);
    hd.rotate.set(0);
    if (L.motionSafe) {
      run(id, animate(hd.scale, 1, springs.flick));
      run(id, animate(hd.lift, 0, springs.flick));
      hd.shine.set(1);
      run(id, animate(hd.shine, 0, { duration: 0.45, ease: easings.enter }));
    } else {
      hd.scale.set(1);
      hd.lift.set(0);
      hd.opacity.set(1);
    }
    const count = placedCount();
    timeline.current.placedCount = count;
    setPlaced((p) => p.map((v, i) => (i === id ? true : v)));
    if (byHand) {
      const rect = hd.node?.getBoundingClientRect();
      audio.play("click", {
        pitch: r2(0.9 + 0.3 * (count / L.total)),
        gain: 0.6,
        pan: rect ? panFrom(rect.left + rect.width / 2, rootRef.current) : 0,
      });
      setSaid((v) => ({
        n: v.n + 1,
        text: `Piece ${id + 1} placed, ${count} of ${L.total} in place.`,
      }));
    }
    L.onPlace?.(count, L.total);
    settle();
    kick();
  };

  /** The assembly's own move: lift, travel home, and drop in (or hover). */
  const travel = (id: number, mode: "place" | "hover" | "rush") => {
    const r = runs.current[id];
    const hd = handles.current.get(id);
    if (!r || !hd) return;
    halt(id);
    const L = latest.current;
    r.status = "moving";
    if (!L.motionSafe) {
      // Nothing travels: the piece is simply in its slot.
      hd.x.set(0);
      hd.y.set(0);
      hd.rotate.set(0);
      hd.scale.set(1);
      if (mode === "hover") {
        r.status = "hover";
        hd.z.set(2);
        timeline.current.hoverSince = timeline.current.clock;
        run(id, animate(hd.opacity, 0.5, { duration: durations.fast }));
        kick();
      } else {
        seat(id, false);
      }
      return;
    }
    hd.z.set(60 + (stack.current += 1));
    hd.opacity.set(1);
    run(id, animate(hd.scale, 1.05, springs.snap));
    run(id, animate(hd.lift, 1, springs.snap));
    run(id, animate(hd.rotate, 0, springs.glide));
    run(id, animate(hd.x, 0, springs.glide));
    run(
      id,
      animate(hd.y, mode === "hover" ? HOVER_Y : 0, {
        ...springs.glide,
        onComplete: () => {
          if (mode === "hover") hoverAt(id);
          else seat(id, false);
        },
      }),
    );
  };

  /** The last piece waits over its slot, bobbing, until the picture is ready. */
  const hoverAt = (id: number) => {
    const r = runs.current[id];
    const hd = handles.current.get(id);
    if (!r || !hd) return;
    r.status = "hover";
    timeline.current.hoverSince = timeline.current.clock;
    bob(id);
    kick();
  };

  const bob = (id: number) => {
    const r = runs.current[id];
    const hd = handles.current.get(id);
    if (!r || !hd || r.status !== "hover" || !latest.current.motionSafe) return;
    halt(id);
    run(
      id,
      animate(hd.y, [HOVER_Y, HOVER_Y - 3, HOVER_Y], {
        duration: 1.8,
        repeat: Infinity,
        ease: "easeInOut",
      }),
    );
  };

  /** Ready: the hovering piece drops in, a landing with two small bounces. */
  const drop = (id: number) => {
    const r = runs.current[id];
    const hd = handles.current.get(id);
    if (!r || !hd) return;
    halt(id);
    r.status = "moving";
    if (!latest.current.motionSafe) {
      seat(id, false);
      return;
    }
    run(id, animate(hd.scale, 1, springs.recoil));
    run(id, animate(hd.lift, 0, springs.glide));
    run(
      id,
      animate(hd.y, 0, {
        ...springs.recoil,
        onComplete: () => seat(id, false),
      }),
    );
  };

  /** Tipped out of the box: each piece lands where it lies. */
  const arrive = (id: number) => {
    const r = runs.current[id];
    const hd = handles.current.get(id);
    if (!r || !hd || r.status !== "box") return;
    const L = latest.current;
    r.status = "out";
    const lie = lieOf(id);
    r.dx = lie.dx / Math.max(1, size.current.w);
    r.dy = lie.dy / Math.max(1, size.current.h);
    r.rot = lie.rot;
    hd.x.set(r2(lie.dx));
    hd.y.set(r2(lie.dy));
    hd.rotate.set(r2(lie.rot));
    hd.z.set(10 + (stack.current += 1));
    run(
      id,
      animate(hd.opacity, 1, { duration: durations.fast, ease: easings.enter }),
    );
    if (L.motionSafe) {
      hd.scale.set(1.08);
      run(id, animate(hd.scale, 1, springs.recoil));
    }
  };

  const allowedCount = () => {
    const L = latest.current;
    if (L.isReady) return L.total;
    if (L.progress !== undefined) {
      return Math.floor(
        Math.min(1, Math.max(0, L.progress)) * (L.total - 1) + 1e-6,
      );
    }
    return L.total - 1;
  };

  const tick = (now: number) => {
    frame.current = 0;
    const t = timeline.current;
    const L = latest.current;
    if (t.resolving || size.current.w < 1) return;
    if (!visible.current || document.hidden) {
      t.last = 0;
      return;
    }
    const dt = t.last ? Math.min(0.05, (now - t.last) / 1000) : 0;
    t.last = now;
    t.clock += dt * L.spd;

    const step = cascade(L.total);
    while (t.arrived < L.total && t.clock >= 0.05 + t.arrived * step) {
      arrive(L.plan.tip[t.arrived]!);
      t.arrived += 1;
    }
    const arrivedAll = t.arrived >= L.total;
    const settleAt = 0.05 + L.total * step + (L.motionSafe ? 0.35 : 0);
    let busy = !arrivedAll || t.clock < settleAt;

    if (arrivedAll && t.clock >= settleAt) {
      const rs = runs.current;
      const free = L.plan.solve.filter((id) => rs[id]?.status === "out");
      const moving = rs.filter((r) => r.status === "moving").length;
      const unplaced = rs.filter((r) => r.status !== "placed").length;
      const hovering = rs.findIndex((r) => r.status === "hover");
      if (t.clock >= t.nextAt) {
        if (L.isReady) {
          if (hovering >= 0) drop(hovering);
          else if (free[0] !== undefined) travel(free[0], "rush");
          t.nextAt = t.clock + 0.06 * L.spd;
        } else {
          const target = allowedCount();
          const committed = L.total - unplaced + moving;
          if (committed < target && free.length > 0 && unplaced > 1) {
            travel(free[0]!, "place");
            t.nextAt = t.clock + SOLVE / L.total;
          } else if (
            target >= L.total - 1 &&
            unplaced === 1 &&
            free.length === 1 &&
            moving === 0
          ) {
            travel(free[0]!, "hover");
            t.nextAt = t.clock + SOLVE / L.total;
          }
        }
      }
      if (
        !L.controlled &&
        !t.ownReady &&
        hovering >= 0 &&
        t.hoverSince >= 0 &&
        t.clock - t.hoverSince >= HOVER
      ) {
        t.ownReady = true;
        setOwnReady(true);
      }
      // The loop only runs while the assembly has a move to make or a wait
      // to time; a finished move kicks it again.
      const target = allowedCount();
      const committed = L.total - unplaced + moving;
      busy =
        (free.length > 0 &&
          (L.isReady ||
            (committed < target && unplaced > 1) ||
            (target >= L.total - 1 && unplaced === 1))) ||
        (L.isReady && hovering >= 0) ||
        (!L.controlled && !t.ownReady && hovering >= 0);
    }
    if (busy) frame.current = window.requestAnimationFrame(tick);
    else t.last = 0;
  };

  const kick = () => {
    const t = timeline.current;
    if (frame.current || t.resolving || size.current.w < 1) return;
    if (!visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(tick);
  };

  /* ------------------------------------------------------------ by hand */

  const grab = (id: number) => {
    const r = runs.current[id];
    const hd = handles.current.get(id);
    const L = latest.current;
    if (!r || !hd || r.status === "placed" || L.disabled) return;
    halt(id);
    r.status = "held";
    r.start = { x: hd.x.get(), y: hd.y.get() };
    hd.z.set(200 + (stack.current += 1));
    hd.opacity.set(1);
    if (L.motionSafe) {
      run(id, animate(hd.scale, 1.06, springs.snap));
      run(id, animate(hd.lift, 1, springs.snap));
      run(id, animate(hd.rotate, 0, springs.snap));
    } else {
      hd.rotate.set(0);
    }
    setSlot(cut.pieces[id]?.slot ?? null);
    glow.set(0);
  };

  const bounds = (id: number) => {
    const g = geometry(id);
    const { w, h } = size.current;
    return {
      minX: -g.left,
      maxX: w - g.left - g.pw,
      minY: -g.top,
      maxY: h - g.top - g.ph,
      g,
    };
  };

  const moveHeld = (id: number, info: DragInfo) => {
    const r = runs.current[id];
    const hd = handles.current.get(id);
    if (!r || !hd || r.status !== "held") return;
    const b = bounds(id);
    const nx = rubberClamp(r.start.x + info.offset.x, b.minX, b.maxX, b.g.pw);
    const ny = rubberClamp(r.start.y + info.offset.y, b.minY, b.maxY, b.g.ph);
    hd.x.set(r2(nx));
    hd.y.set(r2(ny));
    const near = Math.hypot(nx, ny) / (REACH * b.g.cell);
    glow.set(r2(Math.max(0, Math.min(1, 1.6 - near))));
  };

  /** Pulled into its slot by hand: a snap as it goes, a click as it seats. */
  const pullIn = (id: number, vx = 0, vy = 0) => {
    const r = runs.current[id];
    const hd = handles.current.get(id);
    const L = latest.current;
    if (!r || !hd || r.status === "placed" || L.disabled) return;
    halt(id);
    r.status = "moving";
    const rect = hd.node?.getBoundingClientRect();
    audio.play("snap", {
      pitch: 1.1,
      gain: 0.45,
      pan: rect ? panFrom(rect.left + rect.width / 2, rootRef.current) : 0,
    });
    glow.set(0);
    if (!L.motionSafe) {
      seat(id, true);
      return;
    }
    hd.z.set(200 + (stack.current += 1));
    hd.opacity.set(1);
    run(id, animate(hd.rotate, 0, springs.snap));
    run(id, animate(hd.scale, 1, springs.snap));
    run(id, animate(hd.lift, 0, springs.snap));
    run(id, animate(hd.x, 0, { ...springs.snap, velocity: vx }));
    run(
      id,
      animate(hd.y, 0, {
        ...springs.snap,
        velocity: vy,
        onComplete: () => seat(id, true),
      }),
    );
  };

  const release = (id: number, info: DragInfo | null) => {
    const r = runs.current[id];
    const hd = handles.current.get(id);
    if (!r || !hd || r.status !== "held") return;
    const L = latest.current;
    setSlot(null);
    const b = bounds(id);
    const vx = info?.velocity.x ?? 0;
    const vy = info?.velocity.y ?? 0;
    const x = hd.x.get();
    const y = hd.y.get();
    const reach = REACH * b.g.cell;
    const px = project(x, vx, 0.99);
    const py = project(y, vy, 0.99);
    if (info && (Math.hypot(x, y) < reach || Math.hypot(px, py) < reach)) {
      pullIn(id, vx, vy);
      return;
    }
    // Set down where it lands, inside the tray; the assembly takes it later.
    const tx = Math.min(b.maxX, Math.max(b.minX, px));
    const ty = Math.min(b.maxY, Math.max(b.minY, py));
    r.status = "out";
    r.dx = tx / Math.max(1, size.current.w);
    r.dy = ty / Math.max(1, size.current.h);
    r.rot = 0;
    halt(id);
    glow.set(0);
    if (L.motionSafe) {
      run(id, animate(hd.x, r2(tx), { ...springs.glide, velocity: vx }));
      run(id, animate(hd.y, r2(ty), { ...springs.glide, velocity: vy }));
      run(id, animate(hd.scale, 1, springs.glide));
      run(id, animate(hd.lift, 0, springs.glide));
    } else {
      hd.x.set(r2(tx));
      hd.y.set(r2(ty));
    }
    const t = timeline.current;
    t.nextAt = Math.max(t.nextAt, t.clock + SOLVE / L.total);
    kick();
  };

  /** Enter, Space or a tap: the piece goes home. */
  const placeNow = (id: number) => {
    const r = runs.current[id];
    if (!r || r.status === "placed" || latest.current.disabled) return;
    const hadFocus = handles.current.get(id)?.node === document.activeElement;
    pullIn(id);
    if (hadFocus) {
      const next = nextFree(id, 1);
      if (next !== null) {
        setFocusId(next);
        handles.current.get(next)?.node?.focus({ preventScroll: true });
      }
    }
  };

  const nextFree = (from: number, dir: 1 | -1): number | null => {
    const L = latest.current;
    for (let k = 1; k <= L.total; k += 1) {
      const id = (from + dir * k + L.total * 2) % L.total;
      const r = runs.current[id];
      if (r && r.status !== "placed" && r.status !== "moving") return id;
    }
    return null;
  };

  const onKey = (id: number, event: React.KeyboardEvent<HTMLButtonElement>) => {
    const L = latest.current;
    let next: number | null = null;
    const free = (k: number) => {
      const r = runs.current[k];
      return Boolean(r && r.status !== "placed");
    };
    switch (event.key) {
      case "ArrowRight":
        next = nextFree(id, 1);
        break;
      case "ArrowLeft":
        next = nextFree(id, -1);
        break;
      case "ArrowDown":
      case "ArrowUp": {
        const dir = event.key === "ArrowDown" ? 1 : -1;
        for (let k = 1; k < L.n && next === null; k += 1) {
          const row = Math.floor(id / L.n) + dir * k;
          if (row < 0 || row >= L.n) break;
          const col = id % L.n;
          for (let d = 0; d < L.n && next === null; d += 1) {
            for (const c of [col - d, col + d]) {
              if (c >= 0 && c < L.n && free(row * L.n + c)) {
                next = row * L.n + c;
                break;
              }
            }
          }
        }
        break;
      }
      case "Home":
        next = nextFree(L.total - 1, 1);
        break;
      case "End":
        next = nextFree(0, -1);
        break;
      default:
        return;
    }
    event.preventDefault();
    if (next === null) return;
    setFocusId(next);
    handles.current.get(next)?.node?.focus({ preventScroll: true });
  };

  const register = React.useCallback((id: number, handle: Handle | null) => {
    if (handle) handles.current.set(id, handle);
    else handles.current.delete(id);
  }, []);

  /** Fresh pieces in the box: a new cut, or a puzzle sent back to loading. */
  const reset = () => {
    const L = latest.current;
    for (const r of runs.current) for (const a of r.anims) a.stop();
    for (const a of others.current) a.stop();
    others.current = [];
    runs.current = freshRuns(L.total);
    for (const hd of handles.current.values()) {
      hd.x.set(0);
      hd.y.set(0);
      hd.rotate.set(0);
      hd.scale.set(1);
      hd.lift.set(0);
      hd.shine.set(0);
      hd.opacity.set(0);
      hd.z.set(1);
    }
    wholeOpacity.set(0);
    glow.set(0);
    Object.assign(timeline.current, {
      clock: 0,
      last: 0,
      arrived: 0,
      nextAt: 0,
      hoverSince: -1,
      ownReady: false,
      resolving: false,
      placedCount: 0,
    });
    setOwnReady(false);
    setDone(false);
    setLifting(false);
    setPlaced(Array.from({ length: L.total }, () => false));
    kick();
  };

  const readyChanged = (now: boolean) => {
    if (now) {
      kick();
      settle();
    } else if (timeline.current.resolving && latest.current.controlled) {
      reset();
    }
  };

  const resize = () => {
    const root = rootRef.current;
    if (!root) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const first = size.current.w < 1;
    size.current = { w, h };
    if (first) {
      kick();
      return;
    }
    // Pieces lying in the tray stay where they lie, as a share of it.
    runs.current.forEach((r, id) => {
      const hd = handles.current.get(id);
      if (!hd || r.status !== "out") return;
      halt(id);
      hd.x.set(r2(r.dx * w));
      hd.y.set(r2(r.dy * h));
    });
  };

  // Set at the first render too: the size observer can report before any
  // effect has run, and that first size must not be lost.
  const api = React.useRef<Api>({ kick, readyChanged, resize });
  React.useEffect(() => {
    api.current = { kick, readyChanged, resize };
  });

  React.useEffect(() => {
    api.current.kick();
  }, [progress, loaded]);

  const shownCut = React.useRef(total);
  React.useEffect(() => {
    if (shownCut.current === total) return;
    shownCut.current = total;
    reset();
    // A different cut lays the puzzle out again from the box.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  const shownReady = React.useRef(isReady);
  React.useEffect(() => {
    if (shownReady.current === isReady) return;
    shownReady.current = isReady;
    api.current.readyChanged(isReady);
  }, [isReady]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) api.current.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    const loop = frame;
    const pieceRuns = runs;
    const rest = others;
    return () => {
      if (loop.current) window.cancelAnimationFrame(loop.current);
      loop.current = 0;
      for (const r of pieceRuns.current) for (const a of r.anims) a.stop();
      for (const a of rest.current) a.stop();
      rest.current = [];
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      // A hovering piece rests off screen and bobs again on its return.
      runs.current.forEach((r, id) => {
        if (r.status !== "hover") return;
        if (visible.current) bob(id);
        else halt(id);
      });
      if (visible.current) api.current.kick();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
    // `bob` and `halt` read only refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bindImage = React.useCallback(
    (node: HTMLImageElement | null) => {
      if (node?.complete && src) {
        const loadedNow = src;
        queueMicrotask(() => setLoadedSrc(loadedNow));
      }
    },
    [src],
  );

  // The pieces are memoised, so they get stable handlers that reach the
  // latest closures through a ref.
  const act = React.useRef({ grab, moveHeld, release, placeNow, onKey });
  React.useEffect(() => {
    act.current = { grab, moveHeld, release, placeNow, onKey };
  });
  const handlers = React.useMemo(
    () => ({
      onGrab: (id: number) => act.current.grab(id),
      onMove: (id: number, info: DragInfo) => act.current.moveHeld(id, info),
      onRelease: (id: number, info: DragInfo | null) =>
        act.current.release(id, info),
      onPlace: (id: number) => act.current.placeNow(id),
      onKey: (id: number, event: React.KeyboardEvent<HTMLButtonElement>) =>
        act.current.onKey(id, event),
      onFocusPiece: (id: number) => setFocusId(id),
    }),
    [],
  );

  // One copy for every piece, made once per picture, so the memoised pieces
  // are not drawn again on every render of the tray.
  const copy = React.useMemo(
    () =>
      src !== undefined ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          draggable={false}
          className="size-full object-cover"
        />
      ) : (
        children
      ),
    [src, children],
  );

  // The roving stop: the focused piece while it is free, else the first free one.
  const firstFree = placed.findIndex((v) => !v);
  const stop = placed[focusId] === false ? focusId : firstFree;
  const boardInset = pct(TAB / whole);
  const boardSize = pct(n / whole);

  return (
    <div
      ref={bindRoot}
      aria-busy={!done}
      className={cn(
        "relative isolate aspect-[4/3] w-full overflow-clip rounded-3 bg-surface-2 select-none",
        "shadow-[inset_0_1px_3px_color-mix(in_oklab,black_14%,transparent)]",
        className,
      )}
    >
      <svg aria-hidden width="0" height="0" className="absolute">
        <defs>
          {cut.pieces.map((p) => (
            <clipPath
              key={p.id}
              id={`${clipBase}-${n}-${p.id}`}
              clipPathUnits="objectBoundingBox"
            >
              <path d={p.local} />
            </clipPath>
          ))}
        </defs>
      </svg>

      <div
        className="absolute overflow-clip rounded-1 bg-surface-1"
        style={{
          left: boardInset,
          top: boardInset,
          width: boardSize,
          height: boardSize,
        }}
      >
        <div
          aria-hidden
          inert
          className="absolute inset-0 opacity-15 grayscale [&>img]:size-full [&>svg]:block [&>svg]:size-full"
        >
          {copy}
        </div>
        <svg
          aria-hidden
          viewBox={`0 0 ${n} ${n}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full"
        >
          <path
            d={cut.lines}
            fill="none"
            vectorEffect="non-scaling-stroke"
            strokeWidth={1}
            className="stroke-hairline-strong"
          />
          {slot ? (
            <motion.path
              d={slot}
              vectorEffect="non-scaling-stroke"
              strokeWidth={2}
              className="fill-cobalt-wash stroke-cobalt-bright"
              style={{ opacity: glowOpacity }}
            />
          ) : null}
        </svg>
        <motion.div
          ref={pictureRef}
          role={src === undefined ? "img" : undefined}
          aria-label={src === undefined ? alt : undefined}
          tabIndex={-1}
          className="absolute inset-0 outline-none [&>img]:size-full [&>svg]:block [&>svg]:size-full"
          style={{ opacity: wholeOpacity, zIndex: done ? 2 : 0 }}
        >
          {src !== undefined ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={bindImage}
              src={src}
              alt={alt}
              draggable={false}
              onLoad={() => setLoadedSrc(src)}
              onError={() => setLoadedSrc(src)}
              className="size-full object-cover"
            />
          ) : (
            children
          )}
        </motion.div>
      </div>

      {done ? null : (
        <div
          ref={groupRef}
          role="group"
          aria-label="Jigsaw pieces"
          inert={lifting || undefined}
          className="absolute inset-0"
        >
          {cut.pieces.map((p) => (
            <JigsawPiece
              key={`${n}-${p.id}`}
              geo={p}
              n={n}
              clipId={`${clipBase}-${n}-${p.id}`}
              label={`Piece ${p.id + 1} of ${total}`}
              hintId={hintId}
              placed={placed[p.id] ?? false}
              focusable={p.id === stop}
              disabled={disabled}
              register={register}
              onGrab={handlers.onGrab}
              onMove={handlers.onMove}
              onRelease={handlers.onRelease}
              onPlace={handlers.onPlace}
              onKey={handlers.onKey}
              onFocusPiece={handlers.onFocusPiece}
              picture={copy}
            />
          ))}
        </div>
      )}

      <p id={hintId} className="sr-only">
        Drag it into its place, or press Enter to place it.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
