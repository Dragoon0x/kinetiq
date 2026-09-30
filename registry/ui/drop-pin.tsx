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
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

/** A place on the map, in map units: 0–1200 east, 0–200 down from the top edge. */
export type DropPinPoint = { x: number; y: number };
export type DropPinColour = "cobalt" | "red" | "green" | "amber";
export type DropPinMap = "paper" | "night";

export type DropPinProps = {
  /** Controlled: where the pin is, or `null` for no pin. */
  value?: DropPinPoint | null;
  /** Initial pin when uncontrolled. @default null */
  defaultValue?: DropPinPoint | null;
  /** Fires once per drop, once per drag on release, and with `null` when the pin is removed. */
  onValueChange?: (point: DropPinPoint | null) => void;
  /** The map's accessible name. @default "Map" */
  label?: string;
  /** How long a press must be held before the pin drops, in ms. @default 450 */
  delay?: number;
  /** How lively the landing is, 0 (a thud) to 1 (a rubber ball). @default 0.5 */
  bounce?: number;
  /** The pin head. @default "cobalt" */
  colour?: DropPinColour;
  /** A warm street map that follows the page theme, or a dark one with lit streets. @default "paper" */
  map?: DropPinMap;
  /** Play the fall and the landing. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

const WORLD_W = 1200;
const WORLD_H = 200;
const MID = WORLD_W / 2;
const CELL_X = 60;
const CELL_Y = 50;
/** Pixels a finger may wander before a hold stops being a hold. */
const SLIP = 8;
const PIN_W = 24;
const PIN_H = 32;
const TAG_W = 136;
const TAG_H = 40;
/** Gravity: an ease-in whose last slope is 2, so the landing speed is 2h/t. */
const FALL: [number, number, number, number] = [0.11, 0, 0.5, 0];
const LANDING = 520;

const PINS: Record<DropPinColour, string> = {
  cobalt: "var(--accent-bright)",
  red: "var(--danger)",
  green: "var(--success)",
  amber: "var(--warn)",
};

type Palette = {
  street: string;
  block: string;
  park: string;
  tree: string;
  water: string;
  bridge: string;
  label: string;
  district: string;
  grid: string;
  gridLabel: string;
  shadow: string;
};

// Paper follows the page's surfaces with a warm cast; night is dark in both
// themes, its streets lit, so it is mixed toward black rather than a surface.
const PALETTES: Record<DropPinMap, Palette> = {
  paper: {
    street: "color-mix(in oklab, var(--bg-1) 93%, var(--warn))",
    block: "color-mix(in oklab, var(--bg-2) 84%, var(--warn))",
    park: "color-mix(in oklab, var(--success) 24%, var(--bg-1))",
    tree: "color-mix(in oklab, var(--success) 42%, var(--bg-1))",
    water: "color-mix(in oklab, var(--accent) 26%, var(--bg-1))",
    bridge: "color-mix(in oklab, var(--ink-3) 45%, transparent)",
    label: "var(--ink-2)",
    district: "var(--ink-3)",
    grid: "color-mix(in oklab, var(--ink-3) 30%, transparent)",
    gridLabel: "color-mix(in oklab, var(--ink-3) 80%, transparent)",
    shadow: "color-mix(in oklab, black 34%, transparent)",
  },
  night: {
    street: "color-mix(in oklab, var(--accent-bright) 36%, black)",
    block: "color-mix(in oklab, var(--accent) 11%, black)",
    park: "color-mix(in oklab, var(--success) 20%, black)",
    tree: "color-mix(in oklab, var(--success) 34%, black)",
    water: "color-mix(in oklab, var(--accent) 34%, black)",
    bridge: "color-mix(in oklab, var(--accent-bright) 62%, black)",
    label: "color-mix(in oklab, var(--accent-bright) 40%, white)",
    district: "color-mix(in oklab, var(--accent-bright) 72%, black)",
    grid: "color-mix(in oklab, white 10%, transparent)",
    gridLabel: "color-mix(in oklab, white 42%, transparent)",
    shadow: "color-mix(in oklab, black 60%, transparent)",
  },
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Where a point is in the map's own survey grid: a lettered column and a
 * numbered row, plus easting and northing in grid units to one decimal.
 */
export function dropPinPlace(point: DropPinPoint) {
  const col = clamp(Math.floor(point.x / CELL_X), 0, WORLD_W / CELL_X - 1);
  const row = clamp(Math.floor(point.y / CELL_Y), 0, WORLD_H / CELL_Y - 1);
  const cell = `${String.fromCharCode(65 + col)}${row + 1}`;
  const easting = Math.round(clamp(point.x, 0, WORLD_W) * 5) / 10;
  const northing = Math.round((WORLD_H - clamp(point.y, 0, WORLD_H)) * 5) / 10;
  return {
    cell,
    easting,
    northing,
    text: `${cell} · ${easting.toFixed(1)} E · ${northing.toFixed(1)} N`,
  };
}

/* ---------- the town: drawn once, from a hash, the same everywhere ---------- */

function hash(n: number): number {
  let h = Math.imul(n ^ 0x3c6ef372, 0x297a2d39) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
const rand = (i: number, salt: number) =>
  hash(i * 7919 + salt * 104729) / 0xffffffff;

type Box = { x: number; y: number; w: number; h: number };
type Block = Box & { park: boolean };
type Label = {
  text: string;
  x: number;
  y: number;
  angle: number;
  kind: "street" | "district" | "water";
};
type Town = {
  blocks: Block[];
  trees: { x: number; y: number; r: number }[];
  river: string;
  bridges: Box[];
  avenue: { x1: number; y1: number; x2: number; y2: number };
  labels: Label[];
};

const riverAt = (y: number) =>
  404 + 16 * Math.sin(y / 30) + (y - WORLD_H / 2) * 0.18;

function buildTown(): Town {
  const verticals: { x: number; w: number }[] = [];
  for (let x = 18, k = 0; x < WORLD_W + 60; k += 1) {
    verticals.push({ x: r2(x), w: k % 4 === 1 ? 10 : 5 });
    x += 66 + rand(k, 11) * 22;
  }
  const horizontals = [16, 68, 124, 176].map((y, i) => ({
    y: r2(y + (rand(i, 12) - 0.5) * 6),
    w: i === 2 ? 10 : 5,
  }));

  const bands: { top: number; bottom: number }[] = [];
  let top = -8;
  for (const h of horizontals) {
    bands.push({ top, bottom: h.y - h.w / 2 - 1.5 });
    top = h.y + h.w / 2 + 1.5;
  }
  bands.push({ top, bottom: WORLD_H + 8 });

  const blocks: Block[] = [];
  const edges = [{ x: -20, w: 0 }, ...verticals];
  for (let i = 0; i < edges.length - 1; i += 1) {
    const a = edges[i];
    const b = edges[i + 1];
    if (!a || !b) continue;
    const left = a.x + a.w / 2 + 1.5;
    const right = b.x - b.w / 2 - 1.5;
    if (right - left < 6) continue;
    bands.forEach((band, j) => {
      const h = band.bottom - band.top;
      if (h < 4) return;
      // Some blocks are two lots with an alley between them.
      if (right - left > 50 && rand(i * 7 + j, 13) > 0.55) {
        const cut = left + (right - left) * (0.4 + rand(i * 7 + j, 14) * 0.2);
        blocks.push(
          {
            x: r2(left),
            y: r2(band.top),
            w: r2(cut - 1.2 - left),
            h: r2(h),
            park: false,
          },
          {
            x: r2(cut + 1.2),
            y: r2(band.top),
            w: r2(right - cut - 1.2),
            h: r2(h),
            park: false,
          },
        );
      } else {
        blocks.push({
          x: r2(left),
          y: r2(band.top),
          w: r2(right - left),
          h: r2(h),
          park: false,
        });
      }
    });
  }

  // Two parks and a green, on the blocks nearest three chosen spots.
  const trees: Town["trees"] = [];
  [
    [548, 96],
    [772, 150],
    [300, 42],
  ].forEach(([px, py], p) => {
    let best: Block | undefined;
    let bestD = Infinity;
    for (const block of blocks) {
      const d = Math.hypot(
        block.x + block.w / 2 - (px ?? 0),
        block.y + block.h / 2 - (py ?? 0),
      );
      if (d < bestD && !block.park) {
        bestD = d;
        best = block;
      }
    }
    if (!best) return;
    best.park = true;
    const count = 4 + Math.floor(rand(p, 15) * 4);
    for (let t = 0; t < count; t += 1) {
      trees.push({
        x: r2(best.x + 4 + rand(p * 13 + t, 16) * Math.max(0, best.w - 8)),
        y: r2(best.y + 4 + rand(p * 13 + t, 17) * Math.max(0, best.h - 8)),
        r: r2(2.2 + rand(p * 13 + t, 18) * 1.4),
      });
    }
  });

  const samples: [number, number][] = [];
  for (let y = -14; y <= WORLD_H + 14; y += 14) samples.push([riverAt(y), y]);
  let river = "";
  samples.forEach((p, i) => {
    const prev = samples[i - 1] ?? p;
    const next = samples[i + 1] ?? p;
    const after = samples[i + 2] ?? next;
    if (i === 0) river += `M${r2(p[0])} ${r2(p[1])}`;
    if (i === samples.length - 1) return;
    const c1 = [p[0] + (next[0] - prev[0]) / 6, p[1] + (next[1] - prev[1]) / 6];
    const c2 = [
      next[0] - (after[0] - p[0]) / 6,
      next[1] - (after[1] - p[1]) / 6,
    ];
    river += `C${r2(c1[0] ?? 0)} ${r2(c1[1] ?? 0)} ${r2(c2[0] ?? 0)} ${r2(c2[1] ?? 0)} ${r2(next[0])} ${r2(next[1])}`;
  });

  const bridges = horizontals.map((h) => ({
    x: r2(riverAt(h.y) - 17),
    y: r2(h.y - h.w / 2 - 1),
    w: 34,
    h: h.w + 2,
  }));

  const major = verticals
    .filter((v) => v.w === 10)
    .reduce(
      (best, v) => (Math.abs(v.x - 700) < Math.abs(best.x - 700) ? v : best),
      { x: 700, w: 10 },
    );
  const avenue = horizontals[2] ?? { y: 124, w: 10 };
  const canalY = 160;
  const canalAngle =
    (Math.atan2(1, (riverAt(canalY + 1) - riverAt(canalY - 1)) / 2) * 180) /
    Math.PI;

  return {
    blocks,
    trees,
    river,
    bridges,
    avenue: { x1: 612, y1: WORLD_H + 8, x2: 918, y2: -8 },
    labels: [
      {
        text: "Coldbrook Ave",
        x: 540,
        y: r2(avenue.y + 2.6),
        angle: 0,
        kind: "street",
      },
      {
        text: "Fernworks Row",
        x: r2(major.x + 2.6),
        y: 96,
        angle: -90,
        kind: "street",
      },
      { text: "BASIN QUARTER", x: 300, y: 100, angle: 0, kind: "district" },
      { text: "GAUGE HILL", x: 900, y: 96, angle: 0, kind: "district" },
      { text: "WAYLIGHT YARDS", x: 630, y: 44, angle: 0, kind: "district" },
      {
        text: "Fieldline Canal",
        x: r2(riverAt(canalY)),
        y: canalY,
        angle: r2(canalAngle),
        kind: "water",
      },
    ],
  };
}

const TOWN = buildTown();

/** One capital of a district name with its tracking, in world units. */
const DISTRICT_EM = 8.5 * (0.64 + 0.22);

/**
 * Where a district's name goes in a frame `view` wide. The frame crops the
 * town to the card, so a name slides inward a little to stay whole, and once
 * its quarter is out of frame it is left off: a map never prints half a name.
 */
const districtX = (label: Label, view: number) => {
  const half = (label.text.length * DISTRICT_EM) / 2;
  const x = Math.min(
    MID + view / 2 - 12 - half,
    Math.max(MID - view / 2 + 12 + half, label.x),
  );
  return Math.abs(x - label.x) <= 72 ? r2(x) : null;
};

/** The drawing: static per palette and frame width, so it renders rarely. */
const TownMap = React.memo(function TownMap({
  look,
  view,
}: {
  look: Palette;
  view: number;
}) {
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${WORLD_W} ${WORLD_H}`}
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 size-full"
    >
      <rect width={WORLD_W} height={WORLD_H} fill={look.street} />
      {TOWN.blocks.map((b) => (
        <rect
          key={`${b.x}-${b.y}`}
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          rx={2.5}
          fill={b.park ? look.park : look.block}
        />
      ))}
      {TOWN.trees.map((t, i) => (
        <circle key={i} cx={t.x} cy={t.y} r={t.r} fill={look.tree} />
      ))}
      <line
        x1={TOWN.avenue.x1}
        y1={TOWN.avenue.y1}
        x2={TOWN.avenue.x2}
        y2={TOWN.avenue.y2}
        stroke={look.street}
        strokeWidth={9}
      />
      <path d={TOWN.river} fill="none" stroke={look.water} strokeWidth={22} />
      {TOWN.bridges.map((b) => (
        <rect
          key={b.y}
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          fill={look.street}
          stroke={look.bridge}
          strokeWidth={0.8}
        />
      ))}
      <g stroke={look.grid} strokeWidth={0.75} strokeDasharray="2 4">
        {Array.from({ length: WORLD_W / CELL_X - 1 }, (_, i) => (
          <line
            key={`v${i}`}
            x1={(i + 1) * CELL_X}
            y1={0}
            x2={(i + 1) * CELL_X}
            y2={WORLD_H}
          />
        ))}
        {Array.from({ length: WORLD_H / CELL_Y - 1 }, (_, i) => (
          <line
            key={`h${i}`}
            x1={0}
            y1={(i + 1) * CELL_Y}
            x2={WORLD_W}
            y2={(i + 1) * CELL_Y}
          />
        ))}
      </g>
      <g
        fill={look.gridLabel}
        className="font-mono"
        style={{ fontSize: 7.5, letterSpacing: "0.04em" }}
      >
        {Array.from({ length: WORLD_W / CELL_X }, (_, i) => (
          <text key={`c${i}`} x={i * CELL_X + 4} y={10}>
            {String.fromCharCode(65 + i)}
          </text>
        ))}
        {Array.from({ length: WORLD_W / CELL_X / 4 }, (_, k) =>
          Array.from({ length: WORLD_H / CELL_Y }, (_, row) => (
            <text
              key={`r${k}-${row}`}
              x={k * 4 * CELL_X + 4}
              y={row * CELL_Y + 45}
            >
              {row + 1}
            </text>
          )),
        )}
      </g>
      {TOWN.labels.map((l) => {
        const x = l.kind === "district" ? districtX(l, view) : l.x;
        if (x === null) return null;
        return (
          <text
            key={l.text}
            x={x}
            y={l.y}
            textAnchor="middle"
            transform={l.angle ? `rotate(${l.angle} ${l.x} ${l.y})` : undefined}
            fill={l.kind === "district" ? look.district : look.label}
            stroke={
              l.kind === "district"
                ? "none"
                : l.kind === "water"
                  ? look.water
                  : look.street
            }
            strokeWidth={2.5}
            strokeLinejoin="round"
            paintOrder="stroke"
            style={{
              fontSize: l.kind === "district" ? 8.5 : 7.5,
              letterSpacing: l.kind === "district" ? "0.22em" : "0.03em",
              fontWeight: l.kind === "district" ? 600 : 500,
              fontStyle: l.kind === "water" ? "italic" : undefined,
            }}
          >
            {l.text}
          </text>
        );
      })}
    </svg>
  );
});

const samePoint = (
  a: DropPinPoint | null | undefined,
  b: DropPinPoint | null | undefined,
) =>
  (!a && !b) ||
  (!!a && !!b && Math.abs(a.x - b.x) < 0.05 && Math.abs(a.y - b.y) < 0.05);

/**
 * A location picker on an invented town. Hold anywhere on the map and a
 * shadow grows under the finger while an aiming ring closes on it; at the
 * delay a pin falls from above the top edge on a gravity tween with a
 * falling whistle, lands with a thock, squashes at its tip, and rebounds on a
 * spring whose damping is `bounce` — reflected off the ground, so it hops
 * rather than sinks, each later contact a quieter thock. Its coordinates, in
 * the map's own survey grid, fade up above it. The pin drags: it lifts off
 * its shadow, follows 1:1, rubber-bands at the visible edges, and a flick
 * lands where it would come to rest, on the glide spring with its velocity.
 *
 * The map is one focusable element. Keyboard focus shows a crosshair that
 * the arrow keys move (Shift for further); Enter or Space drops the pin at
 * it, and Delete removes it. Under reduced motion nothing falls, bounces or
 * glides: the pin fades in where it lands with the same thock, drags set down
 * where they are released, and the crosshair jumps.
 */
export function DropPin({
  value,
  defaultValue = null,
  onValueChange,
  label = "Map",
  delay = 450,
  bounce = 0.5,
  colour = "cobalt",
  map = "paper",
  sound = false,
  disabled = false,
  className,
}: DropPinProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = React.useId();
  const [own, setOwn] = React.useState<DropPinPoint | null>(defaultValue);
  const point = value === undefined ? own : value;
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [span, setSpan] = React.useState(0);
  const [keyFocus, setKeyFocus] = React.useState(false);
  const [said, setSaid] = React.useState({ text: "", n: 0 });

  const look = PALETTES[map] ?? PALETTES.paper;
  const tint = PINS[colour] ?? PINS.cobalt;
  const lively = clamp01(bounce);

  // Only what is on screen can be reached: the pin and the crosshair stay in
  // the visible slice of the town, with room for the pin's head.
  const view = span > 0 && span < WORLD_W ? span : WORLD_W;
  const bounds = {
    minX: r2(MID - view / 2 + 14),
    maxX: r2(MID + view / 2 - 14),
    minY: PIN_H + 6,
    maxY: WORLD_H - 10,
  };

  const [start] = React.useState(() => point);
  const pinX = useMotionValue(start?.x ?? MID);
  const pinY = useMotionValue(start?.y ?? WORLD_H / 2);
  const shown = useMotionValue(start ? 1 : 0);
  const tag = useMotionValue(start ? 1 : 0);
  const shade = useMotionValue(start ? 1 : 0);
  const drop = useMotionValue(0);
  const hop = useMotionValue(0);
  const squash = useMotionValue(0);
  const lift = useMotionValue(0);
  const holdX = useMotionValue(MID);
  const holdY = useMotionValue(WORLD_H / 2);
  const ghost = useMotionValue(0);
  const crossX = useMotionValue(start?.x ?? MID);
  const crossY = useMotionValue(start?.y ?? WORLD_H / 2);

  const runs = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef<number[]>([]);
  const holdTimer = React.useRef<number | null>(null);
  const pointer = React.useRef<{ id: number; x: number; y: number } | null>(
    null,
  );
  const expected = React.useRef<{ point: DropPinPoint | null } | null>(null);
  const shownPoint = React.useRef<DropPinPoint | null>(start);
  const landPan = React.useRef(0);
  const settingDown = React.useRef(false);
  /** Set while the hop is zeroed by hand, so a reset is not heard as a landing. */
  const resetting = React.useRef(false);
  const aim = React.useRef({ x: start?.x ?? MID, y: start?.y ?? WORLD_H / 2 });
  const aimCell = React.useRef("");

  const zeroHop = () => {
    resetting.current = true;
    hop.set(0);
    resetting.current = false;
  };
  const run = (key: string, controls: AnimationPlaybackControls) => {
    runs.current.get(key)?.stop();
    runs.current.set(key, controls);
  };
  const stop = (...keys: string[]) => {
    for (const key of keys) {
      runs.current.get(key)?.stop();
      runs.current.delete(key);
    }
  };
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current = timers.current.filter((t) => t !== id);
      fn();
    }, ms);
    timers.current.push(id);
  };
  const announce = (text: string) => setSaid((s) => ({ text, n: s.n + 1 }));
  const panAt = (x: number) => {
    const rect = node?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2 + (x - MID), null) : 0;
  };
  const toWorld = (clientX: number, clientY: number) => {
    const rect = node?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: clientX - rect.left - rect.width / 2 + MID,
      y: clientY - rect.top,
    };
  };
  const inBounds = (p: DropPinPoint) => ({
    x: r1(clamp(p.x, bounds.minX, bounds.maxX)),
    y: r1(clamp(p.y, bounds.minY, bounds.maxY)),
  });

  const commit = (next: DropPinPoint | null) => {
    expected.current = { point: next };
    if (value === undefined) {
      setOwn(next);
    } else {
      // A host that takes the change answers at once; one that does not has
      // refused it, and the pin goes back to where the host says it is.
      later(() => {
        if (!expected.current) return;
        expected.current = null;
        latest.current.follow(latest.current.point);
      }, 300);
    }
    onValueChange?.(next);
  };

  const land = (speed: number, quiet: boolean) => {
    const pan = landPan.current;
    if (!quiet) audio.play("thock", { gain: 0.62, pan });
    run(
      "tag",
      animate(tag, 1, {
        duration: durations.base,
        ease: easings.enter,
        delay: 0.12,
      }),
    );
    if (!motionSafe) return;
    squash.set(r3(0.08 + 0.2 * lively));
    run("squash", animate(squash, 0, springs.snap));
    if (lively > 0.02) {
      // The house recoil at 0.5; a thud at 0, a rubber ball at 1.
      const ratio = lerp(0.9, 0.16, lively);
      zeroHop();
      run(
        "hop",
        animate(hop, 0, {
          type: "spring",
          stiffness: LANDING,
          damping: r3(2 * ratio * Math.sqrt(LANDING)),
          mass: 1,
          velocity: -r2(speed * lerp(0.12, 0.5, lively)),
        }),
      );
    }
  };

  const fall = (
    to: DropPinPoint,
    pan: number,
    how: "hold" | "key" | "host",
  ) => {
    stop("drop", "hop", "squash", "x", "y", "lift", "shade", "shown", "tag");
    const quiet = how === "host";
    landPan.current = pan;
    pinX.set(to.x);
    pinY.set(to.y);
    lift.set(0);
    zeroHop();
    squash.set(0);
    tag.set(0);
    const where = dropPinPlace(to);
    if (!quiet) {
      announce(
        `Pin dropped at ${where.cell}, ${where.easting.toFixed(1)} east, ${where.northing.toFixed(1)} north.`,
      );
    }
    if (!motionSafe) {
      drop.set(0);
      shade.set(1);
      shown.set(0);
      run("shown", animate(shown, 1, { duration: durations.base }));
      land(0, quiet);
      return;
    }
    shown.set(1);
    // From just above the top edge, so it arrives from outside the map.
    const h = to.y + PIN_H + 12;
    const t = r3(Math.min(0.42, 0.18 + h / 900));
    drop.set(-r2(h));
    shade.set(how === "hold" ? 0.55 : 0.15);
    if (!quiet) audio.play("whistle", { gain: 0.5, pan });
    run("shade", animate(shade, 1, { duration: t, ease: FALL }));
    run(
      "drop",
      animate(drop, 0, {
        duration: t,
        ease: FALL,
        onComplete: () => latest.current.land((2 * h) / t, quiet),
      }),
    );
  };

  const vanish = () => {
    stop("drop", "hop", "squash", "lift", "x", "y");
    settingDown.current = false;
    run(
      "tag",
      animate(tag, 0, { duration: durations.fast, ease: easings.exit }),
    );
    run(
      "shade",
      animate(shade, 0, { duration: durations.fast, ease: easings.exit }),
    );
    run(
      "shown",
      animate(shown, 0, { duration: durations.fast, ease: easings.exit }),
    );
    if (motionSafe) {
      run(
        "drop",
        animate(drop, -8, { duration: durations.fast, ease: easings.exit }),
      );
    }
  };

  // The host's value, when it is not the one a gesture just reported: moved
  // pins glide, new ones fall, removed ones leave — all silently.
  const follow = (next: DropPinPoint | null) => {
    shownPoint.current = next;
    if (!next) {
      vanish();
      return;
    }
    if (shown.get() < 0.5) {
      fall(next, panAt(next.x), "host");
      return;
    }
    if (!motionSafe) {
      pinX.set(next.x);
      pinY.set(next.y);
      return;
    }
    run("x", animate(pinX, next.x, springs.glide));
    run("y", animate(pinY, next.y, springs.glide));
  };

  const cancelHold = () => {
    if (holdTimer.current === null) return;
    window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
    run(
      "ghost",
      animate(ghost, 0, { duration: durations.fast, ease: easings.exit }),
    );
  };

  const startHold = (at: DropPinPoint, pan: number) => {
    cancelHold();
    holdX.set(r2(at.x));
    holdY.set(r2(at.y));
    const ms = Math.max(100, delay);
    run(
      "ghost",
      animate(ghost, 1, { duration: r3(ms / 1000), ease: "linear" }),
    );
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      stop("ghost");
      ghost.set(0);
      latest.current.place(at, pan, "hold");
    }, ms);
  };

  const place = (at: DropPinPoint, pan: number, how: "hold" | "key") => {
    const to = inBounds(at);
    shownPoint.current = to;
    fall(to, pan, how);
    commit(to);
  };

  const remove = () => {
    if (!point) return;
    shownPoint.current = null;
    vanish();
    commit(null);
    announce("Pin removed.");
  };

  const latest = React.useRef({ land, follow, place, point });
  React.useEffect(() => {
    latest.current = { land, follow, place, point };
  });

  React.useEffect(() => {
    const asked = expected.current;
    if (asked && samePoint(asked.point, point)) {
      expected.current = null;
      shownPoint.current = point;
      return;
    }
    if (samePoint(shownPoint.current, point)) return;
    latest.current.follow(point);
  }, [point]);

  // Every ground contact of a visible hop is heard and squashes the tip a
  // little; the setting-down of a dragged pin is heard once, as it lands.
  React.useEffect(() => {
    let prev = 0;
    let peak = 0;
    const offHop = hop.on("change", (v) => {
      if (resetting.current) {
        prev = 0;
        peak = 0;
        return;
      }
      peak = Math.max(peak, Math.abs(v));
      if ((prev < 0 && v >= 0) || (prev > 0 && v <= 0)) {
        if (peak > 1.2) {
          audio.play("thock", {
            gain: r3(Math.min(0.45, 0.06 + peak / 40)),
            pitch: 1.12,
            pan: landPan.current,
          });
          squash.set(r3(Math.min(0.12, peak / 70)));
          run("squash", animate(squash, 0, springs.snap));
        }
        peak = 0;
      }
      prev = v;
    });
    const offLift = lift.on("change", (v) => {
      if (!settingDown.current || v > 0.05) return;
      settingDown.current = false;
      audio.play("thock", { gain: 0.34, pitch: 1.2, pan: landPan.current });
    });
    return () => {
      offHop();
      offLift();
    };
  }, [audio, hop, lift, squash]);

  React.useEffect(() => {
    if (!node) return;
    const measure = () =>
      setSpan(Math.round(node.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  // A hold never outlives the page's attention.
  React.useEffect(() => {
    const interrupt = () => {
      if (holdTimer.current === null) return;
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
      ghost.set(0);
    };
    const onVisibility = () => {
      if (document.hidden) interrupt();
    };
    window.addEventListener("blur", interrupt);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", interrupt);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ghost]);

  React.useEffect(() => {
    // Effects can be torn down and re-run without the map going anywhere
    // (React's development checks do it). A fall, hop or drag cut short
    // there is put down where the pin rests, rather than left in the air.
    const at = shownPoint.current;
    resetting.current = true;
    hop.set(0);
    resetting.current = false;
    drop.set(0);
    squash.set(0);
    lift.set(0);
    ghost.set(0);
    shown.set(at ? 1 : 0);
    tag.set(at ? 1 : 0);
    shade.set(at ? 1 : 0);
    if (at) {
      pinX.set(at.x);
      pinY.set(at.y);
    }
    settingDown.current = false;
    const owned = runs.current;
    return () => {
      for (const c of owned.values()) c.stop();
      owned.clear();
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    };
  }, [drop, ghost, hop, lift, pinX, pinY, shade, shown, squash, tag]);

  const origin = React.useRef({ x: 0, y: 0 });
  const drag = useDrag({
    threshold: 3,
    disabled: disabled || !point,
    onStart: () => {
      stop("drop", "hop", "squash", "x", "y");
      drop.set(0);
      zeroHop();
      squash.set(0);
      settingDown.current = false;
      origin.current = { x: pinX.get(), y: pinY.get() };
      if (motionSafe) {
        run("lift", animate(lift, 1, springs.flick));
        run("shade", animate(shade, 0.7, springs.flick));
      }
    },
    onMove: ({ offset }) => {
      pinX.set(
        r2(
          rubberClamp(
            origin.current.x + offset.x,
            bounds.minX,
            bounds.maxX,
            24,
          ),
        ),
      );
      pinY.set(
        r2(
          rubberClamp(
            origin.current.y + offset.y,
            bounds.minY,
            bounds.maxY,
            24,
          ),
        ),
      );
    },
    onEnd: ({ velocity, point: at }) => {
      const to = motionSafe
        ? inBounds({
            x: project(pinX.get(), velocity.x, 0.99),
            y: project(pinY.get(), velocity.y, 0.99),
          })
        : inBounds({ x: pinX.get(), y: pinY.get() });
      landPan.current = panFrom(at.x, null);
      shownPoint.current = to;
      if (motionSafe) {
        run(
          "x",
          animate(pinX, to.x, { ...springs.glide, velocity: velocity.x }),
        );
        run(
          "y",
          animate(pinY, to.y, { ...springs.glide, velocity: velocity.y }),
        );
        settingDown.current = true;
        run("lift", animate(lift, 0, springs.snap));
        run("shade", animate(shade, 1, springs.snap));
      } else {
        pinX.set(to.x);
        pinY.set(to.y);
        audio.play("thock", { gain: 0.34, pitch: 1.2, pan: landPan.current });
      }
      aim.current = to;
      const where = dropPinPlace(to);
      announce(
        `Pin moved to ${where.cell}, ${where.easting.toFixed(1)} east, ${where.northing.toFixed(1)} north.`,
      );
      commit(to);
    },
    onCancel: () => {
      const to = shownPoint.current ?? origin.current;
      if (motionSafe) {
        run("x", animate(pinX, to.x, springs.glide));
        run("y", animate(pinY, to.y, springs.glide));
        run("lift", animate(lift, 0, springs.snap));
        run("shade", animate(shade, 1, springs.snap));
      } else {
        pinX.set(to.x);
        pinY.set(to.y);
      }
    },
  });

  const moveAim = (dx: number, dy: number) => {
    const to = {
      x: r1(clamp(aim.current.x + dx, bounds.minX, bounds.maxX)),
      y: r1(clamp(aim.current.y + dy, bounds.minY, bounds.maxY)),
    };
    aim.current = to;
    if (motionSafe) {
      run("cx", animate(crossX, to.x, springs.flick));
      run("cy", animate(crossY, to.y, springs.flick));
    } else {
      crossX.set(to.x);
      crossY.set(to.y);
    }
    const cell = dropPinPlace(to).cell;
    if (cell !== aimCell.current) {
      aimCell.current = cell;
      announce(`Crosshair ${cell}.`);
    }
  };

  const showAim = () => {
    const from = inBounds(shownPoint.current ?? { x: MID, y: WORLD_H / 2 });
    aim.current = from;
    aimCell.current = dropPinPlace(from).cell;
    crossX.set(from.x);
    crossY.set(from.y);
    setKeyFocus(true);
  };

  /* ---------- per-frame geometry, all rounded before it reaches a style ---------- */

  const pinLeft = useTransform(pinX, (x) => r2(x - MID - PIN_W / 2));
  const pinTop = useTransform(pinY, (y) => r2(y - PIN_H));
  const bodyY = useTransform(
    [drop, hop, lift] as MotionValue<number>[],
    ([d, h, l]) =>
      r2((d as number) - Math.abs(h as number) - 10 * Math.max(0, l as number)),
  );
  const bodyScaleY = useTransform(squash, (s) => r3(1 - s));
  const bodyScaleX = useTransform(squash, (s) => r3(1 + s * 0.7));
  const shadowLeft = useTransform(pinX, (x) => r2(x - MID - 9));
  const shadowTop = useTransform(pinY, (y) => r2(y - 3.5));
  const shadowScale = useTransform(
    [shade, hop, lift] as MotionValue<number>[],
    ([s, h, l]) =>
      r3(
        Math.max(
          0.15,
          (s as number) -
            Math.abs(h as number) / 50 -
            Math.max(0, l as number) * 0.15,
        ),
      ),
  );
  const shadowOpacity = useTransform(
    [shade, shown] as MotionValue<number>[],
    ([s, o]) => r3(clamp01(s as number) * clamp01(o as number)),
  );
  const ghostLeft = useTransform(holdX, (x) => r2(x - MID - 9));
  const ghostTop = useTransform(holdY, (y) => r2(y - 3.5));
  const ghostScale = useTransform(ghost, (g) =>
    motionSafe ? r3(0.1 + g * 0.45) : 0.55,
  );
  const ghostOpacity = useTransform(ghost, (g) => r3(clamp01(g) * 0.6));
  const ringLeft = useTransform(holdX, (x) => r2(x - MID - 20));
  const ringTop = useTransform(holdY, (y) => r2(y - 20));
  const ringScale = useTransform(ghost, (g) =>
    motionSafe ? r3(lerp(1.4, 0.45, clamp01(g))) : 0.6,
  );
  const ringOpacity = useTransform(ghost, (g) =>
    g < 0.02 ? 0 : r3(0.25 + 0.55 * clamp01(g)),
  );
  const tagLeft = useTransform(
    pinX,
    (x) =>
      `clamp(6px, calc(50% + ${r2(x - MID - TAG_W / 2)}px), calc(100% - ${TAG_W + 6}px))`,
  );
  const tagTop = useTransform(
    [pinY, lift] as MotionValue<number>[],
    ([y, l]) => {
      const above =
        (y as number) - PIN_H - 8 - TAG_H - 10 * Math.max(0, l as number);
      return r2(above >= 6 ? above : (y as number) + 10);
    },
  );
  const tagOpacity = useTransform(
    [tag, shown] as MotionValue<number>[],
    ([t, o]) => r3(clamp01(t as number) * clamp01(o as number)),
  );
  const cellText = useTransform(
    [pinX, pinY] as MotionValue<number>[],
    ([x, y]) => dropPinPlace({ x: x as number, y: y as number }).cell,
  );
  const coordText = useTransform(
    [pinX, pinY] as MotionValue<number>[],
    ([x, y]) => {
      const p = dropPinPlace({ x: x as number, y: y as number });
      return `${p.easting.toFixed(1)} E · ${p.northing.toFixed(1)} N`;
    },
  );
  const crossLeft = useTransform(crossX, (x) => r2(x - MID - 14));
  const crossTop = useTransform(crossY, (y) => r2(y - 14));
  const crossCell = useTransform(
    [crossX, crossY] as MotionValue<number>[],
    ([x, y]) => dropPinPlace({ x: x as number, y: y as number }).cell,
  );

  return (
    <div
      ref={setNode}
      role="application"
      aria-roledescription="map"
      aria-label={label}
      aria-describedby={hintId}
      aria-disabled={disabled ? true : undefined}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={(event) => {
        if (disabled) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        setKeyFocus(false);
        const at = toWorld(event.clientX, event.clientY);
        if (!at) return;
        pointer.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        };
        startHold(inBounds(at), panFrom(event.clientX, null));
      }}
      onPointerMove={(event) => {
        const p = pointer.current;
        if (!p || p.id !== event.pointerId) return;
        if (Math.hypot(event.clientX - p.x, event.clientY - p.y) > SLIP) {
          pointer.current = null;
          cancelHold();
        }
      }}
      onPointerUp={(event) => {
        if (pointer.current?.id !== event.pointerId) return;
        pointer.current = null;
        cancelHold();
      }}
      onPointerCancel={() => {
        pointer.current = null;
        cancelHold();
      }}
      onPointerLeave={() => {
        pointer.current = null;
        cancelHold();
      }}
      onContextMenu={(event) => event.preventDefault()}
      onFocus={(event) => {
        if (event.target !== event.currentTarget) return;
        let visible = false;
        try {
          visible = event.currentTarget.matches(":focus-visible");
        } catch {
          visible = false;
        }
        if (visible) showAim();
      }}
      onBlur={() => setKeyFocus(false)}
      onKeyDown={(event) => {
        if (disabled) return;
        const step = event.shiftKey ? 40 : 10;
        const move: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        };
        const d = move[event.key];
        if (d) {
          event.preventDefault();
          if (!keyFocus) showAim();
          else moveAim(d[0], d[1]);
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (event.repeat) return;
          if (!keyFocus) showAim();
          place(aim.current, panAt(aim.current.x), "key");
          return;
        }
        if (event.key === "Delete" || event.key === "Backspace") {
          if (!point) return;
          event.preventDefault();
          remove();
        }
      }}
      className={cn(
        "relative h-[200px] w-full max-w-[1200px] cursor-crosshair touch-pan-y overflow-clip rounded-3 [contain:paint] outline-none select-none [-webkit-touch-callout:none]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <TownMap look={look} view={view} />

      <div aria-hidden className="pointer-events-none absolute inset-0">
        <motion.div
          className="absolute top-0 left-1/2 rounded-full"
          style={{
            x: ghostLeft,
            y: ghostTop,
            width: 18,
            height: 7,
            scale: ghostScale,
            opacity: ghostOpacity,
            background: `radial-gradient(closest-side, ${look.shadow}, transparent)`,
          }}
        />
        <motion.div
          className="absolute top-0 left-1/2 rounded-full border-2"
          style={{
            x: ringLeft,
            y: ringTop,
            width: 40,
            height: 40,
            scale: ringScale,
            opacity: ringOpacity,
            borderColor: tint,
          }}
        />
        <motion.div
          className="absolute top-0 left-1/2 rounded-full"
          style={{
            x: shadowLeft,
            y: shadowTop,
            width: 18,
            height: 7,
            scale: shadowScale,
            opacity: shadowOpacity,
            background: `radial-gradient(closest-side, ${look.shadow}, transparent)`,
          }}
        />
      </div>

      <motion.div
        aria-hidden
        {...drag}
        onPointerDown={(event) => {
          // The pin is its own gesture: pressing it never starts a new drop.
          event.stopPropagation();
          drag.onPointerDown(event);
        }}
        className={cn(
          "absolute top-0 left-1/2 touch-none",
          point && !disabled
            ? "pointer-events-auto cursor-grab active:cursor-grabbing"
            : "pointer-events-none",
        )}
        style={{ x: pinLeft, y: pinTop, width: PIN_W, height: PIN_H }}
      >
        <motion.div
          className="size-full"
          style={{
            y: bodyY,
            scaleX: bodyScaleX,
            scaleY: bodyScaleY,
            originX: 0.5,
            originY: 1,
            opacity: shown,
          }}
        >
          <svg
            width={PIN_W}
            height={PIN_H}
            viewBox={`0 0 ${PIN_W} ${PIN_H}`}
            className="block overflow-visible"
          >
            <path
              d="M12 31.2 C10.8 29.2 3.5 19.8 3.5 11.5 A8.5 8.5 0 0 1 20.5 11.5 C20.5 19.8 13.2 29.2 12 31.2 Z"
              fill={tint}
              stroke={`color-mix(in oklab, ${tint} 70%, black)`}
              strokeWidth={1}
            />
            <circle cx={12} cy={11.5} r={3.4} fill="white" fillOpacity={0.94} />
            <ellipse
              cx={8.6}
              cy={7.6}
              rx={2.2}
              ry={1.3}
              fill="white"
              opacity={0.35}
            />
          </svg>
        </motion.div>
      </motion.div>

      {keyFocus ? (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <motion.div
            className="absolute top-0 left-1/2"
            style={{ x: crossLeft, y: crossTop, width: 28, height: 28 }}
          >
            <svg width={28} height={28} viewBox="0 0 28 28" className="block">
              <g stroke={tint} strokeWidth={1.5} strokeLinecap="round">
                <path d="M14 1 V9 M14 19 V27 M1 14 H9 M19 14 H27" />
                <circle cx={14} cy={14} r={4.5} fill="none" />
              </g>
            </svg>
            <motion.span className="absolute top-[26px] left-[22px] rounded-1 bg-popover px-1 font-mono text-[10px] leading-3.5 text-foreground">
              {crossCell}
            </motion.span>
          </motion.div>
        </div>
      ) : null}

      <motion.div
        aria-hidden
        className="pointer-events-none absolute flex flex-col justify-center rounded-2 border border-hairline-strong bg-popover px-2.5"
        style={{
          left: tagLeft,
          top: tagTop,
          width: TAG_W,
          height: TAG_H,
          opacity: tagOpacity,
        }}
      >
        <motion.span className="font-mono text-xs leading-4 font-semibold text-foreground">
          {cellText}
        </motion.span>
        <motion.span className="font-mono text-[10px] leading-3.5 text-ink-2 tabular-nums">
          {coordText}
        </motion.span>
      </motion.div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-3 border border-hairline-strong"
      />

      <p id={hintId} className="sr-only">
        Hold anywhere to drop a pin, or use the arrow keys to move the
        crosshair, Shift to move it further, Enter to drop the pin and Delete to
        remove it.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
