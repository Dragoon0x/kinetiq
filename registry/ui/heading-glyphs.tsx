"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type HeadingGlyphsRamp = "ascii" | "box" | "dots";

export type HeadingGlyphsProps = {
  /** The type the trail is set in: plain ASCII, box-drawing strokes, or braille dots. @default "ascii" */
  ramp?: HeadingGlyphsRamp;
  /** How long a cell takes to cool through the whole ramp, ms (200 to 5000). A slow stroke starts lower and vanishes sooner. @default 1400 */
  fade?: number;
  /** Cell height in px (8 to 28); a cell is as wide as a monospaced character, about 0.62 of that, and the glyphs are set to fit. @default 14 */
  cell?: number;
  /** Inks from hot to cold, as CSS colours, mixed in oklab into eight steps. @default ["var(--accent-bright)", "color-mix(in oklab, var(--accent-bright) 40%, var(--ink-2))", "var(--ink-3)"] */
  colors?: readonly string[];
  /** Pointer speed, px/s, that reaches the heaviest weight of the ramp. @default 1600 */
  sensitivity?: number;
  /** Ray length of the asterisk a click stamps, in cells; 0 turns the stamp off. @default 3 */
  burst?: number;
  /** Draw a short underline stroke under a child that takes keyboard focus. @default true */
  focusStroke?: boolean;
  /** A faint dot in every cell at rest, like an empty type case. @default true */
  grid?: boolean;
  /** Font weight of the glyphs. @default 500 */
  weight?: number;
  /** The first time the box comes into view, a stroke sets itself across it — slow, fast, slow — to show the ramp. @default true */
  intro?: boolean;
  /** The pointer, clicks and keyboard focus draw. @default true */
  interactive?: boolean;
  /** Holds every glyph where it is. @default false */
  paused?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** A stamp landed, with the cell it centred on. */
  onStamp?: (cell: { col: number; row: number }) => void;
  /** Content set above the type; it stays fully interactive. */
  children?: React.ReactNode;
  /** Sizes and shapes the box. @default "h-56 w-full" */
  className?: string;
};

const DEFAULT_COLORS = [
  "var(--accent-bright)",
  "color-mix(in oklab, var(--accent-bright) 40%, var(--ink-2))",
  "var(--ink-3)",
] as const;

/**
 * Five weights, light to heavy, each with a glyph for the four headings
 * (across, up-down, rising, falling) and a fifth for the stamp's centre.
 */
const RAMPS: Record<HeadingGlyphsRamp, string[][]> = {
  ascii: [
    [".", ".", ".", ".", "."],
    ["-", "|", "/", "\\", "+"],
    ["=", "‖", "/", "\\", "*"],
    ["+", "+", "x", "x", "*"],
    ["#", "#", "#", "#", "*"],
  ],
  box: [
    ["·", "·", "·", "·", "·"],
    ["╌", "╎", "╱", "╲", "+"],
    ["─", "│", "╱", "╲", "*"],
    ["━", "┃", "╳", "╳", "✱"],
    ["▓", "▓", "▓", "▓", "✱"],
  ],
  dots: [
    ["⠂", "⠂", "⠂", "⠂", "⠂"],
    ["⠒", "⠇", "⠔", "⠢", "⠪"],
    ["⠶", "⡇", "⡜", "⢣", "⡪"],
    ["⠿", "⣿", "⡾", "⢷", "⢿"],
    ["⣿", "⣿", "⣿", "⣿", "⣿"],
  ],
};

/** Braille dot positions by bit, as [column, row] in the 2 × 4 cell. */
const BRAILLE: [number, number][] = [
  [0, 0],
  [0, 1],
  [0, 2],
  [1, 0],
  [1, 1],
  [1, 2],
  [0, 3],
  [1, 3],
];

const WEIGHTS = 5;
const INKS = 8;
const STAR = 4;
/** The eight rays of a stamp: step and the heading each ray is drawn in. */
const RAYS: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 1],
  [0, -1, 1],
  [1, -1, 2],
  [-1, 1, 2],
  [1, 1, 3],
  [-1, -1, 3],
];
const SUB = 1 / 240;
const MAX_STAMPS = 4;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Quantises a stroke's direction to one of the four headings. */
function heading(dx: number, dy: number) {
  const a = Math.atan2(-dy, dx);
  // Fold onto a half turn: a stroke and its reverse share a glyph.
  let t = ((a * 180) / Math.PI + 180) % 180;
  if (t < 0) t += 180;
  if (t < 22.5 || t >= 157.5) return 0;
  if (t < 67.5) return 2;
  if (t < 112.5) return 1;
  return 3;
}

type Config = {
  ramp: HeadingGlyphsRamp;
  fade: number;
  cell: number;
  sensitivity: number;
  burst: number;
  focusStroke: boolean;
  grid: boolean;
  weight: number;
  intro: boolean;
  paused: boolean;
  dpr: number;
  colorKey: string;
  motionSafe: boolean;
};

type Stamp = {
  col: number;
  row: number;
  len: number;
  vel: number;
  lit: number;
  age: number;
  live: boolean;
};

type Sweep = {
  row: number;
  from: number;
  to: number;
  done: number;
  age: number;
  live: boolean;
};

type Engine = {
  configure: (c: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  move: (x: number, y: number, t: number) => void;
  intro: () => void;
  leave: () => void;
  stamp: (x: number, y: number) => { col: number; row: number } | null;
  underline: (left: number, right: number, bottom: number) => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLSpanElement[],
  visible: React.RefObject<boolean>,
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let w = 0;
  let h = 0;
  let dpr = 1;
  let frame = 0;
  let last = 0;
  let clock = 0;
  let disposed = false;
  let inks: string[] = [];
  let dotInk = "currentColor";
  let family = "ui-monospace, monospace";
  const atlas = document.createElement("canvas");
  const rest = document.createElement("canvas");
  let charIndex = new Map<string, number>();
  // The grid.
  let cols = 0;
  let rows = 0;
  let size = 14;
  let cw = 9;
  let x0 = 0;
  let y0 = 0;
  let cwD = 1;
  let chD = 1;
  let heat0 = new Float32Array(0);
  let born = new Float32Array(0);
  let dir = new Uint8Array(0);
  let inList = new Uint8Array(0);
  let active = new Int32Array(0);
  let activeCount = 0;
  // The pointer.
  let px = -1;
  let py = -1;
  let pt = 0;
  let speed = 0;
  const stamps: Stamp[] = Array.from({ length: MAX_STAMPS }, () => ({
    col: 0,
    row: 0,
    len: 0,
    vel: 0,
    lit: 0,
    age: 0,
    live: false,
  }));
  let nextStamp = 0;
  const sweep: Sweep = { row: 0, from: 0, to: 0, done: 0, age: 0, live: false };
  // The intro stroke: a long S across the box, slow at its ends and fast in
  // the middle, so one pass shows the whole ramp.
  const intro = { live: false, t: 0, played: false };

  const readColours = () => {
    inks = carriers
      .slice(0, INKS)
      .map((el) => getComputedStyle(el).color || "currentColor");
    const dot = carriers[INKS];
    dotInk = dot ? getComputedStyle(dot).color || dotInk : dotInk;
    family = getComputedStyle(canvas).fontFamily || family;
    buildAtlas();
    buildRest();
  };

  const buildAtlas = () => {
    const c = cfg;
    if (!c || cols < 1) return;
    const table = RAMPS[c.ramp] ?? RAMPS.ascii;
    charIndex = new Map();
    for (const row of table) {
      for (const ch of row) {
        if (!charIndex.has(ch)) charIndex.set(ch, charIndex.size);
      }
    }
    atlas.width = Math.max(1, charIndex.size * cwD);
    atlas.height = Math.max(1, INKS * chD);
    const a = atlas.getContext("2d");
    if (!a) return;
    a.clearRect(0, 0, atlas.width, atlas.height);
    a.font = `${clamp(Math.round(c.weight / 100) * 100, 100, 900)} ${Math.round(size * 0.86 * dpr)}px ${family}`;
    a.textAlign = "left";
    a.textBaseline = "alphabetic";
    // Each glyph is centred by its own ink, not by the font's metrics: box
    // drawing and braille often come from a fallback face whose baseline
    // sits elsewhere, and a dot or a dash should sit in the cell's middle.
    const place = new Map<string, [number, number]>();
    for (const ch of charIndex.keys()) {
      const m = a.measureText(ch);
      const left = m.actualBoundingBoxLeft || 0;
      const inkW = left + (m.actualBoundingBoxRight || m.width);
      const ascent = m.actualBoundingBoxAscent || 0;
      const inkH = ascent + (m.actualBoundingBoxDescent || 0);
      place.set(ch, [
        Math.round((cwD - inkW) / 2 + left),
        Math.round((chD - inkH) / 2 + ascent),
      ]);
    }
    const dotR = Math.max(0.6, Math.min(cwD, chD) * 0.085);
    for (let k = 0; k < INKS; k += 1) {
      a.fillStyle = inks[k] ?? "currentColor";
      for (const [ch, i] of charIndex) {
        const code = ch.codePointAt(0) ?? 0;
        if (code >= 0x2800 && code <= 0x28ff) {
          // Braille is drawn, not set: fallback faces disagree on it (some
          // outline the unraised dots too), and a dot is easy to draw.
          const bits = code - 0x2800;
          a.beginPath();
          BRAILLE.forEach(([col, row], bit) => {
            if (!(bits & (1 << bit))) return;
            const x = i * cwD + cwD * (col === 0 ? 0.3 : 0.7);
            const y = k * chD + chD * (0.2 + row * 0.2);
            a.moveTo(x + dotR, y);
            a.arc(x, y, dotR, 0, Math.PI * 2);
          });
          a.fill();
          continue;
        }
        const [dx, dy] = place.get(ch) ?? [0, 0];
        a.fillText(ch, i * cwD + dx, k * chD + dy);
      }
    }
  };

  /** The resting type case: a faint dot in every cell, drawn once. */
  const buildRest = () => {
    const c = cfg;
    rest.width = Math.max(1, canvas.width);
    rest.height = Math.max(1, canvas.height);
    const g = rest.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, rest.width, rest.height);
    if (!c || !c.grid) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = dotInk;
    g.beginPath();
    const r = Math.max(0.55, size * 0.045);
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        // Every other column, so the resting lattice stays square.
        if (i % 2 === 1) continue;
        const x = x0 + (i + 0.5) * cw;
        const y = y0 + (j + 0.5) * size;
        g.moveTo(x + r, y);
        g.arc(x, y, r, 0, Math.PI * 2);
      }
    }
    g.fill();
  };

  const layout = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const nw = root.clientWidth;
    const nh = root.clientHeight;
    if (nw < 1 || nh < 1) return;
    w = nw;
    h = nh;
    dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    size = clamp(Math.round(c.cell), 8, 28);
    // Monospaced cells: a character's advance wide, a line tall.
    cw = Math.max(5, Math.round(size * 0.62));
    cols = Math.max(1, Math.ceil(w / cw));
    rows = Math.max(1, Math.ceil(h / size));
    x0 = Math.round((w - cols * cw) / 2);
    y0 = Math.round((h - rows * size) / 2);
    cwD = Math.max(2, Math.round(cw * dpr));
    chD = Math.max(2, Math.round(size * dpr));
    const n = cols * rows;
    heat0 = new Float32Array(n);
    born = new Float32Array(n);
    dir = new Uint8Array(n);
    inList = new Uint8Array(n);
    active = new Int32Array(n);
    activeCount = 0;
    for (const s of stamps) s.live = false;
    sweep.live = false;
    buildAtlas();
    buildRest();
  };

  /** The heat a cell has now: it cools through the whole ramp in `fade`. */
  const heatOf = (k: number) => {
    const c = cfg;
    if (!c) return 0;
    const h0 = heat0[k] ?? 0;
    const age = clock - (born[k] ?? 0);
    if (!c.motionSafe)
      return h0 * (1 - age / (clamp(c.fade, 200, 5000) / 1000));
    return h0 - age / (clamp(c.fade, 200, 5000) / 1000);
  };

  const mark = (i: number, j: number, heat: number, heading: number) => {
    if (i < 0 || j < 0 || i >= cols || j >= rows) return;
    const k = j * cols + i;
    // A hotter stroke takes the cell; a cooler one leaves it be.
    if (inList[k] && heatOf(k) > heat) return;
    heat0[k] = heat;
    born[k] = clock;
    dir[k] = heading;
    if (!inList[k]) {
      inList[k] = 1;
      active[activeCount] = k;
      activeCount += 1;
    }
  };

  const cellAt = (x: number, y: number) => [
    Math.floor((x - x0) / cw),
    Math.floor((y - y0) / size),
  ];

  const draw = () => {
    const c = cfg;
    if (!c || !ctx || w < 1) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (c.grid) {
      ctx.globalAlpha = 0.55;
      ctx.drawImage(rest, 0, 0);
    }
    const table = RAMPS[c.ramp] ?? RAMPS.ascii;
    let write = 0;
    for (let a = 0; a < activeCount; a += 1) {
      const k = active[a] ?? 0;
      const heat = heatOf(k);
      if (heat <= 0) {
        inList[k] = 0;
        continue;
      }
      active[write] = k;
      write += 1;
      // Reduced motion: the glyph a cell was given holds, and fades.
      const shownHeat = c.motionSafe ? heat : (heat0[k] ?? 0);
      const level = Math.min(WEIGHTS - 1, Math.floor(shownHeat * WEIGHTS));
      const ch = table[level]?.[dir[k] ?? 0] ?? ".";
      const col = charIndex.get(ch) ?? 0;
      const ink = Math.min(INKS - 1, Math.floor(shownHeat * INKS));
      // The last dot fades out rather than blinking off.
      const alpha = c.motionSafe
        ? Math.min(1, heat / 0.14)
        : Math.min(1, heat / Math.max(0.01, heat0[k] ?? 1));
      ctx.globalAlpha = alpha;
      ctx.drawImage(
        atlas,
        col * cwD,
        ink * chD,
        cwD,
        chD,
        Math.round((x0 + (k % cols) * cw) * dpr),
        Math.round((y0 + Math.floor(k / cols) * size) * dpr),
        cwD,
        chD,
      );
    }
    activeCount = write;
    ctx.globalAlpha = 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /**
   * The cells of step `n` on every ray of a stamp. Cells are narrower than
   * they are tall, so a ray steps that many more columns across: the
   * asterisk keeps its proportions, and the level rays fill every column
   * so they read as one stroke.
   */
  const ray = (
    s: Stamp,
    n: number,
    visit: (i: number, j: number, hd: number) => void,
  ) => {
    const k = size / cw;
    for (const [dx, dy, hd] of RAYS) {
      const to = Math.round(dx * n * k);
      if (dy === 0) {
        const from = Math.round(dx * (n - 1) * k);
        const stepX = Math.sign(to - from) || 1;
        for (let i = from + stepX; stepX > 0 ? i <= to : i >= to; i += stepX) {
          visit(s.col + i, s.row, hd);
        }
      } else visit(s.col + to, s.row + dy * n, hd);
    }
  };

  const integrate = (dt: number) => {
    const c = cfg;
    if (!c) return;
    clock += dt;
    const span = clamp(Math.round(c.burst), 0, 8);
    for (const s of stamps) {
      if (!s.live) continue;
      s.age += dt;
      if (c.motionSafe) {
        const k = springs.recoil;
        let left = dt;
        while (left > 0) {
          const step = Math.min(SUB, left);
          left -= step;
          s.vel +=
            ((-k.stiffness * (s.len - span) - k.damping * s.vel) / k.mass) *
            step;
          s.len += s.vel * step;
        }
      } else s.len = span;
      // A ray's tip shows once it is more than half-way into a cell, so the
      // recoil's overshoot reads as one cell past and back.
      const reach = Math.max(0, Math.floor(s.len + 0.6));
      if (reach > s.lit) {
        for (let n = s.lit + 1; n <= reach; n += 1) {
          ray(s, n, (i, j, hd) => mark(i, j, Math.max(0.3, 1 - n * 0.06), hd));
        }
        s.lit = reach;
      } else if (reach < s.lit) {
        // The tip snaps back: the overshoot cells drop to a last dot.
        for (let n = reach + 1; n <= s.lit; n += 1) {
          ray(s, n, (i, j) => {
            if (i < 0 || j < 0 || i >= cols || j >= rows) return;
            const k = j * cols + i;
            heat0[k] = 0.12;
            born[k] = clock;
          });
        }
        s.lit = reach;
      }
      if (s.age > 0.9 || !c.motionSafe) s.live = false;
    }
    if (intro.live) {
      intro.t += dt;
      const p = clamp(intro.t / 1.3, 0, 1);
      const u = p * p * p * (p * (p * 6 - 15) + 10);
      const x = w * (0.06 + 0.88 * u);
      const y = h * (0.5 + 0.28 * Math.sin(Math.PI * 2 * u + 0.5));
      engineMove(x, y, clock * 1000);
      if (p >= 1) {
        intro.live = false;
        px = -1;
        speed = 0;
      }
    }
    if (sweep.live) {
      sweep.age += dt;
      const p = c.motionSafe ? clamp(sweep.age / 0.26, 0, 1) : 1;
      const eased = 1 - Math.pow(1 - p, 2);
      const upto = Math.round(sweep.from + (sweep.to - sweep.from) * eased);
      for (let i = sweep.done + 1; i <= upto; i += 1) {
        mark(i, sweep.row, 0.62, 0);
      }
      sweep.done = Math.max(sweep.done, upto);
      if (p >= 1) sweep.live = false;
    }
  };

  const engineMove = (x: number, y: number, t: number) => {
    const c = cfg;
    if (!c || c.paused || cols < 1) return;
    // A gap, or a sample from another clock (the intro), starts afresh.
    if (px < 0 || t - pt > 120 || t < pt) {
      px = x;
      py = y;
      pt = t;
      speed = 0;
      return;
    }
    const dx = x - px;
    const dy = y - py;
    const dist = Math.hypot(dx, dy);
    if (dist < 1.5) return;
    const dt = Math.max(4, t - pt) / 1000;
    // Smoothed over the last few samples, so a hand's jitter does not
    // flicker the weight.
    speed = speed * 0.55 + (dist / dt) * 0.45;
    const heat = clamp(
      Math.pow(speed / Math.max(100, c.sensitivity), 0.7),
      0.1,
      1,
    );
    const hd = heading(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / (cw * 0.45)));
    let lastCell = -1;
    for (let s = 1; s <= steps; s += 1) {
      const f = s / steps;
      const [i, j] = cellAt(px + dx * f, py + dy * f);
      const key = (j ?? 0) * cols + (i ?? 0);
      if (key === lastCell) continue;
      lastCell = key;
      mark(i ?? 0, j ?? 0, heat, hd);
    }
    px = x;
    py = y;
    pt = t;
    kick();
  };

  const busy = () => {
    if (activeCount > 0 || sweep.live || intro.live) return true;
    for (const s of stamps) if (s.live) return true;
    return false;
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
    if (!c.paused) integrate(dt);
    draw();
    if (!c.paused && busy()) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || w < 1)
      return;
    frame = window.requestAnimationFrame(tick);
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
        layout();
        draw();
        return;
      }
      if (was.cell !== next.cell || was.dpr !== next.dpr) layout();
      else if (
        was.colorKey !== next.colorKey ||
        was.weight !== next.weight ||
        was.ramp !== next.ramp ||
        was.grid !== next.grid
      ) {
        readColours();
      }
      draw();
      kick();
    },
    resize() {
      const c = cfg;
      if (!c) return;
      const ratio = Math.min(
        window.devicePixelRatio || 1,
        clamp(c.dpr, 0.5, 2),
      );
      if (w === root.clientWidth && h === root.clientHeight && dpr === ratio)
        return;
      layout();
      draw();
    },
    readColours() {
      readColours();
      draw();
    },
    wake() {
      draw();
      kick();
    },
    move(x, y, t) {
      engineMove(x, y, t);
    },
    intro() {
      const c = cfg;
      if (!c || !c.intro || !c.motionSafe || intro.played || cols < 1) return;
      intro.played = true;
      intro.live = true;
      intro.t = 0;
      px = -1;
      kick();
    },
    leave() {
      px = -1;
      speed = 0;
    },
    stamp(x, y) {
      const c = cfg;
      if (!c || c.paused || cols < 1 || clamp(Math.round(c.burst), 0, 8) < 1)
        return null;
      const [i = 0, j = 0] = cellAt(x, y);
      const s = stamps[nextStamp];
      nextStamp = (nextStamp + 1) % MAX_STAMPS;
      if (!s) return null;
      s.col = i;
      s.row = j;
      s.len = 0;
      s.vel = 0;
      s.lit = 0;
      s.age = 0;
      s.live = true;
      mark(i, j, 1, STAR);
      if (!c.motionSafe) integrate(0);
      kick();
      return { col: i, row: j };
    },
    underline(left, right, bottom) {
      const c = cfg;
      if (!c || c.paused || !c.focusStroke || cols < 1) return;
      const [i0 = 0, j = 0] = cellAt(left, bottom + size * 0.35);
      const [i1 = 0] = cellAt(right - 1, bottom);
      sweep.row = clamp(j, 0, rows - 1);
      sweep.from = clamp(i0, 0, cols - 1);
      sweep.to = clamp(Math.max(i1, i0 + 2), 0, cols - 1);
      sweep.done = sweep.from - 1;
      sweep.age = 0;
      sweep.live = true;
      if (!c.motionSafe) integrate(0);
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/**
 * A cursor trail set in monospaced type, painted on a layer behind the
 * children. Every cell the pointer crosses takes the character that fits the
 * stroke there: its direction picks a dash, a pipe or a slash, its speed a
 * weight from dots to hashes. Each cell then cools through the ramp — the
 * whole ramp takes `fade` — stepping down a character at a time while its ink
 * walks from hot to cold, so a fast stroke lingers and a slow one is gone
 * soon. A click stamps an asterisk whose eight rays reach out on
 * springs.recoil, one cell past and back.
 *
 * Keyboard focus on any child draws a short underline stroke under it, and
 * Enter or Space there stamps at its centre. The painted layer is
 * aria-hidden and never takes a click; touch never draws a trail, but a tap
 * stamps. Under reduced motion glyphs hold the character they were given and
 * fade instead of stepping down, and the stamp appears whole.
 */
export function HeadingGlyphs({
  ramp = "ascii",
  fade = 1400,
  cell = 14,
  colors = DEFAULT_COLORS,
  sensitivity = 1600,
  burst = 3,
  focusStroke = true,
  grid = true,
  weight = 500,
  intro = true,
  interactive = true,
  paused = false,
  dpr = 2,
  onStamp,
  children,
  className,
}: HeadingGlyphsProps) {
  const motionSafe = useMotionSafe();
  const stops = React.useMemo(() => {
    const list = colors.length >= 2 ? colors : DEFAULT_COLORS;
    // Index 0 is the coldest ink, INKS - 1 the hottest.
    return Array.from({ length: INKS }, (_, k) => {
      const p = (1 - k / (INKS - 1)) * (list.length - 1);
      const a = Math.floor(p);
      const b = Math.min(list.length - 1, a + 1);
      const f = Math.round((p - a) * 100);
      return f === 0
        ? (list[a] ?? "currentColor")
        : `color-mix(in oklab, ${list[a]} ${100 - f}%, ${list[b]})`;
    });
  }, [colors]);
  const colorKey = stops.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carrierRefs = React.useRef<(HTMLSpanElement | null)[]>([]);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);

  const config: Config = {
    ramp,
    fade,
    cell,
    sensitivity,
    burst,
    focusStroke,
    grid,
    weight,
    intro,
    paused,
    dpr,
    colorKey,
    motionSafe,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carrierRefs.current.filter((c): c is HTMLSpanElement =>
      Boolean(c),
    );
    if (!root || !canvas || carriers.length < INKS + 1) return;
    const e = createEngine(root, canvas, carriers, visible);
    engine.current = e;
    e.configure(latest.current);
    if (visible.current) e.intro();
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) engine.current?.readColours();
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
      if (visible.current) {
        engine.current?.wake();
        engine.current?.intro();
      }
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  const local = (x: number, y: number) => {
    const r = rootRef.current?.getBoundingClientRect();
    return r ? { x: x - r.left, y: y - r.top } : { x: 0, y: 0 };
  };

  const stampAt = (x: number, y: number) => {
    const at = engine.current?.stamp(x, y);
    if (at) onStamp?.(at);
  };

  return (
    <div
      ref={bindRoot}
      onPointerMove={(event) => {
        if (!interactive || event.pointerType === "touch") return;
        const p = local(event.clientX, event.clientY);
        engine.current?.move(p.x, p.y, event.timeStamp);
      }}
      onPointerLeave={() => engine.current?.leave()}
      onPointerDown={(event) => {
        if (!interactive) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        const p = local(event.clientX, event.clientY);
        stampAt(p.x, p.y);
      }}
      onFocus={(event) => {
        if (!interactive || event.target === event.currentTarget) return;
        const target = event.target as HTMLElement;
        if (!target.matches(":focus-visible")) return;
        const root = rootRef.current?.getBoundingClientRect();
        const r = target.getBoundingClientRect();
        if (!root) return;
        engine.current?.underline(
          r.left - root.left,
          r.right - root.left,
          r.bottom - root.top,
        );
      }}
      onKeyDown={(event) => {
        if (!interactive || event.repeat) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        if (event.target === event.currentTarget) return;
        const root = rootRef.current?.getBoundingClientRect();
        const r = (event.target as HTMLElement).getBoundingClientRect();
        if (!root) return;
        stampAt(
          (r.left + r.right) / 2 - root.left,
          (r.top + r.bottom) / 2 - root.top,
        );
      }}
      className={cn(
        "group/heading-glyphs relative isolate h-56 w-full overflow-clip",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 size-full font-mono"
      />
      <div className="relative z-10 size-full">{children}</div>
      {[...stops, "var(--ink-3)"].map((ink, i) => (
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
    </div>
  );
}
