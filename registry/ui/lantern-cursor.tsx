"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LanternCursorProps = {
  /** The scene the lantern lights. It stays fully interactive; the night and the lamplight never take a click. */
  children: React.ReactNode;
  /** The pool of light's radius, in CSS pixels. @default 130 */
  radius?: number;
  /** The light's colour temperature, 0 (a neutral white) to 1 (candle amber). @default 0.6 */
  warmth?: number;
  /** How dark the room is outside the light, 0 to 1. @default 0.8 */
  dim?: number;
  /** How soft the pool's edge is, as a share of its radius, 0 to 1. @default 0.6 */
  feather?: number;
  /** How far the lantern lags the hand, 0 (the flick spring) through 0.5 (glide) to 1 (drift). @default 0.5 */
  lag?: number;
  /** How far the light swings ahead along the direction of travel and stretches with speed, 0 to 1. @default 0.5 */
  lean?: number;
  /** The flame's faint flicker in size and warmth, 0 (steady) to 1. @default 0.4 */
  flicker?: number;
  /** The warmth the lamplight lays over what it lights, 0 to 1. @default 0.5 */
  glow?: number;
  /** Where the lantern is set down when the pointer leaves, as [x, y] fractions of the box. @default [0.5, 0.45] */
  rest?: [number, number];
  /** The night's colour, any CSS colour. Fixed art by default — night is night in either theme. @default "oklch(0.16 0.025 262)" */
  darkness?: string;
  /** Keyboard focus inside carries the lantern to the focused element. @default true */
  followFocus?: boolean;
  /** The pointer carries the lantern (mouse and pen; touch gets the resting light). @default true */
  interactive?: boolean;
  /** Hold the flicker. @default false */
  paused?: boolean;
  /** Seed for the flicker. @default 5 */
  seed?: number;
  /** The highest device pixel ratio the canvas draws at (never above 2). @default 2 */
  dpr?: number;
  /** Classes for the box. */
  className?: string;
};

type Rgb = [number, number, number];

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
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** The lantern's light, from a neutral white to candle amber. */
const lightOf = (warmth: number) => {
  const w = clamp(warmth, 0, 1);
  return {
    l: r3(0.88 - w * 0.06),
    c: r3(0.02 + w * 0.15),
    h: r2(95 - w * 40),
  };
};

/** A spring between the house's flick, glide and drift, by `lag`. */
const springFor = (lag: number) => {
  const t = clamp(lag, 0, 1);
  const [a, b, k] =
    t < 0.5
      ? [springs.flick, springs.glide, t * 2]
      : [springs.glide, springs.drift, (t - 0.5) * 2];
  return {
    stiffness: lerp(a.stiffness, b.stiffness, k),
    damping: lerp(a.damping, b.damping, k),
    mass: lerp(a.mass, b.mass, k),
  };
};

const hash = (i: number, seed: number) => {
  let h = (i * 374761393 + seed * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Smooth 1D value noise in [-1, 1]. */
const wobble = (t: number, seed: number) => {
  const i = Math.floor(t);
  const f = t - i;
  const s = f * f * (3 - 2 * f);
  return (hash(i, seed) + (hash(i + 1, seed) - hash(i, seed)) * s) * 2 - 1;
};

/**
 * A dim room, lit by a lantern the visitor carries. The night is a canvas laid
 * over the children with the pool cut out of it on a feathered radial falloff
 * and a faint warm spill just past its edge; over that, a disc of lamplight in
 * `soft-light` warms whatever it falls on, moved by a composited transform.
 *
 * The lantern follows the pointer on a damped spring — flick, glide or drift
 * by `lag`, integrated per frame so it carries real velocity — and leans: the
 * pool's centre swings ahead along the direction of travel and stretches
 * with speed (its area kept), then rounds out as it slows. Seeded noise at two
 * rates makes the flame breathe. Keyboard focus inside carries the light to
 * the focused element and opens it to cover it; when the pointer leaves, the
 * lantern is set down at `rest` on the drift spring. Touch visitors get that
 * resting light. Under reduced motion the pool sits exactly under the pointer,
 * steady, and jumps to focus and back to rest.
 */
export function LanternCursor({
  children,
  radius = 130,
  warmth = 0.6,
  dim = 0.8,
  feather = 0.6,
  lag = 0.5,
  lean = 0.5,
  flicker = 0.4,
  glow = 0.5,
  rest = [0.5, 0.45],
  darkness = "oklch(0.16 0.025 262)",
  followFocus = true,
  interactive = true,
  paused = false,
  seed = 5,
  dpr = 2,
  className,
}: LanternCursorProps) {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const lampRef = React.useRef<HTMLSpanElement | null>(null);
  const probeRef = React.useRef<HTMLSpanElement | null>(null);
  const [painted, setPainted] = React.useState(false);

  // The lamplight disc is moved by a transform string built per frame and
  // shown on its own opacity — neither re-renders React.
  const lampTransform = useMotionValue("translate3d(-9999px, -9999px, 0)");
  const lampOpacity = useMotionValue(0);

  const restX = clamp(rest[0], 0, 1);
  const restY = clamp(rest[1], 0, 1);
  const params = React.useRef({
    radius,
    warmth,
    dim,
    feather,
    lag,
    lean,
    flicker,
    glow,
    restX,
    restY,
    darkness,
    followFocus,
    interactive,
    paused,
    seed,
    dpr,
    motionSafe,
  });
  React.useEffect(() => {
    params.current = {
      radius,
      warmth,
      dim,
      feather,
      lag,
      lean,
      flicker,
      glow,
      restX,
      restY,
      darkness,
      followFocus,
      interactive,
      paused,
      seed,
      dpr,
      motionSafe,
    };
  });

  const api = React.useRef<{
    point: (x: number, y: number) => void;
    focus: (x: number, y: number, reach: number) => void;
    leave: () => void;
    restyle: () => void;
    wake: () => void;
  } | null>(null);

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
    let clock = 0;
    let skip = false;
    let inView = true;
    let shown = false;
    let night = "rgba(16, 20, 32, 0.8)";
    // Light adds on a dark page and tints on a light one: the lamplight
    // screens over dark grounds and multiplies over light ones.
    let lampGain = 0.55;
    let cut: CanvasGradient | null = null;
    let spill: CanvasGradient | null = null;
    // The lantern: where it is, how fast, where it is going, how wide.
    const lamp = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      tx: 0,
      ty: 0,
      mode: "rest" as "rest" | "pointer" | "focus",
      reach: 0,
      size: 0,
      sizeV: 0,
      angle: 0,
      stretch: 1,
      placed: false,
    };

    const restyle = () => {
      const probe = probeRef.current;
      const p = params.current;
      if (!probe) return;
      probe.style.color = p.darkness;
      const n = read(getComputedStyle(probe).color);
      night = `rgba(${n[0]}, ${n[1]}, ${n[2]}, ${r3(clamp(p.dim, 0, 1))})`;
      // Unit gradients, scaled to the pool each frame: made once per look,
      // never per frame.
      const inner = 1 - clamp(p.feather, 0.05, 1);
      cut = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      cut.addColorStop(0, "rgba(0, 0, 0, 1)");
      for (let k = 0; k <= 6; k += 1) {
        const t = k / 6;
        const s = t * t * (3 - 2 * t);
        cut.addColorStop(
          inner + (1 - inner) * t,
          `rgba(0, 0, 0, ${r3(1 - s)})`,
        );
      }
      const light = lightOf(p.warmth);
      probe.style.color = `oklch(${light.l} ${light.c} ${light.h})`;
      const l = read(getComputedStyle(probe).color);
      const a = r3(0.12 * clamp(p.warmth, 0, 1) * clamp(p.dim, 0, 1));
      spill = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      spill.addColorStop(0, `rgba(${l[0]}, ${l[1]}, ${l[2]}, 0)`);
      spill.addColorStop(0.55, `rgba(${l[0]}, ${l[1]}, ${l[2]}, 0)`);
      spill.addColorStop(0.78, `rgba(${l[0]}, ${l[1]}, ${l[2]}, ${a})`);
      spill.addColorStop(1, `rgba(${l[0]}, ${l[1]}, ${l[2]}, 0)`);
      probe.style.color = "var(--background)";
      const ground = read(getComputedStyle(probe).color);
      const pale =
        (0.2126 * ground[0] + 0.7152 * ground[1] + 0.0722 * ground[2]) / 255 >
        0.5;
      lampGain = pale ? 0.62 : 0.5;
      const lampNode = lampRef.current;
      if (lampNode) lampNode.style.mixBlendMode = pale ? "multiply" : "screen";
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
      if (!lamp.placed) {
        lamp.placed = true;
        lamp.x = lamp.tx = params.current.restX * w;
        lamp.y = lamp.ty = params.current.restY * h;
        lamp.size = params.current.radius;
      } else if (lamp.mode === "rest") {
        lamp.tx = params.current.restX * w;
        lamp.ty = params.current.restY * h;
      }
      return true;
    };

    /** A unit gradient laid as an ellipse along the lantern's heading. */
    const disc = (
      fill: CanvasGradient,
      cx: number,
      cy: number,
      rx: number,
      ry: number,
    ) => {
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      g.translate(cx, cy);
      g.rotate(lamp.angle);
      g.scale(rx, ry);
      g.fillStyle = fill;
      g.beginPath();
      g.arc(0, 0, 1, 0, Math.PI * 2);
      g.fill();
    };

    const draw = () => {
      if (w < 1 || h < 1 || !cut || !spill) return;
      const p = params.current;
      const f = p.paused || !p.motionSafe ? 0 : clamp(p.flicker, 0, 1);
      const breath =
        f *
        (0.03 * wobble(clock * 2.3, p.seed) +
          0.012 * wobble(clock * 9, p.seed + 7));
      const r = Math.max(4, lamp.size * (1 + breath));
      const sx = lamp.stretch;
      const sy = 1 / Math.sqrt(lamp.stretch);
      // The lean: the pool's centre swings ahead along the travel.
      const ahead = clamp(p.lean, 0, 1) * 0.12;
      let lx = lamp.vx * ahead;
      let ly = lamp.vy * ahead;
      const lead = Math.hypot(lx, ly);
      const cap = r * 0.45;
      if (lead > cap) {
        lx = (lx / lead) * cap;
        ly = (ly / lead) * cap;
      }
      const cx = lamp.x + lx;
      const cy = lamp.y + ly;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = "source-over";
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.fillStyle = night;
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.globalCompositeOperation = "destination-out";
      disc(cut, cx, cy, r * sx, r * sy);
      g.globalCompositeOperation = "source-over";
      disc(spill, cx, cy, r * 1.3 * sx, r * 1.3 * sy);
      g.setTransform(1, 0, 0, 1, 0, 0);
      // The lamplight disc, on the compositor.
      const size = p.radius * 2.6;
      lampTransform.set(
        `translate3d(${r2(cx - size / 2)}px, ${r2(cy - size / 2)}px, 0) rotate(${r3(lamp.angle)}rad) scale(${r3((r / p.radius) * sx)}, ${r3((r / p.radius) * sy)})`,
      );
      const level = clamp(p.glow, 0, 1) * lampGain;
      if (!shown) {
        shown = true;
        setPainted(true);
        animate(lampOpacity, level, {
          duration: durations.slow,
          ease: easings.enter,
        });
      } else if (f === 0) {
        lampOpacity.set(r3(level));
      } else {
        lampOpacity.set(
          r3(level * (0.88 + 0.12 * wobble(clock * 3.1, p.seed + 3))),
        );
      }
    };

    /** The lantern's own physics, one frame. */
    const step = (dt: number) => {
      const p = params.current;
      const s = lamp.mode === "rest" ? springs.drift : springFor(p.lag);
      const ax =
        (-s.stiffness * (lamp.x - lamp.tx) - s.damping * lamp.vx) / s.mass;
      const ay =
        (-s.stiffness * (lamp.y - lamp.ty) - s.damping * lamp.vy) / s.mass;
      lamp.vx += ax * dt;
      lamp.vy += ay * dt;
      lamp.x += lamp.vx * dt;
      lamp.y += lamp.vy * dt;
      // The pool opens to a focused element and closes back on glide.
      const want =
        lamp.mode === "focus" ? Math.max(p.radius, lamp.reach) : p.radius;
      const k = springs.glide;
      const as =
        (-k.stiffness * (lamp.size - want) - k.damping * lamp.sizeV) / k.mass;
      lamp.sizeV += as * dt;
      lamp.size += lamp.sizeV * dt;
      // The stretch and its direction follow the speed; a slow lantern
      // rounds out and keeps its last heading.
      const speed = Math.hypot(lamp.vx, lamp.vy);
      if (speed > 24) lamp.angle = Math.atan2(lamp.vy, lamp.vx);
      lamp.stretch = 1 + Math.min(0.35, (speed * clamp(p.lean, 0, 1)) / 2200);
      clock += dt;
    };

    const moving = () =>
      Math.abs(lamp.x - lamp.tx) > 0.3 ||
      Math.abs(lamp.y - lamp.ty) > 0.3 ||
      Math.hypot(lamp.vx, lamp.vy) > 1 ||
      Math.abs(lamp.sizeV) > 0.5 ||
      Math.abs(
        lamp.size -
          (lamp.mode === "focus"
            ? Math.max(params.current.radius, lamp.reach)
            : params.current.radius),
      ) > 0.3;

    const frame = (now: number) => {
      raf = 0;
      const p = params.current;
      if (!inView || document.hidden || !p.motionSafe) {
        last = 0;
        return;
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      let t = dt;
      while (t > 0) {
        const d = Math.min(t, 1 / 120);
        step(d);
        t -= d;
      }
      const busy = moving();
      const breathing = !p.paused && p.flicker > 0;
      if (!busy && !breathing) {
        draw();
        last = 0;
        return;
      }
      // Only the flicker is left: it is drawn at half rate.
      skip = !busy && !skip;
      if (!skip) draw();
      raf = requestAnimationFrame(frame);
    };

    const wake = () => {
      const p = params.current;
      if (!p.motionSafe) {
        // Reduced motion: no lag, no lean, no flicker — the light is where
        // it is asked to be.
        lamp.x = lamp.tx;
        lamp.y = lamp.ty;
        lamp.vx = lamp.vy = 0;
        lamp.size =
          lamp.mode === "focus" ? Math.max(p.radius, lamp.reach) : p.radius;
        lamp.sizeV = 0;
        lamp.stretch = 1;
        draw();
        return;
      }
      if (raf || !inView || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };

    api.current = {
      point: (x, y) => {
        lamp.mode = "pointer";
        lamp.tx = x;
        lamp.ty = y;
        wake();
      },
      focus: (x, y, reach) => {
        lamp.mode = "focus";
        lamp.tx = x;
        lamp.ty = y;
        lamp.reach = reach;
        wake();
      },
      leave: () => {
        lamp.mode = "rest";
        lamp.tx = params.current.restX * w;
        lamp.ty = params.current.restY * h;
        wake();
      },
      restyle: () => {
        restyle();
        if (lamp.mode === "rest") {
          lamp.tx = params.current.restX * w;
          lamp.ty = params.current.restY * h;
        }
        if (!raf) draw();
        wake();
      },
      wake,
    };

    restyle();
    const sizer = new ResizeObserver(() => {
      if (!layout()) return;
      draw();
      wake();
    });
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inView = entry.isIntersecting;
      if (inView) wake();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) wake();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      api.current = null;
    };
  }, [lampOpacity, lampTransform]);

  React.useEffect(() => {
    api.current?.restyle();
  }, [warmth, dim, feather, darkness, restX, restY, radius, glow]);
  React.useEffect(() => {
    api.current?.wake();
  }, [flicker, lag, lean, paused, motionSafe]);

  const local = (clientX: number, clientY: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect
      ? { x: clientX - rect.left, y: clientY - rect.top }
      : { x: 0, y: 0 };
  };
  const focused = React.useRef<HTMLElement | null>(null);

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || event.pointerType === "touch") return;
    const at = local(event.clientX, event.clientY);
    api.current?.point(at.x, at.y);
  };
  const lightUp = (node: HTMLElement) => {
    const rect = node.getBoundingClientRect();
    const at = local(rect.left + rect.width / 2, rect.top + rect.height / 2);
    // The pool opens to cover what is focused, up to twice its own size.
    const reach = Math.min(
      radius * 2,
      Math.hypot(rect.width, rect.height) / 2 + 16,
    );
    api.current?.focus(at.x, at.y, reach);
  };
  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    // A keyboard visitor's light goes back to what they are on.
    const node = focused.current;
    if (node?.isConnected) lightUp(node);
    else api.current?.leave();
  };
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!followFocus) return;
    const target = event.target as HTMLElement;
    if (!target.matches(":focus-visible")) return;
    focused.current = target;
    lightUp(target);
  };
  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && rootRef.current?.contains(next)) return;
    focused.current = null;
    if (!rootRef.current?.matches(":hover")) api.current?.leave();
  };

  const light = lightOf(warmth);
  const lampSize = r2(radius * 2.6);
  const nightCss = `color-mix(in oklab, ${darkness} ${Math.round(clamp(dim, 0, 1) * 100)}%, transparent)`;

  return (
    <div
      ref={rootRef}
      onPointerMove={onPointerMove}
      onPointerEnter={onPointerMove}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn("relative isolate overflow-clip", className)}
    >
      {children}
      {/* The night before the first frame (and the server's markup): the
          same room with the lantern set down at rest. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          opacity: painted ? 0 : 1,
          background: `radial-gradient(circle ${r2(radius)}px at ${r2(restX * 100)}% ${r2(restY * 100)}%, transparent ${r2(radius * (1 - clamp(feather, 0.05, 1)))}px, ${nightCss} ${r2(radius)}px)`,
        }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 size-full"
      />
      <motion.span
        ref={lampRef}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 z-20 rounded-full mix-blend-screen"
        style={{
          width: lampSize,
          height: lampSize,
          transform: lampTransform,
          opacity: lampOpacity,
          background: `radial-gradient(closest-side, oklch(${light.l} ${light.c} ${light.h} / 0.9), oklch(${light.l} ${light.c} ${light.h} / 0.35) 45%, oklch(${light.l} ${light.c} ${light.h} / 0) 100%)`,
        }}
      />
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
