"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type ThreadHourglassProps = {
  /** How many threads string the two hoops, 8 to 120. @default 48 */
  threadCount?: number;
  /** How far the top hoop can be twisted either way, in degrees, 30 to 178; near 180 the waist closes to a point. @default 150 */
  twist?: number;
  /** The threads' bloom and the light at the waist, 0 (fine lines only) to 1. @default 0.6 */
  glow?: number;
  /** The threads' colour. @default "var(--accent-bright)" */
  color?: string;
  /** The hoops' colour. @default the thread colour mixed toward the foreground */
  hoopColor?: string;
  /** How far we look down on the hoops, in degrees, 0 (side on) to 40. @default 20 */
  tilt?: number;
  /** The sculpture's slow turn about its axis, degrees per second, 0 to 40. @default 6 */
  spin?: number;
  /** Degrees per arrow key. @default 15 */
  step?: number;
  /** How far the hoop overshoots straight as it unwinds, 0 (none) to 1; the default is the house snap spring. @default 0.35 */
  bounce?: number;
  /** Let go and the hoop unwinds to straight; off, it stays where it is left. @default true */
  springBack?: boolean;
  /** Hold the slow turn; twisting still works. @default false */
  paused?: boolean;
  /** No twisting by hand or key. @default false */
  disabled?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The accessible name of the twist control. @default "Twist the top hoop" */
  label?: string;
  /** Fires as a hand or key sets the twist, in whole degrees (positive to the right), and with the resting twist on release. */
  onTwistChange?: (degrees: number) => void;
  /** Fires when a drag or the keyboard takes hold of the top hoop (true) and lets go (false). */
  onHoldChange?: (holding: boolean) => void;
  /** Sizes the box; it fills its parent by default. */
  className?: string;
};

const STEP = 1 / 120;
/** Depth bands each thread is cut into: back to front. */
const BANDS = 5;
const SEGMENTS = 8;
/** The middle samples of each thread, which gather into the waist. */
const CORE_FROM = 3;
const HOOP_POINTS = 96;
/** A twist this small, in radians, is straight. */
const STRAIGHT = 0.0005;
/** Reduced motion: how long a new limit's wound frame holds, ms. */
const PREVIEW_HOLD = 1200;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => Math.round((rad * 180) / Math.PI);

type Rgb = readonly [number, number, number];

/** Line alphas per depth band (back to front), for a dark page and a light one. */
const ALPHA_DARK = [0.14, 0.22, 0.32, 0.48, 0.7] as const;
const ALPHA_LIGHT = [0.1, 0.16, 0.24, 0.36, 0.55] as const;
const WIDTH = [0.7, 0.8, 0.9, 1.05, 1.25] as const;

type Sim = {
  /** The twist now, its velocity, and where it is heading, rad (positive to the right). */
  twist: number;
  v: number;
  target: number;
  /** The slow turn, rad. */
  spin: number;
  last: number;
  carry: number;
  holding: boolean;
  dragging: boolean;
};

type Paint = {
  thread: string;
  hoop: string;
  dark: boolean;
  halo: HTMLCanvasElement | null;
};

type Size = { w: number; h: number; dpr: number };

type Geo = { R: number; half: number; F: number; cx: number; cy: number };

type View = Geo & { ct: number; st: number };

/** The sculpture's measurements for this box, written into `out`. */
function measure(sz: Size, out: Geo): Geo {
  out.R = Math.max(8, Math.min(sz.w * 0.36, sz.h * 0.26));
  out.half = Math.min(sz.h * 0.3, out.R * 1.55);
  // A camera well back from the sculpture: enough perspective to read as
  // 3D, not so much that the top hoop drops to eye level and flattens.
  out.F = out.R * 9;
  out.cx = sz.w / 2;
  out.cy = sz.h / 2;
  return out;
}

/**
 * One hoop's back or front half, projected into `r` and stroked twice: a
 * soft bloom, then the crisp ring. Back halves are drawn before the threads
 * and front halves after, so the threads pass behind the near rim.
 */
function drawHoop(
  ctx: CanvasRenderingContext2D,
  r: Float32Array,
  v: View,
  top: boolean,
  front: boolean,
  glow: number,
  additive: boolean,
) {
  const Y = top ? v.half : -v.half;
  for (let q = 0; q <= HOOP_POINTS; q += 1) {
    const a = (q / HOOP_POINTS) * Math.PI * 2;
    const X = v.R * Math.cos(a);
    const Z = v.R * Math.sin(a);
    const persp = v.F / (v.F - (Z * v.ct + Y * v.st));
    r[q * 3] = v.cx + X * persp;
    r[q * 3 + 1] = v.cy + (-Y * v.ct + Z * v.st) * persp;
    r[q * 3 + 2] = Z;
  }
  const base = front ? 1 : 0.45;
  for (let pass = 0; pass < 2; pass += 1) {
    const bloom = pass === 0;
    if (bloom && glow <= 0) continue;
    ctx.beginPath();
    let open = false;
    for (let q = 0; q < HOOP_POINTS; q += 1) {
      const z = ((r[q * 3 + 2] ?? 0) + (r[q * 3 + 5] ?? 0)) / 2;
      if (z >= 0 !== front) {
        open = false;
        continue;
      }
      if (!open) ctx.moveTo(r[q * 3] ?? 0, r[q * 3 + 1] ?? 0);
      ctx.lineTo(r[q * 3 + 3] ?? 0, r[q * 3 + 4] ?? 0);
      open = true;
    }
    ctx.lineWidth = bloom ? 3 + 5 * glow : front ? 1.8 : 1.3;
    ctx.globalAlpha = bloom
      ? base * (additive ? 0.16 : 0.1) * glow
      : base * (additive ? 0.95 : 0.85);
    ctx.stroke();
  }
}

type Api = {
  draw: () => void;
  kick: () => void;
  resize: () => void;
  readPalette: () => void;
  tick: (now: number) => void;
};

/**
 * A string sculpture: two glowing hoops, one above the other, strung with
 * straight threads. Twist the top hoop and every thread leans the same way;
 * together they draw a hyperboloid — a curve made of nothing but straight
 * lines — whose waist narrows as the twist grows. The threads add up where
 * they cross, so on a dark page the waist turns into a band of light, and on
 * a light page into a dense woven band, with a halo that grows with the twist.
 *
 * A horizontal drag twists the top hoop 1:1 — its front bead stays under the
 * finger — rubber-banding past the limit; release and it unwinds on the snap
 * spring from the release's speed, with one small overshoot past straight.
 * It is a slider: arrow keys twist it a step at a time on the same spring and
 * Escape, Enter or Space let go. Canvas 2D, ten batched strokes a frame, and
 * no frames off screen, in a hidden tab or once still. Under reduced motion
 * nothing turns or springs: the twist goes straight where it is put and
 * straight back.
 */
export function ThreadHourglass({
  threadCount = 48,
  twist = 150,
  glow = 0.6,
  color = "var(--accent-bright)",
  hoopColor,
  tilt = 20,
  spin = 6,
  step = 15,
  bounce = 0.35,
  springBack = true,
  paused = false,
  disabled = false,
  dpr = 2,
  label = "Twist the top hoop",
  onTwistChange,
  onHoldChange,
  className,
}: ThreadHourglassProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const hoop =
    hoopColor ?? `color-mix(in oklab, ${color} 55%, var(--foreground))`;
  const paints = React.useMemo(
    () => [color, hoop, "var(--background)"] as const,
    [color, hoop],
  );
  const paintKey = paints.join("|");

  const k = {
    count: clamp(Math.round(threadCount), 8, 120),
    limit: toRad(clamp(twist, 30, 178)),
    glow: clamp01(glow),
    tilt: toRad(clamp(tilt, 0, 40)),
    spin: toRad(clamp(spin, 0, 40)),
    step: toRad(clamp(step, 1, 90)),
    zeta: 1 - 0.48 * clamp01(bounce),
    springBack,
    paused,
    dpr: clamp(dpr, 0.5, 2),
    motionSafe,
  };

  const [shown, setShown] = React.useState(0);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const size = React.useRef<Size | null>(null);
  const paint = React.useRef<Paint>({
    thread: "rgb(0, 0, 0)",
    hoop: "rgb(0, 0, 0)",
    dark: true,
    halo: null,
  });
  const reader = React.useRef<CanvasRenderingContext2D | null>(null);
  /** Projected thread points: x, y, depth for each sample of each thread. */
  const points = React.useRef(new Float32Array(120 * (SEGMENTS + 1) * 3));
  const ring = React.useRef(new Float32Array((HOOP_POINTS + 1) * 3));
  const geo = React.useRef({ R: 0, half: 0, F: 0, cx: 0, cy: 0 });
  const live = React.useRef(false);
  const viewRef = React.useRef<View>({
    R: 0,
    half: 0,
    F: 0,
    cx: 0,
    cy: 0,
    ct: 1,
    st: 0,
  });
  const frame = React.useRef(0);
  const visible = React.useRef(false);
  const timer = React.useRef(0);
  const sim = React.useRef<Sim>({
    twist: 0,
    v: 0,
    target: 0,
    spin: 0,
    last: 0,
    carry: 0,
    holding: false,
    dragging: false,
  });
  const dragFrom = React.useRef(0);
  const lastReported = React.useRef(0);
  const api = React.useRef<Api | null>(null);
  const report = React.useRef({ onTwistChange, onHoldChange });
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  const readPalette = () => {
    const carriers = carriersRef.current;
    if (!carriers) return;
    if (!reader.current) {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      reader.current = c.getContext("2d", { willReadFrequently: true });
    }
    const ctx = reader.current;
    if (!ctx) return;
    const rgb: Rgb[] = [];
    for (const span of Array.from(carriers.children)) {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgb(0, 0, 0)";
      ctx.fillStyle = getComputedStyle(span).color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      rgb.push([d[0] ?? 0, d[1] ?? 0, d[2] ?? 0]);
    }
    const [thread = [0, 0, 0], loop = [0, 0, 0], ground = [0, 0, 0]] = rgb;
    const p = paint.current;
    p.thread = `rgb(${thread[0]}, ${thread[1]}, ${thread[2]})`;
    p.hoop = `rgb(${loop[0]}, ${loop[1]}, ${loop[2]})`;
    // A light page cannot take additive light: threads are inked instead.
    p.dark =
      (0.2126 * ground[0] + 0.7152 * ground[1] + 0.0722 * ground[2]) / 255 <
      0.5;
    // The waist's halo, rendered once per colour: a soft disc of thread light.
    const halo = p.halo ?? document.createElement("canvas");
    halo.width = 128;
    halo.height = 128;
    const hc = halo.getContext("2d");
    if (hc) {
      hc.clearRect(0, 0, 128, 128);
      const grad = hc.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, `rgba(${thread[0]}, ${thread[1]}, ${thread[2]}, 1)`);
      grad.addColorStop(
        0.35,
        `rgba(${thread[0]}, ${thread[1]}, ${thread[2]}, 0.45)`,
      );
      grad.addColorStop(1, `rgba(${thread[0]}, ${thread[1]}, ${thread[2]}, 0)`);
      hc.fillStyle = grad;
      hc.fillRect(0, 0, 128, 128);
    }
    p.halo = halo;
  };

  const resize = () => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const ratio = Math.min(window.devicePixelRatio || 1, k.dpr);
    const bw = Math.max(1, Math.round(w * ratio));
    const bh = Math.max(1, Math.round(h * ratio));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    size.current = { w, h, dpr: ratio };
  };

  const draw = () => {
    const canvas = canvasRef.current;
    const sz = size.current;
    if (!canvas || !sz || !visible.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const s = sim.current;
    const p = paint.current;
    const { R, half, F, cx, cy } = measure(sz, geo.current);
    const ct = Math.cos(k.tilt);
    const st = Math.sin(k.tilt);
    const view = viewRef.current;
    view.R = R;
    view.half = half;
    view.F = F;
    view.cx = cx;
    view.cy = cy;
    view.ct = ct;
    view.st = st;
    const n = k.count;
    const tw = s.twist;
    const pts = points.current;

    // Each sample of each thread, projected once: x, y and depth.
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + s.spin;
      const bx = R * Math.cos(a);
      const bz = R * Math.sin(a);
      const tx = R * Math.cos(a - tw);
      const tz = R * Math.sin(a - tw);
      for (let j = 0; j <= SEGMENTS; j += 1) {
        const f = j / SEGMENTS;
        const X = bx + (tx - bx) * f;
        const Y = -half + 2 * half * f;
        const Z = bz + (tz - bz) * f;
        const depth = Z * ct + Y * st;
        const persp = F / (F - depth);
        const o = (i * (SEGMENTS + 1) + j) * 3;
        pts[o] = cx + X * persp;
        pts[o + 1] = cy + (-Y * ct + Z * st) * persp;
        pts[o + 2] = depth / R;
      }
    }

    ctx.setTransform(sz.dpr, 0, 0, sz.dpr, 0, 0);
    ctx.clearRect(0, 0, sz.w, sz.h);
    // Butt caps: each thread is cut into depth segments, and round caps
    // would overlap at every joint and bead the line with bright ticks.
    ctx.lineCap = "butt";
    const additive = p.dark;
    const alphas = additive ? ALPHA_DARK : ALPHA_LIGHT;
    // Many threads would flood the waist: thin each one as the count grows.
    const density = Math.sqrt(Math.min(1, 40 / n));
    const pinch = 1 - Math.cos(Math.abs(tw) / 2);

    const r = ring.current;
    ctx.globalCompositeOperation = additive ? "lighter" : "source-over";
    ctx.strokeStyle = p.hoop;
    drawHoop(ctx, r, view, false, false, k.glow, additive);
    drawHoop(ctx, r, view, true, false, k.glow, additive);

    // The waist's light, under the threads: it grows as the waist closes.
    if (p.halo && k.glow > 0 && pinch > 0.01) {
      const waist = R * Math.cos(Math.abs(tw) / 2);
      const rx = Math.max(R * 0.35, waist * 1.9);
      const ry = Math.max(R * 0.22, waist * st * 1.9 + R * 0.18);
      ctx.globalAlpha = Math.min(
        1,
        k.glow * Math.pow(pinch, 0.7) * (additive ? 1 : 0.38),
      );
      ctx.drawImage(p.halo, cx - rx, cy - ry, rx * 2, ry * 2);
    }

    // The threads in depth bands, back to front: a soft bloom pass, then the
    // crisp line. Ten strokes however many threads there are.
    ctx.strokeStyle = p.thread;
    for (let pass = 0; pass < 2; pass += 1) {
      const bloom = pass === 0;
      if (bloom && k.glow <= 0) continue;
      for (let b = 0; b < BANDS; b += 1) {
        ctx.beginPath();
        for (let i = 0; i < n; i += 1) {
          for (let j = 0; j < SEGMENTS; j += 1) {
            const o = (i * (SEGMENTS + 1) + j) * 3;
            const d = ((pts[o + 2] ?? 0) + (pts[o + 5] ?? 0)) / 2;
            const band = Math.min(
              BANDS - 1,
              Math.max(0, Math.floor(((d + 1) / 2) * BANDS)),
            );
            if (band !== b) continue;
            ctx.moveTo(pts[o] ?? 0, pts[o + 1] ?? 0);
            ctx.lineTo(pts[o + 3] ?? 0, pts[o + 4] ?? 0);
          }
        }
        const alpha = (alphas[b] ?? 0.3) * density;
        if (bloom) {
          ctx.lineWidth = 2.5 + 3.5 * k.glow;
          ctx.globalAlpha = alpha * 0.22 * k.glow;
        } else {
          ctx.lineWidth = WIDTH[b] ?? 1;
          ctx.globalAlpha = alpha;
        }
        ctx.stroke();
      }
    }

    // The waist itself: where the threads lean together their middles
    // gather, so the middle of every thread carries extra light as the
    // twist closes the waist.
    if (pinch > 0.02) {
      ctx.beginPath();
      for (let i = 0; i < n; i += 1) {
        const o = (i * (SEGMENTS + 1) + CORE_FROM) * 3;
        ctx.moveTo(pts[o] ?? 0, pts[o + 1] ?? 0);
        for (let j = CORE_FROM + 1; j <= SEGMENTS - CORE_FROM; j += 1) {
          const q = (i * (SEGMENTS + 1) + j) * 3;
          ctx.lineTo(pts[q] ?? 0, pts[q + 1] ?? 0);
        }
      }
      ctx.lineWidth = 1 + 2 * k.glow;
      ctx.globalAlpha =
        Math.min(1, pinch * (0.25 + 0.6 * k.glow)) *
        density *
        (additive ? 0.65 : 0.28);
      ctx.stroke();
    }

    ctx.strokeStyle = p.hoop;
    drawHoop(ctx, r, view, false, true, k.glow, additive);
    drawHoop(ctx, r, view, true, true, k.glow, additive);

    // The grip: a bead on the top hoop's front edge that turns with the twist.
    const ba = Math.PI / 2 - tw;
    const bX = R * Math.cos(ba);
    const bZ = R * Math.sin(ba);
    const bDepth = bZ * ct + half * st;
    const bp = F / (F - bDepth);
    const beadX = cx + bX * bp;
    const beadY = cy + (-half * ct + bZ * st) * bp;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = bZ >= 0 ? 1 : 0.4;
    ctx.fillStyle = p.hoop;
    ctx.beginPath();
    ctx.arc(beadX, beadY, 4.5 * bp, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // Marked once: re-setting an attribute every frame would restyle the
    // subtree every frame.
    if (!live.current) {
      live.current = true;
      rootRef.current?.setAttribute("data-live", "");
    }
  };

  /** Advances the twist spring and the slow turn; says whether anything still moves. */
  const advance = (dt: number): boolean => {
    const s = sim.current;
    let moving = false;
    if (k.motionSafe && !k.paused && k.spin > 0) {
      s.spin = (s.spin + k.spin * dt) % (Math.PI * 2);
      moving = true;
    }
    if (s.dragging) return moving;
    if (!k.motionSafe) {
      s.twist = s.target;
      s.v = 0;
      return moving;
    }
    const K = springs.snap.stiffness;
    const C = 2 * k.zeta * Math.sqrt(K * springs.snap.mass);
    s.carry += dt;
    let steps = 0;
    while (s.carry >= STEP && steps < 8) {
      s.carry -= STEP;
      steps += 1;
      const a = (-K * (s.twist - s.target) - C * s.v) / springs.snap.mass;
      s.v += a * STEP;
      s.twist += s.v * STEP;
    }
    if (steps === 8) s.carry = 0;
    const settled =
      Math.abs(s.twist - s.target) < STRAIGHT && Math.abs(s.v) < 0.002;
    if (settled) {
      s.twist = s.target;
      s.v = 0;
    }
    return moving || !settled;
  };

  const tick = (now: number) => {
    frame.current = 0;
    const s = sim.current;
    if (!visible.current || document.hidden) {
      s.last = 0;
      return;
    }
    const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 1 / 60;
    s.last = now;
    const moving = advance(dt);
    draw();
    if (moving) frame.current = window.requestAnimationFrame(loop);
    else s.last = 0;
  };

  const kick = () => {
    if (frame.current || !visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(loop);
  };

  React.useLayoutEffect(() => {
    api.current = { draw, kick, resize, readPalette, tick };
    report.current = { onTwistChange, onHoldChange };
  });

  React.useEffect(() => {
    api.current?.readPalette();
    api.current?.draw();
  }, [paintKey]);

  React.useEffect(() => {
    api.current?.resize();
    api.current?.draw();
  }, [k.dpr]);

  React.useEffect(() => {
    api.current?.draw();
    api.current?.kick();
  }, [k.count, k.glow, k.tilt, k.spin, paused, motionSafe]);

  // A new limit on a resting sculpture shows itself: it winds to the limit
  // and unwinds. The first render is not a change.
  const shownLimit = React.useRef(k.limit);
  React.useEffect(() => {
    if (shownLimit.current === k.limit) return;
    shownLimit.current = k.limit;
    const s = sim.current;
    if (s.holding || s.dragging || Math.abs(s.target) > STRAIGHT) return;
    window.clearTimeout(timer.current);
    s.target = k.limit;
    api.current?.kick();
    timer.current = window.setTimeout(
      () => {
        if (sim.current.holding || sim.current.dragging) return;
        sim.current.target = 0;
        api.current?.kick();
      },
      motionSafe ? 650 : PREVIEW_HOLD,
    );
  }, [k.limit, motionSafe]);

  // A limit that shrinks below a held twist pulls it back inside.
  React.useEffect(() => {
    const s = sim.current;
    if (Math.abs(s.target) <= k.limit) return;
    s.target = clamp(s.target, -k.limit, k.limit);
    api.current?.kick();
  }, [k.limit]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) return;
      api.current?.draw();
      api.current?.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const pending = frame;
    const wait = timer;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (pending.current) window.cancelAnimationFrame(pending.current);
      pending.current = 0;
      window.clearTimeout(wait.current);
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      api.current?.resize();
      api.current?.draw();
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (!visible.current) return;
      api.current?.readPalette();
      api.current?.resize();
      api.current?.draw();
      api.current?.kick();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  const setHolding = (next: boolean) => {
    const s = sim.current;
    if (s.holding === next) return;
    s.holding = next;
    report.current.onHoldChange?.(next);
  };

  const tell = (rad: number) => {
    const deg = toDeg(rad);
    if (deg === lastReported.current) return;
    lastReported.current = deg;
    report.current.onTwistChange?.(deg);
  };

  /** Lets go of the hoop: it unwinds to straight, or stays where it is left. */
  const letGo = (velocity = 0) => {
    const s = sim.current;
    s.dragging = false;
    window.clearTimeout(timer.current);
    if (k.springBack) {
      s.target = 0;
    } else {
      const landing = k.motionSafe ? project(s.twist, velocity, 0.99) : s.twist;
      s.target = clamp(landing, -k.limit, k.limit);
    }
    s.v = k.motionSafe ? velocity : 0;
    setHolding(false);
    setShown(toDeg(s.target));
    tell(s.target);
    api.current?.kick();
  };

  const radius = () => {
    const sz = size.current;
    return sz ? measure(sz, geo.current).R : 80;
  };

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: () => {
      const s = sim.current;
      window.clearTimeout(timer.current);
      s.dragging = true;
      dragFrom.current = s.twist;
      s.v = 0;
      setHolding(true);
    },
    onMove: ({ offset }) => {
      const s = sim.current;
      // The bead stays under the finger: travel along the front of the hoop
      // is the angle times its radius.
      const raw = dragFrom.current + offset.x / radius();
      s.twist = rubberClamp(raw, -k.limit, k.limit, 0.7);
      s.target = s.twist;
      tell(clamp(s.twist, -k.limit, k.limit));
      if (!k.motionSafe) api.current?.draw();
      api.current?.kick();
    },
    onEnd: ({ velocity }) => letGo(velocity.x / radius()),
    onCancel: () => letGo(0),
  });

  const keyTo = (rad: number) => {
    const s = sim.current;
    window.clearTimeout(timer.current);
    s.target = clamp(rad, -k.limit, k.limit);
    setHolding(Math.abs(s.target) > STRAIGHT);
    setShown(toDeg(s.target));
    tell(s.target);
    api.current?.kick();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const at = sim.current.target;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        keyTo(at + k.step);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        keyTo(at - k.step);
        break;
      case "PageUp":
        keyTo(at + k.step * 3);
        break;
      case "PageDown":
        keyTo(at - k.step * 3);
        break;
      case "Home":
        keyTo(0);
        break;
      case "End":
        keyTo(k.limit);
        break;
      case "Escape":
      case "Enter":
      case " ":
        if (!sim.current.holding) return;
        letGo(0);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const onBlur = () => {
    if (sim.current.holding && !sim.current.dragging) letGo(0);
  };

  const limitDeg = toDeg(k.limit);
  const minDeg = 0 - limitDeg;
  const waist = Math.round(Math.cos(toRad(Math.abs(shown)) / 2) * 100);
  const valueText =
    shown === 0
      ? "At rest, the threads straight"
      : `Twisted ${Math.abs(shown)} ${Math.abs(shown) === 1 ? "degree" : "degrees"} to the ${shown > 0 ? "right" : "left"}, waist ${waist} percent of the hoop`;

  return (
    <div
      ref={bindRoot}
      className={cn(
        "group/thread-hourglass relative isolate h-full w-full overflow-clip",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-[opacity,visibility] duration-300 group-data-live/thread-hourglass:invisible group-data-live/thread-hourglass:opacity-0"
      >
        <StandIn color={color} hoop={hoop} />
      </div>
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => {
          api.current?.readPalette();
          api.current?.draw();
        }}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {paints.map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-describedby={hintId}
        aria-valuemin={minDeg}
        aria-valuemax={limitDeg}
        aria-valuenow={shown}
        aria-valuetext={valueText}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        {...drag}
        className={cn(
          // A sideways drag twists; an upright swipe still scrolls the page.
          "absolute inset-0 touch-pan-y rounded-[inherit] outline-none select-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-not-allowed"
            : "cursor-grab active:cursor-grabbing",
        )}
      />
      <p id={hintId} className="sr-only">
        Drag sideways, or use the arrow keys, to twist the top hoop; Escape or
        Enter lets it go.
      </p>
    </div>
  );
}

/**
 * The designed still frame for the server render and the first paint: the
 * two hoops as ellipses and the threads straight between them, in SVG.
 */
function StandIn({ color, hoop }: { color: string; hoop: string }) {
  const lines = [];
  // Percentages of the box, laid out like the canvas in a tall card.
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2;
    const x = `${Number((50 + 36 * Math.cos(a)).toFixed(3))}%`;
    const dy = 6 * Math.sin(a);
    const pct = (v: number) => `${Number(v.toFixed(3))}%`;
    lines.push(
      <line key={i} x1={x} y1={pct(79 + dy)} x2={x} y2={pct(21 + dy)} />,
    );
  }
  return (
    <svg className="size-full">
      <g stroke={color} strokeWidth={1} opacity={0.5}>
        {lines}
      </g>
      <g fill="none" stroke={hoop} strokeWidth={1.6}>
        <ellipse cx="50%" cy="21%" rx="36%" ry="6%" />
        <ellipse cx="50%" cy="79%" rx="36%" ry="6%" />
      </g>
    </svg>
  );
}
