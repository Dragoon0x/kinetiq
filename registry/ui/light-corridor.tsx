"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LightCorridorProps = {
  /** The content above the corridor: a hero, a heading, a call to action. */
  children?: React.ReactNode;
  /** How fast the frames glide toward you, 0 to 2; 0 holds them still. @default 1 */
  speed?: number;
  /** How far apart the frames stand down the corridor, 0.5 to 2. @default 1 */
  spacing?: number;
  /** The light's colour, as a CSS colour. @default "var(--accent-bright)" */
  color?: string;
  /** The colour the far end of the corridor glows, as a CSS colour. @default the same as color */
  farColor?: string;
  /** The darkness the light shines in, as a CSS colour. @default "var(--background)" */
  backdrop?: string;
  /** How round the frames' corners are, 0 (square) to 1 (pill). @default 0.4 */
  round?: number;
  /** How softly each frame glows around its line of light, 0 to 1. @default 0.6 */
  glow?: number;
  /** How strongly the frames are mirrored in the floor, 0 to 1. @default 0.45 */
  reflection?: number;
  /** How far down the corridor you can see, 0 to 1. @default 0.6 */
  depth?: number;
  /** Where the corridor's far end rests, as fractions of the box's width and height. @default [0.5, 0.5] */
  vanish?: readonly [number, number];
  /** The vanishing point follows the hand, and holding a press rushes the corridor. @default true */
  interactive?: boolean;
  /** How far the vanishing point follows the hand, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** Picks the fixtures: the same seed dims and brightens the same frames. @default 1 */
  seed?: number;
  /** Holds the frames still; the vanishing point still follows the hand. @default false */
  paused?: boolean;
  /** Switch the lights on from near to far the first time the corridor is seen. @default true */
  intro?: boolean;
  /** The highest device pixel ratio the corridor is drawn at, never above 2. @default 2 */
  dpr?: number;
  /** Fires when the last light is on — at once when there is no intro (intro off, reduced motion). */
  onIntroEnd?: () => void;
  /** Fires when a held press starts the rush (true) and when it lets go (false). */
  onRushChange?: (rushing: boolean) => void;
  /** Sizes the box. @default "h-full w-full" */
  className?: string;
  /** Classes for the content layer above the corridor. */
  contentClassName?: string;
};

/** Fixed sub-step for the springs, so a long frame never destabilises them. */
const STEP = 1 / 240;
/** Frames vanish past this depth, and the camera's focal length per px of height. */
const NEAR = 0.55;
const FOCAL = 0.55;
/** World units travelled per second at speed 1, and the rush's multiple. */
const PACE = 1.05;
const RUSH = 3.5;
/** Depths of the frames the server draws before the canvas takes over. */
const STILL_DEPTHS = [1.25, 1.85, 2.75, 4.1, 6.1, 9] as const;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** The props a background leaves to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

type Rgb = readonly [number, number, number];
type SpringConfig = { stiffness: number; damping: number; mass: number };
type Axis = { x: number; v: number };

/** One semi-implicit Euler step of a spring toward `to`. */
function stepSpring(a: Axis, to: number, s: SpringConfig, dt: number) {
  const acc = (-s.stiffness * (a.x - to) - s.damping * a.v) / s.mass;
  a.v += acc * dt;
  a.x += a.v * dt;
}

/** Settles a spring that is within `eps` of its target and barely moving. */
function rest(a: Axis, to: number, eps: number): boolean {
  if (Math.abs(a.x - to) < eps && Math.abs(a.v) < eps * 8) {
    a.x = to;
    a.v = 0;
    return true;
  }
  return false;
}

/** Any CSS colour the canvas understands, as sRGB bytes, by painting one pixel. */
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

const css = (c: Rgb, a = 1) =>
  `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${Math.round(clamp(a, 0, 1) * 1000) / 1000})`;

/** A fixture's own brightness, 0.72 to 1, from its place in the corridor. */
const fixture = (id: number, seed: number) => {
  const h = Math.imul((id * 374761393) ^ (seed * 668265263), 2246822519) >>> 0;
  return 0.72 + ((h >>> 8) / 16777216) * 0.28;
};

type Api = {
  refresh: () => void;
  recolor: () => void;
  local: (clientX: number, clientY: number) => { x: number; y: number };
  aim: (x: number, y: number, source: "pointer" | "focus") => void;
  away: (source: "pointer" | "focus" | null) => void;
  rush: (down: boolean) => void;
};

/**
 * A background that is an endless corridor of rounded frames of soft light
 * receding to a vanishing point. The frames glide toward you and fade as
 * they pass; each is a fine bright line inside a wide soft glow, additive on
 * a dark page so overlapping light builds, mirrored in the floor with a
 * reflection that fades away from its own contact, and joined to the next
 * by faint rails so the corridor reads as a space. A pool of light lies on
 * the floor where the corridor ends.
 *
 * The vanishing point follows the hand on the drift spring — the near frames
 * stay put and the far ones swing round — so the corridor turns to look
 * where you point; holding a press rushes it, the speed swelling on drift to
 * three and a half times with faint light trails, and easing back on
 * release. The first time it is seen the lights come on from near to far.
 * Keyboard focus on content inside the corridor turns it toward the focused
 * element.
 *
 * Canvas 2D, three strokes and a gradient reflection per frame; the loop
 * runs only on screen, in a visible page, and while the frames travel or a
 * spring settles. Under reduced motion the corridor is still and the
 * vanishing point stands where the hand puts it.
 */
export function LightCorridor({
  children,
  speed = 1,
  spacing = 1,
  color = "var(--accent-bright)",
  farColor,
  backdrop = "var(--background)",
  round = 0.4,
  glow = 0.6,
  reflection = 0.45,
  depth = 0.6,
  vanish = [0.5, 0.5],
  interactive = true,
  pointerStrength = 0.6,
  seed = 1,
  paused = false,
  intro = true,
  dpr = 2,
  onIntroEnd,
  onRushChange,
  className,
  contentClassName,
}: LightCorridorProps) {
  const motionSafe = useMotionSafe();
  const far = farColor ?? color;
  const vanishX = clamp(vanish[0], 0.1, 0.9);
  const vanishY = clamp(vanish[1], 0.2, 0.8);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const nearCarrier = React.useRef<HTMLSpanElement | null>(null);
  const farCarrier = React.useRef<HTMLSpanElement | null>(null);
  const backCarrier = React.useRef<HTMLSpanElement | null>(null);
  const api = React.useRef<Api | null>(null);
  const unlisten = React.useRef<(() => void) | null>(null);

  const latest = React.useRef({
    speed,
    spacing,
    round,
    glow,
    reflection,
    depth,
    vanishX,
    vanishY,
    interactive,
    pointerStrength,
    seed,
    paused,
    intro,
    dpr,
    motionSafe,
    onIntroEnd,
    onRushChange,
  });
  React.useEffect(() => {
    latest.current = {
      speed,
      spacing,
      round,
      glow,
      reflection,
      depth,
      vanishX,
      vanishY,
      interactive,
      pointerStrength,
      seed,
      paused,
      intro,
      dpr,
      motionSafe,
      onIntroEnd,
      onRushChange,
    };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d") ?? null;
    if (!root || !canvas || !ctx) return;

    let raf = 0;
    let last = 0;
    let visible = true;
    let dirty = true;
    let disposed = false;
    let size = { w: 0, h: 0, dpr: 1 };
    let nearC: Rgb = [90, 120, 255];
    let farC: Rgb = [90, 120, 255];
    let dark = true;
    /** One frame's colour, reused so drawing allocates nothing per light. */
    const tone: [number, number, number] = [0, 0, 0];
    const L0 = latest.current;
    // A still frame is always this same moment of the travel.
    let travel = ((Math.abs(L0.seed) * 0.6180339) % 1) * 10 + 0.37;
    let introState: "waiting" | "running" | "done" = "waiting";
    let introClock = 0;
    const vp = { x: { x: 0, v: 0 }, y: { x: 0, v: 0 }, tx: 0, ty: 0 };
    let looking: "pointer" | "focus" | null = null;
    const pace: Axis = { x: 1, v: 0 };
    let rushing = false;
    const read = rgbReader();

    const recolor = () => {
      if (nearCarrier.current)
        nearC = read(getComputedStyle(nearCarrier.current).color);
      if (farCarrier.current)
        farC = read(getComputedStyle(farCarrier.current).color);
      if (backCarrier.current) {
        const b = read(getComputedStyle(backCarrier.current).color);
        dark = (0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2]) / 255 < 0.5;
      }
    };

    /** Traces a rounded frame centred on (cx, cy) as the current path. */
    const frameAt = (
      cx: number,
      cy: number,
      hw: number,
      hh: number,
      r: number,
    ) => {
      const rr = Math.min(r, hw, hh);
      ctx.beginPath();
      ctx.moveTo(cx - hw + rr, cy - hh);
      ctx.arcTo(cx + hw, cy - hh, cx + hw, cy + hh, rr);
      ctx.arcTo(cx + hw, cy + hh, cx - hw, cy + hh, rr);
      ctx.arcTo(cx - hw, cy + hh, cx - hw, cy - hh, rr);
      ctx.arcTo(cx - hw, cy - hh, cx + hw, cy - hh, rr);
      ctx.closePath();
    };

    const draw = () => {
      const { w, h } = size;
      if (w < 1 || h < 1) return;
      if (!visible) {
        dirty = true;
        return;
      }
      dirty = false;
      const L = latest.current;
      const gap = 0.9 * clamp(L.spacing, 0.5, 2);
      const farZ = lerp(5, 13, clamp(L.depth, 0, 1));
      const count = Math.ceil((farZ - NEAR) / gap) + 1;
      const F = h * FOCAL;
      const hy = 1;
      const hx = clamp((w / h) * 0.62, 1.05, 2.4);
      const radius = clamp(L.round, 0, 1);
      const glowK = clamp(L.glow, 0, 1);
      const mirror = clamp(L.reflection, 0, 1);
      const cx0 = w * L.vanishX;
      const cy0 = h * L.vanishY;
      const vx = vp.x.x;
      const vy = vp.y.x;
      const base = Math.floor(travel / gap);
      const phase = travel - base * gap;
      const seedN = Math.abs(Math.round(L.seed));
      const stagger = cascade(count);
      const trail = clamp((pace.x - 1) / (RUSH - 1), 0, 1);
      const lighting =
        introState === "running" ||
        (introState === "waiting" && L.intro && L.motionSafe);
      const clock = introState === "running" ? introClock : 0;

      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.lineJoin = "round";

      // The pool of light on the floor where the corridor ends.
      const endX = cx0 + vx;
      const endY = cy0 + vy;
      const pool = ctx.createRadialGradient(
        endX,
        endY + h * 0.06,
        0,
        endX,
        endY + h * 0.06,
        w * 0.45,
      );
      pool.addColorStop(0, css(farC, dark ? 0.16 : 0.12));
      pool.addColorStop(1, css(farC, 0));
      ctx.fillStyle = pool;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
      // Rails: the corridor's four long edges, through every frame's corners.
      ctx.beginPath();
      for (let corner = 0; corner < 4; corner += 1) {
        const sx = corner % 2 ? 1 : -1;
        const sy = corner < 2 ? -1 : 1;
        for (let k = 0; k < count; k += 1) {
          const z = NEAR + (k + 1) * gap - phase;
          if (z <= NEAR * 0.95) continue;
          const pull = 1 - NEAR / z;
          const x = cx0 + vx * pull + (sx * hx * F) / z;
          const y = cy0 + vy * pull + (sy * hy * F) / z;
          if (k === 0 || z - gap <= NEAR * 0.95) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = css(nearC, dark ? 0.09 : 0.14);
      ctx.stroke();

      // Far to near, so near light lies on top.
      for (let k = count - 1; k >= 0; k -= 1) {
        const z = NEAR + (k + 1) * gap - phase;
        if (z <= NEAR) continue;
        const id = base + k;
        const t = clamp((z - NEAR) / (farZ - NEAR), 0, 1);
        let a =
          smooth(farZ, farZ * 0.45, z) *
          smooth(NEAR, NEAR + gap * 1.3, z) *
          fixture(id, seedN);
        if (lighting) {
          // Near to far, each fixture comes on with a small flash; the
          // nearest are already on, so the first frame is never dark.
          const since = clock + stagger * 1.5 - k * stagger;
          a *=
            since <= 0
              ? 0
              : since < 0.08
                ? (since / 0.08) * 1.35
                : 1 + 0.35 * Math.exp(-(since - 0.08) / 0.12);
        }
        if (a <= 0.004) continue;
        const colour = tone;
        colour[0] = lerp(nearC[0], farC[0], t);
        colour[1] = lerp(nearC[1], farC[1], t);
        colour[2] = lerp(nearC[2], farC[2], t);
        const pull = 1 - NEAR / z;
        const cx = cx0 + vx * pull;
        const cy = cy0 + vy * pull;
        const hw = (hx * F) / z;
        const hh = (hy * F) / z;
        const r = radius * Math.min(hw, hh);
        const core = clamp(2.1 / z, 0.6, 3.2);
        const echoes = trail > 0.05 ? 3 : 1;
        for (let e = 0; e < echoes; e += 1) {
          // Rushing, each frame leaves fainter copies of itself behind.
          const ze = z + e * gap * 0.08 * trail;
          const ke = e === 0 ? 1 : (0.35 * trail) / e;
          const pe = 1 - NEAR / ze;
          frameAt(
            cx0 + vx * pe,
            cy0 + vy * pe,
            (hx * F) / ze,
            (hy * F) / ze,
            r * (z / ze),
          );
          ctx.strokeStyle = css(colour, a * ke * glowK * 0.07);
          ctx.lineWidth = core * 12;
          ctx.stroke();
          ctx.strokeStyle = css(colour, a * ke * glowK * 0.2);
          ctx.lineWidth = core * 4.5;
          ctx.stroke();
          ctx.strokeStyle = css(colour, a * ke * (dark ? 0.95 : 0.85));
          ctx.lineWidth = core;
          ctx.stroke();
        }
        // Its reflection, mirrored about its own floor line, fading away
        // from the contact.
        if (mirror > 0) {
          const floor = cy + hh;
          frameAt(cx, floor + hh, hw, hh, r);
          const fadeOut = ctx.createLinearGradient(
            0,
            floor,
            0,
            floor + hh * 1.2,
          );
          fadeOut.addColorStop(0, css(colour, a * mirror * 0.45));
          fadeOut.addColorStop(1, css(colour, 0));
          ctx.strokeStyle = fadeOut;
          ctx.lineWidth = core * 2.2;
          ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = "source-over";
      root.setAttribute("data-painted", "");
    };

    /** Advances the travel and the springs; true while anything moves. */
    const advance = (dt: number): boolean => {
      const L = latest.current;
      let busy = false;
      let left = dt;
      while (left > 1e-6) {
        const h = Math.min(STEP, left);
        left -= h;
        stepSpring(vp.x, vp.tx, springs.drift, h);
        stepSpring(vp.y, vp.ty, springs.drift, h);
        stepSpring(pace, rushing ? RUSH : 1, springs.drift, h);
      }
      if (!(rest(vp.x, vp.tx, 0.2) && rest(vp.y, vp.ty, 0.2))) busy = true;
      if (!rest(pace, rushing ? RUSH : 1, 0.002)) busy = true;
      const moving = !L.paused && L.speed > 0;
      if (moving) {
        travel += dt * clamp(L.speed, 0, 2) * PACE * pace.x;
        busy = true;
      }
      if (introState === "running") {
        introClock += dt;
        const gap = 0.9 * clamp(L.spacing, 0.5, 2);
        const farZ = lerp(5, 13, clamp(L.depth, 0, 1));
        const count = Math.ceil((farZ - NEAR) / gap) + 1;
        if (introClock > cascade(count) * count + 0.5) {
          introState = "done";
          L.onIntroEnd?.();
        } else busy = true;
      }
      return busy;
    };

    /** Reduced motion: everything stands where it is going. */
    const place = () => {
      vp.x.x = vp.tx;
      vp.y.x = vp.ty;
      vp.x.v = 0;
      vp.y.v = 0;
      pace.x = 1;
      pace.v = 0;
      if (introState === "running") {
        introState = "done";
        latest.current.onIntroEnd?.();
      }
    };

    const frame = (now: number) => {
      raf = 0;
      if (!visible || document.hidden) {
        last = 0;
        return;
      }
      if (!latest.current.motionSafe) {
        place();
        draw();
        last = 0;
        return;
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const busy = advance(dt);
      draw();
      if (busy) raf = window.requestAnimationFrame(frame);
      else last = 0;
    };

    const kick = () => {
      if (raf || disposed) return;
      if (!visible || document.hidden) {
        dirty = true;
        return;
      }
      raf = window.requestAnimationFrame(frame);
    };

    const stop = () => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    };

    const resize = () => {
      const w = root.clientWidth;
      const h = root.clientHeight;
      if (w < 1 || h < 1) return;
      const L = latest.current;
      const scale = Math.min(
        2,
        Math.max(0.5, L.dpr),
        window.devicePixelRatio || 1,
      );
      if (size.w === w && size.h === h && size.dpr === scale) return;
      size = { w, h, dpr: scale };
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      draw();
    };

    recolor();
    resize();

    const sizer = new ResizeObserver(() => resize());
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible = Boolean(entry?.isIntersecting);
      if (!visible) return;
      if (introState === "waiting") {
        const L = latest.current;
        if (L.intro && L.motionSafe) {
          introState = "running";
          introClock = 0;
        } else {
          introState = "done";
          L.onIntroEnd?.();
        }
      }
      if (dirty) draw();
      kick();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) kick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const local = (clientX: number, clientY: number) => {
      const rect = root.getBoundingClientRect();
      return {
        x: clientX - rect.left - root.clientLeft,
        y: clientY - rect.top - root.clientTop,
      };
    };

    api.current = {
      refresh: () => {
        if (!latest.current.motionSafe) {
          stop();
          if (rushing) {
            rushing = false;
            latest.current.onRushChange?.(false);
          }
        }
        size = { w: 0, h: 0, dpr: 0 };
        resize();
        kick();
      },
      recolor: () => {
        recolor();
        draw();
      },
      local,
      aim: (x, y, source) => {
        const { w, h } = size;
        if (w < 1 || h < 1) return;
        looking = source;
        const L = latest.current;
        const k = clamp(L.pointerStrength, 0, 1);
        const ox = w * L.vanishX;
        const oy = h * L.vanishY;
        // The vanishing point leans toward the hand, never off the box.
        vp.tx = clamp((x - ox) * 0.62 * k, w * 0.06 - ox, w * 0.94 - ox);
        vp.ty = clamp((y - oy) * 0.5 * k, h * 0.12 - oy, h * 0.88 - oy);
        kick();
      },
      away: (source) => {
        if (source && looking !== source) return;
        looking = null;
        vp.tx = 0;
        vp.ty = 0;
        kick();
      },
      rush: (down) => {
        // Under reduced motion there is no rush, so there is none to report.
        const next = down && latest.current.motionSafe;
        if (rushing === next) return;
        rushing = next;
        latest.current.onRushChange?.(next);
        kick();
      },
    };

    return () => {
      disposed = true;
      stop();
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      api.current = null;
    };
  }, []);

  // Everything else is read each frame: a change draws the next one.
  React.useEffect(() => {
    api.current?.refresh();
  }, [
    speed,
    spacing,
    round,
    glow,
    reflection,
    depth,
    vanishX,
    vanishY,
    pointerStrength,
    seed,
    paused,
    dpr,
    motionSafe,
  ]);

  // A hand that is switched off lets go.
  React.useEffect(() => {
    if (interactive) return;
    api.current?.away(null);
    api.current?.rush(false);
  }, [interactive]);

  React.useEffect(() => {
    const listening = unlisten;
    return () => listening.current?.();
  }, []);

  // A new theme or new colours change the carriers'; their 1 ms colour
  // transition says when, and the light is drawn from them again.
  const repaintSoon = React.useRef(0);
  const onColors = () => {
    if (repaintSoon.current) return;
    repaintSoon.current = window.requestAnimationFrame(() => {
      repaintSoon.current = 0;
      api.current?.recolor();
    });
  };
  React.useEffect(
    () => () => {
      if (repaintSoon.current) window.cancelAnimationFrame(repaintSoon.current);
      repaintSoon.current = 0;
    },
    [],
  );

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const a = api.current;
    if (!a || !interactive) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const at = a.local(event.clientX, event.clientY);
    a.aim(at.x, at.y, "pointer");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const a = api.current;
    if (!a || !interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = a.local(event.clientX, event.clientY);
    a.aim(at.x, at.y, "pointer");
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    // Pressing a button in the content is the button's business.
    if (hit && rootRef.current?.contains(hit)) return;
    a.rush(true);
    unlisten.current?.();
    const id = event.pointerId;
    const touch = event.pointerType === "touch";
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      unlisten.current?.();
      api.current?.rush(false);
      if (touch) api.current?.away("pointer");
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    unlisten.current = () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      unlisten.current = null;
    };
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    api.current?.away("pointer");
  };

  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    const a = api.current;
    const target = event.target;
    if (!a || !interactive || !(target instanceof Element)) return;
    if (!target.matches(":focus-visible")) return;
    const rect = target.getBoundingClientRect();
    const at = a.local(rect.left + rect.width / 2, rect.top + rect.height / 2);
    a.aim(at.x, at.y, "focus");
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    api.current?.away("focus");
  };

  return (
    <div
      ref={rootRef}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        "group/light-corridor relative isolate h-full w-full overflow-clip",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundColor: backdrop,
          backgroundImage: `radial-gradient(60% 70% at ${Math.round(vanishX * 100)}% ${Math.round(vanishY * 100 + 2)}%, color-mix(in oklab, ${far} 16%, transparent) 0%, transparent 70%)`,
        }}
      >
        {/* The corridor as the server draws it: a few frames, still. */}
        <div className="absolute inset-0 transition-opacity duration-300 group-data-painted/light-corridor:opacity-0">
          {STILL_DEPTHS.map((z, i) => (
            <span
              key={z}
              className="absolute border"
              style={{
                left: `${Math.round((vanishX * 100 - 34 / z) * 100) / 100}%`,
                right: `${Math.round((100 - vanishX * 100 - 34 / z) * 100) / 100}%`,
                top: `${Math.round((vanishY * 100 - 55 / z) * 100) / 100}%`,
                bottom: `${Math.round((100 - vanishY * 100 - 55 / z) * 100) / 100}%`,
                borderRadius: `${Math.round((clamp(round, 0, 1) * 96) / z)}px`,
                borderColor: `color-mix(in oklab, ${i < 3 ? color : far} ${Math.round(80 - i * 11)}%, transparent)`,
                boxShadow: `0 0 ${Math.round(18 / z)}px color-mix(in oklab, ${color} 30%, transparent)`,
              }}
            />
          ))}
        </div>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-painted/light-corridor:opacity-100"
        />
        <span
          ref={nearCarrier}
          onTransitionEnd={onColors}
          className="absolute size-px opacity-0 transition-colors duration-1"
          style={{ color }}
        />
        <span
          ref={farCarrier}
          onTransitionEnd={onColors}
          className="absolute size-px opacity-0 transition-colors duration-1"
          style={{ color: far }}
        />
        <span
          ref={backCarrier}
          onTransitionEnd={onColors}
          className="absolute size-px opacity-0 transition-colors duration-1"
          style={{ color: backdrop }}
        />
      </div>
      <div className={cn("relative z-10 size-full", contentClassName)}>
        {children}
      </div>
    </div>
  );
}
