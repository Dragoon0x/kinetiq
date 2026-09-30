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
import { springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type NodeWirePort = {
  /** Unique within its node, without dots. */
  id: string;
  label: string;
  /** Cables only join ports of the same type: "number", "text", "event"… */
  type: string;
};

export type NodeWireNode = {
  /** Unique within the canvas, without dots. */
  id: string;
  label: string;
  /** Where the node starts across the free space: 0 left edge, 1 right edge. */
  x: number;
  /** Where the node starts down the free space: 0 top, 1 bottom. */
  y: number;
  inputs?: NodeWirePort[];
  outputs?: NodeWirePort[];
};

/** A cable from an output to an input, each written `"node.port"`. */
export type NodeWireLink = { from: string; to: string };

export type NodeWireKind = "rope" | "curve";

export type NodeWireProps = {
  /** The node cards, their ports and where they start. */
  nodes: NodeWireNode[];
  /** Controlled cables. */
  value?: NodeWireLink[];
  /** Initial cables when uncontrolled. @default [] */
  defaultValue?: NodeWireLink[];
  /** Fires from the plug or unplug that changed the cables, with all of them. */
  onValueChange?: (links: NodeWireLink[]) => void;
  /** An extra rule on top of matching types, given `"node.port"` of each end. */
  canConnect?: (from: string, to: string) => boolean;
  /** The canvas's accessible name. */
  label: string;
  /** Slack in each cable, 0 to 1: 0 is a straight wire, 1 hangs in a deep loop. @default 0.5 */
  sag?: number;
  /** 0 to 1: a limp string that swings long, up to a thick lead that arcs and settles fast. @default 0.5 */
  stiffness?: number;
  /** Capture radius around a compatible input, in px, 12 to 40. @default 24 */
  snap?: number;
  /** `rope` hangs free under gravity; `curve` is sprung onto the tidy editor curve. @default "rope" */
  wire?: NodeWireKind;
  /** Canvas height in px. @default 200 */
  height?: number;
  /** Play the cable's sounds. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type XY = { x: number; y: number };
type Pt = { x: number; y: number; px: number; py: number };

type Rope = {
  /** The render key: the link's key once plugged, a carry or reel id before. */
  id: string;
  kind: "link" | "carry" | "reel";
  from: string;
  to: string | null;
  type: number;
  pts: Pt[];
  /** Current rest length of one segment. */
  seg: number;
  /** What holds the plug end: a jack, a hand (finger or keyboard hover), nothing. */
  end: "jack" | "hand" | "free";
  hx: number;
  hy: number;
  /** Share of the way to its target the plug end covers per step: 1 is 1:1. */
  follow: number;
  /** Distance from the plug end to its target after the last step. */
  gap: number;
  seating: boolean;
  /** Frames spent waiting for a controlled host to take this cable. */
  pending: number;
  still: number;
  reel: boolean;
  done: boolean;
};

type Cfg = {
  w: number;
  h: number;
  sag: number;
  stiffness: number;
  wire: NodeWireKind;
  reduced: boolean;
};

type PortInfo = {
  key: string;
  node: NodeWireNode;
  port: NodeWirePort;
  dir: "in" | "out";
  row: number;
  type: number;
};

type Graph = {
  ports: Map<string, PortInfo>;
  order: string[];
  types: string[];
};

type NodeMotion = { x: MotionValue<number>; y: MotionValue<number> };

type Carry = {
  rope: string;
  from: string;
  /** The input the plug is caught by or hovering at. */
  target: string | null;
  via: "pointer" | "keys";
};

type Ghost = { id: string; type: number };

const HEADER = 26;
const ROW = 22;
const FOOT = 5;
const NARROW = 84;
const WIDE = 112;
/** Canvas width from which nodes are wide: the container query says the same. */
const WIDE_AT = 460;
const EDGE = 8;
/** Room kept between a node's jack and the canvas edge. */
const JACK_ROOM = 7;
const POINTS = 14;
const STEP = 1 / 60;
const MAX_STEPS = 4;
const GRAVITY = 900;
const REST = 0.05;
const REST_STEPS = 20;
/** A cable picked up with nothing to aim at hangs this long off its jack. */
const DANGLE = 38;
/** How far short of an input a keyboard-carried plug waits. */
const HOVER = 16;

/**
 * Types read by shape as well as colour, so a colour-blind eye still sees
 * which jacks match: circle, square, diamond, pill.
 */
const TYPE_COLOR = [
  "var(--accent-bright)",
  "var(--signal)",
  "var(--warn)",
  "var(--ink-2)",
] as const;
const TYPE_SHAPE = [
  "size-2.5 rounded-full",
  "size-2.5 rounded-[2px]",
  "size-2 rotate-45 rounded-[1px]",
  "h-[7px] w-3 rounded-full",
] as const;

const ARROWS: Record<string, XY> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const f2 = (v: number) => String(r2(v));
const linkKey = (l: NodeWireLink) => `${l.from}>${l.to}`;
const colorOf = (type: number) => TYPE_COLOR[type % TYPE_COLOR.length];
const shapeOf = (type: number) => TYPE_SHAPE[type % TYPE_SHAPE.length];
const widthFor = (w: number) => (w >= WIDE_AT ? WIDE : NARROW);
const heightOf = (n: NodeWireNode) =>
  HEADER + ((n.inputs?.length ?? 0) + (n.outputs?.length ?? 0)) * ROW + FOOT;
const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

function buildGraph(nodes: NodeWireNode[]): Graph {
  const ports = new Map<string, PortInfo>();
  const order: string[] = [];
  const types: string[] = [];
  const typeOf = (t: string) => {
    const at = types.indexOf(t);
    if (at >= 0) return at;
    types.push(t);
    return types.length - 1;
  };
  for (const node of nodes) {
    const inputs = node.inputs ?? [];
    const outputs = node.outputs ?? [];
    inputs.forEach((port, i) => {
      const key = `${node.id}.${port.id}`;
      ports.set(key, {
        key,
        node,
        port,
        dir: "in",
        row: i,
        type: typeOf(port.type),
      });
      order.push(key);
    });
    outputs.forEach((port, i) => {
      const key = `${node.id}.${port.id}`;
      ports.set(key, {
        key,
        node,
        port,
        dir: "out",
        row: inputs.length + i,
        type: typeOf(port.type),
      });
      order.push(key);
    });
  }
  return { ports, order, types };
}

const validLink = (g: Graph, l: NodeWireLink) => {
  const a = g.ports.get(l.from);
  const b = g.ports.get(l.to);
  return (
    !!a &&
    !!b &&
    a.dir === "out" &&
    b.dir === "in" &&
    a.node.id !== b.node.id &&
    a.type === b.type
  );
};

/** Extra length a cable carries over the straight distance between its ends. */
const slackFor = (d: number, sag: number) => sag * (20 + 0.4 * d);

/**
 * How far below the chord a hanging cable of that slack sits: the parabola's
 * depth for an arc length d + s, blended to s / 2 as the ends meet (a U).
 */
const sagDepth = (d: number, s: number) =>
  Math.sqrt((3 * d * s) / 8 + (s * s) / 4);

/**
 * The editor curve: a cubic that leaves the output and enters the input
 * horizontally, plus the sag's droop in the middle.
 */
function curveAt(a: XY, b: XY, t: number, sag: number): XY {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const h = Math.max(24, Math.abs(b.x - a.x) * 0.5 + 10);
  const u = 1 - t;
  const x =
    u * u * u * a.x +
    3 * u * u * t * (a.x + h) +
    3 * u * t * t * (b.x - h) +
    t * t * t * b.x;
  const y =
    u * u * u * a.y +
    3 * u * u * t * a.y +
    3 * u * t * t * b.y +
    t * t * t * b.y +
    sag * (8 + 0.25 * d) * 4 * t * u;
  return { x, y };
}

function makeRope(
  id: string,
  kind: Rope["kind"],
  from: string,
  to: string | null,
  type: number,
  at: XY,
  end: Rope["end"],
): Rope {
  return {
    id,
    kind,
    from,
    to,
    type,
    pts: Array.from({ length: POINTS }, () => ({
      x: at.x,
      y: at.y,
      px: at.x,
      py: at.y,
    })),
    seg: 0,
    end,
    hx: at.x,
    hy: at.y,
    follow: 1,
    gap: 0,
    seating: false,
    pending: 0,
    still: 0,
    reel: false,
    done: false,
  };
}

/** Lays a cable straight onto its resting shape: no inertia, no swing. */
function lay(r: Rope, a: XY, b: XY, c: Cfg) {
  const last = r.pts.length - 1;
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const slack = slackFor(d, c.sag);
  const depth = sagDepth(d, slack);
  const floor = c.h - 3;
  r.pts.forEach((p, i) => {
    const t = i / last;
    const q =
      c.wire === "curve"
        ? curveAt(a, b, t, c.sag)
        : {
            x: lerp(a.x, b.x, t),
            y: lerp(a.y, b.y, t) + 4 * depth * t * (1 - t),
          };
    p.x = p.px = q.x;
    p.y = p.py = Math.min(q.y, floor);
  });
  r.seg = (d + slack) / last;
}

/**
 * One fixed step of one cable. Rope: Verlet points under gravity held by
 * distance constraints (more passes and a bending pull make it stiffer),
 * landing on the floor with friction. Curve: the same points sprung onto the
 * editor curve, so the cable lags and wobbles but rests tidy.
 */
function stepRope(r: Rope, a: XY, b: XY | null, c: Cfg) {
  const pts = r.pts;
  const last = pts.length - 1;
  const head = pts[0];
  const tail = pts[last];
  if (!head || !tail) return;
  head.x = head.px = a.x;
  head.y = head.py = a.y;
  const curve = c.wire === "curve";

  let target = b;
  if (!target && curve) target = r.reel ? a : { x: a.x + 16, y: a.y + 30 };
  let moved = 0;
  if (target) {
    const f = r.reel ? 0.2 : r.follow;
    const nx = tail.x + (target.x - tail.x) * f;
    const ny = tail.y + (target.y - tail.y) * f;
    moved = Math.abs(nx - tail.x) + Math.abs(ny - tail.y);
    tail.x = tail.px = nx;
    tail.y = tail.py = ny;
    r.gap = Math.hypot(target.x - nx, target.y - ny);
  } else {
    r.gap = 0;
  }
  const pinned = target !== null;
  const d = Math.hypot(tail.x - a.x, tail.y - a.y);

  if (curve) {
    const k = lerp(0.06, 0.3, c.stiffness);
    const keep = lerp(0.9, 0.78, c.stiffness);
    const end = { x: tail.x, y: tail.y };
    for (let i = 1; i < last; i += 1) {
      const p = pts[i];
      if (!p) continue;
      const goal = curveAt(a, end, i / last, c.sag);
      const vx = (p.x - p.px) * keep;
      const vy = (p.y - p.py) * keep;
      p.px = p.x;
      p.py = p.y;
      p.x += vx + (goal.x - p.x) * k;
      p.y += vy + (goal.y - p.y) * k;
      moved = Math.max(moved, Math.abs(p.x - p.px) + Math.abs(p.y - p.py));
    }
    if (r.reel && d < 1.5) r.done = true;
  } else {
    // The length follows the distance on a short lag: a fast pull goes taut,
    // then the slack pays out behind it.
    const length = r.reel ? 0 : pinned ? d + slackFor(d, c.sag) : DANGLE;
    r.seg += (length / last - r.seg) * (r.reel ? 0.2 : 0.12);
    const keep = lerp(0.98, 0.94, c.stiffness);
    const g = GRAVITY * STEP * STEP;
    const lastFree = pinned ? last - 1 : last;
    for (let i = 1; i <= lastFree; i += 1) {
      const p = pts[i];
      if (!p) continue;
      const vx = (p.x - p.px) * keep;
      const vy = (p.y - p.py) * keep;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy + g;
    }
    const passes = Math.round(lerp(4, 16, c.stiffness));
    const bend = lerp(0, 0.3, c.stiffness) / passes;
    for (let pass = 0; pass < passes; pass += 1) {
      for (let i = 0; i < last; i += 1) {
        const p = pts[i];
        const q = pts[i + 1];
        if (!p || !q) continue;
        const wa = i === 0 ? 0 : 1;
        const wb = i + 1 === last && pinned ? 0 : 1;
        if (wa + wb === 0) continue;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const dist = Math.hypot(dx, dy) || 1e-6;
        // A cable pulls but never pushes: a short segment is slack, so the
        // chain drapes instead of buckling into a zig-zag.
        if (dist <= r.seg) continue;
        const diff = (dist - r.seg) / dist / (wa + wb);
        p.x += dx * diff * wa;
        p.y += dy * diff * wa;
        q.x -= dx * diff * wb;
        q.y -= dy * diff * wb;
      }
      if (bend > 0) {
        for (let i = 1; i <= Math.min(lastFree, last - 1); i += 1) {
          const p = pts[i];
          const before = pts[i - 1];
          const after = pts[i + 1];
          if (!p || !before || !after) continue;
          p.x += ((before.x + after.x) / 2 - p.x) * bend;
          p.y += ((before.y + after.y) / 2 - p.y) * bend;
        }
      }
    }
    // Pulled tighter than its length allows, a cable is a straight line: the
    // points go on the chord, which also keeps a cable that is still paying
    // out of its jack from zig-zagging.
    if (pinned && r.seg * last <= d) {
      for (let i = 1; i < last; i += 1) {
        const p = pts[i];
        if (!p) continue;
        p.x = p.px = lerp(a.x, tail.x, i / last);
        p.y = p.py = lerp(a.y, tail.y, i / last);
      }
    }
    const floor = c.h - 3;
    for (let i = 1; i <= lastFree; i += 1) {
      const p = pts[i];
      if (!p) continue;
      if (p.y > floor) {
        p.y = floor;
        // Lying on the floor, it slides rather than skates.
        p.px = p.x - (p.x - p.px) * 0.6;
      }
      p.x = clamp(p.x, 2, c.w - 2);
      moved = Math.max(moved, Math.abs(p.x - p.px) + Math.abs(p.y - p.py));
    }
    if (r.reel && r.seg * last < 1.5) r.done = true;
  }
  r.still = moved < REST ? r.still + 1 : 0;
}

/** A smooth Catmull-Rom path through the points, rounded for the attribute. */
function pathOf(pts: Pt[]): string {
  const first = pts[0];
  if (!first) return "";
  let d = `M${f2(first.x)} ${f2(first.y)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p0 = pts[i - 1] ?? p1;
    const p3 = pts[i + 2] ?? p2;
    if (!p0 || !p1 || !p2 || !p3) continue;
    d += `C${f2(p1.x + (p2.x - p0.x) / 6)} ${f2(p1.y + (p2.y - p0.y) / 6)} ${f2(p2.x - (p3.x - p1.x) / 6)} ${f2(p2.y - (p3.y - p1.y) / 6)} ${f2(p2.x)} ${f2(p2.y)}`;
  }
  return d;
}

function drawRope(r: Rope, el: SVGGElement) {
  const [under, line, plugA, plugB] = Array.from(el.children);
  const d = pathOf(r.pts);
  under?.setAttribute("d", d);
  line?.setAttribute("d", d);
  const head = r.pts[0];
  const tail = r.pts[r.pts.length - 1];
  if (head && plugA) {
    plugA.setAttribute("cx", f2(head.x));
    plugA.setAttribute("cy", f2(head.y));
  }
  if (tail && plugB) {
    plugB.setAttribute("cx", f2(tail.x));
    plugB.setAttribute("cy", f2(tail.y));
  }
}

type Latest = {
  cfg: Cfg | null;
  graph: Graph;
  links: NodeWireLink[];
  anchor: (key: string) => XY | null;
  seated: (r: Rope) => void;
  reeled: (r: Rope) => void;
  answer: (r: Rope) => void;
};

/**
 * A node editor whose cables are real cables. Press an output jack and drag:
 * a cable pays out 1:1 under the finger, every compatible input shows its
 * capture ring, and within `snap` px the plug is caught and flicks into the
 * jack; let go and it seats with a snap. Let go anywhere else and the cable
 * reels back into its output. Pull a plug out of an input to move it; drag a
 * node by its header and its cables swing along behind it.
 *
 * Each cable is a Verlet rope (or, as `wire="curve"`, the same points sprung
 * onto the tidy editor curve), stepped at a fixed 60Hz on one animation loop
 * that runs only while something moves and never while the page is hidden,
 * and written straight onto its path. Ports and grips are real buttons:
 * Enter picks up a cable, Arrow keys choose among the inputs that take it,
 * Enter plugs in and Escape lets it reel back; Arrow keys move a node. Under
 * reduced motion every cable is drawn straight onto its resting shape, with no
 * swing, while wiring, glows and sounds are unchanged.
 */
export function NodeWire({
  nodes,
  value,
  defaultValue,
  onValueChange,
  canConnect,
  label,
  sag = 0.5,
  stiffness = 0.5,
  snap = 24,
  wire = "rope",
  height = 200,
  sound = false,
  disabled = false,
  className,
}: NodeWireProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const graph = React.useMemo(() => buildGraph(nodes), [nodes]);
  const sagAmount = clamp(sag, 0, 1);
  const stiff = clamp(stiffness, 0, 1);
  const reach = clamp(snap, 8, 64);

  const [own, setOwn] = React.useState<NodeWireLink[]>(
    () => defaultValue ?? [],
  );
  const source = value ?? own;
  const links = React.useMemo(
    () => source.filter((l) => validLink(graph, l)),
    [source, graph],
  );
  const [ghosts, setGhosts] = React.useState<Ghost[]>([]);
  const [carry, setCarryState] = React.useState<Carry | null>(null);
  const [said, setSaid] = React.useState("");
  const [front, setFront] = React.useState<string | null>(null);
  const [canvas, setCanvas] = React.useState<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState<{ w: number; h: number } | null>(null);

  const ropes = React.useRef(new Map<string, Rope>());
  const els = React.useRef(new Map<string, SVGGElement>());
  const portEls = React.useRef(new Map<string, HTMLButtonElement>());
  const motions = React.useRef(new Map<string, NodeMotion>());
  const nodeRuns = React.useRef(new Map<string, AnimationPlaybackControls[]>());
  const loop = React.useRef<{ kick: () => void } | null>(null);
  const carryRef = React.useRef<Carry | null>(null);
  const linksRef = React.useRef(links);
  const seq = React.useRef(0);
  const downOn = React.useRef<Element | null>(null);
  const gesture = React.useRef<
    | { kind: "node"; id: string; x: number; y: number; t: number }
    | { kind: "carry"; t: number }
    | null
  >(null);
  const slither = React.useRef<LoopHandle | null>(null);
  const slitherTimer = React.useRef(0);

  const nw = size ? widthFor(size.w) : NARROW;

  const base = (node: NodeWireNode): XY => {
    const w = size?.w ?? 0;
    const h = size?.h ?? 0;
    return {
      x: EDGE + clamp(node.x, 0, 1) * (w - nw - 2 * EDGE),
      y: EDGE + clamp(node.y, 0, 1) * (h - heightOf(node) - 2 * EDGE),
    };
  };

  const bounds = (node: NodeWireNode) => {
    const b = base(node);
    const w = size?.w ?? 0;
    const h = size?.h ?? 0;
    return {
      minX: JACK_ROOM - b.x,
      maxX: Math.max(JACK_ROOM - b.x, w - nw - JACK_ROOM - b.x),
      minY: 2 - b.y,
      maxY: Math.max(2 - b.y, h - heightOf(node) - 2 - b.y),
    };
  };

  const anchor = (key: string): XY | null => {
    const info = graph.ports.get(key);
    if (!info || !size) return null;
    const b = base(info.node);
    const m = motions.current.get(info.node.id);
    const x = b.x + (m ? m.x.get() : 0);
    const y = b.y + (m ? m.y.get() : 0);
    // Jacks sit on the rows' edges, just inside the card's 1px border.
    return {
      x: info.dir === "out" ? x + nw - 1 : x + 1,
      y: y + HEADER + (info.row + 0.5) * ROW,
    };
  };

  const kick = () => loop.current?.kick();
  const setCarry = (next: Carry | null) => {
    carryRef.current = next;
    setCarryState(next);
  };

  const pan = (point: XY | null) => {
    const rect = canvas?.getBoundingClientRect();
    if (!rect || !point) return 0;
    return panFrom(rect.left + point.x, null);
  };

  const accepts = (from: string, to: string) => {
    const a = graph.ports.get(from);
    const b = graph.ports.get(to);
    if (!a || !b || a.dir !== "out" || b.dir !== "in") return false;
    if (a.node.id === b.node.id || a.type !== b.type) return false;
    return canConnect ? canConnect(from, to) : true;
  };
  const targetsFor = (from: string) =>
    graph.order.filter((key) => accepts(from, key));
  const targets = carry ? targetsFor(carry.from) : [];

  const nameOf = (key: string) => {
    const info = graph.ports.get(key);
    return info ? `${info.node.label} ${info.port.label}` : key;
  };
  const typeName = (key: string) => graph.ports.get(key)?.port.type ?? "";

  const commit = (next: NodeWireLink[]) => {
    linksRef.current = next;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const startSlither = (at: XY | null) => {
    if (!slither.current) {
      slither.current = audio.start("slither", {
        gain: 0,
        pitch: 0.8,
        pan: pan(at),
      });
    }
  };
  const feedSlither = (speed: number) => {
    slither.current?.set({
      gain: Math.min(0.6, speed / 1400),
      pitch: 0.75 + Math.min(1, speed / 1600) * 0.7,
    });
  };
  const stopSlither = () => {
    window.clearTimeout(slitherTimer.current);
    slither.current?.stop();
    slither.current = null;
  };
  // Keyboard moves slide cables too: a short burst of the same slither.
  const burstSlither = (at: XY | null) => {
    startSlither(at);
    feedSlither(700);
    window.clearTimeout(slitherTimer.current);
    slitherTimer.current = window.setTimeout(() => {
      slither.current?.stop();
      slither.current = null;
    }, 260);
  };

  /** A cable that lets go of its plug end and winds back into its output. */
  const reelAway = (r: Rope) => {
    const id = `reel-${(seq.current += 1)}`;
    ropes.current.delete(r.id);
    const old = r.id;
    r.id = id;
    r.kind = "reel";
    r.to = null;
    r.end = "free";
    r.reel = true;
    r.pending = 0;
    r.seating = false;
    ropes.current.set(id, r);
    setGhosts((g) => [...g.filter((x) => x.id !== old), { id, type: r.type }]);
  };

  const hoverAt = (key: string, withSound: boolean) => {
    const c = carryRef.current;
    if (!c) return;
    const r = ropes.current.get(c.rope);
    const j = anchor(key);
    if (!r || !j) return;
    r.end = "hand";
    r.hx = j.x - HOVER;
    r.hy = j.y;
    r.follow = motionSafe ? 0.3 : 1;
    setCarry({ ...c, target: key });
    if (withSound) {
      audio.play("detent", { pitch: 1.1, gain: 0.45, pan: pan(j) });
      burstSlither(j);
    }
    kick();
  };

  const beginCarry = (
    from: string,
    via: Carry["via"],
    hand: XY | null,
    reuse?: Rope,
    startAt?: string,
  ) => {
    const info = graph.ports.get(from);
    const a = anchor(from);
    if (!info || !a) return;
    const id = `carry-${(seq.current += 1)}`;
    let r: Rope;
    if (reuse) {
      ropes.current.delete(reuse.id);
      r = reuse;
      r.id = id;
      r.kind = "carry";
      r.to = null;
      r.seating = false;
      r.pending = 0;
    } else {
      r = makeRope(id, "carry", from, null, info.type, a, "free");
    }
    r.end = hand ? "hand" : "free";
    r.follow = 1;
    if (hand) {
      r.hx = hand.x;
      r.hy = hand.y;
    }
    ropes.current.set(id, r);
    setGhosts((g) => [...g, { id, type: info.type }]);
    const next: Carry = { rope: id, from, target: null, via };
    setCarry(next);

    const open = targetsFor(from);
    const type = info.port.type;
    const count =
      open.length === 0
        ? `No input takes ${article(type)} ${type} here.`
        : `${open.length} input${open.length === 1 ? " takes" : "s take"} it.`;
    const how =
      via === "keys" && open.length > 0
        ? " Arrow keys choose, Enter plugs in, Escape cancels."
        : "";
    setSaid(
      `Carrying ${info.port.label}, ${article(type)} ${type}. ${count}${how}`,
    );

    if (via === "keys" && open.length > 0) {
      // Start where the plug came from, or at the nearest input that takes it.
      let best =
        startAt && open.includes(startAt) ? startAt : (open[0] ?? null);
      let bestD = startAt && open.includes(startAt) ? -1 : Infinity;
      for (const key of open) {
        const j = anchor(key);
        const dist = j ? Math.hypot(j.x - a.x, j.y - a.y) : Infinity;
        if (dist < bestD) {
          bestD = dist;
          best = key;
        }
      }
      if (best) {
        portEls.current.get(best)?.focus();
        hoverAt(best, false);
      }
    }
    kick();
  };

  const unplug = (link: NodeWireLink) => {
    const key = linkKey(link);
    commit(linksRef.current.filter((l) => linkKey(l) !== key));
    const at = anchor(link.to);
    audio.play("pop", { pitch: 0.95, gain: 0.5, pan: pan(at) });
    setSaid(`${nameOf(link.to)} unplugged.`);
    return ropes.current.get(key);
  };

  const cancelCarry = (refocus: boolean) => {
    const c = carryRef.current;
    if (!c) return;
    const r = ropes.current.get(c.rope);
    if (r) {
      r.end = "free";
      r.reel = true;
      r.kind = "reel";
    }
    setCarry(null);
    setSaid("Cable put back.");
    if (refocus) portEls.current.get(c.from)?.focus();
    kick();
  };

  const plug = (to: string) => {
    const c = carryRef.current;
    if (!c) return;
    const r = ropes.current.get(c.rope);
    const link = { from: c.from, to };
    const key = linkKey(link);
    const current = linksRef.current;
    const prev = current.find((l) => l.to === to);
    const next = [...current.filter((l) => l.to !== to), link];
    if (prev && linkKey(prev) !== key) {
      const old = ropes.current.get(linkKey(prev));
      if (old) reelAway(old);
      audio.play("pop", { pitch: 0.95, gain: 0.45, pan: pan(anchor(to)) });
    }
    if (r) {
      ropes.current.delete(r.id);
      ropes.current.delete(key);
      r.id = key;
      r.kind = "link";
      r.to = to;
      r.end = "jack";
      r.reel = false;
      r.seating = true;
      r.follow = motionSafe ? 1 : Math.min(r.follow, 0.35);
      r.pending = value === undefined ? 0 : 1;
      ropes.current.set(key, r);
    }
    setGhosts((g) => {
      const kept = g.filter((x) => x.id !== c.rope && x.id !== key);
      return value === undefined || !r
        ? kept
        : [...kept, { id: key, type: r.type }];
    });
    setCarry(null);
    commit(next);
    setSaid(`${nameOf(c.from)} plugged into ${nameOf(to)}.`);
    kick();
  };

  const activate = (key: string, via: Carry["via"]) => {
    const info = graph.ports.get(key);
    if (!info || disabled) return;
    const c = carryRef.current;
    if (c) {
      if (key === c.from) cancelCarry(via === "keys");
      else if (accepts(c.from, key)) plug(key);
      else {
        const type = typeName(c.from);
        setSaid(
          info.dir === "in"
            ? `${info.port.label} does not take ${article(type)} ${type}.`
            : `Choose an input for ${graph.ports.get(c.from)?.port.label ?? "the cable"}.`,
        );
      }
      return;
    }
    if (info.dir === "out") {
      beginCarry(key, via, null);
      return;
    }
    const wired = linksRef.current.find((l) => l.to === key);
    if (wired) {
      beginCarry(wired.from, via, null, unplug(wired), key);
      return;
    }
    setSaid(`${info.port.label} is empty. Start from an output.`);
  };

  const moveNode = (id: string, dx: number, dy: number) => {
    const node = nodes.find((n) => n.id === id);
    const m = motions.current.get(id);
    if (!node || !m) return;
    const b = bounds(node);
    const tx = clamp(m.x.get() + dx, b.minX, b.maxX);
    const ty = clamp(m.y.get() + dy, b.minY, b.maxY);
    if (tx === m.x.get() && ty === m.y.get()) return;
    for (const run of nodeRuns.current.get(id) ?? []) run.stop();
    setFront(id);
    if (!motionSafe) {
      m.x.set(tx);
      m.y.set(ty);
    } else {
      nodeRuns.current.set(id, [
        animate(m.x, tx, springs.glide),
        animate(m.y, ty, springs.glide),
      ]);
    }
    if (
      linksRef.current.some(
        (l) => l.from.startsWith(`${id}.`) || l.to.startsWith(`${id}.`),
      )
    ) {
      burstSlither(
        anchor(graph.order.find((k) => k.startsWith(`${id}.`)) ?? ""),
      );
    }
  };

  const local = (clientX: number, clientY: number): XY => {
    const rect = canvas?.getBoundingClientRect();
    if (!rect || !canvas) return { x: 0, y: 0 };
    return {
      x: clientX - rect.left - canvas.clientLeft,
      y: clientY - rect.top - canvas.clientTop,
    };
  };

  const catchAt = (from: string, p: XY) => {
    let best: string | null = null;
    let bestD = reach;
    for (const key of targetsFor(from)) {
      const j = anchor(key);
      if (!j) continue;
      const d = Math.hypot(j.x - p.x, j.y - p.y);
      if (d <= bestD) {
        bestD = d;
        best = key;
      }
    }
    return best;
  };

  const drag = useDrag({
    threshold: 3,
    disabled,
    onStart: ({ point, event }) => {
      const on = downOn.current;
      const grip = on?.closest<HTMLElement>("[data-grip]")?.dataset.grip;
      const port = on?.closest<HTMLElement>("[data-port]")?.dataset.port;
      if (grip) {
        const m = motions.current.get(grip);
        if (!m) return;
        for (const run of nodeRuns.current.get(grip) ?? []) run.stop();
        gesture.current = {
          kind: "node",
          id: grip,
          x: m.x.get(),
          y: m.y.get(),
          t: event.timeStamp,
        };
        setFront(grip);
        const wired = linksRef.current.some(
          (l) => l.from.startsWith(`${grip}.`) || l.to.startsWith(`${grip}.`),
        );
        if (wired) startSlither(local(point.x, point.y));
        return;
      }
      if (!port) return;
      const info = graph.ports.get(port);
      if (!info) return;
      if (carryRef.current) cancelCarry(false);
      const hand = local(point.x, point.y);
      if (info.dir === "out") {
        beginCarry(port, "pointer", hand);
      } else {
        const wired = linksRef.current.find((l) => l.to === port);
        if (!wired) return;
        const r = unplug(wired);
        beginCarry(wired.from, "pointer", hand, r);
      }
      gesture.current = { kind: "carry", t: event.timeStamp };
      startSlither(hand);
    },
    onMove: ({ offset, delta, point, event }) => {
      const g = gesture.current;
      if (!g || !size) return;
      const dt = Math.max(1, event.timeStamp - g.t);
      g.t = event.timeStamp;
      feedSlither((Math.hypot(delta.x, delta.y) / dt) * 1000);
      if (g.kind === "node") {
        const node = nodes.find((n) => n.id === g.id);
        const m = motions.current.get(g.id);
        if (!node || !m) return;
        const b = bounds(node);
        m.x.set(r2(rubberClamp(g.x + offset.x, b.minX, b.maxX, 60)));
        m.y.set(r2(rubberClamp(g.y + offset.y, b.minY, b.maxY, 60)));
        return;
      }
      const c = carryRef.current;
      const r = c ? ropes.current.get(c.rope) : undefined;
      if (!c || !r) return;
      const raw = local(point.x, point.y);
      const hand = {
        x: rubberClamp(raw.x, 0, size.w, 48),
        y: rubberClamp(raw.y, 0, size.h, 48),
      };
      const caught = catchAt(c.from, hand);
      if (caught) {
        const j = anchor(caught);
        if (j) {
          r.hx = j.x;
          r.hy = j.y;
          r.follow = motionSafe ? 1 : 0.45;
        }
      } else {
        r.hx = hand.x;
        r.hy = hand.y;
        // Back under the finger: close the last of the gap quickly, then 1:1.
        r.follow = r.gap > 2 && motionSafe ? 0.6 : 1;
      }
      r.end = "hand";
      if (caught !== c.target) {
        setCarry({ ...c, target: caught });
        if (caught) {
          audio.play("detent", { pitch: 1.1, gain: 0.45, pan: pan(hand) });
        }
      }
      kick();
    },
    onEnd: ({ point, velocity }) => {
      const g = gesture.current;
      gesture.current = null;
      stopSlither();
      if (!g) return;
      if (g.kind === "node") {
        const node = nodes.find((n) => n.id === g.id);
        const m = motions.current.get(g.id);
        if (!node || !m) return;
        const b = bounds(node);
        if (!motionSafe) {
          m.x.set(clamp(m.x.get(), b.minX, b.maxX));
          m.y.set(clamp(m.y.get(), b.minY, b.maxY));
          return;
        }
        // A light throw: the node glides on to where it would rest, held
        // inside the canvas, carrying the hand's speed into the spring.
        nodeRuns.current.set(g.id, [
          animate(
            m.x,
            clamp(project(m.x.get(), velocity.x, 0.97), b.minX, b.maxX),
            {
              ...springs.glide,
              velocity: velocity.x,
            },
          ),
          animate(
            m.y,
            clamp(project(m.y.get(), velocity.y, 0.97), b.minY, b.maxY),
            {
              ...springs.glide,
              velocity: velocity.y,
            },
          ),
        ]);
        return;
      }
      const c = carryRef.current;
      if (!c) return;
      if (c.target) {
        plug(c.target);
        return;
      }
      // A flick short of a jack plugs in where it was heading.
      const hand = local(point.x, point.y);
      const reachX = clamp(
        project(hand.x, velocity.x, 0.99),
        hand.x - 160,
        hand.x + 160,
      );
      const reachY = clamp(
        project(hand.y, velocity.y, 0.99),
        hand.y - 160,
        hand.y + 160,
      );
      const flung = catchAt(c.from, { x: reachX, y: reachY });
      if (flung && Math.hypot(velocity.x, velocity.y) > 300) {
        const r = ropes.current.get(c.rope);
        if (r) r.follow = motionSafe ? 0.3 : 1;
        plug(flung);
        return;
      }
      cancelCarry(false);
    },
    onCancel: () => {
      const g = gesture.current;
      gesture.current = null;
      stopSlither();
      if (g?.kind === "node") {
        const node = nodes.find((n) => n.id === g.id);
        const m = motions.current.get(g.id);
        if (!node || !m) return;
        const b = bounds(node);
        m.x.set(clamp(m.x.get(), b.minX, b.maxX));
        m.y.set(clamp(m.y.get(), b.minY, b.maxY));
      } else if (g?.kind === "carry") {
        cancelCarry(false);
      }
    },
    onTap: () => {
      const on = downOn.current;
      const port = on?.closest<HTMLElement>("[data-port]")?.dataset.port;
      if (port) activate(port, "pointer");
      else if (!on?.closest("[data-grip]") && carryRef.current) {
        cancelCarry(false);
      }
    },
  });

  // Everything the animation loop reads, current as of the last commit.
  const latest = React.useRef<Latest>({
    cfg: null,
    graph,
    links,
    anchor: () => null,
    seated: () => {},
    reeled: () => {},
    answer: () => {},
  });
  React.useLayoutEffect(() => {
    linksRef.current = links;
    latest.current = {
      cfg: size
        ? {
            w: size.w,
            h: size.h,
            sag: sagAmount,
            stiffness: stiff,
            wire,
            reduced: !motionSafe,
          }
        : null,
      graph,
      links,
      anchor,
      seated: (r) => {
        const at = anchor(r.to ?? "");
        audio.play("snap", { pitch: 0.9, gain: 0.5, pan: pan(at) });
        audio.play("thock", { pitch: 1.5, gain: 0.35, pan: pan(at) });
      },
      reeled: (r) => {
        setGhosts((g) => g.filter((x) => x.id !== r.id));
      },
      answer: (r) => {
        if (links.some((l) => linkKey(l) === r.id)) {
          r.pending = 0;
          setGhosts((g) => g.filter((x) => x.id !== r.id));
          return;
        }
        r.pending += 1;
        // A third of a second with no answer: the host refused the cable.
        if (r.pending > 20) reelAway(r);
      },
    };
  });

  // The canvas's size, read when the node arrives and whenever it changes.
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

  // One loop for every cable. It runs only while something moves, stops
  // once all of them have been still for half a second, and never runs
  // while the page is hidden.
  React.useEffect(() => {
    let id = 0;
    let last: number | null = null;
    let acc = 0;
    const frame = (t: number) => {
      id = 0;
      const now = latest.current;
      const cfg = now.cfg;
      if (document.hidden || !cfg) {
        last = null;
        return;
      }
      acc +=
        last === null ? STEP : Math.min((t - last) / 1000, STEP * MAX_STEPS);
      last = t;
      let steps = 0;
      while (acc >= STEP - 1e-6 && steps < MAX_STEPS) {
        acc -= STEP;
        steps += 1;
        for (const r of ropes.current.values()) {
          if (r.done) continue;
          const a = now.anchor(r.from);
          if (!a) continue;
          const b =
            r.end === "jack" && r.to
              ? now.anchor(r.to)
              : r.end === "hand"
                ? { x: r.hx, y: r.hy }
                : null;
          if (cfg.reduced) {
            if (r.reel) r.done = true;
            else {
              lay(r, a, b ?? { x: a.x + 14, y: a.y + 34 }, cfg);
              r.gap = 0;
              r.still = REST_STEPS;
            }
          } else {
            stepRope(r, a, b, cfg);
          }
        }
      }
      if (steps === MAX_STEPS) acc = 0;
      let busy = false;
      for (const r of [...ropes.current.values()]) {
        if (r.done) {
          ropes.current.delete(r.id);
          now.reeled(r);
          continue;
        }
        if (r.seating && r.end === "jack" && r.gap < 0.75) {
          r.seating = false;
          now.seated(r);
        }
        const el = els.current.get(r.id);
        if (el) drawRope(r, el);
        if (r.pending > 0) now.answer(r);
        if (r.still < REST_STEPS || r.seating || r.pending > 0) busy = true;
      }
      if (busy) id = window.requestAnimationFrame(frame);
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
      if (document.hidden) {
        if (id) window.cancelAnimationFrame(id);
        id = 0;
        last = null;
      } else {
        kickLoop();
      }
    };
    loop.current = { kick: kickLoop };
    document.addEventListener("visibilitychange", onVisibility);
    kickLoop();
    return () => {
      if (id) window.cancelAnimationFrame(id);
      id = 0;
      loop.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Cables for links that have none yet are made already at rest, so a
  // graph never falls into place when it mounts; links the host removed go.
  React.useLayoutEffect(() => {
    const cfg = latest.current.cfg;
    if (!cfg) return;
    const keys = new Set(links.map(linkKey));
    for (const l of links) {
      const key = linkKey(l);
      if (ropes.current.has(key)) continue;
      const a = anchor(l.from);
      const b = anchor(l.to);
      const info = graph.ports.get(l.from);
      if (!a || !b || !info) continue;
      const r = makeRope(key, "link", l.from, l.to, info.type, a, "jack");
      lay(r, a, b, cfg);
      if (!cfg.reduced && cfg.wire === "rope") {
        for (let i = 0; i < 120; i += 1) stepRope(r, a, b, cfg);
      }
      ropes.current.set(key, r);
    }
    for (const [key, r] of ropes.current) {
      if (r.kind === "link" && r.pending === 0 && !keys.has(key)) {
        ropes.current.delete(key);
      }
    }
    kick();
    // anchor and kick read refs and the size; links, graph and size are the triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, graph, size]);

  // A tweak or a motion preference change re-settles every cable.
  React.useEffect(() => {
    for (const r of ropes.current.values()) r.still = 0;
    kick();
  }, [sagAmount, stiff, wire, motionSafe]);

  // Every commit draws before paint, so a cable that changed its key (a
  // carried cable plugging in) is never a frame without its path.
  React.useLayoutEffect(() => {
    for (const r of ropes.current.values()) {
      const el = els.current.get(r.id);
      if (el) drawRope(r, el);
    }
  });

  // A resize keeps every node inside the canvas.
  React.useEffect(() => {
    if (!size) return;
    for (const node of nodes) {
      const m = motions.current.get(node.id);
      if (!m) continue;
      const b = bounds(node);
      m.x.set(clamp(m.x.get(), b.minX, b.maxX));
      m.y.set(clamp(m.y.get(), b.minY, b.maxY));
    }
    // bounds reads the size and node width, which are the triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, nodes]);

  React.useEffect(
    () => () => {
      window.clearTimeout(slitherTimer.current);
      for (const runs of nodeRuns.current.values()) {
        for (const run of runs) run.stop();
      }
    },
    [],
  );

  const register = React.useCallback((id: string, m: NodeMotion) => {
    motions.current.set(id, m);
    const moved = () => loop.current?.kick();
    const offX = m.x.on("change", moved);
    const offY = m.y.on("change", moved);
    return () => {
      offX();
      offY();
      if (motions.current.get(id) === m) motions.current.delete(id);
    };
  }, []);

  const bindPort = React.useCallback(
    (key: string) => (el: HTMLButtonElement | null) => {
      if (el) portEls.current.set(key, el);
      else portEls.current.delete(key);
    },
    [],
  );

  const bindRope = React.useCallback(
    (id: string) => (el: SVGGElement | null) => {
      if (el) els.current.set(id, el);
      else els.current.delete(id);
    },
    [],
  );

  const wires = React.useMemo(() => {
    const out: Ghost[] = links.map((l) => ({
      id: linkKey(l),
      type: graph.ports.get(l.from)?.type ?? 0,
    }));
    const seen = new Set(out.map((w) => w.id));
    for (const g of ghosts) {
      if (seen.has(g.id)) continue;
      seen.add(g.id);
      out.push(g);
    }
    return out;
  }, [links, ghosts, graph]);

  const describe = (key: string) => {
    const info = graph.ports.get(key);
    if (!info) return key;
    const { port, node } = info;
    if (info.dir === "out") {
      const to = links.filter((l) => l.from === key).map((l) => nameOf(l.to));
      return `${port.label}, ${port.type} output of ${node.label}, ${
        to.length ? `wired to ${to.join(" and ")}` : "not wired"
      }`;
    }
    const from = links.find((l) => l.to === key);
    return `${port.label}, ${port.type} input of ${node.label}, ${
      from ? `from ${nameOf(from.from)}` : "empty"
    }`;
  };

  const wired = new Set<string>();
  for (const l of links) {
    wired.add(l.from);
    wired.add(l.to);
  }
  const candidates = new Set(targets);

  return (
    <div
      ref={setCanvas}
      role="group"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onPointerDown={(event) => {
        downOn.current = event.target instanceof Element ? event.target : null;
        drag.onPointerDown(event);
      }}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      onClick={(event) => {
        // Pointer presses arrive through the drag's tap; a click with no
        // pointer behind it (Enter, Space, assistive technology) is a press.
        if (event.detail !== 0 || !(event.target instanceof Element)) return;
        const port =
          event.target.closest<HTMLElement>("[data-port]")?.dataset.port;
        if (port) activate(port, "keys");
      }}
      onKeyDown={(event) => {
        if (disabled || !(event.target instanceof Element)) return;
        const c = carryRef.current;
        if (event.key === "Escape" && c) {
          event.preventDefault();
          cancelCarry(true);
          return;
        }
        const dir = ARROWS[event.key];
        const grip =
          event.target.closest<HTMLElement>("[data-grip]")?.dataset.grip;
        const port =
          event.target.closest<HTMLElement>("[data-port]")?.dataset.port;
        if (grip && dir) {
          event.preventDefault();
          const step = event.shiftKey ? 32 : 8;
          moveNode(grip, dir.x * step, dir.y * step);
          return;
        }
        if (port && dir && c) {
          const open = targetsFor(c.from);
          if (open.length === 0) return;
          event.preventDefault();
          const at = open.indexOf(c.target ?? port);
          const forward = dir.x + dir.y > 0;
          const next =
            open[
              at < 0 ? 0 : (at + (forward ? 1 : -1) + open.length) % open.length
            ];
          if (next) {
            portEls.current.get(next)?.focus();
            hoverAt(next, true);
          }
          return;
        }
        if (
          port &&
          !c &&
          (event.key === "Delete" || event.key === "Backspace")
        ) {
          const link = linksRef.current.find((l) => l.to === port);
          if (!link) return;
          event.preventDefault();
          const r = unplug(link);
          if (r) reelAway(r);
          kick();
        }
      }}
      onBlur={(event) => {
        const to = event.relatedTarget;
        // Focus leaving the canvas puts back a cable picked up by a press;
        // one held by a dragging finger stays with the finger.
        if (
          carryRef.current &&
          !gesture.current &&
          !(to instanceof Node && event.currentTarget.contains(to))
        ) {
          cancelCarry(false);
        }
      }}
      className={cn(
        "@container relative w-full overflow-clip rounded-3 border border-hairline bg-surface-0 [contain:paint] select-none",
        disabled && "opacity-60",
        className,
      )}
      style={{
        height,
        backgroundImage:
          "radial-gradient(var(--hairline-strong) 1px, transparent 1.2px)",
        backgroundSize: "16px 16px",
        backgroundPosition: "8px 8px",
      }}
    >
      <div className="absolute inset-0 [--nw:84px] @min-[460px]:[--nw:112px]">
        {nodes.map((node) => (
          <NodeCard
            key={node.id}
            node={node}
            graph={graph}
            wired={wired}
            carry={carry}
            candidates={candidates}
            snap={reach}
            disabled={disabled}
            motionSafe={motionSafe}
            front={front === node.id}
            hintId={hintId}
            describe={describe}
            register={register}
            bindPort={bindPort}
          />
        ))}
      </div>

      {size ? (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[3] size-full"
        >
          {wires.map((w) => (
            <g
              key={w.id}
              ref={bindRope(w.id)}
              style={{ color: colorOf(w.type) }}
            >
              <path
                fill="none"
                stroke="var(--bg-1)"
                strokeOpacity={0.8}
                strokeWidth={5.5}
                strokeLinecap="round"
              />
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
              />
              <circle
                r={3.5}
                fill="currentColor"
                stroke="var(--bg-1)"
                strokeWidth={1.5}
              />
              <circle
                r={4}
                fill="currentColor"
                stroke="var(--bg-1)"
                strokeWidth={1.5}
              />
            </g>
          ))}
        </svg>
      ) : null}

      <p id={hintId} className="sr-only">
        Enter picks up a cable from an output, Arrow keys choose an input, Enter
        plugs it in, Escape puts it back. Delete unplugs an input. On a
        node&apos;s grip, Arrow keys move the node.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {said}
      </p>
    </div>
  );
}

function GripIcon() {
  return (
    <svg aria-hidden viewBox="0 0 6 10" className="h-2.5 w-1.5 shrink-0">
      {[1, 5, 9].map((y) => (
        <React.Fragment key={y}>
          <circle cx={1} cy={y} r={0.9} fill="currentColor" />
          <circle cx={5} cy={y} r={0.9} fill="currentColor" />
        </React.Fragment>
      ))}
    </svg>
  );
}

type NodeCardProps = {
  node: NodeWireNode;
  graph: Graph;
  wired: Set<string>;
  carry: Carry | null;
  candidates: Set<string>;
  snap: number;
  disabled: boolean;
  motionSafe: boolean;
  front: boolean;
  hintId: string;
  describe: (key: string) => string;
  register: (id: string, m: NodeMotion) => () => void;
  bindPort: (key: string) => (el: HTMLButtonElement | null) => void;
};

function NodeCard({
  node,
  graph,
  wired,
  carry,
  candidates,
  snap,
  disabled,
  motionSafe,
  front,
  hintId,
  describe,
  register,
  bindPort,
}: NodeCardProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const tx = useTransform(x, r2);
  const ty = useTransform(y, r2);
  const nh = heightOf(node);

  React.useLayoutEffect(
    () => register(node.id, { x, y }),
    [register, node.id, x, y],
  );

  const fx = Number(clamp(node.x, 0, 1).toFixed(4));
  const fy = Number(clamp(node.y, 0, 1).toFixed(4));
  const ports = [
    ...(node.inputs ?? []).map((port) => ({ port, dir: "in" as const })),
    ...(node.outputs ?? []).map((port) => ({ port, dir: "out" as const })),
  ];

  return (
    <motion.div
      role="group"
      aria-label={node.label}
      className="absolute rounded-3 border border-hairline-strong bg-card shadow-[var(--shadow-raised)]"
      style={{
        left: `calc(${EDGE}px + ${fx} * (100% - var(--nw) - ${2 * EDGE}px))`,
        top: `calc(${EDGE}px + ${fy} * (100% - ${nh + 2 * EDGE}px))`,
        width: "var(--nw)",
        height: nh,
        x: tx,
        y: ty,
        zIndex: front ? 2 : 1,
      }}
    >
      <button
        type="button"
        data-grip={node.id}
        disabled={disabled}
        aria-label={`Move ${node.label}`}
        aria-roledescription="movable node"
        aria-describedby={hintId}
        className={cn(
          "flex w-full cursor-grab touch-none items-center gap-1.5 rounded-t-3 border-b border-hairline px-2 text-ink-3 outline-none active:cursor-grabbing",
          "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring",
          "disabled:cursor-not-allowed",
        )}
        style={{ height: HEADER - 1 }}
      >
        <GripIcon />
        <span
          className="truncate text-[11px] font-medium text-foreground"
          title={node.label}
        >
          {node.label}
        </span>
      </button>
      {ports.map(({ port, dir }) => {
        const key = `${node.id}.${port.id}`;
        const info = graph.ports.get(key);
        const type = info?.type ?? 0;
        const color = colorOf(type);
        const isCandidate = candidates.has(key);
        const isTarget = carry?.target === key;
        const dim = carry !== null && !isCandidate && carry.from !== key;
        const plugged = wired.has(key);
        return (
          <button
            key={key}
            ref={bindPort(key)}
            type="button"
            data-port={key}
            disabled={disabled}
            aria-label={describe(key)}
            aria-describedby={hintId}
            title={`${port.label} · ${port.type}`}
            className={cn(
              "relative flex w-full cursor-pointer touch-none items-center px-2.5 text-[11px] text-ink-2 transition-opacity duration-150 outline-none",
              "focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring",
              "disabled:cursor-not-allowed",
              dir === "in" ? "justify-start" : "justify-end",
              dim && "opacity-35",
            )}
            style={{ height: ROW }}
          >
            {dir === "in" ? (
              <span
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 rounded-full border transition-opacity duration-150"
                style={{
                  width: snap * 2,
                  height: snap * 2,
                  borderColor: color,
                  background: `color-mix(in oklab, ${color} 10%, transparent)`,
                  opacity: isTarget ? 0.95 : isCandidate ? 0.45 : 0,
                }}
              />
            ) : null}
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute top-1/2 flex size-3 -translate-y-1/2 items-center justify-center",
                dir === "in"
                  ? "left-0 -translate-x-1/2"
                  : "left-full -translate-x-1/2",
              )}
            >
              <span
                className={cn(
                  "block",
                  shapeOf(type),
                  motionSafe && "transition-transform duration-150",
                  motionSafe && isTarget && "scale-125",
                )}
                style={{
                  background: plugged
                    ? color
                    : `color-mix(in oklab, ${color} 30%, var(--bg-1))`,
                  boxShadow: `0 0 0 1.5px ${color}`,
                }}
              />
            </span>
            <span className="truncate">{port.label}</span>
          </button>
        );
      })}
    </motion.div>
  );
}
