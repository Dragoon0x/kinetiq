"use client";

import * as React from "react";

import { animate, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
  createFullscreenTriangle,
  createGL,
  createProgram,
  onContextLoss,
  resizeGL,
  uploadTexture,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type MoltenMarkTint = "chrome" | "gold" | "copper" | "accent";

export type MoltenMarkProps = {
  /** The mark as SVG path data in `viewBox` units, filled with the nonzero rule. @default a ring with a droplet in it */
  path?: string;
  /** The viewBox `path` is drawn in. @default "0 0 100 100" */
  viewBox?: string;
  /** A word to pour instead of the path, set in the inherited font at heavy weight. */
  text?: string;
  /** The mark's accessible name. @default `text`, or "Molten mark" */
  label?: string;
  /** The metal: a preset (each a token pigment at a fixed lightness) or any CSS colour. @default "chrome" */
  tint?: MoltenMarkTint | (string & {});
  /** How fast the surface churns, as a multiple of the house pace (0 to 3); 0 holds it still. @default 1 */
  flow?: number;
  /** Polish, 0 to 1: satin with soft broad highlights to a mirror with small hard ones. @default 0.6 */
  shine?: number;
  /** How rounded the metal stands at its edges, 0.1 to 1: a flat pour with a rolled rim to a full pillow. @default 0.75 */
  bevel?: number;
  /** How deep the churning ripples run, 0 to 1. @default 0.5 */
  ripple?: number;
  /** How hot the pour runs, 0 to 1: white-hot at the front and cooling through ember; 0 pours cold. @default 1 */
  heat?: number;
  /** Space around the mark, as a share of the box on each side (0 to 0.3). @default 0.08 */
  padding?: number;
  /** Pour the metal in the first time the mark comes into view; off, it is cast already. @default true */
  intro?: boolean;
  /** Change it to pour again. */
  pourKey?: string | number;
  /** The key light follows the pointer, and a click drops a ripple into the metal. @default true */
  interactive?: boolean;
  /** Holds the surface still and stops the loop. @default false */
  paused?: boolean;
  /** Seed for the flow's pattern. @default 5 */
  seed?: number;
  /** The highest device pixel ratio the canvas draws at (never above 2). @default 2 */
  dpr?: number;
  /** Fires when a pour begins: on first view, or when `pourKey` changes. */
  onPour?: () => void;
  /** Fires when the mark is cast: a pour has filled it and cooled, or — with no pour to run (no intro, reduced motion, no WebGL2) — the first time it is in view. */
  onPoured?: () => void;
  /** Classes for the box; give it a size. @default "h-40 w-full" */
  className?: string;
};

const TINTS: Record<MoltenMarkTint, string> = {
  chrome: "oklch(from var(--ink-2) 0.87 0.012 h)",
  gold: "oklch(from var(--warn) 0.84 0.13 h)",
  copper:
    "oklch(from color-mix(in oklch, var(--danger), var(--warn)) 0.74 0.13 h)",
  accent: "oklch(from var(--accent-bright) 0.76 0.13 h)",
};
/** The pour's heat, white-hot to ember, as pigments of the status tokens. */
const HOT = "oklch(from var(--warn) 0.97 0.08 h)";
const EMBER = "oklch(from var(--danger) 0.6 0.2 h)";

/** A thick ring with a droplet standing in it: wound so the nonzero rule leaves the hole. */
const MARK =
  "M50 6A44 44 0 1 1 50 94A44 44 0 1 1 50 6Z M50 26A24 24 0 1 0 50 74A24 24 0 1 0 50 26Z M50 34C55.5 41.5 59 47 59 52.5A9 9 0 1 1 41 52.5C41 47 44.5 41.5 50 34Z";

/** Seconds for the front to climb the mark, and the time constant it cools with. */
const FILL = 0.62;
const COOL = 0.5;
const DONE = 99;
/** The ambient churn's draw interval: about 40 a second. */
const AMBIENT_MS = 24;
const FIELD = 384;
const REST = { x: 0.3, y: 0.22 };

type Rgb = [number, number, number];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

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

function parseViewBox(viewBox: string) {
  const v = viewBox
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  return {
    x: v[0] ?? 0,
    y: v[1] ?? 0,
    w: Math.max(1e-3, v[2] ?? 100),
    h: Math.max(1e-3, v[3] ?? 100),
  };
}

const INF = 1e20;

/** One line of the exact squared Euclidean distance transform (Felzenszwalb–Huttenlocher). */
function edt1d(
  f: Float64Array,
  n: number,
  d: Float64Array,
  v: Int32Array,
  z: Float64Array,
) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q += 1) {
    const fq = f[q] ?? INF;
    let vk = v[k] ?? 0;
    let s = (fq + q * q - ((f[vk] ?? INF) + vk * vk)) / (2 * q - 2 * vk);
    while (s <= (z[k] ?? -INF) && k > 0) {
      k -= 1;
      vk = v[k] ?? 0;
      s = (fq + q * q - ((f[vk] ?? INF) + vk * vk)) / (2 * q - 2 * vk);
    }
    k += 1;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q += 1) {
    while ((z[k + 1] ?? INF) < q) k += 1;
    const vk = v[k] ?? 0;
    d[q] = (q - vk) * (q - vk) + (f[vk] ?? INF);
  }
}

/**
 * The metal's surface from its coverage: the inside distance to the edge
 * (exact, two passes), shaped by a circular profile so the edge rolls like
 * a meniscus, lightly smoothed, then differentiated: RGBA floats of slope
 * x, slope y, height and 1.
 */
function surfaceField(
  alpha: Uint8ClampedArray,
  fw: number,
  fh: number,
  bevel: number,
): Float32Array {
  // A border of outside pixels keeps every distance finite.
  const gw = fw + 2;
  const gh = fh + 2;
  const grid = new Float64Array(gw * gh);
  for (let y = 0; y < gh; y += 1) {
    for (let x = 0; x < gw; x += 1) {
      const inside =
        x > 0 &&
        y > 0 &&
        x <= fw &&
        y <= fh &&
        (alpha[((y - 1) * fw + (x - 1)) * 4 + 3] ?? 0) > 127;
      grid[y * gw + x] = inside ? INF : 0;
    }
  }
  const longest = Math.max(gw, gh);
  const f = new Float64Array(longest);
  const d = new Float64Array(longest);
  const v = new Int32Array(longest);
  const z = new Float64Array(longest + 1);
  for (let x = 0; x < gw; x += 1) {
    for (let y = 0; y < gh; y += 1) f[y] = grid[y * gw + x] ?? 0;
    edt1d(f, gh, d, v, z);
    for (let y = 0; y < gh; y += 1) grid[y * gw + x] = d[y] ?? 0;
  }
  let deepest = 0;
  for (let y = 0; y < gh; y += 1) {
    for (let x = 0; x < gw; x += 1) f[x] = grid[y * gw + x] ?? 0;
    edt1d(f, gw, d, v, z);
    for (let x = 0; x < gw; x += 1) {
      const dist = Math.sqrt(d[x] ?? 0);
      grid[y * gw + x] = dist;
      if (dist > deepest) deepest = dist;
    }
  }
  const roll = Math.max(1.5, clamp(bevel, 0.1, 1) * deepest);
  const height = new Float32Array(fw * fh);
  for (let y = 0; y < fh; y += 1) {
    for (let x = 0; x < fw; x += 1) {
      const t = Math.min(1, (grid[(y + 1) * gw + (x + 1)] ?? 0) / roll);
      height[y * fw + x] = Math.sqrt(Math.max(0, t * (2 - t)));
    }
  }
  // Two 3×3 box passes (close to a small gaussian) take the staircase out
  // of the distance field, so reflections run smooth along the curves.
  const blur = (from: Float32Array, to: Float32Array) => {
    for (let y = 0; y < fh; y += 1) {
      for (let x = 0; x < fw; x += 1) {
        let sum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const yy = y + dy;
          if (yy < 0 || yy >= fh) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const xx = x + dx;
            if (xx < 0 || xx >= fw) continue;
            sum += from[yy * fw + xx] ?? 0;
            count += 1;
          }
        }
        to[y * fw + x] = sum / Math.max(1, count);
      }
    }
  };
  const soft = new Float32Array(fw * fh);
  blur(height, soft);
  blur(soft, height);
  blur(height, soft);
  const out = new Float32Array(fw * fh * 4);
  const at = (x: number, y: number) =>
    soft[clamp(y, 0, fh - 1) * fw + clamp(x, 0, fw - 1)] ?? 0;
  for (let y = 0; y < fh; y += 1) {
    for (let x = 0; x < fw; x += 1) {
      const i = (y * fw + x) * 4;
      out[i] = clamp(((at(x + 1, y) - at(x - 1, y)) / 2) * roll, -4, 4);
      out[i + 1] = clamp(((at(x, y + 1) - at(x, y - 1)) / 2) * roll, -4, 4);
      out[i + 2] = at(x, y);
      out[i + 3] = 1;
    }
  }
  return out;
}

/**
 * The surface field as a half-float texture: slopes need more than eight
 * bits, or the softbox's reflection steps into contour lines on the rim.
 */
function uploadField(
  gl: WebGL2RenderingContext,
  data: Float32Array,
  width: number,
  height: number,
  existing: WebGLTexture | null,
): WebGLTexture | null {
  const texture = existing ?? gl.createTexture();
  if (!texture) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA16F,
    width,
    height,
    0,
    gl.RGBA,
    gl.FLOAT,
    data,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

const FRAGMENT = /* glsl */ `
uniform sampler2D u_mask;
uniform sampler2D u_field;
uniform vec2 u_res;
uniform vec4 u_box;
uniform vec4 u_fieldBox;
uniform float u_time;
uniform float u_ripple;
uniform float u_shine;
uniform float u_pour;
uniform float u_heat;
uniform vec2 u_light;
uniform vec4 u_drop;
uniform vec3 u_tint;
uniform vec3 u_hot;
uniform vec3 u_ember;
uniform float u_seed;
uniform float u_room;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

const float FILL = ${FILL.toFixed(2)};
const float COOL = ${COOL.toFixed(2)};

// A photographer's studio, as seen in a mirror: a dark floor, a soft
// horizon, a long softbox overhead and a strip light to the right. Directions
// are DOM-oriented (x right, y down, z toward the viewer).
vec3 studio(vec3 r, float satin) {
  float up = -r.y;
  // The room takes its brightness from the page: a light page is a bright
  // room, so chrome reads silver there and smoky on a dark one.
  vec3 ground = vec3(mix(0.04, 0.2, u_room));
  vec3 horizon = vec3(mix(0.3, 0.55, u_room));
  vec3 sky = vec3(mix(0.74, 0.92, u_room));
  vec3 col = mix(ground, horizon, smoothstep(-0.75, 0.02, up));
  col = mix(col, sky, smoothstep(0.02, 0.7, up) * 0.75);
  float edge = mix(0.04, 0.16, satin);
  float box = smoothstep(0.42 - edge, 0.5, up) * (1.0 - smoothstep(0.76, 0.86 + edge, up));
  box *= 1.0 - smoothstep(0.32, 0.6 + edge, abs(r.x + 0.12));
  col += box * mix(1.35, 0.7, satin);
  float strip = smoothstep(0.52 - edge, 0.64, r.x) * (1.0 - smoothstep(0.78, 0.9 + edge, r.x));
  col += strip * smoothstep(-0.5, 0.25, up) * mix(0.9, 0.45, satin);
  col *= 1.0 - mix(0.6, 0.3, satin) * exp(-pow((up + 0.05) * mix(10.0, 5.0, satin), 2.0));
  return col;
}

void main() {
  float cover = texture(u_mask, v_uv).a;
  if (cover < 0.004) {
    o_color = vec4(0.0);
    return;
  }
  float aspect = u_res.x / max(u_res.y, 1.0);

  // The pour: a front climbing the mark from its foot, wobbling as it goes.
  float rel = clamp((v_uv.y - u_box.y) / max(u_box.w - u_box.y, 1e-4), 0.0, 1.0);
  float climb = 1.0 - rel;
  float front = u_pour / FILL;
  float pouring = 1.0 - smoothstep(0.95, 1.2, front);
  float wob = 0.035 * sin(v_uv.x * aspect * 15.0 + u_pour * 8.0) * pouring;
  float lead = front + wob - climb;
  float filled = smoothstep(-0.012, 0.012, lead);
  if (filled <= 0.0) {
    o_color = vec4(0.0);
    return;
  }

  vec4 f = texture(u_field, (v_uv - u_fieldBox.xy) / (u_fieldBox.zw - u_fieldBox.xy));
  vec2 slope = f.rg;
  float h = f.b;

  // The churn: value noise in a slowly drifting, warped domain, deepest on
  // the flat tops where a real melt moves most freely.
  vec2 p = vec2(v_uv.x * aspect, v_uv.y) * 3.4 + u_seed;
  float t = u_time;
  vec2 warp = vec2(
    kx_noise(p * 0.55 + vec2(t * 0.11, -t * 0.07)),
    kx_noise(p * 0.55 + vec2(-t * 0.09, t * 0.12) + 5.3)
  );
  vec2 q = p + warp * 2.4 + vec2(0.0, t * 0.16);
  float e = 0.08;
  float n0 = kx_noise(q);
  vec2 churn = vec2(kx_noise(q + vec2(e, 0.0)) - n0, kx_noise(q + vec2(0.0, e)) - n0) / e;
  churn *= u_ripple * 0.42 * (0.2 + 0.8 * smoothstep(0.3, 1.0, h));

  // A touch: one ring spreading from the drop and dying away.
  vec2 dp = vec2((v_uv.x - u_drop.x) * aspect, v_uv.y - u_drop.y);
  float dr = length(dp);
  float age = u_drop.z;
  float reach = 1.0 - smoothstep(age * 0.42 - 0.03, age * 0.42 + 0.03, dr);
  vec2 touch = dr > 1e-4
    ? (dp / dr) * cos(dr * 64.0 - age * 20.0) * exp(-age * 2.6) * exp(-dr * 5.0) * reach * u_drop.w
    : vec2(0.0);

  vec3 n = normalize(vec3(-(slope * 0.85 + churn + touch * 0.9), 1.0));
  vec3 r = vec3(0.0, 0.0, -1.0) + 2.0 * n.z * n;

  float satin = 1.0 - clamp(u_shine, 0.0, 1.0);
  vec3 env = studio(r, satin);
  vec3 col = env * u_tint * 1.08;
  // The key light: kept above the mark and off its axis, so flat tops never
  // white out; the pointer swings it across the upper hemisphere.
  vec3 l = normalize(vec3((u_light.x - 0.5) * 1.7, -0.45 + (u_light.y - 0.5) * 0.9, 0.8));
  float spec = pow(max(dot(r, l), 0.0), mix(260.0, 22.0, satin));
  col += spec * mix(2.2, 0.55, satin) * mix(u_tint, vec3(1.0), 0.7);
  float fresnel = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0);
  col += fresnel * 0.3 * mix(u_tint, vec3(1.0), 0.5);

  // Heat: incandescent behind the front, cooling to metal.
  float since = max(lead, 0.0) * FILL;
  float hot = clamp(u_heat, 0.0, 1.0) * exp(-since / COOL) * step(u_pour, 50.0);
  vec3 glow = mix(u_ember, u_hot, smoothstep(0.35, 0.95, hot));
  col = mix(col, glow * (0.55 + 0.7 * hot), clamp(hot * 1.15, 0.0, 1.0));
  col += vec3(0.6) * exp(-pow(lead * 55.0, 2.0)) * pouring;

  float a = cover * filled;
  o_color = vec4(min(col, vec3(1.0)) * a, a);
}
`;

/**
 * A mark or a word filled with liquid metal, in one WebGL2 pass inside the
 * shape's own mask. The mark is rasterised twice — a coverage mask at device
 * resolution for crisp edges, and a capped-resolution field from an exact
 * Euclidean distance transform whose circular profile (`bevel`) rolls the
 * edge like a meniscus — and its normals carry a slow churn of warped value
 * noise (`flow`, `ripple`). Every pixel reflects a procedural studio, a dark
 * floor under a softbox and a strip light, tinted by the metal, with a key
 * light that follows the pointer on the glide spring and a Fresnel rim.
 *
 * The server's frame is the empty mould. The first time it is in view the
 * metal pours in from the foot of the mark with a wobbling meniscus,
 * white-hot at the front and cooling through ember to metal (`heat`), and a
 * click drops a ring ripple into the surface. Without WebGL2, or after a lost
 * context, a still metallic gradient fills the mark. Under reduced motion it
 * is cast already, still, with the light moving without easing.
 */
export function MoltenMark({
  path = MARK,
  viewBox = "0 0 100 100",
  text,
  label,
  tint = "chrome",
  flow = 1,
  shine = 0.6,
  bevel = 0.75,
  ripple = 0.5,
  heat = 1,
  padding = 0.08,
  intro = true,
  pourKey,
  interactive = true,
  paused = false,
  seed = 5,
  dpr = 2,
  onPour,
  onPoured,
  className,
}: MoltenMarkProps) {
  const motionSafe = useMotionSafe();
  const gradientId = React.useId();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const wordRef = React.useRef<HTMLSpanElement | null>(null);
  const probeRef = React.useRef<HTMLSpanElement | null>(null);
  const [glKey, setGlKey] = React.useState(0);

  const lightX = useMotionValue(REST.x);
  const lightY = useMotionValue(REST.y);

  const metal = tint in TINTS ? TINTS[tint as MoltenMarkTint] : tint;
  const pad = clamp(padding, 0, 0.3);
  const vb = parseViewBox(viewBox);
  const name = label ?? text ?? "Molten mark";

  const params = React.useRef({
    path,
    vb,
    text,
    metal,
    flow,
    shine,
    bevel,
    ripple,
    heat,
    pad,
    intro,
    interactive,
    paused,
    seed,
    dpr,
    motionSafe,
    onPour,
    onPoured,
  });
  React.useEffect(() => {
    params.current = {
      path,
      vb,
      text,
      metal,
      flow,
      shine,
      bevel,
      ripple,
      heat,
      pad,
      intro,
      interactive,
      paused,
      seed,
      dpr,
      motionSafe,
      onPour,
      onPoured,
    };
  });

  const api = React.useRef<{
    rebuild: () => void;
    restyle: () => void;
    pour: () => void;
    drop: (x: number, y: number) => void;
    wake: () => void;
  } | null>(null);

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const still = () => {
      root.dataset.still = "";
      delete root.dataset.ready;
    };
    // Without WebGL2 the gradient still is the cast mark, from first view.
    const castStill = () => {
      still();
      const seen = new IntersectionObserver((entries) => {
        if (!entries[entries.length - 1]?.isIntersecting) return;
        seen.disconnect();
        params.current.onPoured?.();
      });
      seen.observe(root);
      return () => seen.disconnect();
    };
    const gl = createGL(canvas, { alpha: true, premultipliedAlpha: true });
    if (!gl) return castStill();
    const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
    if (!program) return castStill();
    const tri = createFullscreenTriangle(gl, program);
    const read = rgbReader();
    const maskCanvas = document.createElement("canvas");
    const fieldCanvas = document.createElement("canvas");
    let maskTex: WebGLTexture | null = null;
    let fieldTex: WebGLTexture | null = null;
    let box: [number, number, number, number] = [0, 0, 1, 1];
    let fieldBox: [number, number, number, number] = [0, 0, 1, 1];
    let room = 0.5;
    const colours = {
      tint: [0.85, 0.86, 0.88] as [number, number, number],
      hot: [1, 0.95, 0.8] as [number, number, number],
      ember: [0.75, 0.25, 0.15] as [number, number, number],
    };
    let raf = 0;
    let built = false;
    let lost = false;
    let inView = false;
    let introduced = false;
    let last = 0;
    let clock = 0;
    let pourAt = DONE;
    let pourReported = true;
    const drop = { x: 0.5, y: 0.5, age: 99, strength: 0 };
    let rebuildQueued = 0;
    let contextLost = false;
    const uniforms = {
      u_res: new Float32Array(2),
      u_box: new Float32Array(4),
      u_fieldBox: new Float32Array(4),
      u_time: 0,
      u_ripple: 0,
      u_shine: 0,
      u_pour: 0,
      u_heat: 0,
      u_light: new Float32Array(2),
      u_drop: new Float32Array(4),
      u_tint: new Float32Array(3),
      u_hot: new Float32Array(3),
      u_ember: new Float32Array(3),
      u_seed: 0,
      u_room: 0,
    };
    let drawnAt = 0;
    let lightMoved = 0;

    const resolve = (css: string): [number, number, number] => {
      const probe = probeRef.current;
      if (!probe) return [1, 1, 1];
      probe.style.color = css;
      const c = read(getComputedStyle(probe).color);
      return [c[0] / 255, c[1] / 255, c[2] / 255];
    };
    const restyle = () => {
      colours.tint = resolve(params.current.metal);
      colours.hot = resolve(HOT);
      colours.ember = resolve(EMBER);
      const [br, bg, bb] = resolve("var(--background)");
      room = clamp(0.2126 * br + 0.7152 * bg + 0.0722 * bb, 0, 1);
    };

    /** Rasterises the mark into the mask and the surface field. */
    const rebuild = () => {
      rebuildQueued = 0;
      if (lost) return;
      const w = root.clientWidth;
      const h = root.clientHeight;
      if (w < 2 || h < 2) return;
      const p = params.current;
      const size = resizeGL(gl, canvas, {
        dprCap: Math.min(2, Math.max(1, p.dpr)),
      });
      const ratio = size.width / w;
      maskCanvas.width = size.width;
      maskCanvas.height = size.height;
      // CPU-backed: the mask is read back twice (into the field and into a
      // texture), which a GPU canvas would stall on.
      const ctx = maskCanvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      ctx.fillStyle = "white";
      const word = wordRef.current;
      if (p.text && word) {
        const outer = root.getBoundingClientRect();
        const rect = word.getBoundingClientRect();
        const cs = getComputedStyle(word);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        ctx.textBaseline = "alphabetic";
        ctx.textAlign = "left";
        // The word's own tracking, where the canvas can set it.
        const spaced = ctx as CanvasRenderingContext2D & {
          letterSpacing?: string;
        };
        if ("letterSpacing" in spaced) spaced.letterSpacing = cs.letterSpacing;
        const m = ctx.measureText(p.text);
        const ascent = m.fontBoundingBoxAscent || m.actualBoundingBoxAscent;
        const descent = m.fontBoundingBoxDescent || m.actualBoundingBoxDescent;
        const left = rect.left - outer.left;
        const top = rect.top - outer.top;
        const baseline = top + (rect.height - (ascent + descent)) / 2 + ascent;
        ctx.fillText(p.text, left, baseline);
        box = [
          left / w,
          (baseline - m.actualBoundingBoxAscent) / h,
          (left + rect.width) / w,
          (baseline + m.actualBoundingBoxDescent) / h,
        ];
      } else {
        const innerW = w * (1 - 2 * p.pad);
        const innerH = h * (1 - 2 * p.pad);
        const scale = Math.min(innerW / p.vb.w, innerH / p.vb.h);
        const ox = w * p.pad + (innerW - p.vb.w * scale) / 2 - p.vb.x * scale;
        const oy = h * p.pad + (innerH - p.vb.h * scale) / 2 - p.vb.y * scale;
        ctx.setTransform(
          ratio * scale,
          0,
          0,
          ratio * scale,
          ratio * ox,
          ratio * oy,
        );
        try {
          ctx.fill(new Path2D(p.path), "nonzero");
        } catch {
          // A malformed path leaves an empty mould rather than a crash.
        }
        box = [
          (ox + p.vb.x * scale) / w,
          (oy + p.vb.y * scale) / h,
          (ox + (p.vb.x + p.vb.w) * scale) / w,
          (oy + (p.vb.y + p.vb.h) * scale) / h,
        ];
      }
      // The surface field covers the mark's own box (plus a margin), at up
      // to FIELD pixels on its long side, so a small mark is not starved of
      // resolution by the empty canvas around it.
      const margin = 4 / Math.max(1, Math.min(w, h));
      const fx0 = clamp(box[0] - margin, 0, 1);
      const fy0 = clamp(box[1] - margin, 0, 1);
      const fx1 = clamp(box[2] + margin, 0, 1);
      const fy1 = clamp(box[3] + margin, 0, 1);
      fieldBox = [
        fx0,
        fy0,
        Math.max(fx0 + 1e-3, fx1),
        Math.max(fy0 + 1e-3, fy1),
      ];
      const sx = Math.round(fx0 * maskCanvas.width);
      const sy = Math.round(fy0 * maskCanvas.height);
      const sw = Math.max(2, Math.round((fx1 - fx0) * maskCanvas.width));
      const sh = Math.max(2, Math.round((fy1 - fy0) * maskCanvas.height));
      const k = Math.min(1.5, FIELD / Math.max(sw, sh));
      const fw = Math.max(2, Math.round(sw * k));
      const fh = Math.max(2, Math.round(sh * k));
      fieldCanvas.width = fw;
      fieldCanvas.height = fh;
      const fctx = fieldCanvas.getContext("2d", { willReadFrequently: true });
      if (!fctx) return;
      fctx.clearRect(0, 0, fw, fh);
      fctx.drawImage(maskCanvas, sx, sy, sw, sh, 0, 0, fw, fh);
      const field = surfaceField(
        fctx.getImageData(0, 0, fw, fh).data,
        fw,
        fh,
        p.bevel,
      );
      maskTex = uploadTexture(gl, maskCanvas, { linear: true }, maskTex);
      fieldTex = uploadField(gl, field, fw, fh, fieldTex);
      built = true;
      draw();
      if (!root.dataset.ready) root.dataset.ready = "";
    };

    const queueRebuild = () => {
      if (rebuildQueued) return;
      rebuildQueued = requestAnimationFrame(rebuild);
    };

    const draw = () => {
      if (!built || lost || gl.isContextLost() || !maskTex || !fieldTex) return;
      const p = params.current;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      program.use();
      program.texture("u_mask", maskTex, 0);
      program.texture("u_field", fieldTex, 1);
      // One persistent uniform block, refilled in place each draw.
      uniforms.u_res[0] = root.clientWidth;
      uniforms.u_res[1] = root.clientHeight;
      uniforms.u_box.set(box);
      uniforms.u_fieldBox.set(fieldBox);
      uniforms.u_time = clock;
      uniforms.u_ripple = clamp(p.ripple, 0, 1);
      uniforms.u_shine = clamp(p.shine, 0, 1);
      uniforms.u_pour = pourAt;
      uniforms.u_heat = clamp(p.heat, 0, 1);
      uniforms.u_light[0] = lightX.get();
      uniforms.u_light[1] = lightY.get();
      uniforms.u_drop[0] = drop.x;
      uniforms.u_drop[1] = drop.y;
      uniforms.u_drop[2] = drop.age;
      uniforms.u_drop[3] = drop.strength;
      uniforms.u_tint.set(colours.tint);
      uniforms.u_hot.set(colours.hot);
      uniforms.u_ember.set(colours.ember);
      uniforms.u_seed = (Math.abs(p.seed) % 97) * 1.37;
      uniforms.u_room = room;
      program.set(uniforms);
      tri.draw();
    };

    const busy = () => {
      const p = params.current;
      return p.flow > 0 || pourAt < FILL + COOL * 5 || drop.age < 2.5;
    };

    const frame = (now: number) => {
      raf = 0;
      const p = params.current;
      if (!inView || document.hidden || p.paused || !p.motionSafe || lost) {
        last = 0;
        return;
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      clock += dt * clamp(p.flow, 0, 3);
      if (pourAt < DONE) {
        pourAt += dt;
        if (!pourReported && pourAt > FILL + COOL * 4) {
          pourReported = true;
          p.onPoured?.();
        }
        if (pourAt > FILL + COOL * 6) pourAt = DONE;
      }
      if (drop.age < 99) drop.age += dt;
      // The slow churn alone needs no more than ~40 draws a second, even on
      // a 120 Hz screen; a pour, a ripple or a moving light gets every frame.
      const ambient =
        pourAt >= DONE && drop.age >= 2.5 && now - lightMoved > 900;
      if (!ambient || now - drawnAt >= AMBIENT_MS) {
        drawnAt = now;
        draw();
      }
      if (!busy()) {
        last = 0;
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    const wake = () => {
      const p = params.current;
      if (!p.motionSafe || p.paused) {
        draw();
        return;
      }
      if (raf || !inView || document.hidden || lost) return;
      if (!busy()) {
        draw();
        return;
      }
      last = 0;
      raf = requestAnimationFrame(frame);
    };

    const pour = () => {
      const p = params.current;
      if (!p.motionSafe) {
        pourAt = DONE;
        draw();
        p.onPoured?.();
        return;
      }
      pourAt = 0;
      pourReported = false;
      p.onPour?.();
      wake();
    };

    api.current = {
      rebuild: queueRebuild,
      restyle: () => {
        restyle();
        draw();
      },
      pour,
      drop: (x, y) => {
        const p = params.current;
        if (!p.motionSafe || p.paused) return;
        const w = Math.max(1, root.clientWidth);
        const h = Math.max(1, root.clientHeight);
        drop.x = x / w;
        drop.y = y / h;
        drop.age = 0;
        drop.strength = 1;
        wake();
      },
      wake,
    };

    // Before the first view the metal waits in the mould; without an intro
    // (or under reduced motion) it is cast already.
    pourAt = params.current.intro && params.current.motionSafe ? -1 : DONE;
    restyle();
    const unsubscribe = [lightX, lightY].map((mv) =>
      mv.on("change", () => {
        lightMoved = performance.now();
        if (!raf) draw();
      }),
    );
    const sizer = new ResizeObserver(queueRebuild);
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inView = entry.isIntersecting;
      if (!inView) return;
      if (!introduced) {
        introduced = true;
        // A pour on first view; a mark that is cast already says so.
        if (pourAt < 0) pour();
        else params.current.onPoured?.();
      }
      wake();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const detach = onContextLoss(
      canvas,
      () => {
        lost = true;
        contextLost = true;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        still();
      },
      () => setGlKey((k) => k + 1),
    );
    void document.fonts?.ready.then(() => {
      if (!lost) queueRebuild();
    });
    delete root.dataset.still;

    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (rebuildQueued) cancelAnimationFrame(rebuildQueued);
      raf = 0;
      lost = true;
      for (const off of unsubscribe) off();
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      detach();
      // Objects from a lost context are gone already; deleting them on the
      // restored one is an error.
      if (!contextLost) {
        if (maskTex) gl.deleteTexture(maskTex);
        if (fieldTex) gl.deleteTexture(fieldTex);
        tri.dispose();
        program.dispose();
      }
      delete root.dataset.ready;
      api.current = null;
    };
  }, [glKey, lightX, lightY]);

  const pathKey = text ? `t:${text}` : `p:${path}:${viewBox}`;
  React.useEffect(() => {
    api.current?.rebuild();
  }, [pathKey, bevel, pad, dpr]);
  React.useEffect(() => {
    api.current?.restyle();
  }, [metal]);
  React.useEffect(() => {
    api.current?.wake();
  }, [flow, shine, ripple, heat, seed, paused, motionSafe]);
  const shownKey = React.useRef(pourKey);
  React.useEffect(() => {
    if (shownKey.current === pourKey) return;
    shownKey.current = pourKey;
    api.current?.pour();
  }, [pourKey]);

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect
      ? {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          w: Math.max(1, rect.width),
          h: Math.max(1, rect.height),
        }
      : { x: 0, y: 0, w: 1, h: 1 };
  };
  const aim = (x: number, y: number, eased: boolean) => {
    if (!eased || !motionSafe) {
      lightX.jump(r2(x));
      lightY.jump(r2(y));
      return;
    }
    animate(lightX, r2(x), springs.glide);
    animate(lightY, r2(y), springs.glide);
  };
  const touchStart = React.useRef<{ x: number; y: number } | null>(null);

  // The still: polished bands of the tint, like a bar of the metal under a
  // softbox, for a browser without WebGL2.
  const band = (share: number, toward: "white" | "black") =>
    `color-mix(in oklab, ${metal}, ${toward} ${Math.round(share * 100)}%)`;
  const stops: [number, string][] = [
    [0, band(0.55, "white")],
    [0.34, metal],
    [0.48, band(0.6, "black")],
    [0.56, band(0.3, "black")],
    [0.8, band(0.25, "white")],
    [1, band(0.35, "black")],
  ];
  const mould = "color-mix(in oklab, var(--foreground) 6%, transparent)";
  const fit = text ? Math.round((150 / Math.max(1, text.length)) * 10) / 10 : 0;

  return (
    <div
      ref={rootRef}
      role="img"
      aria-label={name}
      onPointerMove={(event) => {
        if (!interactive || event.pointerType === "touch") return;
        const at = local(event);
        aim(at.x / at.w, at.y / at.h, true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        if (motionSafe) {
          animate(lightX, REST.x, springs.drift);
          animate(lightY, REST.y, springs.drift);
        } else {
          aim(REST.x, REST.y, false);
        }
      }}
      onPointerDown={(event) => {
        if (!interactive) return;
        if (event.pointerType === "touch") {
          touchStart.current = { x: event.clientX, y: event.clientY };
          return;
        }
        if (event.button !== 0) return;
        const at = local(event);
        api.current?.drop(at.x, at.y);
      }}
      onPointerUp={(event) => {
        const start = touchStart.current;
        touchStart.current = null;
        if (!start || event.pointerType !== "touch") return;
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) {
          return;
        }
        const at = local(event);
        aim(at.x / at.w, at.y / at.h, false);
        api.current?.drop(at.x, at.y);
      }}
      onPointerCancel={() => {
        touchStart.current = null;
      }}
      className={cn(
        "group/molten-mark [container-type:size] relative isolate h-40 w-full",
        className,
      )}
    >
      {text ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center select-none"
        >
          <span className="relative">
            <span
              ref={wordRef}
              className="block leading-none font-extrabold tracking-[-0.02em] whitespace-nowrap transition-opacity duration-300 group-data-[still]/molten-mark:opacity-0"
              style={{
                fontSize: `min(62cqh, ${fit}cqw)`,
                color: mould,
                WebkitTextStroke: "1px var(--hairline-strong)",
              }}
            >
              {text}
            </span>
            <span
              className="absolute inset-0 block bg-clip-text leading-none font-extrabold tracking-[-0.02em] whitespace-nowrap text-transparent opacity-0 transition-opacity duration-300 group-data-[still]/molten-mark:opacity-100"
              style={{
                fontSize: `min(62cqh, ${fit}cqw)`,
                backgroundImage: `linear-gradient(180deg, ${stops
                  .map(([at, c]) => `${c} ${Math.round(at * 100)}%`)
                  .join(", ")})`,
              }}
            >
              {text}
            </span>
          </span>
        </span>
      ) : (
        <svg
          aria-hidden
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          preserveAspectRatio="xMidYMid meet"
          className="pointer-events-none absolute overflow-visible"
          style={{
            left: `${r2(pad * 100)}%`,
            right: `${r2(pad * 100)}%`,
            top: `${r2(pad * 100)}%`,
            bottom: `${r2(pad * 100)}%`,
            width: `${r2(100 - pad * 200)}%`,
            height: `${r2(100 - pad * 200)}%`,
          }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              {stops.map(([at, c]) => (
                <stop key={at} offset={at} style={{ stopColor: c }} />
              ))}
            </linearGradient>
          </defs>
          <path
            d={path}
            fillRule="nonzero"
            vectorEffect="non-scaling-stroke"
            className="stroke-hairline-strong transition-opacity duration-300 group-data-[still]/molten-mark:opacity-0"
            style={{ fill: mould, strokeWidth: 1 }}
          />
          <path
            d={path}
            fillRule="nonzero"
            fill={`url(#${gradientId})`}
            className="opacity-0 transition-opacity duration-300 group-data-[still]/molten-mark:opacity-100"
          />
        </svg>
      )}
      <canvas
        key={glKey}
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-[ready]/molten-mark:opacity-100"
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
