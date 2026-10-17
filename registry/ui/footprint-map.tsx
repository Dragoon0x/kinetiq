"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";
import {
  Clock,
  Crosshair,
  FolderTree,
  Pause,
  PenLine,
  Play,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                   Types                                  */
/* ----------------------------------------------------------------------- */

export type FootprintFile = {
  /** Repository path, folders split by "/": "src/lib/cart.ts". */
  path: string;
  /** Lines (or bytes): the file's area on the map. */
  size: number;
};

export type FootprintOp = "read" | "write";

export type FootprintEvent = {
  id: string;
  /** The agent's id. */
  agent: string;
  path: string;
  op: FootprintOp;
  /** When, in ms. */
  at: number;
};

export type FootprintAgentState = "active" | "stalled" | "idle";

export type FootprintAgent = {
  id: string;
  name: string;
  /** What the agent was asked to do, in a few words. */
  task: string;
  /** Idle agents are not drawn; stalled ones hold still with a dashed ring. Active agents whose last step is older than `stallAfter` read as stalled. @default "active" */
  state?: FootprintAgentState;
  /** The agent's marker and trail colour — any CSS colour. */
  tint?: string;
};

export type FootprintTint = "access" | "agent" | "heat";
export type FootprintStatus = "ready" | "loading" | "error";

export type FootprintMapProps = {
  /** Every file in the repository, with its size. @default defaultFootprintFiles (23) */
  files?: FootprintFile[];
  /** The agents working in it. @default defaultFootprintAgents (3) */
  agents?: FootprintAgent[];
  /** What they read and wrote, oldest first; each agent sits in the file of its newest event. @default defaultFootprintEvents */
  events?: FootprintEvent[];
  /** The repository's name, in the header and as the accessible name. @default "fernworks/web" */
  repo?: string;
  /** The moment the map is read, in ms: stalls are counted from it. @default the newest event */
  now?: number;
  /** Minutes added to UTC before a time is printed. @default 0 */
  utcOffset?: number;
  /** An active agent whose newest step is older than this, in ms, reads as stalled. @default 180000 */
  stallAfter?: number;
  /** Controlled followed agent id (null for none). */
  follow?: string | null;
  /** Initial followed agent when uncontrolled. @default null */
  defaultFollow?: string | null;
  /** Fires from the press or key that followed an agent or stopped following. */
  onFollowAgent?: (agentId: string | null) => void;
  /** Controlled pause state. */
  paused?: boolean;
  /** Initial pause state when uncontrolled. @default false */
  defaultPaused?: boolean;
  /** Pause agents (or Resume) was pressed, with the new state. */
  onPause?: (paused: boolean) => void;
  /** A file's history was opened, with its events newest first. */
  onSelectFile?: (path: string, history: FootprintEvent[]) => void;
  /** How many of each agent's recent files stay joined by its trail; 0 draws markers only. @default 3 */
  trailLength?: number;
  /** How touched files are washed: by read or write, by the last agent's colour, or by how often they were touched. @default "access" */
  tint?: FootprintTint;
  /** Access and heat washes, the follow highlight and focus accents — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The map's height, px. @default 260 */
  mapHeight?: number;
  /** Whether the repository has been read. @default "ready" */
  status?: FootprintStatus;
  /** Try again was pressed after the map failed to load. */
  onReload?: () => void;
  /** Read only: nothing can be followed, paused or opened. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

export const defaultFootprintFiles: FootprintFile[] = [
  { path: "src/app/layout.tsx", size: 120 },
  { path: "src/app/page.tsx", size: 340 },
  { path: "src/app/globals.css", size: 210 },
  { path: "src/app/checkout/page.tsx", size: 420 },
  { path: "src/app/checkout/actions.ts", size: 260 },
  { path: "src/app/checkout/CouponField.tsx", size: 180 },
  { path: "src/app/checkout/Summary.tsx", size: 300 },
  { path: "src/components/Button.tsx", size: 140 },
  { path: "src/components/Input.tsx", size: 160 },
  { path: "src/components/PriceTag.tsx", size: 90 },
  { path: "src/components/Toast.tsx", size: 130 },
  { path: "src/lib/cart.ts", size: 380 },
  { path: "src/lib/coupons.ts", size: 220 },
  { path: "src/lib/format.ts", size: 110 },
  { path: "src/lib/api.ts", size: 260 },
  { path: "tests/checkout.test.ts", size: 340 },
  { path: "tests/coupons.test.ts", size: 200 },
  { path: "tests/cart.test.ts", size: 260 },
  { path: "docs/checkout.md", size: 180 },
  { path: "docs/coupons.md", size: 120 },
  { path: "README.md", size: 240 },
  { path: "package.json", size: 80 },
  { path: "tsconfig.json", size: 40 },
];

export const defaultFootprintAgents: FootprintAgent[] = [
  {
    id: "reed",
    name: "Reed",
    task: "Coupon field at checkout",
    tint: "var(--accent-bright)",
  },
  {
    id: "juno",
    name: "Juno",
    task: "Tests for coupons",
    tint: "var(--success)",
  },
  {
    id: "ash",
    name: "Ash",
    task: "Checkout docs",
    tint: "oklch(from var(--accent-bright) l c 320)",
  },
];

const T0 = Date.UTC(2026, 9, 17, 13, 50);
const SEC = 1000;

/** The first twelve steps of Fernworks' Friday afternoon. */
export const defaultFootprintEvents: FootprintEvent[] = [
  ["reed", "src/app/checkout/page.tsx", "read", 0],
  ["juno", "tests/checkout.test.ts", "read", 40],
  ["ash", "docs/checkout.md", "read", 70],
  ["reed", "src/lib/coupons.ts", "read", 110],
  ["juno", "src/lib/coupons.ts", "read", 160],
  ["ash", "src/app/checkout/page.tsx", "read", 200],
  ["reed", "src/app/checkout/CouponField.tsx", "write", 250],
  ["juno", "tests/coupons.test.ts", "write", 300],
  ["ash", "docs/coupons.md", "write", 350],
  ["reed", "src/components/Input.tsx", "read", 400],
  ["juno", "src/lib/cart.ts", "read", 450],
  ["reed", "src/app/checkout/CouponField.tsx", "write", 500],
].map(([agent, path, op, s], i) => ({
  id: `fp-${String(i + 1).padStart(2, "0")}`,
  agent: agent as string,
  path: path as string,
  op: op as FootprintOp,
  at: T0 + (s as number) * SEC,
}));

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));

const clock = (ms: number, offset: number) => {
  const d = new Date(ms + offset * MIN);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes(),
  ).padStart(2, "0")}`;
};

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const dirName = (path: string) => {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? "" : path.slice(0, cut);
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-2";

type Box = { x: number; y: number; w: number; h: number };

/**
 * Squarified treemap: rows are filled while adding an item keeps their worst
 * aspect ratio from getting worse, then laid along the box's short side. The
 * result is deterministic for a given input and box, so the server and the
 * browser draw the same map.
 */
function squarify(values: number[], box: Box): Box[] {
  const total = values.reduce((a, b) => a + b, 0);
  const out: Box[] = values.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
  if (total <= 0 || box.w <= 0 || box.h <= 0) return out;
  const order = values
    .map((v, i) => ({ v: (v / total) * box.w * box.h, i }))
    .sort((a, b) => b.v - a.v || a.i - b.i);
  let rect = { ...box };
  let row: { v: number; i: number }[] = [];

  const worst = (items: { v: number }[], side: number) => {
    const s = items.reduce((a, b) => a + b.v, 0);
    let max = 0;
    let min = Infinity;
    for (const it of items) {
      max = Math.max(max, it.v);
      min = Math.min(min, it.v);
    }
    return Math.max(
      (side * side * max) / (s * s),
      (s * s) / (side * side * Math.max(min, 1e-9)),
    );
  };

  const place = (items: { v: number; i: number }[]) => {
    const s = items.reduce((a, b) => a + b.v, 0);
    if (rect.w >= rect.h) {
      const w = s / Math.max(rect.h, 1e-9);
      let y = rect.y;
      for (const it of items) {
        const h = it.v / Math.max(w, 1e-9);
        out[it.i] = { x: rect.x, y, w, h };
        y += h;
      }
      rect = { x: rect.x + w, y: rect.y, w: rect.w - w, h: rect.h };
    } else {
      const h = s / Math.max(rect.w, 1e-9);
      let x = rect.x;
      for (const it of items) {
        const w = it.v / Math.max(h, 1e-9);
        out[it.i] = { x, y: rect.y, w, h };
        x += w;
      }
      rect = { x: rect.x, y: rect.y + h, w: rect.w, h: rect.h - h };
    }
  };

  let k = 0;
  while (k < order.length) {
    const item = order[k];
    if (!item) break;
    const side = Math.min(rect.w, rect.h);
    if (row.length === 0 || worst([...row, item], side) <= worst(row, side)) {
      row.push(item);
      k += 1;
    } else {
      place(row);
      row = [];
    }
  }
  if (row.length) place(row);
  return out;
}

type Folder = { dir: string; label: string; box: Box; caption: boolean };
type Tile = { path: string; name: string; dir: string; box: Box };

const CAPTION = 16;
const GAP = 3;

function layoutMap(files: FootprintFile[], w: number, h: number) {
  const groups = new Map<string, FootprintFile[]>();
  for (const f of files) {
    const dir = dirName(f.path);
    const list = groups.get(dir);
    if (list) list.push(f);
    else groups.set(dir, [f]);
  }
  const dirs = [...groups.keys()].sort();
  const boxes = squarify(
    dirs.map((d) =>
      (groups.get(d) ?? []).reduce((a, f) => a + Math.max(1, f.size), 0),
    ),
    { x: 0, y: 0, w, h },
  );
  const folders: Folder[] = [];
  const tiles: Tile[] = [];
  dirs.forEach((dir, i) => {
    const b = boxes[i] ?? { x: 0, y: 0, w: 0, h: 0 };
    const box = {
      x: b.x + GAP / 2,
      y: b.y + GAP / 2,
      w: Math.max(0, b.w - GAP),
      h: Math.max(0, b.h - GAP),
    };
    const caption = box.h > 46 && box.w > 56;
    folders.push({ dir, label: dir || ".", box, caption });
    const list = groups.get(dir) ?? [];
    const inner = {
      x: box.x + 2,
      y: box.y + (caption ? CAPTION : 2),
      w: Math.max(0, box.w - 4),
      h: Math.max(0, box.h - (caption ? CAPTION + 2 : 4)),
    };
    const fb = squarify(
      list.map((f) => Math.max(1, f.size)),
      inner,
    );
    list.forEach((f, j) => {
      const r = fb[j] ?? { x: 0, y: 0, w: 0, h: 0 };
      tiles.push({
        path: f.path,
        name: baseName(f.path),
        dir,
        box: {
          x: r.x + 1,
          y: r.y + 1,
          w: Math.max(0, r.w - 2),
          h: Math.max(0, r.h - 2),
        },
      });
    });
  });
  return { folders, tiles };
}

type Stat = {
  reads: number;
  writes: number;
  touches: number;
  lastAt: number;
  lastAgent: string;
  lastId: string;
};

const pct = (v: number, of: number) => `${r3((v / Math.max(1, of)) * 100)}%`;

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

function Mono({
  name,
  tint,
  size = "md",
}: {
  name: string;
  tint: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-[oklch(0.2_0.02_258)]",
        size === "sm" ? "size-4 text-[9px]" : "size-5 text-[10px]",
      )}
      style={{ backgroundColor: `oklch(from ${tint} 0.82 c h)` }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * A box whose height follows its content on glide, measured, so the
 * inspector never jumps when it swaps between follow, history and recent.
 */
function Measured({
  glide,
  children,
}: {
  glide: boolean;
  children: React.ReactNode;
}) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver(() => setHeight(node.offsetHeight));
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return (
    <motion.div
      initial={false}
      animate={{ height: glide && height !== null ? height : "auto" }}
      transition={glide ? springs.glide : { duration: 0 }}
      style={{ overflow: "clip", overflowClipMargin: 6 }}
    >
      <div ref={setNode}>{children}</div>
    </motion.div>
  );
}

type Spot = { x: number; y: number };

/** A small unsigned hash of an id: which way a trail bows. */
const hashOf = (id: string) => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  }
  return h >>> 0;
};

/**
 * The control point of the gentle arc between two files: off the midpoint by
 * a fifth of the distance, bowing to the side the step's id picks, held
 * inside the map.
 */
const bow = (a: Spot, b: Spot, id: string, w: number, h: number): Spot => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return { x: a.x, y: a.y };
  const side = hashOf(id) & 1 ? 1 : -1;
  const k = (0.2 * side * Math.min(len, 240)) / len;
  return {
    x: Math.min(w - 4, Math.max(4, (a.x + b.x) / 2 - dy * k)),
    y: Math.min(h - 4, Math.max(4, (a.y + b.y) / 2 + dx * k)),
  };
};

const quad = (a: Spot, c: Spot, b: Spot, t: number): Spot => {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
  };
};

const arcPath = (a: Spot, c: Spot, b: Spot) =>
  `M ${r2(a.x)} ${r2(a.y)} Q ${r2(c.x)} ${r2(c.y)} ${r2(b.x)} ${r2(b.y)}`;

/**
 * One agent on the map: a marker that glides from file to file along a
 * gentle arc, and the trail of its last files. The flight is one progress
 * value on glide; the marker and the newest segment are both read off it
 * (the segment is the arc cut at that progress), so the line is drawn out
 * exactly behind the marker as it travels.
 */
function AgentTrack({
  agent,
  tint,
  points,
  offset,
  width,
  height,
  stalled,
  dimmed,
  followed,
  paused,
  motionSafe,
  disabled,
  onPress,
  label,
}: {
  agent: FootprintAgent;
  tint: string;
  /** Oldest first; the last is where the agent is now. Keyed by event id. */
  points: (Spot & { id: string })[];
  offset: number;
  width: number;
  height: number;
  stalled: boolean;
  dimmed: boolean;
  followed: boolean;
  paused: boolean;
  motionSafe: boolean;
  disabled: boolean;
  onPress: () => void;
  label: string;
}) {
  const here = points[points.length - 1] ?? {
    id: "",
    x: width / 2,
    y: height / 2,
  };
  const prev = points[points.length - 2];
  const from = prev ?? here;
  const ctrl = bow(from, here, here.id, width, height);
  const flightKey = `${here.id}:${r2(here.x)}:${r2(here.y)}:${r2(from.x)}:${r2(from.y)}`;

  const t = useMotionValue(1);
  const x = useMotionValue(r2(here.x));
  const y = useMotionValue(r2(here.y));
  const head = useMotionValue(prev ? arcPath(from, ctrl, here) : "");
  const geometry = `${width}x${height}`;
  const shown = React.useRef({ flightKey, geometry });

  React.useEffect(() => {
    const draw = (v: number) => {
      const p = quad(from, ctrl, here, v);
      x.set(r2(p.x));
      y.set(r2(p.y));
      if (prev) {
        // The arc from the last file, cut at the marker: de Casteljau.
        const c = {
          x: from.x + (ctrl.x - from.x) * v,
          y: from.y + (ctrl.y - from.y) * v,
        };
        head.set(arcPath(from, c, p));
      } else head.set("");
    };
    const moved = shown.current.flightKey !== flightKey;
    const resized = shown.current.geometry !== geometry;
    shown.current = { flightKey, geometry };
    const unsub = t.on("change", draw);
    if (!moved || resized || !motionSafe) {
      // Same step, a re-measured map, or reduced motion: be there now.
      t.jump(1);
      draw(1);
      return unsub;
    }
    t.jump(0);
    draw(0);
    const run = animate(t, 1, springs.glide);
    return () => {
      // A re-run (StrictMode, a newer step) lands this flight, never freezes it.
      run.stop();
      unsub();
    };
    // The flight key and geometry name every coordinate used above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flightKey, geometry, motionSafe]);

  const older = points.slice(0, -1);
  const count = older.length;

  return (
    <>
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-visible"
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ opacity: dimmed ? 0.25 : 1, transition: "opacity 240ms" }}
      >
        {older.slice(0, -1).map((pt, i) => {
          const next = older[i + 1];
          if (!next) return null;
          return (
            <path
              key={pt.id}
              d={arcPath(pt, bow(pt, next, next.id, width, height), next)}
              fill="none"
              stroke={tint}
              strokeWidth={followed ? 2 : 1.5}
              strokeLinecap="round"
              strokeDasharray="0.5 4.5"
              style={{
                opacity: r3(0.14 + (0.4 * (i + 1)) / Math.max(1, count)),
                transition: "opacity 400ms",
              }}
            />
          );
        })}
        {prev ? (
          <motion.path
            d={head}
            fill="none"
            stroke={tint}
            strokeWidth={followed ? 2.5 : 2}
            strokeLinecap="round"
            style={{ opacity: 0.7 }}
          />
        ) : null}
        {older.map((pt, i) => (
          <circle
            key={`d-${pt.id}`}
            cx={r2(pt.x)}
            cy={r2(pt.y)}
            r={2.25}
            fill={tint}
            style={{
              opacity: r3(0.22 + (0.5 * (i + 1)) / Math.max(1, count)),
            }}
          />
        ))}
      </svg>
      <motion.button
        type="button"
        tabIndex={-1}
        aria-label={label}
        disabled={disabled}
        onClick={onPress}
        className="absolute top-0 left-0 z-10 -mt-[13px] -ml-[13px] size-[26px] cursor-pointer rounded-full"
        style={{ x, y, opacity: dimmed ? 0.35 : paused ? 0.6 : 1 }}
      >
        <span
          className="absolute inset-0 inline-flex items-center justify-center transition-transform duration-200"
          style={{ transform: `translateX(${offset}px)` }}
        >
          <span
            className={cn(
              "inline-flex size-[22px] items-center justify-center rounded-full border-2 text-[10px] font-semibold text-[oklch(0.2_0.02_258)] shadow-[0_2px_6px_color-mix(in_oklab,black_22%,transparent)]",
              stalled ? "border-dashed border-ink-3" : "border-card",
            )}
            style={{ backgroundColor: `oklch(from ${tint} 0.82 c h)` }}
          >
            {agent.name.charAt(0).toUpperCase()}
          </span>
          {followed ? (
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-full border-2"
              style={{ borderColor: tint }}
              initial={{ scale: motionSafe ? 0.6 : 1, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={
                motionSafe
                  ? {
                      scale: springs.snap,
                      opacity: { duration: durations.fast },
                    }
                  : { duration: durations.fast }
              }
            />
          ) : null}
          {stalled ? (
            <span className="absolute -right-1 -bottom-1 inline-flex size-3.5 items-center justify-center rounded-full border border-hairline bg-card text-warn">
              <Clock aria-hidden className="size-2.5" />
            </span>
          ) : null}
        </span>
      </motion.button>
    </>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

const ROW_H = 40;
const LIST_ROWS = 6;

/**
 * A live map of a repository while agents work in it: folders and files as a
 * squarified treemap sized by file size, each working agent a marker that
 * glides from file to file on `springs.glide` as it reads and edits, trailing
 * its last few files as a fading line whose newest segment is drawn out
 * behind the marker as it travels. Touched files are washed by read or write,
 * by the last agent's colour, or by heat; two active agents in one file draw
 * a soft warn ring that opens on `springs.snap` and a chip naming the
 * possible conflict. A stalled agent holds still with a dashed ring.
 *
 * Tab moves through the agents; F follows the focused one (its trail and log
 * come forward, the others dim) and Enter opens the history of the file it is
 * in. The map is one tab stop: arrow keys move spatially between files, Home
 * and End jump, Enter opens a file's history and Escape closes it. Under 30rem
 * of container the map gives way to a list of files ranked by activity, the
 * agents' monograms gliding between rows. Under reduced motion markers jump,
 * the ring and flashes appear without scale and rows re-rank at once.
 */
export function FootprintMap({
  files = defaultFootprintFiles,
  agents = defaultFootprintAgents,
  events = defaultFootprintEvents,
  repo = "fernworks/web",
  now,
  utcOffset = 0,
  stallAfter = 180_000,
  follow,
  defaultFollow = null,
  onFollowAgent,
  paused,
  defaultPaused = false,
  onPause,
  onSelectFile,
  trailLength = 3,
  tint = "access",
  accent = "var(--accent-bright)",
  mapHeight = 260,
  status = "ready",
  onReload,
  disabled = false,
  className,
}: FootprintMapProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const ready = status === "ready";
  const trail = Math.max(0, Math.round(trailLength));
  const H = Math.max(120, Math.round(mapHeight));

  const [ownFollow, setOwnFollow] = React.useState<string | null>(
    defaultFollow,
  );
  const followed = follow === undefined ? ownFollow : follow;
  const [ownPaused, setOwnPaused] = React.useState(defaultPaused);
  const isPaused = paused ?? ownPaused;
  const [opened, setOpened] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState("");
  const [focusPath, setFocusPath] = React.useState<string | null>(null);

  /* ------------------------------- measure ------------------------------- */

  const [W, setW] = React.useState(680);
  const [mapNode, setMapNode] = React.useState<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!mapNode) return;
    const ro = new ResizeObserver(() => {
      const w = Math.round(mapNode.clientWidth);
      // Hidden (the list layout) reports zero: keep the last real width.
      if (w > 0) setW((old) => (Math.abs(old - w) > 1 ? w : old));
    });
    ro.observe(mapNode);
    return () => ro.disconnect();
  }, [mapNode]);

  const known = React.useMemo(() => new Set(files.map((f) => f.path)), [files]);
  const { folders, tiles } = React.useMemo(
    () => layoutMap(files, W, H),
    [files, W, H],
  );
  const tileByPath = React.useMemo(
    () => new Map(tiles.map((t) => [t.path, t])),
    [tiles],
  );
  const centre = (path: string): Spot => {
    const t = tileByPath.get(path);
    return t
      ? { x: t.box.x + t.box.w / 2, y: t.box.y + t.box.h / 2 }
      : { x: W / 2, y: H / 2 };
  };

  /* ------------------------------ activity ------------------------------- */

  const seen = React.useMemo(
    () => events.filter((e) => known.has(e.path)),
    [events, known],
  );
  const nowMs = now ?? seen[seen.length - 1]?.at ?? 0;
  const stats = React.useMemo(() => {
    const m = new Map<string, Stat>();
    for (const e of seen) {
      const s = m.get(e.path) ?? {
        reads: 0,
        writes: 0,
        touches: 0,
        lastAt: 0,
        lastAgent: e.agent,
        lastId: e.id,
      };
      if (e.op === "write") s.writes += 1;
      else s.reads += 1;
      s.touches += 1;
      s.lastAt = e.at;
      s.lastAgent = e.agent;
      s.lastId = e.id;
      m.set(e.path, s);
    }
    return m;
  }, [seen]);

  const agentById = new Map(agents.map((a) => [a.id, a]));
  const tintOf = (id: string) => agentById.get(id)?.tint ?? "var(--ink-3)";
  const nameOf = (id: string) => agentById.get(id)?.name ?? id;

  type Live = {
    agent: FootprintAgent;
    last?: FootprintEvent;
    state: FootprintAgentState;
    since: number;
  };
  const live: Live[] = agents.map((agent) => {
    let last: FootprintEvent | undefined;
    for (let i = seen.length - 1; i >= 0; i--) {
      const e = seen[i];
      if (e && e.agent === agent.id) {
        last = e;
        break;
      }
    }
    const declared = agent.state ?? "active";
    const stale =
      declared === "active" &&
      last !== undefined &&
      nowMs - last.at > stallAfter;
    return {
      agent,
      last,
      state: !last ? "idle" : stale ? "stalled" : declared,
      since: last ? nowMs - last.at : 0,
    };
  });
  const present = live.filter((l) => l.state !== "idle" && l.last);
  const activeCount = present.length;

  /** Files with two or more agents actually working in them. */
  const crowd = new Map<string, string[]>();
  for (const l of present) {
    if (l.state !== "active" || !l.last) continue;
    const list = crowd.get(l.last.path) ?? [];
    list.push(l.agent.id);
    crowd.set(l.last.path, list);
  }
  const conflicts = [...crowd.entries()].filter(([, ids]) => ids.length > 1);
  const conflictKey = conflicts
    .map(([path, ids]) => `${path}:${ids.join("+")}`)
    .join("|");

  // Spoken once, from the render that sees a conflict or a stall begin.
  const stalledKey = live
    .filter((l) => l.state === "stalled")
    .map((l) => l.agent.id)
    .join("|");
  const [heard, setHeard] = React.useState({ conflictKey, stalledKey });
  if (heard.conflictKey !== conflictKey || heard.stalledKey !== stalledKey) {
    const before = new Set(heard.stalledKey.split("|"));
    const newStall = live.find(
      (l) => l.state === "stalled" && !before.has(l.agent.id),
    );
    const firstConflict = conflicts[0];
    setHeard({ conflictKey, stalledKey });
    if (conflictKey && conflictKey !== heard.conflictKey && firstConflict) {
      setSaid(
        `Possible conflict: ${firstConflict[1].map(nameOf).join(" and ")} are both in ${baseName(firstConflict[0])}.`,
      );
    } else if (newStall) {
      setSaid(`${newStall.agent.name} has stalled.`);
    }
  }

  // Flashes only for steps that arrive after the map is on screen.
  const [mountedIds] = React.useState(() => new Set(seen.map((e) => e.id)));

  const touchedCount = stats.size;
  const writtenCount = [...stats.values()].filter((s) => s.writes > 0).length;

  /* ------------------------------- actions ------------------------------- */

  const setFollow = (id: string | null) => {
    if (disabled || !ready) return;
    if (follow === undefined) setOwnFollow(id);
    setSaid(id ? `Following ${nameOf(id)}.` : "Stopped following.");
    onFollowAgent?.(id);
  };

  const historyOf = (path: string) =>
    seen.filter((e) => e.path === path).reverse();

  const returnTo = React.useRef<HTMLElement | null>(null);
  const openHistory = (path: string, from?: HTMLElement | null) => {
    if (disabled || !ready) return;
    returnTo.current = from ?? null;
    setOpened(path);
    const h = historyOf(path);
    setSaid(
      `${baseName(path)}: ${h.length} ${h.length === 1 ? "step" : "steps"}.`,
    );
    onSelectFile?.(path, h);
  };
  const closeHistory = () => {
    setOpened(null);
    const back = returnTo.current;
    returnTo.current = null;
    if (back && back.isConnected) back.focus({ preventScroll: true });
  };

  const togglePause = () => {
    if (disabled || !ready) return;
    const next = !isPaused;
    if (paused === undefined) setOwnPaused(next);
    setSaid(next ? "Agents paused." : "Agents resumed.");
    onPause?.(next);
  };

  /* ---------------------------- map keyboard ----------------------------- */

  const ordered = React.useMemo(
    () =>
      [...tiles].sort(
        (a, b) =>
          Math.round(a.box.y) - Math.round(b.box.y) || a.box.x - b.box.x,
      ),
    [tiles],
  );
  const rovingPath =
    focusPath && tileByPath.has(focusPath)
      ? focusPath
      : (ordered[0]?.path ?? null);

  const tileRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const focusTile = (path: string) => {
    setFocusPath(path);
    tileRefs.current.get(path)?.focus({ preventScroll: true });
  };

  /** The nearest file in a direction, weighting sideways drift double. */
  const neighbour = (from: Tile, dx: number, dy: number) => {
    const cx = from.box.x + from.box.w / 2;
    const cy = from.box.y + from.box.h / 2;
    let best: Tile | null = null;
    let score = Infinity;
    for (const t of tiles) {
      if (t.path === from.path) continue;
      const tx = t.box.x + t.box.w / 2;
      const ty = t.box.y + t.box.h / 2;
      const along = (tx - cx) * dx + (ty - cy) * dy;
      if (along <= 1) continue;
      const across = Math.abs((tx - cx) * dy) + Math.abs((ty - cy) * dx);
      const s = along + across * 2;
      if (s < score) {
        score = s;
        best = t;
      }
    }
    return best;
  };

  const onTileKey = (event: React.KeyboardEvent, tile: Tile) => {
    const dirs: Record<string, [number, number]> = {
      ArrowRight: [1, 0],
      ArrowLeft: [-1, 0],
      ArrowDown: [0, 1],
      ArrowUp: [0, -1],
    };
    const d = dirs[event.key];
    if (d) {
      event.preventDefault();
      const next = neighbour(tile, d[0], d[1]);
      if (next) focusTile(next.path);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const t = event.key === "Home" ? ordered[0] : ordered[ordered.length - 1];
      if (t) focusTile(t.path);
    }
  };

  const onAgentKey = (event: React.KeyboardEvent, l: Live) => {
    if (event.key === "f" || event.key === "F") {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      setFollow(followed === l.agent.id ? null : l.agent.id);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (l.last) openHistory(l.last.path, event.currentTarget as HTMLElement);
    }
  };

  const onRootKey = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" && opened) {
      event.preventDefault();
      closeHistory();
    }
  };

  // Opening a history moves focus into it, once its panel has arrived.
  const [closeNode, setCloseNode] = React.useState<HTMLButtonElement | null>(
    null,
  );
  React.useEffect(() => {
    if (closeNode && returnTo.current) closeNode.focus({ preventScroll: true });
  }, [closeNode]);

  /* -------------------------------- washes ------------------------------- */

  const washOf = (path: string): string | undefined => {
    const s = stats.get(path);
    if (!s) return undefined;
    if (tint === "agent") {
      return `color-mix(in oklab, ${tintOf(s.lastAgent)} ${s.writes > 0 ? 30 : 15}%, transparent)`;
    }
    if (tint === "heat") {
      return `color-mix(in oklab, var(--fp-accent) ${Math.min(48, 8 + s.touches * 9)}%, transparent)`;
    }
    return s.writes > 0
      ? "color-mix(in oklab, var(--fp-accent) 30%, transparent)"
      : "color-mix(in oklab, var(--fp-accent) 11%, transparent)";
  };

  const tileName = (t: Tile) => {
    const s = stats.get(t.path);
    const inHere = present
      .filter((l) => l.last?.path === t.path)
      .map((l) => l.agent.name);
    const parts = [t.path];
    if (s) parts.push(`${s.reads} read, ${s.writes} written`);
    else parts.push("untouched");
    if (inHere.length) parts.push(`${inHere.join(" and ")} here`);
    return parts.join(", ");
  };

  /* --------------------------------- map --------------------------------- */

  const map = (
    <div
      ref={setMapNode}
      className="relative w-full select-none"
      style={{ height: H }}
    >
      {folders.map((f) => (
        <div
          key={f.dir || "/"}
          aria-hidden
          className="absolute rounded-2 border border-hairline bg-surface-1"
          style={{
            left: pct(f.box.x, W),
            top: pct(f.box.y, H),
            width: pct(f.box.w, W),
            height: pct(f.box.h, H),
          }}
        >
          {f.caption ? (
            <span className="absolute inset-x-1.5 top-0.5 truncate font-mono text-[10px] leading-[14px] text-ink-3">
              {f.label}/
            </span>
          ) : null}
        </div>
      ))}

      <div
        role="group"
        aria-label={`Files in ${repo}`}
        aria-describedby={hintId}
        className="absolute inset-0"
      >
        {tiles.map((t) => {
          const s = stats.get(t.path);
          const wash = washOf(t.path);
          const roomy = t.box.w > 58 && t.box.h > 22;
          const fresh = s && !mountedIds.has(s.lastId);
          const isOpen = opened === t.path;
          return (
            <button
              key={t.path}
              ref={(node) => {
                if (node) tileRefs.current.set(t.path, node);
                else tileRefs.current.delete(t.path);
              }}
              type="button"
              tabIndex={t.path === rovingPath ? 0 : -1}
              aria-label={tileName(t)}
              title={t.path}
              disabled={disabled}
              onFocus={() => setFocusPath(t.path)}
              onKeyDown={(event) => onTileKey(event, t)}
              onClick={(event) => openHistory(t.path, event.currentTarget)}
              className={cn(
                "absolute overflow-hidden rounded-1 border text-left transition-colors",
                isOpen
                  ? "border-(--fp-accent)"
                  : "border-hairline hover:border-hairline-strong",
                "bg-card",
                FOCUS_IN,
              )}
              style={{
                left: pct(t.box.x, W),
                top: pct(t.box.y, H),
                width: pct(t.box.w, W),
                height: pct(t.box.h, H),
              }}
            >
              <span
                aria-hidden
                className="absolute inset-0"
                style={{
                  backgroundColor: wash ?? "transparent",
                  transition: "background-color 400ms",
                }}
              />
              {fresh ? (
                <motion.span
                  key={s.lastId}
                  aria-hidden
                  className="absolute inset-0 bg-(--fp-accent)"
                  initial={{ opacity: 0.4 }}
                  animate={{ opacity: 0 }}
                  transition={{
                    duration: durations.slow * 1.5,
                    ease: easings.enter,
                  }}
                />
              ) : null}
              {roomy ? (
                <span className="relative flex items-center gap-1 px-1.5 pt-1 text-[11px] leading-4 text-foreground">
                  <span className="truncate">{t.name}</span>
                  {s && s.writes > 0 && tint === "access" ? (
                    <PenLine
                      aria-hidden
                      className="size-3 shrink-0 text-(--fp-accent)"
                    />
                  ) : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {conflicts.map(([path, ids]) => {
        const t = tileByPath.get(path);
        if (!t) return null;
        const above = t.box.y > 26;
        return (
          <React.Fragment key={`c-${path}`}>
            <motion.span
              aria-hidden
              className="pointer-events-none absolute z-[5] rounded-2 border-2 border-warn shadow-[0_0_0_4px_color-mix(in_oklab,var(--warn)_22%,transparent),0_0_18px_color-mix(in_oklab,var(--warn)_35%,transparent)]"
              style={{
                left: pct(t.box.x - 2, W),
                top: pct(t.box.y - 2, H),
                width: pct(t.box.w + 4, W),
                height: pct(t.box.h + 4, H),
              }}
              initial={{ scale: motionSafe ? 1.12 : 1, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={
                motionSafe
                  ? {
                      scale: springs.snap,
                      opacity: { duration: durations.fast },
                    }
                  : { duration: durations.fast }
              }
            />
            <motion.span
              aria-hidden
              title={`${ids.map(nameOf).join(" and ")} are both in ${path}`}
              className="pointer-events-none absolute z-20 inline-flex h-5 items-center gap-1 rounded-full border border-[color-mix(in_oklab,var(--warn)_50%,transparent)] bg-card px-1.5 text-[11px] whitespace-nowrap text-warn"
              style={{
                left: pct(Math.max(0, Math.min(t.box.x, W - 230)), W),
                top: above
                  ? pct(t.box.y - 24, H)
                  : pct(t.box.y + t.box.h + 4, H),
              }}
              initial={{ opacity: 0, y: motionSafe ? 4 : 0 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              <TriangleAlert className="size-3" />
              {`Possible conflict · ${baseName(path)}`}
            </motion.span>
          </React.Fragment>
        );
      })}

      {present.map((l) => {
        const own = seen.filter((e) => e.agent === l.agent.id);
        const recent = own.slice(-(trail + 1));
        const pts = recent.map((e) => ({ id: e.id, ...centre(e.path) }));
        const mates = crowd.get(l.last?.path ?? "") ?? [l.agent.id];
        const seat = mates.indexOf(l.agent.id);
        const spread =
          mates.length > 1 && seat >= 0
            ? (seat - (mates.length - 1) / 2) * 16
            : 0;
        const stalled = l.state === "stalled";
        return (
          <AgentTrack
            key={l.agent.id}
            agent={l.agent}
            tint={tintOf(l.agent.id)}
            points={pts}
            offset={spread}
            width={W}
            height={H}
            stalled={stalled}
            dimmed={followed !== null && followed !== l.agent.id}
            followed={followed === l.agent.id}
            paused={isPaused}
            motionSafe={motionSafe}
            disabled={disabled || !ready}
            onPress={() =>
              setFollow(followed === l.agent.id ? null : l.agent.id)
            }
            label={`${l.agent.name}, ${stalled ? "stalled" : l.last?.op === "write" ? "editing" : "reading"} ${l.last ? baseName(l.last.path) : ""}`}
          />
        );
      })}

      {activeCount === 0 ? (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-1 rounded-2 bg-[color-mix(in_oklab,var(--card)_88%,transparent)] px-6 text-center">
          <p className="text-[13px] font-medium text-foreground">
            No agents in the repo right now
          </p>
          <p className="text-[12px] text-ink-3">
            {seen.length > 0
              ? `Last step at ${clock(seen[seen.length - 1]?.at ?? 0, utcOffset)}; the map keeps its heat.`
              : "Nothing has been read or written yet."}
          </p>
        </div>
      ) : null}
    </div>
  );

  /* -------------------------------- list --------------------------------- */

  const ranked = (() => {
    const rows = [...stats.entries()]
      .map(([path, s]) => ({ path, s }))
      .sort(
        (a, b) =>
          b.s.touches - a.s.touches ||
          b.s.lastAt - a.s.lastAt ||
          a.path.localeCompare(b.path),
      );
    const top = rows.slice(0, LIST_ROWS);
    // Where an agent is now always shows, even if it is not yet busy.
    for (const l of present) {
      const p = l.last?.path;
      if (p && !top.some((r) => r.path === p)) {
        const row = rows.find((r) => r.path === p);
        if (row) top.splice(Math.max(0, top.length - 1), 1, row);
      }
    }
    return top;
  })();
  const rankOf = new Map(ranked.map((r, i) => [r.path, i]));
  /** The files each agent passed through on its way here, newest first: the list's trail. */
  const trailOf = new Map<string, { tint: string; age: number }[]>();
  for (const l of present) {
    const own = seen.filter((e) => e.agent === l.agent.id);
    const back = own.slice(-(trail + 1), -1).reverse();
    back.forEach((e, k) => {
      const marks = trailOf.get(e.path) ?? [];
      if (!marks.some((m) => m.tint === tintOf(l.agent.id))) {
        marks.push({ tint: tintOf(l.agent.id), age: k + 1 });
      }
      trailOf.set(e.path, marks);
    });
  }
  const maxTouches = Math.max(1, ...ranked.map((r) => r.s.touches));
  const [listFocus, setListFocus] = React.useState<string | null>(null);
  const listRoving =
    listFocus && rankOf.has(listFocus) ? listFocus : (ranked[0]?.path ?? null);
  const rowRefs = React.useRef(new Map<string, HTMLButtonElement>());

  const onRowKey = (event: React.KeyboardEvent, path: string) => {
    const i = rankOf.get(path) ?? 0;
    let next: number | null = null;
    if (event.key === "ArrowDown") next = Math.min(ranked.length - 1, i + 1);
    else if (event.key === "ArrowUp") next = Math.max(0, i - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = ranked.length - 1;
    if (next === null) return;
    event.preventDefault();
    const p = ranked[next]?.path;
    if (!p) return;
    setListFocus(p);
    rowRefs.current.get(p)?.focus({ preventScroll: true });
  };

  const list = (
    <div className="flex flex-col gap-1.5">
      {ranked.length === 0 ? (
        <p className="rounded-3 border border-dashed border-hairline-strong px-3 py-4 text-center text-[12px] text-ink-3">
          No files touched yet.
        </p>
      ) : (
        <div
          role="list"
          aria-label={`Files in ${repo}, busiest first`}
          className="relative"
          style={{ height: ranked.length * ROW_H }}
        >
          {ranked.map(({ path, s }) => {
            const rank = rankOf.get(path) ?? 0;
            const isOpen = opened === path;
            return (
              <motion.div
                key={path}
                role="listitem"
                className="absolute inset-x-0 top-0"
                style={{ height: ROW_H }}
                initial={false}
                animate={{ y: rank * ROW_H }}
                transition={motionSafe ? springs.glide : { duration: 0 }}
              >
                <button
                  ref={(node) => {
                    if (node) rowRefs.current.set(path, node);
                    else rowRefs.current.delete(path);
                  }}
                  type="button"
                  tabIndex={path === listRoving ? 0 : -1}
                  disabled={disabled}
                  onFocus={() => setListFocus(path)}
                  onKeyDown={(event) => onRowKey(event, path)}
                  onClick={(event) => openHistory(path, event.currentTarget)}
                  aria-label={`${path}, ${s.reads} read, ${s.writes} written, last at ${clock(s.lastAt, utcOffset)}`}
                  className={cn(
                    "relative flex h-[36px] w-full items-center gap-2 overflow-hidden rounded-2 border px-2 text-left transition-colors",
                    isOpen
                      ? "border-(--fp-accent)"
                      : "border-hairline hover:border-hairline-strong",
                    FOCUS_IN,
                  )}
                >
                  <span
                    aria-hidden
                    className="absolute inset-0"
                    style={{
                      backgroundColor: washOf(path) ?? "transparent",
                      opacity: 0.7,
                      transition: "background-color 400ms",
                    }}
                  />
                  <span className="relative min-w-0 flex-1">
                    <span className="block truncate text-[12px] leading-4 text-foreground">
                      {baseName(path)}
                    </span>
                    <span className="block truncate font-mono text-[10px] leading-3 text-ink-3">
                      {dirName(path) || "/"}
                    </span>
                  </span>
                  {(trailOf.get(path) ?? []).length > 0 ? (
                    <span
                      aria-hidden
                      className="relative flex shrink-0 items-center gap-0.5"
                    >
                      {(trailOf.get(path) ?? []).slice(0, 3).map((m) => (
                        <span
                          key={m.tint}
                          className="size-1.5 rounded-full"
                          style={{
                            backgroundColor: m.tint,
                            opacity: Math.max(0.25, 0.85 - m.age * 0.15),
                          }}
                        />
                      ))}
                    </span>
                  ) : null}
                  <span
                    aria-hidden
                    className="relative flex h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-surface-2"
                  >
                    <span
                      className="h-full bg-[color-mix(in_oklab,var(--fp-accent)_40%,transparent)]"
                      style={{ width: `${r2((s.reads / maxTouches) * 100)}%` }}
                    />
                    <span
                      className="h-full bg-(--fp-accent)"
                      style={{ width: `${r2((s.writes / maxTouches) * 100)}%` }}
                    />
                  </span>
                  <span className="w-[34px] shrink-0" aria-hidden />
                  <span className="relative w-9 shrink-0 text-right font-mono text-[10px] text-ink-3 tabular-nums">
                    {clock(s.lastAt, utcOffset)}
                  </span>
                </button>
              </motion.div>
            );
          })}
          {present.map((l) => {
            const p = l.last?.path ?? "";
            const rank = rankOf.get(p);
            if (rank === undefined) return null;
            const mates = present.filter((m) => m.last?.path === p);
            const seat = mates.findIndex((m) => m.agent.id === l.agent.id);
            return (
              <motion.span
                key={l.agent.id}
                aria-hidden
                className={cn(
                  "pointer-events-none absolute top-0 z-10 flex rounded-full",
                  l.state === "stalled" && "opacity-60",
                )}
                style={{ right: 52 + seat * 12 }}
                initial={false}
                animate={{ y: rank * ROW_H + 10 }}
                transition={motionSafe ? springs.glide : { duration: 0 }}
              >
                <Mono name={l.agent.name} tint={tintOf(l.agent.id)} size="sm" />
              </motion.span>
            );
          })}
        </div>
      )}
      {stats.size > ranked.length ? (
        <p className="px-1 text-[11px] text-ink-3">
          {`and ${stats.size - ranked.length} more touched ${stats.size - ranked.length === 1 ? "file" : "files"}`}
        </p>
      ) : null}
    </div>
  );

  /* ------------------------------ inspector ------------------------------ */

  const followedLive = live.find((l) => l.agent.id === followed) ?? null;
  const rows: FootprintEvent[] = opened
    ? historyOf(opened).slice(0, 4)
    : followedLive
      ? seen
          .filter((e) => e.agent === followedLive.agent.id)
          .slice(-4)
          .reverse()
      : seen.slice(-4).reverse();

  const inspector = (
    <div className="rounded-3 border border-hairline bg-surface-1">
      <Measured glide={motionSafe}>
        <div className="flex flex-col gap-1.5 p-2.5">
          <div className="flex h-7 items-center gap-2">
            {opened ? (
              <>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
                  {opened}
                </span>
                <span className="shrink-0 text-[11px] text-ink-3 tabular-nums">
                  {historyOf(opened).length} steps
                </span>
                <button
                  ref={setCloseNode}
                  type="button"
                  onClick={closeHistory}
                  aria-label="Close file history"
                  className={cn(
                    "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                    FOCUS,
                  )}
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </>
            ) : followedLive ? (
              <>
                <Crosshair
                  aria-hidden
                  className="size-3.5 shrink-0 text-(--fp-accent)"
                />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
                  Following {followedLive.agent.name}
                  <span className="font-normal text-ink-3">
                    {" "}
                    · {followedLive.agent.task}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    const was = followedLive.agent.id;
                    const root = event.currentTarget.closest('[role="region"]');
                    setFollow(null);
                    // The Stop button leaves with the follow; focus goes to the agent.
                    root
                      ?.querySelector<HTMLElement>(
                        `[data-fp-agent="${CSS.escape(was)}"]`,
                      )
                      ?.focus();
                  }}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center rounded-2 px-2 text-[11px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                    FOCUS,
                  )}
                >
                  Stop
                </button>
              </>
            ) : (
              <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                Recent steps
              </span>
            )}
          </div>
          {rows.length === 0 ? (
            <p className="text-[12px] text-ink-3">Nothing yet.</p>
          ) : (
            <ol className="flex flex-col gap-0.5">
              {rows.map((e) => (
                <motion.li
                  key={e.id}
                  layout={motionSafe ? "position" : false}
                  transition={springs.glide}
                  className="flex items-center gap-2 text-[12px] leading-5"
                >
                  <span className="w-9 shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                    {clock(e.at, utcOffset)}
                  </span>
                  <Mono
                    name={nameOf(e.agent)}
                    tint={tintOf(e.agent)}
                    size="sm"
                  />
                  <span className="min-w-0 truncate text-ink-2">
                    <span className="text-foreground">{nameOf(e.agent)}</span>{" "}
                    {e.op === "write" ? "edited" : "read"}{" "}
                    <span className="font-mono text-[11px]">
                      {opened ? "" : baseName(e.path)}
                    </span>
                  </span>
                </motion.li>
              ))}
            </ol>
          )}
        </div>
      </Measured>
    </div>
  );

  /* -------------------------------- header ------------------------------- */

  const header = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="min-w-0 flex-1 basis-44">
        <div className="flex items-center gap-2">
          <FolderTree
            aria-hidden
            className="size-4 shrink-0 text-(--fp-accent)"
          />
          <p
            id={titleId}
            className="truncate font-mono text-[13px] font-semibold"
          >
            {repo}
          </p>
          {isPaused ? (
            <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-surface-2 px-1.5 text-[10px] font-medium text-ink-2">
              Paused
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[12px] leading-4 text-ink-3 tabular-nums">
          {`${activeCount} ${activeCount === 1 ? "agent" : "agents"} · ${touchedCount} ${touchedCount === 1 ? "file" : "files"} touched · ${writtenCount} written`}
        </p>
      </div>
      <button
        type="button"
        aria-disabled={disabled || !ready || undefined}
        onClick={togglePause}
        className={cn(
          "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-2 border border-hairline-strong px-2.5 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-2 @min-[30rem]/footprint-map:px-3",
          (disabled || !ready) && "opacity-50",
          FOCUS,
        )}
      >
        {isPaused ? (
          <Play aria-hidden className="size-3.5" />
        ) : (
          <Pause aria-hidden className="size-3.5" />
        )}
        <span className="sr-only @min-[30rem]/footprint-map:not-sr-only">
          {isPaused ? "Resume agents" : "Pause agents"}
        </span>
      </button>
    </div>
  );

  const toolbar =
    agents.length > 0 ? (
      <div
        role="group"
        aria-label="Agents"
        className="flex flex-wrap items-center gap-1.5"
      >
        {live.map((l) => {
          const on = followed === l.agent.id;
          const verb =
            l.state === "idle"
              ? "idle"
              : l.state === "stalled"
                ? `stalled ${Math.max(1, Math.round(l.since / MIN))}m`
                : l.last?.op === "write"
                  ? `editing ${baseName(l.last.path)}`
                  : `reading ${l.last ? baseName(l.last.path) : ""}`;
          return (
            <button
              key={l.agent.id}
              type="button"
              aria-pressed={on}
              aria-describedby={hintId}
              aria-keyshortcuts="F Enter"
              data-fp-agent={l.agent.id}
              aria-label={`${l.agent.name}, ${verb}`}
              disabled={disabled}
              onClick={() => setFollow(on ? null : l.agent.id)}
              onKeyDown={(event) => onAgentKey(event, l)}
              className={cn(
                "inline-flex h-8 max-w-full min-w-0 items-center gap-1 rounded-full border pr-2 pl-1 text-[12px] transition-colors @min-[30rem]/footprint-map:gap-1.5 @min-[30rem]/footprint-map:pr-2.5 @min-[30rem]/footprint-map:pl-1.5",
                on
                  ? "border-(--fp-accent) bg-(--fp-wash) text-foreground"
                  : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
                l.state === "idle" && "opacity-60",
                FOCUS,
              )}
            >
              <Mono name={l.agent.name} tint={tintOf(l.agent.id)} />
              <span className="shrink-0 font-medium text-foreground">
                {l.agent.name}
              </span>
              <span
                className={cn(
                  "hidden min-w-0 truncate @min-[30rem]/footprint-map:inline",
                  l.state === "stalled" && "text-warn",
                )}
              >
                {verb}
              </span>
              <span
                aria-hidden
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  l.state === "active"
                    ? "bg-success"
                    : l.state === "stalled"
                      ? "bg-warn"
                      : "bg-ink-3",
                )}
              />
            </button>
          );
        })}
      </div>
    ) : null;

  /* -------------------------------- states ------------------------------- */

  const body =
    status === "loading" ? (
      <div className="flex flex-col gap-2" aria-busy="true">
        <div
          className="grid grid-cols-4 gap-1.5"
          style={{ height: Math.min(H, 180) }}
        >
          {[3, 2, 2, 1, 1, 2, 1, 1].map((span, i) => (
            <span
              key={i}
              className="rounded-2 bg-surface-2"
              style={{
                gridColumn: `span ${Math.min(span, 2)}`,
                opacity: 1 - i * 0.08,
              }}
            />
          ))}
        </div>
        <p className="text-[12px] text-ink-3">Mapping the repository…</p>
      </div>
    ) : status === "error" ? (
      <div className="flex flex-col items-start gap-3 rounded-3 border border-hairline bg-surface-1 p-4">
        <p className="inline-flex items-center gap-2 text-[13px] text-foreground">
          <TriangleAlert aria-hidden className="size-4 shrink-0 text-danger" />
          The repository map could not be loaded.
        </p>
        <button
          type="button"
          onClick={onReload}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-2",
            FOCUS,
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Try again
        </button>
      </div>
    ) : (
      <>
        {toolbar}
        <div className="hidden @min-[30rem]/footprint-map:block">{map}</div>
        <div className="@min-[30rem]/footprint-map:hidden">{list}</div>
        {inspector}
      </>
    );

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      onKeyDown={onRootKey}
      className={cn(
        "@container/footprint-map relative flex w-full flex-col gap-2.5 overflow-hidden rounded-4 border border-hairline bg-card p-4 text-foreground",
        disabled && "opacity-80",
        className,
      )}
      style={
        {
          "--fp-accent": accent,
          "--fp-wash": `color-mix(in oklab, ${accent} 12%, transparent)`,
        } as React.CSSProperties
      }
    >
      {header}
      {body}
      <p id={hintId} className="sr-only">
        On an agent, F or Space follows it and Enter opens the history of the
        file it is in. In the map, arrow keys move between files, Enter opens a
        file’s history and Escape closes it.
      </p>
      <p role="status" className="sr-only">
        {said}
      </p>
    </div>
  );
}
