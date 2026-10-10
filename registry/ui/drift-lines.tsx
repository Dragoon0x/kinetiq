"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DriftLinesProps = {
  /** The content over the lines: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How many lines float in the field, 8 to 48. @default 24 */
  count?: number;
  /** How far apart the depths are, 0 (one flat plane) to 1 (deep: thick soft near lines, strong parallax). @default 0.6 */
  depth?: number;
  /** The lines' colour, any CSS colour. @default "var(--foreground)" */
  color?: string;
  /** The colour of the one line that stands apart, or null for none. @default "var(--accent-bright)" */
  accent?: string | null;
  /** Line weight, 0.5 (hairlines) to 2. @default 1 */
  thickness?: number;
  /** How strongly the lines read against the page, 0 to 1. @default 0.6 */
  contrast?: number;
  /** How much the lines bend, 0 (straight) to 1. @default 0.5 */
  curve?: number;
  /** How fast the lines drift, 0 (still) to 2. @default 0.6 */
  speed?: number;
  /** The depth that rests in focus, 0 (the far lines) to 1 (the near ones). @default 0 */
  focus?: number;
  /** The pointer and keyboard focus shift the parallax, and a press racks focus. @default true */
  interactive?: boolean;
  /** How far the hand shifts the parallax, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** Hold the lines still; the hand still shifts and focuses them. @default false */
  paused?: boolean;
  /** Seeds the field, so two never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) moving the field. */
  onActiveChange?: (active: boolean) => void;
  /** Fires with the depth focus is racking to (0 far to 1 near) and whether a press or keyboard focus holds it there (false: back at rest). */
  onFocusChange?: (depth: number, racked: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

type Line = {
  /** Depth, 0 far to 1 near. */
  z: number;
  /** Rest height, as a fraction of the box. */
  y0: number;
  /** Two bends: amplitude (fraction of height), wavelength (fraction of width), phase. */
  a1: number;
  l1: number;
  p1: number;
  a2: number;
  l2: number;
  p2: number;
  /** Drift, radians a second along the bends. */
  v: number;
  /** The slow bob up and down: amplitude (fraction of height), period (s), phase. */
  bob: number;
  bobP: number;
  bobPh: number;
  accent: boolean;
};

const STEP_X = 8;
/** Depth bands: lines in one share a style and are stroked together. */
const BANDS = 7;
const STEP = 1 / 120;
const CALM_FRAME = 31;
/** The nearest line moves this far, px, at full depth and full strength. */
const PARALLAX = 36;
const GLIDE = springs.glide;
const DRIFT = springs.drift;
/** Ambient time for a still frame: a seeded moment, not the first. */
const STILL = 40;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
/** Two places, printed clean: toFixed never leaves a 0.27999999999999997. */
const r2 = (v: number) => Number(v.toFixed(2));

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The field, laid out once per seed, count and curve: rest heights spread evenly, depths shuffled. */
function layLines(count: number, curve: number, seed: number): Line[] {
  const n = clamp(Math.round(count), 1, 64);
  const rand = lcg(seed * 41 + n * 7);
  const depths: number[] = [];
  for (let i = 0; i < n; i += 1) depths.push((i + 0.2 + rand() * 0.6) / n);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const t = depths[i] ?? 0;
    depths[i] = depths[j] ?? 0;
    depths[j] = t;
  }
  const bend = clamp(curve, 0, 1);
  // The accent sits in the middle distance, where it reads without shouting.
  let accentAt = 0;
  let best = 2;
  const lines: Line[] = [];
  for (let i = 0; i < n; i += 1) {
    const z = depths[i] ?? 0.5;
    const near = 0.6 + 0.8 * z;
    const a1 = (0.015 + 0.06 * rand()) * bend * near;
    if (Math.abs(z - 0.45) < best) {
      best = Math.abs(z - 0.45);
      accentAt = i;
    }
    lines.push({
      z,
      y0: 0.06 + (0.88 * (i + 0.5 + (rand() - 0.5) * 0.8)) / n,
      a1,
      l1: 0.7 + 0.9 * rand(),
      p1: rand() * Math.PI * 2,
      a2: a1 * (0.25 + 0.2 * rand()),
      l2: 0.25 + 0.2 * rand(),
      p2: rand() * Math.PI * 2,
      v: (0.05 + 0.06 * rand()) * (0.35 + 1.3 * z) * (rand() < 0.18 ? -1 : 1),
      bob: 0.015 + 0.05 * rand(),
      bobP: 18 + 26 * rand(),
      bobPh: rand() * Math.PI * 2,
      accent: false,
    });
  }
  const pick = lines[accentAt];
  if (pick) pick.accent = true;
  // Far lines first, so nearer ones pass over them.
  return lines.sort((a, b) => a.z - b.z);
}

/** A line's height at x (px) and time t (s), before parallax. */
function lineY(l: Line, x: number, t: number, w: number, h: number): number {
  const u = x / Math.max(1, w);
  return (
    (l.y0 +
      l.a1 * Math.sin((u / l.l1) * Math.PI * 2 + l.p1 + l.v * t) +
      l.a2 * Math.sin((u / l.l2) * Math.PI * 2 + l.p2 - l.v * 0.6 * t) +
      l.bob * Math.sin((t / l.bobP) * Math.PI * 2 + l.bobPh)) *
    h
  );
}

/** What a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

type Config = {
  depth: number;
  thickness: number;
  contrast: number;
  speed: number;
  focus: number;
  interactive: boolean;
  pointerStrength: number;
  paused: boolean;
  dpr: number;
  motionSafe: boolean;
  lines: Line[];
  onActive: (active: boolean) => void;
  onFocus: (depth: number, racked: boolean) => void;
};

type Source = "pointer" | "focus";

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: Source) => void;
  handAway: (source: Source) => void;
  /** Rack focus to the line nearest (x, y) and hold it there. */
  rack: (x: number, y: number, source: Source) => void;
  /** Let focus drift back to its resting depth. */
  unrack: (source: Source) => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
): Engine {
  let cfg: Config | null = null;
  let frame = 0;
  let last = 0;
  let drawnAt = 0;
  let disposed = false;
  let active = false;
  const ctx = canvas.getContext("2d");
  const size = { w: 0, h: 0, dpr: 1 };
  const ink = { line: "currentColor", accent: "currentColor" };
  let pts = new Float32Array(4096);
  const sim = { t: STILL };
  const hand = {
    x: 0,
    y: 0,
    /** The parallax, -1 to 1 across and down, and its spring velocity. */
    ox: 0,
    oy: 0,
    vx: 0,
    vy: 0,
    present: false,
    source: null as Source | null,
  };
  const lens = {
    at: 0,
    v: 0,
    target: 0,
    racked: null as Source | null,
    told: "",
  };

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    cfg?.onActive(next);
  };

  /** Depth as drawn: `depth` pulls every line toward the middle plane. */
  const shown = (c: Config, z: number) =>
    0.5 + (z - 0.5) * clamp(c.depth, 0, 1);
  const rest = (c: Config) => shown(c, clamp(c.focus, 0, 1));

  const tell = (c: Config, depth: number) => {
    const d = Math.round(depth * 100) / 100;
    const racked = lens.racked !== null;
    const key = `${d}|${racked}`;
    if (key === lens.told) return;
    lens.told = key;
    c.onFocus(d, racked);
  };

  /** Where the parallax is heading, written into one reused object: no garbage per frame. */
  const aim = { x: 0, y: 0 };
  const parallaxTarget = (c: Config) => {
    const on = hand.present && c.interactive && size.w >= 1;
    aim.x = on ? clamp((hand.x - size.w / 2) / (size.w / 2), -1, 1) : 0;
    aim.y = on ? clamp((hand.y - size.h / 2) / (size.h / 2), -1, 1) : 0;
    return aim;
  };

  const shiftOf = (c: Config, z: number) =>
    PARALLAX *
    clamp(c.pointerStrength, 0, 1) *
    clamp(c.depth, 0, 1) *
    Math.pow(z, 1.2);

  /** One style of line, every line of a depth band in one path per pass. */
  const strokeBand = (
    from: number,
    to: number,
    points: number,
    margin: number,
    width: number,
    alpha: number,
    blur: number,
    accentOnly: boolean,
  ) => {
    if (!ctx || !cfg) return;
    const lines = cfg.lines;
    // A soft halo under the core reads as out of focus; in focus, the core alone.
    const passes = blur > 0.06 ? 2 : 1;
    for (let pass = 0; pass < passes; pass += 1) {
      const halo = passes === 2 && pass === 0;
      ctx.globalAlpha = clamp(
        halo ? alpha * 0.12 * blur : alpha * (1 - 0.6 * blur),
        0,
        1,
      );
      ctx.lineWidth = halo ? width * (1 + 4 * blur) : width * (1 + 0.5 * blur);
      ctx.beginPath();
      for (let i = from; i < to; i += 1) {
        if ((lines[i]?.accent ?? false) !== accentOnly) continue;
        const base = i * points;
        for (let k = 0; k < points; k += 1) {
          const x = -margin + k * STEP_X;
          const y = pts[base + k] ?? 0;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
  };

  const draw = () => {
    const c = cfg;
    if (!c || !ctx || !visible.current || size.w < 1) return;
    const { w, h, dpr } = size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const d = clamp(c.depth, 0, 1);
    const weight = clamp(c.thickness, 0.25, 3);
    const strength = clamp(c.contrast, 0, 1);
    const margin = PARALLAX + STEP_X * 2;
    const points = Math.ceil((w + margin * 2) / STEP_X) + 1;
    const lines = c.lines;
    if (pts.length < lines.length * points) {
      pts = new Float32Array(lines.length * points * 2);
    }
    for (let i = 0; i < lines.length; i += 1) {
      const l = lines[i];
      if (!l) continue;
      const z = shown(c, l.z);
      const shift = shiftOf(c, z);
      // Near lines move against the hand, so the field turns toward it.
      const sx = -hand.ox * shift;
      const sy = -hand.oy * shift * 0.5;
      const base = i * points;
      for (let k = 0; k < points; k += 1) {
        const x = -margin + k * STEP_X;
        pts[base + k] = lineY(l, x - sx, sim.t, w, h) + sy;
      }
    }
    // Lines come sorted far to near; a run in one depth band shares a style,
    // so the whole band is a few strokes rather than a few per line.
    let from = 0;
    while (from < lines.length) {
      const band = Math.min(
        BANDS - 1,
        Math.floor(shown(c, lines[from]?.z ?? 0) * BANDS),
      );
      let to = from;
      let sum = 0;
      let accent = false;
      while (to < lines.length) {
        const l = lines[to];
        if (!l) break;
        const z = shown(c, l.z);
        if (Math.min(BANDS - 1, Math.floor(z * BANDS)) !== band) break;
        sum += z;
        if (l.accent) accent = true;
        to += 1;
      }
      const z = sum / Math.max(1, to - from);
      const width = weight * (0.6 + 2.8 * Math.pow(z, 1.4));
      const alpha = strength * (0.95 - 0.62 * z) * (0.55 + 0.45 * strength);
      // Out of focus by distance from the focal plane: wider, fainter, haloed.
      const blur = clamp(Math.abs(z - lens.at) * 2.2, 0, 1) * (0.25 + 0.75 * d);
      ctx.strokeStyle = ink.line;
      strokeBand(from, to, points, margin, width, alpha, blur, false);
      if (accent) {
        // The accent stays legible however far it is from the focal plane.
        ctx.strokeStyle = ink.accent;
        strokeBand(
          from,
          to,
          points,
          margin,
          width,
          alpha * 1.5,
          blur * 0.5,
          true,
        );
      }
      from = to;
    }
    ctx.globalAlpha = 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** The line nearest a point, as drawn now: its depth. */
  const nearestDepth = (c: Config, x: number, y: number) => {
    let best = Infinity;
    let depth = rest(c);
    for (const l of c.lines) {
      const z = shown(c, l.z);
      const shift = shiftOf(c, z);
      const ly =
        lineY(l, x + hand.ox * shift, sim.t, size.w, size.h) -
        hand.oy * shift * 0.5;
      const gap = Math.abs(ly - y);
      if (gap < best) {
        best = gap;
        depth = z;
      }
    }
    return depth;
  };

  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    if (!c.paused && c.speed > 0) {
      sim.t += dt * clamp(c.speed, 0, 2);
      moving = true;
    }
    const { x: tx, y: ty } = parallaxTarget(c);
    // Racking in is a deliberate move (glide); falling back is a settle (drift).
    const pull = lens.racked ? GLIDE : DRIFT;
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let s = 0; s < steps; s += 1) {
      hand.vx +=
        ((GLIDE.stiffness * (tx - hand.ox) - GLIDE.damping * hand.vx) /
          GLIDE.mass) *
        h;
      hand.vy +=
        ((GLIDE.stiffness * (ty - hand.oy) - GLIDE.damping * hand.vy) /
          GLIDE.mass) *
        h;
      hand.ox += hand.vx * h;
      hand.oy += hand.vy * h;
      lens.v +=
        ((pull.stiffness * (lens.target - lens.at) - pull.damping * lens.v) /
          pull.mass) *
        h;
      lens.at += lens.v * h;
    }
    const shifting =
      Math.abs(tx - hand.ox) + Math.abs(ty - hand.oy) > 0.002 ||
      Math.abs(hand.vx) + Math.abs(hand.vy) > 0.01;
    if (!shifting) {
      hand.ox = tx;
      hand.oy = ty;
      hand.vx = 0;
      hand.vy = 0;
    }
    const focusing =
      Math.abs(lens.target - lens.at) > 0.001 || Math.abs(lens.v) > 0.005;
    if (!focusing) {
      lens.at = lens.target;
      lens.v = 0;
    }
    return moving || shifting || focusing;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c) {
      last = 0;
      return;
    }
    const calm =
      !hand.present &&
      hand.ox === 0 &&
      hand.oy === 0 &&
      !lens.racked &&
      lens.at === lens.target;
    if (calm && last && now - drawnAt < CALM_FRAME) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    const moving = c.motionSafe ? step(dt) : false;
    draw();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  /** Reduced motion: the field stands exactly where the hand and focus put it. */
  const place = () => {
    const c = cfg;
    if (!c) return;
    const { x: tx, y: ty } = parallaxTarget(c);
    hand.ox = tx;
    hand.oy = ty;
    hand.vx = 0;
    hand.vy = 0;
    lens.at = lens.target;
    lens.v = 0;
    sim.t = STILL;
  };

  const readColours = () => {
    const kids = carriers.children;
    const line = kids[0];
    const accent = kids[1];
    if (line) ink.line = getComputedStyle(line).color;
    ink.accent = accent ? getComputedStyle(accent).color : ink.line;
  };

  const resize = () => {
    const c = cfg;
    if (!c) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    if (size.w === w && size.h === h && size.dpr === dpr) return;
    size.w = w;
    size.h = h;
    size.dpr = dpr;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
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
        lens.at = rest(next);
        lens.target = lens.at;
        readColours();
        resize();
        return;
      }
      if (was.dpr !== next.dpr) {
        size.w = 0;
        resize();
      }
      if (!lens.racked) lens.target = rest(next);
      if (!next.interactive && hand.present) {
        hand.present = false;
        hand.source = null;
        setActive(false);
      }
      if (!next.motionSafe) place();
      draw();
      kick();
    },
    resize,
    readColours() {
      readColours();
      draw();
    },
    wake() {
      draw();
      kick();
    },
    handTo(x, y, source) {
      const c = cfg;
      if (!c || !c.interactive) return;
      hand.x = x;
      hand.y = y;
      hand.present = true;
      hand.source = source;
      setActive(true);
      if (!c.motionSafe) {
        place();
        draw();
        return;
      }
      kick();
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      setActive(false);
      if (cfg && !cfg.motionSafe) {
        place();
        draw();
        return;
      }
      kick();
    },
    rack(x, y, source) {
      const c = cfg;
      if (!c || !c.interactive || size.w < 1) return;
      lens.racked = source;
      lens.target = nearestDepth(c, x, y);
      tell(c, lens.target);
      if (!c.motionSafe) {
        place();
        draw();
        return;
      }
      kick();
    },
    unrack(source) {
      const c = cfg;
      if (!c || lens.racked !== source) return;
      lens.racked = null;
      lens.target = rest(c);
      tell(c, lens.target);
      if (!c.motionSafe) {
        place();
        draw();
        return;
      }
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
 * A background of long thin lines floating across the frame at different
 * depths. Each is a gentle seeded curve that drifts sideways at a pace set
 * by its depth — near lines faster, so time itself has parallax — and bobs
 * slowly on its own long period, so neighbours now and then cross and part.
 * Depth reads three ways: near lines are thicker, lower in contrast and out
 * of focus, far ones hair-thin and crisp; one line may carry the accent.
 *
 * The hand shifts the parallax: its offset from the middle, eased on the
 * glide spring, moves each line by its depth, so the field turns toward the
 * pointer. A press on the bare background racks focus to the depth of the
 * line nearest the pointer — the focal plane travels there on glide, that
 * depth sharpens and the rest soften — and on release it drifts back to
 * rest on the drift spring. Keyboard focus on a control inside racks focus
 * to the line nearest it. Canvas 2D, three strokes at most per line, 30
 * frames a second while drifting, nothing off screen or in a hidden page.
 * Under reduced motion the lines stand still at a seeded moment and the
 * parallax and focus land exactly where the hand puts them.
 */
export function DriftLines({
  children,
  count = 24,
  depth = 0.6,
  color = "var(--foreground)",
  accent = "var(--accent-bright)",
  thickness = 1,
  contrast = 0.6,
  curve = 0.5,
  speed = 0.6,
  focus = 0,
  interactive = true,
  pointerStrength = 0.6,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  onFocusChange,
  className,
}: DriftLinesProps) {
  const motionSafe = useMotionSafe();
  const lines = React.useMemo(
    () => layLines(count, curve, seed),
    [count, curve, seed],
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const reportActive = React.useRef(onActiveChange);
  const reportFocus = React.useRef(onFocusChange);
  const unlisten = React.useRef<(() => void) | null>(null);

  const config: Config = {
    depth,
    thickness,
    contrast,
    speed,
    focus,
    interactive,
    pointerStrength,
    paused,
    dpr,
    motionSafe,
    lines,
    onActive: (a) => reportActive.current?.(a),
    onFocus: (d, racked) => reportFocus.current?.(d, racked),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    reportActive.current = onActiveChange;
    reportFocus.current = onFocusChange;
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, visible);
    engine.current = e;
    e.configure(latest.current);
    const listening = unlisten;
    return () => {
      listening.current?.();
      e.dispose();
      if (engine.current === e) engine.current = null;
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
    };
  }, []);

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
    };
  };

  const letGo = () => {
    unlisten.current?.();
    engine.current?.unrack("pointer");
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    if (hit && rootRef.current?.contains(hit)) return;
    engine.current?.rack(at.x, at.y, "pointer");
    // Focus falls back wherever the press ends, on the field or not.
    unlisten.current?.();
    const id = event.pointerId;
    const end = (e: PointerEvent) => {
      if (e.pointerId === id) letGo();
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    unlisten.current = () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      unlisten.current = null;
    };
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    letGo();
    if (event.pointerType === "touch") engine.current?.handAway("pointer");
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") engine.current?.handAway("pointer");
  };

  // Keyboard focus on a control inside is a hand at that control, and the
  // lens racks to the line nearest it.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.handTo(at.x, at.y, "focus");
    engine.current?.rack(at.x, at.y, "focus");
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    engine.current?.unrack("focus");
    engine.current?.handAway("focus");
  };

  return (
    <div
      ref={bindRoot}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        // A sideways finger turns the field on touch; an upright one scrolls.
        "group/drift-lines relative isolate h-full w-full touch-pan-y overflow-clip",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <StillLines
        lines={lines}
        color={color}
        accent={accent ?? color}
        depth={depth}
        thickness={thickness}
        contrast={contrast}
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        <span className="transition-colors duration-1" style={{ color }} />
        <span
          className="transition-colors duration-1"
          style={{ color: accent ?? color }}
        />
      </span>
      <div className="relative z-10 size-full">{children}</div>
    </div>
  );
}

/**
 * The designed still frame for the server render and the first paint: the
 * same lines at the same seeded moment, drawn once in SVG on a fixed
 * 1000 × 300 field and stretched to the box, hidden as soon as the canvas
 * has drawn.
 */
function StillLines({
  lines,
  color,
  accent,
  depth,
  thickness,
  contrast,
}: {
  lines: Line[];
  color: string;
  accent: string;
  depth: number;
  thickness: number;
  contrast: number;
}) {
  const W = 1000;
  const H = 300;
  const d = clamp(depth, 0, 1);
  const strength = clamp(contrast, 0, 1);
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full group-data-live/drift-lines:hidden"
    >
      {lines.map((l, i) => {
        const z = 0.5 + (l.z - 0.5) * d;
        const parts: string[] = [];
        for (let x = 0; x <= W; x += 25) {
          parts.push(
            `${x === 0 ? "M" : "L"}${x} ${r1(lineY(l, x, STILL, W, H))}`,
          );
        }
        const alpha =
          strength *
          (0.95 - 0.62 * z) *
          (l.accent ? 1.5 : 1) *
          (0.55 + 0.45 * strength);
        return (
          <path
            key={i}
            d={parts.join(" ")}
            fill="none"
            stroke={l.accent ? accent : color}
            strokeOpacity={r2(clamp(alpha * 0.8, 0, 1))}
            strokeWidth={r2(
              clamp(thickness, 0.25, 3) * (0.6 + 2.8 * Math.pow(z, 1.4)),
            )}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}
