"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type Transition,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type ShadowBoxLight = "top" | "left" | "right";
export type ShadowBoxPalette = "dusk" | "fern" | "snow" | "ember";

export type ShadowBoxLayer = {
  /** The cut shape as an SVG path in a 0–100 by 0–100 box, stretched to the window. */
  path: string;
  /** The paper's colour, any CSS colour. */
  color: string;
  /** Where it stands, 0 (just behind the glass) to 1 (against the back). Spread evenly when omitted. */
  depth?: number;
};

export type ShadowBoxProps = {
  /** How many cut-paper layers to generate, 2 to 7, or your own layers, back to front. @default 5 */
  layers?: number | readonly ShadowBoxLayer[];
  /** How deep the box is, in px: longer shadows, more parallax. @default 56 */
  depth?: number;
  /** The open side the light falls in from. @default "top" */
  light?: ShadowBoxLight;
  /** How strong that light is, 0 (flat, no shadows) to 1. @default 0.7 */
  lightStrength?: number;
  /** A named paper set, or five CSS colours: sky top, sky low, moon, far ridge, near ridge. @default "dusk" */
  palette?: ShadowBoxPalette | readonly string[];
  /** The furthest the box tilts toward the pointer, in degrees. @default 14 */
  tilt?: number;
  /** The viewing distance, in px: smaller is a stronger perspective. @default 900 */
  perspective?: number;
  /** The frame's width, in px. @default 14 */
  frame?: number;
  /** The frame's colour, any CSS colour. @default ink on the page's tone */
  frameColor?: string;
  /** A glass pane in the frame, its reflection sliding against the tilt. @default true */
  glass?: boolean;
  /** The piece's name, printed on the plaque and read first. @default "Night fern trail" */
  title?: string;
  /** A line read after the title. @default "Cut paper, N layers" */
  caption?: string;
  /** Makes the whole box a link. */
  href?: string;
  /** Pointer, touch and keys tilt the box. @default true */
  interactive?: boolean;
  /** Keyboard focus starts a slow tour round the inside. @default true */
  tour?: boolean;
  /** Seeds the ridges, trees and stars. @default 11 */
  seed?: number;
  /** The accessible name, if it should say more than the title and caption. */
  label?: string;
  /** Shows the box at rest and takes no input. @default false */
  disabled?: boolean;
  /** Sizes the box. @default "aspect-[5/4] w-full max-w-xs" */
  className?: string;
};

type Paints = {
  skyTop: string;
  skyLow: string;
  moon: string;
  far: string;
  near: string;
  /** Stars on the back panel. */
  night: boolean;
};

/** Paper is pigment: the same sheet on a light page and a dark one. */
const PALETTES: Record<ShadowBoxPalette, Paints> = {
  dusk: {
    skyTop: "oklch(0.4 0.07 286)",
    skyLow: "oklch(0.8 0.09 52)",
    moon: "oklch(0.96 0.03 92)",
    far: "oklch(0.64 0.07 322)",
    near: "oklch(0.25 0.05 282)",
    night: true,
  },
  fern: {
    skyTop: "oklch(0.86 0.05 128)",
    skyLow: "oklch(0.96 0.03 96)",
    moon: "oklch(0.99 0.03 95)",
    far: "oklch(0.76 0.08 148)",
    near: "oklch(0.36 0.08 158)",
    night: false,
  },
  snow: {
    skyTop: "oklch(0.68 0.06 248)",
    skyLow: "oklch(0.92 0.02 242)",
    moon: "oklch(0.99 0.01 240)",
    far: "oklch(0.76 0.04 248)",
    near: "oklch(0.97 0.008 240)",
    night: false,
  },
  ember: {
    skyTop: "oklch(0.3 0.06 32)",
    skyLow: "oklch(0.74 0.15 58)",
    moon: "oklch(0.94 0.09 82)",
    far: "oklch(0.56 0.12 36)",
    near: "oklch(0.2 0.03 32)",
    night: true,
  },
};

const WALL = "oklch(0.86 0.012 80)";
const SLOT_FRONT = "oklch(0.99 0.025 88)";
const SLOT_BACK = "oklch(0.9 0.05 76)";
const EDGE = "oklch(0.99 0.01 90)";

/** Under reduced motion the box rests at a three-quarter view that shows its walls. */
const REST_X = 5;
const REST_Y = -7;
/** The tour's two slow sways, rad/s: periods of about nine and fourteen seconds. */
const TOUR_X = 0.7;
const TOUR_Y = 0.45;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x2c1b3c6d) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const mix = (a: string, b: string, t: number) =>
  `color-mix(in oklab, ${a}, ${b} ${Math.round(clamp01(t) * 100)}%)`;

function paintsOf(palette: ShadowBoxPalette | readonly string[]): Paints {
  if (typeof palette === "string") return PALETTES[palette] ?? PALETTES.dusk;
  const base = PALETTES.dusk;
  return {
    skyTop: palette[0] ?? base.skyTop,
    skyLow: palette[1] ?? base.skyLow,
    moon: palette[2] ?? base.moon,
    far: palette[3] ?? base.far,
    near: palette[4] ?? base.near,
    night: true,
  };
}

type Cut = {
  /** The filled shape, in window px (or 0–100 when `scaled`). */
  d: string;
  /** The top edge only, for the highlight where the light catches the cut. */
  edge: string;
  fill: string;
  /** px behind the glass, negative. */
  z: number;
  /** A custom 0–100 path that is stretched to the window. */
  scaled: boolean;
};

/** A fir in three tiers, standing on (x, y). */
function fir(x: number, y: number, h: number, w: number): string {
  const p = (dx: number, dy: number) => `${r1(x + dx * w)} ${r1(y - dy * h)}`;
  return [
    `M ${p(0, 1)}`,
    `L ${p(0.24, 0.66)} L ${p(0.13, 0.66)}`,
    `L ${p(0.38, 0.34)} L ${p(0.22, 0.34)}`,
    `L ${p(0.5, -0.04)} L ${p(-0.5, -0.04)}`,
    `L ${p(-0.22, 0.34)} L ${p(-0.38, 0.34)}`,
    `L ${p(-0.13, 0.66)} L ${p(-0.24, 0.66)} Z`,
  ].join(" ");
}

/**
 * The generated scene, in window px so trees never stretch: ridges that step
 * forward and darken (aerial perspective), firs on the middle hills, grass on
 * the front layer, every edge cut by hand — a seeded jitter of a fraction of
 * a pixel along the ridge.
 */
function cutScene(
  w: number,
  h: number,
  count: number,
  depth: number,
  paints: Paints,
  seed: number,
): Cut[] {
  const rand = lcg(seed);
  const n = clamp(Math.round(count), 2, 7);
  const cuts: Cut[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = n === 1 ? 1 : i / (n - 1);
    const front = i === n - 1 && n >= 3;
    const base = h * (front ? 0.9 : lerp(0.5, 0.84, t));
    const amp = h * (front ? 0.035 : lerp(0.13, 0.06, t));
    const f1 = (Math.PI * 2) / (w * (0.8 + rand() * 0.4));
    const f2 = (Math.PI * 2) / (w * (0.3 + rand() * 0.15));
    const f3 = (Math.PI * 2) / (w * (0.1 + rand() * 0.06));
    const p1 = rand() * 6.28;
    const p2 = rand() * 6.28;
    const p3 = rand() * 6.28;
    const ridge = (x: number) =>
      base -
      amp *
        (0.6 * Math.sin(x * f1 + p1) +
          0.28 * Math.sin(x * f2 + p2) +
          0.12 * Math.sin(x * f3 + p3));
    const step = Math.max(4, w / 70);
    const pts: string[] = [];
    for (let x = -2; x <= w + 2 + step / 2; x += step) {
      const jitter = (rand() - 0.5) * 0.7;
      pts.push(`${r1(Math.min(x, w + 2))} ${r1(ridge(x) + jitter)}`);
    }
    const edge = `M ${pts.join(" L ")}`;
    let d = `${edge} L ${r1(w + 2)} ${r1(h + 2)} L -2 ${r1(h + 2)} Z`;
    if (!front && t >= 0.2 && t <= 0.9) {
      const trees = Math.round((w / 46) * (0.4 + t));
      for (let k = 0; k < trees; k += 1) {
        const x = (k + 0.2 + rand() * 0.6) * (w / trees);
        const th = h * (0.05 + 0.1 * t) * (0.7 + rand() * 0.6);
        d += ` ${fir(x, ridge(x) + 1.5, th, th * 0.55)}`;
      }
    }
    if (front) {
      for (let x = 2; x < w; x += 3 + rand() * 4) {
        const y = ridge(x) + 1;
        const len = h * (0.03 + rand() * 0.07);
        const lean = (rand() - 0.5) * len * 0.7;
        d += ` M ${r1(x - 1)} ${r1(y + 2)} L ${r1(x + lean)} ${r1(y - len)} L ${r1(x + 1.3)} ${r1(y + 2)} Z`;
      }
    }
    cuts.push({
      d,
      edge,
      fill: mix(paints.far, paints.near, Math.pow(t, 0.85)),
      z: -r1(depth * (1 - (i + 1) / (n + 1))),
      scaled: false,
    });
  }
  return cuts;
}

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * A card made as a shadow box: a framed window, four inner walls running back
 * `depth` px to a sky panel, and cut-paper layers standing between them at
 * their own depths, all real planes in CSS 3D. One side is open; the light
 * falls in from it, so the walls are shaded by where they face, each layer is
 * washed lighter toward the opening and its cut edge catches a highlight, and
 * each casts a blurred shadow onto the layers behind it — drawn ON those
 * layers, so when the box tilts a shadow moves with the surface it falls on.
 *
 * The pointer tilts the box toward it on the glide spring and leaving lets it
 * drift home on the drift spring; the layers slide past one another in true
 * perspective and the walls open up. Keyboard focus starts a slow tour, a
 * Lissajous sway round the inside; arrow keys tilt it by a quarter of the
 * range and Home levels it. Under reduced motion it rests at a three-quarter
 * view and keys set a new still view at once.
 */
export function ShadowBox({
  layers = 5,
  depth = 56,
  light = "top",
  lightStrength = 0.7,
  palette = "dusk",
  tilt = 14,
  perspective = 900,
  frame = 14,
  frameColor = "color-mix(in oklab, var(--foreground) 86%, var(--background))",
  glass = true,
  title = "Night fern trail",
  caption,
  href,
  interactive = true,
  tour = true,
  seed = 11,
  label,
  disabled = false,
  className,
}: ShadowBoxProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const [size, setSize] = React.useState({ w: 250, h: 200 });

  const D = clamp(Math.round(depth), 8, 200);
  const F = clamp(Math.round(frame), 4, 40);
  const strength = clamp01(lightStrength);
  const maxTilt = clamp(tilt, 0, 30);
  const live = interactive && !disabled;
  // The box's outside walls swing into view as it tilts: the box sits in from
  // the root by as far as they can reach, so a full tilt never leaves it.
  const pad = Math.round(
    Math.min(
      size.w * 0.14,
      Math.max(
        size.w * 0.03,
        D * Math.sin((maxTilt * Math.PI) / 180) * 1.1 + 3,
      ),
    ),
  );
  const W = Math.max(40, size.w - 2 * pad);
  const H = Math.max(40, size.h - 2 * pad);
  const w = Math.max(20, W - 2 * F);
  const h = Math.max(20, H - 2 * F);
  const paintKey = typeof palette === "string" ? palette : palette.join("|");
  // Keyed by the colours, not the array, so an inline palette does not
  // rebuild the scene on every render.
  const paints = React.useMemo(
    () =>
      paintsOf(
        paintKey.includes("|")
          ? paintKey.split("|")
          : (paintKey as ShadowBoxPalette),
      ),
    [paintKey],
  );

  const cuts = React.useMemo<Cut[]>(() => {
    if (typeof layers === "number") {
      return cutScene(w, h, layers, D, paints, seed);
    }
    const n = layers.length;
    return layers.map((layer, i) => ({
      d: layer.path,
      edge: "",
      fill: layer.color,
      z: -r1(
        D *
          (0.08 +
            0.84 * clamp01(layer.depth ?? (n === 1 ? 0.5 : 1 - i / (n - 1)))),
      ),
      scaled: true,
    }));
  }, [layers, w, h, D, paints, seed]);

  const count =
    typeof layers === "number"
      ? clamp(Math.round(layers), 2, 7)
      : layers.length;
  const words =
    caption ?? `Cut paper, ${count} ${count === 1 ? "layer" : "layers"}`;
  const name = label ?? `${title}. ${words}`;

  /** Where the light points into the box, as a unit offset of the shadows. */
  const away =
    light === "left"
      ? { x: 1, y: 0.25 }
      : light === "right"
        ? { x: -1, y: 0.25 }
        : { x: 0.12, y: 1 };
  const slope = lerp(0.5, 1.2, strength);

  const rx = useMotionValue(motionSafe ? 0 : REST_X);
  const ry = useMotionValue(motionSafe ? 0 : REST_Y);
  const anims = React.useRef<AnimationPlaybackControls[]>([]);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const hover = React.useRef(false);
  const manual = React.useRef<{ x: number; y: number } | null>(null);
  const touring = React.useRef(false);
  const visible = React.useRef(true);
  const frameId = React.useRef(0);
  const tourT = React.useRef({ t: 0, last: 0, gain: 0 });
  const dragFrom = React.useRef(0);

  const stopAll = React.useCallback(() => {
    for (const a of anims.current) a.stop();
    anims.current = [];
  }, []);

  const go = React.useCallback(
    (x: number, y: number, spring: Transition) => {
      stopAll();
      anims.current = [animate(rx, r2(x), spring), animate(ry, r2(y), spring)];
    },
    [rx, ry, stopAll],
  );

  const stopTour = React.useCallback(() => {
    touring.current = false;
    if (frameId.current) window.cancelAnimationFrame(frameId.current);
    frameId.current = 0;
  }, []);

  // The tour's frame reads the latest props through this ref; `loop` itself
  // is stable, so a frame never schedules a stale closure.
  const api = React.useRef<{ tick: (now: number) => void } | null>(null);
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  const tick = (now: number) => {
    frameId.current = 0;
    if (!touring.current || !visible.current || document.hidden) {
      tourT.current.last = 0;
      return;
    }
    const s = tourT.current;
    const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 1 / 60;
    s.last = now;
    s.t += dt;
    // The sway fades in over about a second so the tour starts from wherever
    // the box was, not with a jump.
    s.gain = Math.min(1, s.gain + dt * 0.8);
    const g = s.gain * s.gain * (3 - 2 * s.gain);
    const toX = Math.sin(s.t * TOUR_X) * 0.55 * maxTilt;
    const toY = Math.sin(s.t * TOUR_Y + 0.6) * 0.85 * maxTilt;
    rx.set(r2(lerp(rx.get(), toX, 0.04 + 0.96 * g)));
    ry.set(r2(lerp(ry.get(), toY, 0.04 + 0.96 * g)));
    frameId.current = window.requestAnimationFrame(loop);
  };
  React.useLayoutEffect(() => {
    api.current = { tick };
  });

  const startTour = React.useCallback(() => {
    if (!tour || !live || !motionSafe || touring.current) return;
    stopAll();
    touring.current = true;
    tourT.current = { t: 0, last: 0, gain: 0 };
    frameId.current = window.requestAnimationFrame(loop);
  }, [live, loop, motionSafe, stopAll, tour]);

  /** Back to rest: level when the pointer leaves, the still view under reduced motion. */
  const rest = React.useCallback(() => {
    if (motionSafe) go(0, 0, springs.drift);
    else {
      stopAll();
      rx.set(REST_X);
      ry.set(REST_Y);
    }
  }, [go, motionSafe, rx, ry, stopAll]);

  // The rest view follows the motion preference.
  React.useEffect(() => {
    if (!motionSafe) {
      stopTour();
      stopAll();
      rx.set(REST_X);
      ry.set(REST_Y);
    } else if (!hover.current && !touring.current && !manual.current) {
      rx.set(0);
      ry.set(0);
    }
  }, [motionSafe, rx, ry, stopAll, stopTour]);

  React.useEffect(
    () => () => {
      stopTour();
      stopAll();
    },
    [stopAll, stopTour],
  );

  const bindRoot = React.useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (!node) return;
      const measure = () => {
        const r = node.getBoundingClientRect();
        const next = {
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
        setSize((s) => (s.w === next.w && s.h === next.h ? s : next));
      };
      measure();
      const sizer = new ResizeObserver(measure);
      sizer.observe(node);
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        visible.current = Boolean(entry?.isIntersecting);
        if (visible.current && touring.current && !frameId.current) {
          frameId.current = window.requestAnimationFrame(loop);
        }
      });
      watcher.observe(node);
      return () => {
        sizer.disconnect();
        watcher.disconnect();
      };
    },
    [loop],
  );

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden && touring.current && !frameId.current) {
        frameId.current = window.requestAnimationFrame(loop);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [loop]);

  const onPointerMove = (event: React.PointerEvent) => {
    if (!live || !motionSafe || event.pointerType === "touch") return;
    const node = rootRef.current;
    if (!node) return;
    const r = node.getBoundingClientRect();
    const px = clamp(((event.clientX - r.left) / r.width) * 2 - 1, -1, 1);
    const py = clamp(((event.clientY - r.top) / r.height) * 2 - 1, -1, 1);
    hover.current = true;
    manual.current = null;
    stopTour();
    go(-py * maxTilt, px * maxTilt, springs.glide);
  };

  const onPointerLeave = (event: React.PointerEvent) => {
    if (event.pointerType === "touch" || !hover.current) return;
    hover.current = false;
    const focused = rootRef.current?.querySelector(":focus-visible");
    if (focused && tour && live && motionSafe) startTour();
    else rest();
  };

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled: !live,
    onStart: ({ event }) => {
      if (event.pointerType !== "touch") return;
      stopTour();
      stopAll();
      dragFrom.current = ry.get();
    },
    onMove: ({ offset, event }) => {
      if (event.pointerType !== "touch") return;
      // A finger turns the box 1:1 — a quarter of a degree a pixel — and
      // rubber-bands past the range instead of stopping dead.
      const raw = dragFrom.current + offset.x * 0.25;
      ry.set(
        r2(
          motionSafe
            ? rubberClamp(raw, -maxTilt, maxTilt, maxTilt)
            : clamp(raw, -maxTilt, maxTilt),
        ),
      );
    },
    onEnd: ({ event }) => {
      if (event.pointerType !== "touch") return;
      if (motionSafe) rest();
    },
    onCancel: () => {
      if (motionSafe) rest();
    },
  });

  const keyTilt = (dx: number, dy: number) => {
    const quarter = maxTilt * 0.5;
    const from = manual.current ?? { x: rx.get(), y: ry.get() };
    const next = {
      x: clamp(
        Math.round((from.x + dx * quarter) / quarter) * quarter,
        -maxTilt,
        maxTilt,
      ),
      y: clamp(
        Math.round((from.y + dy * quarter) / quarter) * quarter,
        -maxTilt,
        maxTilt,
      ),
    };
    manual.current = next;
    stopTour();
    if (motionSafe) go(next.x, next.y, springs.glide);
    else {
      stopAll();
      rx.set(r2(next.x));
      ry.set(r2(next.y));
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!live) return;
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        keyTilt(0, -1);
        break;
      case "ArrowRight":
        event.preventDefault();
        keyTilt(0, 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        keyTilt(1, 0);
        break;
      case "ArrowDown":
        event.preventDefault();
        keyTilt(-1, 0);
        break;
      case "Home":
        event.preventDefault();
        manual.current = null;
        stopTour();
        rest();
        break;
      case "Escape":
        // Claimed only when there is a tilt to undo, so otherwise it reaches the page.
        if (manual.current || touring.current) {
          event.preventDefault();
          manual.current = null;
          stopTour();
          rest();
        }
        break;
      default:
        break;
    }
  };

  const onFocus = (event: React.FocusEvent<HTMLElement>) => {
    if (
      event.currentTarget.matches(":focus-visible") &&
      !hover.current &&
      !manual.current
    ) {
      startTour();
    }
  };

  const onBlur = () => {
    manual.current = null;
    if (touring.current) {
      stopTour();
      if (!hover.current) rest();
    } else if (!hover.current && live) rest();
  };

  // The reflection slides against the tilt, as glass does.
  const sheen = useTransform(ry, (y) => `${r1(50 - y * 2.2)}% 0%`);

  const toBack = {
    floor: "to bottom",
    ceiling: "to top",
    left: "to left",
    right: "to right",
  } as const;
  const occlusion = (dir: string) =>
    `linear-gradient(${dir}, transparent 0%, oklch(0.2 0.02 270 / ${r2(0.18 + 0.2 * strength)}) 100%)`;
  const across = (dir: string, lit: number) =>
    `linear-gradient(${dir}, oklch(1 0 0 / ${r2(0.24 * strength * lit)}), oklch(0.2 0.02 270 / ${r2(0.22 * strength)}))`;
  const slot = (dir: string) =>
    `linear-gradient(${dir}, ${SLOT_FRONT}, ${SLOT_BACK})`;
  const wallStyle = (
    side: "floor" | "ceiling" | "left" | "right",
  ): React.CSSProperties => {
    const open =
      (light === "top" && side === "ceiling") ||
      (light === "left" && side === "left") ||
      (light === "right" && side === "right");
    if (open) return { backgroundImage: slot(toBack[side]) };
    const facing =
      (light === "top" && side === "floor") ||
      (light === "left" && side === "right") ||
      (light === "right" && side === "left");
    const acrossDir =
      light === "top" ? "to bottom" : light === "left" ? "to right" : "to left";
    return {
      backgroundColor: WALL,
      backgroundImage: [
        occlusion(toBack[side]),
        facing
          ? `linear-gradient(oklch(1 0 0 / ${r2(0.16 * strength)}), oklch(1 0 0 / ${r2(0.16 * strength)}))`
          : across(acrossDir, 1),
      ].join(", "),
    };
  };

  const washDir =
    light === "top"
      ? { x1: 0, y1: 0, x2: 0, y2: 1 }
      : light === "left"
        ? { x1: 0, y1: 0, x2: 1, y2: 0 }
        : { x1: 1, y1: 0, x2: 0, y2: 0 };
  const scaleOf = (cut: Cut) =>
    cut.scaled ? `scale(${r2(w / 100)} ${r2(h / 100)})` : undefined;

  // Stars and the moon are placed once per seed and size.
  const sky = React.useMemo(() => {
    const rand = lcg(seed * 7 + 3);
    const moon = {
      cx: r1(w * (0.22 + rand() * 0.56)),
      cy: r1(h * (0.2 + rand() * 0.08)),
      r: r1(Math.max(5, h * 0.075)),
    };
    const stars = Array.from({ length: 16 }, () => ({
      cx: r1(rand() * w),
      cy: r1(rand() * h * 0.42),
      r: r2(0.5 + rand() * 0.7),
    }));
    return { moon, stars };
  }, [seed, w, h]);

  /** Shadows of the next two layers in front, cast onto surface `i` (-1 is the sky panel). */
  const shadowsOn = (i: number, clipId: string | null) => {
    const surfaceZ = i < 0 ? -D : (cuts[i]?.z ?? -D);
    const out: React.ReactNode[] = [];
    for (let j = i + 1; j <= i + 2 && j < cuts.length; j += 1) {
      const caster = cuts[j];
      if (!caster) continue;
      const gap = caster.z - surfaceZ;
      if (gap <= 0) continue;
      const dx = r1(away.x * gap * slope);
      const dy = r1(away.y * gap * slope);
      out.push(
        <path
          key={j}
          d={caster.d}
          transform={`translate(${dx} ${dy})${caster.scaled ? ` ${scaleOf(caster)}` : ""}`}
          fill="oklch(0.16 0.03 280)"
          opacity={r2((0.2 + 0.4 * strength) * (j === i + 1 ? 1 : 0.6))}
          filter={`url(#${uid}-blur-${Math.min(4, Math.round(gap / 12))})`}
        />,
      );
    }
    if (out.length === 0) return null;
    return clipId ? <g clipPath={`url(#${clipId})`}>{out}</g> : <g>{out}</g>;
  };

  const blurDefs = (
    <defs>
      {[0, 1, 2, 3, 4].map((k) => (
        <filter
          key={k}
          id={`${uid}-blur-${k}`}
          x="-10%"
          y="-10%"
          width="120%"
          height="120%"
        >
          <feGaussianBlur stdDeviation={r1(0.8 + k * 1.3)} />
        </filter>
      ))}
      <linearGradient id={`${uid}-wash`} {...washDir}>
        <stop
          offset="0"
          stopColor="oklch(1 0 0)"
          stopOpacity={r2(0.3 * strength)}
        />
        <stop offset="0.6" stopColor="oklch(1 0 0)" stopOpacity="0" />
        <stop
          offset="1"
          stopColor="oklch(0.2 0.02 280)"
          stopOpacity={r2(0.16 * strength)}
        />
      </linearGradient>
    </defs>
  );

  const window3d = { left: F, top: F, width: w, height: h };

  const Surface = href ? "a" : "div";

  return (
    <div
      ref={bindRoot}
      className={cn(
        "relative overflow-clip select-none",
        className ?? "aspect-[5/4] w-full max-w-xs",
      )}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <Surface
        {...(href
          ? { href }
          : { role: "group", "aria-roledescription": "shadow box" })}
        tabIndex={href ? undefined : live ? 0 : -1}
        aria-label={name}
        aria-describedby={live ? hintId : undefined}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        {...drag}
        className={cn(
          "absolute block touch-pan-y rounded-2",
          FOCUS_RING,
          live && "cursor-grab active:cursor-grabbing",
        )}
        style={{
          left: pad,
          top: pad,
          width: W,
          height: H,
          perspective: `${clamp(perspective, 300, 4000)}px`,
        }}
      >
        <motion.div
          aria-hidden
          className="absolute inset-0"
          style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}
        >
          {/* The back panel: the sky, lit from the opening. */}
          <svg
            className="absolute overflow-visible"
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
            style={{ ...window3d, transform: `translateZ(${-D}px)` }}
          >
            {blurDefs}
            <defs>
              <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style={{ stopColor: paints.skyTop }} />
                <stop offset="1" style={{ stopColor: paints.skyLow }} />
              </linearGradient>
              <radialGradient id={`${uid}-halo`}>
                <stop
                  offset="0"
                  style={{ stopColor: paints.moon }}
                  stopOpacity="0.55"
                />
                <stop
                  offset="1"
                  style={{ stopColor: paints.moon }}
                  stopOpacity="0"
                />
              </radialGradient>
            </defs>
            <rect width={w} height={h} fill={`url(#${uid}-sky)`} />
            {paints.night
              ? sky.stars.map((s, k) => (
                  <circle
                    key={k}
                    cx={s.cx}
                    cy={s.cy}
                    r={s.r}
                    style={{ fill: paints.moon }}
                    opacity="0.75"
                  />
                ))
              : null}
            <circle
              cx={sky.moon.cx}
              cy={sky.moon.cy}
              r={r1(sky.moon.r * 2.6)}
              fill={`url(#${uid}-halo)`}
            />
            <circle
              cx={sky.moon.cx}
              cy={sky.moon.cy}
              r={sky.moon.r}
              style={{ fill: paints.moon }}
            />
            {shadowsOn(-1, null)}
            <rect width={w} height={h} fill={`url(#${uid}-wash)`} />
          </svg>

          {/* The walls, each a plane from the window's edge to the back. */}
          <div
            className="absolute"
            style={{
              left: F,
              top: F + h,
              width: w,
              height: D,
              transformOrigin: "50% 0%",
              transform: "rotateX(-90deg)",
              ...wallStyle("floor"),
            }}
          />
          <div
            className="absolute"
            style={{
              left: F,
              top: F - D,
              width: w,
              height: D,
              transformOrigin: "50% 100%",
              transform: "rotateX(90deg)",
              ...wallStyle("ceiling"),
            }}
          />
          <div
            className="absolute"
            style={{
              left: F - D,
              top: F,
              width: D,
              height: h,
              transformOrigin: "100% 50%",
              transform: "rotateY(-90deg)",
              ...wallStyle("left"),
            }}
          />
          <div
            className="absolute"
            style={{
              left: F + w,
              top: F,
              width: D,
              height: h,
              transformOrigin: "0% 50%",
              transform: "rotateY(90deg)",
              ...wallStyle("right"),
            }}
          />

          {/* The cut layers, back to front, each carrying the shadows cast onto it. */}
          {cuts.map((cut, i) => (
            <svg
              key={i}
              className="absolute overflow-visible"
              width={w}
              height={h}
              viewBox={`0 0 ${w} ${h}`}
              style={{ ...window3d, transform: `translateZ(${cut.z}px)` }}
            >
              <defs>
                <clipPath id={`${uid}-clip-${i}`}>
                  <path d={cut.d} transform={scaleOf(cut)} />
                </clipPath>
              </defs>
              <path
                d={cut.d}
                transform={scaleOf(cut)}
                style={{ fill: cut.fill }}
              />
              {shadowsOn(i, `${uid}-clip-${i}`)}
              <g clipPath={`url(#${uid}-clip-${i})`}>
                <rect width={w} height={h} fill={`url(#${uid}-wash)`} />
              </g>
              {cut.edge ? (
                <path
                  d={cut.edge}
                  fill="none"
                  stroke={EDGE}
                  strokeWidth="0.8"
                  strokeOpacity={r2(0.15 + 0.3 * strength)}
                  strokeLinejoin="round"
                />
              ) : null}
            </svg>
          ))}

          {glass ? (
            <motion.div
              className="absolute"
              style={{
                ...window3d,
                transform: "translateZ(0.25px)",
                backgroundImage:
                  "linear-gradient(115deg, transparent 34%, oklch(1 0 0 / 0.16) 46%, oklch(1 0 0 / 0.05) 53%, transparent 62%)",
                backgroundSize: "240% 100%",
                backgroundPosition: sheen,
              }}
            />
          ) : null}

          {/* The outside of the box, in the frame's colour turned away from the light. */}
          {(
            [
              {
                left: 0,
                top: H,
                width: W,
                height: D,
                o: "50% 0%",
                t: "rotateX(-90deg)",
                k: 30,
              },
              {
                left: 0,
                top: -D,
                width: W,
                height: D,
                o: "50% 100%",
                t: "rotateX(90deg)",
                k: 12,
              },
              {
                left: -D,
                top: 0,
                width: D,
                height: H,
                o: "100% 50%",
                t: "rotateY(-90deg)",
                k: 22,
              },
              {
                left: W,
                top: 0,
                width: D,
                height: H,
                o: "0% 50%",
                t: "rotateY(90deg)",
                k: 22,
              },
            ] as const
          ).map((side) => (
            <div
              key={side.t + side.o}
              className="absolute"
              style={{
                left: side.left,
                top: side.top,
                width: side.width,
                height: side.height,
                transformOrigin: side.o,
                transform: side.t,
                backgroundColor: `color-mix(in oklab, ${frameColor}, black ${side.k}%)`,
              }}
            />
          ))}

          {/* The frame, at the glass, with its plaque on the bottom rail. */}
          <div
            className="absolute inset-0 rounded-2"
            style={{
              transform: "translateZ(0.5px)",
              borderStyle: "solid",
              borderWidth: F,
              borderColor: frameColor,
              boxShadow:
                "inset 0 0 0 1px oklch(0 0 0 / 0.25), 0 14px 28px -14px oklch(0.15 0.02 270 / 0.55)",
            }}
          >
            {F >= 11 ? (
              <span
                className="absolute inset-x-0 flex justify-center font-mono leading-none tracking-[0.12em] uppercase"
                style={{
                  bottom: -F,
                  height: F,
                  alignItems: "center",
                  fontSize: Math.min(8, Math.round(F * 0.55)),
                  color:
                    "color-mix(in oklab, var(--background) 78%, transparent)",
                }}
              >
                <span className="truncate px-2">{title}</span>
              </span>
            ) : null}
          </div>
        </motion.div>
      </Surface>
      <span id={hintId} className="sr-only">
        Arrow keys tilt the box to look inside; Home levels it.
      </span>
    </div>
  );
}
