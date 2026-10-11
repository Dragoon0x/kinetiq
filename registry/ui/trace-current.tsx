"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TraceCurrentProps = {
  /** The content above the board: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How fine the board is, 0 (a sparse board of long traces) to 1 (dense and fine). @default 0.5 */
  density?: number;
  /** How fast the currents run, in dots a second. @default 6 */
  flowRate?: number;
  /** The light's hue, in degrees, at the theme's accent lightness. @default 260 */
  hue?: number;
  /** How many currents run at once, 4 to 80. @default 22 */
  currents?: number;
  /** How long a lit dot and trace keep glowing after a current passes, 0 to 1. @default 0.5 */
  trail?: number;
  /** How many of the currents answer the pointer, 0 (none) to 1 (all). @default 0.85 */
  pull?: number;
  /** How fast a pulse's front runs along the traces, in px a second. @default 520 */
  pulseSpeed?: number;
  /** The pointer reroutes the currents and a click sends a pulse. @default true */
  interactive?: boolean;
  /** Hold the currents where they are. @default false */
  paused?: boolean;
  /** Names the board for assistive technology. @default "Circuit board" */
  label?: string;
  /** Seeds the traces' layout, so two boards never match. @default 9 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when a click or a key sends a pulse, with its origin in px from the board's top-left. */
  onPulse?: (origin: { x: number; y: number }) => void;
  /** Fires when the currents start (true) or stop (false) rerouting toward the pointer or the probe. */
  onRerouteChange?: (rerouting: boolean) => void;
  /** Shows the board but takes no input. @default false */
  disabled?: boolean;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

const MAX_CURRENTS = 80;
/** Brightness levels lit traces and dots are grouped into, one path each. */
const LEVELS = 8;
/** Right, down, left, up. */
const DX = [1, 0, -1, 0] as const;
const DY = [0, 1, 0, -1] as const;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

/** A small seeded generator: the same board for the same seed. */
function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Board = {
  cols: number;
  rows: number;
  sp: number;
  ox: number;
  oy: number;
  /** Which of a dot's four sides carry a trace, as bits: right, down, left, up. */
  links: Uint8Array;
  degree: Uint8Array;
  /** Each dot's connected trace, and every trace end (a pad). */
  comp: Int32Array;
  pads: Int32Array;
  vias: Uint8Array;
  /** Lit traces (two per dot: the one to its right, the one below) and lit dots. */
  edgeLight: Float32Array;
  nodeLight: Float32Array;
  /** The walk to the sink along the traces; -1 where it cannot be reached. */
  toSink: Int16Array;
  /** The pulse's distance to every dot, in dots. */
  pulseAt: Float32Array;
  pulseMax: number;
  /** The queue a walk along the traces uses. */
  queue: Int32Array;
  /** Indices per brightness level, refilled each frame. */
  bucketE: Int32Array[];
  bucketN: Int32Array[];
  countE: Int32Array;
  countN: Int32Array;
};

type Currents = {
  from: Int32Array;
  to: Int32Array;
  prog: Float32Array;
  speed: Float32Array;
  dir: Int8Array;
  obeys: Uint8Array;
  /** 1 while running; a current fading out at a dead end counts down. */
  life: Float32Array;
};

type Paint = {
  light: string;
  trace: string;
  dot: string;
  dark: boolean;
  sprite: HTMLCanvasElement | null;
};

type Size = { w: number; h: number; dpr: number };

type Api = {
  resize: () => void;
  readColours: () => void;
  kick: () => void;
  tick: (now: number) => void;
  draw: () => void;
  stillFrame: () => void;
};

/**
 * Lays the traces: seeded walkers run straight with the odd right-angle turn,
 * most starting from a trace already laid (a T-junction), some on fresh
 * ground, stopping at the edge, at a crowded dot, or by joining another run.
 */
function layBoard(w: number, h: number, density: number, seed: number): Board {
  const sp = 30 + (13 - 30) * clamp01(density);
  const pad = sp * 0.5 + 6;
  const cols = Math.max(2, Math.floor((w - 2 * pad) / sp) + 1);
  const rows = Math.max(2, Math.floor((h - 2 * pad) / sp) + 1);
  const ox = (w - (cols - 1) * sp) / 2;
  const oy = (h - (rows - 1) * sp) / 2;
  const n = cols * rows;
  const links = new Uint8Array(n);
  const degree = new Uint8Array(n);
  const rand = lcg(seed * 7919 + cols * 31 + rows);
  const link = (a: number, b: number, d: number) => {
    links[a] = (links[a] ?? 0) | (1 << d);
    links[b] = (links[b] ?? 0) | (1 << ((d + 2) % 4));
    degree[a] = (degree[a] ?? 0) + 1;
    degree[b] = (degree[b] ?? 0) + 1;
  };
  const laid: number[] = [];
  let edges = 0;
  const target = n * 0.62;
  for (let tries = 0; edges < target && tries < n * 6; tries += 1) {
    let at: number;
    if (laid.length && rand() < 0.72) {
      at = laid[Math.floor(rand() * laid.length)] ?? 0;
      if ((degree[at] ?? 0) >= 3) continue;
    } else {
      at = Math.floor(rand() * n);
      if ((degree[at] ?? 0) > 0) continue;
    }
    let d = Math.floor(rand() * 4);
    const length = 3 + Math.floor(rand() * 11);
    for (let step = 0; step < length; step += 1) {
      if (step > 0 && rand() < 0.22) d = (d + (rand() < 0.5 ? 1 : 3)) % 4;
      const x = (at % cols) + (DX[d] ?? 0);
      const y = Math.floor(at / cols) + (DY[d] ?? 0);
      if (x < 0 || y < 0 || x >= cols || y >= rows) break;
      const next = y * cols + x;
      if ((links[at] ?? 0) & (1 << d)) break;
      if ((degree[next] ?? 0) >= 3) break;
      if ((degree[next] ?? 0) > 0) {
        // Meeting another run: sometimes join it, as a T, and stop.
        if (rand() < 0.38) {
          link(at, next, d);
          edges += 1;
        }
        break;
      }
      link(at, next, d);
      edges += 1;
      laid.push(at, next);
      at = next;
    }
  }
  // Each dot's trace, by a walk along its links.
  const comp = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let label = 0;
  for (let s = 0; s < n; s += 1) {
    if ((comp[s] ?? 0) >= 0 || !(degree[s] ?? 0)) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = s;
    comp[s] = label;
    while (head < tail) {
      const a = queue[head++] ?? 0;
      for (let d = 0; d < 4; d += 1) {
        if (!((links[a] ?? 0) & (1 << d))) continue;
        const b = a + (DX[d] ?? 0) + (DY[d] ?? 0) * cols;
        if ((comp[b] ?? 0) < 0) {
          comp[b] = label;
          queue[tail++] = b;
        }
      }
    }
    label += 1;
  }
  const pads: number[] = [];
  const vias = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    if (degree[i] === 1) pads.push(i);
    else if (degree[i] === 2 && rand() < 0.05) vias[i] = 1;
  }
  return {
    cols,
    rows,
    sp,
    ox,
    oy,
    links,
    degree,
    comp,
    pads: Int32Array.from(pads),
    vias,
    edgeLight: new Float32Array(n * 2),
    nodeLight: new Float32Array(n),
    toSink: new Int16Array(n).fill(-1),
    pulseAt: new Float32Array(n).fill(Infinity),
    pulseMax: 0,
    queue,
    bucketE: Array.from({ length: LEVELS }, () => new Int32Array(n * 2)),
    bucketN: Array.from({ length: LEVELS }, () => new Int32Array(n)),
    countE: new Int32Array(LEVELS),
    countN: new Int32Array(LEVELS),
  };
}

/** The trace between two neighbouring dots: two per dot, right and down. */
const edgeOf = (a: number, b: number) =>
  Math.abs(a - b) === 1 ? Math.min(a, b) * 2 : Math.min(a, b) * 2 + 1;

/** The props a board must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button:not([data-board]),input,select,textarea,label,summary,[role='button'],[role='link'],[role='tab'],[contenteditable='true']";

/**
 * A grid of dim dots wired like a circuit board, on one Canvas 2D layer, with
 * optional content above. Seeded walkers lay the traces — long straight runs,
 * right-angle turns, T-junctions, pads at the ends — drawn dim into a cached
 * layer. Currents of light run along them dot to dot, each lighting the dots
 * and traces it passes, which fade behind it; left alone they keep to their
 * circuits, straight on where they can.
 *
 * Bring the pointer in and a walk along the traces from the dot under it makes
 * every connected dot downhill toward it, so the currents reroute the way
 * water finds the quickest way down and gather at the hand; when it leaves
 * they fall back to their circuits. A click sends one pulse out along every
 * trace at once: each dot lights when the front, walking the traces from the
 * nearest point of its own trace, reaches it. Keyboard: arrows move a probe
 * dot to dot (the keyboard's pointer), Enter or Space pulses from it, Escape
 * lifts it. Under reduced motion the board is still, with a handful of
 * currents caught mid-flight; the probe lights its routes and a pulse lights
 * every trace at once, fading in still steps.
 */
export function TraceCurrent({
  children,
  density = 0.5,
  flowRate = 6,
  hue = 260,
  currents = 22,
  trail = 0.5,
  pull = 0.85,
  pulseSpeed = 520,
  interactive = true,
  paused = false,
  label = "Circuit board",
  seed = 9,
  dpr = 2,
  onPulse,
  onRerouteChange,
  disabled = false,
  className,
}: TraceCurrentProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const lightColour = `oklch(from var(--accent-bright) l 0.17 ${Math.round(clamp(hue, 0, 360))})`;

  const k = {
    density: clamp01(density),
    flow: clamp(flowRate, 0.5, 40),
    count: clamp(Math.round(currents), 4, MAX_CURRENTS),
    fade: 0.25 + (1.4 - 0.25) * clamp01(trail),
    pull: clamp01(pull),
    pulseSpeed: clamp(pulseSpeed, 60, 4000),
    paused,
    seed,
    dpr: clamp(dpr, 0.5, 2),
    motionSafe,
    enabled: interactive && !disabled,
  };

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const board = React.useRef<Board | null>(null);
  const layer = React.useRef<HTMLCanvasElement | null>(null);
  const paint = React.useRef<Paint>({
    light: "currentColor",
    trace: "currentColor",
    dot: "currentColor",
    dark: false,
    sprite: null,
  });
  const size = React.useRef<Size | null>(null);
  const flow = React.useRef<Currents>({
    from: new Int32Array(MAX_CURRENTS),
    to: new Int32Array(MAX_CURRENTS),
    prog: new Float32Array(MAX_CURRENTS),
    speed: new Float32Array(MAX_CURRENTS),
    dir: new Int8Array(MAX_CURRENTS),
    obeys: new Uint8Array(MAX_CURRENTS),
    life: new Float32Array(MAX_CURRENTS),
  });
  /** Runtime choices: seeded, so a board behaves the same way twice. */
  const chance = React.useRef<() => number>(() => 0);
  const sink = React.useRef({
    node: -1,
    from: "none" as "none" | "pointer" | "probe",
  });
  const probe = React.useRef(-1);
  const pulse = React.useRef({ t: -1, still: 0 });
  const frame = React.useRef(0);
  const last = React.useRef(0);
  const visible = React.useRef(false);
  const shown = React.useRef(false);
  const rerouting = React.useRef(false);
  const stillTimer = React.useRef<number | null>(null);
  const api = React.useRef<Api | null>(null);
  const report = React.useRef({ onPulse, onRerouteChange });
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  const readColours = () => {
    const carriers = carriersRef.current;
    if (!carriers) return;
    const spans = carriers.children;
    const css = (i: number) => {
      const el = spans[i];
      return el ? getComputedStyle(el).color : "currentColor";
    };
    const P = paint.current;
    P.light = css(0);
    P.trace = css(1);
    P.dot = css(2);
    // Light adds on a dark page and lays on a light one.
    const probeCanvas = document.createElement("canvas");
    probeCanvas.width = 1;
    probeCanvas.height = 1;
    const pc = probeCanvas.getContext("2d", { willReadFrequently: true });
    if (pc) {
      pc.fillStyle = css(3);
      pc.fillRect(0, 0, 1, 1);
      const d = pc.getImageData(0, 0, 1, 1).data;
      P.dark =
        0.2126 * (d[0] ?? 0) + 0.7152 * (d[1] ?? 0) + 0.0722 * (d[2] ?? 0) <
        115;
    }
    // The current's head glow, made once per colour.
    const sprite = document.createElement("canvas");
    sprite.width = 48;
    sprite.height = 48;
    const sc = sprite.getContext("2d");
    if (sc) {
      const g = sc.createRadialGradient(24, 24, 0, 24, 24, 24);
      g.addColorStop(0, P.light);
      g.addColorStop(0.3, P.light);
      g.addColorStop(1, "transparent");
      sc.fillStyle = g;
      sc.globalAlpha = 0.55;
      sc.fillRect(0, 0, 48, 48);
    }
    P.sprite = sprite;
    paintLayer();
  };

  /** The dim board, drawn once into its own layer. */
  const paintLayer = () => {
    const B = board.current;
    const S = size.current;
    if (!B || !S) return;
    if (!layer.current) layer.current = document.createElement("canvas");
    const L = layer.current;
    L.width = Math.round(S.w * S.dpr);
    L.height = Math.round(S.h * S.dpr);
    const ctx = L.getContext("2d");
    if (!ctx) return;
    const P = paint.current;
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    ctx.clearRect(0, 0, S.w, S.h);
    ctx.strokeStyle = P.trace;
    ctx.lineWidth = 1;
    ctx.lineCap = "round";
    ctx.beginPath();
    const { cols, rows, sp, ox, oy, links } = B;
    for (let i = 0; i < cols * rows; i += 1) {
      const x = ox + (i % cols) * sp;
      const y = oy + Math.floor(i / cols) * sp;
      const l = links[i] ?? 0;
      if (l & 1) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + sp, y);
      }
      if (l & 2) {
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + sp);
      }
    }
    ctx.stroke();
    ctx.fillStyle = P.dot;
    ctx.beginPath();
    for (let i = 0; i < cols * rows; i += 1) {
      const x = ox + (i % cols) * sp;
      const y = oy + Math.floor(i / cols) * sp;
      const r = (B.degree[i] ?? 0) >= 3 ? 1.6 : 1.1;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
    // Pads and vias are rings.
    ctx.strokeStyle = P.dot;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < cols * rows; i += 1) {
      if (B.degree[i] !== 1 && !B.vias[i]) continue;
      const x = ox + (i % cols) * sp;
      const y = oy + Math.floor(i / cols) * sp;
      const r = B.degree[i] === 1 ? Math.min(3, sp * 0.16) : 2.2;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.stroke();
  };

  const resize = () => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const d = Math.min(k.dpr, window.devicePixelRatio || 1);
    const was = size.current;
    if (was && was.w === w && was.h === h && was.dpr === d && board.current)
      return;
    canvas.width = Math.round(w * d);
    canvas.height = Math.round(h * d);
    size.current = { w, h, dpr: d };
    relay();
  };

  /** A fresh board for the box, density and seed; the currents start over. */
  const relay = () => {
    const S = size.current;
    if (!S) return;
    board.current = layBoard(S.w, S.h, k.density, k.seed);
    chance.current = lcg(k.seed + 101);
    sink.current = { node: -1, from: "none" };
    probe.current = -1;
    pulse.current = { t: -1, still: 0 };
    const F = flow.current;
    for (let c = 0; c < MAX_CURRENTS; c += 1) {
      F.life[c] = 0;
      if (c < k.count) spawn(c, true);
    }
    paintLayer();
    if (!k.motionSafe) stillFrame();
  };

  const nodeX = (B: Board, i: number) => B.ox + (i % B.cols) * B.sp;
  const nodeY = (B: Board, i: number) => B.oy + Math.floor(i / B.cols) * B.sp;

  /** A current starts at a pad (or, failing that, any trace) heading along its trace. */
  const spawn = (c: number, scatter = false) => {
    const B = board.current;
    const F = flow.current;
    if (!B) return;
    const rand = chance.current;
    let at = -1;
    if (B.pads.length) at = B.pads[Math.floor(rand() * B.pads.length)] ?? -1;
    if (at < 0) {
      for (let t = 0; t < 40 && at < 0; t += 1) {
        const i = Math.floor(rand() * B.degree.length);
        if ((B.degree[i] ?? 0) > 0) at = i;
      }
    }
    if (at < 0) {
      F.life[c] = 0;
      return;
    }
    // Away from the hand when there is one: a stream needs a far source.
    const S = sink.current.node;
    if (S >= 0 && B.comp[at] === B.comp[S] && B.pads.length > 2) {
      for (let t = 0; t < 6; t += 1) {
        const p = B.pads[Math.floor(rand() * B.pads.length)] ?? at;
        if ((B.toSink[p] ?? -1) > (B.toSink[at] ?? -1)) at = p;
      }
    }
    let d = 0;
    for (let t = 0; t < 4; t += 1) {
      if ((B.links[at] ?? 0) & (1 << t)) d = t;
    }
    F.from[c] = at;
    F.to[c] = at + (DX[d] ?? 0) + (DY[d] ?? 0) * B.cols;
    F.dir[c] = d;
    F.prog[c] = scatter ? rand() : 0;
    F.speed[c] = 0.8 + rand() * 0.4;
    F.obeys[c] = rand() < k.pull ? 1 : 0;
    F.life[c] = 1;
  };

  /** At a dot: downhill to the sink if it answers one, else on along its circuit. */
  const choose = (c: number) => {
    const B = board.current;
    const F = flow.current;
    if (!B) return;
    const at = F.to[c] ?? 0;
    const came = F.dir[c] ?? 0;
    const back = (came + 2) % 4;
    const l = B.links[at] ?? 0;
    const rand = chance.current;
    const S = sink.current.node;
    const toSink = B.toSink;
    if (S >= 0 && F.obeys[c] && (toSink[at] ?? -1) >= 0) {
      if (at === S) {
        spawn(c);
        return;
      }
      let best = -1;
      let bestD = toSink[at] ?? 0;
      for (let t = 0; t < 4; t += 1) {
        const d = (came + t) % 4;
        if (!(l & (1 << d))) continue;
        const b = at + (DX[d] ?? 0) + (DY[d] ?? 0) * B.cols;
        const v = toSink[b] ?? -1;
        if (v >= 0 && v < bestD) {
          bestD = v;
          best = d;
        }
      }
      if (best >= 0) {
        go(c, at, best);
        return;
      }
    }
    // On its circuit: straight on where it can, otherwise any way but back.
    if (l & (1 << came) && rand() < 0.72) {
      go(c, at, came);
      return;
    }
    const ways: number[] = [];
    for (let d = 0; d < 4; d += 1) if (d !== back && l & (1 << d)) ways.push(d);
    if (!ways.length) {
      // A pad: the current fades out here, and another starts elsewhere.
      F.life[c] = 0.999;
      return;
    }
    go(c, at, ways[Math.floor(rand() * ways.length)] ?? came);
  };

  const go = (c: number, at: number, d: number) => {
    const B = board.current;
    const F = flow.current;
    if (!B) return;
    F.from[c] = at;
    F.to[c] = at + (DX[d] ?? 0) + (DY[d] ?? 0) * B.cols;
    F.dir[c] = d;
  };

  /** The walk along the traces to the sink, for every dot on its trace. */
  const walkToSink = () => {
    const B = board.current;
    if (!B) return;
    B.toSink.fill(-1);
    const S = sink.current.node;
    if (S < 0) return;
    const q = B.queue;
    let head = 0;
    let tail = 0;
    q[tail++] = S;
    B.toSink[S] = 0;
    while (head < tail) {
      const a = q[head++] ?? 0;
      const l = B.links[a] ?? 0;
      for (let d = 0; d < 4; d += 1) {
        if (!(l & (1 << d))) continue;
        const b = a + (DX[d] ?? 0) + (DY[d] ?? 0) * B.cols;
        if ((B.toSink[b] ?? 0) < 0) {
          B.toSink[b] = (B.toSink[a] ?? 0) + 1;
          q[tail++] = b;
        }
      }
    }
  };

  /** The traced dot nearest a point, within a few dots of it. */
  const nearestTraced = (x: number, y: number) => {
    const B = board.current;
    if (!B) return -1;
    const cx = Math.round((x - B.ox) / B.sp);
    const cy = Math.round((y - B.oy) / B.sp);
    let best = -1;
    let bestD = Infinity;
    for (let r = 0; r <= 3 && best < 0; r += 1) {
      for (let j = cy - r; j <= cy + r; j += 1) {
        for (let i = cx - r; i <= cx + r; i += 1) {
          if (i < 0 || j < 0 || i >= B.cols || j >= B.rows) continue;
          const n = j * B.cols + i;
          if (!(B.degree[n] ?? 0)) continue;
          const d = (i * B.sp + B.ox - x) ** 2 + (j * B.sp + B.oy - y) ** 2;
          if (d < bestD) {
            bestD = d;
            best = n;
          }
        }
      }
    }
    return best;
  };

  const setSink = (node: number, from: "none" | "pointer" | "probe") => {
    const was = sink.current.node;
    sink.current = { node, from };
    if (was !== node) walkToSink();
    const now = node >= 0;
    if (now !== rerouting.current) {
      rerouting.current = now;
      report.current.onRerouteChange?.(now);
    }
    if (!k.motionSafe) stillFrame();
    kick();
  };

  /**
   * A pulse from a point: every trace's dots get their walk from the point
   * nearest them on that trace, plus the straight distance to it; loose dots
   * just the straight distance.
   */
  const sendPulse = (x: number, y: number) => {
    const B = board.current;
    if (!B) return;
    const n = B.degree.length;
    // The dot of each trace nearest the point, and how far it is.
    const nearest = new Map<number, { node: number; d: number }>();
    const at = B.pulseAt;
    let max = 0;
    for (let i = 0; i < n; i += 1) {
      const d = Math.hypot(nodeX(B, i) - x, nodeY(B, i) - y) / B.sp;
      const c = B.comp[i] ?? -1;
      if (c < 0) {
        at[i] = d;
        max = Math.max(max, d);
        continue;
      }
      at[i] = Infinity;
      const held = nearest.get(c);
      if (!held || d < held.d) nearest.set(c, { node: i, d });
    }
    const q = B.queue;
    for (const start of nearest.values()) {
      let head = 0;
      let tail = 0;
      q[tail++] = start.node;
      at[start.node] = start.d;
      while (head < tail) {
        const a = q[head++] ?? 0;
        const l = B.links[a] ?? 0;
        max = Math.max(max, at[a] ?? 0);
        for (let d = 0; d < 4; d += 1) {
          if (!(l & (1 << d))) continue;
          const b = a + (DX[d] ?? 0) + (DY[d] ?? 0) * B.cols;
          if ((at[b] ?? 0) === Infinity) {
            at[b] = (at[a] ?? 0) + 1;
            q[tail++] = b;
          }
        }
      }
    }
    B.pulseMax = max;
    report.current.onPulse?.({ x: Math.round(x), y: Math.round(y) });
    if (!k.motionSafe) {
      pulse.current = { t: -1, still: 1 };
      stillPulse();
      return;
    }
    pulse.current = { t: 0, still: 0 };
    kick();
  };

  /** Reduced motion: every trace lights at once, then fades in still steps. */
  const stillPulse = () => {
    if (stillTimer.current !== null) window.clearTimeout(stillTimer.current);
    stillFrame();
    stillTimer.current = window.setTimeout(
      () => {
        stillTimer.current = null;
        const p = pulse.current;
        p.still = p.still > 0.5 ? 0.55 : p.still > 0.3 ? 0.25 : 0;
        if (p.still > 0) stillPulse();
        else stillFrame();
      },
      Math.round(durations.page * 1000 * 0.6),
    );
  };

  /** Advances the currents, the fades and the pulse; says whether anything moves. */
  const advance = (dt: number): boolean => {
    const B = board.current;
    const F = flow.current;
    if (!B) return false;
    const live = !k.paused;
    const decay = Math.exp(-dt / k.fade);
    let lit = false;
    for (let i = 0; i < B.edgeLight.length; i += 1) {
      const v = (B.edgeLight[i] ?? 0) * decay;
      B.edgeLight[i] = v < 0.01 ? 0 : v;
      if (v >= 0.01) lit = true;
    }
    for (let i = 0; i < B.nodeLight.length; i += 1) {
      const v = (B.nodeLight[i] ?? 0) * decay;
      B.nodeLight[i] = v < 0.01 ? 0 : v;
    }
    if (live) {
      for (let c = 0; c < k.count; c += 1) {
        const life = F.life[c] ?? 0;
        if (life <= 0) {
          spawn(c);
          continue;
        }
        if (life < 1) {
          // Fading out at a pad.
          F.life[c] = life - dt * 4;
          if ((F.life[c] ?? 0) <= 0) spawn(c);
          continue;
        }
        let p = (F.prog[c] ?? 0) + dt * k.flow * (F.speed[c] ?? 1);
        let hops = 0;
        while (p >= 1 && hops < 4) {
          p -= 1;
          hops += 1;
          const a = F.from[c] ?? 0;
          const b = F.to[c] ?? 0;
          B.edgeLight[edgeOf(a, b)] = 1;
          B.nodeLight[b] = 1;
          choose(c);
          if ((F.life[c] ?? 0) < 1) break;
        }
        F.prog[c] = Math.min(p, 0.999);
      }
    }
    let pulsing = false;
    const P = pulse.current;
    if (P.t >= 0) {
      P.t += dt;
      const front = (P.t * k.pulseSpeed) / B.sp;
      if (front > B.pulseMax + 8) P.t = -1;
      else pulsing = true;
    }
    return live || lit || pulsing;
  };

  /** A pulse's light at a dot `ago` dots behind the front. */
  const shape = (ago: number) =>
    ago < 0 || ago > 7 ? 0 : Math.exp(-ago / 1.3);

  const draw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const B = board.current;
    const S = size.current;
    const P = paint.current;
    const F = flow.current;
    if (!canvas || !ctx || !B || !S || !visible.current) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (layer.current) ctx.drawImage(layer.current, 0, 0);
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    const pl = pulse.current;
    const front = pl.t >= 0 ? (pl.t * k.pulseSpeed) / B.sp : -1;
    const still = pl.still;
    const { cols, sp, ox, oy } = B;
    const n = cols * B.rows;
    B.countE.fill(0);
    B.countN.fill(0);
    for (let i = 0; i < n; i += 1) {
      const l = B.links[i] ?? 0;
      if (!l) continue;
      const at = B.pulseAt[i] ?? Infinity;
      for (let side = 0; side < 2; side += 1) {
        if (!(l & (side === 0 ? 1 : 2))) continue;
        const e = i * 2 + side;
        const other = side === 0 ? i + 1 : i + cols;
        let b = B.edgeLight[e] ?? 0;
        if (front >= 0)
          b = Math.max(
            b,
            0.85 *
              shape(front - Math.min(at, B.pulseAt[other] ?? Infinity) - 0.5),
          );
        if (still > 0 && at !== Infinity) b = Math.max(b, still);
        if (b < 0.06) continue;
        const lv = Math.min(LEVELS - 1, Math.floor(b * LEVELS));
        const bucket = B.bucketE[lv];
        if (!bucket) continue;
        bucket[B.countE[lv] ?? 0] = e;
        B.countE[lv] = (B.countE[lv] ?? 0) + 1;
      }
    }
    for (let i = 0; i < n; i += 1) {
      let b = B.nodeLight[i] ?? 0;
      const at = B.pulseAt[i] ?? Infinity;
      if (front >= 0) b = Math.max(b, shape(front - at));
      if (still > 0 && at !== Infinity && (B.degree[i] ?? 0) > 0)
        b = Math.max(b, still);
      if (b < 0.06) continue;
      const lv = Math.min(LEVELS - 1, Math.floor(b * LEVELS));
      const bucket = B.bucketN[lv];
      if (!bucket) continue;
      bucket[B.countN[lv] ?? 0] = i;
      B.countN[lv] = (B.countN[lv] ?? 0) + 1;
    }
    ctx.globalCompositeOperation = P.dark ? "lighter" : "source-over";
    ctx.strokeStyle = P.light;
    ctx.fillStyle = P.light;
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    for (let lv = 0; lv < LEVELS; lv += 1) {
      const count = B.countE[lv] ?? 0;
      const bucket = B.bucketE[lv];
      if (!count || !bucket) continue;
      ctx.globalAlpha = (lv + 1) / LEVELS;
      ctx.beginPath();
      for (let m = 0; m < count; m += 1) {
        const e = bucket[m] ?? 0;
        const i = e >> 1;
        const x = ox + (i % cols) * sp;
        const y = oy + Math.floor(i / cols) * sp;
        ctx.moveTo(x, y);
        if (e & 1) ctx.lineTo(x, y + sp);
        else ctx.lineTo(x + sp, y);
      }
      ctx.stroke();
    }
    const dotR = Math.min(2.2, sp * 0.12 + 0.6);
    for (let lv = 0; lv < LEVELS; lv += 1) {
      const count = B.countN[lv] ?? 0;
      const bucket = B.bucketN[lv];
      if (!count || !bucket) continue;
      ctx.globalAlpha = (lv + 1) / LEVELS;
      ctx.beginPath();
      for (let m = 0; m < count; m += 1) {
        const i = bucket[m] ?? 0;
        const x = ox + (i % cols) * sp;
        const y = oy + Math.floor(i / cols) * sp;
        ctx.moveTo(x + dotR, y);
        ctx.arc(x, y, dotR, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    // The currents' heads: the stretch of trace behind each, and its glow.
    if (k.motionSafe) {
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let c = 0; c < k.count; c += 1) {
        if ((F.life[c] ?? 0) < 1) continue;
        const a = F.from[c] ?? 0;
        const b = F.to[c] ?? 0;
        const t = F.prog[c] ?? 0;
        const ax = nodeX(B, a);
        const ay = nodeY(B, a);
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + (nodeX(B, b) - ax) * t, ay + (nodeY(B, b) - ay) * t);
      }
      ctx.stroke();
      const sprite = P.sprite;
      if (sprite) {
        // On a light page a glow is a tint, so it is kept small and faint.
        const r = Math.max(6, sp * 0.42) * (P.dark ? 1 : 0.7);
        for (let c = 0; c < k.count; c += 1) {
          const life = F.life[c] ?? 0;
          if (life <= 0) continue;
          const a = F.from[c] ?? 0;
          const b = F.to[c] ?? 0;
          const t = life < 1 ? 1 : (F.prog[c] ?? 0);
          const x = nodeX(B, a) + (nodeX(B, b) - nodeX(B, a)) * t;
          const y = nodeY(B, a) + (nodeY(B, b) - nodeY(B, a)) * t;
          ctx.globalAlpha = Math.min(1, life) * (P.dark ? 1 : 0.6);
          ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
        }
      }
    }
    ctx.globalCompositeOperation = "source-over";
    // The sink, and the keyboard's probe.
    const Sn = sink.current.node;
    if (Sn >= 0) {
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = P.light;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(
        nodeX(B, Sn),
        nodeY(B, Sn),
        Math.max(5, sp * 0.36),
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    if (probe.current >= 0) {
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = P.light;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      const pr = probe.current;
      ctx.arc(
        nodeX(B, pr),
        nodeY(B, pr),
        Math.max(7, sp * 0.48),
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
    if (!shown.current) {
      shown.current = true;
      rootRef.current?.setAttribute("data-live", "");
    }
  };

  /**
   * Reduced motion's still board: a handful of currents caught mid-flight,
   * each a short run of lit trace fading behind its head; with a sink, the
   * routes that lead to it.
   */
  const stillFrame = () => {
    const B = board.current;
    if (!B) return;
    B.edgeLight.fill(0);
    B.nodeLight.fill(0);
    const rand = lcg(k.seed + 7);
    const runs = Math.ceil(k.count / 2);
    const S = sink.current.node;
    for (let r = 0; r < runs && B.pads.length; r += 1) {
      let at = B.pads[Math.floor(rand() * B.pads.length)] ?? 0;
      let came = -1;
      const length = S >= 0 ? 400 : 3 + Math.floor(rand() * 4);
      for (let step = 0; step < length; step += 1) {
        const l = B.links[at] ?? 0;
        let d = -1;
        if (S >= 0 && (B.toSink[at] ?? -1) > 0) {
          for (let t = 0; t < 4; t += 1) {
            if (!(l & (1 << t))) continue;
            const b = at + (DX[t] ?? 0) + (DY[t] ?? 0) * B.cols;
            if (
              (B.toSink[b] ?? -1) >= 0 &&
              (B.toSink[b] ?? 0) < (B.toSink[at] ?? 0)
            )
              d = t;
          }
        } else if (S < 0) {
          for (let t = 0; t < 4; t += 1) {
            if (t !== (came + 2) % 4 && l & (1 << t)) d = t;
          }
        }
        if (d < 0) break;
        const b = at + (DX[d] ?? 0) + (DY[d] ?? 0) * B.cols;
        const glow = S >= 0 ? 0.7 : 0.3 + (0.7 * (step + 1)) / length;
        B.edgeLight[edgeOf(at, b)] = Math.max(
          B.edgeLight[edgeOf(at, b)] ?? 0,
          glow,
        );
        B.nodeLight[b] = Math.max(B.nodeLight[b] ?? 0, glow);
        came = d;
        at = b;
      }
    }
    draw();
  };

  const tick = (now: number) => {
    frame.current = 0;
    if (!visible.current || document.hidden) {
      last.current = 0;
      return;
    }
    const dt = last.current
      ? Math.min(0.05, (now - last.current) / 1000)
      : 1 / 60;
    last.current = now;
    const moving = advance(dt);
    draw();
    if (moving) frame.current = window.requestAnimationFrame(loop);
    else last.current = 0;
  };

  const kick = () => {
    if (!visible.current || document.hidden) return;
    if (!k.motionSafe) {
      draw();
      return;
    }
    if (frame.current) return;
    frame.current = window.requestAnimationFrame(loop);
  };

  React.useLayoutEffect(() => {
    api.current = { resize, readColours, kick, tick, draw, stillFrame };
    report.current = { onPulse, onRerouteChange };
  });

  // A new density or seed lays a new board.
  React.useEffect(() => {
    const S = size.current;
    if (!S) return;
    size.current = null;
    api.current?.resize();
    api.current?.readColours();
    api.current?.kick();
  }, [k.density, k.seed]);

  React.useEffect(() => {
    api.current?.readColours();
    api.current?.kick();
  }, [lightColour]);

  React.useEffect(() => {
    size.current = null;
    api.current?.resize();
    api.current?.readColours();
    api.current?.kick();
  }, [k.dpr]);

  React.useEffect(() => {
    if (motionSafe) api.current?.kick();
    else api.current?.stillFrame();
  }, [k.count, k.flow, k.fade, paused, motionSafe]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) api.current?.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const pending = frame;
    const timer = stillTimer;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (pending.current) window.cancelAnimationFrame(pending.current);
      pending.current = 0;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      api.current?.resize();
      if (!paint.current.sprite) api.current?.readColours();
      api.current?.kick();
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) api.current?.kick();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  const fromContent = (target: EventTarget) => {
    const el = target instanceof Element ? target : null;
    const hit = el?.closest(INTERACTIVE);
    return Boolean(hit && rootRef.current?.contains(hit));
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!k.enabled || probe.current >= 0) return;
    const at = local(event.clientX, event.clientY);
    const node = nearestTraced(at.x, at.y);
    if (node !== sink.current.node)
      setSink(node, node >= 0 ? "pointer" : "none");
  };

  const onPointerLeave = () => {
    if (sink.current.from === "pointer") setSink(-1, "none");
  };

  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!k.enabled || event.detail === 0 || fromContent(event.target)) return;
    const at = local(event.clientX, event.clientY);
    sendPulse(at.x, at.y);
    setSaid((s) => ({ n: s.n + 1, text: "Pulse sent." }));
  };

  const centreNode = () => {
    const B = board.current;
    if (!B) return -1;
    return Math.floor(B.rows / 2) * B.cols + Math.floor(B.cols / 2);
  };

  const moveProbe = (node: number) => {
    probe.current = node;
    const B = board.current;
    if (!B) return;
    // The probe pulls the currents to the nearest traced dot.
    const traced =
      (B.degree[node] ?? 0) > 0
        ? node
        : nearestTraced(nodeX(B, node), nodeY(B, node));
    setSink(traced, traced >= 0 ? "probe" : "none");
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!k.enabled) return;
    const B = board.current;
    if (!B) return;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      const from = probe.current >= 0 ? probe.current : centreNode();
      const x = clamp((from % B.cols) + move[0], 0, B.cols - 1);
      const y = clamp(Math.floor(from / B.cols) + move[1], 0, B.rows - 1);
      moveProbe(y * B.cols + x);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (event.repeat) return;
      const at = probe.current >= 0 ? probe.current : centreNode();
      sendPulse(nodeX(B, at), nodeY(B, at));
      setSaid((s) => ({ n: s.n + 1, text: "Pulse sent." }));
      return;
    }
    if (event.key === "Escape" && probe.current >= 0) {
      event.preventDefault();
      probe.current = -1;
      setSink(-1, "none");
      setSaid((s) => ({ n: s.n + 1, text: "Probe lifted." }));
    }
  };

  const onFocus = (event: React.FocusEvent<HTMLButtonElement>) => {
    if (!k.enabled || !event.currentTarget.matches(":focus-visible")) return;
    if (probe.current < 0) moveProbe(centreNode());
  };

  const onBlur = () => {
    if (probe.current < 0) return;
    probe.current = -1;
    setSink(-1, "none");
  };

  const carriers = [
    lightColour,
    "color-mix(in oklab, var(--foreground) 15%, transparent)",
    "color-mix(in oklab, var(--foreground) 32%, transparent)",
    "var(--background)",
  ];

  return (
    <div
      ref={bindRoot}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerLeave}
      onClick={onClick}
      className={cn(
        "group/trace-current relative isolate h-full w-full touch-manipulation overflow-clip",
        k.enabled && "cursor-crosshair",
        className,
      )}
    >
      <StandIn seed={seed} density={k.density} />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => {
          api.current?.readColours();
          api.current?.kick();
        }}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {carriers.map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
      <button
        type="button"
        data-board=""
        aria-label={label}
        aria-describedby={hintId}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        className="absolute inset-0 z-0 size-full cursor-[inherit] rounded-[inherit] outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
      />
      <div className="pointer-events-none relative z-10 size-full *:pointer-events-auto">
        {children}
      </div>
      <p id={hintId} className="sr-only">
        Move the pointer over the board and the currents run to it; click to
        send a pulse along every trace. Arrow keys move a probe, Enter or Space
        sends a pulse from it, Escape lifts it.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/**
 * The designed still for the server render and the first paint: the dot grid
 * at the board's spacing, as a repeating radial gradient, faded at its edges.
 */
function StandIn({ seed, density }: { seed: number; density: number }) {
  const sp = Math.round(30 + (13 - 30) * density);
  const shift = Math.round(lcg(seed)() * sp);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 transition-[opacity,visibility] duration-300 group-data-live/trace-current:invisible group-data-live/trace-current:opacity-0"
      style={{
        backgroundImage:
          "radial-gradient(circle, color-mix(in oklab, var(--foreground) 32%, transparent) 1.1px, transparent 1.6px)",
        backgroundSize: `${sp}px ${sp}px`,
        backgroundPosition: `${shift}px ${Math.round(sp / 2)}px`,
        maskImage:
          "radial-gradient(ellipse at center, black 60%, transparent 100%)",
      }}
    />
  );
}
