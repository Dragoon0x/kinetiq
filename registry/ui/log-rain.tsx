"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LogRainLine = {
  /** A timestamp, shown muted before the source. */
  time?: string;
  /** Where the line came from: a service, a job, a host. */
  source: string;
  /** The message itself. */
  text: string;
  /** Colours the source: info in ink, warn and error in their tokens. @default "info" */
  level?: "info" | "warn" | "error";
};

export type LogRainProps = {
  /** The log lines the columns become when they stop. Plain strings are shown as they are. */
  lines?: readonly (string | LogRainLine)[];
  /** How many depths rain, nearest first: 1 to 3. @default 3 */
  layers?: number;
  /** How fast the rain falls, 0 (held) to 3. @default 1 */
  fallSpeed?: number;
  /** The rain's hue in degrees, at the accent token's own lightness and chroma, so it suits both themes. @default 250 */
  hue?: number;
  /** The characters the rain is made of. @default "0123456789abcdef{}[]<>/:=._-+*#" */
  glyphs?: string;
  /** The share of columns that rain, 0 to 1. @default 0.7 */
  density?: number;
  /** Glyph size of the nearest depth in px (9 to 22); the others scale from it. @default 14 */
  size?: number;
  /** How long the trails run, 0 to 1. @default 0.5 */
  trail?: number;
  /** How long a line stays readable after the pointer leaves, in ms. @default 700 */
  dwell?: number;
  /** Colour a line's source by its level. @default true */
  levelColors?: boolean;
  /** Hover, tap and arrow keys stop a column to read it. @default true */
  interactive?: boolean;
  /** Hold the rain where it is. @default false */
  paused?: boolean;
  /** Seeds the columns, their speeds and lengths. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires with the index of the line that tipped in, and with null when it tips back. */
  onLineChange?: (index: number | null) => void;
  /** The field's accessible name. @default "Live log" */
  label?: string;
  /** Sizes and shapes the box. @default "h-96 w-full" */
  className?: string;
};

export const defaultLogRainLines: readonly LogRainLine[] = [
  {
    time: "07:42:18",
    source: "gaugeworks",
    text: "deploy api@4.12.0 · 3 of 3 healthy",
  },
  {
    time: "07:42:31",
    source: "fieldline",
    text: "sync 1,204 records · 0 conflicts",
  },
  {
    time: "07:43:02",
    source: "basinworks",
    text: "nightly backup · 18.4 GB verified",
  },
  {
    time: "07:43:40",
    source: "coldbrook",
    text: "ledger close · balanced to the cent",
  },
  {
    time: "07:44:05",
    source: "waylight",
    text: "cache purge /assets/* · 212 ms",
  },
  { time: "07:44:47", source: "fernworks", text: "build 2281 passed in 48 s" },
  {
    time: "07:45:12",
    source: "gaugeworks",
    text: "cpu 82% on web-3 · scaling out",
    level: "warn",
  },
  {
    time: "07:45:30",
    source: "fieldline",
    text: "webhook retry 3/5 · upstream 503",
    level: "error",
  },
  { time: "07:46:01", source: "gaugeworks", text: "web-4 joined · load 41%" },
  { time: "07:46:22", source: "basinworks", text: "snapshot pruned · 7 kept" },
];

const DEFAULT_GLYPHS = "0123456789abcdef{}[]<>/:=._-+*#";

/** Far, mid, near: size, ink strength, speed. */
const DEPTHS = [
  { scale: 0.55, alpha: 0.28, speed: 0.45 },
  { scale: 0.75, alpha: 0.52, speed: 0.7 },
  { scale: 1, alpha: 0.92, speed: 1 },
] as const;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const lineText = (line: string | LogRainLine) =>
  typeof line === "string"
    ? line
    : [line.time, line.source, line.text].filter(Boolean).join(" ");

type Ink = 0 | 1 | 2 | 3 | 4 | 5 | 6;
const RAIN: Ink = 0;
const HEAD: Ink = 1;
const TIME: Ink = 2;
const TEXT: Ink = 3;
const INFO: Ink = 4;
const WARN: Ink = 5;
const DANGER: Ink = 6;

type Layer = {
  size: number;
  alpha: number;
  speed: number;
  cols: number;
  rows: number;
  cw: number;
  ch: number;
  cwD: number;
  chD: number;
  x0: number;
  /** Atlas rows: rain ink, head ink. */
  atlasY: number;
  head: Float32Array;
  vel: Float32Array;
  len: Float32Array;
  on: Uint8Array;
  /** 1 falling, 0 halted; climbs back under gravity after a line tips back. */
  hold: Float32Array;
  glyph: Uint16Array;
};

type Tip = {
  col: number;
  line: number;
  /** Progress: 0 standing as a column, 1 lying flat as a line. */
  p: number;
  v: number;
  target: 0 | 1;
  chars: string[];
  inks: Ink[];
  /** Pivot, px. */
  px: number;
  py: number;
  /** Destination offsets from the pivot, px. */
  dx: Float32Array;
  dy: Float32Array;
  /** Source offsets from the pivot (down the column), px. */
  sy: Float32Array;
  /** The rain glyph each character shows before it turns. */
  rain: Uint16Array;
  /** When each character turns, in progress. */
  turn: Float32Array;
  plate: { x: number; y: number; w: number; h: number };
  /** Reduced motion: a crossfade clock instead of a swing. */
  fade: number;
  /** The column halts before it swings, s. */
  delay: number;
};

type Config = {
  lines: readonly (string | LogRainLine)[];
  layers: number;
  fallSpeed: number;
  glyphs: string;
  density: number;
  size: number;
  trail: number;
  dwell: number;
  levelColors: boolean;
  interactive: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  hueKey: string;
  motionSafe: boolean;
};

type Engine = {
  configure: (c: Config) => void;
  resize: () => void;
  readColours: () => void;
  refont: () => void;
  wake: () => void;
  hover: (x: number, y: number) => void;
  leave: () => void;
  tap: (x: number, y: number) => void;
  step: (dir: number | "home" | "end") => void;
  release: () => void;
  dispose: () => void;
};

const STEP = 1 / 120;

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLSpanElement[],
  visible: React.RefObject<boolean>,
  report: React.RefObject<(line: number | null) => void>,
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let layers: Layer[] = [];
  let atlas: HTMLCanvasElement | null = null;
  let glyphList: string[] = [];
  let inks: string[] = [];
  let plateInk = "transparent";
  let edgeInk = "transparent";
  let family = "ui-monospace, monospace";
  let frame = 0;
  let last = 0;
  let disposed = false;
  let w = 0;
  let h = 0;
  let dpr = 1;
  let rand = lcg(1);
  const tips: Tip[] = [];
  let active: Tip | null = null;
  let leaveAt = 0;
  let shown: number | null = null;

  const near = () => layers[layers.length - 1] ?? null;

  const readColours = () => {
    inks = carriers.slice(0, 7).map((el) => getComputedStyle(el).color);
    plateInk = carriers[7] ? getComputedStyle(carriers[7]).color : plateInk;
    edgeInk = carriers[8] ? getComputedStyle(carriers[8]).color : edgeInk;
    family = getComputedStyle(canvas).fontFamily || family;
    buildAtlas();
  };

  /** One strip per depth: every glyph in the rain ink, then in the head ink. */
  const buildAtlas = () => {
    if (!layers.length || !ctx) return;
    const a = atlas ?? document.createElement("canvas");
    const widest = Math.max(...layers.map((l) => l.cwD));
    a.width = Math.max(1, glyphList.length * widest);
    a.height = Math.max(
      1,
      layers.reduce((s, l) => s + l.chD * 2, 0),
    );
    const actx = a.getContext("2d");
    if (!actx) return;
    actx.clearRect(0, 0, a.width, a.height);
    actx.textAlign = "center";
    actx.textBaseline = "middle";
    let y = 0;
    for (const l of layers) {
      l.atlasY = y;
      actx.font = `500 ${Math.round(l.size * dpr)}px ${family}`;
      [RAIN, HEAD].forEach((ink, row) => {
        actx.fillStyle = inks[ink] ?? "currentColor";
        glyphList.forEach((ch, i) => {
          actx.fillText(ch, i * l.cwD + l.cwD / 2, y + row * l.chD + l.chD / 2);
        });
      });
      y += l.chD * 2;
    }
    atlas = a;
  };

  const respawn = (l: Layer, c: number, fresh: boolean) => {
    const cf = cfg;
    if (!cf) return;
    const t = clamp(cf.trail, 0, 1);
    l.len[c] = Math.round(5 + rand() * (8 + 22 * t));
    l.vel[c] = (5 + rand() * 7) * l.speed;
    l.on[c] = rand() < clamp(cf.density, 0, 1) ? 1 : 0;
    l.head[c] = fresh
      ? rand() * (l.rows + (l.len[c] ?? 0))
      : -rand() * l.rows * 0.4;
    for (let r = 0; r < l.rows; r += 1) {
      l.glyph[r * l.cols + c] = Math.floor(rand() * glyphList.length);
    }
  };

  const layout = () => {
    const c = cfg;
    if (!c || !ctx) return;
    w = root.clientWidth;
    h = root.clientHeight;
    if (w < 1 || h < 1) return;
    dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    glyphList = Array.from(c.glyphs || DEFAULT_GLYPHS).filter((g) => g !== " ");
    if (!glyphList.length) glyphList = Array.from(DEFAULT_GLYPHS);
    rand = lcg(c.seed * 53 + 11);
    const count = clamp(Math.round(c.layers), 1, 3);
    const base = clamp(c.size, 9, 22);
    layers = DEPTHS.slice(3 - count).map((d) => {
      const size = Math.max(6, base * d.scale);
      ctx.font = `500 ${size}px ${family}`;
      const advance = Math.max(size * 0.6, ctx.measureText("0").width);
      // Columns sit a little apart so a column reads as a column.
      const cwD = Math.max(3, Math.round(advance * 1.35 * dpr));
      const chD = Math.max(5, Math.round(size * 1.18 * dpr));
      const cw = cwD / dpr;
      const ch = chD / dpr;
      const cols = Math.max(1, Math.floor(w / cw));
      const rows = Math.max(1, Math.ceil(h / ch) + 1);
      const l: Layer = {
        size,
        alpha: d.alpha,
        speed: d.speed,
        cols,
        rows,
        cw,
        ch,
        cwD,
        chD,
        x0: (w - cols * cw) / 2,
        atlasY: 0,
        head: new Float32Array(cols),
        vel: new Float32Array(cols),
        len: new Float32Array(cols),
        on: new Uint8Array(cols),
        hold: new Float32Array(cols).fill(1),
        glyph: new Uint16Array(cols * rows),
      };
      for (let i = 0; i < cols; i += 1) respawn(l, i, true);
      return l;
    });
    tips.length = 0;
    if (active) setActive(null);
    buildAtlas();
  };

  const setActive = (tip: Tip | null) => {
    active = tip;
    const line = tip ? tip.line : null;
    if (line !== shown) {
      shown = line;
      report.current(line);
    }
  };

  /** Lays a column's line out flat, wrapped, beside where it stood. */
  const makeTip = (col: number, pivotY: number): Tip | null => {
    const c = cfg;
    const l = near();
    if (!c || !l || !c.lines.length) return null;
    const index = col % c.lines.length;
    const entry = c.lines[index];
    if (entry === undefined) return null;
    // Characters and their inks, segment by segment.
    const chars: string[] = [];
    const tags: Ink[] = [];
    const push = (text: string, ink: Ink) => {
      for (const ch of Array.from(text)) {
        chars.push(ch);
        tags.push(ink);
      }
    };
    if (typeof entry === "string") push(entry, TEXT);
    else {
      if (entry.time) push(`${entry.time} `, TIME);
      const ink: Ink =
        c.levelColors && entry.level === "warn"
          ? WARN
          : c.levelColors && entry.level === "error"
            ? DANGER
            : INFO;
      push(entry.source, ink);
      push(` ${entry.text}`, TEXT);
    }
    // Wrap at spaces into up to three rows. A line is set at the glyph's own
    // advance, tighter than the rain's spaced columns.
    const pad = 12;
    const charW = l.cwD / dpr / 1.35;
    const maxCols = Math.max(4, Math.floor((w - pad * 2 - 12) / charW));
    const rowsOut: { chars: string[]; inks: Ink[] }[] = [];
    let i = 0;
    while (i < chars.length && rowsOut.length < 3) {
      let end = Math.min(chars.length, i + maxCols);
      if (end < chars.length) {
        let cut = end;
        while (cut > i && chars[cut] !== " ") cut -= 1;
        if (cut > i) end = cut;
      }
      let rowChars = chars.slice(i, end);
      let rowInks = tags.slice(i, end);
      if (rowsOut.length === 2 && end < chars.length) {
        rowChars = rowChars.slice(0, maxCols - 1).concat("…");
        rowInks = rowInks.slice(0, maxCols - 1).concat(TEXT);
      }
      rowsOut.push({ chars: rowChars, inks: rowInks });
      i = end;
      while (chars[i] === " ") i += 1;
    }
    const widest = Math.max(...rowsOut.map((r) => r.chars.length));
    const colX = l.x0 + (col + 0.5) * l.cw;
    const rel = clamp((colX - pad) / Math.max(1, w - pad * 2), 0, 1);
    const kpCol = Math.min(widest - 1, Math.round(rel * (widest - 1)));
    const blockW = widest * charW;
    const x0 = clamp(
      colX - kpCol * charW - charW / 2,
      pad,
      Math.max(pad, w - pad - blockW),
    );
    const rowH = l.ch;
    const firstRow = clamp(
      Math.round(pivotY / rowH - 0.5),
      1,
      Math.max(1, Math.floor(h / rowH) - rowsOut.length - 1),
    );
    const py = (firstRow + 0.5) * rowH;
    const px = colX;
    const flat: { ch: string; ink: Ink; x: number; y: number }[] = [];
    rowsOut.forEach((row, r) => {
      row.chars.forEach((ch, k) => {
        flat.push({
          ch,
          ink: row.inks[k] ?? TEXT,
          x: x0 + (k + 0.5) * charW,
          y: py + r * rowH,
        });
      });
    });
    // The pivot is the character that lands nearest where the column stood.
    let kp = 0;
    let best = Infinity;
    for (let k = 0; k < (rowsOut[0]?.chars.length ?? 0); k += 1) {
      const d = Math.abs((flat[k]?.x ?? 0) - colX);
      if (d < best) {
        best = d;
        kp = k;
      }
    }
    const n = flat.length;
    const tip: Tip = {
      col,
      line: index,
      p: 0,
      v: 0,
      target: 1,
      chars: flat.map((f) => f.ch),
      inks: flat.map((f) => f.ink),
      px,
      py,
      dx: new Float32Array(n),
      dy: new Float32Array(n),
      sy: new Float32Array(n),
      rain: new Uint16Array(n),
      turn: new Float32Array(n),
      plate: {
        x: x0 - 8,
        y: py - rowH / 2 - 5,
        w: blockW + 16,
        h: rowsOut.length * rowH + 10,
      },
      fade: 0,
      delay: 0.1,
    };
    const far = Math.max(1, kp, n - 1 - kp);
    const pivotRow = (py - 0.5 * rowH) / rowH;
    flat.forEach((f, k) => {
      tip.dx[k] = f.x - px;
      tip.dy[k] = f.y - py;
      tip.sy[k] = (k - kp) * rowH;
      const row = Math.round(pivotRow + k - kp);
      tip.rain[k] =
        row >= 0 && row < l.rows
          ? (l.glyph[row * l.cols + col] ?? 0)
          : Math.floor(rand() * glyphList.length);
      // Centre-out: the pivot turns first, the ends last.
      tip.turn[k] = 0.22 + 0.5 * (Math.abs(k - kp) / far);
    });
    return tip;
  };

  const tipColumn = (col: number, pivotY: number) => {
    const l = near();
    if (!l) return;
    if (active && active.col === col && active.target === 1) return;
    if (active) active.target = 0;
    // A column that is still tipping back is taken up again where it is.
    const again = tips.find((t) => t.col === col);
    if (again) {
      again.target = 1;
      setActive(again);
      kick();
      return;
    }
    const tip = makeTip(col, pivotY);
    if (!tip) return;
    tips.push(tip);
    while (tips.length > 3) tips.shift();
    setActive(tip);
    kick();
  };

  const release = () => {
    if (active) active.target = 0;
    setActive(null);
    kick();
  };

  /** The raining near column nearest an x, within a column's reach. */
  const columnAt = (x: number) => {
    const l = near();
    if (!l) return -1;
    const c = Math.floor((x - l.x0) / l.cw);
    for (const d of [0, 1, -1, 2, -2]) {
      const k = c + d;
      if (k >= 0 && k < l.cols && l.on[k]) return k;
    }
    return -1;
  };

  const springStep = (tip: Tip, dt: number) => {
    const s = tip.target === 1 ? springs.snap : springs.glide;
    let left = dt;
    // It halts first: the fall decelerates to rest, then the stick swings.
    if (tip.target === 1 && tip.delay > 0) {
      tip.delay -= dt;
      if (tip.delay > 0) return;
      left = -tip.delay;
    }
    while (left > 0) {
      const h1 = Math.min(STEP, left);
      left -= h1;
      tip.v +=
        ((-s.stiffness * (tip.p - tip.target) - s.damping * tip.v) / s.mass) *
        h1;
      tip.p += tip.v * h1;
    }
  };

  const update = (dt: number) => {
    const c = cfg;
    if (!c) return;
    const fall = clamp(c.fallSpeed, 0, 3);
    for (const l of layers) {
      const isNear = l === near();
      for (let i = 0; i < l.cols; i += 1) {
        let hold = l.hold[i] ?? 1;
        const held = isNear && tips.some((t) => t.col === i);
        if (held) hold = Math.max(0, hold * Math.exp(-dt * 26));
        else if (hold < 1) hold = Math.min(1, hold + dt * 2.2 * (0.3 + hold));
        l.hold[i] = hold;
        if (!l.on[i]) {
          // Empty columns wait a while before a new stream starts.
          if (rand() < dt * 0.25) respawn(l, i, false);
          continue;
        }
        const head = (l.head[i] ?? 0) + (l.vel[i] ?? 0) * fall * hold * dt;
        l.head[i] = head;
        if (head - (l.len[i] ?? 0) > l.rows) respawn(l, i, false);
      }
      // A few glyphs re-roll every frame, more while the rain is fast.
      const flips = Math.round(l.cols * l.rows * dt * 0.6 * (0.3 + fall));
      for (let f = 0; f < flips; f += 1) {
        const k = Math.floor(rand() * l.glyph.length);
        const col = k % l.cols;
        if (isNear && tips.some((t) => t.col === col)) continue;
        l.glyph[k] = Math.floor(rand() * glyphList.length);
      }
    }
    for (let k = tips.length - 1; k >= 0; k -= 1) {
      const tip = tips[k];
      if (!tip) continue;
      springStep(tip, dt);
      if (
        tip.target === 0 &&
        Math.abs(tip.p) < 0.004 &&
        Math.abs(tip.v) < 0.05
      ) {
        tips.splice(k, 1);
      }
    }
    if (
      active &&
      active.target === 1 &&
      leaveAt &&
      performance.now() > leaveAt
    ) {
      leaveAt = 0;
      release();
    }
  };

  const draw = () => {
    const c = cfg;
    if (!ctx || !c || !atlas || !layers.length) return;
    const img = atlas;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const nearL = near();
    for (const l of layers) {
      const isNear = l === nearL;
      for (let i = 0; i < l.cols; i += 1) {
        if (!l.on[i]) continue;
        const tip = isNear ? tips.find((t) => t.col === i) : undefined;
        // A tipping column is drawn by its tip; it fades out of the rain.
        const keep = tip ? 1 - smooth(0, 0.15, tip.p) : 1;
        if (keep <= 0.01) continue;
        const head = l.head[i] ?? 0;
        const len = l.len[i] ?? 1;
        const top = Math.max(0, Math.floor(head - len));
        const bottom = Math.min(l.rows - 1, Math.floor(head));
        const x = Math.round((l.x0 + i * l.cw) * dpr);
        for (let r = top; r <= bottom; r += 1) {
          const dist = head - r;
          if (dist < 0 || dist > len) continue;
          const isHead = dist < 1;
          const a = l.alpha * Math.pow(1 - dist / len, 1.3) * keep;
          if (a < 0.02) continue;
          const g = l.glyph[r * l.cols + i] ?? 0;
          ctx.globalAlpha = Math.min(1, a);
          ctx.drawImage(
            img,
            g * l.cwD,
            l.atlasY + (isHead ? l.chD : 0),
            l.cwD,
            l.chD,
            x,
            Math.round(r * l.ch * dpr),
            l.cwD,
            l.chD,
          );
        }
      }
    }
    // Lines lying flat (or on their way), each over its own plate.
    if (nearL) {
      const l = nearL;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `500 ${Math.round(l.size * dpr)}px ${family}`;
      for (const tip of tips) {
        const q = tip.p;
        const plate = smooth(0.15, 0.85, q);
        if (plate > 0.01) {
          ctx.globalAlpha = Math.min(1, plate);
          ctx.fillStyle = plateInk;
          ctx.strokeStyle = edgeInk;
          ctx.lineWidth = dpr;
          ctx.beginPath();
          ctx.roundRect(
            Math.round(tip.plate.x * dpr),
            Math.round(tip.plate.y * dpr),
            Math.round(tip.plate.w * dpr),
            Math.round(tip.plate.h * dpr),
            6 * dpr,
          );
          ctx.fill();
          ctx.stroke();
        }
        const motionSafe = c.motionSafe;
        const angle = (Math.PI / 2) * Math.min(1, q);
        const sin = Math.sin(angle);
        const cos = Math.cos(angle);
        // The swing leads, the settle into slots follows (and overshoots
        // with the snap spring: the blend is not clamped above 1).
        const blend = q * q;
        for (let k = 0; k < tip.chars.length; k += 1) {
          const sy = tip.sy[k] ?? 0;
          const dx = tip.dx[k] ?? 0;
          const dy = tip.dy[k] ?? 0;
          let x: number;
          let y: number;
          if (motionSafe) {
            const rx = sy * sin;
            const ry = sy * cos;
            x = tip.px + rx + (dx - rx) * blend;
            y = tip.py + ry + (dy - ry) * blend;
          } else {
            x = tip.px + dx;
            y = tip.py + dy;
          }
          const turned = motionSafe ? q >= (tip.turn[k] ?? 0) : q > 0.5;
          const ch = tip.chars[k] ?? " ";
          if (turned) {
            if (ch === " ") continue;
            const a = motionSafe ? smooth(0.1, 0.5, q) : q;
            ctx.globalAlpha = Math.min(1, a);
            ctx.fillStyle = inks[tip.inks[k] ?? TEXT] ?? "currentColor";
            ctx.fillText(ch, Math.round(x * dpr), Math.round(y * dpr));
          } else {
            const g = tip.rain[k] ?? 0;
            const a =
              l.alpha * (motionSafe ? smooth(0, 0.3, q) * 0.6 + 0.4 : 1 - q);
            if (a < 0.02) continue;
            ctx.globalAlpha = Math.min(1, a);
            ctx.drawImage(
              img,
              g * l.cwD,
              l.atlasY,
              l.cwD,
              l.chD,
              Math.round(x * dpr - l.cwD / 2),
              Math.round(y * dpr - l.chD / 2),
              l.cwD,
              l.chD,
            );
          }
        }
      }
    }
    ctx.globalAlpha = 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const busy = () => {
    const c = cfg;
    if (!c) return false;
    if (c.motionSafe) return !c.paused || tips.length > 0;
    return (
      tips.some((t) => (t.target === 1 ? t.fade < 1 : t.fade > 0)) ||
      leaveAt > 0
    );
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    if (c.paused && c.motionSafe) {
      // Paused rain stands still; a line can still tip in and out.
      for (let k = tips.length - 1; k >= 0; k -= 1) {
        const tip = tips[k];
        if (!tip) continue;
        springStep(tip, dt);
        if (
          tip.target === 0 &&
          Math.abs(tip.p) < 0.004 &&
          Math.abs(tip.v) < 0.05
        ) {
          tips.splice(k, 1);
        }
      }
      if (active && leaveAt && now > leaveAt) {
        leaveAt = 0;
        release();
      }
    } else if (c.motionSafe) update(dt);
    else {
      // Reduced motion: only the crossfades and the dwell run.
      for (let k = tips.length - 1; k >= 0; k -= 1) {
        const tip = tips[k];
        if (!tip) continue;
        tip.fade = clamp(tip.fade + (tip.target === 1 ? dt : -dt) / 0.15, 0, 1);
        tip.p = tip.fade;
        if (tip.target === 0 && tip.fade <= 0) tips.splice(k, 1);
      }
      if (active && leaveAt && now > leaveAt) {
        leaveAt = 0;
        release();
      }
    }
    draw();
    if (busy()) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const rebuild = () => {
    layout();
    draw();
    kick();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx) {
        root.setAttribute("data-fallback", "");
        return;
      }
      if (!was) {
        readColours();
        rebuild();
        return;
      }
      if (
        was.layers !== next.layers ||
        was.size !== next.size ||
        was.glyphs !== next.glyphs ||
        was.seed !== next.seed ||
        was.dpr !== next.dpr ||
        was.density !== next.density ||
        was.trail !== next.trail
      ) {
        rebuild();
        return;
      }
      if (was.hueKey !== next.hueKey) readColours();
      if (was.lines !== next.lines || was.levelColors !== next.levelColors) {
        tips.length = 0;
        setActive(null);
      }
      if (was.motionSafe !== next.motionSafe) {
        for (const t of tips) {
          t.fade = t.target;
          t.p = t.target;
          t.v = 0;
        }
      }
      if (!next.interactive && active) release();
      draw();
      kick();
    },
    resize() {
      const c = cfg;
      if (!c) return;
      const d = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
      if (w === root.clientWidth && h === root.clientHeight && d === dpr)
        return;
      rebuild();
    },
    readColours() {
      readColours();
      draw();
    },
    refont() {
      if (!cfg || !ctx) return;
      readColours();
      rebuild();
    },
    wake() {
      draw();
      kick();
    },
    hover(x, y) {
      if (!cfg?.interactive) return;
      const tip = active;
      if (tip) {
        const pl = tip.plate;
        const onPlate =
          x >= pl.x - 8 &&
          x <= pl.x + pl.w + 8 &&
          y >= pl.y - 8 &&
          y <= pl.y + pl.h + 8;
        const l = near();
        const onColumn = l
          ? Math.abs(x - (l.x0 + (tip.col + 0.5) * l.cw)) < l.cw * 1.5
          : false;
        if (onPlate || onColumn) {
          leaveAt = 0;
          return;
        }
      }
      const col = columnAt(x);
      if (col < 0) {
        if (active && !leaveAt)
          leaveAt = performance.now() + (cfg?.dwell ?? 700);
        kick();
        return;
      }
      leaveAt = 0;
      tipColumn(col, y);
    },
    leave() {
      if (active)
        leaveAt = performance.now() + clamp(cfg?.dwell ?? 700, 0, 10000);
      kick();
    },
    tap(x, y) {
      if (!cfg?.interactive) return;
      const col = columnAt(x);
      if (active && (col < 0 || active.col === col)) {
        release();
        return;
      }
      if (col >= 0) tipColumn(col, y);
    },
    step(dir) {
      const l = near();
      if (!l || !cfg?.interactive) return;
      const raining: number[] = [];
      for (let i = 0; i < l.cols; i += 1) if (l.on[i]) raining.push(i);
      if (!raining.length) return;
      let at = active ? raining.indexOf(active.col) : -1;
      if (dir === "home") at = 0;
      else if (dir === "end") at = raining.length - 1;
      else if (at < 0) {
        // From nothing: the column nearest the middle, then the step.
        const mid = l.cols / 2;
        at = raining.reduce(
          (b, cIdx, i) =>
            Math.abs(cIdx - mid) < Math.abs((raining[b] ?? 0) - mid) ? i : b,
          0,
        );
        if (dir < 0) at = Math.max(0, at - 1);
      } else at = clamp(at + dir, 0, raining.length - 1);
      const col = raining[at];
      if (col === undefined) return;
      leaveAt = 0;
      tipColumn(col, h * 0.42);
    },
    release() {
      leaveAt = 0;
      release();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/** Seeded still columns for the server's frame. */
function standIn(seed: number, glyphs: string, density: number) {
  const rand = lcg(seed * 53 + 11);
  const chars = Array.from(glyphs || DEFAULT_GLYPHS).filter((c) => c !== " ");
  const cols = 48;
  const rows = 44;
  const spans = Array.from({ length: cols }, () => {
    const on = rand() < density;
    const start = Math.floor(rand() * rows);
    const len = 4 + Math.floor(rand() * 14);
    return { on, start, len };
  });
  const out: string[] = [];
  for (let r = 0; r < rows; r += 1) {
    let row = "";
    for (let c = 0; c < cols; c += 1) {
      const s = spans[c];
      const inside = s && s.on && r >= s.start && r < s.start + s.len;
      row += inside ? (chars[Math.floor(rand() * chars.length)] ?? "0") : " ";
      row += " ";
    }
    out.push(row);
  }
  return out;
}

/**
 * Columns of glyphs rain at up to three depths — far ones small, dim and
 * slow — and any near column stops to be read. Hover it (or reach it with
 * the arrow keys) and its fall halts, then the stick of glyphs swings flat
 * about the glyph under the pointer, every glyph upright on its arc and
 * re-rolling centre-out into the real characters of a line from your logs;
 * the swing is one value on springs.snap, so the line lands with one crisp
 * overshoot over a plate that keeps it readable. Leave and, after `dwell`,
 * it tips back up on springs.glide and the column falls again from rest.
 * Canvas 2D from glyph atlases; nothing runs off screen or in a hidden page.
 * Under reduced motion the rain stands still and lines crossfade in place.
 */
export function LogRain({
  lines = defaultLogRainLines,
  layers = 3,
  fallSpeed = 1,
  hue = 250,
  glyphs = DEFAULT_GLYPHS,
  density = 0.7,
  size = 14,
  trail = 0.5,
  dwell = 700,
  levelColors = true,
  interactive = true,
  paused = false,
  seed = 1,
  dpr = 2,
  onLineChange,
  label = "Live log",
  className,
}: LogRainProps) {
  const motionSafe = useMotionSafe();
  const id = React.useId();
  const [activeLine, setActiveLine] = React.useState<number | null>(null);
  const stand = React.useMemo(
    () => standIn(seed, glyphs, clamp(density, 0, 1)),
    [seed, glyphs, density],
  );
  const hueDeg = Math.round(((hue % 360) + 360) % 360);
  const rain = `oklch(from var(--accent-bright) l c ${hueDeg})`;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carrierRefs = React.useRef<(HTMLSpanElement | null)[]>([]);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const callback = React.useRef(onLineChange);
  const report = React.useRef<(line: number | null) => void>((line) => {
    setActiveLine(line);
    callback.current?.(line);
  });

  const config: Config = {
    lines,
    layers,
    fallSpeed,
    glyphs,
    density,
    size,
    trail,
    dwell,
    levelColors,
    interactive,
    paused,
    seed,
    dpr,
    hueKey: rain,
    motionSafe,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    callback.current = onLineChange;
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carrierRefs.current.filter((c): c is HTMLSpanElement =>
      Boolean(c),
    );
    if (!root || !canvas || carriers.length < 9) return;
    const e = createEngine(root, canvas, carriers, visible, report);
    engine.current = e;
    e.configure(latest.current);
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) engine.current?.refont();
    });
    return () => {
      live = false;
      e.dispose();
      if (engine.current === e) engine.current = null;
      root.removeAttribute("data-live");
    };
  }, []);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) engine.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) engine.current?.wake();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  const local = (event: React.PointerEvent<HTMLDivElement>) => {
    const r = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - r.left - event.currentTarget.clientLeft,
      y: event.clientY - r.top - event.currentTarget.clientTop,
    };
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const e = engine.current;
    if (!e) return;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") e.step(1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") e.step(-1);
    else if (event.key === "Home") e.step("home");
    else if (event.key === "End") e.step("end");
    else if (event.key === "Escape" && activeLine !== null) e.release();
    else return;
    event.preventDefault();
  };

  const options = lines.map(lineText);

  return (
    <div
      ref={bindRoot}
      role="listbox"
      aria-label={label}
      aria-activedescendant={
        activeLine !== null ? `${id}-line-${activeLine}` : undefined
      }
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={onKeyDown}
      onBlur={() => engine.current?.release()}
      onPointerMove={(event) => {
        if (event.pointerType === "touch") return;
        const at = local(event);
        engine.current?.hover(at.x, at.y);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") engine.current?.leave();
      }}
      onPointerUp={(event) => {
        if (event.pointerType !== "touch") return;
        const at = local(event);
        engine.current?.tap(at.x, at.y);
      }}
      className={cn(
        "group/log-rain relative isolate h-96 w-full touch-pan-y overflow-clip outline-none select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full font-mono"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-clip font-mono text-[11px] leading-[14px] whitespace-pre select-none group-data-live/log-rain:hidden"
        style={{ color: `color-mix(in oklab, ${rain} 45%, transparent)` }}
      >
        {stand.map((row, j) => (
          <div key={j}>{row}</div>
        ))}
      </div>
      {[
        rain,
        `color-mix(in oklab, ${rain} 40%, var(--foreground))`,
        "var(--ink-3)",
        "var(--foreground)",
        `color-mix(in oklab, ${rain} 35%, var(--foreground))`,
        "var(--warn)",
        "var(--danger)",
        "color-mix(in oklab, var(--card) 92%, transparent)",
        "var(--hairline-strong)",
      ].map((ink, i) => (
        <span
          key={i}
          ref={(node) => {
            carrierRefs.current[i] = node;
          }}
          aria-hidden
          onTransitionEnd={() => engine.current?.readColours()}
          className="pointer-events-none absolute size-0 overflow-hidden transition-colors duration-1"
          style={{ color: ink }}
        />
      ))}
      <div className="sr-only">
        {options.map((text, i) => (
          <div
            key={i}
            id={`${id}-line-${i}`}
            role="option"
            aria-selected={activeLine === i}
          >
            {text}
          </div>
        ))}
      </div>
    </div>
  );
}
