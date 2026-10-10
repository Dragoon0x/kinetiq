"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FloatFieldProps = {
  /** How many motes fill a 760×232 box; a box of another size gets proportionally more or fewer. @default 220 */
  count?: number;
  /** How fast the motes rise, in px per second (near motes faster, far ones slower). @default 24 */
  rise?: number;
  /** How hard the pointer's bubble pushes motes away, 0 to 1: 0 is no bubble. @default 0.6 */
  repel?: number;
  /** The bubble's radius in px, never more than 40% of the box's shorter side. @default 84 */
  radius?: number;
  /** How much the motes sway sideways as they rise, 0 to 1. @default 0.5 */
  turbulence?: number;
  /** The base radius of a mote in px; depth scales it from about half to one and a half times. @default 2.6 */
  size?: number;
  /** How soft a halo each mote carries, 0 (a crisp dot) to 1 (a wide glow). @default 0.5 */
  glow?: number;
  /** How strong a press's burst is, 0 to 1: 0 turns bursts off. @default 0.6 */
  burst?: number;
  /** Mote colours, any CSS colours, resolved on the element so they follow the theme; the first is the most common. @default ["var(--accent-bright)", "var(--signal)", "var(--ink-3)"] */
  colors?: readonly string[];
  /** Respond to the pointer, presses and keyboard focus. @default true */
  interactive?: boolean;
  /** Freeze the field where it is. @default false */
  paused?: boolean;
  /** Seed for the motes' arrangement and sway. @default 11 */
  seed?: number;
  /** The highest device pixel ratio the canvas draws at (never above 2). @default 2 */
  dpr?: number;
  /** Fires when a press or a keyboard activation releases a burst, with its point in the box. */
  onBurst?: (point: { x: number; y: number }) => void;
  /** Classes for the box; size it here. */
  className?: string;
  /** Content laid over the field; it keeps every click, focus and key. */
  children?: React.ReactNode;
};

type Mote = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Depth, 0 far to 1 near. */
  z: number;
  /** Size jitter; the radius is `size` × depth × this. */
  k: number;
  alpha: number;
  lift: number;
  phase: number;
  color: number;
};

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  r: number;
  color: number;
};

const DEFAULT_COLORS = [
  "var(--accent-bright)",
  "var(--signal)",
  "var(--ink-3)",
] as const;
const REFERENCE_AREA = 760 * 232;
const MAX_MOTES = 1600;
const SPARKS = 40;
const STILL_DOTS = 36;
const MARGIN = 14;
const SPRITE = 64;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A colour index weighted toward the first colour: about 55%, 25%, 20%. */
const pickColor = (u: number, n: number) => {
  if (n <= 1) return 0;
  if (n === 2) return u < 0.68 ? 0 : 1;
  if (u < 0.55) return 0;
  if (u < 0.8) return 1;
  return Math.min(n - 1, 2 + Math.floor(((u - 0.8) / 0.2) * (n - 2)));
};

/**
 * A mote's height on a fresh field: more of them low than high, as if they
 * had been rising for a while and thinning out as they went.
 */
const seedY = (u: number) => 1 - Math.pow(u, 0.6);

/**
 * One step of a damped spring with the house constants: the new velocity,
 * semi-implicit, so the caller moves by it. Returning a number, not a pair,
 * keeps the frame loop free of allocations.
 */
function springStep(
  pos: number,
  vel: number,
  target: number,
  spring: { stiffness: number; damping: number; mass: number },
  dt: number,
): number {
  return (
    vel +
    ((spring.stiffness * (target - pos) - spring.damping * vel) / spring.mass) *
      dt
  );
}

/**
 * An antigravity field: a few hundred soft motes rise through the box on a
 * gentle seeded sway, in three depths, behind whatever content it wraps.
 * The pointer carries a bubble of clear air whose centre trails it on
 * springs.glide's constants and whose radius opens on springs.glide and closes
 * on springs.drift; motes inside are pushed out and crowd along its rim, and
 * behind it they relax back into the flow so the gap closes on its own. A
 * press releases a burst: nearby motes leap upward and a small fountain of
 * sparks leaves the press point, slows under drag and fades.
 *
 * Keyboard focus on a control inside moves the bubble to it and opens it wide
 * enough to clear it; Enter or Space on it bursts from its centre. The field
 * is aria-hidden decoration that never takes a click or focus. Under reduced
 * motion it is one still scatter, denser low than high, and nothing moves.
 */
export function FloatField({
  count = 220,
  rise = 24,
  repel = 0.6,
  radius = 84,
  turbulence = 0.5,
  size = 2.6,
  glow = 0.5,
  burst = 0.6,
  colors = DEFAULT_COLORS,
  interactive = true,
  paused = false,
  seed = 11,
  dpr = 2,
  onBurst,
  className,
  children,
}: FloatFieldProps) {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const probeRef = React.useRef<HTMLSpanElement | null>(null);
  const [ready, setReady] = React.useState(false);
  const api = React.useRef<{
    reseed: () => void;
    repaint: () => void;
    wake: () => void;
  } | null>(null);

  const palette = colors.length > 0 ? colors : DEFAULT_COLORS;
  const paletteKey = palette.join("|");

  const params = React.useRef({
    count,
    rise,
    repel,
    radius,
    turbulence,
    size,
    glow,
    burst,
    palette,
    interactive,
    paused,
    seed,
    dpr,
    motionSafe,
    onBurst,
  });
  React.useEffect(() => {
    params.current = {
      count,
      rise,
      repel,
      radius,
      turbulence,
      size,
      glow,
      burst,
      palette,
      interactive,
      paused,
      seed,
      dpr,
      motionSafe,
      onBurst,
    };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const motes: Mote[] = [];
    const sparks: Spark[] = Array.from({ length: SPARKS }, () => ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      age: 1,
      life: 0,
      r: 1,
      color: 0,
    }));
    let sparkCursor = 0;
    let sprites: HTMLCanvasElement[] = [];
    let bokeh: HTMLCanvasElement[] = [];
    let rng = mulberry32(params.current.seed);
    let w = 0;
    let h = 0;
    let ratio = 1;
    let raf = 0;
    let last = 0;
    let carry = 0;
    let clock = 0;
    let inView = true;
    let shown = false;
    let readyFrame = 0;

    // The bubble: a centre that trails its target and a radius that opens
    // and closes, both stepped with the house springs' own constants.
    const bubble = { x: 0, y: 0, vx: 0, vy: 0, r: 0, vr: 0 };
    const target = { x: 0, y: 0, inside: false };
    let focused: HTMLElement | null = null;

    const reader = (() => {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      return c.getContext("2d", { willReadFrequently: true });
    })();
    const rgb = (css: string): [number, number, number] => {
      const probe = probeRef.current;
      if (!probe || !reader) return [128, 128, 128];
      probe.style.color = css;
      const computed = getComputedStyle(probe).color;
      reader.clearRect(0, 0, 1, 1);
      reader.fillStyle = "rgb(128, 128, 128)";
      reader.fillStyle = computed;
      reader.fillRect(0, 0, 1, 1);
      const d = reader.getImageData(0, 0, 1, 1).data;
      return [d[0] ?? 128, d[1] ?? 128, d[2] ?? 128];
    };

    const disc = (stops: [number, number][], [r, g, b]: number[]) => {
      const s = document.createElement("canvas");
      s.width = SPRITE;
      s.height = SPRITE;
      const c = s.getContext("2d");
      if (!c) return s;
      const half = SPRITE / 2;
      const grad = c.createRadialGradient(half, half, 0, half, half, half);
      for (const [at, a] of stops) {
        grad.addColorStop(at, `rgba(${r}, ${g}, ${b}, ${r2(a)})`);
      }
      c.fillStyle = grad;
      c.fillRect(0, 0, SPRITE, SPRITE);
      return s;
    };

    // Two discs per colour, drawn once per theme or glow change: a mote whose
    // core is the dot and whose halo is `glow`, and an out-of-focus disc for
    // the nearest band, flat with a soft edge, the way a lens renders a point
    // it is not focused on.
    const paintSprites = () => {
      const p = params.current;
      const g = clamp(p.glow, 0, 1);
      const core = 1 / (1 + 2 * g);
      const colours = p.palette.map(rgb);
      sprites = colours.map((c) =>
        disc(
          [
            [0, 1],
            [core * 0.55, 0.92],
            [core, g > 0.05 ? 0.42 : 0],
            [Math.min(1, core + (1 - core) * 0.45), g * 0.14],
            [1, 0],
          ],
          c,
        ),
      );
      bokeh = colours.map((c) =>
        disc(
          [
            [0, 0.5],
            [0.55, 0.56],
            [0.78, 0.4],
            [1, 0],
          ],
          c,
        ),
      );
    };

    const seedMote = (m: Mote, fresh: boolean) => {
      const p = params.current;
      const depth = rng();
      // Three bands: half far (small, dim, slow), a third in the middle
      // (crisp and bright), the rest near (large, soft, out of focus).
      const jitter = rng();
      m.z =
        depth < 0.5
          ? jitter * 0.3
          : depth < 0.86
            ? 0.4 + jitter * 0.3
            : 0.86 + jitter * 0.14;
      m.k = 0.85 + rng() * 0.3;
      m.alpha = m.z > 0.8 ? 0.42 : 0.26 + m.z * 0.7;
      m.lift = 0.75 + rng() * 0.5;
      m.phase = rng() * Math.PI * 2;
      m.color = pickColor(rng(), p.palette.length);
      m.x = rng() * w;
      // Later arrivals queue below the box at staggered depths, so a higher
      // count rises in over a few seconds instead of as one line.
      m.y = fresh
        ? seedY(rng()) * (h + MARGIN)
        : h + MARGIN + rng() * Math.min(h * 0.6, 120);
      m.vx = 0;
      m.vy = -p.rise * (0.45 + 0.9 * m.z) * m.lift;
    };

    const targetCount = () => {
      const p = params.current;
      return Math.round(
        clamp(Math.max(0, p.count) * ((w * h) / REFERENCE_AREA), 0, MAX_MOTES),
      );
    };

    const fill = (fresh: boolean) => {
      const n = targetCount();
      while (motes.length < n) {
        const m: Mote = {
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          z: 0,
          k: 1,
          alpha: 1,
          lift: 1,
          phase: 0,
          color: 0,
        };
        seedMote(m, fresh || motes.length === 0);
        motes.push(m);
      }
      if (motes.length > n) motes.length = n;
    };

    const reseed = () => {
      rng = mulberry32(params.current.seed);
      motes.length = 0;
      for (const s of sparks) s.age = s.life = 0;
      fill(true);
    };

    const draw = () => {
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const fadeLow = h + MARGIN;
      const p = params.current;
      const spread = 1 + 2 * clamp(p.glow, 0, 1);
      for (const m of motes) {
        const near = m.z > 0.8;
        const sprite = (near ? bokeh : sprites)[m.color] ?? sprites[0];
        if (!sprite) continue;
        let a =
          m.alpha *
          smooth(-MARGIN, 30, m.y) *
          (1 - smooth(h - 24, fadeLow, m.y));
        if (bubble.r > 1) {
          // Motes crowding the rim catch a little more light, so the bubble
          // reads as a surface rather than a hole.
          const d = Math.hypot(m.x - bubble.x, m.y - bubble.y) - bubble.r;
          const k = d / (bubble.r * 0.3);
          a *= 1 + 0.55 * Math.exp(-k * k);
        }
        if (a <= 0.01) continue;
        const half = near
          ? p.size * (1.7 + (m.z - 0.86) * 4) * m.k
          : p.size * (0.4 + m.z * 1.1) * m.k * spread;
        ctx.globalAlpha = Math.min(1, a);
        ctx.drawImage(sprite, m.x - half, m.y - half, half * 2, half * 2);
      }
      for (const s of sparks) {
        if (s.age >= s.life) continue;
        const sprite = sprites[s.color] ?? sprites[0];
        if (!sprite) continue;
        const t = s.age / s.life;
        const half = s.r * (0.6 + spread);
        ctx.globalAlpha = Math.pow(1 - t, 1.5) * 0.95;
        ctx.drawImage(sprite, s.x - half, s.y - half, half * 2, half * 2);
      }
      ctx.globalAlpha = 1;
      if (!shown) {
        shown = true;
        // The still steps aside once the canvas has a frame to show.
        readyFrame = requestAnimationFrame(() => setReady(true));
      }
    };

    const sparksAlive = () => {
      for (const s of sparks) if (s.age < s.life) return true;
      return false;
    };

    const step = (dt: number) => {
      const p = params.current;
      clock += dt;
      const t = clock;
      const reach = Math.min(Math.max(0, p.radius), 0.4 * Math.min(w, h));
      let open = 0;
      if (p.interactive && p.repel > 0) {
        if (focused && focused.isConnected) {
          const rr = focused.getBoundingClientRect();
          const box = root.getBoundingClientRect();
          target.x = rr.left + rr.width / 2 - box.left;
          target.y = rr.top + rr.height / 2 - box.top;
          open = Math.min(
            Math.max(reach, Math.hypot(rr.width, rr.height) / 2 + 14),
            0.48 * Math.min(w, h),
          );
        } else if (target.inside) {
          open = reach;
        }
      }
      // Spring substeps stay small so a slow frame never destabilises them.
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      const sub = dt / steps;
      const radiusSpring = open > bubble.r ? springs.glide : springs.drift;
      for (let i = 0; i < steps; i += 1) {
        bubble.vx = springStep(
          bubble.x,
          bubble.vx,
          target.x,
          springs.glide,
          sub,
        );
        bubble.x += bubble.vx * sub;
        bubble.vy = springStep(
          bubble.y,
          bubble.vy,
          target.y,
          springs.glide,
          sub,
        );
        bubble.y += bubble.vy * sub;
        bubble.vr = springStep(bubble.r, bubble.vr, open, radiusSpring, sub);
        bubble.r += bubble.vr * sub;
      }
      if (open === 0 && bubble.r < 0.3 && Math.abs(bubble.vr) < 1) {
        bubble.r = 0;
        bubble.vr = 0;
      }

      const sway = clamp(p.turbulence, 0, 1);
      const relax = 1 - Math.exp(-dt * 1.8);
      const push = clamp(p.repel, 0, 1) * 2600;
      const wall = bubble.r * 1.25;
      for (const m of motes) {
        const depth = 0.6 + 0.8 * m.z;
        const fx =
          sway *
          (Math.sin(m.y * 0.021 + t * 0.6 + m.phase) * 14 +
            Math.sin(m.x * 0.013 - t * 0.35 + m.phase * 1.7) * 7) *
          depth;
        const fy = sway * Math.cos(m.x * 0.017 + t * 0.45 + m.phase) * 6;
        const want = -p.rise * (0.45 + 0.9 * m.z) * m.lift + fy;
        m.vx += (fx - m.vx) * relax;
        m.vy += (want - m.vy) * relax;
        if (wall > 1) {
          const dx = m.x - bubble.x;
          const dy = m.y - bubble.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < wall * wall) {
            const d = Math.sqrt(d2) + 0.001;
            const q = 1 - d / wall;
            const f = push * q * q * (0.5 + 0.8 * m.z) * dt;
            m.vx += (dx / d) * f;
            m.vy += (dy / d) * f;
          }
        }
        const speed = Math.hypot(m.vx, m.vy);
        if (speed > 900) {
          m.vx *= 900 / speed;
          m.vy *= 900 / speed;
        }
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.y < -MARGIN) {
          seedMote(m, false);
        } else if (m.y > h + 160) {
          // Thrown far below by a burst: held there, it rises back in.
          m.y = h + 160;
        }
        if (m.x < -MARGIN) m.x += w + MARGIN * 2;
        else if (m.x > w + MARGIN) m.x -= w + MARGIN * 2;
      }

      const drag = Math.exp(-dt * 1.6);
      for (const s of sparks) {
        if (s.age >= s.life) continue;
        s.age += dt;
        s.vx *= drag;
        s.vy = s.vy * drag - p.rise * 0.6 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
      }
    };

    const active = () =>
      target.inside || focused !== null || bubble.r > 0.5 || sparksAlive();

    const canRun = () =>
      inView &&
      !document.hidden &&
      !params.current.paused &&
      params.current.motionSafe &&
      w > 0 &&
      h > 0;

    const tick = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      carry += dt;
      // Left alone, the field only drifts: half the frames are plenty.
      if (active() || carry >= 1 / 32) {
        step(carry);
        carry = 0;
        draw();
      }
      if (canRun()) raf = requestAnimationFrame(tick);
    };

    const wake = () => {
      if (raf || !canRun()) return;
      last = performance.now();
      carry = 0;
      raf = requestAnimationFrame(tick);
    };

    const halt = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const resize = () => {
      const nw = root.clientWidth;
      const nh = root.clientHeight;
      if (nw < 1 || nh < 1) return;
      const sx = w > 0 ? nw / w : 1;
      const sy = h > 0 ? nh / h : 1;
      for (const m of motes) {
        m.x *= sx;
        m.y *= sy;
      }
      w = nw;
      h = nh;
      ratio = Math.min(
        2,
        Math.max(1, params.current.dpr),
        window.devicePixelRatio || 1,
      );
      canvas.width = Math.max(1, Math.round(w * ratio));
      canvas.height = Math.max(1, Math.round(h * ratio));
      fill(motes.length === 0);
      draw();
      wake();
    };

    const local = (clientX: number, clientY: number) => {
      const box = root.getBoundingClientRect();
      return { x: clientX - box.left, y: clientY - box.top };
    };

    const release = (x: number, y: number) => {
      const p = params.current;
      const strength = clamp(p.burst, 0, 1);
      if (!p.interactive || strength <= 0 || !p.motionSafe || p.paused) return;
      const reach = Math.max(
        40,
        Math.min(p.radius, 0.4 * Math.min(w, h)) * 1.8,
      );
      for (const m of motes) {
        const dx = m.x - x;
        const dy = m.y - y;
        const d = Math.hypot(dx, dy) + 0.001;
        if (d > reach) continue;
        const q = 1 - d / reach;
        const k = 0.5 + 0.8 * m.z;
        m.vy -= strength * 560 * q * k;
        m.vx += (dx / d) * strength * 240 * q * k;
      }
      const n = Math.round(strength * SPARKS);
      for (let i = 0; i < n; i += 1) {
        const s = sparks[sparkCursor];
        sparkCursor = (sparkCursor + 1) % SPARKS;
        if (!s) continue;
        const angle = -Math.PI / 2 + (rng() - 0.5) * 1.6;
        const speed = 140 + rng() * 300 * strength;
        s.x = x;
        s.y = y;
        s.vx = Math.cos(angle) * speed;
        s.vy = Math.sin(angle) * speed;
        s.age = 0;
        s.life = 1 + rng() * 0.6;
        s.r = p.size * (0.6 + rng() * 0.6);
        s.color = rng() < 0.7 ? 0 : Math.min(1, p.palette.length - 1);
      }
      p.onBurst?.({ x: Math.round(x), y: Math.round(y) });
      wake();
    };

    const onMove = (event: PointerEvent) => {
      if (!params.current.interactive) return;
      const pt = local(event.clientX, event.clientY);
      // Arriving from outside, the bubble starts where the pointer is rather
      // than sweeping in from wherever it last closed.
      if (bubble.r < 2) {
        bubble.x = pt.x;
        bubble.y = pt.y;
        bubble.vx = bubble.vy = 0;
      }
      target.x = pt.x;
      target.y = pt.y;
      target.inside = true;
      wake();
    };
    const onLeave = () => {
      target.inside = false;
      wake();
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerType === "touch") onLeave();
    };
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const pt = local(event.clientX, event.clientY);
      release(pt.x, pt.y);
    };
    // Enter or Space on a control inside arrives as a click with no pointer
    // behind it: the burst leaves from that control.
    const onClick = (event: MouseEvent) => {
      if (event.detail !== 0) return;
      const el = event.target;
      if (!(el instanceof HTMLElement) || el === root) return;
      const rr = el.getBoundingClientRect();
      const pt = local(rr.left + rr.width / 2, rr.top + rr.height / 2);
      release(pt.x, pt.y);
    };
    const onFocusIn = (event: FocusEvent) => {
      const el = event.target;
      if (!(el instanceof HTMLElement) || el === root) return;
      if (!el.matches(":focus-visible")) return;
      if (!params.current.interactive) return;
      if (bubble.r < 2) {
        const rr = el.getBoundingClientRect();
        const pt = local(rr.left + rr.width / 2, rr.top + rr.height / 2);
        bubble.x = pt.x;
        bubble.y = pt.y;
      }
      focused = el;
      wake();
    };
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Node && root.contains(next)) return;
      focused = null;
      wake();
    };

    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerenter", onMove);
    root.addEventListener("pointerleave", onLeave);
    root.addEventListener("pointercancel", onLeave);
    root.addEventListener("pointerup", onUp);
    root.addEventListener("pointerdown", onDown);
    root.addEventListener("click", onClick);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);

    const sizer = new ResizeObserver(resize);
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inView = entry.isIntersecting;
      if (inView) wake();
      else halt();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (document.hidden) halt();
      else wake();
    };
    document.addEventListener("visibilitychange", onVisibility);

    paintSprites();
    resize();

    api.current = {
      reseed: () => {
        reseed();
        draw();
        wake();
      },
      repaint: () => {
        paintSprites();
        draw();
        wake();
      },
      wake: () => {
        if (!params.current.interactive) {
          target.inside = false;
          focused = null;
        }
        // A new count is met by adding or dropping motes, never a reshuffle.
        fill(false);
        draw();
        wake();
      },
    };

    return () => {
      halt();
      cancelAnimationFrame(readyFrame);
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerenter", onMove);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("pointercancel", onLeave);
      root.removeEventListener("pointerup", onUp);
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("click", onClick);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      api.current = null;
    };
    // Every prop reaches the loop through `params`; the effects below ask for
    // a reseed, a repaint or a fresh frame instead of rebuilding the field.
  }, []);

  React.useEffect(() => {
    api.current?.reseed();
  }, [seed]);

  React.useEffect(() => {
    api.current?.repaint();
  }, [paletteKey, glow]);

  React.useEffect(() => {
    api.current?.wake();
  }, [
    count,
    rise,
    repel,
    radius,
    turbulence,
    size,
    burst,
    interactive,
    paused,
    motionSafe,
    dpr,
  ]);

  // The server and the first paint get a seeded still of the field, the same
  // on both sides; the canvas replaces it on its first frame.
  const still = React.useMemo(() => {
    const rand = mulberry32(seed + 101);
    return Array.from({ length: STILL_DOTS }, () => {
      const z = rand();
      const d = r2(size * (0.9 + z * 2.1) * 2);
      return {
        left: r2(rand() * 100),
        top: r2(seedY(rand()) * 100),
        d,
        opacity: r2(0.2 + z * 0.5),
        color: palette[pickColor(rand(), palette.length)] ?? palette[0],
      };
    });
    // The palette is keyed by its joined string so a new array literal with
    // the same colours does not redraw the still.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, size, paletteKey]);

  return (
    <div
      ref={rootRef}
      className={cn("relative isolate overflow-hidden", className)}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 transition-opacity duration-300",
          ready && "opacity-0",
        )}
      >
        {still.map((dot, i) => (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${dot.left}%`,
              top: `${dot.top}%`,
              width: dot.d,
              height: dot.d,
              opacity: dot.opacity,
              background: dot.color,
              transform: "translate(-50%, -50%)",
            }}
          />
        ))}
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <div className="relative size-full">{children}</div>
      {/* Colours are resolved on this probe, inside the component, so a
          themed wrapper's tokens are the ones read. */}
      <span
        ref={probeRef}
        aria-hidden
        className="pointer-events-none absolute size-0 overflow-hidden"
      />
      {/* A theme change shows up as this carrier's 1ms colour transition. */}
      <span
        aria-hidden
        onTransitionEnd={() => api.current?.repaint()}
        className="pointer-events-none absolute size-0 overflow-hidden bg-background text-foreground transition-colors duration-1"
      />
    </div>
  );
}
