"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type DotLensLattice = "square" | "hex";
export type DotLensRest = "center" | "hidden" | "drift";

export type DotLensProps = {
  /** The lens radius, px; never more than 0.6 of the box's short side. @default 96 */
  radius?: number;
  /** Magnification, 0 to 1. @default 0.6 */
  power?: number;
  /** A resting dot's diameter, px. @default 2 */
  dot?: number;
  /** Spacing between dots, px. @default 14 */
  gap?: number;
  /** How the dots are laid: a square grid or a hexagonal one. @default "square" */
  lattice?: DotLensLattice;
  /** The dots' colour. @default "var(--ink-3)" */
  color?: string;
  /** The colour at the lens centre and on a pulse. @default "var(--accent-bright)" */
  accent?: string;
  /** How far dots under the lens lean toward `accent`, 0 to 1. @default 0.6 */
  glow?: number;
  /** How far the lens trails the pointer, 0 (the flick spring) to 1 (the drift spring). @default 0.5 */
  lag?: number;
  /** Strength of the ring a click sends through the grid, 0 to 1. @default 0.6 */
  pulse?: number;
  /** Where the lens goes when nobody leads it: parked in the middle, deflated away, or wandering. @default "center" */
  rest?: DotLensRest;
  /** The pointer and the keyboard lead the lens and send rings; false leaves it at rest. @default true */
  interactive?: boolean;
  /** The highest device pixel ratio drawn, capped at 2. @default 2 */
  dpr?: number;
  /** The accessible name of the keyboard surface. @default "Dot lens" */
  label?: string;
  /** Fires when a ring is sent: a click, a tap, Enter or Space. */
  onPulse?: () => void;
  /** Fires when the pointer or the keys start (true) or stop (false) leading the lens. */
  onLeadChange?: (leading: boolean) => void;
  /** Content over the field, in its own layer. */
  children?: React.ReactNode;
  /** Size the box here. @default "aspect-[2/1] w-full" */
  className?: string;
};

/** How fast a ring runs out through the grid, px/s. */
const RING_SPEED = 520;
/** How long a ring lives, s. */
const RING_LIFE = 2.4;
/** How long a reduced-motion pulse tints its ring, ms. */
const STILL_PULSE = 240;
const BUCKETS = 5;
/** Presses on the content's own controls are theirs, not the lens's. */
const CONTROLS =
  "a,button,input,select,textarea,label,summary,[role='button'],[role='link'],[contenteditable='true']";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type Rgb = [number, number, number];

function readRgb(colour: string): Rgb {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [128, 128, 128];
  ctx.fillStyle = "rgb(128, 128, 128)";
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
}

/**
 * The lens follows on a spring chosen by `lag`: the flick constants at 0, glide
 * at 0.5, drift at 1, stiffness interpolated in log space so the middle of the
 * dial feels as even as its ends.
 */
function followSpring(lag: number) {
  const t = clamp01(lag);
  const unit = (s: { stiffness: number; damping: number; mass: number }) => ({
    k: s.stiffness / s.mass,
    z: s.damping / s.mass / (2 * Math.sqrt(s.stiffness / s.mass)),
  });
  const a = t < 0.5 ? unit(springs.flick) : unit(springs.glide);
  const b = t < 0.5 ? unit(springs.glide) : unit(springs.drift);
  const u = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  const k = Math.exp(lerp(Math.log(a.k), Math.log(b.k), u));
  const z = lerp(a.z, b.z, u);
  return { k, c: 2 * z * Math.sqrt(k) };
}

type Field = {
  n: number;
  rx: Float32Array;
  ry: Float32Array;
  x: Float32Array;
  y: Float32Array;
  r: Float32Array;
  b: Uint8Array;
};

function buildField(
  w: number,
  h: number,
  gap: number,
  lattice: DotLensLattice,
): Field {
  const g = Math.max(4, gap);
  const rowStep = lattice === "hex" ? g * 0.866 : g;
  const cols = Math.floor(w / g) + 1;
  const rows = Math.floor(h / rowStep) + 1;
  const ox = (w - (cols - 1) * g) / 2;
  const oy = (h - (rows - 1) * rowStep) / 2;
  const n = cols * rows;
  const f: Field = {
    n,
    rx: new Float32Array(n),
    ry: new Float32Array(n),
    x: new Float32Array(n),
    y: new Float32Array(n),
    r: new Float32Array(n),
    b: new Uint8Array(n),
  };
  let k = 0;
  for (let j = 0; j < rows; j += 1) {
    const shift = lattice === "hex" && j % 2 === 1 ? g / 2 : 0;
    for (let i = 0; i < cols; i += 1) {
      const x = ox + i * g + shift;
      if (shift && x > w) continue;
      f.rx[k] = x;
      f.ry[k] = oy + j * rowStep;
      k += 1;
    }
  }
  f.n = k;
  return f;
}

type Ring = { x: number; y: number; age: number };

type Sim = {
  field: Field | null;
  w: number;
  h: number;
  t: number;
  lens: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    tx: number;
    ty: number;
  };
  power: { p: number; v: number; target: number; throb: number };
  lead: { on: boolean; keyboard: boolean; touch: number };
  rings: Ring[];
  still: { x: number; y: number } | null;
};

/**
 * A quiet field of fine dots that swells into a fisheye lens. Each dot within
 * the lens is carried along its radius by the fisheye map g(u) = (m+1)u/(mu+1):
 * near the centre dots swell and push outward, toward the rim they pack into a
 * fine dark ring of compressed grain, and outside it nothing moves. The lens
 * trails the pointer on a spring set by `lag` (flick, glide or drift
 * constants), and its power swells in on the snap spring with one overshoot.
 * A click sends a ring out through the grid — dots at the wavefront are pushed
 * outward and swell for a moment — and the lens throbs on the recoil spring.
 *
 * The surface is a `role="application"`: focus brings the lens in, Arrow keys
 * move it, Home re-centres it, Enter or Space sends a ring, Escape lets it go
 * back to rest. Under reduced motion the lens sits where it is put, at once,
 * and a pulse tints a ring of dots for a moment instead of moving them.
 */
export function DotLens({
  radius = 96,
  power = 0.6,
  dot = 2,
  gap = 14,
  lattice = "square",
  color = "var(--ink-3)",
  accent = "var(--accent-bright)",
  glow = 0.6,
  lag = 0.5,
  pulse = 0.6,
  rest = "center",
  interactive = true,
  dpr = 2,
  label = "Dot lens",
  onPulse,
  onLeadChange,
  children,
  className,
}: DotLensProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const simRef = React.useRef<Sim | null>(null);
  const inksRef = React.useRef<string[] | null>(null);
  const leading = React.useRef(false);
  const loop = React.useRef({
    raf: 0,
    last: 0,
    seen: false,
    draw: 0,
    timer: 0,
  });
  const api = React.useRef<{
    resize: () => void;
    wake: () => void;
    sleep: () => void;
    draw: () => void;
  } | null>(null);

  const cap = Math.min(2, Math.max(0.5, dpr));

  const getSim = () => {
    if (!simRef.current) {
      simRef.current = {
        field: null,
        w: 0,
        h: 0,
        t: 0,
        lens: { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 },
        power: { p: 0, v: 0, target: 0, throb: 0 },
        lead: { on: false, keyboard: false, touch: 0 },
        rings: [],
        still: null,
      };
    }
    return simRef.current;
  };

  /** Where the lens rests when nobody leads it, at time t. */
  const restAt = (s: Sim, t: number): [number, number] =>
    rest === "drift"
      ? [
          s.w * (0.5 + 0.3 * Math.sin(t * 0.23) * Math.cos(t * 0.09)),
          s.h * (0.5 + 0.22 * Math.sin(t * 0.31 + 0.8)),
        ]
      : [s.w / 2, s.h / 2];

  const readInks = () => {
    const node = canvasRef.current;
    if (!node) return null;
    const cs = getComputedStyle(node);
    const base = readRgb(cs.color);
    const hot = readRgb(cs.borderTopColor);
    const inks: string[] = [];
    for (let b = 0; b < BUCKETS; b += 1) {
      const t = b / (BUCKETS - 1);
      inks.push(
        `rgb(${Math.round(lerp(base[0], hot[0], t))}, ${Math.round(lerp(base[1], hot[1], t))}, ${Math.round(lerp(base[2], hot[2], t))})`,
      );
    }
    inksRef.current = inks;
    return inks;
  };

  const draw = () => {
    const s = getSim();
    const f = s.field;
    const node = canvasRef.current;
    if (!f || !node || s.w < 2) return;
    const inks = inksRef.current ?? readInks();
    if (!inks) return;
    const ctx = node.getContext("2d");
    if (!ctx) return;
    // The server's flat field stands in only until the first real frame.
    node.style.backgroundImage = "none";
    const W = Math.max(1, Math.round(s.w * cap));
    const H = Math.max(1, Math.round(s.h * cap));
    if (node.width !== W) node.width = W;
    if (node.height !== H) node.height = H;
    ctx.setTransform(cap, 0, 0, cap, 0, 0);
    ctx.clearRect(0, 0, s.w, s.h);

    const R = Math.max(8, Math.min(radius, 0.6 * Math.min(s.w, s.h)));
    const m = 3.5 * Math.max(0, s.power.p);
    const lx = s.lens.x;
    const ly = s.lens.y;
    const base = Math.max(0.3, dot / 2);
    const g01 = clamp01(glow);
    const ringAmp = clamp01(pulse);
    const still = s.still;
    for (let i = 0; i < f.n; i += 1) {
      const rx = f.rx[i] ?? 0;
      const ry = f.ry[i] ?? 0;
      let x = rx;
      let y = ry;
      let size = 1;
      let tint = 0;
      const dx = rx - lx;
      const dy = ry - ly;
      const d = Math.hypot(dx, dy);
      if (m > 0.001 && d < R) {
        const u = d / R;
        const gU = ((m + 1) * u) / (m * u + 1);
        if (d > 1e-3) {
          x = lx + (dx / d) * gU * R;
          y = ly + (dy / d) * gU * R;
        }
        // Size follows the local area magnification: radial times tangential.
        const radial = (m + 1) / ((m * u + 1) * (m * u + 1));
        const tangential = u > 1e-3 ? gU / u : m + 1;
        // Linear magnification is the square root of the area's.
        size = clamp(Math.sqrt(radial * tangential), 0.5, 3.4);
        tint = (1 - u) * (1 - u) * g01 * Math.min(1, m / 2);
      }
      for (const ring of s.rings) {
        const ex = rx - ring.x;
        const ey = ry - ring.y;
        const sd = Math.hypot(ex, ey) || 1;
        const delta = sd - ring.age * RING_SPEED;
        if (delta < -70 || delta > 70) continue;
        const band = Math.exp(-(delta * delta) / 400);
        const fade = Math.exp(-ring.age / 0.6);
        const push = 13 * ringAmp * band * fade;
        x += (ex / sd) * push;
        y += (ey / sd) * push;
        size *= 1 + 1.3 * band * fade * ringAmp;
        tint = Math.max(tint, band * Math.exp(-ring.age / 0.8) * ringAmp);
      }
      if (still) {
        // Reduced motion: a ring of colour, no movement.
        const sd = Math.hypot(rx - still.x, ry - still.y);
        const delta = sd - 0.35 * R;
        tint = Math.max(tint, Math.exp(-(delta * delta) / 200) * ringAmp);
      }
      f.x[i] = x;
      f.y[i] = y;
      f.r[i] = base * size;
      f.b[i] = Math.min(BUCKETS - 1, Math.round(clamp01(tint) * (BUCKETS - 1)));
    }
    for (let b = 0; b < BUCKETS; b += 1) {
      ctx.fillStyle = inks[b] ?? inks[0] ?? "gray";
      ctx.beginPath();
      for (let i = 0; i < f.n; i += 1) {
        if (f.b[i] !== b) continue;
        const x = f.x[i] ?? 0;
        const y = f.y[i] ?? 0;
        const r = f.r[i] ?? 0;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  };

  /** One step: the lens and its power on their springs, the rings outward. */
  const frame = (dt: number) => {
    const s = getSim();
    if (!s.field) return false;
    s.t += dt;
    const L = s.lens;
    if (!s.lead.on) [L.tx, L.ty] = restAt(s, s.t);
    const follow = followSpring(lag);
    const P = s.power;
    const pk = P.throb > 0 ? springs.recoil : springs.snap;
    const steps = Math.max(1, Math.ceil(dt * 120));
    const h = dt / steps;
    for (let i = 0; i < steps; i += 1) {
      L.vx += (follow.k * (L.tx - L.x) - follow.c * L.vx) * h;
      L.vy += (follow.k * (L.ty - L.y) - follow.c * L.vy) * h;
      L.x += L.vx * h;
      L.y += L.vy * h;
      P.v +=
        ((pk.stiffness * (P.target - P.p) - pk.damping * P.v) / pk.mass) * h;
      P.p += P.v * h;
    }
    P.throb = Math.max(0, P.throb - dt);
    for (const ring of s.rings) ring.age += dt;
    s.rings = s.rings.filter((r) => r.age < RING_LIFE);
    draw();
    const lensMoving =
      Math.abs(L.tx - L.x) + Math.abs(L.ty - L.y) > 0.05 ||
      Math.abs(L.vx) + Math.abs(L.vy) > 0.05;
    const powerMoving =
      Math.abs(P.target - P.p) > 0.0005 || Math.abs(P.v) > 0.002;
    if (!lensMoving) {
      L.x = L.tx;
      L.y = L.ty;
      L.vx = 0;
      L.vy = 0;
    }
    if (!powerMoving) {
      P.p = P.target;
      P.v = 0;
    }
    return (
      lensMoving ||
      powerMoving ||
      s.rings.length > 0 ||
      (rest === "drift" && !s.lead.on)
    );
  };
  const frameRef = React.useRef(frame);

  /** Reduced motion: everything at its target, drawn once. */
  const settle = () => {
    const s = getSim();
    const L = s.lens;
    if (!s.lead.on) [L.tx, L.ty] = restAt(s, 0);
    L.x = L.tx;
    L.y = L.ty;
    L.vx = 0;
    L.vy = 0;
    s.power.p = s.power.target;
    s.power.v = 0;
    s.rings = [];
    draw();
  };

  const sleep = () => {
    const l = loop.current;
    if (l.raf) window.cancelAnimationFrame(l.raf);
    l.raf = 0;
  };

  const wake = () => {
    const l = loop.current;
    if (!motionSafe) {
      sleep();
      if (!l.draw) {
        l.draw = window.requestAnimationFrame(() => {
          l.draw = 0;
          settle();
        });
      }
      return;
    }
    if (l.raf || !l.seen || document.hidden) return;
    l.last = 0;
    const tick = (now: number) => {
      const dt = l.last ? Math.min(0.05, (now - l.last) / 1000) : 1 / 60;
      l.last = now;
      l.raf = 0;
      if (!l.seen || document.hidden) return;
      if (frameRef.current(dt)) l.raf = window.requestAnimationFrame(tick);
    };
    l.raf = window.requestAnimationFrame(tick);
  };

  const shownPower = () => {
    const s = getSim();
    return s.lead.on || rest !== "hidden" ? clamp01(power) : 0;
  };

  const resize = () => {
    const root = rootRef.current;
    if (!root) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 2 || h < 2) return;
    const s = getSim();
    const first = !s.field;
    if (!first && w === s.w && h === s.h) return;
    const kx = s.w > 0 ? w / s.w : 1;
    const ky = s.h > 0 ? h / s.h : 1;
    s.w = w;
    s.h = h;
    s.field = buildField(w, h, gap, lattice);
    const L = s.lens;
    if (first) {
      [L.tx, L.ty] = restAt(s, 0);
      L.x = L.tx;
      L.y = L.ty;
      s.power.target = shownPower();
      s.power.p = s.power.target;
    } else {
      L.x *= kx;
      L.y *= ky;
      L.tx *= kx;
      L.ty *= ky;
    }
    draw();
    wake();
  };

  React.useEffect(() => {
    frameRef.current = frame;
    api.current = { resize, wake, sleep, draw };
  });

  // A new lattice: rebuild the dots where they are.
  React.useEffect(() => {
    const s = getSim();
    if (s.w < 2) {
      api.current?.resize();
      return;
    }
    s.field = buildField(s.w, s.h, gap, lattice);
    api.current?.draw();
  }, [gap, lattice]);

  // A new power or rest: the lens swells or settles toward it.
  React.useEffect(() => {
    const s = getSim();
    s.power.target = s.lead.on || rest !== "hidden" ? clamp01(power) : 0;
    api.current?.wake();
  }, [power, rest, motionSafe]);

  React.useEffect(() => {
    api.current?.draw();
    api.current?.wake();
  }, [radius, dot, glow, cap]);

  React.useEffect(() => {
    inksRef.current = null;
    api.current?.draw();
  }, [color, accent]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) api.current?.sleep();
      else api.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    const l = loop.current;
    const s = getSim();
    return () => {
      if (l.raf) window.cancelAnimationFrame(l.raf);
      if (l.draw) window.cancelAnimationFrame(l.draw);
      window.clearTimeout(l.timer);
      window.clearTimeout(s.lead.touch);
      l.raf = 0;
      l.draw = 0;
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const l = loop.current;
    const sizer = new ResizeObserver(() => api.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      l.seen = Boolean(entry?.isIntersecting);
      if (l.seen) api.current?.wake();
      else api.current?.sleep();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      l.seen = false;
      if (l.raf) window.cancelAnimationFrame(l.raf);
      l.raf = 0;
    };
  }, []);

  const local = (clientX: number, clientY: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const setLeading = (on: boolean) => {
    if (leading.current === on) return;
    leading.current = on;
    onLeadChange?.(on);
  };

  const lead = (x: number, y: number) => {
    const s = getSim();
    s.lead.on = true;
    s.lens.tx = clamp(x, 0, s.w);
    s.lens.ty = clamp(y, 0, s.h);
    s.power.target = clamp01(power);
    setLeading(true);
    wake();
  };

  const release = () => {
    const s = getSim();
    if (s.lead.keyboard) return;
    s.lead.on = false;
    s.power.target = rest === "hidden" ? 0 : clamp01(power);
    setLeading(false);
    wake();
  };

  const ring = (x: number, y: number) => {
    const s = getSim();
    onPulse?.();
    if (!motionSafe) {
      const l = loop.current;
      s.still = { x, y };
      draw();
      window.clearTimeout(l.timer);
      l.timer = window.setTimeout(() => {
        s.still = null;
        api.current?.draw();
      }, STILL_PULSE);
      return;
    }
    s.rings.push({ x, y, age: 0 });
    if (s.rings.length > 3) s.rings.shift();
    // The lens throbs: its power spring is kicked and rides the recoil
    // constants until it settles.
    s.power.v += 6 * clamp01(pulse);
    s.power.throb = 0.8;
    wake();
  };

  const fromControl = (target: EventTarget | null) => {
    const root = rootRef.current;
    if (!(target instanceof Element) || !root) return false;
    const hit = target.closest(CONTROLS);
    return Boolean(hit && root.contains(hit));
  };

  const drag = useDrag({
    threshold: 4,
    disabled: !interactive,
    onStart: ({ point }) => {
      const at = local(point.x, point.y);
      if (at) lead(at.x, at.y);
    },
    onMove: ({ point }) => {
      const at = local(point.x, point.y);
      if (at) lead(at.x, at.y);
    },
    onEnd: ({ event }) => {
      if (event.pointerType !== "touch") return;
      // A finger's lens lingers a moment after it lifts.
      const s = getSim();
      window.clearTimeout(s.lead.touch);
      s.lead.touch = window.setTimeout(release, 1200);
    },
    onCancel: () => release(),
    onTap: (event) => {
      if (fromControl(event.target)) return;
      const at = local(event.clientX, event.clientY);
      if (!at) return;
      lead(at.x, at.y);
      ring(at.x, at.y);
    },
  });

  return (
    <div
      ref={bindRoot}
      className={cn(
        "relative isolate aspect-[2/1] w-full overflow-clip",
        interactive && "touch-pan-y",
        className,
      )}
      {...drag}
      onPointerMove={(event) => {
        drag.onPointerMove(event);
        if (!interactive || event.pointerType === "touch") return;
        if (event.buttons !== 0) return;
        const at = local(event.clientX, event.clientY);
        if (at) lead(at.x, at.y);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        release();
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        onTransitionEnd={() => {
          inksRef.current = null;
          api.current?.draw();
        }}
        className="pointer-events-none absolute inset-0 block size-full transition-colors duration-1"
        style={{
          color,
          borderTopColor: accent,
          // Before the first frame: the same field, unbent.
          backgroundImage: `radial-gradient(circle, ${color} ${Math.max(0.5, dot / 2 - 0.25).toFixed(2)}px, transparent ${Math.max(0.75, dot / 2 + 0.25).toFixed(2)}px)`,
          backgroundSize: `${Math.max(4, gap)}px ${Math.max(4, gap)}px`,
          backgroundPosition: "center",
        }}
      />
      <div
        role="application"
        aria-roledescription="dot lens"
        aria-label={label}
        aria-describedby={hintId}
        aria-disabled={!interactive || undefined}
        tabIndex={interactive ? 0 : -1}
        onFocus={(event) => {
          if (!interactive || !event.currentTarget.matches(":focus-visible")) {
            return;
          }
          const s = getSim();
          s.lead.keyboard = true;
          lead(s.lens.tx || s.w / 2, s.lens.ty || s.h / 2);
        }}
        onBlur={() => {
          const s = getSim();
          s.lead.keyboard = false;
          release();
        }}
        onKeyDown={(event) => {
          if (!interactive) return;
          const s = getSim();
          const step = (event.shiftKey ? 0.16 : 0.04) * Math.max(s.w, s.h);
          let { tx, ty } = s.lens;
          switch (event.key) {
            case "ArrowLeft":
              tx -= step;
              break;
            case "ArrowRight":
              tx += step;
              break;
            case "ArrowUp":
              ty -= step;
              break;
            case "ArrowDown":
              ty += step;
              break;
            case "Home":
              tx = s.w / 2;
              ty = s.h / 2;
              break;
            case "Enter":
            case " ":
              event.preventDefault();
              if (!event.repeat) ring(s.lens.tx, s.lens.ty);
              return;
            case "Escape":
              if (!s.lead.keyboard) return;
              event.preventDefault();
              s.lead.keyboard = false;
              release();
              return;
            default:
              return;
          }
          event.preventDefault();
          s.lead.keyboard = true;
          lead(tx, ty);
        }}
        className={cn(
          "absolute inset-0 rounded-[inherit] outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      {children !== undefined && children !== null ? (
        <div className="relative h-full w-full">{children}</div>
      ) : null}
      <p id={hintId} className="sr-only">
        Arrow keys move the lens over the dots, Shift for larger steps, Home to
        centre it. Enter or Space sends a ring through the grid; Escape lets the
        lens go back to rest.
      </p>
    </div>
  );
}
