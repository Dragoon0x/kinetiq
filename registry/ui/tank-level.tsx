"use client";

import * as React from "react";

import {
  animate,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound, type LoopHandle } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type TankLevelColor = "water" | "amber" | "algae" | "berry";
export type TankLevelSize = "sm" | "md" | "lg";

export type TankLevelProps = {
  /** Controlled value, from `min` to `max`. */
  value?: number;
  /** Initial value when uncontrolled. @default 40 */
  defaultValue?: number;
  /** Fires from the drag or key that changed it, with the new value (once per step). */
  onValueChange?: (value: number) => void;
  /** @default 0 */
  min?: number;
  /** @default 100 */
  max?: number;
  /** The value's resolution and one arrow key's change. @default 1 */
  step?: number;
  /** What the tank holds: the slider's accessible name, shown over the reading. */
  label: string;
  /** The reading and the spoken value. @default a percentage of the range */
  format?: (value: number, min: number, max: number) => string;
  /** 0 rocks long after a change; 1 calms almost at once. @default 0.4 */
  damping?: number;
  /** How high the slosh runs, 0 to 1. 0 keeps the surface flat. @default 0.6 */
  waves?: number;
  /** The liquid: a named pigment or any CSS colour. @default "water" */
  color?: TankLevelColor | (string & {});
  /** Release bubbles from the floor as the level rises. @default true */
  bubbles?: boolean;
  /** Graduations up the side. @default 10 */
  ticks?: number;
  /** The tank: 72×148, 92×184 or 112×220 px. @default "md" */
  size?: TankLevelSize;
  /** A pour while a drag fills it and a plip as each bubble pops. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

const TANKS: Record<TankLevelSize, { w: number; h: number; text: string }> = {
  sm: { w: 72, h: 148, text: "text-xl" },
  md: { w: 92, h: 184, text: "text-2xl" },
  lg: { w: 112, h: 220, text: "text-3xl" },
};
/** Pigments: a token's hue and chroma at a fixed lightness, so the liquid reads the same in both themes. */
const PIGMENTS: Record<TankLevelColor, (alpha: number) => string> = {
  water: (a) => `oklch(from var(--accent-bright) 0.7 c h / ${a})`,
  amber: (a) => `oklch(from var(--warn) 0.8 c h / ${a})`,
  algae: (a) => `oklch(from var(--success) 0.74 c h / ${a})`,
  berry: (a) => `oklch(from var(--danger) 0.64 c h / ${a})`,
};
const COLS = 28;
const WALL = 3;
const RADIUS = 14;
const SCALE = 36;
const POOL = 12;
const SUB = 1 / 240;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;

type Bubble = {
  alive: boolean;
  x: number;
  y: number;
  r: number;
  vy: number;
  phase: number;
  audible: boolean;
};
type Ring = { alive: boolean; x: number; y: number; t: number };
type Nodes = {
  body: SVGPathElement;
  line: SVGPathElement;
  notch: SVGGElement;
  bubbles: SVGCircleElement[];
  rings: SVGEllipseElement[];
};
type Config = {
  damping: number;
  waves: number;
  motionSafe: boolean;
  bubbles: boolean;
  w: number;
  h: number;
  onPop: (r: number) => void;
};

/** The tank's drawing box: the vessel, then room for the graduations. */
const geometry = (w: number, h: number) => {
  const left = 1 + WALL;
  const right = w - 1 - WALL;
  const top = 1 + WALL;
  const bottom = h - 1 - WALL;
  return { left, right, top, bottom, inner: bottom - top, span: right - left };
};

const surfacePath = (
  g: ReturnType<typeof geometry>,
  levelY: number,
  heights: Float64Array | null,
) => {
  const pts: string[] = [];
  for (let i = 0; i < COLS; i += 1) {
    const x = g.left - 2 + ((g.span + 4) * i) / (COLS - 1);
    pts.push(`${r2(x)} ${r2(levelY - (heights?.[i] ?? 0))}`);
  }
  return {
    line: `M ${pts.join(" L ")}`,
    body: `M ${pts.join(" L ")} L ${r2(g.right + 2)} ${r2(g.bottom + 2)} L ${r2(g.left - 2)} ${r2(g.bottom + 2)} Z`,
  };
};

/**
 * A value gauge drawn as a sight-glass tank. The liquid's surface is a real
 * wave — 28 columns of a damped wave equation, sub-stepped, with the mean
 * taken out every step so the level is always exactly the value and only
 * the shape moves.
 *
 * A change tips the surface: the level's acceleration pushes the inlet side
 * up as it fills (down as it drains), and when the level stops the tilt is
 * let go into a slosh that rocks across the tank and dies away at
 * `damping`, `waves` high. A rise also lets bubbles go from the floor; they
 * wobble up, swell a little and pop at the surface with a ring and a ripple
 * in the wave. Keys and hosts move the level on the glide spring; a drag
 * puts the surface under the finger and follows it 1:1.
 *
 * It is a vertical `role="slider"`: arrows move a step, Page keys ten,
 * Home and End go to the ends. Under reduced motion the level moves on a
 * short tween with a flat surface and no bubbles.
 */
export function TankLevel({
  value,
  defaultValue = 40,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  format,
  damping = 0.4,
  waves = 0.6,
  color = "water",
  bubbles = true,
  ticks = 10,
  size = "md",
  sound = false,
  disabled = false,
  className,
}: TankLevelProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const clipId = `tank-${uid}`;
  const tank = TANKS[size] ?? TANKS.md;
  const g = geometry(tank.w, tank.h);
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const range = Math.max(1e-9, hi - lo);
  const unit = Math.max(1e-9, step);
  const say =
    format ??
    ((v: number, a: number, b: number) =>
      `${Math.round(((v - a) / Math.max(1e-9, b - a)) * 100)}%`);

  const quantize = (v: number) =>
    clamp(Number((lo + Math.round((v - lo) / unit) * unit).toFixed(6)), lo, hi);

  const [own, setOwn] = React.useState(() => quantize(defaultValue));
  const [check, setCheck] = React.useState(0);
  const controlled = value !== undefined;
  const current = quantize(value ?? own);
  const fraction = (current - lo) / range;

  const level = useMotionValue(fraction);
  // The first frame, for the server and the first paint. After that the
  // simulation owns these attributes, so React never writes them again.
  const [still] = React.useState(() => ({
    ...surfacePath(g, g.bottom - g.inner * fraction, null),
    notch: `translate(0 ${r2(g.bottom - g.inner * fraction)})`,
  }));

  const named = PIGMENTS[color as TankLevelColor];
  const body = named
    ? named(0.68)
    : `color-mix(in oklab, ${color} 68%, transparent)`;
  const surface = named ? named(1) : color;

  const bodyRef = React.useRef<SVGPathElement | null>(null);
  const lineRef = React.useRef<SVGPathElement | null>(null);
  const notchRef = React.useRef<SVGGElement | null>(null);
  const bubbleRefs = React.useRef<(SVGCircleElement | null)[]>([]);
  const ringRefs = React.useRef<(SVGEllipseElement | null)[]>([]);
  const sliderRef = React.useRef<HTMLDivElement | null>(null);
  const reported = React.useRef(current);
  const anim = React.useRef<AnimationPlaybackControls | null>(null);
  const pour = React.useRef<{ loop: LoopHandle | null; timer: number }>({
    loop: null,
    timer: 0,
  });
  const dragging = React.useRef(false);
  const rose = React.useRef(0);
  const span = React.useRef({ lo, hi });
  const engine = React.useRef<{
    wake: () => void;
    spawn: (rise: number, audible: boolean) => void;
    draw: () => void;
    dispose: () => void;
  } | null>(null);
  const cfg = React.useRef<Config>({
    damping,
    waves,
    motionSafe,
    bubbles,
    w: tank.w,
    h: tank.h,
    onPop: () => {},
  });
  const visible = React.useRef(true);

  const stopPour = () => {
    window.clearTimeout(pour.current.timer);
    pour.current.loop?.stop();
    pour.current.loop = null;
  };

  React.useEffect(() => {
    cfg.current = {
      damping,
      waves,
      motionSafe,
      bubbles,
      w: tank.w,
      h: tank.h,
      onPop: (r) =>
        audio.play("plip", {
          pitch: r2(clamp(1.7 - r * 0.22, 0.8, 1.6)),
          gain: 0.4,
        }),
    };
    engine.current?.draw();
  });

  // The simulation: the wave, the bubbles and the rings, drawn straight to
  // the nodes each frame; nothing in React renders per frame.
  React.useEffect(() => {
    const body = bodyRef.current;
    const line = lineRef.current;
    const notch = notchRef.current;
    if (!body || !line || !notch) return;
    const nodes: Nodes = {
      body,
      line,
      notch,
      bubbles: bubbleRefs.current.filter(Boolean) as SVGCircleElement[],
      rings: ringRefs.current.filter(Boolean) as SVGEllipseElement[],
    };
    const hs = new Float64Array(COLS);
    const vs = new Float64Array(COLS);
    const pool: Bubble[] = Array.from({ length: POOL }, () => ({
      alive: false,
      x: 0,
      y: 0,
      r: 0,
      vy: 0,
      phase: 0,
      audible: false,
    }));
    const rings: Ring[] = Array.from({ length: 4 }, () => ({
      alive: false,
      x: 0,
      y: 0,
      t: 0,
    }));
    let rng = 0x9e3779b9;
    const random = () => {
      rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
      return rng / 4294967296;
    };
    let frame = 0;
    let last = 0;
    let acc = 0;
    let prevLevel = level.get();
    let prevVel = 0;
    let disposed = false;

    const geo = () => geometry(cfg.current.w, cfg.current.h);
    const levelY = (G: ReturnType<typeof geometry>) =>
      G.bottom - G.inner * clamp(level.get(), 0, 1);
    const heightAt = (G: ReturnType<typeof geometry>, x: number) => {
      const u = clamp(((x - G.left) / G.span) * (COLS - 1), 0, COLS - 1);
      const i = Math.floor(u);
      const f = u - i;
      return lerp(hs[i] ?? 0, hs[Math.min(COLS - 1, i + 1)] ?? 0, f);
    };

    const draw = () => {
      const G = geo();
      const y = levelY(G);
      const path = surfacePath(G, y, hs);
      nodes.body.setAttribute("d", path.body);
      nodes.line.setAttribute("d", path.line);
      nodes.notch.setAttribute("transform", `translate(0 ${r2(y)})`);
      pool.forEach((b, i) => {
        const node = nodes.bubbles[i];
        if (!node) return;
        if (!b.alive) {
          node.setAttribute("opacity", "0");
          return;
        }
        node.setAttribute("cx", String(r2(b.x + Math.sin(b.phase) * 1.4)));
        node.setAttribute("cy", String(r2(b.y)));
        node.setAttribute("r", String(r2(b.r)));
        node.setAttribute("opacity", "0.85");
      });
      rings.forEach((ring, i) => {
        const node = nodes.rings[i];
        if (!node) return;
        if (!ring.alive) {
          node.setAttribute("opacity", "0");
          return;
        }
        const k = ring.t / 0.4;
        node.setAttribute("cx", String(r2(ring.x)));
        node.setAttribute("cy", String(r2(ring.y)));
        node.setAttribute("rx", String(r2(1.5 + 7 * k)));
        node.setAttribute("ry", String(r2(0.6 + 1.6 * k)));
        node.setAttribute("opacity", String(r2(0.7 * (1 - k))));
      });
    };

    const busy = () => {
      if (dragging.current || anim.current) return true;
      if (pool.some((b) => b.alive) || rings.some((r) => r.alive)) return true;
      let energy = 0;
      for (let i = 0; i < COLS; i += 1) {
        energy = Math.max(
          energy,
          Math.abs(hs[i] ?? 0),
          Math.abs(vs[i] ?? 0) * 0.05,
        );
      }
      return energy > 0.02;
    };

    const stepWave = (
      G: ReturnType<typeof geometry>,
      dt: number,
      accel: number,
    ) => {
      const c = cfg.current;
      const dx = G.span / (COLS - 1);
      // A slosh period of about 0.9s across the tank's width.
      const speed = (2 * G.span) / 0.9;
      const k = (speed * speed) / (dx * dx);
      const gamma = lerp(0.5, 10, clamp(c.damping, 0, 1));
      // The level's own acceleration, in px/s², leans the surface.
      const push =
        clamp(c.waves, 0, 1) * 0.85 * clamp(accel * G.inner, -6000, 6000);
      const room = Math.min(14, G.inner * 0.12);
      for (let i = 0; i < COLS; i += 1) {
        const left = hs[i === 0 ? 1 : i - 1] ?? 0;
        const right = hs[i === COLS - 1 ? COLS - 2 : i + 1] ?? 0;
        const here = hs[i] ?? 0;
        // Filling raises the inlet side first; draining lowers it.
        const lean = (0.5 - i / (COLS - 1)) * 2;
        const a =
          k * (left + right - 2 * here) - gamma * (vs[i] ?? 0) + push * lean;
        vs[i] = (vs[i] ?? 0) + a * dt;
      }
      let mean = 0;
      for (let i = 0; i < COLS; i += 1) {
        hs[i] = clamp((hs[i] ?? 0) + (vs[i] ?? 0) * dt, -room, room);
        mean += hs[i] ?? 0;
      }
      mean /= COLS;
      for (let i = 0; i < COLS; i += 1) hs[i] = (hs[i] ?? 0) - mean;
    };

    const tick = (now: number) => {
      frame = 0;
      if (disposed) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      const G = geo();
      const c = cfg.current;
      const lv = level.get();
      const vel = (lv - prevLevel) / dt;
      const accel = c.motionSafe ? (vel - prevVel) / dt : 0;
      prevLevel = lv;
      prevVel = vel;
      if (c.motionSafe && c.waves > 0) {
        acc += dt;
        while (acc >= SUB) {
          stepWave(G, SUB, accel);
          acc -= SUB;
        }
      } else {
        hs.fill(0);
        vs.fill(0);
      }
      const y = levelY(G);
      for (const b of pool) {
        if (!b.alive) continue;
        b.vy += 240 * dt;
        b.y -= b.vy * dt;
        b.r = Math.min(4.2, b.r + 0.6 * dt);
        b.phase += dt * 9;
        const top = y - heightAt(G, b.x);
        if (b.y - b.r <= top || !c.motionSafe) {
          b.alive = false;
          if (b.y - b.r > top - 2) {
            const ring = rings.find((r) => !r.alive);
            if (ring) {
              ring.alive = true;
              ring.x = b.x;
              ring.y = top;
              ring.t = 0;
            }
            const col = Math.round(((b.x - G.left) / G.span) * (COLS - 1));
            if (col >= 0 && col < COLS)
              vs[col] = (vs[col] ?? 0) - 14 * b.r * c.waves;
            if (b.audible) c.onPop(b.r);
          }
        }
      }
      for (const ring of rings) {
        if (!ring.alive) continue;
        ring.t += dt;
        ring.y = y;
        if (ring.t >= 0.4) ring.alive = false;
      }
      draw();
      if (!busy()) {
        hs.fill(0);
        vs.fill(0);
        draw();
        return;
      }
      if (visible.current && !document.hidden) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    const wake = () => {
      if (disposed || frame || !visible.current || document.hidden) return;
      last = performance.now();
      acc = 0;
      frame = window.requestAnimationFrame(tick);
    };

    const spawn = (rise: number, audible: boolean) => {
      const c = cfg.current;
      if (!c.bubbles || !c.motionSafe || rise <= 0) return;
      const G = geo();
      const n = clamp(Math.round(rise * 26), 1, 10);
      for (let i = 0; i < n; i += 1) {
        const b = pool.find((p) => !p.alive);
        if (!b) break;
        b.alive = true;
        b.x = G.left + 8 + random() * (G.span - 16);
        b.y = G.bottom - 3 - random() * 10 * (i / n);
        b.r = 1.2 + random() * 1.8;
        b.vy = 40 + random() * 30;
        b.phase = random() * Math.PI * 2;
        b.audible = audible;
      }
      wake();
    };

    const off = level.on("change", () => wake());
    engine.current = {
      wake,
      spawn,
      draw: () => {
        if (!frame) draw();
      },
      dispose: () => {
        disposed = true;
        if (frame) window.cancelAnimationFrame(frame);
        frame = 0;
      },
    };
    draw();
    const e = engine.current;
    return () => {
      off();
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, [level]);

  React.useEffect(() => {
    const node = sliderRef.current;
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      visible.current = Boolean(entries[entries.length - 1]?.isIntersecting);
      if (visible.current) engine.current?.wake();
    });
    watcher.observe(node);
    const onVisibility = () => {
      if (document.hidden) {
        pour.current.loop?.stop();
        pour.current.loop = null;
      } else engine.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  /** The level goes to a fraction: glide from rest, or the throw's speed. */
  const glideTo = (f: number, velocity = 0) => {
    anim.current?.stop();
    const target = clamp(f, 0, 1);
    const done = () => {
      if (anim.current === controls) anim.current = null;
      engine.current?.wake();
    };
    const controls = motionSafe
      ? animate(level, target, { ...springs.glide, velocity, onComplete: done })
      : animate(level, target, {
          duration: durations.base,
          ease: easings.enter,
          onComplete: done,
        });
    anim.current = controls;
    engine.current?.wake();
  };

  const report = (v: number) => {
    if (v === reported.current) return;
    reported.current = v;
    if (!controlled) setOwn(v);
    onValueChange?.(v);
  };

  /** A change the visitor made with a key: bubbles that can be heard. */
  const keyTo = (v: number) => {
    if (disabled) return;
    const q = quantize(v);
    const from = reported.current;
    if (q === from) return;
    if (q > from) engine.current?.spawn((q - from) / range, true);
    report(q);
    glideTo((q - lo) / range);
    if (controlled) React.startTransition(() => setCheck((c) => c + 1));
  };

  // What the host says the value is; its echo of our own report is not news,
  // and a refusal (the check after a controlled change) sends it back.
  React.useEffect(() => {
    if (dragging.current) return;
    const moved = span.current.lo !== lo || span.current.hi !== hi;
    span.current = { lo, hi };
    if (current === reported.current && !moved) return;
    if (current > reported.current) {
      // A rise from the host bubbles too, silently: sound answers the visitor.
      engine.current?.spawn((current - reported.current) / range, false);
    }
    reported.current = current;
    glideTo((current - lo) / range);
    // The level's own spring is the only thing this answers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, lo, hi, check]);

  const fromY = (clientY: number) => {
    const r = sliderRef.current?.getBoundingClientRect();
    if (!r) return level.get();
    const scale = r.height / tank.h;
    return (g.bottom * scale - (clientY - r.top)) / (g.inner * scale);
  };

  const follow = (f: number) => {
    const shown =
      f < 0
        ? rubberband(f, 1) * 0.15
        : f > 1
          ? 1 + rubberband(f - 1, 1) * 0.15
          : f;
    const prev = level.get();
    level.set(Number(clamp(shown, -0.04, 1.04).toFixed(4)));
    const rise = level.get() - prev;
    if (rise > 0) {
      // One bubble for every few percent poured, not one per move.
      rose.current += rise;
      if (rose.current >= 0.03) {
        engine.current?.spawn(rose.current, true);
        rose.current = 0;
      }
      const pitch = r2(lerp(0.8, 1.9, clamp(f, 0, 1)));
      if (!pour.current.loop) {
        pour.current.loop = audio.start("pour", { pitch, gain: 0.5 });
      } else {
        pour.current.loop.set({ pitch });
      }
      // A finger that stops rising stops pouring.
      window.clearTimeout(pour.current.timer);
      pour.current.timer = window.setTimeout(stopPour, 160);
    }
    report(quantize(lo + clamp(f, 0, 1) * range));
  };

  const drag = useDrag({
    axis: "y",
    threshold: 2,
    disabled,
    onStart: ({ point }) => {
      dragging.current = true;
      anim.current?.stop();
      anim.current = null;
      rose.current = 0;
      follow(fromY(point.y));
    },
    onMove: ({ point }) => follow(fromY(point.y)),
    onEnd: ({ velocity }) => {
      dragging.current = false;
      stopPour();
      const q = reported.current;
      const r = sliderRef.current?.getBoundingClientRect();
      const scale = r ? r.height / tank.h : 1;
      glideTo((q - lo) / range, -velocity.y / (g.inner * scale));
      if (controlled) React.startTransition(() => setCheck((c) => c + 1));
    },
    onCancel: () => {
      dragging.current = false;
      stopPour();
      glideTo((reported.current - lo) / range);
    },
    onTap: (event) => {
      if (disabled) return;
      sliderRef.current?.focus({ preventScroll: true });
      keyTo(lo + clamp(fromY(event.clientY), 0, 1) * range);
    },
  });

  React.useEffect(() => {
    const p = pour.current;
    return () => {
      anim.current?.stop();
      window.clearTimeout(p.timer);
      p.loop?.stop();
      p.loop = null;
    };
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const big = Math.max(unit, Math.round(range / 10 / unit) * unit);
    const from = reported.current;
    const next =
      event.key === "ArrowUp" || event.key === "ArrowRight"
        ? from + unit
        : event.key === "ArrowDown" || event.key === "ArrowLeft"
          ? from - unit
          : event.key === "PageUp"
            ? from + big
            : event.key === "PageDown"
              ? from - big
              : event.key === "Home"
                ? lo
                : event.key === "End"
                  ? hi
                  : null;
    if (next === null) return;
    event.preventDefault();
    keyTo(next);
  };

  const marks = Math.max(1, Math.round(ticks));
  const reading = say(current, lo, hi);

  return (
    <div
      className={cn(
        "inline-flex flex-wrap items-center gap-x-5 gap-y-3",
        disabled && "opacity-50",
        className,
      )}
    >
      <div
        ref={sliderRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={lo}
        aria-valuemax={hi}
        aria-valuenow={current}
        aria-valuetext={reading}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        {...drag}
        className={cn(
          "relative shrink-0 touch-none rounded-4 outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled ? "cursor-not-allowed" : "cursor-ns-resize",
        )}
        style={{ width: tank.w + SCALE, height: tank.h }}
      >
        <svg
          aria-hidden
          width={tank.w + SCALE}
          height={tank.h}
          viewBox={`0 0 ${tank.w + SCALE} ${tank.h}`}
          className="block overflow-visible"
        >
          <defs>
            <clipPath id={clipId}>
              <rect
                x={g.left}
                y={g.top}
                width={g.span}
                height={g.inner}
                rx={RADIUS - WALL}
              />
            </clipPath>
          </defs>
          <rect
            x={g.left}
            y={g.top}
            width={g.span}
            height={g.inner}
            rx={RADIUS - WALL}
            className="fill-surface-2"
          />
          <g clipPath={`url(#${clipId})`}>
            <path ref={bodyRef} d={still.body} style={{ fill: body }} />
            {Array.from({ length: POOL }, (_, i) => (
              <circle
                key={i}
                ref={(node) => {
                  bubbleRefs.current[i] = node;
                }}
                cx={0}
                cy={0}
                r={0}
                opacity={0}
                fill="none"
                strokeWidth={0.9}
                style={{ stroke: surface }}
              />
            ))}
            {Array.from({ length: 4 }, (_, i) => (
              <ellipse
                key={i}
                ref={(node) => {
                  ringRefs.current[i] = node;
                }}
                cx={0}
                cy={0}
                rx={0}
                ry={0}
                opacity={0}
                fill="none"
                strokeWidth={0.9}
                style={{ stroke: surface }}
              />
            ))}
            <path
              ref={lineRef}
              d={still.line}
              fill="none"
              strokeWidth={1.5}
              strokeLinejoin="round"
              style={{ stroke: surface }}
            />
            {/* The glass's sheen: a soft band of light down the left. */}
            <rect
              x={g.left + 5}
              y={g.top + 8}
              width={5}
              height={g.inner - 16}
              rx={2.5}
              className="fill-white/25 dark:fill-white/10"
            />
          </g>
          <rect
            x={1.75}
            y={1.75}
            width={tank.w - 3.5}
            height={tank.h - 3.5}
            rx={RADIUS}
            fill="none"
            strokeWidth={1.5}
            className="stroke-hairline-strong"
          />
          <g className="stroke-ink-3/60" strokeWidth={1}>
            {Array.from({ length: marks + 1 }, (_, i) => {
              const y = r2(g.bottom - (g.inner * i) / marks);
              const long = i === 0 || i === marks || i * 2 === marks;
              return (
                <line
                  key={i}
                  x1={tank.w + 3}
                  x2={tank.w + (long ? 10 : 6)}
                  y1={y}
                  y2={y}
                />
              );
            })}
          </g>
          <g className="fill-ink-3 font-mono" fontSize={9}>
            {[0, 0.5, 1].map((f) => (
              <text key={f} x={tank.w + 12} y={r2(g.bottom - g.inner * f + 3)}>
                {Math.round(lo + range * f)}
              </text>
            ))}
          </g>
          <g ref={notchRef} transform={still.notch}>
            <path
              d={`M ${tank.w + 1} 0 L ${tank.w + 6} -3.5 L ${tank.w + 6} 3.5 Z`}
              style={{ fill: surface }}
            />
          </g>
        </svg>
      </div>
      <div aria-hidden className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-xs text-ink-3" title={label}>
          {label}
        </span>
        <span
          className={cn(
            "font-mono leading-none text-foreground tabular-nums",
            tank.text,
          )}
        >
          {reading}
        </span>
        {format ? (
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            of {say(hi, lo, hi)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
