"use client";

import * as React from "react";

import { Glasses } from "lucide-react";
import { motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createFullscreenTriangle,
  createGL,
  createProgram,
  FULLSCREEN_VERTEX,
  onContextLoss,
  uploadTexture,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type AnaglyphChannels =
  "red-cyan" | "red-blue" | "green-magenta" | "amber-blue";

export type AnaglyphCardProps = {
  /** The caption under the picture. */
  children?: React.ReactNode;
  /** A picture of your own (same origin, or served with CORS). @default a lake at dusk, drawn in code */
  src?: string;
  /** Its depth map: white is near, black is far. Without one, depth runs from far at the top to near at the bottom. */
  depthSrc?: string;
  /** What the picture shows, for assistive technology. @default "A lake below pine ridges at dusk" */
  alt?: string;
  /** How far the channels part at full tilt, 0 to 1. @default 0.6 */
  depth?: number;
  /** How far the card leans toward the pointer, 0 (flat) to 1. @default 0.5 */
  tilt?: number;
  /** The two filter colours. @default "red-cyan" */
  channels?: AnaglyphChannels;
  /** Two filter colours of your own, left eye then right, any CSS colours; overrides `channels`. */
  channelColors?: [string, string];
  /** How far near and far slide against each other as you tilt, 0 to 1. @default 0.5 */
  parallax?: number;
  /** The depth that stays put while the rest slides, 0 (far) to 1 (near). @default 0.35 */
  convergence?: number;
  /** Controlled glasses mode: the colours folded back into one, only parallax left. */
  pressed?: boolean;
  /** Initial glasses mode when uncontrolled. @default false */
  defaultPressed?: boolean;
  /** Fires from the press or key that toggled glasses mode, with the new state. */
  onPressedChange?: (pressed: boolean) => void;
  /** A soft glare that slides across the glass as it leans. @default true */
  glare?: boolean;
  /** Lean once when the card first comes into view, so its depth shows before anyone touches it. @default true */
  preview?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The toggle's accessible name. @default "Glasses mode" */
  label?: string;
  /** Shows the picture but takes no input. @default false */
  disabled?: boolean;
  /** Sizes the card. @default "w-full max-w-72" */
  className?: string;
};

const CHANNELS: Record<AnaglyphChannels, [string, string]> = {
  // Filter colours are optics, not theme: they stay pure on every page.
  "red-cyan": ["rgb(255 0 0)", "rgb(0 255 255)"],
  "red-blue": ["rgb(255 0 0)", "rgb(0 0 255)"],
  "green-magenta": ["rgb(0 255 0)", "rgb(255 0 255)"],
  "amber-blue": ["rgb(255 191 0)", "rgb(0 0 255)"],
};

/** The drawn picture's palette: a dusk that reads the same on any page. */
const SCENE = [
  "color-mix(in oklab, var(--accent) 62%, black)",
  "oklch(from var(--warn) 0.84 0.09 calc(h - 20))",
  "oklch(from var(--warn) 0.93 0.1 h)",
  "oklch(from var(--accent-bright) 0.6 0.07 calc(h + 20))",
  "oklch(from var(--accent) 0.4 0.08 calc(h - 30))",
  "oklch(from var(--success) 0.3 0.05 calc(h + 20))",
  "oklch(from var(--success) 0.2 0.04 h)",
];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

type RGB = [number, number, number];

function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): RGB => {
    if (!ctx) return [1, 0, 0];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [(d[0] ?? 0) / 255, (d[1] ?? 0) / 255, (d[2] ?? 0) / 255];
  };
}

const css = (c: RGB, a = 1) =>
  `rgb(${Math.round(c[0] * 255)} ${Math.round(c[1] * 255)} ${Math.round(c[2] * 255)} / ${a})`;
const grey = (d: number) => {
  const v = Math.round(clamp01(d) * 255);
  return `rgb(${v} ${v} ${v})`;
};

function lcg(seed: number) {
  let s = (Math.imul(seed | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Draws the default picture and its depth map side by side: every shape is
 * painted twice, once in colour and once in the grey of its depth, so the
 * map always matches the picture exactly.
 */
function drawScene(
  img: CanvasRenderingContext2D,
  dep: CanvasRenderingContext2D,
  W: number,
  H: number,
  p: RGB[],
) {
  const [skyTop, skyLow, sun, far, mid, pine, near] = p as [
    RGB,
    RGB,
    RGB,
    RGB,
    RGB,
    RGB,
    RGB,
  ];
  const r = lcg(41);
  const both = (
    depth: number,
    fill: string | CanvasGradient,
    path: (c: CanvasRenderingContext2D) => void,
  ) => {
    img.fillStyle = fill;
    img.beginPath();
    path(img);
    img.fill();
    dep.fillStyle = grey(depth);
    dep.beginPath();
    path(dep);
    dep.fill();
  };
  // Sky, far.
  const sky = img.createLinearGradient(0, 0, 0, H * 0.62);
  sky.addColorStop(0, css(skyTop));
  sky.addColorStop(1, css(skyLow));
  img.fillStyle = sky;
  img.fillRect(0, 0, W, H);
  dep.fillStyle = grey(0);
  dep.fillRect(0, 0, W, H);
  // A low sun with its glow.
  const sx = W * 0.66;
  const sy = H * 0.47;
  const halo = img.createRadialGradient(sx, sy, 0, sx, sy, H * 0.4);
  halo.addColorStop(0, css(sun, 0.7));
  halo.addColorStop(1, css(sun, 0));
  img.fillStyle = halo;
  img.fillRect(0, 0, W, H);
  both(0.04, css(sun), (c) => c.arc(sx, sy, H * 0.07, 0, Math.PI * 2));
  // Two ranges, far and hazy, then nearer and darker.
  const ridge = (
    base: number,
    amp: number,
    rough: number,
    depth: number,
    colour: RGB,
  ) => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 40; i += 1) {
      const x = (i / 40) * W;
      const y =
        H * base -
        H * amp * (0.5 + 0.5 * Math.sin(i * 0.37 + depth * 9)) -
        H * rough * r();
      pts.push([x, y]);
    }
    both(depth, css(colour), (c) => {
      c.moveTo(0, H);
      for (const [x, y] of pts) c.lineTo(x, y);
      c.lineTo(W, H);
      c.closePath();
    });
  };
  ridge(0.56, 0.14, 0.02, 0.14, far);
  ridge(0.62, 0.08, 0.035, 0.32, mid);
  // The lake: the sky turned over, its depth running from the far shore to
  // the near one.
  const lakeTop = H * 0.62;
  const water = img.createLinearGradient(0, lakeTop, 0, H);
  water.addColorStop(0, css(skyLow));
  water.addColorStop(1, css(skyTop));
  img.fillStyle = water;
  img.fillRect(0, lakeTop, W, H - lakeTop);
  const lakeDepth = dep.createLinearGradient(0, lakeTop, 0, H);
  lakeDepth.addColorStop(0, grey(0.36));
  lakeDepth.addColorStop(1, grey(0.86));
  dep.fillStyle = lakeDepth;
  dep.fillRect(0, lakeTop, W, H - lakeTop);
  // The sun's road across the water.
  for (let i = 0; i < 18; i += 1) {
    const y = lakeTop + 3 + i * ((H - lakeTop) / 18);
    const w = (6 + r() * 16) * (1 + i * 0.08);
    img.fillStyle = css(sun, 0.5 - i * 0.022);
    img.fillRect(sx - w / 2 + (r() - 0.5) * 8, y, w, 1.2);
  }
  // Near pines on the right, standing in the water's edge.
  const pines: [number, number, number][] = [
    [0.78, 0.2, 0.09],
    [0.88, 0.12, 0.11],
    [0.96, 0.24, 0.1],
    [0.71, 0.36, 0.07],
  ];
  for (const [px, top, half] of pines) {
    const x = W * px;
    const t = H * top;
    const w = W * half;
    both(0.78, css(pine), (c) => {
      c.moveTo(x, t);
      for (let k = 1; k <= 5; k += 1) {
        const y = t + ((H - t) * k) / 5.4;
        const spread = (w * k) / 5;
        c.lineTo(x + spread, y);
        c.lineTo(x + spread * 0.45, y - 2);
      }
      c.lineTo(x + w * 0.1, H);
      c.lineTo(x - w * 0.1, H);
      for (let k = 5; k >= 1; k -= 1) {
        const y = t + ((H - t) * k) / 5.4;
        const spread = (w * k) / 5;
        c.lineTo(x - spread * 0.45, y - 2);
        c.lineTo(x - spread, y);
      }
      c.closePath();
    });
  }
  // A rock and reeds in the foreground, nearest of all.
  both(0.93, css(near), (c) => {
    c.ellipse(W * 0.2, H * 1.02, W * 0.17, H * 0.13, 0, 0, Math.PI * 2);
  });
  for (let i = 0; i < 26; i += 1) {
    const x = W * (0.02 + r() * 0.36);
    const h = H * (0.18 + r() * 0.26);
    const lean = (r() - 0.4) * W * 0.05;
    const w = 1 + r() * 1.6;
    both(1, css(near), (c) => {
      c.moveTo(x - w, H);
      c.quadraticCurveTo(x + lean * 0.3, H - h * 0.6, x + lean, H - h);
      c.quadraticCurveTo(x + lean * 0.3 + w, H - h * 0.6, x + w, H);
      c.closePath();
    });
  }
}

const FRAGMENT = `
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_img;
uniform sampler2D u_depth;
uniform vec2 u_par;
uniform vec2 u_sep;
uniform float u_conv;
uniform vec3 u_left;
uniform vec3 u_right;
uniform vec2 u_aspect;

// Where to sample so a point at its own depth lands here: a short fixed-point
// search, so the shift follows the depth of what it finds, not of the pixel
// it started from, and edges do not smear.
vec2 view(vec2 uv, vec2 par, vec2 sep) {
  vec2 s = uv;
  for (int i = 0; i < 5; i++) {
    float d = texture(u_depth, s).r;
    s = uv - (par * (d - u_conv) + sep * d) * u_aspect;
  }
  return clamp(s, vec2(0.002), vec2(0.998));
}

void main() {
  // A touch of zoom keeps every shifted sample inside the picture.
  vec2 uv = 0.5 + (v_uv - 0.5) / 1.06;
  vec3 left = texture(u_img, view(uv, u_par, u_sep)).rgb;
  vec3 right = texture(u_img, view(uv, u_par, -u_sep)).rgb;
  vec3 centre = texture(u_img, view(uv, u_par, vec2(0.0))).rgb;
  // Whatever neither filter covers comes from the centred view, so at rest
  // the picture is exactly itself whichever pair is chosen.
  vec3 rest = max(vec3(0.0), vec3(1.0) - u_left - u_right);
  o = vec4(left * u_left + right * u_right + centre * rest, 1.0);
}
`;

type GPU = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  img: WebGLTexture | null;
  depth: WebGLTexture | null;
  lost: boolean;
};

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * An image card split into two colour channels by a depth map. One WebGL2
 * pass samples the picture twice — a left view and a right view — each
 * shifted along the tilt by its depth, with a short search so edges hold;
 * the left feeds the first filter colour and the right the second. At rest
 * the channels sit together and the picture is itself. Lean in with the
 * pointer and they part in proportion to depth — the near reeds fringe the
 * most, the far sky not at all — while near and far slide against each
 * other and the card leans a few degrees under a soft glare. The tilt
 * follows on the glide spring's constants and returns on drift's.
 *
 * A press toggles glasses mode: the split folds shut on springs.snap, one
 * crisp overshoot, and only the parallax remains. It is a real toggle button
 * (`aria-pressed`): Enter or Space toggles, arrow keys hold a tilt so the
 * split can be seen without a pointer, Escape and Home level the card. The
 * picture draws only while something moves and the card is on screen.
 * Without WebGL2 the drawn picture stays, still; under reduced motion there
 * is no lean or glare travel, and the split follows the tilt with a short
 * fade.
 */
export function AnaglyphCard({
  children,
  src,
  depthSrc,
  alt = "A lake below pine ridges at dusk",
  depth = 0.6,
  tilt = 0.5,
  channels = "red-cyan",
  channelColors,
  parallax = 0.5,
  convergence = 0.35,
  pressed,
  defaultPressed = false,
  onPressedChange,
  glare = true,
  preview = true,
  dpr = 2,
  label = "Glasses mode",
  disabled = false,
  className,
}: AnaglyphCardProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const altId = React.useId();
  const [own, setOwn] = React.useState(defaultPressed);
  const isOn = pressed ?? own;
  const filters = channelColors ?? CHANNELS[channels] ?? CHANNELS["red-cyan"];

  const frameRef = React.useRef<HTMLButtonElement | null>(null);
  const glRef = React.useRef<HTMLCanvasElement | null>(null);
  const stillRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const gpu = React.useRef<GPU | null>(null);
  const loop = React.useRef(0);
  const last = React.useRef(0);
  const visible = React.useRef(false);
  // The lean: where the pointer asks for, where it is, how fast it moves.
  const target = React.useRef({ x: 0, y: 0, home: false });
  const state = React.useRef({ x: 0, y: 0, vx: 0, vy: 0, fold: 0, fv: 0 });
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const glareX = useTransform(rotateY, (v) => `${(50 - v * 6).toFixed(2)}%`);
  const glareY = useTransform(rotateX, (v) => `${(40 + v * 6).toFixed(2)}%`);
  const glareImage = useTransform(
    [glareX, glareY],
    ([x, y]) =>
      `radial-gradient(circle at ${String(x)} ${String(y)}, rgb(255 255 255 / 0.32), transparent 55%)`,
  );
  const settings = React.useRef({
    depth,
    tilt,
    parallax,
    convergence,
    motionSafe,
    isOn,
    preview,
  });
  const colours = React.useRef<{ left: RGB; right: RGB }>({
    left: [1, 0, 0],
    right: [0, 1, 1],
  });
  const api = React.useRef<{
    build: () => void;
    draw: () => void;
    kick: () => void;
  } | null>(null);

  React.useEffect(() => {
    settings.current = {
      depth,
      tilt,
      parallax,
      convergence,
      motionSafe,
      isOn,
      preview,
    };
    api.current?.kick();
  });

  // The picture, its depth map, and the GPU that turns them into a stereo pair.
  React.useEffect(() => {
    const frame = frameRef.current;
    const canvas = glRef.current;
    const still = stillRef.current;
    const carriers = carriersRef.current;
    if (!frame || !canvas || !still || !carriers) return;
    const read = rgbReader();
    let disposed = false;
    let picture: HTMLCanvasElement | null = null;
    let map: HTMLCanvasElement | null = null;
    let own: { img: HTMLImageElement | null; depth: HTMLImageElement | null } =
      {
        img: null,
        depth: null,
      };
    let W = 0;
    let H = 0;
    let ratio = 1;

    const paintPicture = () => {
      W = Math.max(1, frame.clientWidth);
      H = Math.max(1, frame.clientHeight);
      ratio = Math.min(window.devicePixelRatio || 1, clamp(dpr, 0.5, 2));
      const pw = Math.round(W * ratio);
      const ph = Math.round(H * ratio);
      picture = document.createElement("canvas");
      map = document.createElement("canvas");
      picture.width = pw;
      picture.height = ph;
      map.width = pw;
      map.height = ph;
      const ic = picture.getContext("2d");
      const dc = map.getContext("2d");
      if (!ic || !dc) return;
      const kids = carriers.children;
      const tone = (i: number): RGB => {
        const el = kids[i];
        return el ? read(getComputedStyle(el).color) : [0.5, 0.5, 0.5];
      };
      colours.current = { left: tone(0), right: tone(1) };
      if (own.img) {
        // Cover the frame, centred, like an object-fit image.
        const im = own.img;
        const s = Math.max(pw / im.naturalWidth, ph / im.naturalHeight);
        const w = im.naturalWidth * s;
        const h = im.naturalHeight * s;
        ic.drawImage(im, (pw - w) / 2, (ph - h) / 2, w, h);
        if (own.depth) {
          dc.drawImage(own.depth, (pw - w) / 2, (ph - h) / 2, w, h);
        } else {
          const g = dc.createLinearGradient(0, 0, 0, ph);
          g.addColorStop(0, grey(0));
          g.addColorStop(1, grey(1));
          dc.fillStyle = g;
          dc.fillRect(0, 0, pw, ph);
        }
      } else {
        const palette = SCENE.map((_, i) => tone(i + 2));
        ic.setTransform(ratio, 0, 0, ratio, 0, 0);
        dc.setTransform(ratio, 0, 0, ratio, 0, 0);
        drawScene(ic, dc, W, H, palette);
      }
      // Soften the map's edges a little, so depth steps do not tear.
      if ("filter" in dc) {
        const soft = document.createElement("canvas");
        soft.width = pw;
        soft.height = ph;
        const sc = soft.getContext("2d");
        if (sc) {
          sc.filter = `blur(${(1.2 * ratio).toFixed(2)}px)`;
          sc.drawImage(map, 0, 0);
          map = soft;
        }
      }
      still.width = pw;
      still.height = ph;
      still.getContext("2d")?.drawImage(picture, 0, 0);
    };

    const upload = () => {
      const g = gpu.current;
      if (!g || g.lost || !picture || !map) return;
      g.img = uploadTexture(g.gl, picture, { linear: true }, g.img);
      g.depth = uploadTexture(g.gl, map, { linear: true }, g.depth);
    };

    const build = () => {
      const gl = createGL(canvas, { alpha: false });
      if (!gl) return false;
      const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
      if (!program) return false;
      gpu.current = {
        gl,
        program,
        tri: createFullscreenTriangle(gl, program),
        img: null,
        depth: null,
        lost: false,
      };
      upload();
      return true;
    };

    const draw = () => {
      const g = gpu.current;
      if (!g || g.lost || !g.img || !g.depth) return;
      const gl = g.gl;
      const pw = Math.round(W * ratio);
      const ph = Math.round(H * ratio);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      gl.viewport(0, 0, pw, ph);
      const s = state.current;
      const k = settings.current;
      const open = 1 - s.fold;
      const sep = 0.04 * clamp01(k.depth) * open;
      const par = 0.03 * clamp01(k.parallax);
      const { left, right } = colours.current;
      g.program.use();
      g.program.texture("u_img", g.img, 0);
      g.program.texture("u_depth", g.depth, 1);
      g.program.set({
        u_par: [s.x * par, s.y * par],
        u_sep: [s.x * sep, s.y * sep * 0.6],
        u_conv: clamp01(k.convergence),
        u_left: left,
        u_right: right,
        u_aspect: [1, W / Math.max(1, H)],
      });
      g.tri.draw();
    };

    const tick = (time: number) => {
      loop.current = 0;
      if (disposed || !visible.current || document.hidden) {
        last.current = 0;
        return;
      }
      const dt = last.current
        ? Math.min(0.04, (time - last.current) / 1000)
        : 1 / 60;
      last.current = time;
      const s = state.current;
      const t = target.current;
      const k = settings.current;
      let moving = false;
      if (k.motionSafe) {
        // Toward the pointer on glide's constants, home on drift's; the fold
        // closes on snap, one crisp overshoot. Integrated in small substeps:
        // stiff springs stepped at a slow frame's length would blow up.
        const spring = t.home ? springs.drift : springs.glide;
        const goal = k.isOn ? 1 : 0;
        const steps = Math.max(1, Math.ceil(dt / 0.004));
        const h = dt / steps;
        for (let i = 0; i < steps; i += 1) {
          s.vx +=
            ((-spring.stiffness * (s.x - t.x) - spring.damping * s.vx) /
              spring.mass) *
            h;
          s.vy +=
            ((-spring.stiffness * (s.y - t.y) - spring.damping * s.vy) /
              spring.mass) *
            h;
          s.x += s.vx * h;
          s.y += s.vy * h;
          s.fv +=
            ((-springs.snap.stiffness * (s.fold - goal) -
              springs.snap.damping * s.fv) /
              springs.snap.mass) *
            h;
          s.fold += s.fv * h;
        }
        moving =
          Math.abs(s.x - t.x) + Math.abs(s.y - t.y) > 0.0005 ||
          Math.abs(s.vx) + Math.abs(s.vy) > 0.002 ||
          Math.abs(s.fold - goal) > 0.0005 ||
          Math.abs(s.fv) > 0.002;
        if (!moving) {
          s.x = t.x;
          s.y = t.y;
          s.fold = goal;
          s.vx = s.vy = s.fv = 0;
        }
        const lean = lerp(0, 7, clamp01(k.tilt));
        rotateY.set(Number((s.x * lean).toFixed(3)));
        rotateX.set(Number((-s.y * lean).toFixed(3)));
      } else {
        // Reduced motion: the split follows with a short fade, no lean.
        const f = Math.min(1, dt / 0.05);
        s.x += (t.x - s.x) * f;
        s.y += (t.y - s.y) * f;
        s.fold += ((k.isOn ? 1 : 0) - s.fold) * f;
        moving =
          Math.abs(s.x - t.x) + Math.abs(s.y - t.y) > 0.002 ||
          Math.abs(s.fold - (k.isOn ? 1 : 0)) > 0.002;
        rotateX.set(0);
        rotateY.set(0);
      }
      draw();
      if (moving) loop.current = window.requestAnimationFrame(tick);
      else last.current = 0;
    };

    const kick = () => {
      if (disposed || loop.current || !visible.current || document.hidden)
        return;
      loop.current = window.requestAnimationFrame(tick);
    };

    api.current = {
      build: () => {
        paintPicture();
        upload();
        draw();
      },
      draw,
      kick,
    };

    // The GPU canvas shows only while it has drawn; lost or missing, the
    // still picture underneath is what the card shows.
    const showLive = (on: boolean) => {
      if (on) canvas.setAttribute("data-live", "");
      else canvas.removeAttribute("data-live");
    };
    paintPicture();
    const ok = build();
    if (ok) {
      draw();
      showLive(true);
    }
    const detach = ok
      ? onContextLoss(
          canvas,
          () => {
            if (gpu.current) gpu.current.lost = true;
            showLive(false);
          },
          () => {
            gpu.current = null;
            if (build()) {
              draw();
              showLive(true);
            }
          },
        )
      : () => {};

    // A picture of your own replaces the drawn one once it loads.
    const load = (url: string | undefined) =>
      new Promise<HTMLImageElement | null>((resolve) => {
        if (!url) return resolve(null);
        const im = new Image();
        im.crossOrigin = "anonymous";
        im.decoding = "async";
        im.onload = () => resolve(im);
        im.onerror = () => resolve(null);
        im.src = url;
      });
    if (src) {
      void Promise.all([load(src), load(depthSrc)]).then(([im, dm]) => {
        if (disposed || !im) return;
        own = { img: im, depth: dm };
        api.current?.build();
      });
    }

    const sizer = new ResizeObserver(() => api.current?.build());
    sizer.observe(frame);
    // The preview: one slow lean to the right and back, the first time the
    // card is seen, so the split shows itself.
    let previewed = false;
    let previewTimer = 0;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) {
        draw();
        const k = settings.current;
        const t = target.current;
        if (!previewed && k.preview && k.motionSafe && t.x === 0 && t.y === 0) {
          previewed = true;
          target.current = { x: 0.75, y: -0.12, home: false };
          previewTimer = window.setTimeout(() => {
            const now = target.current;
            if (now.x === 0.75 && now.y === -0.12) {
              target.current = { x: 0, y: 0, home: true };
              kick();
            }
          }, 900);
        }
        kick();
      }
    });
    watcher.observe(frame);
    const onVisibility = () => {
      if (!document.hidden) kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      window.clearTimeout(previewTimer);
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      detach();
      showLive(false);
      if (loop.current) window.cancelAnimationFrame(loop.current);
      loop.current = 0;
      const g = gpu.current;
      gpu.current = null;
      api.current = null;
      if (g && !g.lost) {
        g.tri.dispose();
        g.program.dispose();
        if (g.img) g.gl.deleteTexture(g.img);
        if (g.depth) g.gl.deleteTexture(g.depth);
      }
    };
  }, [src, depthSrc, dpr, rotateX, rotateY]);

  const aim = (x: number, y: number, home = false) => {
    target.current = { x: clamp(x, -1, 1), y: clamp(y, -1, 1), home };
    api.current?.kick();
  };

  const local = (clientX: number, clientY: number) => {
    const r = frameRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return {
      x: ((clientX - r.left) / r.width) * 2 - 1,
      y: ((clientY - r.top) / r.height) * 2 - 1,
    };
  };

  const toggle = () => {
    if (disabled) return;
    const next = !isOn;
    if (pressed === undefined) setOwn(next);
    onPressedChange?.(next);
    api.current?.kick();
  };

  const drag = useDrag({
    threshold: 4,
    disabled,
    onMove: ({ point }) => {
      const at = local(point.x, point.y);
      aim(at.x, at.y);
    },
    onEnd: () => aim(0, 0, true),
    onCancel: () => aim(0, 0, true),
    onTap: () => toggle(),
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const t = target.current;
    const by = 0.5;
    if (event.key === "ArrowLeft") aim(t.x - by, t.y);
    else if (event.key === "ArrowRight") aim(t.x + by, t.y);
    else if (event.key === "ArrowUp") aim(t.x, t.y - by);
    else if (event.key === "ArrowDown") aim(t.x, t.y + by);
    else if (event.key === "Escape" || event.key === "Home") aim(0, 0, true);
    else return;
    event.preventDefault();
  };

  // The re-read colours (theme, channels, palette) need a fresh picture.
  const colourKey = [...filters, ...SCENE].join("|");
  React.useEffect(() => {
    api.current?.build();
    api.current?.kick();
  }, [colourKey]);

  return (
    <div
      className={cn(
        "relative flex w-full max-w-72 flex-col gap-2 rounded-4 border border-hairline bg-card p-1.5",
        className,
      )}
    >
      <div className="relative aspect-video w-full [perspective:900px]">
        <motion.button
          ref={frameRef}
          type="button"
          aria-pressed={isOn}
          aria-label={label}
          aria-describedby={`${altId} ${hintId}`}
          disabled={disabled}
          onKeyDown={onKeyDown}
          onClick={(event) => {
            if (event.detail === 0) toggle();
          }}
          onPointerMove={(event) => {
            drag.onPointerMove(event);
            if (event.pointerType !== "mouse" && event.pointerType !== "pen")
              return;
            if (event.buttons !== 0) return;
            const at = local(event.clientX, event.clientY);
            aim(at.x, at.y);
          }}
          onPointerLeave={() => aim(0, 0, true)}
          onPointerDown={drag.onPointerDown}
          onPointerUp={drag.onPointerUp}
          onPointerCancel={drag.onPointerCancel}
          onLostPointerCapture={drag.onLostPointerCapture}
          style={{ rotateX, rotateY }}
          className={cn(
            "absolute inset-0 cursor-pointer touch-pan-y overflow-clip rounded-3 disabled:cursor-default",
            FOCUS_RING,
          )}
        >
          <span
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundColor: SCENE[0],
              backgroundImage: `linear-gradient(180deg, ${SCENE[0]} 0%, ${SCENE[1]} 60%, ${SCENE[6]} 100%)`,
            }}
          />
          <canvas
            ref={stillRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 size-full"
          />
          <canvas
            ref={glRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-150 data-live:opacity-100"
          />
          {glare ? (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-0 mix-blend-soft-light"
              style={{ backgroundImage: motionSafe ? glareImage : "none" }}
            />
          ) : null}
          <span
            aria-hidden
            className="absolute top-2 right-2 inline-flex h-6 items-center gap-1 rounded-full bg-popover/85 px-2 font-mono text-[10px] leading-none text-foreground shadow-sm backdrop-blur-sm"
          >
            <Glasses className="size-3.5 shrink-0" />
            <span className="flex shrink-0 gap-0.5">
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: filters[0] }}
              />
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: filters[1] }}
              />
            </span>
            <span className="grid">
              <span
                className={cn(
                  "col-start-1 row-start-1 transition-opacity duration-150",
                  isOn ? "opacity-0" : "opacity-100",
                )}
              >
                Split
              </span>
              <span
                className={cn(
                  "col-start-1 row-start-1 transition-opacity duration-150",
                  isOn ? "opacity-100" : "opacity-0",
                )}
              >
                Glasses
              </span>
            </span>
          </span>
        </motion.button>
      </div>
      {children ? <div className="px-2 pb-1">{children}</div> : null}
      <span id={altId} className="sr-only">
        {alt}
      </span>
      <span id={hintId} className="sr-only">
        Arrow keys tilt the card, Escape levels it, Enter or Space toggles
        glasses mode.
      </span>
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => {
          api.current?.build();
          api.current?.kick();
        }}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[...filters, ...SCENE].map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
    </div>
  );
}
