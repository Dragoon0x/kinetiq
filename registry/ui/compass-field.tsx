"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

export type CompassFieldPolarity = "attract" | "repel";

export type CompassFieldHandle = {
  /** Sends a seeded gust through the field from its left edge. Silent and decorative; nothing under reduced motion. */
  swing: () => void;
};

export type CompassFieldProps = {
  /** Content laid over the field, such as a headline. It stays fully interactive; the needles never take a click. */
  children?: React.ReactNode;
  /** How many needles stand in every 100 px, along each axis. @default 4 */
  density?: number;
  /** A needle's resting length, as a share of the space between needles. @default 0.7 */
  length?: number;
  /** Each needle's damping ratio: low values ring and wobble, 1 settles dead-beat. @default 0.45 */
  damping?: number;
  /** How much longer needles grow as the pointer comes near, as a share of their length. @default 0.4 */
  grow?: number;
  /** The distance, in px, within which needles answer faster, lengthen and brighten. @default 200 */
  reach?: number;
  /** How quickly the needles answer overall, as a multiple of the house stiffness. @default 1 */
  speed?: number;
  /** How fast a turn spreads outward from the pointer, in px per second; 0 turns every needle at once. @default 900 */
  wave?: number;
  /** The bearing every needle rests at when the pointer is away, in degrees clockwise from up. @default 0 */
  north?: number;
  /** The seeded deviation from that bearing at rest, in degrees, so the field reads hand-made. @default 6 */
  scatter?: number;
  /** Whether the north ends turn toward the pointer or away from it. @default "attract" */
  polarity?: CompassFieldPolarity;
  /** The north half of every needle, any CSS colour, resolved on the element. @default "var(--accent-bright)" */
  northColor?: string;
  /** The south half and the pivot, any CSS colour, resolved on the element. @default "var(--ink-3)" */
  southColor?: string;
  /** One gust through the field the first time it comes into view. @default true */
  intro?: boolean;
  /** Keyboard focus inside turns the needles toward the focused element. @default true */
  followFocus?: boolean;
  /** The pointer (mouse and pen) turns the needles, and a tap turns them for a moment. @default true */
  interactive?: boolean;
  /** Holds every needle where it is and stops the loop. @default false */
  paused?: boolean;
  /** Seed for the resting scatter, each needle's own frequency and the gust. @default 7 */
  seed?: number;
  /** The highest device pixel ratio the canvas draws at (never above 2). @default 2 */
  dpr?: number;
  /** Classes for the box. Give it a height; children are laid out inside it. */
  className?: string;
  /** Exposes `swing()`. */
  ref?: React.Ref<CompassFieldHandle>;
};

type Rgb = [number, number, number];

/** Resolves any CSS colour the canvas can parse into its sRGB bytes. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): Rgb => {
    if (!ctx) return [0, 0, 0];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
  };
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const TAU = Math.PI * 2;

/** An unsigned integer hash to [0, 1). */
const hash = (i: number, seed: number) => {
  let h = (Math.imul(i, 374761393) + Math.imul(seed, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** The short way round: an angle difference folded into [-π, π]. */
const wrap = (a: number) => {
  let v = a % TAU;
  if (v > Math.PI) v -= TAU;
  else if (v < -Math.PI) v += TAU;
  return v;
};

/** Far needles: ω₀ ≈ 9 rad/s, about a second to settle at ζ 0.45. */
const BASE_STIFFNESS = 80;
/** Near the pointer a needle answers up to this many times stiffer. */
const NEAR_BOOST = 2.5;
/** Pointer history, read in 16 ms buckets for the outward wave. */
const RING = 64;
const BUCKETS = 48;
const BUCKET_MS = 16;
const ALPHAS = [0.5, 0.66, 0.82, 1] as const;
const TAP_HOLD = 1200;

/**
 * A field of compass needles that turns to find the pointer. Every needle is
 * a damped rotational spring (its damping ratio is `damping`, so by default
 * it swings past and wobbles once or twice before it settles) whose
 * frequency is nudged by a seed so neighbours never move in lockstep. Near
 * the pointer a needle stiffens, lengthens and brightens; and each needle
 * reads the pointer where it was a moment ago — `distance / wave` seconds —
 * so a turn spreads outward from the hand like a ripple and a sweep leaves a
 * wake of rotation behind it. Leaving sends the field home to `north` as a
 * wave from the exit point. Keyboard focus inside turns the needles toward
 * the focused element; a tap turns them for a moment. Under reduced motion
 * the needles point straight at the pointer with no spring, wobble or wave,
 * and jump home on leave.
 */
export function CompassField({
  children,
  density = 4,
  length = 0.7,
  damping = 0.45,
  grow = 0.4,
  reach = 200,
  speed = 1,
  wave = 900,
  north = 0,
  scatter = 6,
  polarity = "attract",
  northColor = "var(--accent-bright)",
  southColor = "var(--ink-3)",
  intro = true,
  followFocus = true,
  interactive = true,
  paused = false,
  seed = 7,
  dpr = 2,
  className,
  ref,
}: CompassFieldProps) {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const probeRef = React.useRef<HTMLSpanElement | null>(null);
  const [painted, setPainted] = React.useState(false);

  const spacing = 100 / clamp(density, 1, 12);
  const params = React.useRef({
    spacing,
    length,
    damping,
    grow,
    reach,
    speed,
    wave,
    north,
    scatter,
    polarity,
    northColor,
    southColor,
    intro,
    interactive,
    paused,
    seed,
    dpr,
    motionSafe,
  });
  React.useEffect(() => {
    params.current = {
      spacing,
      length,
      damping,
      grow,
      reach,
      speed,
      wave,
      north,
      scatter,
      polarity,
      northColor,
      southColor,
      intro,
      interactive,
      paused,
      seed,
      dpr,
      motionSafe,
    };
  });

  const api = React.useRef<{
    point: (x: number, y: number) => void;
    leave: () => void;
    tap: (x: number, y: number) => void;
    focus: (node: HTMLElement | null) => void;
    rebuild: () => void;
    restyle: () => void;
    swing: () => void;
    wake: () => void;
  } | null>(null);

  React.useImperativeHandle(
    ref,
    () => ({ swing: () => api.current?.swing() }),
    [],
  );

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const g = ctx;
    const read = rgbReader();

    let w = 0;
    let h = 0;
    let ratio = 1;
    let raf = 0;
    let last = 0;
    let inView = false;
    let introduced = false;
    let shown = false;
    let northFill = "rgb(90, 110, 220)";
    let southFill = "rgb(120, 125, 140)";

    // The needles, as flat arrays: rebuilt on resize, never per frame.
    let n = 0;
    let nx = new Float32Array(0);
    let ny = new Float32Array(0);
    let home = new Float32Array(0);
    let theta = new Float32Array(0);
    let omega = new Float32Array(0);
    let freq = new Float32Array(0);
    let len = new Float32Array(0);
    let near = new Float32Array(0);
    let gust = new Float32Array(0);
    let kicked = new Uint8Array(0);
    let cosA = new Float32Array(0);
    let sinA = new Float32Array(0);
    let restLen = 10;
    let half = 1.5;

    // Where the magnet is: the pointer, a focused element, or a tap.
    const pointer = { x: 0, y: 0, inside: false };
    const focusAt = { x: 0, y: 0, on: false };
    let focusNode: HTMLElement | null = null;
    const tapAt = { x: 0, y: 0, on: false };
    let tapTimer = 0;
    let srcX = 0;
    let srcY = 0;
    let srcOn = 0;
    let lastX = 0;
    let lastY = 0;
    let changedAt = -1e9;

    const hx = new Float32Array(RING);
    const hy = new Float32Array(RING);
    const ht = new Float64Array(RING);
    const ha = new Uint8Array(RING);
    let headIdx = 0;
    let filled = 0;
    const bx = new Float32Array(BUCKETS);
    const by = new Float32Array(BUCKETS);
    const ba = new Uint8Array(BUCKETS);
    let gustAt = -1;

    const homeOf = (i: number) => {
      const p = params.current;
      const dev = (hash(i, p.seed + 11) * 2 - 1) * clamp(p.scatter, 0, 90);
      return ((p.north + dev) * Math.PI) / 180 - Math.PI / 2;
    };

    const rebuild = () => {
      const p = params.current;
      const s = Math.max(6, p.spacing);
      const rh = s * 0.866;
      const cols = Math.max(1, Math.floor(w / s));
      const rows = Math.max(1, Math.floor(h / rh));
      const x0 = (w - (cols - 1) * s) / 2;
      const y0 = (h - (rows - 1) * rh) / 2;
      let count = 0;
      for (let r = 0; r < rows; r += 1) count += r % 2 ? cols - 1 : cols;
      const prevTheta = theta;
      const prevN = n;
      n = Math.max(0, count);
      nx = new Float32Array(n);
      ny = new Float32Array(n);
      home = new Float32Array(n);
      theta = new Float32Array(n);
      omega = new Float32Array(n);
      freq = new Float32Array(n);
      len = new Float32Array(n);
      near = new Float32Array(n);
      gust = new Float32Array(n);
      kicked = new Uint8Array(n);
      cosA = new Float32Array(n);
      sinA = new Float32Array(n);
      restLen = clamp(p.length, 0.1, 1.2) * s;
      half = clamp(s * 0.07, 1.1, 2.6);
      let i = 0;
      for (let r = 0; r < rows; r += 1) {
        const odd = r % 2 === 1;
        const c = odd ? cols - 1 : cols;
        for (let k = 0; k < c; k += 1) {
          nx[i] = x0 + k * s + (odd ? s / 2 : 0);
          ny[i] = y0 + r * rh;
          home[i] = homeOf(i);
          // A rebuild keeps the needles where they were pointing, so a
          // density change re-grids without every needle snapping north.
          theta[i] = i < prevN ? (prevTheta[i] ?? home[i]!) : home[i]!;
          freq[i] = 0.88 + hash(i, p.seed) * 0.24;
          len[i] = restLen;
          gust[i] = 0.7 + hash(i, p.seed + 29) * 0.6;
          i += 1;
        }
      }
      gustAt = -1;
    };

    const restyle = () => {
      const probe = probeRef.current;
      if (!probe) return;
      const p = params.current;
      probe.style.color = p.northColor;
      const a = read(getComputedStyle(probe).color);
      probe.style.color = p.southColor;
      const b = read(getComputedStyle(probe).color);
      northFill = `rgb(${a[0]}, ${a[1]}, ${a[2]})`;
      southFill = `rgb(${b[0]}, ${b[1]}, ${b[2]})`;
    };

    const placeFocus = (node: HTMLElement) => {
      const a = root.getBoundingClientRect();
      const b = node.getBoundingClientRect();
      focusAt.x = b.left + b.width / 2 - a.left;
      focusAt.y = b.top + b.height / 2 - a.top;
    };

    const layout = () => {
      w = root.clientWidth;
      h = root.clientHeight;
      if (w < 1 || h < 1) return false;
      ratio = Math.min(
        2,
        Math.max(1, params.current.dpr),
        window.devicePixelRatio || 1,
      );
      canvas.width = Math.max(1, Math.round(w * ratio));
      canvas.height = Math.max(1, Math.round(h * ratio));
      if (focusNode?.isConnected) placeFocus(focusNode);
      rebuild();
      return true;
    };

    const draw = () => {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
      if (n === 0) return;
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      for (let i = 0; i < n; i += 1) {
        cosA[i] = Math.cos(theta[i]!);
        sinA[i] = Math.sin(theta[i]!);
      }
      // South halves: one path.
      g.globalAlpha = 0.55;
      g.fillStyle = southFill;
      g.beginPath();
      for (let i = 0; i < n; i += 1) {
        const x = nx[i]!;
        const y = ny[i]!;
        const c = cosA[i]!;
        const s = sinA[i]!;
        const l = len[i]! / 2;
        g.moveTo(x - c * l, y - s * l);
        g.lineTo(x - s * half, y + c * half);
        g.lineTo(x + s * half, y - c * half);
        g.closePath();
      }
      g.fill();
      // North halves in four alpha buckets: brighter near the pointer.
      g.fillStyle = northFill;
      for (let b = 0; b < ALPHAS.length; b += 1) {
        g.globalAlpha = ALPHAS[b]!;
        g.beginPath();
        let any = false;
        for (let i = 0; i < n; i += 1) {
          if (Math.min(3, Math.floor(near[i]! * 4)) !== b) continue;
          any = true;
          const x = nx[i]!;
          const y = ny[i]!;
          const c = cosA[i]!;
          const s = sinA[i]!;
          const l = len[i]! / 2;
          g.moveTo(x + c * l, y + s * l);
          g.lineTo(x - s * half, y + c * half);
          g.lineTo(x + s * half, y - c * half);
          g.closePath();
        }
        if (any) g.fill();
      }
      // Pivots.
      g.globalAlpha = 1;
      g.fillStyle = southFill;
      g.beginPath();
      const pr = half * 0.85;
      for (let i = 0; i < n; i += 1) {
        g.moveTo(nx[i]! + pr, ny[i]!);
        g.arc(nx[i]!, ny[i]!, pr, 0, TAU);
      }
      g.fill();
      if (!shown) {
        shown = true;
        setPainted(true);
      }
    };

    /** Reads where the magnet is right now into srcX / srcY / srcOn. */
    const readSource = () => {
      const p = params.current;
      if (pointer.inside && p.interactive) {
        srcX = pointer.x;
        srcY = pointer.y;
        srcOn = 1;
      } else if (focusAt.on) {
        srcX = focusAt.x;
        srcY = focusAt.y;
        srcOn = 1;
      } else if (tapAt.on) {
        srcX = tapAt.x;
        srcY = tapAt.y;
        srcOn = 1;
      } else {
        srcOn = 0;
      }
      if (srcOn) {
        lastX = srcX;
        lastY = srcY;
      }
    };

    const record = (now: number) => {
      headIdx = (headIdx + 1) % RING;
      hx[headIdx] = srcX;
      hy[headIdx] = srcY;
      ht[headIdx] = now;
      ha[headIdx] = srcOn;
      filled = Math.min(RING, filled + 1);
      let j = 0;
      for (let k = 0; k < BUCKETS; k += 1) {
        const tk = now - k * BUCKET_MS;
        while (j < filled - 1 && ht[(headIdx - j + RING) % RING]! > tk) j += 1;
        const idx = (headIdx - j + RING) % RING;
        bx[k] = hx[idx]!;
        by[k] = hy[idx]!;
        ba[k] = ha[idx]!;
      }
    };

    /** The bearing and pull each needle wants, from the delayed magnet. */
    const targetOf = (i: number, out: { a: number; near: number }) => {
      const p = params.current;
      const x = nx[i]!;
      const y = ny[i]!;
      const dx = x - lastX;
      const dy = y - lastY;
      const d = Math.sqrt(dx * dx + dy * dy);
      const k =
        p.wave > 0
          ? Math.min(BUCKETS - 1, Math.round((d / p.wave) * (1000 / BUCKET_MS)))
          : 0;
      out.near = srcOn ? Math.max(0, 1 - d / Math.max(1, p.reach)) : 0;
      out.near = out.near * out.near * (3 - 2 * out.near);
      if (!ba[k]) {
        out.a = home[i]!;
        return;
      }
      const tx = bx[k]! - x;
      const ty = by[k]! - y;
      if (tx * tx + ty * ty < 1) {
        out.a = theta[i]!;
        return;
      }
      out.a = Math.atan2(ty, tx) + (p.polarity === "repel" ? Math.PI : 0);
    };
    const want = { a: 0, near: 0 };

    let settled = true;
    const step = (dt: number, now: number) => {
      const p = params.current;
      const zeta = clamp(p.damping, 0.05, 1.5);
      const base = BASE_STIFFNESS * clamp(p.speed, 0.1, 4);
      const growBy = clamp(p.grow, 0, 2);
      const ease = 1 - Math.exp(-dt * 12);
      const front =
        gustAt >= 0 ? ((now - gustAt) / 1000) * Math.max(300, p.wave) : -1;
      let busy = false;
      for (let i = 0; i < n; i += 1) {
        targetOf(i, want);
        near[i] = near[i]! + (want.near - near[i]!) * ease;
        const k = base * freq[i]! * (1 + NEAR_BOOST * near[i]!);
        const c = 2 * zeta * Math.sqrt(k);
        if (front >= 0 && !kicked[i] && nx[i]! <= front) {
          kicked[i] = 1;
          omega[i] = omega[i]! + 7 * gust[i]!;
        }
        const delta = wrap(want.a - theta[i]!);
        omega[i] = omega[i]! + (k * delta - c * omega[i]!) * dt;
        let t = theta[i]! + omega[i]! * dt;
        if (t > Math.PI) t -= TAU;
        else if (t < -Math.PI) t += TAU;
        theta[i] = t;
        const l = restLen * (1 + growBy * near[i]!);
        len[i] = len[i]! + (l - len[i]!) * ease;
        if (
          !busy &&
          (Math.abs(delta) > 0.003 ||
            Math.abs(omega[i]!) > 0.03 ||
            Math.abs(l - len[i]!) > 0.05)
        ) {
          busy = true;
        }
      }
      if (front >= 0 && front > w + 40) gustAt = -1;
      settled = !busy && gustAt < 0;
    };

    /** Reduced motion: every needle straight to its bearing, no history. */
    const snap = () => {
      const p = params.current;
      readSource();
      for (let k = 0; k < BUCKETS; k += 1) {
        bx[k] = srcX;
        by[k] = srcY;
        ba[k] = srcOn;
      }
      const growBy = clamp(p.grow, 0, 2);
      for (let i = 0; i < n; i += 1) {
        targetOf(i, want);
        theta[i] = want.a;
        omega[i] = 0;
        near[i] = want.near;
        len[i] = restLen * (1 + growBy * want.near);
      }
      gustAt = -1;
    };

    let drawQueued = 0;
    const drawSoon = () => {
      if (drawQueued) return;
      drawQueued = requestAnimationFrame(() => {
        drawQueued = 0;
        draw();
      });
    };

    const frame = (now: number) => {
      raf = 0;
      const p = params.current;
      if (!inView || document.hidden || p.paused || !p.motionSafe) {
        last = 0;
        return;
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      readSource();
      record(now);
      let t = dt;
      while (t > 1e-6) {
        const d = Math.min(t, 1 / 120);
        step(d, now);
        t -= d;
      }
      draw();
      // The history keeps a turn spreading for one bucket span after the
      // last change, even once the near needles have settled.
      const spreading = now - changedAt < BUCKETS * BUCKET_MS + 48;
      if (settled && !spreading) {
        last = 0;
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    const wake = () => {
      const p = params.current;
      if (!p.motionSafe) {
        snap();
        drawSoon();
        return;
      }
      if (p.paused) {
        drawSoon();
        return;
      }
      if (raf || !inView || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };

    const changed = () => {
      changedAt = performance.now();
      wake();
    };

    const swing = () => {
      const p = params.current;
      if (!p.motionSafe || p.paused || n === 0) return;
      kicked.fill(0);
      gustAt = performance.now();
      changed();
    };

    api.current = {
      point: (x, y) => {
        pointer.x = x;
        pointer.y = y;
        pointer.inside = true;
        changed();
      },
      leave: () => {
        if (!pointer.inside) return;
        pointer.inside = false;
        changed();
      },
      tap: (x, y) => {
        tapAt.x = x;
        tapAt.y = y;
        tapAt.on = true;
        window.clearTimeout(tapTimer);
        tapTimer = window.setTimeout(() => {
          tapAt.on = false;
          changed();
        }, TAP_HOLD);
        changed();
      },
      focus: (node) => {
        focusNode = node;
        if (node) placeFocus(node);
        focusAt.on = node !== null;
        changed();
      },
      rebuild: () => {
        if (w < 1 || h < 1) return;
        rebuild();
        if (!params.current.motionSafe) snap();
        draw();
        changed();
      },
      restyle: () => {
        restyle();
        draw();
      },
      swing,
      wake: () => {
        if (!params.current.motionSafe) snap();
        changed();
      },
    };

    restyle();
    const sizer = new ResizeObserver(() => {
      if (!layout()) return;
      if (!params.current.motionSafe) snap();
      draw();
      changed();
    });
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inView = entry.isIntersecting;
      if (!inView) return;
      if (!introduced && params.current.intro && n > 0) {
        introduced = true;
        swing();
      }
      wake();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) wake();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (drawQueued) cancelAnimationFrame(drawQueued);
      raf = 0;
      drawQueued = 0;
      window.clearTimeout(tapTimer);
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      api.current = null;
    };
  }, []);

  React.useEffect(() => {
    api.current?.rebuild();
  }, [spacing, length, north, scatter, seed, dpr]);
  React.useEffect(() => {
    api.current?.restyle();
  }, [northColor, southColor]);
  React.useEffect(() => {
    api.current?.wake();
  }, [damping, grow, reach, speed, wave, polarity, paused, motionSafe]);

  const local = (clientX: number, clientY: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect
      ? { x: clientX - rect.left, y: clientY - rect.top }
      : { x: 0, y: 0 };
  };
  const touchStart = React.useRef<{ x: number; y: number } | null>(null);

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || event.pointerType === "touch") return;
    const at = local(event.clientX, event.clientY);
    api.current?.point(at.x, at.y);
  };
  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    api.current?.leave();
  };
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || event.pointerType !== "touch") return;
    touchStart.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || event.pointerType !== "touch") return;
    // A tap, not a scroll: the field turns toward it for a moment.
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10)
      return;
    const at = local(event.clientX, event.clientY);
    api.current?.tap(at.x, at.y);
  };
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!followFocus) return;
    const target = event.target as HTMLElement;
    if (!target.matches(":focus-visible")) return;
    api.current?.focus(target);
  };
  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && rootRef.current?.contains(next)) return;
    api.current?.focus(null);
  };

  const cell = r3(spacing);
  const rowCell = r3(spacing * 0.866);

  return (
    <div
      ref={rootRef}
      onPointerMove={onPointerMove}
      onPointerEnter={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        touchStart.current = null;
      }}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn("relative isolate overflow-clip", className)}
    >
      {/* The server's frame (and the first paint): the pivots alone, as a
          faint dot grid, handing over to the canvas once it has drawn. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 transition-opacity duration-300"
        style={{
          opacity: painted ? 0 : 0.6,
          backgroundImage: `radial-gradient(circle at center, ${southColor} 1.1px, transparent 1.6px)`,
          backgroundSize: `${cell}px ${rowCell}px`,
          backgroundPosition: "center",
        }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 size-full"
      />
      {children}
      <span
        ref={probeRef}
        aria-hidden
        className="pointer-events-none absolute size-0 overflow-hidden"
      />
      {/* A theme change shows up as this carrier's 1ms colour transition. */}
      <span
        aria-hidden
        onTransitionEnd={() => api.current?.restyle()}
        className="pointer-events-none absolute size-0 overflow-hidden text-foreground transition-colors duration-1"
      />
    </div>
  );
}
