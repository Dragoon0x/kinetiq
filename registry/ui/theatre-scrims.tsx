"use client";

import * as React from "react";

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
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TheatreScrimsItem = {
  /** The painting. For WebGL it must be same-origin or served with CORS. @default a scene painted in code */
  src?: string;
  /** What the painting shows, for assistive technology. */
  alt: string;
  /** The scene's title. */
  caption?: string;
};

export type TheatreScrimsLighting = "warm" | "cool" | "dusk";

export type TheatreScrimsProps = {
  /** The paintings, front to back; the last is always the back cloth. @default defaultScrims (six) */
  items?: TheatreScrimsItem[];
  /** How many layers hang on the stage, 2 to 6: the first gauzes and the back cloth. @default 4 */
  layers?: number;
  /** How smoky the stage is, 0 (clear air) to 1 (beams standing in the haze). @default 0.45 */
  haze?: number;
  /** The lighting design: warm tungsten, cool moonlight or a dusk of rose and violet. @default "warm" */
  lighting?: TheatreScrimsLighting;
  /** How much a gauze billows and ripples as you pass through it, 0 to 1. @default 0.6 */
  ripple?: number;
  /** How brightly the gauze's threads glow when lit from behind, 0 to 1. @default 0.5 */
  weave?: number;
  /** Scroll distance from one scene to the next, px. @default 420 */
  range?: number;
  /** Height of the pinned stage, px. Give it the height of the scroll container it sits in. @default 520 */
  height?: number;
  /** Frame the stage with a proscenium and lay a floor of boards. @default true */
  proscenium?: boolean;
  /** Fires with the scene in view, from the scroll or key that moved it. */
  onLayerChange?: (index: number) => void;
  /** Fires as you dolly forward, 0 (the first gauze) to 1 (the back cloth). */
  onProgressChange?: (progress: number) => void;
  /** Names the stage for assistive technology. @default "Stage" */
  label?: string;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  className?: string;
};

/* -------------------------------- paintings ------------------------------- */

const PW = 640;
const PH = 416;

const paint = (body: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${PH}" viewBox="0 0 ${PW} ${PH}">${body}</svg>`,
  )}`;

const sky = (id: string, stops: [number, string][]) =>
  `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops
    .map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`)
    .join(
      "",
    )}</linearGradient></defs><rect width="${PW}" height="${PH}" fill="url(#${id})"/>`;

const ORCHARD = paint(`${sky("s", [
  [0, "rgb(92,70,120)"],
  [0.55, "rgb(226,140,110)"],
  [0.8, "rgb(246,196,140)"],
])}
<circle cx="420" cy="262" r="46" fill="rgb(252,222,168)"/>
<path d="M0 282 C 120 262 260 270 380 280 C 480 288 560 276 640 270 L640 416 L0 416Z" fill="rgb(110,70,86)"/>
${[0, 1, 2, 3]
  .map((row) =>
    Array.from({ length: 9 }, (_, c) => {
      const x = 20 + c * 76 + (row % 2) * 38;
      const y = 300 + row * 30;
      const r = 20 + row * 7;
      return `<rect x="${x - 2}" y="${y - 4}" width="4" height="${14 + row * 4}" fill="rgb(50,30,40)"/><circle cx="${x}" cy="${y - r}" r="${r}" fill="rgb(${78 - row * 12},${54 - row * 8},${70 - row * 10})"/>`;
    }).join(""),
  )
  .join("")}
<path d="M0 404 h640" stroke="rgb(40,24,32)" stroke-width="5"/>${Array.from({ length: 17 }, (_, i) => `<path d="M${i * 40 + 6} 388 v26" stroke="rgb(40,24,32)" stroke-width="4"/>`).join("")}`);

const RIVER = paint(`${sky("s", [
  [0, "rgb(10,18,48)"],
  [0.6, "rgb(34,58,104)"],
  [1, "rgb(60,90,130)"],
])}
<circle cx="470" cy="96" r="34" fill="rgb(236,234,214)"/><circle cx="470" cy="96" r="60" fill="rgb(236,234,214)" opacity="0.12"/>
${Array.from({ length: 30 }, (_, i) => `<circle cx="${(i * 97) % 640}" cy="${(i * 53) % 180}" r="${i % 4 ? 1 : 1.6}" fill="rgb(230,232,240)" opacity="0.8"/>`).join("")}
<path d="M0 236 C 120 210 240 220 320 232 C 420 246 520 214 640 224 L640 416 L0 416Z" fill="rgb(22,38,64)"/>
<path d="M260 416 C 300 360 360 330 420 300 C 470 278 520 262 600 252 L640 254 L640 268 C 560 276 500 296 450 324 C 400 352 360 384 340 416Z" fill="rgb(70,104,150)"/>
<path d="M470 262 v120" stroke="rgb(236,234,214)" stroke-width="10" stroke-dasharray="14 10" opacity="0.5"/>
${Array.from({ length: 22 }, (_, i) => `<path d="M${i * 14 + 8} 416 q ${i % 2 ? 6 : -4} -60 ${i % 3 ? 2 : 10} -${90 + (i % 5) * 16}" stroke="rgb(12,22,30)" stroke-width="3" fill="none"/>`).join("")}`);

const HARBOUR = paint(`${sky("s", [
  [0, "rgb(40,52,90)"],
  [0.6, "rgb(120,110,150)"],
  [1, "rgb(200,160,160)"],
])}
<path d="M0 270 L640 270 L640 416 L0 416Z" fill="rgb(44,62,96)"/>
<path d="M120 180 L520 120 L520 170 L120 196Z" fill="rgb(252,236,180)" opacity="0.22"/>
<path d="M96 270 L104 140 L126 140 L134 270Z" fill="rgb(232,226,214)"/><path d="M100 200 h32 M102 166 h28" stroke="rgb(170,60,52)" stroke-width="12"/>
<rect x="102" y="124" width="30" height="16" fill="rgb(252,232,170)"/><path d="M98 124 L117 104 L136 124Z" fill="rgb(40,40,50)"/>
<path d="M0 270 C 40 250 90 246 150 262 C 180 270 200 276 220 290 L0 300Z" fill="rgb(30,30,40)"/>
${[0, 1, 2]
  .map(
    (i) =>
      `<path d="M${330 + i * 100} 300 q 30 12 64 0 l -6 10 h -52z" fill="rgb(28,30,44)"/><path d="M${362 + i * 100} 300 v -46 l 24 40z" fill="rgb(236,226,206)"/>`,
  )
  .join("")}
${Array.from({ length: 14 }, (_, i) => `<path d="M${i * 46} ${330 + (i % 4) * 20} q 12 -4 24 0" stroke="rgb(140,150,190)" stroke-width="2" fill="none" opacity="0.6"/>`).join("")}`);

const SNOWFIELD = paint(`${sky("s", [
  [0, "rgb(150,160,184)"],
  [1, "rgb(220,224,232)"],
])}
<path d="M0 230 C 140 196 260 204 380 220 C 480 234 560 214 640 206 L640 416 L0 416Z" fill="rgb(236,240,246)"/>
<path d="M0 300 C 160 270 300 290 440 300 C 530 306 600 290 640 286 L640 416 L0 416Z" fill="rgb(250,250,252)"/>
${[60, 110, 150, 420, 470, 520, 560]
  .map((x, i) => {
    const h = 70 + (i % 3) * 24;
    const y = 300 - (i % 2) * 20;
    return `<path d="M${x} ${y - h} L${Math.round(x - h * 0.28)} ${y} L${Math.round(x + h * 0.28)} ${y}Z" fill="rgb(${30 + i * 4},${50 + i * 3},${52 + i * 4})"/><rect x="${x - 3}" y="${y}" width="6" height="12" fill="rgb(50,40,36)"/>`;
  })
  .join("")}
${Array.from({ length: 70 }, (_, i) => `<circle cx="${(i * 89) % 640}" cy="${(i * 61) % 400}" r="${1.4 + (i % 3)}" fill="rgb(255,255,255)" opacity="0.85"/>`).join("")}`);

const GARDEN = paint(`${sky("s", [
  [0, "rgb(170,200,214)"],
  [1, "rgb(240,226,196)"],
])}
<rect y="140" width="${PW}" height="200" fill="rgb(196,140,104)"/>
${Array.from({ length: 10 }, (_, r) => `<path d="M0 ${150 + r * 20} h640" stroke="rgb(170,116,86)" stroke-width="2"/>`).join("")}
<path d="M250 340 L250 220 C 250 160 390 160 390 220 L390 340Z" fill="rgb(84,110,80)"/>
<path d="M270 340 L270 226 C 270 178 370 178 370 226 L370 340Z" fill="rgb(232,214,170)"/>
<rect y="330" width="${PW}" height="86" fill="rgb(96,128,76)"/>
${Array.from({ length: 26 }, (_, i) => {
  const x = (i * 53) % 640;
  const y = 320 + (i % 5) * 14;
  const c = [
    "rgb(214,90,96)",
    "rgb(240,200,96)",
    "rgb(240,236,226)",
    "rgb(170,110,190)",
  ][i % 4];
  return `<path d="M${x} ${y + 20} v -24" stroke="rgb(60,90,52)" stroke-width="2"/><circle cx="${x}" cy="${y - 6}" r="7" fill="${c}"/>`;
}).join("")}`);

const SUNRISE = paint(`${sky("s", [
  [0, "rgb(70,90,150)"],
  [0.45, "rgb(236,150,140)"],
  [0.75, "rgb(252,206,150)"],
  [1, "rgb(252,232,190)"],
])}
<circle cx="320" cy="300" r="70" fill="rgb(255,236,190)"/><circle cx="320" cy="300" r="120" fill="rgb(255,236,190)" opacity="0.18"/>
${[
  [60, 120, 180],
  [340, 90, 220],
  [180, 190, 160],
  [480, 170, 200],
]
  .map(
    ([x, y, w]) =>
      `<ellipse cx="${x}" cy="${y}" rx="${Math.round((w ?? 0) / 2)}" ry="18" fill="rgb(250,206,196)" opacity="0.85"/><ellipse cx="${(x ?? 0) + 30}" cy="${(y ?? 0) - 10}" rx="${Math.round((w ?? 0) / 3)}" ry="16" fill="rgb(255,226,214)" opacity="0.9"/>`,
  )
  .join("")}
<path d="M0 330 C 140 310 240 320 320 330 C 420 342 520 318 640 322 L640 416 L0 416Z" fill="rgb(120,90,120)"/>
<path d="M0 370 C 160 352 320 366 640 356 L640 416 L0 416Z" fill="rgb(80,60,90)"/>
${[
  [200, 200],
  [222, 190],
  [246, 206],
  [410, 160],
  [432, 170],
]
  .map(
    ([x, y]) =>
      `<path d="M${x} ${y} q 6 -6 12 0 q 6 -6 12 0" stroke="rgb(60,50,70)" stroke-width="2" fill="none"/>`,
  )
  .join("")}`);

/** Six scenes painted in code, front to back: the default stage. */
export const defaultScrims: TheatreScrimsItem[] = [
  {
    src: ORCHARD,
    alt: "Rows of round orchard trees in silhouette against a low dusk sun",
    caption: "The orchard at dusk",
  },
  {
    src: RIVER,
    alt: "A river winding under a full moon, reeds dark in the foreground",
    caption: "The river at night",
  },
  {
    src: HARBOUR,
    alt: "A lighthouse sweeping its beam over a harbour of small sailing boats",
    caption: "The harbour light",
  },
  {
    src: SNOWFIELD,
    alt: "Pines on a snowfield under a grey sky, snow falling",
    caption: "The snowfield",
  },
  {
    src: GARDEN,
    alt: "A garden wall with a green door in an arch and flowers below",
    caption: "The garden wall",
  },
  {
    src: SUNRISE,
    alt: "A sun rising through pink and gold clouds over low hills, birds crossing",
    caption: "Sunrise",
  },
];

/* --------------------------------- shader -------------------------------- */

const MAX = 6;

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform sampler2D u_atlas;
uniform int u_count;
uniform float u_cam;
uniform float u_z[${MAX}];
uniform float u_rip[${MAX}];
uniform float u_ript[${MAX}];
uniform float u_haze;
uniform float u_weave;
uniform float u_billow;
uniform float u_floor;
uniform vec3 u_front;
uniform vec3 u_back;
uniform vec3 u_hazeCol;
uniform vec3 u_wall;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

const float B = 1.344;
const float A = B * 1.538;

vec3 tile(int i, vec2 uv) {
  uv = clamp(uv, vec2(0.003), vec2(0.997));
  float col = float(i % 3);
  float row = float(i / 3);
  return texture(u_atlas, (vec2(col, row) + uv) / vec2(3.0, 2.0)).rgb;
}

vec3 floorAt(vec3 hit, float t) {
  // Boards run away from you; their joints are staggered.
  float bx = hit.x / 0.32;
  float board = floor(bx);
  float seam = smoothstep(0.0, 0.06, fract(bx)) * smoothstep(1.0, 0.94, fract(bx));
  float joint = fract(hit.z / 1.6 + kx_hash(vec2(board, 3.0)));
  seam *= smoothstep(0.0, 0.01, joint) * smoothstep(1.0, 0.99, joint);
  vec3 wood = vec3(0.16, 0.1, 0.07) * (0.75 + 0.5 * kx_hash(vec2(board, floor(hit.z / 1.6))));
  wood *= mix(0.45, 1.0, seam);
  // Pools of light at each gauze's foot, where the front light falls.
  float pool = 0.0;
  for (int i = 0; i < ${MAX}; i += 1) {
    if (i >= u_count) break;
    float dz = hit.z - (u_z[i] - 0.35);
    pool += exp(-dz * dz * 3.0 - hit.x * hit.x * 0.35);
  }
  vec3 c = wood * (0.12 + 0.9 * pool * u_front);
  return c * exp(-t * 0.12);
}

void main() {
  vec2 p = v_uv * u_res;
  vec2 q = vec2(p.x - 0.5 * u_res.x, 0.5 * u_res.y - p.y) / (0.5 * u_res.y);
  vec3 col = u_wall;
  // The back wall glows faintly where the haze is lit.
  float tFloor = q.y < -0.001 && u_floor > 0.5 ? B / -q.y : 1e6;
  vec3 floorCol = tFloor < 1e5 ? floorAt(vec3(q.x * tFloor, -B, u_cam + tFloor), tFloor) : vec3(0.0);
  bool floorDone = tFloor >= 1e5;
  float far = 0.0;
  for (int i = 0; i < ${MAX}; i += 1) if (i < u_count) far = u_z[i];
  if (!floorDone && u_cam + tFloor > far) { col = floorCol; floorDone = true; }

  for (int k = ${MAX} - 1; k >= 0; k -= 1) {
    if (k >= u_count) continue;
    float d = u_z[k] - u_cam;
    if (!floorDone && tFloor > d) { col = floorCol; floorDone = true; }
    if (d < 0.015) continue;
    vec2 X = q * d;
    // Billow as you near it, and a ripple that runs out from the middle
    // after you pass through.
    float r = length(X / vec2(A, B));
    float near = smoothstep(0.75, 0.05, d) * u_billow;
    X *= 1.0 + 0.09 * near * (1.0 - min(r * r, 1.0));
    float e = u_rip[k];
    if (e > 0.001) {
      float w = sin(r * 16.0 - u_ript[k] * 9.0) * exp(-r * 0.9);
      X += normalize(X + 1e-4) * e * 0.035 * w * B;
    }
    vec2 uv = vec2(X.x / (2.0 * A) + 0.5, 0.5 - X.y / (2.0 * B));
    vec2 fw = fwidth(uv);
    vec2 edge = smoothstep(vec2(0.0), fw * 1.5, uv) * smoothstep(vec2(0.0), fw * 1.5, 1.0 - uv);
    float inside = edge.x * edge.y;
    if (inside <= 0.0) continue;
    bool back = k == u_count - 1;
    // Front-lit and solid far off; nearer, the light behind it rises and
    // it turns to gauze.
    float T = back ? 0.0 : smoothstep(1.15, 0.45, d);
    float lit = 1.0;
    if (k > 0) {
      float before = u_z[k - 1] - u_cam;
      lit = before < 0.015 ? 1.0 : smoothstep(1.15, 0.45, before);
    }
    vec2 c = uv - 0.5;
    float spot = exp(-dot(c, c) * 2.4);
    vec3 painting = tile(k, uv) * u_front * mix(0.62, 1.08, spot) * mix(1.0, 0.3, T) * lit;
    float alpha = (1.0 - 0.9 * T) * inside;
    // The weave: threads across and down, glowing when lit from behind.
    vec2 th = uv * vec2(260.0, 170.0);
    vec2 tw = fwidth(th);
    // Gauze is loose and uneven: each thread its own weight and wander.
    vec2 cell = floor(th);
    float wx = 0.55 + 0.45 * kx_hash(vec2(cell.x, 7.0));
    float wy = 0.55 + 0.45 * kx_hash(vec2(11.0, cell.y));
    float sx = 0.5 + 0.5 * cos((th.x + 0.18 * sin(th.y * 0.21 + cell.x)) * 6.2832);
    float sy = 0.5 + 0.5 * cos((th.y + 0.18 * sin(th.x * 0.17 + cell.y)) * 6.2832);
    float threads = max(pow(sx, 10.0) * wx, pow(sy, 10.0) * wy);
    threads *= 1.0 - smoothstep(0.2, 0.45, max(tw.x, tw.y));
    vec3 glow = u_back * threads * T * u_weave * 0.5 * inside;
    // The gauze softens what is behind it a little, and tints it.
    vec3 behind = col * mix(vec3(1.0), u_back, 0.25 * T);
    col = behind * (1.0 - alpha) + painting * alpha + glow + u_back * 0.05 * T * inside;
  }
  if (!floorDone && tFloor < 1e5) col = floorCol;

  // Haze: smoke drifting with depth, lit by shafts from the flies.
  float smoke = kx_fbm(q * 1.4 + vec2(0.0, u_cam * 0.35)) ;
  float beams = 0.0;
  for (int b = 0; b < 3; b += 1) {
    float bx = (float(b) - 1.0) * 0.75;
    float x = q.x - bx * (1.2 - 0.35 * q.y);
    beams += exp(-x * x / 0.05) * smoothstep(-1.0, 1.1, q.y);
  }
  vec3 air = u_hazeCol * (0.05 + 0.22 * beams) * (0.4 + 0.9 * smoke);
  col += air * u_haze;
  col *= 1.0 - 0.28 * smoothstep(0.7, 1.5, length(q * vec2(0.8, 1.0)));
  o_color = vec4(pow(clamp(col, 0.0, 1.0), vec3(0.94)), 1.0);
}
`;

/* ---------------------------------- looks -------------------------------- */

type Look = {
  front: [number, number, number];
  back: [number, number, number];
  haze: [number, number, number];
  wall: [number, number, number];
  css: string;
};

const LOOKS: Record<TheatreScrimsLighting, Look> = {
  warm: {
    front: [1.0, 0.9, 0.76],
    back: [1.0, 0.64, 0.4],
    haze: [1.0, 0.78, 0.55],
    wall: [0.03, 0.022, 0.02],
    css: "oklch(0.86 0.09 70)",
  },
  cool: {
    front: [0.84, 0.92, 1.0],
    back: [0.45, 0.62, 1.0],
    haze: [0.6, 0.74, 1.0],
    wall: [0.016, 0.022, 0.036],
    css: "oklch(0.82 0.08 250)",
  },
  dusk: {
    front: [1.0, 0.82, 0.8],
    back: [0.72, 0.5, 1.0],
    haze: [0.92, 0.62, 0.86],
    wall: [0.028, 0.02, 0.036],
    css: "oklch(0.8 0.09 330)",
  },
};

/* -------------------------------- component -------------------------------- */

const Z0 = 1.6;
const GAP = 1.7;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** The nearest ancestor that scrolls vertically, or null for the page. */
function scrollParent(node: HTMLElement): HTMLElement | null {
  for (let el = node.parentElement; el; el = el.parentElement) {
    if (/(auto|scroll|overlay)/.test(getComputedStyle(el).overflowY)) {
      return el;
    }
  }
  return null;
}

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  tex: WebGLTexture | null;
  lost: boolean;
};

/**
 * Painted gauzes hanging one behind another on a dark stage, and an eye that
 * dollies through them as the page scrolls. Each gauze is front-lit and
 * solid while you are far from it; as you approach, its front light falls
 * and the light behind it rises, so the painting fades to a faint image on
 * glowing threads and the next scene, now lit, shows through, small and deep
 * in the frame. Passing through, the gauze billows toward you, its weave
 * fills the frame for a moment and it is gone, rippling behind you; the last
 * painting is a solid back cloth. The shown progress follows the scroll on a
 * critically damped spring with the glide constants.
 *
 * One WebGL2 pass: every gauze is a plane at depth, sampled from one atlas,
 * composited by its front light, its transmission and its weave over a floor
 * of boards with pools of light, in haze lit by shafts from the flies. The
 * stage is focusable: Down, Page Down and Space go to the next scene, Up and
 * Page Up back, Home and End to either end. Under reduced motion (and without
 * WebGL2) the paintings cross-fade from one to the next instead.
 */
export function TheatreScrims({
  items = defaultScrims,
  layers = 4,
  haze = 0.45,
  lighting = "warm",
  ripple = 0.6,
  weave = 0.5,
  range = 420,
  height = 520,
  proscenium = true,
  onLayerChange,
  onProgressChange,
  label = "Stage",
  dpr = 2,
  className,
}: TheatreScrimsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const pool = items.length ? items : defaultScrims;
  const count = clamp(
    Math.round(layers),
    2,
    Math.min(MAX, Math.max(2, pool.length)),
  );
  const scenes = React.useMemo(() => {
    const last = pool[pool.length - 1] ?? defaultScrims[5];
    const front = pool.slice(0, Math.max(0, count - 1));
    return last ? [...front, last] : front;
  }, [pool, count]);
  const n = scenes.length;
  const span = Math.max(1, clamp(range, 120, 2000) * Math.max(1, n - 1));
  const look = LOOKS[lighting] ?? LOOKS.warm;

  const [index, setIndex] = React.useState(0);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const sectionRef = React.useRef<HTMLElement | null>(null);
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const gpuRef = React.useRef<Gpu | null>(null);
  const atlasRef = React.useRef<HTMLCanvasElement | null>(null);
  const images = React.useRef<(HTMLImageElement | null)[]>([]);
  const engine = React.useRef<{ kick: () => void; upload: () => void } | null>(
    null,
  );
  const reported = React.useRef({ index: 0, progress: -1 });

  const config = {
    n,
    scenes,
    span,
    haze: clamp(haze, 0, 1),
    ripple: clamp(ripple, 0, 1),
    weave: clamp(weave, 0, 1),
    proscenium,
    look,
    dpr: clamp(dpr, 0.5, 2),
    motionSafe,
    onLayerChange,
    onProgressChange,
  };
  const latest = React.useRef(config);
  React.useEffect(() => {
    latest.current = config;
    engine.current?.kick();
  });

  React.useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!section || !canvas || !stage) return;
    const scroller = scrollParent(section);
    const target: HTMLElement | Window = scroller ?? window;
    let p = -1;
    let v = 0;
    let frame = 0;
    let last = 0;
    let visible = false;
    let disposed = false;
    let detach = () => {};
    const rip = new Float32Array(MAX);
    const ript = new Float32Array(MAX);
    const zs = new Float32Array(MAX);

    const goal = () => {
      const c = latest.current;
      const top0 = scroller ? scroller.getBoundingClientRect().top : 0;
      const rel = section.getBoundingClientRect().top - top0;
      return clamp(-rel / c.span, 0, 1);
    };

    const report = (g: number) => {
      const c = latest.current;
      const i = clamp(Math.floor(g * (c.n - 1) + 0.4), 0, c.n - 1);
      const rounded = Math.round(g * 1000) / 1000;
      if (rounded !== reported.current.progress) {
        reported.current.progress = rounded;
        c.onProgressChange?.(rounded);
      }
      if (i !== reported.current.index) {
        reported.current.index = i;
        setIndex(i);
        c.onLayerChange?.(i);
        const item = c.scenes[i];
        setSaid((s) => ({
          n: s.n + 1,
          text: `Scene ${i + 1} of ${c.n}${item?.caption ? `: ${item.caption}` : ""}.`,
        }));
      }
    };

    const camOf = (x: number) => x * (latest.current.n - 1) * GAP;

    const draw = () => {
      const g = gpuRef.current;
      const c = latest.current;
      if (!g || g.lost || !g.tex || canvas.width < 2) return;
      const { gl } = g;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < MAX; i += 1) zs[i] = Z0 + i * GAP;
      g.program.set({
        u_res: [canvas.width, canvas.height],
        u_count: c.n,
        u_cam: camOf(clamp(p, 0, 1)),
        u_z: zs,
        u_rip: rip,
        u_ript: ript,
        u_haze: c.haze,
        u_weave: c.weave,
        u_billow: c.ripple,
        u_floor: c.proscenium ? 1 : 0,
        u_front: c.look.front,
        u_back: c.look.back,
        u_hazeCol: c.look.haze,
        u_wall: c.look.wall,
      });
      g.program.texture("u_atlas", g.tex, 0);
      g.tri.draw();
      if (!stage.hasAttribute("data-live")) stage.setAttribute("data-live", "");
    };

    const tick = (now: number) => {
      frame = 0;
      const c = latest.current;
      if (!visible || document.hidden) {
        last = 0;
        return;
      }
      const dt = last ? Math.min(0.04, (now - last) / 1000) : 1 / 60;
      last = now;
      const want = goal();
      report(want);
      const before = camOf(Math.max(0, p));
      if (p < 0) {
        p = want;
        v = 0;
      } else {
        const k = springs.glide.stiffness / springs.glide.mass;
        const d = springs.glide.damping / springs.glide.mass;
        const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
        const h = dt / steps;
        for (let i = 0; i < steps; i += 1) {
          v += (-k * (p - want) - d * v) * h;
          p += v * h;
        }
        if (Math.abs(p - want) < 2e-4 && Math.abs(v) < 2e-4) {
          p = want;
          v = 0;
        }
      }
      // Crossing a gauze's plane, either way, sets it rippling.
      const after = camOf(p);
      const speed = Math.abs(after - before) / dt;
      let rippling = false;
      for (let i = 0; i < c.n; i += 1) {
        const z = Z0 + i * GAP;
        if ((before - z) * (after - z) < 0) {
          rip[i] = Math.min(1, 0.35 + speed * 0.25) * c.ripple;
          ript[i] = 0;
        }
        const e = rip[i] ?? 0;
        if (e > 0.001) {
          ript[i] = (ript[i] ?? 0) + dt;
          rip[i] = e * Math.exp(-dt / 0.7);
          rippling = true;
        } else rip[i] = 0;
      }
      draw();
      if (p !== want || rippling) {
        frame = window.requestAnimationFrame(tick);
      } else last = 0;
    };

    const kick = () => {
      const c = latest.current;
      if (!c.motionSafe) {
        report(goal());
        return;
      }
      if (frame || !visible || document.hidden) return;
      frame = window.requestAnimationFrame(tick);
    };

    /** The atlas: up to six paintings cover-fitted into a 3 × 2 grid. */
    const upload = () => {
      const g = gpuRef.current;
      const c = latest.current;
      if (!g || g.lost) return;
      const atlas = atlasRef.current ?? document.createElement("canvas");
      atlasRef.current = atlas;
      atlas.width = PW * 3;
      atlas.height = PH * 2;
      const ctx = atlas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "rgb(30, 26, 24)";
      ctx.fillRect(0, 0, atlas.width, atlas.height);
      c.scenes.forEach((_, i) => {
        const img = images.current[i];
        if (!img || !img.complete || !img.naturalWidth) return;
        const s = Math.max(PW / img.naturalWidth, PH / img.naturalHeight);
        const iw = PW / s;
        const ih = PH / s;
        ctx.drawImage(
          img,
          (img.naturalWidth - iw) / 2,
          (img.naturalHeight - ih) / 2,
          iw,
          ih,
          (i % 3) * PW,
          Math.floor(i / 3) * PH,
          PW,
          PH,
        );
      });
      try {
        g.tex = uploadTexture(g.gl, atlas, {}, g.tex);
      } catch {
        stage.setAttribute("data-fallback", "");
      }
      draw();
    };

    const build = () => {
      const gl = createGL(canvas, { alpha: false });
      if (!gl) return false;
      const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
      if (!program) return false;
      const tri = createFullscreenTriangle(gl, program);
      gpuRef.current = { gl, program, tri, tex: null, lost: false };
      resizeGL(gl, canvas, { dprCap: latest.current.dpr });
      upload();
      return true;
    };
    const release = () => {
      const g = gpuRef.current;
      gpuRef.current = null;
      if (!g || g.lost) return;
      if (g.tex) g.gl.deleteTexture(g.tex);
      g.tri.dispose();
      g.program.dispose();
    };

    engine.current = {
      kick: () => {
        draw();
        kick();
      },
      upload,
    };
    if (latest.current.motionSafe) {
      if (!build()) stage.setAttribute("data-fallback", "");
      else {
        detach = onContextLoss(
          canvas,
          () => {
            if (gpuRef.current) gpuRef.current.lost = true;
            stage.removeAttribute("data-live");
          },
          () => {
            gpuRef.current = null;
            if (!disposed) build();
          },
        );
      }
    }

    report(goal());
    const onScroll = () => kick();
    target.addEventListener("scroll", onScroll, { passive: true });
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible = Boolean(entry?.isIntersecting);
      if (visible) {
        draw();
        kick();
      }
    });
    watcher.observe(stage);
    const sizer = new ResizeObserver(() => {
      const g = gpuRef.current;
      if (!g || g.lost) return;
      resizeGL(g.gl, canvas, { dprCap: latest.current.dpr });
      draw();
    });
    sizer.observe(canvas);
    const onVisibility = () => {
      if (!document.hidden) kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      target.removeEventListener("scroll", onScroll);
      watcher.disconnect();
      sizer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      engine.current = null;
      detach();
      release();
      stage.removeAttribute("data-live");
    };
  }, [motionSafe]);

  // The paintings load as images; each arrival rebuilds the atlas.
  React.useEffect(() => {
    let alive = true;
    const loaded: (HTMLImageElement | null)[] = scenes.map(() => null);
    images.current = loaded;
    const els = scenes.map((item, i) => {
      const el = new Image();
      const url = item.src ?? defaultScrims[i % 6]?.src ?? "";
      if (!url.startsWith("data:")) el.crossOrigin = "anonymous";
      el.decoding = "async";
      el.onload = () => {
        if (!alive) return;
        loaded[i] = el;
        engine.current?.upload();
      };
      el.src = url;
      return el;
    });
    return () => {
      alive = false;
      for (const el of els) el.onload = null;
    };
  }, [scenes, motionSafe]);

  /** Scrolls the container so the stage stands at scene `i`. */
  const goTo = (i: number) => {
    const section = sectionRef.current;
    if (!section) return;
    const scroller = scrollParent(section);
    const top0 = scroller ? scroller.getBoundingClientRect().top : 0;
    const now = scroller ? scroller.scrollTop : window.scrollY;
    const start = section.getBoundingClientRect().top - top0 + now;
    const p = n > 1 ? clamp(i, 0, n - 1) / (n - 1) : 0;
    const top = Math.max(0, Math.round(start + p * span));
    const behavior: ScrollBehavior = motionSafe ? "smooth" : "auto";
    if (scroller) scroller.scrollTo({ top, behavior });
    else window.scrollTo({ top, behavior });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowDown: index + 1,
      PageDown: index + 1,
      " ": index + 1,
      ArrowUp: index - 1,
      PageUp: index - 1,
      Home: 0,
      End: n - 1,
    };
    const to = moves[event.key];
    if (to === undefined) return;
    event.preventDefault();
    goTo(to);
  };

  return (
    <section
      ref={sectionRef}
      className={cn("relative w-full", className)}
      style={{ height: height + span }}
    >
      <div
        ref={stageRef}
        role="group"
        aria-roledescription="stage"
        aria-label={label}
        aria-describedby={hintId}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className={cn(
          "group/theatre-scrims sticky top-0 isolate w-full overflow-clip bg-[oklch(0.12_0.01_40)] outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
        style={{ height }}
      >
        {/* The still: front-lit paintings cross-fading, for the server, for
            reduced motion and for no WebGL2. */}
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 transition-opacity duration-300",
            motionSafe && "group-data-live/theatre-scrims:opacity-0",
          )}
        >
          {scenes.map((item, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={item.src ?? defaultScrims[i % 6]?.src}
              alt=""
              draggable={false}
              className={cn(
                "absolute inset-x-[7%] top-[12%] bottom-[16%] h-[72%] w-[86%] object-cover transition-opacity duration-400",
                i === index ? "opacity-100" : "opacity-0",
              )}
            />
          ))}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(60% 55% at 50% 48%, transparent 40%, color-mix(in oklab, black 62%, transparent) 100%), linear-gradient(to top, color-mix(in oklab, ${look.css} 18%, transparent), transparent 30%)`,
            }}
          />
        </div>
        <canvas
          ref={canvasRef}
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300",
            motionSafe && "group-data-live/theatre-scrims:opacity-100",
          )}
        />
        {proscenium ? (
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 h-[7%] bg-[oklch(0.13_0.012_30)] shadow-[0_6px_18px_color-mix(in_oklab,black_55%,transparent)]" />
            <div className="absolute inset-y-0 left-0 w-[4%] bg-[oklch(0.13_0.012_30)]" />
            <div className="absolute inset-y-0 right-0 w-[4%] bg-[oklch(0.13_0.012_30)]" />
            <div className="absolute inset-x-[4%] top-[7%] h-px bg-[oklch(0.62_0.08_75/0.45)]" />
            <div className="absolute inset-y-[7%] left-[4%] w-px bg-[oklch(0.62_0.08_75/0.3)]" />
            <div className="absolute inset-y-[7%] right-[4%] w-px bg-[oklch(0.62_0.08_75/0.3)]" />
            <div
              className="absolute inset-x-[4%] bottom-0 h-[9%]"
              style={{
                backgroundImage: `linear-gradient(to top, color-mix(in oklab, ${look.css} 22%, transparent), transparent)`,
              }}
            />
          </div>
        ) : null}
        <ol className="sr-only">
          {scenes.map((item, i) => (
            <li key={i}>
              <span role="img" aria-label={item.alt} />
              {` Scene ${i + 1}${item.caption ? `: ${item.caption}` : ""}`}
            </li>
          ))}
        </ol>
        <p id={hintId} className="sr-only">
          Scroll to move through the gauzes. Down, Page Down and Space go to the
          next scene, Up and Page Up back, Home and End to the first and last.
        </p>
        <p role="status" className="sr-only">
          <span key={said.n}>{said.text}</span>
        </p>
      </div>
    </section>
  );
}
