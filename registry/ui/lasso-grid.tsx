"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { useDrag, type DragInfo } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type LassoGridKind =
  "folder" | "image" | "doc" | "sheet" | "audio" | "video";

export type LassoGridItem = {
  id: string;
  /** The file's name: its label, and its accessible name. */
  name: string;
  /** Picks the glyph drawn over the name. @default "doc" */
  kind?: LassoGridKind;
};

export type LassoGridMode = "box" | "lasso";
export type LassoGridHit = "touch" | "contain";

export type LassoGridProps = {
  items: LassoGridItem[];
  /** The grid's accessible name. */
  label: string;
  /** Controlled selection: the selected ids. */
  value?: string[];
  /** Initial selection when uncontrolled. @default [] */
  defaultValue?: string[];
  /** Fires once per band (on release), tap or key, with the new selection in item order. */
  onValueChange?: (value: string[]) => void;
  /** The band's shape; Alt at the start of a drag draws the other one. @default "box" */
  mode?: LassoGridMode;
  /** Whether touching a tile catches it, or the band must enclose it. @default "touch" */
  hit?: LassoGridHit;
  /** A count badge that rides the selection's top-right corner. @default true */
  badge?: boolean;
  /** Ticks as tiles are caught and a tock on release. Off unless asked for. @default false */
  sound?: boolean;
  /** Blocks selection; arrow keys still move focus. */
  disabled?: boolean;
  className?: string;
};

type Pt = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };
type Op = "replace" | "add" | "toggle";
type Side = 0 | 1 | 2 | 3;

type Layout = {
  rects: Record<string, Rect>;
  cols: number;
  width: number;
  height: number;
};

type Band = {
  shape: LassoGridMode;
  op: Op;
  /** The selection the band is applied to: empty for a plain band. */
  base: string[];
  start: Pt;
  points: Pt[];
  caught: string[];
  /** Tiles caught so far in this sweep: the step of the rising tick. */
  count: number;
};

type Sweep = { base: string[]; anchor: string; caught: string[] };

/** A pentatonic climb, an octave at most: each tile caught is one step up. */
const STEPS = [0, 2, 4, 7, 9, 12];
/** How far outside the tiles it holds a released band comes to rest. */
const HUG = 3;
/** How far outside the tiles a keyboard band sits while it is still growing. */
const REACH = 5;
/** A lasso records a point every this many px. */
const SAMPLE = 3;

const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const at = <T,>(list: readonly T[], i: number): T =>
  list[((i % list.length) + list.length) % list.length] as T;

const union = (rects: Rect[]): Rect | null => {
  if (rects.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

const inflate = (r: Rect, d: number): Rect => ({
  x: r.x - d,
  y: r.y - d,
  w: r.w + 2 * d,
  h: r.h + 2 * d,
});

const boxOf = (a: Pt, b: Pt): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(a.x - b.x),
  h: Math.abs(a.y - b.y),
});

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const encloses = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

const cornersOf = (r: Rect): Pt[] => [
  { x: r.x, y: r.y },
  { x: r.x + r.w, y: r.y },
  { x: r.x + r.w, y: r.y + r.h },
  { x: r.x, y: r.y + r.h },
];

/** Even-odd ray cast: is the point inside the closed loop? */
function insideLoop(p: Pt, loop: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i, i += 1) {
    const a = at(loop, i);
    const b = at(loop, j);
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

const turn = (o: Pt, a: Pt, b: Pt) =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

const crosses = (a: Pt, b: Pt, c: Pt, d: Pt) =>
  turn(c, d, a) * turn(c, d, b) < 0 && turn(a, b, c) * turn(a, b, d) < 0;

/** Does any edge of the closed loop cross any edge of the rectangle? */
function loopCrossesRect(loop: Pt[], r: Rect): boolean {
  const c = cornersOf(r);
  for (let i = 0; i < loop.length; i += 1) {
    const a = at(loop, i);
    const b = at(loop, i + 1);
    for (let k = 0; k < 4; k += 1) {
      if (crosses(a, b, at(c, k), at(c, k + 1))) return true;
    }
  }
  return false;
}

const loopTouches = (loop: Pt[], r: Rect) =>
  loop.length >= 3 &&
  (cornersOf(r).some((p) => insideLoop(p, loop)) ||
    loop.some(
      (p) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h,
    ) ||
    loopCrossesRect(loop, r));

const loopEncloses = (loop: Pt[], r: Rect) =>
  loop.length >= 3 &&
  cornersOf(r).every((p) => insideLoop(p, loop)) &&
  !loopCrossesRect(loop, r);

/** The nearest point on the rectangle's outline, and which side it is on. */
function toOutline(p: Pt, r: Rect): { pt: Pt; side: Side } {
  const x1 = r.x + r.w;
  const y1 = r.y + r.h;
  const outside = p.x <= r.x || p.x >= x1 || p.y <= r.y || p.y >= y1;
  if (outside) {
    const pt = { x: clamp(p.x, r.x, x1), y: clamp(p.y, r.y, y1) };
    const side: Side = pt.y === r.y ? 0 : pt.x === x1 ? 1 : pt.y === y1 ? 2 : 3;
    return { pt, side };
  }
  const gaps = [p.y - r.y, x1 - p.x, y1 - p.y, p.x - r.x];
  let side: Side = 0;
  for (let k = 1; k < 4; k += 1) {
    if (at(gaps, k) < at(gaps, side)) side = k as Side;
  }
  const pt =
    side === 0
      ? { x: p.x, y: r.y }
      : side === 1
        ? { x: x1, y: p.y }
        : side === 2
          ? { x: p.x, y: y1 }
          : { x: r.x, y: p.y };
  return { pt, side };
}

/** The corner two neighbouring sides share. */
const cornerOf = (r: Rect, a: Side, b: Side): Pt => {
  const pair = a < b ? `${a}${b}` : `${b}${a}`;
  if (pair === "01") return { x: r.x + r.w, y: r.y };
  if (pair === "12") return { x: r.x + r.w, y: r.y + r.h };
  if (pair === "23") return { x: r.x, y: r.y + r.h };
  return { x: r.x, y: r.y };
};

/**
 * Where every point of a lasso goes when the band snaps tight: onto the
 * nearest point of the rectangle it caught. Where two neighbours land on
 * different sides, the corner between them is added (fed from their
 * midpoint), so the loop wraps the corner instead of cutting across it.
 */
function tightenPairs(points: Pt[], r: Rect): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  const mapped = points.map((p) => toOutline(p, r));
  for (let i = 0; i < points.length; i += 1) {
    const p = at(points, i);
    const q = at(points, i + 1);
    const m = at(mapped, i);
    const n = at(mapped, i + 1);
    out.push([p, m.pt]);
    if (m.side === n.side) continue;
    const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    if ((m.side + 2) % 4 === n.side) {
      const via = ((m.side + 1) % 4) as Side;
      out.push([mid, cornerOf(r, m.side, via)]);
      out.push([mid, cornerOf(r, via, n.side)]);
    } else {
      out.push([mid, cornerOf(r, m.side, n.side)]);
    }
  }
  return out;
}

const pathOf = (points: Pt[]) =>
  points.length === 0
    ? ""
    : `M ${points.map((p) => `${r1(p.x)} ${r1(p.y)}`).join(" L ")} Z`;

const combine = (base: string[], caught: string[], op: Op): string[] => {
  if (op === "replace") return caught;
  if (op === "add") return [...new Set([...base, ...caught])];
  const out = new Set(base);
  for (const id of caught) {
    if (base.includes(id)) out.delete(id);
    else out.add(id);
  }
  return [...out];
};

const keyOf = (ids: string[]) => ids.join("\u0000");

const TONE: Record<Exclude<LassoGridKind, "folder">, string> = {
  image: "text-cobalt-bright",
  doc: "text-ink-2",
  sheet: "text-success",
  audio: "text-signal",
  video: "text-danger",
};

/** A file-type glyph: a folder, or a page with its kind's mark on it. */
function Glyph({ kind }: { kind: LassoGridKind }) {
  if (kind === "folder") {
    return (
      <svg aria-hidden viewBox="0 0 28 24" className="h-6 w-7 text-warn">
        <path
          d="M2.5 5.5a2 2 0 0 1 2-2h5.5l2 2.5h11.5a2 2 0 0 1 2 2v11.5a2 2 0 0 1-2 2h-19a2 2 0 0 1-2-2z"
          fill="currentColor"
          fillOpacity={0.24}
          stroke="currentColor"
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
        <path
          d="M2.5 9.5h23"
          stroke="currentColor"
          strokeOpacity={0.55}
          strokeWidth={1.2}
        />
      </svg>
    );
  }
  return (
    <svg
      aria-hidden
      viewBox="0 0 22 28"
      className={cn("h-7 w-5.5", TONE[kind])}
    >
      <path
        d="M4 1.5h9.5l6 6v17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-21a2 2 0 0 1 2-2z"
        className="fill-surface-2 stroke-ink-3"
        strokeOpacity={0.55}
        strokeLinejoin="round"
      />
      <path
        d="M13.5 1.5v6h6"
        fill="none"
        className="stroke-ink-3"
        strokeOpacity={0.55}
        strokeLinejoin="round"
      />
      {kind === "image" ? (
        <>
          <circle cx={8} cy={13} r={1.8} fill="currentColor" />
          <path d="M4.5 22.5l4.5-5 3 3 2.5-2.5 3.5 4.5z" fill="currentColor" />
        </>
      ) : kind === "sheet" ? (
        <path
          d="M5 12h12M5 16h12M5 20h12M10 12v10"
          stroke="currentColor"
          strokeWidth={1.3}
          strokeLinecap="round"
        />
      ) : kind === "audio" ? (
        <path
          d="M5.5 17v2M8 15v6M10.5 12.5v11M13 15.5v5M15.5 14v8"
          stroke="currentColor"
          strokeWidth={1.4}
          strokeLinecap="round"
        />
      ) : kind === "video" ? (
        <path d="M8.5 13.5v8.5l6.5-4.25z" fill="currentColor" />
      ) : (
        <path
          d="M5.5 12h10M5.5 15.5h11M5.5 19h8M5.5 22.5h9.5"
          stroke="currentColor"
          strokeWidth={1.3}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/**
 * A file grid with rubber-band selection. Drag anywhere in it and a band
 * follows the pointer — a box, or with `mode="lasso"` (or Alt held as the
 * drag starts) a freehand loop — and every tile it catches lights at once,
 * squeezed a little while the band holds it. With `hit="touch"` touching a
 * tile catches it; with `"contain"` the band has to enclose it. A plain band
 * replaces the selection, Shift adds to it and Cmd or Ctrl toggles against
 * it. Let go and the band does what a rubber band does: it snaps tight onto
 * what it caught, on one crisp overshoot, and fades. A count badge rides the
 * selection's top-right corner, gliding after it as it changes.
 *
 * It is a multi-select `role="listbox"`. Arrow keys move in two dimensions
 * and select the tile they land on; Shift+Arrow draws the same band from the
 * keyboard, growing a box from the anchor tile, and letting go of Shift
 * snaps it tight with the same tock. Space toggles one tile, Cmd/Ctrl+A
 * selects everything and Escape clears. Under reduced motion the band still
 * draws under the pointer, but it fades instead of tightening, nothing
 * squeezes, and the badge jumps rather than glides; every tile still lights.
 */
export function LassoGrid({
  items,
  label,
  value,
  defaultValue,
  onValueChange,
  mode = "box",
  hit = "touch",
  badge = true,
  sound = false,
  disabled = false,
  className,
}: LassoGridProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = React.useId();

  const [own, setOwn] = React.useState<string[]>(() => defaultValue ?? []);
  const raw = value ?? own;
  const selected = React.useMemo(
    () => items.filter((it) => raw.includes(it.id)).map((it) => it.id),
    [items, raw],
  );
  const selectedKey = keyOf(selected);

  // While a band is out, the tiles show what letting go would select.
  const [draft, setDraft] = React.useState<string[] | null>(null);
  const [caught, setCaught] = React.useState<string[]>([]);
  const shown = draft ?? selected;
  const shownKey = keyOf(shown);

  const [focusId, setFocusId] = React.useState<string | null>(null);
  const stop =
    items.find((it) => it.id === focusId)?.id ?? shown[0] ?? items[0]?.id;

  // The live region: frozen when a change is made, spoken only while the
  // selection on screen is the one it describes.
  const [said, setSaid] = React.useState<{ key: string; text: string } | null>(
    null,
  );
  const spoken = said && said.key === selectedKey ? said.text : "";

  const [list, setList] = React.useState<HTMLDivElement | null>(null);
  const tiles = React.useRef(new Map<string, HTMLDivElement>());
  const layout = React.useRef<Layout | null>(null);
  const layoutKey = React.useRef("");
  const [layoutVersion, setLayoutVersion] = React.useState(0);
  const itemsRef = React.useRef(items);
  React.useEffect(() => {
    itemsRef.current = items;
  });

  const band = React.useRef<Band | null>(null);
  const sweep = React.useRef<Sweep | null>(null);
  const anchor = React.useRef<string | null>(null);
  const [shape, setShape] = React.useState<LassoGridMode>("box");
  const bandRuns = React.useRef<AnimationPlaybackControls[]>([]);
  const badgeRuns = React.useRef<AnimationPlaybackControls[]>([]);
  const badgeRef = React.useRef<HTMLDivElement | null>(null);
  const badgeLive = React.useRef(false);

  const bandX = useMotionValue(0);
  const bandY = useMotionValue(0);
  const bandW = useMotionValue(0);
  const bandH = useMotionValue(0);
  const bandOpacity = useMotionValue(0);
  const loopPath = useMotionValue("");
  const badgeX = useMotionValue(0);
  const badgeY = useMotionValue(0);
  const badgeOpacity = useMotionValue(0);
  const badgeScale = useMotionValue(1);

  // A spring's overshoot can take a width past zero; the attribute cannot.
  const rectX = useTransform(bandX, (v) => r1(v));
  const rectY = useTransform(bandY, (v) => r1(v));
  const rectW = useTransform(bandW, (v) => Math.max(0, r1(v)));
  const rectH = useTransform(bandH, (v) => Math.max(0, r1(v)));

  const itemsKey = keyOf(items.map((it) => it.id));

  /** Tile boxes from layout, so a squeezed tile never moves its hit box. */
  const measure = React.useCallback(() => {
    if (!list) return;
    const rects: Record<string, Rect> = {};
    let firstRow: number | null = null;
    let cols = 0;
    for (const it of itemsRef.current) {
      const el = tiles.current.get(it.id);
      if (!el) continue;
      rects[it.id] = {
        x: el.offsetLeft,
        y: el.offsetTop,
        w: el.offsetWidth,
        h: el.offsetHeight,
      };
      if (firstRow === null) firstRow = el.offsetTop;
      if (el.offsetTop === firstRow) cols += 1;
    }
    const next: Layout = {
      rects,
      cols: Math.max(1, cols),
      width: list.offsetWidth,
      height: list.offsetHeight,
    };
    const key = JSON.stringify(next);
    if (key === layoutKey.current) return;
    layoutKey.current = key;
    layout.current = next;
    setLayoutVersion((v) => v + 1);
  }, [list]);

  // The observer reports once on observe, then on every resize; a change of
  // items that keeps the size is caught by the frame after it renders.
  React.useEffect(() => {
    if (!list || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(list);
    const frame = window.requestAnimationFrame(() => measure());
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [list, measure, itemsKey]);

  const stopBand = () => {
    for (const c of bandRuns.current) c.stop();
    bandRuns.current = [];
  };

  React.useEffect(
    () => () => {
      for (const c of bandRuns.current) c.stop();
      for (const c of badgeRuns.current) c.stop();
    },
    [],
  );

  /** Pointer position in the grid's own px, whatever scale it is drawn at. */
  const local = (clientX: number, clientY: number): Pt => {
    if (!list) return { x: 0, y: 0 };
    const r = list.getBoundingClientRect();
    const sx = list.offsetWidth > 0 ? r.width / list.offsetWidth : 1;
    const sy = list.offsetHeight > 0 ? r.height / list.offsetHeight : 1;
    return {
      x: clamp((clientX - r.left) / (sx || 1), 0.5, list.offsetWidth - 0.5),
      y: clamp((clientY - r.top) / (sy || 1), 0.5, list.offsetHeight - 0.5),
    };
  };

  const panAt = (x: number) => {
    if (!list) return 0;
    const r = list.getBoundingClientRect();
    const sx = list.offsetWidth > 0 ? r.width / list.offsetWidth : 1;
    return panFrom(r.left + x * sx, list);
  };

  const centreX = (ids: string[]) => {
    const u = union(ids.flatMap((id) => layout.current?.rects[id] ?? []));
    return u ? u.x + u.w / 2 : (layout.current?.width ?? 0) / 2;
  };

  const tick = (id: string, step: number, soft = false) => {
    const r = layout.current?.rects[id];
    const pan = r ? panAt(r.x + r.w / 2) : 0;
    audio.play(
      "tick",
      soft
        ? { pitch: 0.62, gain: 0.16, pan }
        : {
            pitch: r3(
              0.8 * semitones(at(STEPS, Math.min(step, STEPS.length - 1))),
            ),
            gain: 0.32,
            pan,
          },
    );
  };

  const tock = (count: number, x: number) =>
    audio.play("thock", {
      pitch: r3(0.92 + Math.min(count, 10) * 0.03),
      gain: count > 0 ? 0.55 : 0.3,
      pan: panAt(x),
    });

  const say = (next: string[]) =>
    setSaid({
      key: keyOf(next),
      text:
        next.length === 0
          ? "None selected"
          : `${next.length} of ${items.length} selected`,
    });

  const commit = (next: string[], announce: boolean) => {
    const ordered = items
      .filter((it) => next.includes(it.id))
      .map((it) => it.id);
    if (announce) say(ordered);
    if (keyOf(ordered) === selectedKey) return;
    if (value === undefined) setOwn(ordered);
    onValueChange?.(ordered);
  };

  // Jumps, not sets: a placement is not a movement, and a spring started
  // after it must not inherit a velocity from the leap.
  const place = (r: Rect) => {
    bandX.jump(r1(r.x));
    bandY.jump(r1(r.y));
    bandW.jump(r1(r.w));
    bandH.jump(r1(r.h));
  };

  const fadeBand = () => {
    stopBand();
    bandRuns.current = [animate(bandOpacity, 0, exitFor(durations.fast))];
  };

  /**
   * The release: the band contracts onto what it caught on the snap spring
   * — one crisp overshoot, like a rubber band let go around a bundle — and
   * fades as it lands. A lasso's every point runs to the nearest point of
   * the same rectangle, so the loop visibly tightens into a box.
   */
  const tighten = (from: LassoGridMode, points: Pt[], ids: string[]) => {
    const u = union(ids.flatMap((id) => layout.current?.rects[id] ?? []));
    if (!u || !motionSafe) {
      fadeBand();
      return;
    }
    stopBand();
    const target = inflate(u, HUG);
    const fade = animate(bandOpacity, 0, {
      duration: durations.base,
      ease: easings.exit,
      delay: 0.18,
    });
    if (from === "box") {
      // The contraction starts from rest: the band is let go, not thrown,
      // and a flicked corner carrying its speed would overshoot the tiles.
      const snap = { ...springs.snap, velocity: 0 };
      bandRuns.current = [
        animate(bandX, r1(target.x), snap),
        animate(bandY, r1(target.y), snap),
        animate(bandW, r1(target.w), snap),
        animate(bandH, r1(target.h), snap),
        fade,
      ];
      return;
    }
    const pairs = tightenPairs(points, target);
    bandRuns.current = [
      animate(0, 1, {
        ...springs.snap,
        onUpdate: (t) =>
          loopPath.set(
            pathOf(
              pairs.map(([a, b]) => ({
                x: a.x + (b.x - a.x) * t,
                y: a.y + (b.y - a.y) * t,
              })),
            ),
          ),
      }),
      fade,
    ];
  };

  const rectsOf = (ids: string[]) =>
    ids.flatMap((id) => layout.current?.rects[id] ?? []);

  /** The tiles in the block from one tile to another, by row and column. */
  const blockOf = (fromId: string, toId: string): string[] => {
    const cols = layout.current?.cols ?? items.length;
    const a = items.findIndex((it) => it.id === fromId);
    const b = items.findIndex((it) => it.id === toId);
    if (a < 0 || b < 0) return [];
    const rowA = Math.floor(a / cols);
    const rowB = Math.floor(b / cols);
    const colA = a % cols;
    const colB = b % cols;
    return items
      .filter((_, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        return (
          r >= Math.min(rowA, rowB) &&
          r <= Math.max(rowA, rowB) &&
          c >= Math.min(colA, colB) &&
          c <= Math.max(colA, colB)
        );
      })
      .map((it) => it.id);
  };

  /** What the pointer band holds right now. */
  const catchAt = (b: Band, p: Pt): string[] => {
    const l = layout.current;
    if (!l) return [];
    const out: string[] = [];
    if (b.shape === "box") {
      const box = boxOf(b.start, p);
      for (const it of items) {
        const r = l.rects[it.id];
        if (!r) continue;
        if (hit === "contain" ? encloses(box, r) : overlaps(box, r)) {
          out.push(it.id);
        }
      }
      return out;
    }
    const loop = [...b.points, p];
    for (const it of items) {
      const r = l.rects[it.id];
      if (!r) continue;
      if (hit === "contain" ? loopEncloses(loop, r) : loopTouches(loop, r)) {
        out.push(it.id);
      }
    }
    return out;
  };

  const beginBand = (info: DragInfo) => {
    if (disabled) return;
    finishSweep(false);
    measure();
    const ev = info.event;
    const touch = ev.pointerType === "touch";
    const shapeNow: LassoGridMode = ev.altKey
      ? mode === "box"
        ? "lasso"
        : "box"
      : mode;
    const op: Op =
      touch || ev.shiftKey
        ? "add"
        : ev.metaKey || ev.ctrlKey
          ? "toggle"
          : "replace";
    const start = local(
      info.point.x - info.offset.x,
      info.point.y - info.offset.y,
    );
    stopBand();
    band.current = {
      shape: shapeNow,
      op,
      base: op === "replace" ? [] : selected,
      start,
      points: [start],
      caught: [],
      count: 0,
    };
    setShape(shapeNow);
    place({ x: start.x, y: start.y, w: 0, h: 0 });
    loopPath.set("");
    bandOpacity.set(1);
    setDraft(op === "replace" ? [] : selected);
    setCaught([]);
  };

  const moveBand = (info: DragInfo) => {
    const b = band.current;
    if (!b) return;
    const p = local(info.point.x, info.point.y);
    if (b.shape === "lasso") {
      const last = b.points[b.points.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= SAMPLE) {
        b.points.push(p);
      }
      loopPath.set(pathOf([...b.points, p]));
    } else {
      place(boxOf(b.start, p));
    }
    const now = catchAt(b, p);
    const fresh = now.filter((id) => !b.caught.includes(id));
    const gone = b.caught.filter((id) => !now.includes(id));
    if (fresh.length === 0 && gone.length === 0) return;
    for (const id of fresh) {
      tick(id, b.count);
      b.count += 1;
    }
    const left = gone[0];
    if (fresh.length === 0 && left) tick(left, 0, true);
    b.caught = now;
    setCaught(now);
    setDraft(combine(b.base, now, b.op));
  };

  const endBand = (cancelled: boolean) => {
    const b = band.current;
    if (!b) return;
    band.current = null;
    setCaught([]);
    setDraft(null);
    if (cancelled) {
      fadeBand();
      return;
    }
    commit(combine(b.base, b.caught, b.op), true);
    tock(b.caught.length, b.caught.length ? centreX(b.caught) : b.start.x);
    tighten(b.shape, b.points, b.caught);
  };

  const drawKeyBand = (ids: string[], growing: boolean) => {
    const u = union(rectsOf(ids));
    if (!u) return;
    const r = inflate(u, REACH);
    setShape("box");
    stopBand();
    const fresh = bandOpacity.get() < 0.5;
    if (fresh || !motionSafe || !growing) place(r);
    else {
      bandRuns.current = [
        animate(bandX, r1(r.x), springs.glide),
        animate(bandY, r1(r.y), springs.glide),
        animate(bandW, r1(r.w), springs.glide),
        animate(bandH, r1(r.h), springs.glide),
      ];
    }
    // A one-shot block (Shift+click) tightens straight away, so it has to be
    // on screen already; a growing one fades in as it starts.
    if (!growing) bandOpacity.set(1);
    else {
      bandRuns.current.push(
        animate(bandOpacity, 1, {
          duration: durations.blink,
          ease: easings.enter,
        }),
      );
    }
  };

  /** Shift let go: the keyboard band snaps tight with the same tock. */
  function finishSweep(audible: boolean) {
    const s = sweep.current;
    if (!s) return;
    sweep.current = null;
    if (!audible) {
      fadeBand();
      return;
    }
    say(combine(s.base, s.caught, "add"));
    tock(s.caught.length, centreX(s.caught));
    tighten("box", [], s.caught);
  }

  /** Shift+Arrow and Shift+click: a block from the anchor, added. */
  const growTo = (toId: string, keyboard: boolean) => {
    const s: Sweep =
      keyboard && sweep.current
        ? sweep.current
        : { base: selected, anchor: anchor.current ?? toId, caught: [] };
    if (keyboard) sweep.current = s;
    const block = blockOf(s.anchor, toId);
    const fresh = block.filter((id) => !s.caught.includes(id));
    fresh.forEach((id, i) => tick(id, s.caught.length + i));
    s.caught = block;
    commit(combine(s.base, block, "add"), !keyboard);
    drawKeyBand(block, keyboard);
    if (!keyboard) {
      tock(block.length, centreX(block));
      tighten("box", [], block);
    }
  };

  const toggle = (id: string) => {
    const on = selected.includes(id);
    tick(id, 0, on);
    commit(on ? selected.filter((s) => s !== id) : [...selected, id], true);
  };

  const onTap = (event: React.PointerEvent) => {
    if (disabled) return;
    finishSweep(false);
    const el =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-lasso-item]")
        : null;
    const id = el?.dataset.lassoItem;
    const touch = event.pointerType === "touch";
    if (!id) {
      if (touch || !(event.shiftKey || event.metaKey || event.ctrlKey)) {
        if (selected.length > 0) {
          tick(selected[0] ?? "", 0, true);
          commit([], true);
        }
      }
      return;
    }
    if (touch || event.metaKey || event.ctrlKey) {
      toggle(id);
    } else if (event.shiftKey && anchor.current) {
      growTo(id, false);
      return;
    } else {
      tick(id, 0);
      commit([id], true);
    }
    anchor.current = id;
  };

  const drag = useDrag({
    disabled,
    onStart: beginBand,
    onMove: moveBand,
    onEnd: () => endBand(false),
    onCancel: () => endBand(true),
    onTap,
  });

  // A band in flight is cancelled by Escape wherever focus is, and the key
  // is claimed so the page does not also act on it.
  const cancelRef = React.useRef(() => {});
  React.useEffect(() => {
    cancelRef.current = () => endBand(true);
  });
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !band.current) return;
      event.preventDefault();
      cancelRef.current();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  const focusTile = (id: string) => {
    setFocusId(id);
    tiles.current.get(id)?.focus();
  };

  const neighbour = (i: number, key: string): number => {
    const n = items.length;
    const cols = layout.current?.cols ?? n;
    switch (key) {
      case "ArrowLeft":
        return Math.max(0, i - 1);
      case "ArrowRight":
        return Math.min(n - 1, i + 1);
      case "ArrowUp":
        return i - cols >= 0 ? i - cols : i;
      case "ArrowDown": {
        if (i + cols < n) return i + cols;
        // The last row can be short: step down onto its last tile.
        return Math.floor((n - 1) / cols) > Math.floor(i / cols) ? n - 1 : i;
      }
      case "Home":
        return 0;
      case "End":
        return n - 1;
      default:
        return i;
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.defaultPrevented || band.current) return;
    const el =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-lasso-item]")
        : null;
    const id = el?.dataset.lassoItem;
    const i = items.findIndex((it) => it.id === id);
    if (!id || i < 0) return;
    const mod = event.metaKey || event.ctrlKey;
    const { key } = event;

    if (
      [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ].includes(key)
    ) {
      event.preventDefault();
      const next = items[neighbour(i, key)];
      if (!next) return;
      focusTile(next.id);
      if (disabled || (mod && !event.shiftKey)) return;
      if (event.shiftKey) {
        if (!anchor.current) anchor.current = id;
        growTo(next.id, true);
        return;
      }
      finishSweep(false);
      anchor.current = next.id;
      if (keyOf([next.id]) !== selectedKey) tick(next.id, 0);
      commit([next.id], false);
      return;
    }
    if (key === " " || key === "Spacebar") {
      event.preventDefault();
      if (disabled) return;
      if (event.shiftKey && anchor.current) {
        growTo(id, false);
        return;
      }
      toggle(id);
      anchor.current = id;
      return;
    }
    if (mod && key.toLowerCase() === "a") {
      event.preventDefault();
      if (disabled) return;
      finishSweep(false);
      const all = items.map((it) => it.id);
      commit(all, true);
      tock(all.length, centreX(all));
      return;
    }
    if (key === "Escape") {
      if (sweep.current) {
        event.preventDefault();
        finishSweep(false);
      }
      if (disabled || selected.length === 0) return;
      event.preventDefault();
      tick(id, 0, true);
      commit([], true);
    }
  };

  // The badge rides the corner of whatever is selected — the draft
  // included, so it follows a band's catch while it is still being drawn.
  const count = shown.length;
  const [held, setHeld] = React.useState({ n: count, dir: 1 });
  if (count > 0 && held.n !== count) {
    setHeld({ n: count, dir: count > held.n ? 1 : -1 });
  }

  React.useEffect(() => {
    const l = layout.current;
    const quit = () => {
      for (const c of badgeRuns.current) c.stop();
      badgeRuns.current = [];
    };
    if (!badge || !l) {
      quit();
      badgeLive.current = false;
      badgeOpacity.set(0);
      return;
    }
    const ids = shownKey === "" ? [] : shownKey.split("\u0000");
    const u = union(ids.flatMap((id) => l.rects[id] ?? []));
    if (!u) {
      if (badgeLive.current) {
        quit();
        badgeRuns.current = [animate(badgeOpacity, 0, exitFor(durations.fast))];
      }
      badgeLive.current = false;
      return;
    }
    const w = badgeRef.current?.offsetWidth ?? 20;
    const h = badgeRef.current?.offsetHeight ?? 20;
    const x = r1(clamp(u.x + u.w - w / 2, 2, l.width - w - 2));
    const y = r1(clamp(u.y - h / 2, 2, l.height - h - 2));
    const arriving = !badgeLive.current;
    badgeLive.current = true;
    quit();
    if (arriving || !motionSafe) {
      badgeX.set(x);
      badgeY.set(y);
    } else {
      badgeRuns.current.push(
        animate(badgeX, x, springs.glide),
        animate(badgeY, y, springs.glide),
      );
    }
    if (badgeOpacity.get() < 1) {
      badgeRuns.current.push(
        animate(badgeOpacity, 1, {
          duration: durations.fast,
          ease: easings.enter,
        }),
      );
    }
    if (!motionSafe) {
      badgeScale.set(1);
    } else {
      if (arriving) badgeScale.set(0.8);
      // A re-run that stopped the pop part-way finishes it rather than
      // leaving the badge small.
      if (badgeScale.get() !== 1) {
        badgeRuns.current.push(animate(badgeScale, 1, springs.snap));
      }
    }
  }, [
    badge,
    badgeOpacity,
    badgeScale,
    badgeX,
    badgeY,
    held.n,
    layoutVersion,
    motionSafe,
    shownKey,
  ]);

  const rise = motionSafe ? distances.nudge : 0;

  return (
    <div className={cn("relative w-full", className)}>
      <div className="relative overflow-clip rounded-3 border border-hairline bg-card [contain:paint]">
        <div
          ref={setList}
          role="listbox"
          aria-multiselectable="true"
          aria-label={label}
          aria-describedby={hintId}
          aria-disabled={disabled || undefined}
          {...drag}
          onKeyDown={onKeyDown}
          onKeyUp={(event) => {
            if (event.key === "Shift") finishSweep(true);
          }}
          onBlur={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Node && list?.contains(next)) return;
            finishSweep(false);
          }}
          className={cn(
            "relative grid touch-none grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1.5 p-2.5 select-none",
            draft !== null && "cursor-crosshair",
            disabled && "opacity-60",
          )}
        >
          {items.map((it) => {
            const on = shown.includes(it.id);
            const held_ = caught.includes(it.id);
            return (
              <motion.div
                key={it.id}
                ref={(node: HTMLDivElement | null) => {
                  if (node) tiles.current.set(it.id, node);
                  else tiles.current.delete(it.id);
                }}
                role="option"
                aria-selected={on}
                tabIndex={it.id === stop ? 0 : -1}
                data-lasso-item={it.id}
                onFocus={() => setFocusId(it.id)}
                animate={{ scale: held_ && motionSafe ? 0.94 : 1 }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
                className={cn(
                  "flex min-w-0 flex-col items-center gap-0.5 rounded-2 px-0.5 py-1 transition-colors duration-150 outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                  on
                    ? "bg-cobalt-wash"
                    : !disabled && "hover:bg-surface-2 active:bg-surface-2",
                )}
              >
                <span className="flex h-7 items-center justify-center">
                  <Glyph kind={it.kind ?? "doc"} />
                </span>
                <span
                  title={it.name}
                  className={cn(
                    "max-w-full truncate rounded-1 px-[3px] text-center text-[11px] leading-4 transition-colors duration-150",
                    on ? "bg-primary text-primary-foreground" : "text-ink-2",
                  )}
                >
                  {it.name}
                </span>
              </motion.div>
            );
          })}
        </div>

        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full"
        >
          {shape === "lasso" ? (
            <motion.path
              d={loopPath}
              className="fill-cobalt-wash stroke-cobalt-bright"
              strokeWidth={1.25}
              strokeLinejoin="round"
              style={{ opacity: bandOpacity }}
            />
          ) : (
            <motion.rect
              x={rectX}
              y={rectY}
              width={rectW}
              height={rectH}
              rx={4}
              className="fill-cobalt-wash stroke-cobalt-bright"
              strokeWidth={1.25}
              style={{ opacity: bandOpacity }}
            />
          )}
        </svg>

        {badge ? (
          <motion.div
            ref={badgeRef}
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 z-10"
            style={{
              x: badgeX,
              y: badgeY,
              opacity: badgeOpacity,
              scale: badgeScale,
            }}
          >
            <span className="grid h-5 min-w-5 place-items-center overflow-clip rounded-full bg-primary px-1.5 font-mono text-[10px] leading-none text-primary-foreground tabular-nums ring-2 ring-card">
              <AnimatePresence initial={false} custom={held.dir}>
                <motion.span
                  key={held.n}
                  custom={held.dir}
                  className="[grid-area:1/1]"
                  variants={{
                    from: (dir: number) => ({ y: dir * rise, opacity: 0 }),
                    still: { y: 0, opacity: 1 },
                    gone: (dir: number) => ({
                      y: -dir * rise,
                      opacity: 0,
                      transition: exitFor(durations.fast),
                    }),
                  }}
                  initial="from"
                  animate="still"
                  exit="gone"
                  transition={{ duration: durations.fast, ease: easings.enter }}
                >
                  {held.n}
                </motion.span>
              </AnimatePresence>
            </span>
          </motion.div>
        ) : null}
      </div>

      <span id={hintId} className="sr-only">
        Arrow keys move and select. Shift with an arrow key draws a box from the
        last tile. Space adds or removes a tile, Control or Command A selects
        all, Escape clears.
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {spoken}
      </span>
    </div>
  );
}
