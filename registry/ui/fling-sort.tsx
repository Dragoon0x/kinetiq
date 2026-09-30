"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type FlingSortItem = {
  id: string;
  /** A word or two: it has to fit on a small chip. */
  label: string;
  /** A short second line, such as an amount. */
  detail?: string;
};

export type FlingSortCategory = { id: string; label: string };

/** What one landing changed: the item, and the bin it went to (null: the inbox). */
export type FlingSortChange = { item: string; bin: string | null };

export type FlingSortProps = {
  /** Everything to sort. Items not filed under a shown bin sit in the inbox. */
  items: FlingSortItem[];
  /** The bins, in order. The first `bins` of them stand on the floor. */
  categories: FlingSortCategory[];
  /** How many of `categories` are open, 2 to 4. @default 3 */
  bins?: number;
  /** Controlled filing: item id → category id. */
  value?: Record<string, string>;
  /** Initial filing when uncontrolled. @default {} */
  defaultValue?: Record<string, string>;
  /** Fires on the frame a throw is decided, with the whole filing and the change. */
  onValueChange?: (
    value: Record<string, string>,
    change: FlingSortChange,
  ) => void;
  /** The tray's accessible name. */
  label: string;
  /** Downward pull in px/s², 800 to 3200. @default 2000 */
  gravity?: number;
  /** Restitution off the floor, rims and walls, 0 to 0.8. @default 0.4 */
  bounce?: number;
  /** Air drag per second, 0 to 3. @default 0.8 */
  drag?: number;
  /** Tray height in px. @default 200 */
  height?: number;
  /** Play the throw's sounds. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type XY = { x: number; y: number };

type Box = { key: string; left: number; right: number; rim: number };

type Layout = {
  w: number;
  h: number;
  floor: number;
  cw: number;
  ch: number;
  tray: Box;
  bins: Box[];
};

/**
 * One wall of a box. Walls closer together than a chip is wide (two bins
 * side by side, a bin beside the frame) form one divider a chip cannot fall
 * between: `mid` is that divider's middle and `lean` which way a chip on it
 * must roll off (inward at the frame), so nothing ever balances on a rim.
 */
type Wall = { x0: number; x1: number; rim: number; mid: number; lean: number };

type World = Layout & {
  g: number;
  e: number;
  drag: number;
  boxes: Box[];
  walls: Wall[];
};

function wallsOf(layout: Layout): Wall[] {
  const raw = [layout.tray, ...layout.bins]
    .flatMap((box) => [
      { x0: box.left, x1: box.left + WALL, rim: box.rim },
      { x0: box.right - WALL, x1: box.right, rim: box.rim },
    ])
    .sort((a, b) => a.x0 - b.x0);
  const walls: Wall[] = [];
  let group: typeof raw = [];
  const close = () => {
    const first = group[0];
    const last = group[group.length - 1];
    if (!first || !last) return;
    const lean =
      first.x0 < layout.cw ? 1 : layout.w - last.x1 < layout.cw ? -1 : 0;
    const mid = (first.x0 + last.x1) / 2;
    for (const wall of group) walls.push({ ...wall, mid, lean });
    group = [];
  };
  for (const wall of raw) {
    const prev = group[group.length - 1];
    if (prev && wall.x0 - prev.x1 >= layout.cw) close();
    group.push(wall);
  }
  close();
  return walls;
}

type Body = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  va: number;
  from: string;
  /** Thrown by a number key: the landing is deadened a little, so it stays put. */
  aimed: boolean;
  /** Where it will end up, once it can no longer bounce out. */
  decided: string | undefined;
  contact: boolean;
  /** Speed of the last touchdown, px/s. */
  impact: number;
  /** When it first struck anything: the settling air thickens from then on. */
  struck: number | null;
  resting: number;
  age: number;
};

type Hit = { kind: "rim" | "edge"; speed: number; x: number };

type Chip = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  r: MotionValue<number>;
  lift: MotionValue<number>;
  fade: MotionValue<number>;
};

type Slot = { x: number; y: number; r: number; z: number };

const INBOX = "\u0000inbox";
const BAND = 22;
const EDGE = 8;
const WALL = 2;
const TRAY_WALL = 18;
const BIN_WALL = 44;
const STEP = 1 / 120;
const MAX_STEPS = 8;
const MAX_SPEED = 3200;
const DROP = 150;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** A stable scatter per item, so piles look tossed but render the same everywhere. */
function jitter(id: string, salt: number) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i += 1) {
    h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  }
  return ((h >>> 0) % 2001) / 1000 - 1;
}

function layoutOf(w: number, h: number, keys: string[]): Layout {
  const floor = h - BAND;
  const wide = w >= 480;
  const gap = wide ? 14 : 6;
  const n = Math.max(1, keys.length);
  // A chip is as wide as the bins leave room for, 46 to 60px, so four bins
  // fit a phone and three bins on a wider tray get legible chips.
  const room = (w - 2 * EDGE - 64 - 12 - gap * (n - 1)) / n;
  const cw = clamp(Math.floor(room - 18), 46, 60);
  const ch = cw >= 56 ? 32 : 30;
  const tray: Box = {
    key: INBOX,
    left: EDGE,
    right: EDGE + cw + 18,
    rim: floor - TRAY_WALL,
  };
  const start = tray.right + (wide ? 28 : 12);
  const avail = w - EDGE - start;
  const binW = clamp((avail - gap * (n - 1)) / n, cw + 6, 132);
  const total = binW * n + gap * (n - 1);
  const x0 = start + (avail - total) / 2;
  const bins = keys.map((key, i) => ({
    key,
    left: r2(x0 + i * (binW + gap)),
    right: r2(x0 + i * (binW + gap) + binW),
    rim: floor - BIN_WALL,
  }));
  return { w, h, floor, cw, ch, tray, bins };
}

/**
 * One fixed step of one thrown chip: gravity, linear air drag, spin; then
 * the frame, the rims and walls of every box, and the floor. The chip is a
 * box against thin walls; at 120Hz and 3200px/s it moves under a chip's width
 * per step, so nothing tunnels.
 */
function stepBody(b: Body, w: World, hits: Hit[] | null) {
  const dt = STEP;
  const hw = w.cw / 2;
  const hh = w.ch / 2;
  b.age += dt;
  b.vy += w.g * dt;
  // Once it has been bouncing for most of a second the air thickens, so a
  // very bouncy, drag-free setting still comes to rest in a couple of
  // seconds. A clean flight is never touched by it.
  const late = b.struck === null ? 0 : Math.max(0, b.age - b.struck - 0.8) * 3;
  const keep = Math.max(0, 1 - (w.drag + late) * dt);
  b.vx *= keep;
  b.vy *= keep;
  const prevBottom = b.y + hh;
  const prevX = b.x;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.a += b.va * dt;
  b.va *= Math.max(0, 1 - 1.2 * dt);
  const e = w.e;

  if (b.x - hw < 0) {
    b.x = hw;
    if (b.vx < 0) {
      hits?.push({ kind: "edge", speed: -b.vx, x: b.x });
      b.struck ??= b.age;
      b.vx = -b.vx * e;
    }
  } else if (b.x + hw > w.w) {
    b.x = w.w - hw;
    if (b.vx > 0) {
      hits?.push({ kind: "edge", speed: b.vx, x: b.x });
      b.struck ??= b.age;
      b.vx = -b.vx * e;
    }
  }
  if (b.y - hh < 0) {
    b.y = hh;
    if (b.vy < 0) {
      hits?.push({ kind: "edge", speed: -b.vy, x: b.x });
      b.struck ??= b.age;
      b.vy = -b.vy * e;
    }
  }

  for (const wall of w.walls) {
    const { x0, x1, rim } = wall;
    if (
      b.x + hw <= x0 ||
      b.x - hw >= x1 ||
      b.y + hh <= rim ||
      b.y - hh >= w.floor
    ) {
      continue;
    }
    // Onto the rim only if it was already over the wall and came down on
    // it; moving sideways into a wall at rim height is a side hit.
    const over = prevX + hw > x0 && prevX - hw < x1;
    if (over && prevBottom <= rim + 0.5 && b.vy > 0) {
      // Down onto the rim: it bounces and tips off the side of the divider
      // it is over (inward at the frame), so it never balances on an edge.
      const roll = wall.lean || (b.x < wall.mid ? -1 : 1);
      b.y = rim - hh;
      hits?.push({ kind: "rim", speed: b.vy, x: b.x });
      b.struck ??= b.age;
      b.vy = -b.vy * e;
      // A glancing blow keeps its way; a chip nearly still across the rim
      // is tipped off it.
      if (Math.abs(b.vx) < 120) b.vx = roll * 120;
      b.va = clamp(b.va + roll * 60, -360, 360);
    } else if (prevX < (x0 + x1) / 2) {
      b.x = x0 - hw;
      if (b.vx > 0) {
        hits?.push({ kind: "rim", speed: b.vx, x: b.x });
        b.struck ??= b.age;
        b.vx = -b.vx * e;
      }
    } else {
      b.x = x1 + hw;
      if (b.vx < 0) {
        hits?.push({ kind: "rim", speed: -b.vx, x: b.x });
        b.struck ??= b.age;
        b.vx = -b.vx * e;
      }
    }
  }

  b.contact = false;
  if (b.y + hh >= w.floor) {
    b.y = w.floor - hh;
    b.contact = true;
    b.struck ??= b.age;
    if (b.vy > 0) {
      const impact = b.vy;
      b.impact = impact;
      // A number-key throw is a placement: it lands soft enough to stay in
      // the box it was aimed at, however bouncy the setting.
      const rebound = b.aimed ? Math.min(e, 0.15) : e;
      b.vy = impact > 60 ? -impact * rebound : 0;
      b.vx *= b.aimed ? 0.4 : 0.85;
      // It lands flat: the spin dies and the tilt halves on every touch.
      b.va *= 0.4;
      b.a *= 0.5;
    }
    b.vx *= Math.max(0, 1 - 7 * dt);
  }
}

const regionOf = (x: number, w: World) =>
  w.boxes.find((box) => x > box.left && x < box.right) ?? null;

/**
 * Decided once it touches down and its rebound could not clear the walls
 * around it — the frame the landing is heard and reported.
 */
function decide(b: Body, w: World) {
  if (b.decided !== undefined) return false;
  const box = regionOf(b.x, w);
  if (b.contact) {
    const wall = w.floor - (box ? box.rim : w.tray.rim);
    if (b.vy * b.vy < 2 * w.g * wall) {
      b.decided = box ? box.key : INBOX;
      return true;
    }
  }
  if (b.age > 5) {
    b.decided = box ? box.key : INBOX;
    return true;
  }
  return false;
}

/**
 * One candidate launch: a rise to `apex` (solved through the flight's own
 * integrator), then the across speed that puts the chip over the target's
 * middle as it comes down through `land`. Across is linear in the launch
 * speed for a given rise, so one unit shot tells how far each px/s carries.
 */
function aim(from: XY, cx: number, w: World, apex: number, land: number): XY {
  const keep = Math.max(0, 1 - w.drag * STEP);
  const peak = (vy: number) => {
    let y = from.y;
    let v = vy;
    for (let i = 0; i < 1200 && v < 0; i += 1) {
      v = (v + w.g * STEP) * keep;
      y += v * STEP;
    }
    return y;
  };
  let lo = -MAX_SPEED;
  let hi = 0;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (peak(mid) > apex) hi = mid;
    else lo = mid;
  }
  const vy = (lo + hi) / 2;
  let x = 0;
  let y = from.y;
  let vx = 1;
  let v = vy;
  for (let i = 0; i < 1200; i += 1) {
    v = (v + w.g * STEP) * keep;
    vx *= keep;
    x += vx * STEP;
    y += v * STEP;
    if (v > 0 && y >= land) break;
  }
  const across = x > 1e-6 ? (cx - from.x) / x : 0;
  return { x: clamp(across, -MAX_SPEED, MAX_SPEED), y: vy };
}

/**
 * The launch a number key uses. Candidate arcs — higher apexes, crossing
 * the target's own rim or the tallest one — are flown through the same
 * integrator and collisions as a real throw, and the first that lands in the
 * target is used, so the keyboard reaches the box it names whatever the
 * gravity, bounce and drag.
 */
function solveThrow(from: XY, target: Box, w: World): XY {
  const hh = w.ch / 2;
  const highest = Math.min(w.tray.rim, ...w.bins.map((b) => b.rim));
  const cx = (target.left + target.right) / 2;
  // A long throw still drifts as it drops: later candidates cross a little
  // short of the middle, on the thrower's side.
  const toward = Math.sign(from.x - cx);
  let first: XY | null = null;
  for (const lift of [34, 64, 96, 16, 128])
    for (const land of [target.rim - hh, highest - hh])
      for (const shift of [0, 8, 16]) {
        const apex = Math.max(
          hh + 6,
          Math.min(from.y, highest) - hh - lift - Math.abs(cx - from.x) * 0.08,
        );
        const v = aim(from, cx + toward * shift, w, apex, land);
        first ??= v;
        const test: Body = {
          id: "",
          x: from.x,
          y: from.y,
          vx: v.x,
          vy: v.y,
          a: 0,
          va: 0,
          from: "",
          aimed: true,
          decided: undefined,
          contact: false,
          impact: 0,
          struck: null,
          resting: 0,
          age: 0,
        };
        for (let i = 0; i < 1200 && test.decided === undefined; i += 1) {
          stepBody(test, w, null);
          decide(test, w);
        }
        if (test.decided === target.key) return v;
      }
  return first ?? { x: 0, y: 0 };
}

type Latest = {
  world: World | null;
  decided: (b: Body) => void;
  docked: (b: Body) => void;
  hits: (list: Hit[]) => void;
};

/**
 * A sorting tray you throw things into. The inbox holds the pile; grab its
 * top chip (or the top of any bin) and it lifts 1:1 under the finger; let go
 * and it flies from the hand with the hand's speed, on a real trajectory —
 * gravity, air drag, spin — bouncing off rims, walls and the frame, until it
 * lands in the bin it reaches. A chip that falls on the open floor goes back
 * to the inbox. Number keys throw the focused box's top chip into that bin on
 * a solved arc; 0 throws it back to the inbox.
 *
 * The flight runs on one animation loop at a fixed 120Hz, only while
 * something is in the air and never while the page is hidden. The landing is
 * decided — heard, counted and reported — on the frame the chip touches down
 * with too little rebound to leave, then it docks into its pile on the glide
 * spring. Under reduced motion nothing flies: the throw is worked out at once
 * and the chip fades into its place.
 */
export function FlingSort({
  items,
  categories,
  bins = 3,
  value,
  defaultValue,
  onValueChange,
  label,
  gravity = 2000,
  bounce = 0.4,
  drag = 0.8,
  height = 200,
  sound = false,
  disabled = false,
  className,
}: FlingSortProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const open = categories.slice(
    0,
    clamp(Math.round(bins), 1, Math.min(4, categories.length)),
  );
  const openKeys = open.map((c) => c.id);

  const [own, setOwn] = React.useState<Record<string, string>>(
    () => defaultValue ?? {},
  );
  const filed = value ?? own;
  const [order, setOrder] = React.useState<string[]>([]);
  const [airborne, setAirborne] = React.useState<string[]>([]);
  const [said, setSaid] = React.useState("");
  const [canvas, setCanvas] = React.useState<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState<{ w: number; h: number } | null>(null);

  const chips = React.useRef(new Map<string, Chip>());
  const bodies = React.useRef(new Map<string, Body>());
  const runs = React.useRef(new Map<string, AnimationPlaybackControls[]>());
  const placed = React.useRef(new Map<string, string>());
  const docking = React.useRef(new Map<string, XY>());
  const filedRef = React.useRef(filed);
  const loop = React.useRef<{ kick: () => void } | null>(null);
  const downOn = React.useRef<Element | null>(null);
  const gesture = React.useRef<{
    id: string;
    box: string;
    x: number;
    y: number;
    t: number;
  } | null>(null);

  const layout = size ? layoutOf(size.w, size.h, openKeys) : null;
  const g = clamp(gravity, 200, 6000);
  const e = clamp(bounce, 0, 0.95);
  const air = clamp(drag, 0, 10);
  const world: World | null = layout
    ? {
        ...layout,
        g,
        e,
        drag: air,
        boxes: [layout.tray, ...layout.bins],
        walls: wallsOf(layout),
      }
    : null;

  const homeOf = (id: string) => {
    const bin = filed[id];
    return bin !== undefined && openKeys.includes(bin) ? bin : INBOX;
  };
  const up = new Set(airborne);
  const rank = (id: string) => {
    const at = order.indexOf(id);
    return at >= 0 ? at : -1000 + items.findIndex((it) => it.id === id);
  };
  const piles = new Map<string, string[]>();
  piles.set(
    INBOX,
    items
      .filter((it) => homeOf(it.id) === INBOX && !up.has(it.id))
      .map((it) => it.id),
  );
  for (const key of openKeys) {
    piles.set(
      key,
      items
        .filter((it) => homeOf(it.id) === key && !up.has(it.id))
        .map((it) => it.id)
        .sort((a, b) => rank(a) - rank(b)),
    );
  }
  // The inbox is a queue, first item on top; a bin's newest landing is on top.
  const topOf = (key: string) => {
    const pile = piles.get(key) ?? [];
    return key === INBOX ? pile[0] : pile[pile.length - 1];
  };
  const countOf = (key: string) =>
    items.filter((it) => homeOf(it.id) === key).length;
  const itemOf = (id: string) => items.find((it) => it.id === id);
  const nameOf = (key: string) =>
    key === INBOX
      ? "the inbox"
      : (open.find((c) => c.id === key)?.label ?? key);

  const slots = new Map<string, Slot>();
  if (layout) {
    const hh = layout.ch / 2;
    const inbox = piles.get(INBOX) ?? [];
    inbox.forEach((id, q) => {
      const k = Math.min(inbox.length - 1 - q, 5);
      slots.set(id, {
        x: r2((layout.tray.left + layout.tray.right) / 2 + jitter(id, 1) * 2),
        y: r2(layout.floor - hh - 1 - k * 4),
        r: r2(jitter(id, 2) * 3),
        z: inbox.length - q,
      });
    });
    for (const box of layout.bins) {
      const pile = piles.get(box.key) ?? [];
      const spread =
        Math.max(0, (box.right - box.left - 4 - layout.cw) / 2) * 0.6;
      pile.forEach((id, i) => {
        const k = Math.min(i, 5);
        slots.set(id, {
          x: r2((box.left + box.right) / 2 + jitter(id, 1) * spread),
          y: r2(layout.floor - hh - 1 - k * 5),
          r: r2(jitter(id, 2) * 6),
          z: i + 1,
        });
      });
    }
  }

  const kick = () => loop.current?.kick();

  const pan = (x: number) => {
    const rect = canvas?.getBoundingClientRect();
    return rect ? panFrom(rect.left + x, null) : 0;
  };

  const stopRuns = (id: string) => {
    for (const run of runs.current.get(id) ?? []) run.stop();
    runs.current.delete(id);
  };

  const lift = (id: string) => {
    setAirborne((list) => (list.includes(id) ? list : [...list, id]));
    placed.current.set(id, "air");
    stopRuns(id);
  };

  const commit = (id: string, to: string) => {
    const current = filedRef.current;
    const at = current[id];
    const was = at !== undefined && openKeys.includes(at) ? at : INBOX;
    const item = itemOf(id);
    if (to === INBOX) {
      setSaid(
        was === INBOX
          ? `${item?.label ?? "Item"} back in the inbox.`
          : `${item?.label ?? "Item"} returned to the inbox.`,
      );
    } else {
      setSaid(`${item?.label ?? "Item"} filed under ${nameOf(to)}.`);
    }
    if (was === to) return;
    const next = { ...current };
    if (to === INBOX) delete next[id];
    else next[id] = to;
    filedRef.current = next;
    if (value === undefined) setOwn(next);
    setOrder((list) => [...list.filter((x) => x !== id), id]);
    onValueChange?.(next, { item: id, bin: to === INBOX ? null : to });
  };

  /** Plays out a whole throw in one go, for reduced motion and hidden pages. */
  const finish = (b: Body, w: World) => {
    for (let i = 0; i < 1200 && b.decided === undefined; i += 1) {
      stepBody(b, w, null);
      decide(b, w);
    }
    if (b.decided === undefined) b.decided = INBOX;
  };

  const land = (b: Body) => {
    const box = b.decided ?? INBOX;
    const at = pan(b.x);
    if (box === INBOX || !openKeys.includes(box)) {
      audio.play("thud", { pitch: 1.3, gain: 0.4, pan: at });
    } else {
      const hard = clamp(b.impact / 900, 0, 1);
      audio.play("thock", { pitch: 0.95, gain: 0.35 + hard * 0.3, pan: at });
    }
    commit(b.id, box);
    const chip = chips.current.get(b.id);
    if (chip && motionSafe) {
      runs.current.set(b.id, [
        animate(chip.lift, 0, {
          duration: durations.fast,
          ease: easings.enter,
        }),
      ]);
    }
  };

  const dock = (b: Body) => {
    bodies.current.delete(b.id);
    docking.current.set(b.id, { x: b.vx, y: b.vy });
    const chip = chips.current.get(b.id);
    chip?.lift.set(0);
    setAirborne((list) => list.filter((x) => x !== b.id));
  };

  const launch = (id: string, from: XY, v: XY, box: string, aimed: boolean) => {
    const chip = chips.current.get(id);
    if (!chip || !world) return;
    const speed = Math.hypot(v.x, v.y);
    const scale = speed > MAX_SPEED ? MAX_SPEED / speed : 1;
    const body: Body = {
      id,
      x: from.x,
      y: from.y,
      vx: v.x * scale,
      vy: v.y * scale,
      a: chip.r.get(),
      va: v.x * scale * 0.08,
      from: box,
      aimed,
      decided: undefined,
      contact: false,
      impact: 0,
      struck: null,
      resting: 0,
      age: 0,
    };
    if (!motionSafe) {
      // Worked out at once: the chip fades from the hand into its place.
      finish(body, world);
      land(body);
      chip.fade.set(0);
      dock(body);
      return;
    }
    if (speed * scale > 300) {
      const k = clamp((speed * scale) / MAX_SPEED, 0, 1);
      audio.play("whoosh", {
        pitch: 0.7 + k * 0.6,
        gain: 0.12 + k * 0.5,
        pan: pan(from.x),
      });
    }
    stopRuns(id);
    runs.current.set(id, [
      animate(chip.lift, 0.4, {
        duration: durations.base,
        ease: easings.enter,
      }),
    ]);
    bodies.current.set(id, body);
    kick();
  };

  /** The number-key path: pick the chip up out of its pile, then throw it. */
  const throwTop = (box: string, to: string) => {
    if (!world) return;
    const id = topOf(box);
    const target = world.boxes.find((b) => b.key === to);
    const chip = id ? chips.current.get(id) : undefined;
    if (!id || !chip || !target) {
      if (!id)
        setSaid(`${box === INBOX ? "The inbox" : nameOf(box)} is empty.`);
      return;
    }
    if (to === box) return;
    const source = world.boxes.find((b) => b.key === box) ?? world.tray;
    lift(id);
    audio.play("paper", { gain: 0.45, pan: pan(chip.x.get()) });
    const liftY = Math.min(chip.y.get(), source.rim - world.ch / 2 - 10);
    const from = { x: chip.x.get(), y: liftY };
    const v = solveThrow(from, target, world);
    if (!motionSafe) {
      launch(id, from, v, box, true);
      return;
    }
    runs.current.set(id, [
      animate(chip.lift, 1, springs.flick),
      animate(chip.y, liftY, {
        ...springs.flick,
        onComplete: () => launch(id, from, v, box, true),
      }),
    ]);
  };

  const handlers = useDrag({
    threshold: 3,
    disabled,
    onStart: ({ event }) => {
      const key =
        downOn.current?.closest<HTMLElement>("[data-box]")?.dataset.box;
      if (key === undefined || !world) return;
      const box = key === "" ? INBOX : key;
      const id = topOf(box);
      const chip = id ? chips.current.get(id) : undefined;
      if (!id || !chip) return;
      lift(id);
      gesture.current = {
        id,
        box,
        x: chip.x.get(),
        y: chip.y.get(),
        t: event.timeStamp,
      };
      audio.play("paper", { gain: 0.45, pan: pan(chip.x.get()) });
      if (motionSafe)
        runs.current.set(id, [animate(chip.lift, 1, springs.flick)]);
      else chip.lift.set(1);
    },
    onMove: ({ offset, delta, event }) => {
      const gs = gesture.current;
      const chip = gs ? chips.current.get(gs.id) : undefined;
      if (!gs || !chip || !world) return;
      const hw = world.cw / 2;
      const hh = world.ch / 2;
      chip.x.set(r2(rubberClamp(gs.x + offset.x, hw, world.w - hw, 40)));
      chip.y.set(r2(rubberClamp(gs.y + offset.y, hh, world.floor - hh, 40)));
      // The chip leans into the hand's speed, like paper held by a corner.
      const dt = Math.max(1, event.timeStamp - gs.t);
      gs.t = event.timeStamp;
      const lean = clamp(((delta.x / dt) * 1000) / 90, -14, 14);
      if (motionSafe)
        chip.r.set(r2(chip.r.get() + (lean - chip.r.get()) * 0.3));
    },
    onEnd: ({ velocity }) => {
      const gs = gesture.current;
      gesture.current = null;
      const chip = gs ? chips.current.get(gs.id) : undefined;
      if (!gs || !chip) return;
      const speed = Math.hypot(velocity.x, velocity.y);
      // Barely moving when let go: it drops from the hand.
      const v = speed < DROP ? { x: 0, y: 0 } : velocity;
      launch(gs.id, { x: chip.x.get(), y: chip.y.get() }, v, gs.box, false);
    },
    onCancel: () => {
      const gs = gesture.current;
      gesture.current = null;
      if (!gs) return;
      const chip = chips.current.get(gs.id);
      chip?.lift.set(0);
      docking.current.set(gs.id, { x: 0, y: 0 });
      setAirborne((list) => list.filter((x) => x !== gs.id));
    },
  });

  const latest = React.useRef<Latest>({
    world: null,
    decided: () => {},
    docked: () => {},
    hits: () => {},
  });
  React.useLayoutEffect(() => {
    filedRef.current = filed;
    latest.current = {
      world,
      decided: land,
      docked: dock,
      hits: (list) => {
        let loud: Hit | null = null;
        for (const hit of list) if (!loud || hit.speed > loud.speed) loud = hit;
        if (!loud || loud.speed < 150) return;
        const k = clamp(loud.speed / 2000, 0, 1);
        const at = pan(loud.x);
        if (loud.kind === "rim") {
          audio.play("clack", { pitch: 1.5, gain: 0.2 + k * 0.35, pan: at });
          audio.play("chime", { pitch: 1.35, gain: 0.05 + k * 0.08, pan: at });
        } else {
          audio.play("clack", { pitch: 0.85, gain: 0.12 + k * 0.2, pan: at });
        }
      },
    };
  });

  React.useEffect(() => {
    if (!canvas) return;
    // The observer reports once as soon as it starts, then on every change.
    const observer = new ResizeObserver(() =>
      setSize((prev) => {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        return prev && prev.w === w && prev.h === h ? prev : { w, h };
      }),
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvas]);

  // One loop for everything in the air. It runs only while something flies
  // and never while the page is hidden: hiding it lands every throw at once.
  React.useEffect(() => {
    let id = 0;
    let last: number | null = null;
    let acc = 0;
    const hits: Hit[] = [];
    const frame = (t: number) => {
      id = 0;
      const now = latest.current;
      const w = now.world;
      if (document.hidden || !w) {
        last = null;
        return;
      }
      acc +=
        last === null ? STEP : Math.min((t - last) / 1000, STEP * MAX_STEPS);
      last = t;
      let steps = 0;
      hits.length = 0;
      while (acc >= STEP - 1e-6 && steps < MAX_STEPS) {
        acc -= STEP;
        steps += 1;
        for (const b of bodies.current.values()) {
          stepBody(b, w, hits);
          if (decide(b, w)) now.decided(b);
        }
      }
      if (steps === MAX_STEPS) acc = 0;
      if (hits.length) now.hits(hits);
      for (const b of [...bodies.current.values()]) {
        const chip = chips.current.get(b.id);
        if (chip) {
          chip.x.set(r2(b.x));
          chip.y.set(r2(b.y));
          chip.r.set(r2(b.a));
        }
        const still = b.contact && Math.abs(b.vx) < 15 && Math.abs(b.vy) < 1;
        b.resting = still ? b.resting + 1 : 0;
        if (b.decided !== undefined && (b.resting > 2 || b.age > 6)) {
          now.docked(b);
        }
      }
      if (bodies.current.size > 0) id = window.requestAnimationFrame(frame);
      else {
        last = null;
        acc = 0;
      }
    };
    const kickLoop = () => {
      if (id || document.hidden) return;
      id = window.requestAnimationFrame(frame);
    };
    const onVisibility = () => {
      if (!document.hidden) {
        kickLoop();
        return;
      }
      if (id) window.cancelAnimationFrame(id);
      id = 0;
      last = null;
      const now = latest.current;
      if (!now.world) return;
      for (const b of [...bodies.current.values()]) {
        if (b.decided === undefined) {
          for (let i = 0; i < 1200 && b.decided === undefined; i += 1) {
            stepBody(b, now.world, null);
            decide(b, now.world);
          }
          if (b.decided === undefined) b.decided = INBOX;
          now.decided(b);
        }
        now.docked(b);
      }
    };
    loop.current = { kick: kickLoop };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (id) window.cancelAnimationFrame(id);
      id = 0;
      loop.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Everything on the ground goes to its slot: the first time straight there,
  // after that on the glide spring (a docking chip keeps its landing speed).
  React.useLayoutEffect(() => {
    for (const [id, slot] of slots) {
      const chip = chips.current.get(id);
      if (!chip || bodies.current.has(id)) continue;
      const key = `${slot.x},${slot.y},${slot.r}`;
      const prev = placed.current.get(id);
      if (prev === key) continue;
      placed.current.set(id, key);
      const v = docking.current.get(id) ?? { x: 0, y: 0 };
      docking.current.delete(id);
      stopRuns(id);
      if (prev === undefined || !motionSafe) {
        chip.x.set(slot.x);
        chip.y.set(slot.y);
        chip.r.set(slot.r);
        if (prev === "air" && chip.fade.get() < 1) {
          runs.current.set(id, [
            animate(chip.fade, 1, {
              duration: durations.fast,
              ease: easings.enter,
            }),
          ]);
        }
        continue;
      }
      runs.current.set(id, [
        animate(chip.x, slot.x, { ...springs.glide, velocity: v.x }),
        animate(chip.y, slot.y, { ...springs.glide, velocity: v.y }),
        animate(chip.r, slot.r, springs.glide),
        animate(chip.fade, 1, { duration: durations.fast }),
      ]);
    }
  });

  React.useEffect(
    () => () => {
      for (const list of runs.current.values())
        for (const run of list) run.stop();
      runs.current.clear();
    },
    [],
  );

  const register = React.useCallback((id: string, chip: Chip) => {
    chips.current.set(id, chip);
    return () => {
      if (chips.current.get(id) === chip) chips.current.delete(id);
      placed.current.delete(id);
    };
  }, []);

  const boxName = (key: string) => {
    const n = countOf(key);
    const top = topOf(key);
    const item = top ? itemOf(top) : undefined;
    const what = item
      ? `, top: ${item.label}${item.detail ? ` ${item.detail}` : ""}`
      : "";
    const title = key === INBOX ? "Inbox" : nameOf(key);
    return `${title}, ${n === 0 ? "empty" : plural(n, "item", "items")}${what}`;
  };

  const keyRange = open.length === 1 ? "1" : `1 to ${open.length}`;

  return (
    <div
      ref={setCanvas}
      role="group"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onPointerDown={(event) => {
        downOn.current = event.target instanceof Element ? event.target : null;
        handlers.onPointerDown(event);
      }}
      onPointerMove={handlers.onPointerMove}
      onPointerUp={handlers.onPointerUp}
      onPointerCancel={handlers.onPointerCancel}
      onLostPointerCapture={handlers.onLostPointerCapture}
      onKeyDown={(event) => {
        if (disabled || event.altKey || event.ctrlKey || event.metaKey) return;
        if (!(event.target instanceof Element)) return;
        const key =
          event.target.closest<HTMLElement>("[data-box]")?.dataset.box;
        if (key === undefined) return;
        const box = key === "" ? INBOX : key;
        if (event.key === "0" || event.key === "Backspace") {
          if (box === INBOX) return;
          event.preventDefault();
          throwTop(box, INBOX);
          return;
        }
        if (!/^[1-9]$/.test(event.key)) return;
        const target = openKeys[Number(event.key) - 1];
        if (target === undefined) return;
        event.preventDefault();
        throwTop(box, target);
      }}
      className={cn(
        "relative w-full overflow-clip rounded-3 border border-hairline bg-surface-0 [contain:paint] select-none",
        disabled && "opacity-60",
        className,
      )}
      style={{ height }}
    >
      {layout ? (
        <>
          <div
            aria-hidden
            className="absolute inset-x-0 h-px bg-hairline-strong"
            style={{ top: layout.floor }}
          />
          {[layout.tray, ...layout.bins].map((box, i) => (
            <BoxFrame
              key={box.key}
              box={box}
              floor={layout.floor}
              digit={box.key === INBOX ? null : i}
              title={box.key === INBOX ? "Inbox" : nameOf(box.key)}
              count={countOf(box.key)}
              motionSafe={motionSafe}
            />
          ))}
          {[layout.tray, ...layout.bins].map((box) => (
            <button
              key={box.key}
              type="button"
              data-box={box.key === INBOX ? "" : box.key}
              disabled={disabled}
              aria-label={boxName(box.key)}
              aria-describedby={hintId}
              className={cn(
                "absolute cursor-grab touch-none rounded-2 outline-none active:cursor-grabbing",
                "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring",
                "disabled:cursor-not-allowed",
              )}
              style={{
                left: box.left,
                width: box.right - box.left,
                top: Math.max(2, box.rim - 34),
                height: layout.h - Math.max(2, box.rim - 34) - 2,
              }}
            />
          ))}
          {items.map((item) => {
            const slot = slots.get(item.id);
            return (
              <FlingChip
                key={item.id}
                item={item}
                cw={layout.cw}
                ch={layout.ch}
                at={
                  slot ?? { x: layout.tray.left, y: layout.floor, r: 0, z: 0 }
                }
                flying={up.has(item.id)}
                register={register}
              />
            );
          })}
        </>
      ) : null}
      <p id={hintId} className="sr-only">
        Number keys {keyRange} throw the top item into that bin; 0 throws it
        back to the inbox.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {said}
      </p>
    </div>
  );
}

function BoxFrame({
  box,
  floor,
  digit,
  title,
  count,
  motionSafe,
}: {
  box: Box;
  floor: number;
  digit: number | null;
  title: string;
  count: number;
  motionSafe: boolean;
}) {
  const width = box.right - box.left;
  return (
    <div aria-hidden className="pointer-events-none">
      <div
        className={cn(
          "absolute rounded-b-2 border-x-2 border-b-2 border-hairline-strong",
          digit === null ? "bg-surface-2" : "bg-surface-1",
        )}
        style={{
          left: box.left,
          width,
          top: box.rim,
          height: floor - box.rim + 2,
        }}
      >
        {digit !== null ? (
          <span className="absolute top-0.5 left-1 font-mono text-[9px] leading-none text-ink-3">
            {digit}
          </span>
        ) : null}
      </div>
      <div
        className="absolute flex items-center justify-center gap-1 px-0.5 text-[10px] leading-none"
        style={{ left: box.left, width, top: floor + 6, height: 12 }}
      >
        <span className="truncate text-ink-2" title={title}>
          {title}
        </span>
        <span className="relative inline-grid shrink-0 font-mono text-ink-3 tabular-nums">
          <AnimatePresence initial={false}>
            <motion.span
              key={count}
              className="col-start-1 row-start-1"
              initial={motionSafe ? { opacity: 0, y: 4 } : { opacity: 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: durations.blink } }}
              transition={
                motionSafe ? springs.snap : { duration: durations.fast }
              }
            >
              {count}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>
    </div>
  );
}

function FlingChip({
  item,
  cw,
  ch,
  at,
  flying,
  register,
}: {
  item: FlingSortItem;
  cw: number;
  ch: number;
  at: Slot;
  flying: boolean;
  register: (id: string, chip: Chip) => () => void;
}) {
  const x = useMotionValue(at.x);
  const y = useMotionValue(at.y);
  const r = useMotionValue(at.r);
  const lift = useMotionValue(0);
  const fade = useMotionValue(1);
  const tx = useTransform(x, r2);
  const ty = useTransform(y, r2);
  const rotate = useTransform(r, r2);
  const scale = useTransform(lift, (l) => r2(1 + 0.06 * l));
  const shadow = useTransform(
    lift,
    (l) =>
      `0 ${r2(1 + l * 6)}px ${r2(2 + l * 10)}px color-mix(in oklab, black ${Math.round(10 + l * 14)}%, transparent)`,
  );

  React.useLayoutEffect(
    () => register(item.id, { x, y, r, lift, fade }),
    [register, item.id, x, y, r, lift, fade],
  );

  return (
    <motion.div
      aria-hidden
      className={cn(
        "pointer-events-none absolute top-0 left-0 flex flex-col justify-center gap-px overflow-clip rounded-2 border border-hairline-strong bg-card",
        cw < 56 ? "px-1" : "px-1.5",
      )}
      style={{
        width: cw,
        height: ch,
        marginLeft: -cw / 2,
        marginTop: -ch / 2,
        x: tx,
        y: ty,
        rotate,
        scale,
        opacity: fade,
        boxShadow: shadow,
        zIndex: flying ? 40 : at.z + 1,
      }}
    >
      <span className="truncate text-[10px] leading-tight font-medium text-foreground">
        {item.label}
      </span>
      {item.detail ? (
        <span className="truncate font-mono text-[9px] leading-tight text-ink-3 tabular-nums">
          {item.detail}
        </span>
      ) : null}
    </motion.div>
  );
}
