"use client";

import * as React from "react";

import {
  animate,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createFullscreenTriangle,
  createGL,
  createProgram,
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
  onContextLoss,
  resizeGL,
  uploadTexture,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type StaticFuzzElement = "p" | "h1" | "h2" | "h3" | "span" | "div";
export type StaticFuzzTrigger = "mount" | "inView" | "manual";

export type StaticFuzzProps = {
  /** The words, rendered as real text and drawn frayed over themselves. */
  text: string;
  /** The element the text lives in. @default "p" */
  as?: StaticFuzzElement;
  /** How far the rows tear, 0 (clean) to 1 (a weak station). @default 0.5 */
  intensity?: number;
  /** Rolling bands that pass through every ten seconds, 0 to 6. @default 2 */
  bands?: number;
  /** Radius of the steady disc the pointer carries, em; 0 leaves only `settle`. @default 2.5 */
  calm?: number;
  /** How far the whole line steadies while hovered, 0 to 1. Keyboard focus steadies it fully. @default 0.5 */
  settle?: number;
  /** Ink dropping out in speckle, 0 to 1. @default 0.35 */
  grain?: number;
  /** A faint echo trailing each row, as a reflected signal leaves, 0 to 1. @default 0.3 */
  ghost?: number;
  /** How fast the noise moves, 0.25 to 2. @default 1 */
  speed?: number;
  /** Ink colour, any CSS colour; resolved on the element so it follows the theme. @default "currentColor" */
  color?: string;
  /** Seed for the noise, so two lines never fray in step. @default 1 */
  seed?: number;
  /** When the signal comes in from full static. @default "inView" */
  trigger?: StaticFuzzTrigger;
  /** With `trigger="manual"`, the signal comes in when this turns true. @default true */
  active?: boolean;
  /** Come in once, or every time the line re-enters view. @default true */
  once?: boolean;
  /** Wait before the signal comes in, ms. @default 0 */
  delay?: number;
  /** The signal has come in and settled. */
  onComplete?: () => void;
  /** Hold the noise still. @default false */
  paused?: boolean;
  /** The pointer and focus steady the line. @default true */
  interactive?: boolean;
  /** Put the element in the tab order, so keyboard focus can steady it. @default false */
  focusable?: boolean;
  /** Device pixel ratio cap for the canvas. @default 2 */
  dpr?: number;
  /** Fires when hover or focus steadies the line (true) and when it frays again (false). */
  onCalmChange?: (calm: boolean) => void;
  className?: string;
};

/** Horizontal room either side of the words, em: torn rows stay inside the box. */
const GUTTER = 0.28;
/** Tear at full intensity, em. */
const REACH = 0.22;
/** Fields a second: the analog picture's own update rate. */
const FIELDS = 30;
/** Arrival: the signal starts this many times noisier than at rest. */
const STATIC = 2.6;
/** A rolling band crosses the line in this long, s at speed 1. */
const ROLL = 0.95;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

/** A small seeded generator: the same band rhythm for the same seed. */
function lcg(seed: number) {
  let s = (Math.imul(seed | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const FRAGMENT = `
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_text;
uniform vec2 u_size;
uniform float u_px;
uniform float u_em;
uniform float u_field;
uniform float u_time;
uniform float u_amp;
uniform vec4 u_bands;
uniform vec3 u_calm;
uniform float u_grain;
uniform float u_ghost;
uniform float u_seed;
uniform vec4 u_color;
${GLSL_NOISE}
float roll(float y, float c, float s) {
  if (s <= 0.0) return 0.0;
  float d = (y - c) / (u_em * 0.5);
  return s * exp(-d * d);
}
float ink(float x, float y) {
  return texture(u_text, vec2(x / u_size.x, y / u_size.y)).a;
}
void main() {
  vec2 p = v_uv * u_size;
  // One row per CSS pixel: coarse enough to read as scanlines, not grain.
  float row = floor(p.y / max(1.0, u_px));
  float hum = kx_noise(vec2(row * 0.035 + u_seed * 7.1, u_time * 0.7)) - 0.5;
  float jitter = kx_hash(vec2(row + u_seed * 13.0, u_field)) - 0.5;
  float torn = step(0.982, kx_hash(vec2(row * 0.37 + u_seed, floor(u_field / 4.0))));
  float band = roll(p.y, u_bands.x, u_bands.y) + roll(p.y, u_bands.z, u_bands.w);
  float calm = 1.0;
  if (u_calm.z > 0.5) {
    calm = smoothstep(u_calm.z * 0.5, u_calm.z, distance(p, u_calm.xy));
  }
  float amp = u_amp * calm;
  // Mostly hum, so rows bend together like a picture losing sync; the jitter
  // only frays the edges, and a torn row now and then snaps out alone.
  float tear = hum * 1.25 + jitter * 0.3 + torn * jitter * 2.6 + band * (0.8 + jitter);
  float x = p.x - tear * amp * u_em * ${REACH.toFixed(2)};
  float a = ink(x, p.y);
  // Inside a band the picture smears a little sideways.
  float smear = band * amp;
  if (smear > 0.01) a = max(a, ink(x - u_em * 0.06 * smear, p.y) * 0.85);
  // The echo of a reflected signal, a hair to the right and faint.
  float echo = ink(x - u_em * 0.075, p.y) * u_ghost * 0.34 * clamp(amp * 1.6, 0.0, 1.0);
  a = max(a, echo);
  // Speckle: ink drops out where the signal is weakest.
  float n = kx_hash(floor(p / max(1.0, u_px)) + vec2(u_field * 1.37, u_seed * 3.3));
  a *= 1.0 - u_grain * clamp(amp * 1.4, 0.0, 1.0) * smoothstep(0.5, 1.0, n) * 0.85;
  outColor = vec4(u_color.rgb * a, a) * u_color.a;
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  texture: WebGLTexture | null;
  lost: boolean;
};

type Raster = {
  /** Backing size, px. */
  width: number;
  height: number;
  dpr: number;
  /** Backing px per em. */
  em: number;
};

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type Api = {
  draw: () => void;
  kick: () => void;
  raster: () => void;
  readColour: () => void;
  arrive: () => void;
  focus: (near: boolean) => void;
  tick: (now: number) => void;
  retarget: () => void;
};

/**
 * Type received over a weak analog signal. The words are real DOM text — they
 * wrap, select and copy — and once a WebGL2 canvas is live over them they turn
 * transparent and the canvas draws them frayed: rasterised from their own
 * laid-out word boxes, then every pixel row displaced sideways by a slow hum
 * that leans whole bands of type together, a fresh jitter per row each field
 * (30 a second, as an analog picture updates), the odd torn row, and rolling
 * bands that pass down through the words at seeded moments. A faint echo
 * trails the rows and ink drops out in speckle. Monochrome, in the text's own
 * colour: soft fuzz, not a glitch.
 *
 * Hover steadies it. The pointer carries a calm disc that opens on
 * springs.snap — the rows lock into register outward from the pointer, one
 * crisp overshoot — while the whole line settles by `settle` on springs.drift;
 * keyboard focus on, in or around the element steadies it completely. Leaving
 * closes the disc on an exit tween and sends a band rolling through as the
 * signal frays again. On arrival the signal comes in from full static on
 * springs.drift. Under reduced motion the frame is still: frozen mild fuzz that
 * cross-fades to crisp under hover or focus. Without WebGL2 the plain text
 * shows with a faint echo; on context loss it shows until the context returns.
 */
export function StaticFuzz({
  text,
  as: Tag = "p",
  intensity = 0.5,
  bands = 2,
  calm = 2.5,
  settle = 0.5,
  grain = 0.35,
  ghost = 0.3,
  speed = 1,
  color = "currentColor",
  seed = 1,
  trigger = "inView",
  active = true,
  once = true,
  delay = 0,
  onComplete,
  paused = false,
  interactive = true,
  focusable = false,
  dpr = 2,
  onCalmChange,
  className,
}: StaticFuzzProps) {
  const motionSafe = useMotionSafe();
  const [live, setLive] = React.useState(false);
  const [fallback, setFallback] = React.useState(false);
  const [onScreen, setOnScreen] = React.useState(false);
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const running = onScreen && !hidden;

  const arrival = useMotionValue(STATIC);
  const steady = useMotionValue(0);
  const disc = useMotionValue(0);

  const rootRef = React.useRef<HTMLElement | null>(null);
  const textRef = React.useRef<HTMLSpanElement | null>(null);
  const carrierRef = React.useRef<HTMLSpanElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const gpu = React.useRef<Gpu | null>(null);
  const raster = React.useRef<Raster | null>(null);
  const paper = React.useRef<HTMLCanvasElement | null>(null);
  const colour = React.useRef<[number, number, number, number]>([0, 0, 0, 1]);
  const reader = React.useRef<CanvasRenderingContext2D | null>(null);
  const frame = React.useRef(0);
  const clock = React.useRef({ t: 0, last: 0, field: -1 });
  /** Rolling bands: when each of the last few began, s of noise time. */
  const roller = React.useRef({
    rand: lcg(seed),
    next: 0,
    starts: new Float64Array([-1e9, -1e9, -1e9]),
    count: 0,
  });
  /** The uniforms, kept and refilled each draw rather than rebuilt. */
  const uniforms = React.useRef({
    u_size: new Float32Array(2),
    u_px: 1,
    u_em: 16,
    u_field: 0,
    u_time: 0,
    u_amp: 0,
    u_bands: new Float32Array(4),
    u_calm: new Float32Array(3),
    u_grain: 0,
    u_ghost: 0,
    u_seed: 0,
    u_color: new Float32Array([0, 0, 0, 1]),
  });
  const pointer = React.useRef({ x: 0, y: 0, dirty: false });
  /** What is steadying the line: the pointer over it, focus near it. */
  const calmBy = React.useRef({ over: false, focus: false, calm: false });
  const runs = React.useRef<{
    arrival: AnimationPlaybackControls | null;
    steady: AnimationPlaybackControls | null;
    disc: AnimationPlaybackControls | null;
  }>({ arrival: null, steady: null, disc: null });
  const arrived = React.useRef(false);
  const api = React.useRef<Api | null>(null);
  const report = React.useRef({ onComplete, onCalmChange });
  /** Every frame goes through the latest render's tick, never a stale one. */
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  const k = {
    intensity: clamp01(intensity),
    bands: clamp(bands, 0, 6),
    calm: Math.max(0, calm),
    settle: clamp01(settle),
    grain: clamp01(grain),
    ghost: clamp01(ghost),
    speed: clamp(speed, 0.25, 2),
    seed,
    dpr: clamp(dpr, 0.5, 2),
  };

  /** Any CSS colour as straight sRGB bytes, by painting one pixel. */
  const readColour = () => {
    const carrier = carrierRef.current;
    if (!carrier) return;
    if (!reader.current) {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      reader.current = c.getContext("2d", { willReadFrequently: true });
    }
    const ctx = reader.current;
    if (!ctx) return;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = getComputedStyle(carrier).color;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    colour.current = [
      (d[0] ?? 0) / 255,
      (d[1] ?? 0) / 255,
      (d[2] ?? 0) / 255,
      (d[3] ?? 255) / 255,
    ];
  };

  /**
   * The words into an alpha mask, from their own layout: one Range rect per
   * word, so wrapping, alignment, letter spacing and the inherited font are
   * exactly the page's.
   */
  const rasterise = () => {
    const root = rootRef.current;
    const span = textRef.current;
    const canvas = canvasRef.current;
    const g = gpu.current;
    const node = span?.firstChild;
    if (!root || !span || !canvas || !g || g.lost) return;
    const size = resizeGL(g.gl, canvas, { dprCap: k.dpr });
    const style = getComputedStyle(span);
    const fontPx = parseFloat(style.fontSize) || 16;
    raster.current = {
      width: size.width,
      height: size.height,
      dpr: size.dpr,
      em: fontPx * size.dpr,
    };
    if (!paper.current) paper.current = document.createElement("canvas");
    const sheet = paper.current;
    sheet.width = size.width;
    sheet.height = size.height;
    // A CPU-backed sheet: uploading it to the texture never waits on a GPU
    // read-back.
    const ctx = sheet.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.clearRect(0, 0, sheet.width, sheet.height);
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const spaced = ctx as CanvasRenderingContext2D & {
      letterSpacing?: string;
      fontStretch?: string;
    };
    if ("letterSpacing" in spaced) spaced.letterSpacing = style.letterSpacing;
    ctx.direction = style.direction === "rtl" ? "rtl" : "ltr";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "white";
    const metrics = ctx.measureText("Hg");
    const ascent = metrics.fontBoundingBoxAscent || fontPx * 0.8;
    const descent = metrics.fontBoundingBoxDescent || fontPx * 0.2;
    const box = root.getBoundingClientRect();
    const ox = box.left + root.clientLeft;
    const oy = box.top + root.clientTop;
    if (node && node.nodeType === Node.TEXT_NODE) {
      const range = document.createRange();
      const content = node.textContent ?? "";
      for (const m of content.matchAll(/\S+/g)) {
        const start = m.index ?? 0;
        range.setStart(node, start);
        range.setEnd(node, start + m[0].length);
        const rects = range.getClientRects();
        const draw = (word: string, r: DOMRect) => {
          const baseline = r.top + (r.height * ascent) / (ascent + descent);
          ctx.textAlign = ctx.direction === "rtl" ? "right" : "left";
          ctx.fillText(
            word,
            (ctx.direction === "rtl" ? r.right : r.left) - ox,
            baseline - oy,
          );
        };
        const first = rects[0];
        if (rects.length === 1 && first) {
          draw(m[0], first);
          continue;
        }
        // A word broken across lines: placed letter by letter instead.
        for (let i = 0; i < m[0].length; i += 1) {
          range.setStart(node, start + i);
          range.setEnd(node, start + i + 1);
          const r = range.getClientRects()[0];
          if (r) draw(m[0].charAt(i), r);
        }
      }
      range.detach?.();
    }
    g.texture = uploadTexture(g.gl, sheet, { linear: true }, g.texture);
  };

  /** One frame from the motion values as they stand. */
  const draw = () => {
    const g = gpu.current;
    const r = raster.current;
    if (!g || g.lost || !r || !g.texture) return;
    const c = clock.current;
    const u = uniforms.current;
    // Bands roll top to bottom across the box, in backing px: the two most
    // recent still crossing it.
    const span = r.height + r.em * 1.2;
    u.u_bands[0] = -1e4;
    u.u_bands[1] = 0;
    u.u_bands[2] = -1e4;
    u.u_bands[3] = 0;
    if (motionSafe) {
      const roll = roller.current;
      let slot = 0;
      for (let back = 1; back <= 3 && slot < 2; back += 1) {
        const at = roll.starts[(roll.count - back + 3) % 3] ?? -1e9;
        const t = (c.t - at) / ROLL;
        if (t >= 1) continue;
        u.u_bands[slot * 2] = t * span - r.em * 0.6;
        u.u_bands[slot * 2 + 1] = Math.min(1, t * 6, (1 - t) * 6);
        slot += 1;
      }
    }
    const p = pointer.current;
    u.u_size[0] = r.width;
    u.u_size[1] = r.height;
    u.u_px = r.dpr;
    u.u_em = r.em;
    u.u_field = c.field;
    u.u_time = c.t;
    u.u_amp =
      k.intensity *
      arrival.get() *
      (1 - clamp01(steady.get())) *
      (paused || !motionSafe ? 0.7 : 1);
    u.u_calm[0] = p.x * r.dpr;
    u.u_calm[1] = p.y * r.dpr;
    u.u_calm[2] = disc.get() * r.em;
    u.u_grain = k.grain;
    u.u_ghost = k.ghost;
    u.u_seed = (k.seed % 97) + 0.5;
    u.u_color.set(colour.current);
    g.program.use();
    g.program.texture("u_text", g.texture, 0);
    g.program.set(u);
    g.gl.viewport(0, 0, r.width, r.height);
    g.gl.clearColor(0, 0, 0, 0);
    g.gl.clear(g.gl.COLOR_BUFFER_BIT);
    g.tri.draw();
    p.dirty = false;
  };

  /** A band starts rolling at noise time `at`. */
  const band = (at: number) => {
    const roll = roller.current;
    roll.starts[roll.count % 3] = at;
    roll.count += 1;
  };

  const rolling = () => {
    const roll = roller.current;
    const t = clock.current.t;
    for (let i = 0; i < 3; i += 1) {
      const since = t - (roll.starts[i] ?? -1e9);
      if (since < ROLL && since > -1) return true;
    }
    return false;
  };

  const animating = () =>
    arrival.isAnimating() || steady.isAnimating() || disc.isAnimating();

  /** Whether the noise itself is moving: nothing to animate when it is held, steady or clean. */
  const restless = () =>
    motionSafe &&
    !paused &&
    k.intensity > 0 &&
    arrival.get() * (1 - steady.get()) > 0.001;

  const tick = (now: number) => {
    frame.current = 0;
    if (!running) return;
    const c = clock.current;
    const dt = c.last ? Math.min(0.1, (now - c.last) / 1000) : 0;
    c.last = now;
    let changed = pointer.current.dirty || animating();
    if (restless()) {
      c.t += dt * k.speed;
      const field = Math.floor(c.t * FIELDS);
      if (field !== c.field) {
        c.field = field;
        changed = true;
      }
      // Bands at random, memoryless intervals: on average `bands` every ten seconds.
      const roll = roller.current;
      if (k.bands > 0 && c.t >= roll.next) {
        band(c.t);
        roll.next = c.t + (-Math.log(1 - roll.rand() * 0.98) * 10) / k.bands;
      }
      // A band in flight moves every frame, not every field.
      if (rolling()) changed = true;
    }
    if (changed) draw();
    if (restless() || animating()) {
      frame.current = window.requestAnimationFrame(loop);
    } else {
      c.last = 0;
    }
  };

  const kick = () => {
    if (frame.current || !running) return;
    clock.current.last = 0;
    frame.current = window.requestAnimationFrame(loop);
  };

  /**
   * The line's steadiness follows what is calming it. Focus steadies all of
   * it; the pointer steadies `settle` of it and opens the calm disc around
   * itself on springs.snap — the lock-in — and the disc closes on an exit
   * tween. Under reduced motion it is a cross-fade of the whole line.
   */
  const retarget = () => {
    const by = calmBy.current;
    const next = by.over || by.focus;
    const r = runs.current;
    r.steady?.stop();
    r.disc?.stop();
    if (!motionSafe) {
      r.steady = animate(steady, next ? 1 : 0, {
        duration: durations.slow,
        ease: easings.enter,
      });
      disc.jump(0);
    } else {
      r.steady = animate(
        steady,
        by.focus ? 1 : by.over ? k.settle : 0,
        springs.drift,
      );
      const to = by.over ? k.calm : 0;
      r.disc = animate(
        disc,
        to,
        to > disc.get()
          ? springs.snap
          : { duration: durations.base, ease: easings.exit },
      );
      // The signal slips as it is let go: a band rolls through.
      if (by.calm && !next) band(clock.current.t);
    }
    kick();
    if (by.calm !== next) {
      by.calm = next;
      report.current.onCalmChange?.(next);
    }
  };

  /** The signal comes in: from full static to rest. */
  const arrive = () => {
    const delayS = Math.max(0, delay) / 1000;
    const done = () => report.current.onComplete?.();
    runs.current.arrival?.stop();
    arrival.jump(STATIC);
    runs.current.arrival = motionSafe
      ? animate(arrival, 1, {
          ...springs.drift,
          delay: delayS,
          onComplete: done,
        })
      : animate(arrival, 1, {
          duration: durations.page,
          ease: easings.enter,
          delay: delayS,
          onComplete: done,
        });
    if (motionSafe) band(clock.current.t + delayS * k.speed);
    kick();
  };

  const focus = (near: boolean) => {
    if (calmBy.current.focus === near) return;
    calmBy.current.focus = near;
    retarget();
  };

  React.useLayoutEffect(() => {
    api.current = {
      draw,
      kick,
      raster: rasterise,
      readColour,
      arrive,
      focus,
      tick,
      retarget,
    };
    report.current = { onComplete, onCalmChange };
  });

  // The GPU side, bound to the canvas: built, and rebuilt after a lost
  // context; torn down with the component. Re-running under StrictMode builds
  // it twice on the same context, which the browser hands back unchanged.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const build = (): boolean => {
      const gl = createGL(canvas, { alpha: true, premultipliedAlpha: true });
      if (!gl) return false;
      const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
      if (!program) return false;
      const tri = createFullscreenTriangle(gl, program);
      gpu.current = { gl, program, tri, texture: null, lost: false };
      api.current?.readColour();
      api.current?.raster();
      api.current?.draw();
      return true;
    };
    const teardown = () => {
      const g = gpu.current;
      gpu.current = null;
      if (!g) return;
      if (!g.lost) {
        if (g.texture) g.gl.deleteTexture(g.texture);
        g.tri.dispose();
        g.program.dispose();
      }
    };
    if (!build()) {
      setFallback(true);
      return;
    }
    setLive(true);
    const detach = onContextLoss(
      canvas,
      () => {
        if (gpu.current) gpu.current.lost = true;
        setLive(false);
      },
      () => {
        gpu.current = null;
        if (build()) setLive(true);
      },
    );
    return () => {
      detach();
      teardown();
    };
  }, []);

  // Anything that changes the words' layout re-rasterises them.
  React.useLayoutEffect(() => {
    api.current?.raster();
    api.current?.draw();
  }, [text, k.dpr]);

  React.useEffect(() => {
    api.current?.readColour();
    api.current?.draw();
  }, [color]);

  // Knobs and states that change the picture: draw it, and run if it moves.
  React.useEffect(() => {
    api.current?.draw();
    api.current?.kick();
  }, [
    running,
    paused,
    motionSafe,
    k.intensity,
    k.grain,
    k.ghost,
    k.seed,
    k.speed,
    k.bands,
  ]);

  React.useEffect(() => {
    roller.current.rand = lcg(seed);
    roller.current.next = 0;
  }, [seed]);

  // New calm knobs reach a line that is already steadied.
  React.useEffect(() => {
    if (calmBy.current.calm) api.current?.retarget();
  }, [k.calm, k.settle]);

  // The arrival: once in view (or on mount, or when switched on), and again
  // on each return when `once` is off.
  const ready =
    trigger === "manual" ? active : trigger === "mount" ? true : onScreen;
  React.useEffect(() => {
    if (!ready) {
      if (!once) arrived.current = false;
      return;
    }
    if (arrived.current) return;
    arrived.current = true;
    api.current?.arrive();
  }, [ready, once]);

  React.useEffect(() => {
    const loop = frame;
    const anims = runs;
    return () => {
      if (loop.current) window.cancelAnimationFrame(loop.current);
      loop.current = 0;
      const r = anims.current;
      r.arrival?.stop();
      r.steady?.stop();
      r.disc?.stop();
    };
  }, []);

  // A theme or colour change shows up as the carrier's 1ms colour transition.
  const onColour = () => {
    api.current?.readColour();
    api.current?.draw();
  };

  // Keyboard focus on the element, inside it, or on a link or button around
  // it steadies the whole line.
  React.useEffect(() => {
    if (!interactive) return;
    const check = () => {
      const root = rootRef.current;
      const el = document.activeElement;
      api.current?.focus(
        !!root &&
          !!el &&
          el !== document.body &&
          (root.contains(el) || el.contains(root)) &&
          el.matches(":focus-visible"),
      );
    };
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", check);
    return () => {
      document.removeEventListener("focusin", check);
      document.removeEventListener("focusout", check);
      api.current?.focus(false);
    };
  }, [interactive]);

  const bindRoot = React.useCallback((node: HTMLElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      api.current?.raster();
      api.current?.draw();
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    const fonts = document.fonts;
    const refont = () => {
      api.current?.raster();
      api.current?.draw();
    };
    void fonts?.ready.then(refont);
    fonts?.addEventListener?.("loadingdone", refont);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      fonts?.removeEventListener?.("loadingdone", refont);
    };
  }, []);

  const local = (event: React.PointerEvent<HTMLElement>) => {
    const r = event.currentTarget.getBoundingClientRect();
    const p = pointer.current;
    p.x = event.clientX - r.left - event.currentTarget.clientLeft;
    p.y = event.clientY - r.top - event.currentTarget.clientTop;
    p.dirty = true;
  };

  const enter = (event: React.PointerEvent<HTMLElement>) => {
    if (!interactive) return;
    local(event);
    calmBy.current.over = true;
    retarget();
  };

  const leave = () => {
    if (!calmBy.current.over) return;
    calmBy.current.over = false;
    retarget();
  };

  const shown = live && !fallback;

  return (
    <Tag
      ref={bindRoot as React.Ref<never>}
      tabIndex={focusable ? 0 : undefined}
      onPointerEnter={(event: React.PointerEvent<HTMLElement>) => {
        if (event.pointerType !== "touch") enter(event);
      }}
      onPointerMove={(event: React.PointerEvent<HTMLElement>) => {
        if (!calmBy.current.over) return;
        local(event);
        kick();
      }}
      onPointerLeave={(event: React.PointerEvent<HTMLElement>) => {
        if (event.pointerType !== "touch") leave();
      }}
      onPointerDown={(event: React.PointerEvent<HTMLElement>) => {
        // Touch has no hover: a finger on the words steadies them.
        if (event.pointerType === "touch") enter(event);
      }}
      onPointerUp={(event: React.PointerEvent<HTMLElement>) => {
        if (event.pointerType === "touch") leave();
      }}
      onPointerCancel={(event: React.PointerEvent<HTMLElement>) => {
        if (event.pointerType === "touch") leave();
      }}
      className={cn(
        "relative",
        Tag === "span" ? "inline-block" : "block",
        focusable &&
          "rounded-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
      style={{ paddingInline: `${GUTTER}em` }}
    >
      <span
        ref={textRef}
        className={cn(shown && "text-transparent")}
        style={
          fallback
            ? {
                textShadow:
                  "0.06em 0 0 color-mix(in oklab, currentColor 26%, transparent)",
              }
            : undefined
        }
      >
        {text}
      </span>
      <canvas
        ref={canvasRef}
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 size-full",
          !shown && "invisible",
        )}
      />
      <span
        ref={carrierRef}
        aria-hidden
        onTransitionEnd={onColour}
        className="pointer-events-none absolute size-0 overflow-hidden transition-colors duration-1"
        style={{ color }}
      />
    </Tag>
  );
}
