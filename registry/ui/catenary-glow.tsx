"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

export type CatenaryGlowProps = {
  /** Content over the sky: a headline, a reading, a call to action. */
  children?: React.ReactNode;
  /** How many lines are strung between the poles, 2 to 6. @default 4 */
  wires?: number;
  /** How deep the catenaries hang, 0 (taut) to 1 (slack). @default 0.5 */
  sag?: number;
  /** The colour of the current and the glow: 0 a cool white, 1 deep amber. @default 0.65 */
  warmth?: number;
  /** Distance between poles, in px. @default fitted so two to four poles show */
  span?: number;
  /** Time between currents, in ms. @default 5200 */
  interval?: number;
  /** How fast a current runs along a wire, in px per second. @default 460 */
  speed?: number;
  /** How readily a brush sets the wires swinging, 0 to 1. @default 0.6 */
  sway?: number;
  /** A few faint early stars. @default true */
  stars?: boolean;
  /** The pointer and keys can set the wires swaying. @default true */
  interactive?: boolean;
  /** Hold the currents; the wires still sway when brushed. @default false */
  paused?: boolean;
  /** Fires when a tap, click or key plucks a wire, with its index from the top. */
  onPluck?: (wire: number) => void;
  /** The scene's accessible name, for the keyboard's way in. @default "Power lines at dusk" */
  label?: string;
  /** Shows the scene but takes no input. @default false */
  disabled?: boolean;
  /** Sizes the scene; it fills its parent by default. */
  className?: string;
};

const STEP = 1 / 120;
const NODES = 24;

const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";
/** Seconds for a ripple to cross a span, and the damping that ends it in ~2.5 s. */
const CROSS = 0.4;
const DAMP = 2.4;
const STAGGER = 0.28;
const PULSE_HEAD = 34;
const PULSE_TAIL = 150;
/** The catenary's shape constant: larger hangs more like chain, less like a parabola. */
const SHAPE = 1.4;

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function hash(a: number, b: number): number {
  let h =
    Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Normalised catenary: 1 at mid-span, 0 at either insulator. */
const COSH_K = Math.cosh(SHAPE);
const hang = (t: number) => (Math.cosh(SHAPE * t) - COSH_K) / (1 - COSH_K);

type Scene = {
  w: number;
  h: number;
  span: number;
  poles: number[];
  /** Each wire's attach height and sag depth, px. */
  rows: { y: number; depth: number; side: number }[];
  hill: string;
  farHill: string;
  starList: { x: number; y: number; r: number; o: number }[];
};

function sceneOf(
  w: number,
  h: number,
  wires: number,
  sag: number,
  spanProp?: number,
): Scene {
  const visibleSpans = Math.max(1, Math.round(w / 300));
  const span = r1(
    clamp(spanProp ?? w / (visibleSpans + 0.3), 120, Math.max(160, w * 1.2)),
  );
  const start = r1(span * 0.15);
  const poles: number[] = [];
  for (let x = start - span; x < w + span; x += span) poles.push(r1(x));
  const n = Math.round(clamp(wires, 2, 6));
  const ground = h * 0.8;
  const rows = Array.from({ length: n }, (_, i) => {
    const y = h * (0.2 + (0.36 * i) / Math.max(1, n - 1));
    // Higher lines are heavier conductors and hang a little more.
    const want = span * (0.03 + 0.14 * clamp(sag)) * (1.12 - 0.05 * i);
    const depth = Math.max(2, Math.min(want, ground - 8 - y));
    return { y: r1(y), depth: r1(depth), side: i % 2 ? 1 : -1 };
  });
  const hillAt = (x: number, base: number, a: number, seed: number) =>
    base +
    a * Math.sin(x / (w * 0.21) + seed) +
    a * 0.5 * Math.sin(x / (w * 0.083) + seed * 2.3);
  const strip = (base: number, a: number, seed: number) => {
    const parts = [`M 0 ${r1(h)}`];
    for (let x = 0; x <= w + 8; x += 8) {
      parts.push(`L ${r1(Math.min(x, w))} ${r1(hillAt(x, base, a, seed))}`);
    }
    parts.push(`L ${r1(w)} ${r1(h)} Z`);
    return parts.join(" ");
  };
  const starList = Array.from({ length: 16 }, (_, i) => ({
    x: r1(hash(i, 3) * w),
    y: r1(hash(i, 5) * h * 0.42 + h * 0.03),
    r: r2(0.5 + hash(i, 7) * 0.8),
    o: r2(0.25 + hash(i, 9) * 0.5),
  }));
  return {
    w,
    h,
    span,
    poles,
    rows,
    hill: strip(h * 0.86, h * 0.025, 1.7),
    farHill: strip(h * 0.79, h * 0.03, 0.4),
    starList,
  };
}

/** The rest shape of wire `k` at x, between the poles around it. */
function restY(s: Scene, k: number, x: number): number {
  const row = s.rows[k];
  if (!row) return 0;
  const first = s.poles[0] ?? 0;
  const j = Math.floor((x - first) / s.span);
  const a = first + j * s.span;
  const t = ((x - a) / s.span) * 2 - 1;
  return row.y + row.depth * hang(clamp(t, -1, 1));
}

function restPath(s: Scene, k: number): string {
  const row = s.rows[k];
  if (!row) return "";
  const parts: string[] = [];
  for (let p = 0; p < s.poles.length - 1; p += 1) {
    const a = (s.poles[p] ?? 0) + row.side * 5;
    const b = (s.poles[p + 1] ?? 0) + row.side * 5;
    for (let i = p === 0 ? 0 : 1; i < NODES; i += 1) {
      const t = i / (NODES - 1);
      const x = a + (b - a) * t;
      const y = row.y + row.depth * hang(t * 2 - 1);
      parts.push(`${i === 0 && p === 0 ? "M" : "L"} ${r1(x)} ${r1(y)}`);
    }
  }
  return parts.join(" ");
}

type Wire = {
  /** Per span, per node: vertical displacement and its rate. */
  u: Float32Array[];
  v: Float32Array[];
  moving: boolean;
  /** Its path still shows motion and must be written once more at rest. */
  dirty: boolean;
  energy: number;
  flash: number;
};

type Pulse = { start: number; dir: 1 | -1 } | null;

const COOL = "oklch(from var(--accent) 0.92 0.05 h)";
const WARM = "oklch(from var(--warn) 0.82 0.16 calc(h - 28))";

/**
 * Power lines strung between wooden poles across a dusk sky, hanging in true
 * catenary sags and glowing faintly. Every `interval` ms a warm current runs
 * along each wire in turn — a short bright pulse with a long fading tail,
 * its halo widening as it passes — like a slow current through the grid.
 *
 * Every span is a string held at both insulators, integrated as a damped
 * wave at 120 Hz: when the pointer brushes across a wire, the node it
 * crossed takes an impulse from the stroke, and a gentle travelling wave
 * runs out both ways, reflects at the poles and dies away, the wire glowing
 * a little brighter while it moves. The scene is one SVG; per frame only the
 * moving wires' paths and the pulse gradients are written, and the loop stops
 * when nothing travels.
 *
 * The keyboard's way in is a transparent button behind the content: Up and
 * Down choose a wire, Left and Right move the pluck point, Enter or Space
 * plucks it. Under reduced motion nothing travels or sways: each wire's
 * glow fades in and out where it hangs, and a brush brightens a wire instead.
 */
export function CatenaryGlow({
  children,
  wires = 4,
  sag = 0.5,
  warmth = 0.65,
  span,
  interval = 5200,
  speed = 460,
  sway = 0.6,
  stars = true,
  interactive = true,
  paused = false,
  onPluck,
  label = "Power lines at dusk",
  disabled = false,
  className,
}: CatenaryGlowProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const [box, setBox] = React.useState({ w: 720, h: 208 });
  const count = Math.round(clamp(wires, 2, 6));
  const scene = React.useMemo(
    () => sceneOf(box.w, box.h, count, sag, span),
    [box.w, box.h, count, sag, span],
  );
  const heat = Math.round(clamp(warmth) * 100);
  const currentColour = `color-mix(in oklab, ${WARM} ${heat}%, ${COOL})`;
  const glowColour = `color-mix(in oklab, ${WARM} ${Math.round(heat * 0.3)}%, ${COOL})`;
  const live = interactive && !disabled;

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [pick, setPick] = React.useState<{ wire: number; x: number } | null>(
    null,
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const pathRefs = React.useRef<(SVGPathElement | null)[]>([]);
  const haloRefs = React.useRef<(SVGUseElement | null)[]>([]);
  const pulseRefs = React.useRef<(SVGGElement | null)[]>([]);
  const gradRefs = React.useRef<(SVGLinearGradientElement | null)[]>([]);
  const markRef = React.useRef<SVGCircleElement | null>(null);
  const sim = React.useRef<Wire[]>([]);
  const pulses = React.useRef<Pulse[]>([]);
  const clock = React.useRef(0);
  const lastDir = React.useRef<1 | -1>(-1);
  const frame = React.useRef(0);
  const last = React.useRef(0);
  const carry = React.useRef(0);
  const visible = React.useRef(false);
  const timer = React.useRef<number | null>(null);
  const firstRun = React.useRef(true);
  const prev = React.useRef<{ x: number; y: number; t: number } | null>(null);
  const down = React.useRef<{ id: number; x: number; y: number } | null>(null);

  const latest = React.useRef({
    scene,
    speed,
    sway,
    interval,
    paused,
    motionSafe,
    live,
    pick,
    onPluck,
  });
  React.useEffect(() => {
    latest.current = {
      scene,
      speed,
      sway,
      interval,
      paused,
      motionSafe,
      live,
      pick,
      onPluck,
    };
  });

  /** The wire's shape now: rest plus each node's displacement. */
  const wirePath = (s: Scene, k: number, w: Wire): string => {
    const row = s.rows[k];
    if (!row) return "";
    const parts: string[] = [];
    for (let p = 0; p < s.poles.length - 1; p += 1) {
      const a = (s.poles[p] ?? 0) + row.side * 5;
      const b = (s.poles[p + 1] ?? 0) + row.side * 5;
      const u = w.u[p];
      for (let i = p === 0 ? 0 : 1; i < NODES; i += 1) {
        const t = i / (NODES - 1);
        const y = row.y + row.depth * hang(t * 2 - 1) + (u?.[i] ?? 0);
        parts.push(
          `${i === 0 && p === 0 ? "M" : "L"} ${r1(a + (b - a) * t)} ${r1(y)}`,
        );
      }
    }
    return parts.join(" ");
  };

  /** The wire's current height at x, rest plus displacement. */
  const wireY = (s: Scene, k: number, x: number): number => {
    const w = sim.current[k];
    const row = s.rows[k];
    if (!w || !row) return restY(s, k, x);
    const first = (s.poles[0] ?? 0) + row.side * 5;
    const j = Math.floor((x - first) / s.span);
    const u = w.u[j];
    const t = (x - (first + j * s.span)) / s.span;
    const f = clamp(t) * (NODES - 1);
    const i = Math.floor(f);
    const disp = u
      ? (u[i] ?? 0) +
        ((u[Math.min(NODES - 1, i + 1)] ?? 0) - (u[i] ?? 0)) * (f - i)
      : 0;
    return row.y + row.depth * hang(clamp(t) * 2 - 1) + disp;
  };

  /** An impulse at x on wire k, spread over three nodes. */
  const strike = (k: number, x: number, impulse: number) => {
    const s = latest.current.scene;
    const w = sim.current[k];
    const row = s.rows[k];
    if (!w || !row) return;
    const first = (s.poles[0] ?? 0) + row.side * 5;
    const j = Math.floor((x - first) / s.span);
    const v = w.v[j];
    if (!v) return;
    const i = Math.round(((x - (first + j * s.span)) / s.span) * (NODES - 1));
    for (let d = -2; d <= 2; d += 1) {
      const n = i + d;
      if (n <= 0 || n >= NODES - 1) continue;
      v[n] = (v[n] ?? 0) + impulse * Math.exp(-(d * d) / 2);
    }
    w.moving = true;
    w.dirty = true;
    w.flash = 1;
  };

  const writeWire = (k: number) => {
    const s = latest.current.scene;
    const w = sim.current[k];
    const node = pathRefs.current[k];
    if (!w || !node) return;
    node.setAttribute("d", wirePath(s, k, w));
  };

  const writeGlow = (k: number) => {
    const w = sim.current[k];
    const halo = haloRefs.current[k];
    if (!w || !halo) return;
    const picked = latest.current.pick?.wire === k ? 0.18 : 0;
    halo.setAttribute(
      "opacity",
      String(
        r3(clamp(0.12 + picked + w.energy * 0.5 + w.flash * 0.25, 0, 0.75)),
      ),
    );
  };

  const writePulse = (k: number, now: number) => {
    const s = latest.current.scene;
    const grad = gradRefs.current[k];
    const use = pulseRefs.current[k];
    if (!grad || !use) return;
    const p = pulses.current[k];
    if (!latest.current.motionSafe) {
      // Reduced motion: the glow fades in where the wire hangs, and out.
      // The gradient is stretched so the whole wire sits in its bright part.
      grad.setAttribute("x1", String(r1(-4 * s.w)));
      grad.setAttribute("x2", String(r1(1.556 * s.w)));
      let o = 0;
      if (p) {
        const t = now - p.start;
        o = t < 0 ? 0 : t < 0.4 ? t / 0.4 : t < 0.8 ? 1 - (t - 0.4) / 0.4 : 0;
      }
      use.setAttribute("opacity", String(r3(o * 0.55)));
      return;
    }
    use.setAttribute("opacity", p ? "1" : "0");
    if (!p) return;
    const travel = s.w + PULSE_HEAD + PULSE_TAIL;
    const t = Math.max(0, now - p.start);
    const pos =
      p.dir === 1
        ? -PULSE_HEAD + t * latest.current.speed
        : s.w + PULSE_HEAD - t * latest.current.speed;
    const tail = pos - p.dir * PULSE_TAIL;
    const head = pos + p.dir * PULSE_HEAD;
    grad.setAttribute("x1", String(r1(tail)));
    grad.setAttribute("x2", String(r1(head)));
    if (t * latest.current.speed > travel) pulses.current[k] = null;
  };

  const integrate = (dt: number): boolean => {
    const s = latest.current.scene;
    const c = s.span / CROSS;
    const dx = s.span / (NODES - 1);
    const k2 = (c * c) / (dx * dx);
    let moving = false;
    sim.current.forEach((w) => {
      w.flash = Math.max(0, w.flash - dt / 0.45);
      if (w.flash > 0) moving = true;
      if (!w.moving) {
        w.energy = Math.max(0, w.energy - dt * 2);
        return;
      }
      let peak = 0;
      let speedSum = 0;
      for (let p = 0; p < w.u.length; p += 1) {
        const u = w.u[p];
        const v = w.v[p];
        if (!u || !v) continue;
        for (let i = 1; i < NODES - 1; i += 1) {
          const a =
            k2 * ((u[i - 1] ?? 0) - 2 * (u[i] ?? 0) + (u[i + 1] ?? 0)) -
            DAMP * (v[i] ?? 0);
          v[i] = (v[i] ?? 0) + a * dt;
        }
        for (let i = 1; i < NODES - 1; i += 1) {
          const ui = (u[i] ?? 0) + (v[i] ?? 0) * dt;
          u[i] = ui;
          peak = Math.max(peak, Math.abs(ui));
          speedSum += Math.abs(v[i] ?? 0);
        }
      }
      w.energy = clamp(peak / 14);
      if (peak < 0.06 && speedSum < 2) {
        for (const u of w.u) u.fill(0);
        for (const v of w.v) v.fill(0);
        w.moving = false;
        w.energy = 0;
      }
      moving = true;
    });
    return moving;
  };

  const tick = (now: number) => {
    frame.current = 0;
    if (!visible.current || document.hidden) {
      last.current = 0;
      return;
    }
    const dt = last.current
      ? Math.min(1 / 30, (now - last.current) / 1000)
      : 1 / 60;
    last.current = now;
    clock.current += dt;
    carry.current += dt;
    const ms = latest.current.motionSafe;
    let moving = false;
    let steps = 0;
    while (carry.current >= STEP && steps < 6) {
      carry.current -= STEP;
      steps += 1;
      if (ms) {
        if (integrate(STEP)) moving = true;
      } else {
        for (const w of sim.current) {
          w.flash = Math.max(0, w.flash - STEP / 0.45);
          if (w.flash > 0) moving = true;
        }
      }
    }
    if (steps === 0) moving = true;
    const t = clock.current;
    for (let k = 0; k < sim.current.length; k += 1) {
      const w = sim.current[k];
      if (!w) continue;
      if (w.dirty) {
        writeWire(k);
        w.dirty = w.moving;
      }
      writeGlow(k);
      writePulse(k, t);
      if (pulses.current[k]) moving = true;
    }
    const mark = markRef.current;
    const pk = latest.current.pick;
    if (mark && pk) {
      mark.setAttribute("cx", String(r1(pk.x)));
      mark.setAttribute(
        "cy",
        String(r1(wireY(latest.current.scene, pk.wire, pk.x))),
      );
    }
    if (moving) frame.current = window.requestAnimationFrame(tick);
    else {
      last.current = 0;
      carry.current = 0;
      api.current.schedule();
    }
  };

  const kick = () => {
    if (frame.current) return;
    if (!visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(tick);
  };

  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const runCurrent = () => {
    clearTimer();
    const n = sim.current.length;
    const dir: 1 | -1 = lastDir.current === 1 ? -1 : 1;
    lastDir.current = dir;
    const t = clock.current;
    // The wires take their turn from the top line down.
    pulses.current = Array.from({ length: n }, (_, k) => ({
      start: t + k * STAGGER,
      dir,
    }));
    kick();
  };

  const schedule = () => {
    const l = latest.current;
    if (timer.current !== null) return;
    if (pulses.current.some(Boolean)) return;
    if (l.paused || !visible.current || document.hidden) return;
    const wait = firstRun.current ? 1100 : Math.max(1500, l.interval);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      firstRun.current = false;
      runCurrent();
    }, wait);
  };

  const api = React.useRef({ kick, schedule, clearTimer, writeWire });
  React.useEffect(() => {
    api.current = { kick, schedule, clearTimer, writeWire };
  });

  // A new scene (size, count, sag, span) starts every wire at rest.
  React.useEffect(() => {
    sim.current = scene.rows.map(() => ({
      u: scene.poles.slice(1).map(() => new Float32Array(NODES)),
      v: scene.poles.slice(1).map(() => new Float32Array(NODES)),
      moving: false,
      dirty: false,
      energy: 0,
      flash: 0,
    }));
    pulses.current = scene.rows.map(() => null);
    for (let k = 0; k < scene.rows.length; k += 1) api.current.writeWire(k);
  }, [scene]);

  React.useEffect(() => {
    api.current.clearTimer();
    api.current.schedule();
    const t = timer;
    return () => {
      if (t.current !== null) window.clearTimeout(t.current);
      t.current = null;
    };
  }, [paused, interval, motionSafe]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        api.current.clearTimer();
        return;
      }
      api.current.kick();
      api.current.schedule();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    const loop = frame;
    return () => {
      if (loop.current) window.cancelAnimationFrame(loop.current);
      loop.current = 0;
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      const w = Math.round(node.clientWidth);
      const h = Math.round(node.clientHeight);
      if (w < 1 || h < 1) return;
      setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) {
        api.current.kick();
        api.current.schedule();
      } else api.current.clearTimer();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    const rect = root?.getBoundingClientRect();
    if (!root || !rect) return { x: 0, y: 0 };
    // The SVG covers the box (slice), so box px are scene px once measured.
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  /** A stroke from the last point to this one: every wire it crossed is struck. */
  const brushTo = (x: number, y: number, t: number) => {
    const l = latest.current;
    const before = prev.current;
    prev.current = { x, y, t };
    if (!l.live || !before) return;
    const s = l.scene;
    const dt = Math.max(0.008, (t - before.t) / 1000);
    const vy = clamp((y - before.y) / dt, -900, 900);
    const vx = clamp((x - before.x) / dt, -900, 900);
    let struck = false;
    for (let k = 0; k < s.rows.length; k += 1) {
      const a = before.y - wireY(s, k, before.x);
      const b = y - wireY(s, k, x);
      if (a === 0 || Math.sign(a) === Math.sign(b)) continue;
      const f = a / (a - b);
      const cx = before.x + (x - before.x) * f;
      // The push follows the stroke; a sideways stroke still nudges it.
      const push = vy + Math.sign(vy || 1) * Math.abs(vx) * 0.15;
      if (l.motionSafe) strike(k, cx, push * 0.32 * clamp(l.sway));
      else {
        const w = sim.current[k];
        if (w) w.flash = 1;
      }
      struck = true;
    }
    if (struck) kick();
  };

  /** A tap or click near a wire plucks it there. */
  const pluckNear = (x: number, y: number) => {
    const l = latest.current;
    if (!l.live) return;
    const s = l.scene;
    let best = -1;
    let gap = 26;
    for (let k = 0; k < s.rows.length; k += 1) {
      const d = Math.abs(y - wireY(s, k, x));
      if (d < gap) {
        gap = d;
        best = k;
      }
    }
    if (best < 0) return;
    if (l.motionSafe) strike(best, x, 220 * (0.4 + clamp(l.sway)));
    else {
      const w = sim.current[best];
      if (w) w.flash = 1;
    }
    kick();
    l.onPluck?.(best);
  };

  const pluck = () => {
    const pk = latest.current.pick;
    if (!pk) return;
    if (latest.current.motionSafe) {
      strike(pk.wire, pk.x, 260 * (0.4 + clamp(latest.current.sway)));
    } else {
      const w = sim.current[pk.wire];
      if (w) w.flash = 1;
    }
    kick();
    onPluck?.(pk.wire);
    setSaid((s) => ({ n: s.n + 1, text: `Wire ${pk.wire + 1} plucked.` }));
  };

  const choose = (next: { wire: number; x: number } | null) => {
    latest.current.pick = next;
    setPick(next);
    kick();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!live) return;
    const s = scene;
    const pk = pick ?? { wire: 0, x: s.w / 2 };
    const stepX = Math.max(12, s.span / 8);
    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        choose({ ...pk, wire: Math.max(0, pk.wire - (pick ? 1 : 0)) });
        break;
      case "ArrowDown":
        event.preventDefault();
        choose({
          ...pk,
          wire: Math.min(s.rows.length - 1, pk.wire + (pick ? 1 : 0)),
        });
        break;
      case "ArrowLeft":
        event.preventDefault();
        choose({ ...pk, x: clamp(pk.x - stepX, 8, s.w - 8) });
        break;
      case "ArrowRight":
        event.preventDefault();
        choose({ ...pk, x: clamp(pk.x + stepX, 8, s.w - 8) });
        break;
      case "Escape":
        if (pick) {
          event.preventDefault();
          choose(null);
        }
        break;
      default:
        break;
    }
  };

  const markY = pick ? r1(restY(scene, pick.wire, pick.x)) : 0;

  return (
    <div
      ref={bindRoot}
      onPointerMove={(event) => {
        if (!live) return;
        if (event.pointerType === "touch" && event.buttons === 0) return;
        const at = local(event.clientX, event.clientY);
        brushTo(at.x, at.y, event.timeStamp);
      }}
      onPointerDown={(event) => {
        if (!live) return;
        const at = local(event.clientX, event.clientY);
        prev.current = { x: at.x, y: at.y, t: event.timeStamp };
        // The content's own controls keep their presses: no pluck under them.
        const target = event.target instanceof Element ? event.target : null;
        const hit = target?.closest(INTERACTIVE);
        if (hit && rootRef.current?.contains(hit)) {
          down.current = null;
          return;
        }
        down.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        };
      }}
      onPointerLeave={() => {
        prev.current = null;
      }}
      onPointerUp={(event) => {
        if (!live) return;
        const start = down.current;
        down.current = null;
        if (!start || event.pointerId !== start.id) return;
        // A press that did not travel is a pluck where it landed.
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6)
          return;
        const at = local(event.clientX, event.clientY);
        pluckNear(at.x, at.y);
      }}
      onPointerCancel={() => {
        down.current = null;
        prev.current = null;
      }}
      className={cn(
        "group/catenary-glow relative isolate h-full w-full touch-pan-y overflow-clip rounded-3 [contain:paint] select-none",
        disabled && "opacity-70",
        className,
      )}
    >
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
        viewBox={`0 0 ${scene.w} ${scene.h}`}
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0"
              style={{
                stopColor: "oklch(from var(--accent) 0.2 0.06 calc(h + 6))",
              }}
            />
            <stop
              offset="0.5"
              style={{
                stopColor: "oklch(from var(--accent) 0.36 0.07 calc(h + 40))",
              }}
            />
            <stop
              offset="0.74"
              style={{
                stopColor: "oklch(from var(--danger) 0.6 0.09 calc(h - 4))",
              }}
            />
            <stop
              offset="0.9"
              style={{
                stopColor: "oklch(from var(--warn) 0.82 0.1 calc(h - 24))",
              }}
            />
          </linearGradient>
          {scene.rows.map((_, k) => (
            <React.Fragment key={k}>
              <path
                id={`${uid}-wire-${k}`}
                ref={(node) => {
                  pathRefs.current[k] = node;
                }}
                d={restPath(scene, k)}
              />
              <linearGradient
                id={`${uid}-pulse-${k}`}
                ref={(node) => {
                  gradRefs.current[k] = node;
                }}
                gradientUnits="userSpaceOnUse"
                x1={-2000}
                x2={-1800}
                y1={0}
                y2={0}
              >
                <stop
                  offset="0"
                  style={{ stopColor: currentColour, stopOpacity: 0 }}
                />
                <stop
                  offset="0.72"
                  style={{ stopColor: currentColour, stopOpacity: 0.5 }}
                />
                <stop
                  offset="0.9"
                  style={{
                    stopColor: `color-mix(in oklab, ${currentColour} 70%, white)`,
                    stopOpacity: 1,
                  }}
                />
                <stop
                  offset="1"
                  style={{ stopColor: currentColour, stopOpacity: 0 }}
                />
              </linearGradient>
            </React.Fragment>
          ))}
        </defs>
        <rect width={scene.w} height={scene.h} fill={`url(#${uid}-sky)`} />
        {stars
          ? scene.starList.map((st, i) => (
              <circle
                key={i}
                cx={st.x}
                cy={st.y}
                r={st.r}
                opacity={st.o}
                style={{ fill: "oklch(from var(--warn) 0.97 0.02 h)" }}
              />
            ))
          : null}
        <path
          d={scene.farHill}
          style={{ fill: "oklch(from var(--accent) 0.3 0.04 calc(h + 30))" }}
        />
        {scene.poles.map((x, p) => {
          const top = r1(scene.h * 0.13);
          const arm = r1(scene.h * 0.17);
          const half = r1(Math.max(14, scene.h * 0.09));
          return (
            <g
              key={p}
              style={{
                fill: "oklch(from var(--accent) 0.14 0.02 h)",
                stroke: "oklch(from var(--accent) 0.14 0.02 h)",
              }}
            >
              <rect
                x={r1(x - 1.75)}
                y={top}
                width={3.5}
                height={r1(scene.h - top)}
                stroke="none"
              />
              <rect
                x={r1(x - half)}
                y={arm}
                width={r1(half * 2)}
                height={2.5}
                stroke="none"
              />
              <line
                x1={r1(x - half * 0.6)}
                y1={r1(arm + 2)}
                x2={r1(x)}
                y2={r1(arm + half * 0.7)}
                strokeWidth={1.2}
              />
              <line
                x1={r1(x + half * 0.6)}
                y1={r1(arm + 2)}
                x2={r1(x)}
                y2={r1(arm + half * 0.7)}
                strokeWidth={1.2}
              />
              {scene.rows.map((row, k) => (
                <rect
                  key={k}
                  x={r1(x + row.side * 5 - 1.5)}
                  y={r1(row.y - 3)}
                  width={3}
                  height={4.5}
                  rx={1}
                  stroke="none"
                />
              ))}
            </g>
          );
        })}
        {scene.rows.map((_, k) => (
          <g key={k} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <use
              ref={(node) => {
                haloRefs.current[k] = node;
              }}
              href={`#${uid}-wire-${k}`}
              strokeWidth={4}
              opacity={0.12}
              style={{ stroke: glowColour }}
            />
            <use
              href={`#${uid}-wire-${k}`}
              strokeWidth={1}
              opacity={0.9}
              style={{
                stroke: `color-mix(in oklab, ${glowColour} 38%, oklch(from var(--accent) 0.14 0.02 h))`,
              }}
            />
          </g>
        ))}
        {scene.rows.map((_, k) => (
          <g
            key={k}
            ref={(node) => {
              pulseRefs.current[k] = node;
            }}
            fill="none"
            strokeLinecap="round"
            opacity={0}
          >
            <use
              href={`#${uid}-wire-${k}`}
              strokeWidth={9}
              opacity={0.3}
              stroke={`url(#${uid}-pulse-${k})`}
            />
            <use
              href={`#${uid}-wire-${k}`}
              strokeWidth={2}
              stroke={`url(#${uid}-pulse-${k})`}
            />
          </g>
        ))}
        <path
          d={scene.hill}
          style={{ fill: "oklch(from var(--accent) 0.16 0.03 calc(h + 20))" }}
        />
        {pick ? (
          <circle
            ref={markRef}
            cx={r1(pick.x)}
            cy={markY}
            r={4}
            fill="none"
            strokeWidth={1.5}
            style={{ stroke: "var(--ring)" }}
          />
        ) : null}
      </svg>
      <div className="relative z-10 size-full">{children}</div>
      <button
        type="button"
        aria-label={label}
        aria-describedby={hintId}
        disabled={disabled || !interactive}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          if (!live || !event.currentTarget.matches(":focus-visible")) return;
          if (!pick) choose({ wire: 0, x: scene.w / 2 });
        }}
        onBlur={() => choose(null)}
        onClick={(event) => {
          if (!live) return;
          if (event.detail === 0) {
            if (!pick) choose({ wire: 0, x: scene.w / 2 });
            pluck();
          }
        }}
        className={cn(
          "absolute inset-0 z-0 size-full rounded-[inherit] outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      <p id={hintId} className="sr-only">
        Brush across the wires, or tap one, to set them swaying. Up and Down
        choose a wire, Left and Right move along it, Enter or Space plucks it,
        Escape lets go.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
