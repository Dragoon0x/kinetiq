"use client";

import * as React from "react";

import { Check, Flame } from "lucide-react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createFullscreenTriangle,
  createGL,
  createProgram,
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
  onContextLoss,
  resizeGL,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type HeatHoldPalette = "kiln" | "forge" | "gas";
export type HeatHoldSize = "sm" | "md" | "lg";
export type HeatHoldState = "idle" | "heating" | "cooling" | "fired";

export type HeatHoldProps = {
  /** Fires once, the moment the heat reaches the top. */
  onConfirm?: () => void;
  /** Fires as the button starts heating, starts cooling, fires, and comes back to rest. */
  onHeatChange?: (state: HeatHoldState) => void;
  /** What the button does. @default "Hold to confirm" */
  label?: React.ReactNode;
  /** Shown once it has fired. @default "Confirmed" */
  doneLabel?: React.ReactNode;
  /** Before the label; 16px, drawn in currentColor. @default a flame */
  icon?: React.ReactNode;
  /** How long a hold takes to bring it to full heat, in ms. @default 1600 */
  hold?: number;
  /** How long a full charge takes to cool back down when let go early, in ms. @default 900 */
  cool?: number;
  /** How much the heat wavers: the tongues on its front, the haze above it and the embers in it, 0 to 1. @default 0.6 */
  shimmer?: number;
  /** The heat ramp, coldest first: a named ramp or 2 to 4 CSS colours. @default "kiln" */
  colors?: HeatHoldPalette | readonly string[];
  /** How far the glow blooms around the button when it fires, 0 to 1. @default 0.7 */
  glow?: number;
  /** How long it shows the fired state before it can be held again, in ms; 0 keeps it fired. @default 1800 */
  resetAfter?: number;
  /** Height 40, 48 or 56px. @default "md" */
  size?: HeatHoldSize;
  /** The highest device pixel ratio the heat is drawn at. @default 2 */
  dpr?: number;
  /** Play the sizzle while heating and the flare on firing. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

const PALETTES: Record<HeatHoldPalette, readonly string[]> = {
  kiln: [
    "oklch(0.36 0.13 27)",
    "oklch(0.58 0.21 33)",
    "oklch(0.8 0.17 68)",
    "oklch(0.97 0.05 95)",
  ],
  forge: [
    "oklch(0.3 0.08 40)",
    "oklch(0.52 0.16 48)",
    "oklch(0.75 0.15 64)",
    "oklch(0.94 0.08 88)",
  ],
  gas: [
    "oklch(0.3 0.12 268)",
    "oklch(0.52 0.2 262)",
    "oklch(0.76 0.12 230)",
    "oklch(0.97 0.03 220)",
  ],
};

const SIZES: Record<HeatHoldSize, { height: number; text: string }> = {
  sm: { height: 40, text: "text-sm" },
  md: { height: 48, text: "text-sm" },
  lg: { height: 56, text: "text-base" },
};

/** The darkest and lightest the heated label can be. */
const INK_DARK = "oklch(0.22 0.03 40)";
const INK_LIGHT = "oklch(0.99 0.01 90)";

type Rgb = [number, number, number];

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

/** Any 2–4 colours spread to the four stops the shader takes. */
function fourStops(list: readonly string[]): string[] {
  const src = list.length > 0 ? list : (PALETTES.kiln as string[]);
  if (src.length >= 4) return src.slice(0, 4) as string[];
  const out: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    const t = (i / 3) * (src.length - 1);
    const a = Math.floor(t);
    const b = Math.min(src.length - 1, a + 1);
    const k = Math.round((t - a) * 100);
    out.push(
      k === 0 || a === b
        ? (src[a] ?? "black")
        : `color-mix(in oklab, ${src[a]}, ${src[b]} ${k}%)`,
    );
  }
  return out;
}

/** The ramp as CSS, for the stand-in drawn before (or without) WebGL. */
function rampCss(stops: readonly string[], t: number): string {
  const x = Math.min(1, Math.max(0, t)) * 3;
  const i = Math.min(2, Math.floor(x));
  const k = Math.round((x - i) * 100);
  return `color-mix(in oklab, ${stops[i]}, ${stops[i + 1]} ${k}%)`;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
/** The clock, read only from handlers. */
const now = () => performance.now();
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * Sound waits for a real activation — a click, tap or key — never a hover or
 * a first touch-down. Browsers without the API are taken at their word.
 */
const activated = () => {
  if (typeof navigator === "undefined") return false;
  const ua = (navigator as Navigator & { userActivation?: UserActivation })
    .userActivation;
  return ua ? ua.hasBeenActive : true;
};

/** Where the front stands, as a share of the height, for a heat. */
const frontOf = (h: number) => h * 1.18 - 0.09;

/**
 * The kiln, one fragment pass over the button. A front climbs with the heat,
 * its edge licked into tongues by two octaves of noise rising faster than it;
 * below it the temperature rises toward the floor and the whole charge climbs
 * the ramp with the heat. Above the front a thin haze; inside it embers
 * drifting up. The flare is a white bloom from the middle. Output is
 * premultiplied over the button's own surface.
 */
const FRAGMENT = `
in vec2 v_uv;
out vec4 outColor;
uniform vec2 u_size;
uniform float u_time;
uniform float u_heat;
uniform float u_flare;
uniform float u_shimmer;
uniform vec3 u_c0;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
${GLSL_NOISE}
vec3 ramp(float t) {
  t = clamp(t, 0.0, 1.0) * 3.0;
  if (t < 1.0) return mix(u_c0, u_c1, t);
  if (t < 2.0) return mix(u_c1, u_c2, t - 1.0);
  return mix(u_c2, u_c3, t - 2.0);
}
void main() {
  vec2 px = v_uv * u_size;
  float h = u_heat;
  float amp = u_shimmer;
  float warm = smoothstep(0.0, 0.1, h);
  float rise = u_time * 1.2;
  // Slow, wide tongues and a quicker ripple, both rising faster than the
  // front, so its edge licks upward instead of sloshing.
  float n1 = kx_fbm(vec2(px.x / 46.0, px.y / 26.0 + rise)) - 0.5;
  float n2 = kx_noise(vec2(px.x / 13.0, px.y / 10.0 + rise * 2.2)) - 0.5;
  float front = h * 1.18 - 0.09;
  float y = 1.0 - v_uv.y;
  // The shimmer: the air wavers most just around the front.
  float near = exp(-abs(front - y) * 5.0);
  y += n2 * 0.06 * amp * warm * near;
  float edge = front + (n1 * 0.3 + n2 * 0.07) * amp * warm;
  float below = edge - y;
  float body = smoothstep(-0.05, 0.16, below);
  float depth = clamp(below / max(0.3, edge), 0.0, 1.0);
  float temp = h * (0.6 + 0.4 * depth) + n1 * 0.06 * amp * warm;
  vec3 hot = ramp(temp);
  // Sparks: sparse round specks rising through the hot region.
  vec2 g = vec2(px.x, px.y + u_time * 24.0) / 9.0;
  vec2 cell = floor(g);
  vec2 o = vec2(kx_hash(cell + 7.13), kx_hash(cell + 3.71)) * 0.6 + 0.2;
  float spark = step(0.93, kx_hash(cell)) * smoothstep(0.14, 0.02, length(fract(g) - o));
  spark *= body * depth * amp * warm;
  hot = mix(hot, ramp(min(1.0, temp + 0.4)), spark);
  float a1 = body * (0.45 + 0.55 * warm);
  // Above the front the air glows faintly in the front's own colour.
  float a2 = (1.0 - body) * exp(-max(0.0, -below) * 10.0) * 0.14 * warm;
  vec3 air = ramp(h * 0.7);
  float alpha = a1 + a2;
  vec3 col = alpha > 0.0001 ? (hot * a1 + air * a2) / alpha : air;
  vec2 c = (px - u_size * 0.5) / max(1.0, u_size.y);
  float bloom = u_flare * exp(-dot(c, c) * 0.9);
  col = mix(col, u_c3, clamp(bloom, 0.0, 1.0));
  alpha = clamp(max(alpha, bloom), 0.0, 1.0);
  outColor = vec4(col * alpha, alpha);
}
`;

type Sim = {
  heat: number;
  /** The heat and the clock when the current hold began. */
  heatFrom: number;
  holdFrom: number;
  flare: number;
  glow: number;
  time: number;
  holding: boolean;
  fired: boolean;
  /** Seconds the fired kiln stays white-hot before it starts to cool. */
  dwell: number;
};

type Api = {
  start: () => void;
  release: () => void;
  cancel: () => void;
  fireNow: () => void;
  recolor: () => void;
  refresh: () => void;
};

type Latest = {
  hold: number;
  cool: number;
  shimmer: number;
  glow: number;
  resetAfter: number;
  dpr: number;
  motionSafe: boolean;
  disabled: boolean;
  onConfirm?: () => void;
  onHeatChange?: (state: HeatHoldState) => void;
};

/**
 * A hold-to-confirm button fired like a kiln. Holding raises the heat: a front
 * climbs from the floor with its edge licked into tongues, the colour climbs
 * the ramp from deep red through orange and yellow to white, a haze wavers
 * above it and embers drift up through it — one WebGL2 pass over the button.
 * The label heats with it: a second copy, masked from the bottom up to the
 * front, takes the colour that reads against the heat behind it. Let go
 * early and it cools back down, quickest while it is hottest.
 *
 * Reaching the top fires it: a white flare blooms from the middle, a glow in
 * the hottest colour spreads around the button and fades, the button kicks
 * on the recoil spring, and the kiln cools down through the ramp while the
 * label says it is done.
 *
 * It is a real `<button>`: Space or Enter held heats it (Escape cancels), and
 * a click with no pointer and no key behind it — assistive technology — fires
 * it at once, because a hold cannot be asked of everyone. Under reduced
 * motion the heat is a level with a straight edge, no tongues, haze or
 * embers, and the flare is a flash; the label still heats. Without WebGL2 a
 * CSS gradient level stands in.
 */
export function HeatHold({
  onConfirm,
  onHeatChange,
  label = "Hold to confirm",
  doneLabel = "Confirmed",
  icon,
  hold = 1600,
  cool = 900,
  shimmer = 0.6,
  colors = "kiln",
  glow = 0.7,
  resetAfter = 1800,
  size = "md",
  dpr = 2,
  sound = false,
  disabled = false,
  className,
}: HeatHoldProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  // The frame loop outlives renders; it reaches sound through a ref so a
  // `sound` switched on later is heard.
  const audioRef = React.useRef(audio);
  React.useEffect(() => {
    audioRef.current = audio;
  });
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `heat-hold-hint-${uid}`;
  const s = SIZES[size] ?? SIZES.md;
  const list =
    typeof colors === "string"
      ? (PALETTES[colors as HeatHoldPalette] ?? PALETTES.kiln)
      : colors;
  const stops = fourStops(list);
  const stopsKey = stops.join("|");

  const [state, setState] = React.useState<HeatHoldState>("idle");
  const [said, setSaid] = React.useState("");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriers = React.useRef<(HTMLSpanElement | null)[]>([]);
  const api = React.useRef<Api | null>(null);
  const sim = React.useRef<Sim>({
    heat: 0,
    heatFrom: 0,
    holdFrom: 0,
    flare: 0,
    glow: 0,
    time: 0,
    holding: false,
    fired: false,
    dwell: 0,
  });
  const held = React.useRef<"pointer" | "key" | null>(null);
  const detach = React.useRef<(() => void) | null>(null);
  const lastKey = React.useRef(-1e9);
  const loop = React.useRef<LoopHandle | null>(null);
  const latest = React.useRef<Latest>({
    hold,
    cool,
    shimmer,
    glow,
    resetAfter,
    dpr,
    motionSafe,
    disabled,
    onConfirm,
    onHeatChange,
  });
  React.useEffect(() => {
    latest.current = {
      hold,
      cool,
      shimmer,
      glow,
      resetAfter,
      dpr,
      motionSafe,
      disabled,
      onConfirm,
      onHeatChange,
    };
  });

  // What the label and the stand-in read every frame.
  const front = useMotionValue(0);
  const hotInk = useMotionValue(INK_LIGHT);
  const bloom = useMotionValue(0);
  const kick = useMotionValue(1);

  const mask = useTransform(front, (f) => {
    const p = Math.round(f * 100);
    return `linear-gradient(to top, black ${p - 7}%, transparent ${p + 7}%)`;
  });
  const standIn = useTransform(front, (f) => {
    const h = clamp((f + 0.09) / 1.18, 0, 1);
    return `linear-gradient(to top, ${rampCss(stops, h)}, ${rampCss(stops, h * 0.6)})`;
  });
  const standInHeight = useTransform(
    front,
    (f) => `${Math.round(clamp(f, 0, 1) * 100)}%`,
  );
  const shadow = useTransform(bloom, (b) => {
    const k = clamp(b, 0, 1);
    if (k < 0.01) return "0 0 0 0 transparent";
    return `0 0 ${Math.round(32 * k)}px ${Math.round(6 * k)}px color-mix(in oklab, ${stops[2]} ${Math.round(70 * k)}%, transparent)`;
  });

  const phase = React.useRef<HeatHoldState>("idle");
  const enter = React.useCallback((next: HeatHoldState) => {
    if (phase.current === next) return;
    phase.current = next;
    setState(next);
    latest.current.onHeatChange?.(next);
  }, []);

  const stopLoop = () => {
    loop.current?.stop();
    loop.current = null;
  };

  const pan = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  // The kiln itself: GL, the heat simulation and the frame loop.
  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const button = buttonRef.current;
    if (!root || !canvas || !button) return;
    let gl: GLContext | null = null;
    let program: Program | null = null;
    let tri: FullscreenTriangle | null = null;
    let raf = 0;
    let last = 0;
    let visible = true;
    let disposed = false;
    const size = new Float32Array(2);
    let resetTimer = 0;
    let lastInk = "";
    let lastPitch = -1;
    const S = sim.current;
    const colours: Rgb[] = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const uniforms = [
      new Float32Array(3),
      new Float32Array(3),
      new Float32Array(3),
      new Float32Array(3),
    ];
    const read = rgbReader();

    const recolor = () => {
      carriers.current.forEach((node, i) => {
        if (!node) return;
        const rgb = read(getComputedStyle(node).color);
        colours[i] = rgb;
        const u = uniforms[i];
        if (!u) return;
        u[0] = rgb[0] / 255;
        u[1] = rgb[1] / 255;
        u[2] = rgb[2] / 255;
      });
    };

    /** The ramp's luminance at t: the label goes dark on light heat. */
    const lumaAt = (t: number) => {
      const x = clamp(t, 0, 1) * 3;
      const i = Math.min(2, Math.floor(x));
      const k = x - i;
      const a = colours[i] ?? [0, 0, 0];
      const b = colours[i + 1] ?? a;
      const lin = (c: number) => {
        const v = c / 255;
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      const mix = (j: 0 | 1 | 2) =>
        lin((a[j] ?? 0) + ((b[j] ?? 0) - (a[j] ?? 0)) * k);
      return 0.2126 * mix(0) + 0.7152 * mix(1) + 0.0722 * mix(2);
    };

    const init = (): boolean => {
      gl = createGL(canvas, { alpha: true, premultipliedAlpha: true });
      if (!gl || gl.isContextLost()) return false;
      program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
      if (!program) return false;
      tri = createFullscreenTriangle(gl, program);
      return true;
    };

    const releaseGL = () => {
      tri?.dispose();
      program?.dispose();
      tri = null;
      program = null;
    };

    const draw = () => {
      // The label and the stand-in follow the heat whether or not GL draws.
      const h = clamp(S.heat, 0, 1);
      front.set(r2(frontOf(h)));
      bloom.set(r2(S.glow * clamp(latest.current.glow, 0, 1)));
      const ink = lumaAt(h * 0.92) > 0.42 ? INK_DARK : INK_LIGHT;
      if (ink !== lastInk) {
        lastInk = ink;
        hotInk.set(ink);
      }
      if (!gl || !program || !tri || gl.isContextLost() || !visible) return;
      const L = latest.current;
      program.set({
        u_size: size,
        u_time: S.time,
        u_heat: h,
        u_flare: clamp(S.flare, 0, 1),
        u_shimmer: L.motionSafe ? clamp(L.shimmer, 0, 1) : 0,
        u_c0: uniforms[0] ?? [0, 0, 0],
        u_c1: uniforms[1] ?? [0, 0, 0],
        u_c2: uniforms[2] ?? [0, 0, 0],
        u_c3: uniforms[3] ?? [0, 0, 0],
      });
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      tri.draw();
      if (!root.hasAttribute("data-painted")) {
        root.setAttribute("data-painted", "");
      }
    };

    const resize = () => {
      if (!gl || gl.isContextLost()) return;
      const w = button.clientWidth;
      const h = button.clientHeight;
      if (w < 1 || h < 1) return;
      size[0] = w;
      size[1] = h;
      resizeGL(gl, canvas, { dprCap: clamp(latest.current.dpr, 0.5, 2) });
      draw();
    };

    const fire = () => {
      const L = latest.current;
      S.holding = false;
      S.fired = true;
      S.heat = 1;
      S.dwell = 0.28;
      S.flare = 1;
      S.glow = 1;
      held.current = null;
      detach.current?.();
      detach.current = null;
      stopLoop();
      if (activated()) {
        audioRef.current.play("flare", { gain: 0.6, pan: pan() });
      }
      if (L.motionSafe) {
        kick.jump(1);
        animate(kick, 1, { ...springs.recoil, velocity: 0.7 });
      }
      setSaid("Fired");
      enter("fired");
      L.onConfirm?.();
      window.clearTimeout(resetTimer);
      if (L.resetAfter > 0) {
        resetTimer = window.setTimeout(() => {
          S.fired = false;
          enter(S.heat > 0.002 ? "cooling" : "idle");
          kickLoop();
        }, L.resetAfter);
      }
    };

    /**
     * A held charge is a function of the time held — a slow or busy device
     * still fires `hold` ms after the press — while cooling, the flare and
     * the glow step by `wall`, and the shimmer by `dt`, the frame's own
     * clamped step. True while anything still moves.
     */
    const advance = (dt: number, wall: number, stamp: number): boolean => {
      const L = latest.current;
      if (L.motionSafe) S.time += dt;
      if (S.holding) {
        S.heat =
          S.heatFrom + Math.max(0, stamp - S.holdFrom) / Math.max(100, L.hold);
        if (S.heat >= 1) fire();
      } else if (S.dwell > 0) {
        S.dwell = Math.max(0, S.dwell - wall);
      } else if (S.heat > 0) {
        // Hot things lose heat fastest while they are hottest. After a
        // firing the kiln takes its time; a let-go cools at `cool`.
        const span = S.fired ? 1.4 : Math.max(0.1, L.cool / 1000);
        S.heat -= ((wall * 1.615) / span) * (0.35 + 0.65 * S.heat);
        if (S.heat <= 0.002) {
          S.heat = 0;
          if (!S.fired) enter("idle");
        }
      }
      if (S.flare > 0) S.flare = Math.max(0, S.flare - wall / 0.45);
      if (S.glow > 0) {
        S.glow = Math.max(0, S.glow * Math.exp(-wall / 0.45) - wall * 0.05);
      }
      if (S.holding && loop.current) {
        const pitch = r2(0.8 + S.heat * 0.9);
        if (Math.abs(pitch - lastPitch) > 0.02) {
          lastPitch = pitch;
          loop.current.set({ pitch, gain: r2(0.35 + S.heat * 0.4) });
        }
      }
      return (
        S.holding || S.heat > 0 || S.dwell > 0 || S.flare > 0 || S.glow > 0
      );
    };

    const frame = (stamp: number) => {
      raf = 0;
      if (disposed || document.hidden) {
        last = 0;
        return;
      }
      const wall = last ? Math.min(0.25, (stamp - last) / 1000) : 1 / 60;
      last = stamp;
      const busy = advance(Math.min(0.05, wall), wall, stamp);
      draw();
      if (busy) raf = window.requestAnimationFrame(frame);
      else last = 0;
    };

    const kickLoop = () => {
      if (raf || disposed || document.hidden) return;
      raf = window.requestAnimationFrame(frame);
    };

    const stop = () => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    };

    recolor();
    if (init()) resize();
    else root.setAttribute("data-static", "");

    const detachLoss = onContextLoss(
      canvas,
      () => {
        releaseGL();
        root.removeAttribute("data-painted");
        root.setAttribute("data-static", "");
      },
      () => {
        if (disposed) return;
        if (init()) {
          root.removeAttribute("data-static");
          resize();
        }
      },
    );

    const sizer = new ResizeObserver(() => resize());
    sizer.observe(button);
    const watcher = new IntersectionObserver((entries) => {
      visible = Boolean(entries[entries.length - 1]?.isIntersecting);
      if (visible) {
        draw();
        if (S.holding || S.heat > 0 || S.flare > 0 || S.glow > 0) kickLoop();
      }
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (document.hidden) {
        // A hold the page takes away is let go, and the sizzle stops.
        if (S.holding) api.current?.cancel();
        stop();
      } else if (S.heat > 0 || S.flare > 0 || S.glow > 0) {
        kickLoop();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    api.current = {
      start: () => {
        const L = latest.current;
        if (L.disabled || S.fired || S.holding) return;
        S.holding = true;
        S.heatFrom = S.heat;
        S.holdFrom = now();
        lastPitch = -1;
        enter("heating");
        stopLoop();
        loop.current = activated()
          ? audioRef.current.start("sizzle", {
              pitch: r2(0.8 + S.heat * 0.9),
              gain: 0.35,
              pan: pan(),
            })
          : null;
        kickLoop();
      },
      release: () => {
        if (!S.holding) return;
        S.holding = false;
        stopLoop();
        if (S.heat > 0) {
          setSaid("Released early, not fired");
          enter("cooling");
        }
        kickLoop();
      },
      cancel: () => {
        if (!S.holding) return;
        S.holding = false;
        stopLoop();
        enter(S.heat > 0 ? "cooling" : "idle");
        kickLoop();
      },
      fireNow: () => {
        if (latest.current.disabled || S.fired) return;
        fire();
        kickLoop();
      },
      recolor: () => {
        recolor();
        draw();
      },
      refresh: () => {
        resize();
        draw();
        if (S.heat > 0 || S.flare > 0 || S.glow > 0) kickLoop();
      },
    };

    return () => {
      disposed = true;
      stop();
      window.clearTimeout(resetTimer);
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      detachLoss();
      releaseGL();
      root.removeAttribute("data-painted");
      root.removeAttribute("data-static");
      S.holding = false;
      api.current = null;
    };
    // The loop reads everything that changes through `latest` and
    // `audioRef`; the motion values and `enter` are stable for its life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new shimmer, motion setting, pixel ratio or ramp is drawn at once.
  React.useEffect(() => {
    api.current?.refresh();
  }, [shimmer, motionSafe, dpr, stopsKey]);

  React.useEffect(() => {
    if (disabled) api.current?.cancel();
  }, [disabled]);

  React.useEffect(
    () => () => {
      detach.current?.();
      detach.current = null;
      loop.current?.stop();
      loop.current = null;
    },
    [],
  );

  // A new theme or ramp changes the carriers' colours; their 1 ms colour
  // transition says when, and the uniforms are read again from them.
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

  const press = (source: "pointer" | "key") => {
    if (disabled || held.current || state === "fired") return;
    held.current = source;
    api.current?.start();
  };
  const letGo = (source: "pointer" | "key") => {
    if (held.current !== source) return;
    held.current = null;
    detach.current?.();
    detach.current = null;
    api.current?.release();
  };

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (held.current) return;
    const id = event.pointerId;
    const up = (e: PointerEvent) => {
      if (e.pointerId === id) letGo("pointer");
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    detach.current?.();
    detach.current = () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    press("pointer");
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === " " || event.key === "Enter") {
      // The press is ours: the native click would fire without the hold.
      event.preventDefault();
      if (!event.repeat) press("key");
      return;
    }
    if (event.key === "Escape" && held.current) {
      event.preventDefault();
      held.current = null;
      api.current?.cancel();
    }
  };

  const onKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      lastKey.current = now();
      letGo("key");
    }
  };

  const seconds = `${Number((Math.max(0, hold) / 1000).toFixed(1))} seconds`;
  const fired = state === "fired";
  const face = (
    <>
      <span
        aria-hidden
        className="flex size-4 shrink-0 items-center justify-center"
      >
        {fired ? (
          <Check className="size-4" />
        ) : (
          (icon ?? <Flame className="size-4" />)
        )}
      </span>
      <span className="min-w-0 truncate">{fired ? doneLabel : label}</span>
    </>
  );

  return (
    <div
      ref={rootRef}
      className={cn("group/heat-hold relative flex w-full", className)}
    >
      <motion.button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-describedby={hintId}
        onPointerDown={onPointerDown}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={() => {
          if (held.current === "key") letGo("key");
        }}
        onClick={(event) => {
          if (event.detail !== 0 || disabled) return;
          if (now() - lastKey.current < 300) return;
          api.current?.fireNow();
        }}
        className={cn(
          "relative isolate flex w-full min-w-0 cursor-pointer touch-manipulation items-center justify-center overflow-hidden rounded-3 border border-hairline-strong bg-card font-medium text-foreground outline-none select-none [-webkit-touch-callout:none]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "disabled:cursor-not-allowed disabled:opacity-50",
          s.text,
        )}
        style={{ height: s.height, scale: kick, boxShadow: shadow }}
      >
        <span aria-hidden className="pointer-events-none absolute inset-0">
          <motion.span
            className="absolute inset-x-0 bottom-0 transition-opacity duration-300 group-data-painted/heat-hold:opacity-0"
            style={{ height: standInHeight, backgroundImage: standIn }}
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 size-full opacity-0 transition-opacity duration-150 group-data-painted/heat-hold:opacity-100"
          />
          {stops.map((colour, i) => (
            <span
              key={i}
              ref={(node) => {
                carriers.current[i] = node;
              }}
              onTransitionEnd={onColors}
              className="absolute size-px opacity-0 transition-colors duration-1"
              style={{ color: colour }}
            />
          ))}
        </span>
        <span className="relative flex min-w-0 items-center justify-center gap-2 px-4">
          {face}
        </span>
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex min-w-0 items-center justify-center gap-2 px-4"
          style={{
            color: hotInk,
            maskImage: mask,
            WebkitMaskImage: mask,
          }}
        >
          {face}
        </motion.span>
      </motion.button>
      <span id={hintId} className="sr-only">
        {fired ? "Done" : `Hold for ${seconds}`}
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
