"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createFullscreenTriangle,
  createGL,
  createProgram,
  FULLSCREEN_VERTEX,
  GLSL_SRGB,
  onContextLoss,
  resizeGL,
  uploadTexture,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type BullseyePanesKind = "image" | "video";

export type BullseyePanesProps = {
  /** How many roundels sit across the window, 4 to 14; none is ever narrower than 36 px. @default 8 */
  roundels?: number;
  /** How hard each disc is swirled, 0 (plain lenses) to 1 (the view twists half a turn toward the middle). @default 0.6 */
  swirl?: number;
  /** The lead cames' width, in px, 1 to 8. @default 3 */
  lead?: number;
  /** The view behind the glass: an image or video URL. A cross-origin file must allow CORS. @default a garden painted in code */
  src?: string;
  /** Whether `src` is an image or a video. @default guessed from the file's extension */
  kind?: BullseyePanesKind;
  /** Describes the view for assistive technology. @default "A garden seen through bullseye glass" */
  alt?: string;
  /** How much the thick centres magnify, 0 to 1. @default 0.5 */
  magnify?: number;
  /** The glass's own colour, any CSS colour; old crown glass is a pale green. @default "oklch(0.93 0.035 150)" */
  tint?: string;
  /** The cames' colour, any CSS colour. @default "oklch(0.33 0.012 250)" */
  leadColor?: string;
  /** How fast the view drifts behind the glass, 0 (still) to 1. @default 0.3 */
  drift?: number;
  /** How far the pointer shifts the viewpoint, 0 to 1. @default 0.6 */
  parallax?: number;
  /** Content above the window: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** The first time the window is seen, the viewpoint swings in from the side and every swirl turns into place. @default true */
  intro?: boolean;
  /** The pointer and keys shift the viewpoint. @default true */
  interactive?: boolean;
  /** Hold the view where it is; the viewpoint still answers. @default false */
  paused?: boolean;
  /** Names the window for assistive technology. @default "Bullseye window" */
  label?: string;
  /** Seeds the garden and each disc's swirl, so two windows never match. @default 6 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Shows the window but takes no input. @default false */
  disabled?: boolean;
  /** Sizes the box. @default "h-56 w-full" */
  className?: string;
};

const STEP = 1 / 120;
const SCENE_W = 1024;
const SCENE_H = 512;
const MIN_ROUNDEL = 36;
/** The share of the garden's height the window looks onto, from the bottom. */
const GARDEN_VIEW = 0.8;
/** The keys shift the viewpoint this far a press, of its full reach. */
const KEY_STEP = 0.25;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

/** A small seeded generator: the same garden for the same seed. */
function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const toLinear = (byte: number) => {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

const isVideo = (src: string, kind?: BullseyePanesKind) =>
  kind ? kind === "video" : /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(src);

/**
 * The garden behind the glass, painted once: a morning sky with the sun low
 * in it, two ranges of hills, a row of cypresses and round trees, white
 * houses with tiled roofs and a meadow in flower. Every shape repeats every
 * SCENE_W px so the view can drift without a seam. Pigments at fixed
 * lightness: it is a view of daylight in either theme.
 */
function paintGarden(seed: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = SCENE_W;
  c.height = SCENE_H;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const rand = lcg(seed);
  const W = SCENE_W;
  const H = SCENE_H;
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.62);
  sky.addColorStop(0, "oklch(0.78 0.07 238)");
  sky.addColorStop(0.7, "oklch(0.9 0.04 215)");
  sky.addColorStop(1, "oklch(0.94 0.04 85)");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  // The sun, drawn at x and again one width over so it wraps.
  for (const dx of [0, -W, W]) {
    const sx = W * 0.68 + dx;
    const glow = ctx.createRadialGradient(
      sx,
      H * 0.24,
      0,
      sx,
      H * 0.24,
      H * 0.32,
    );
    glow.addColorStop(0, "oklch(0.99 0.04 90 / 0.95)");
    glow.addColorStop(0.18, "oklch(0.97 0.06 85 / 0.7)");
    glow.addColorStop(1, "oklch(0.97 0.06 85 / 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(sx - H * 0.32, 0, H * 0.64, H * 0.6);
  }
  const ridge = (
    base: number,
    amp: number,
    waves: readonly [number, number][],
    fill: string,
  ) => {
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 4) {
      let y = base;
      for (const [k, ph] of waves)
        y += (amp * Math.sin((x / W) * Math.PI * 2 * k + ph)) / k;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  ridge(
    H * 0.5,
    H * 0.07,
    [
      [2, rand() * 6],
      [5, rand() * 6],
      [9, rand() * 6],
    ],
    "oklch(0.74 0.045 200)",
  );
  ridge(
    H * 0.6,
    H * 0.06,
    [
      [3, rand() * 6],
      [7, rand() * 6],
    ],
    "oklch(0.62 0.075 150)",
  );
  // Trees and houses along the near ridge, each drawn wrapped.
  const items: { x: number; kind: number; s: number }[] = [];
  for (let i = 0; i < 26; i += 1) {
    items.push({
      x: rand() * W,
      kind: rand() < 0.55 ? 0 : rand() < 0.6 ? 1 : 2,
      s: 0.75 + rand() * 0.6,
    });
  }
  items.sort((a, b) => a.kind - b.kind);
  const near = H * 0.7;
  for (const it of items) {
    for (const dx of [0, -W, W]) {
      const x = it.x + dx;
      if (x < -80 || x > W + 80) continue;
      if (it.kind === 0) {
        // A cypress: a tall dark flame.
        const h = 92 * it.s;
        ctx.fillStyle = "oklch(0.42 0.07 155)";
        ctx.beginPath();
        ctx.ellipse(x, near - h / 2, 9 * it.s, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (it.kind === 1) {
        // A round tree on a short trunk.
        ctx.fillStyle = "oklch(0.4 0.03 60)";
        ctx.fillRect(x - 2, near - 22 * it.s, 4, 22 * it.s);
        ctx.fillStyle = "oklch(0.55 0.1 140)";
        ctx.beginPath();
        ctx.arc(x, near - 34 * it.s, 20 * it.s, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // A white house with a terracotta roof.
        const w = 46 * it.s;
        const h = 30 * it.s;
        ctx.fillStyle = "oklch(0.95 0.015 85)";
        ctx.fillRect(x - w / 2, near - h, w, h);
        ctx.fillStyle = "oklch(0.6 0.13 38)";
        ctx.beginPath();
        ctx.moveTo(x - w / 2 - 5, near - h);
        ctx.lineTo(x, near - h - 18 * it.s);
        ctx.lineTo(x + w / 2 + 5, near - h);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "oklch(0.45 0.04 250)";
        ctx.fillRect(x - w * 0.2, near - h * 0.62, w * 0.14, h * 0.3);
        ctx.fillRect(x + w * 0.08, near - h * 0.62, w * 0.14, h * 0.3);
      }
    }
  }
  const meadow = ctx.createLinearGradient(0, near, 0, H);
  meadow.addColorStop(0, "oklch(0.7 0.11 135)");
  meadow.addColorStop(1, "oklch(0.58 0.1 140)");
  ctx.fillStyle = meadow;
  ctx.fillRect(0, near, W, H - near);
  const flowers = [
    "oklch(0.95 0.03 95)",
    "oklch(0.72 0.15 30)",
    "oklch(0.88 0.13 95)",
    "oklch(0.7 0.12 330)",
  ];
  for (let i = 0; i < 260; i += 1) {
    const x = rand() * W;
    const y = near + 8 + Math.pow(rand(), 0.7) * (H - near - 8);
    const r = 1.2 + ((y - near) / (H - near)) * 3;
    ctx.fillStyle = flowers[i % flowers.length] ?? "white";
    for (const dx of [0, -W, W]) {
      ctx.beginPath();
      ctx.arc(x + dx, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return c;
}

const FRAGMENT = /* glsl */ `
${GLSL_SRGB}
in vec2 v_uv;
out vec4 o_color;
uniform vec2 u_res;
uniform vec4 u_lay;
uniform vec4 u_glass;
uniform vec2 u_view;
uniform vec4 u_fit;
uniform float u_wrap;
uniform vec3 u_tint;
uniform vec3 u_lead;
uniform float u_seed;
uniform sampler2D u_scene;

const float PI = 3.14159265359;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + u_seed) * 43758.5453); }

vec3 scene(vec2 p) {
  vec2 uv = p * u_fit.xy + u_fit.zw;
  if (u_wrap < 0.5) uv = clamp(uv, vec2(0.001), vec2(0.999));
  return kx_srgbToLinear(texture(u_scene, uv).rgb);
}

void main() {
  vec2 p = v_uv * u_res;
  float D = u_lay.x;
  float R = D * 0.5;
  float lw = u_lay.z;
  float Dy = D * 0.8660254;
  vec2 o = u_res * 0.5;
  // The nearest roundel in the hexagonal rows, one centred on the box.
  float jr = (p.y - o.y) / Dy;
  float best = 1e9;
  vec2 c = o;
  vec2 cellId = vec2(0.0);
  for (int k = -1; k <= 1; k++) {
    float j = floor(jr + 0.5) + float(k);
    float shift = mod(j, 2.0) * 0.5 * D;
    float i = floor((p.x - o.x - shift) / D + 0.5);
    vec2 cc = o + vec2(i * D + shift, j * Dy);
    float d = distance(p, cc);
    if (d < best) { best = d; c = cc; cellId = vec2(i, j); }
  }
  float edge = best - R;
  vec2 q = p - c;
  float inner = R - lw * 0.5;
  float r = best / inner;
  vec2 view = u_view * u_glass.z;
  vec3 L = normalize(vec3(-0.55 - 0.35 * u_view.x, -0.75 - 0.35 * u_view.y, 0.9));
  vec3 col;

  if (r < 1.0) {
    // Spun crown glass: thick at the centre, a pontil knob in the middle,
    // every ring of the disc turned by the swirl, the centre magnified.
    float th = atan(q.y, q.x);
    float own = hash(cellId) - 0.5;
    float ring = (1.0 - r) * (1.0 - r);
    float turn = u_glass.x * PI * ring * (1.0 + 0.3 * own) + view.x * 1.6 * ring + own * 0.6;
    float rr = pow(r, 1.0 + u_glass.y * 1.4);
    float thick = pow(1.0 - r * r, 1.5);
    float ridges = sin(r * 26.0 + th * 3.0 + own * 6.0);
    rr += ridges * 0.012 * (1.0 - r);
    vec2 dir = vec2(cos(th + turn), sin(th + turn));
    vec2 look = c + dir * rr * inner + view * thick * D * 0.45;
    // The pontil: a thick knob that turns its tiny piece of the view over.
    float knob = 1.0 - smoothstep(0.1, 0.18, r);
    look = mix(look, c - q * 1.8 + view * D * 0.5, knob);
    float spread = (0.6 + 1.4 * u_glass.x) * (1.0 - r) + knob * 1.5;
    vec2 fringe = dir * spread;
    col = vec3(scene(look + fringe).r, scene(look).g, scene(look - fringe).b);
    // The lens's surface: its bulge and its ridges light against the window's light.
    vec3 n = normalize(vec3((q / inner) * (1.6 * sqrt(1.0 - r * r) + 0.15) + dir * ridges * 0.12, 1.0));
    float diff = 0.86 + 0.18 * dot(n, L);
    float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 48.0);
    col *= mix(vec3(1.0), u_tint, 0.55 + 0.45 * thick) * diff;
    col *= mix(1.0, 0.72, smoothstep(0.7, 1.0, r));
    col += spec * 0.5 + knob * 0.06;
  } else {
    // A quarry between the roundels: flatter glass, a shade deeper.
    vec2 wob = vec2(sin(p.y * 0.21 + u_seed), cos(p.x * 0.19 - u_seed)) * 2.0;
    col = scene(p + wob + view * D * 0.12) * u_tint * u_tint * 0.88;
  }

  // The came: a rounded bar of lead along every circle, shaded across its
  // section, with one thin highlight where it faces the light.
  float across = edge / (lw * 0.5);
  float leadMask = 1.0 - smoothstep(lw * 0.5 - 0.6, lw * 0.5 + 0.6, abs(edge));
  if (leadMask > 0.0) {
    vec2 radial = q / max(best, 1e-3);
    float a = clamp(across, -1.0, 1.0);
    vec3 n = normalize(vec3(radial * a, sqrt(max(0.0, 1.0 - a * a)) + 0.05));
    float shade = 0.45 + 0.55 * max(dot(n, L), 0.0);
    float hi = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 60.0);
    vec3 leadCol = u_lead * shade + hi * 0.75;
    col = mix(col, leadCol, leadMask);
  }
  // The glass darkens a touch toward the window's edge.
  vec2 vq = v_uv - 0.5;
  col *= 1.0 - 0.22 * dot(vq, vq);
  o_color = vec4(kx_linearToSrgb(clamp(col, 0.0, 1.0)), 1.0);
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  scene: WebGLTexture | null;
  wrap: boolean;
  /** The scene's own size, px, for fitting it to the box. */
  sw: number;
  sh: number;
  lost: boolean;
};

type Size = { w: number; h: number; bw: number; bh: number; dpr: number };

type Sim = {
  last: number;
  carry: number;
  /** The drift's clock, s. */
  t: number;
  vx: number;
  vy: number;
  vvx: number;
  vvy: number;
  /** The intro's swing runs on the drift spring until it lands. */
  arriving: boolean;
};

type Hand = {
  x: number;
  y: number;
  present: boolean;
  source: "pointer" | "key" | null;
};

type Api = {
  draw: () => void;
  kick: () => void;
  resize: () => void;
  readColours: () => void;
  loadSource: () => void;
  playIfSeen: () => void;
  tick: (now: number) => void;
  arrive: () => void;
};

/** The props a window must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button:not([data-panes]),input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[contenteditable='true']";

/**
 * A view seen through a leaded window of bullseye glass, drawn per pixel in
 * one WebGL2 pass. Roundels sit in hexagonal rows, and each is spun crown
 * glass: thick at its centre with a pontil knob that turns its tiny piece of
 * the view over, swirled so the picture twists toward the middle, magnified
 * there, rippled by faint spiral ridges, fringed with colour where it bends
 * light hardest, darker at the rim and tinted the glass's own green. The
 * curved quarries between them are flatter glass, and the cames are rounded
 * bars of lead, each carrying one thin highlight from the window's light.
 *
 * The view drifts slowly behind the glass: a garden painted in code that
 * wraps as it goes, or your own image or video. The pointer shifts the
 * viewpoint on the glide spring — each roundel's sampling moves by its
 * thickness, so the thick centres move most and every swirl turns with the
 * hand, while the highlights slide along the leads — and leaving, it returns
 * on drift. On first sight the viewpoint swings in from the side on drift so
 * every swirl turns into place. The keyboard's way in is a transparent button
 * behind the content: arrow keys shift the viewpoint, Enter, Space or Escape
 * bring it back to centre. Under reduced motion nothing drifts, a video holds
 * its first frame, and the viewpoint moves straight to where it is sent.
 */
export function BullseyePanes({
  roundels = 8,
  swirl = 0.6,
  lead = 3,
  src,
  kind,
  alt = "A garden seen through bullseye glass",
  magnify = 0.5,
  tint = "oklch(0.93 0.035 150)",
  leadColor = "oklch(0.33 0.012 250)",
  drift = 0.3,
  parallax = 0.6,
  children,
  intro = true,
  interactive = true,
  paused = false,
  label = "Bullseye window",
  seed = 6,
  dpr = 2,
  disabled = false,
  className,
}: BullseyePanesProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const altId = `${uid}-alt`;
  const across = clamp(Math.round(roundels), 4, 14);
  const paintKey = `${tint}|${leadColor}`;
  const k = {
    across,
    swirl: clamp01(swirl),
    lead: clamp(lead, 1, 8),
    magnify: clamp01(magnify),
    drift: clamp01(drift),
    parallax: clamp01(parallax),
    intro,
    paused,
    seed,
    motionSafe,
    dpr: clamp(dpr, 0.5, 2),
    enabled: interactive && !disabled,
  };

  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const gpu = React.useRef<Gpu | null>(null);
  const size = React.useRef<Size | null>(null);
  const colour = React.useRef({
    tint: new Float32Array([0.85, 0.9, 0.85]),
    lead: new Float32Array([0.05, 0.05, 0.06]),
  });
  const reader = React.useRef<CanvasRenderingContext2D | null>(null);
  const video = React.useRef<HTMLVideoElement | null>(null);
  const frame = React.useRef(0);
  const visible = React.useRef(false);
  const shown = React.useRef(false);
  const arrived = React.useRef(false);
  const sim = React.useRef<Sim>({
    last: 0,
    carry: 0,
    t: 0,
    vx: 0,
    vy: 0,
    vvx: 0,
    vvy: 0,
    arriving: false,
  });
  const hand = React.useRef<Hand>({ x: 0, y: 0, present: false, source: null });
  const api = React.useRef<Api | null>(null);
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  const readColours = () => {
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
    const read = (span: Element | undefined, out: Float32Array) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgb(0, 0, 0)";
      if (span) ctx.fillStyle = getComputedStyle(span).color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      out[0] = toLinear(d[0] ?? 0);
      out[1] = toLinear(d[1] ?? 0);
      out[2] = toLinear(d[2] ?? 0);
    };
    read(carriers.children[0], colour.current.tint);
    read(carriers.children[1], colour.current.lead);
  };

  /** The garden, painted and uploaded: the view whenever there is no `src`, or it fails. */
  const showGarden = () => {
    const g = gpu.current;
    if (!g || g.lost) return;
    g.scene = uploadTexture(
      g.gl,
      paintGarden(k.seed),
      { wrap: "repeat", linear: true },
      g.scene,
    );
    g.wrap = true;
    g.sw = SCENE_W;
    g.sh = SCENE_H;
  };

  const stopVideo = () => {
    const v = video.current;
    if (!v) return;
    v.pause();
    v.removeAttribute("src");
    v.load();
    video.current = null;
  };

  const loadSource = () => {
    const g = gpu.current;
    if (!g || g.lost) return;
    stopVideo();
    showGarden();
    if (!src) return;
    const fail = () => {
      if (gpu.current === g) {
        showGarden();
        draw();
      }
    };
    if (isVideo(src, kind)) {
      const v = document.createElement("video");
      v.crossOrigin = "anonymous";
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = "auto";
      v.src = src;
      v.addEventListener("loadeddata", () => {
        if (video.current !== v || gpu.current !== g || g.lost) return;
        try {
          g.scene = uploadTexture(g.gl, v, { linear: true }, null);
          g.wrap = false;
          g.sw = v.videoWidth || SCENE_W;
          g.sh = v.videoHeight || SCENE_H;
        } catch {
          fail();
          return;
        }
        draw();
        playIfSeen();
      });
      v.addEventListener("error", fail);
      video.current = v;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      if (gpu.current !== g || g.lost) return;
      try {
        g.scene = uploadTexture(g.gl, img, { linear: true }, null);
        g.wrap = false;
        g.sw = img.naturalWidth || SCENE_W;
        g.sh = img.naturalHeight || SCENE_H;
      } catch {
        // A file the page may not read (no CORS) shows the garden instead.
        fail();
        return;
      }
      draw();
      kick();
    };
    img.onerror = fail;
    img.src = src;
  };

  /** A video plays only while the window is seen, the page visible and motion allowed. */
  const playIfSeen = () => {
    const v = video.current;
    if (!v) return;
    if (visible.current && !document.hidden && k.motionSafe && !k.paused) {
      void v.play().catch(() => {});
      kick();
    } else v.pause();
  };

  const resize = () => {
    const g = gpu.current;
    const canvas = canvasRef.current;
    if (!g || g.lost || !canvas) return;
    const r = resizeGL(g.gl, canvas, { dprCap: k.dpr });
    size.current = {
      w: r.width / r.dpr,
      h: r.height / r.dpr,
      bw: r.width,
      bh: r.height,
      dpr: r.dpr,
    };
  };

  const draw = () => {
    const g = gpu.current;
    const sz = size.current;
    if (!g || g.lost || !sz || !g.scene) return;
    const { gl, program, tri } = g;
    const u = program.uniforms;
    const s = sim.current;
    const c = colour.current;
    const v = video.current;
    if (v && v.readyState >= 2 && !v.paused) {
      try {
        uploadTexture(gl, v, { linear: true }, g.scene);
      } catch {
        // A frame that cannot be read leaves the last one in place.
      }
    }
    const D = Math.max(MIN_ROUNDEL, sz.w / k.across);
    // The view is fitted to cover the box with room to swing behind the glass.
    const margin = D * 0.6;
    // The painted garden wraps across, so only its height needs fitting: the
    // window looks out from a little below the sky's top, where the hills,
    // trees and houses are, which the swirls have most to turn.
    const scale = g.wrap
      ? (sz.h + 2 * margin) / (g.sh * GARDEN_VIEW)
      : Math.max((sz.w + 2 * margin) / g.sw, (sz.h + 2 * margin) / g.sh);
    let ox: number;
    let oy: number;
    if (g.wrap) {
      ox = (s.t * 14) / (g.sw * scale);
      oy = 1 - GARDEN_VIEW + margin / (g.sh * scale);
    } else {
      const swing = Math.sin(s.t * 0.12) * margin * 0.8;
      ox = 0.5 - (sz.w / 2 - swing) / (g.sw * scale);
      oy = 0.5 - sz.h / 2 / (g.sh * scale);
    }
    program.use();
    gl.viewport(0, 0, sz.bw, sz.bh);
    gl.uniform2f(u.u_res ?? null, sz.w, sz.h);
    gl.uniform4f(u.u_lay ?? null, D, 0, k.lead, 0);
    gl.uniform4f(u.u_glass ?? null, k.swirl, k.magnify, k.parallax, s.t);
    gl.uniform2f(u.u_view ?? null, s.vx, s.vy);
    gl.uniform4f(
      u.u_fit ?? null,
      1 / (g.sw * scale),
      1 / (g.sh * scale),
      ox,
      oy,
    );
    gl.uniform1f(u.u_wrap ?? null, g.wrap ? 1 : 0);
    gl.uniform3fv(u.u_tint ?? null, c.tint);
    gl.uniform3fv(u.u_lead ?? null, c.lead);
    gl.uniform1f(u.u_seed ?? null, (k.seed % 97) * 0.731);
    program.texture("u_scene", g.scene, 0);
    tri.draw();
    if (!shown.current) {
      shown.current = true;
      rootRef.current?.setAttribute("data-live", "");
    }
  };

  /** Where the viewpoint is headed: the hand's place across the window, or home. */
  const target = () => {
    const hd = hand.current;
    const sz = size.current;
    if (!hd.present || !sz || !k.enabled) return { x: 0, y: 0 };
    if (hd.source === "key") return { x: hd.x, y: hd.y };
    return {
      x: clamp((hd.x - sz.w / 2) / (sz.w / 2), -1, 1),
      y: clamp((hd.y - sz.h / 2) / (sz.h / 2), -1, 1),
    };
  };

  /** Steps the drift and the viewpoint's spring; says whether anything moves. */
  const advance = (dt: number): boolean => {
    const s = sim.current;
    const to = target();
    if (!k.motionSafe) {
      s.vx = to.x;
      s.vy = to.y;
      s.vvx = 0;
      s.vvy = 0;
      s.arriving = false;
      return false;
    }
    let busy = false;
    if (!k.paused && k.drift > 0) {
      s.t += dt * (0.2 + 2.2 * k.drift);
      busy = true;
    }
    if (video.current && !video.current.paused) busy = true;
    // The viewpoint follows on glide; the intro swings in, and an abandoned
    // view comes home, on drift.
    const sp =
      s.arriving || !hand.current.present ? springs.drift : springs.glide;
    s.carry += dt;
    let steps = 0;
    while (s.carry >= STEP && steps < 8) {
      s.carry -= STEP;
      steps += 1;
      s.vvx +=
        ((-sp.stiffness * (s.vx - to.x) - sp.damping * s.vvx) / sp.mass) * STEP;
      s.vvy +=
        ((-sp.stiffness * (s.vy - to.y) - sp.damping * s.vvy) / sp.mass) * STEP;
      s.vx += s.vvx * STEP;
      s.vy += s.vvy * STEP;
    }
    if (steps === 8) s.carry = 0;
    const moving =
      Math.abs(s.vx - to.x) > 0.0005 ||
      Math.abs(s.vy - to.y) > 0.0005 ||
      Math.abs(s.vvx) + Math.abs(s.vvy) > 0.002;
    if (moving) busy = true;
    else {
      s.vx = to.x;
      s.vy = to.y;
      s.vvx = 0;
      s.vvy = 0;
      s.arriving = false;
    }
    return busy;
  };

  const tick = (now: number) => {
    frame.current = 0;
    const s = sim.current;
    if (
      !visible.current ||
      document.hidden ||
      !gpu.current ||
      gpu.current.lost
    ) {
      s.last = 0;
      return;
    }
    const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 1 / 60;
    s.last = now;
    const busy = advance(dt);
    draw();
    if (busy) frame.current = window.requestAnimationFrame(loop);
    else s.last = 0;
  };

  const kick = () => {
    if (frame.current || !visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(loop);
  };

  /** The first sighting: the viewpoint swings in from the side. */
  const arrive = () => {
    if (arrived.current) return;
    arrived.current = true;
    const s = sim.current;
    if (k.intro && k.motionSafe) {
      s.vx = -0.9;
      s.vy = 0.25;
      s.arriving = true;
    }
    kick();
  };

  React.useLayoutEffect(() => {
    api.current = {
      draw,
      kick,
      resize,
      readColours,
      loadSource,
      playIfSeen,
      tick,
      arrive,
    };
  });

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const build = (): boolean => {
      const gl = createGL(canvas, { alpha: false });
      if (!gl) return false;
      const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
      if (!program) return false;
      const tri = createFullscreenTriangle(gl, program);
      gpu.current = {
        gl,
        program,
        tri,
        scene: null,
        wrap: true,
        sw: SCENE_W,
        sh: SCENE_H,
        lost: false,
      };
      api.current?.readColours();
      api.current?.resize();
      api.current?.loadSource();
      api.current?.draw();
      api.current?.kick();
      return true;
    };
    if (!build()) {
      rootRef.current?.setAttribute("data-fallback", "");
      return;
    }
    const detach = onContextLoss(
      canvas,
      () => {
        if (gpu.current) gpu.current.lost = true;
        shown.current = false;
        rootRef.current?.removeAttribute("data-live");
      },
      () => {
        gpu.current = null;
        build();
      },
    );
    const playing = video;
    return () => {
      detach();
      const v = playing.current;
      if (v) {
        v.pause();
        v.removeAttribute("src");
        v.load();
        playing.current = null;
      }
      const g = gpu.current;
      gpu.current = null;
      if (g && !g.lost) {
        if (g.scene) g.gl.deleteTexture(g.scene);
        g.tri.dispose();
        g.program.dispose();
      }
    };
  }, []);

  React.useEffect(() => {
    api.current?.loadSource();
    api.current?.draw();
  }, [src, kind, seed]);

  React.useEffect(() => {
    api.current?.readColours();
    api.current?.draw();
  }, [paintKey]);

  React.useEffect(() => {
    api.current?.resize();
    api.current?.draw();
  }, [k.dpr]);

  React.useEffect(() => {
    api.current?.playIfSeen();
    api.current?.draw();
    api.current?.kick();
  }, [
    k.across,
    k.swirl,
    k.lead,
    k.magnify,
    k.drift,
    k.parallax,
    paused,
    motionSafe,
    k.enabled,
  ]);

  React.useEffect(() => {
    const onVisibility = () => {
      api.current?.playIfSeen();
      if (document.hidden) return;
      api.current?.draw();
      api.current?.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const pending = frame;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (pending.current) window.cancelAnimationFrame(pending.current);
      pending.current = 0;
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
      api.current?.playIfSeen();
      if (!visible.current) return;
      api.current?.arrive();
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

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    const r = root?.getBoundingClientRect();
    if (!root || !r) return { x: 0, y: 0 };
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
    };
  };

  const handTo = (x: number, y: number, source: "pointer" | "key") => {
    const hd = hand.current;
    hd.x = x;
    hd.y = y;
    hd.present = true;
    hd.source = source;
    sim.current.arriving = false;
    if (!k.motionSafe) {
      advance(0);
      draw();
    }
    kick();
  };

  const recentre = (say: boolean) => {
    const hd = hand.current;
    hd.present = false;
    hd.source = null;
    if (!k.motionSafe) {
      advance(0);
      draw();
    }
    kick();
    if (say) setSaid((v) => ({ n: v.n + 1, text: "View centred." }));
  };

  const drag = useDrag({
    threshold: 4,
    disabled: !k.enabled,
    onStart: ({ point, event }) => {
      if (event.pointerType === "mouse") return;
      const at = local(point.x, point.y);
      handTo(at.x, at.y, "pointer");
    },
    onMove: ({ point, event }) => {
      if (event.pointerType === "mouse") return;
      const at = local(point.x, point.y);
      handTo(at.x, at.y, "pointer");
    },
    onEnd: ({ event }) => {
      if (event.pointerType !== "mouse") recentre(false);
    },
    onCancel: () => recentre(false),
  });

  const fromContent = (target: EventTarget) => {
    const el = target instanceof Element ? target : null;
    const hit = el?.closest(INTERACTIVE);
    return Boolean(hit && rootRef.current?.contains(hit));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!k.enabled || fromContent(event.target)) return;
    drag.onPointerDown(event);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.onPointerMove(event);
    if (event.pointerType !== "mouse" || !k.enabled) return;
    const at = local(event.clientX, event.clientY);
    handTo(at.x, at.y, "pointer");
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!k.enabled) return;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const move = moves[event.key];
    const hd = hand.current;
    if (move) {
      event.preventDefault();
      const from =
        hd.present && hd.source === "key"
          ? { x: hd.x, y: hd.y }
          : { x: 0, y: 0 };
      handTo(
        clamp(from.x + move[0] * KEY_STEP, -1, 1),
        clamp(from.y + move[1] * KEY_STEP, -1, 1),
        "key",
      );
      return;
    }
    if (event.key === "Escape" && hd.present) {
      event.preventDefault();
      recentre(true);
    }
  };

  const onColours = () => {
    api.current?.readColours();
    api.current?.draw();
  };

  return (
    <div
      ref={bindRoot}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      onPointerLeave={(event) => {
        if (
          event.pointerType !== "touch" &&
          hand.current.source === "pointer"
        ) {
          recentre(false);
        }
      }}
      className={cn(
        "group/bullseye-panes @container relative isolate h-56 w-full overflow-clip",
        k.enabled ? "touch-pan-y" : "touch-auto",
        className,
      )}
    >
      <PanesStill
        src={src && !isVideo(src, kind) ? src : undefined}
        across={across}
        lead={k.lead}
        tint={tint}
        leadColor={leadColor}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 group-data-live/bullseye-panes:opacity-100"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={onColours}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[tint, leadColor].map((paint, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: paint }}
          />
        ))}
      </span>
      <button
        type="button"
        data-panes=""
        aria-label={label}
        aria-describedby={`${altId} ${hintId}`}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (hand.current.source === "key") recentre(false);
        }}
        onClick={(event) => {
          // Enter, Space or assistive technology: a click with no pointer
          // behind it brings the view back to centre.
          if (event.detail === 0 && k.enabled) recentre(true);
        }}
        className={cn(
          "absolute inset-0 z-0 size-full rounded-[inherit] outline-none",
          "cursor-default",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      <div className="pointer-events-none relative z-10 size-full *:pointer-events-auto">
        {children}
      </div>
      <p id={altId} className="sr-only">
        {alt}
      </p>
      <p id={hintId} className="sr-only">
        Arrow keys shift your viewpoint behind the glass; Enter, Space or Escape
        bring it back to centre.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/**
 * The designed still for the server render, the first paint and any browser
 * without WebGL2: the garden (or your image) as a backdrop, and over it the
 * roundels as rows of radial gradients — a glint, the glass and the lead ring
 * — sized with container units so they match the live window's count.
 */
function PanesStill({
  src,
  across,
  lead,
  tint,
  leadColor,
}: {
  src?: string;
  across: number;
  lead: number;
  tint: string;
  leadColor: string;
}) {
  const d = `max(36px, calc(100cqw / ${across}))`;
  const half = `calc(${d} / 2)`;
  const ring = (x: string, y: string) =>
    `radial-gradient(circle at ${x} ${y}, rgb(255 255 255 / 0.22) 0, color-mix(in oklab, ${tint} 18%, transparent) calc(${half} * 0.35), transparent calc(${half} - ${lead / 2 + 1}px), ${leadColor} calc(${half} - ${lead / 2}px), ${leadColor} calc(${half} + ${lead / 2}px), transparent calc(${half} + ${lead / 2 + 0.5}px))`;
  const rowTwo = `calc(${d} * 1.366)`;
  const garden = [
    "radial-gradient(40% 55% at 68% 22%, oklch(0.99 0.04 90 / 0.9), transparent 70%)",
    "radial-gradient(70% 38% at 20% 92%, oklch(0.62 0.075 150), transparent 72%)",
    "radial-gradient(80% 40% at 82% 96%, oklch(0.6 0.08 145), transparent 70%)",
    "linear-gradient(to bottom, oklch(0.78 0.07 238) 0%, oklch(0.9 0.04 215) 38%, oklch(0.94 0.04 85) 52%, oklch(0.74 0.045 200) 53%, oklch(0.66 0.08 150) 66%, oklch(0.62 0.1 140) 100%)",
  ].join(", ");
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 transition-opacity duration-300 group-data-live/bullseye-panes:opacity-0"
    >
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: src ? `url("${src}")` : garden,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: `color-mix(in oklab, ${tint} 22%, transparent)`,
          backgroundImage: [
            ring(half, half),
            ring("0px", rowTwo),
            ring(d, rowTwo),
          ].join(", "),
          backgroundSize: `${d} calc(${d} * 1.732)`,
          backgroundPosition: "center",
        }}
      />
    </div>
  );
}
