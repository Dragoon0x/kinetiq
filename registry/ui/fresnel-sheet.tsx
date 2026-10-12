"use client";

import * as React from "react";

import { motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createFullscreenTriangle,
  createGL,
  createProgram,
  FULLSCREEN_VERTEX,
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

export type FresnelSheetShape = "card" | "round";
export type FresnelSheetPosition = { x: number; y: number };

export type FresnelSheetProps = {
  /** The picture the sheet lies on. For WebGL it must be same-origin or served with CORS. @default a drawn chart of a bay */
  src?: string;
  /** What that picture shows, for assistive technology. @default a description of the drawn chart */
  alt?: string;
  /** The picture seen through the sheet, magnified about its centre. @default the same bay drawn from the air */
  revealSrc?: string;
  /** What the picture through the sheet shows. @default a description of the drawn aerial view */
  revealAlt?: string;
  /** How many concentric facets the sheet has, 4 (coarse steps) to 40 (fine ridges). @default 16 */
  rings?: number;
  /** How much the sheet magnifies, 1.2 to 4. @default 2.2 */
  magnify?: number;
  /** How bright the glare band and the ridges' sheen are, 0 (matte) to 1. @default 0.5 */
  glare?: number;
  /** How strong the rainbow fringes are at each facet's edge, 0 to 1. @default 0.5 */
  dispersion?: number;
  /** A credit-card sheet or a round one. @default "card" */
  shape?: FresnelSheetShape;
  /** The sheet's height as a share of the stage's, 0.4 to 1. @default 0.8 */
  size?: number;
  /** How quickly a thrown sheet stops, 0 (a long glide on smooth paper) to 1 (a quick stop). @default 0.5 */
  friction?: number;
  /** The sheet's centre, as fractions of the stage (controlled). A new value glides it there. */
  position?: FresnelSheetPosition;
  /** The sheet's starting centre when uncontrolled. @default { x: 0.62, y: 0.5 } */
  defaultPosition?: FresnelSheetPosition;
  /** Fires from the drag, tap or key that moved the sheet, with where it will come to rest. */
  onPositionChange?: (position: FresnelSheetPosition) => void;
  /** Names the sheet for assistive technology. @default "Fresnel sheet" */
  label?: string;
  /** Shows the sheet but takes no drags, taps or keys. @default false */
  disabled?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Sizes the stage. @default "h-56 w-full" */
  className?: string;
};

/* ---------------------------------- art ---------------------------------- */

const ART_W = 1200;
const ART_H = 520;

/** The bay's coastline: land along the top and the left, open water below. */
const COAST =
  "M0 0 L1200 0 L1200 92 C 1120 96 1040 104 990 132 C 940 160 930 206 880 214 C 820 224 790 186 740 194 C 680 204 650 246 600 270 C 550 294 500 312 446 318 C 392 324 360 300 318 314 C 270 330 250 372 214 410 C 180 446 150 486 128 520 L0 520 Z";

const svgUri = (body: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ART_W}" height="${ART_H}" viewBox="0 0 ${ART_W} ${ART_H}">${body}</svg>`,
  )}`;

/** A small seeded generator, so the art is the same on every load. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Points in open water: right of and below the coast, kept off the edges. */
const water = (() => {
  const rand = seeded(41);
  const out: [number, number][] = [];
  while (out.length < 46) {
    const x = 260 + rand() * 920;
    const y = 120 + rand() * 390;
    // A rough test against the coast: the shore runs from (1200,92) down
    // and left to (128,520).
    const shore = 92 + ((1200 - x) / 1072) * 380;
    if (y > shore + 40) out.push([Math.round(x), Math.round(y)]);
  }
  return out;
})();

const contours = [0.94, 0.86, 0.77, 0.66]
  .map(
    (s, i) =>
      `<path d="${COAST}" transform="translate(${Math.round(980 * (1 - s))} ${Math.round(560 * (1 - s))}) scale(${s})" fill="none" stroke="rgb(70,110,140)" stroke-opacity="${(0.5 - i * 0.08).toFixed(2)}" stroke-width="${(1.6 - i * 0.2).toFixed(1)}" stroke-dasharray="${i % 2 ? "6 5" : "none"}"/>`,
  )
  .join("");

const CHART = svgUri(`
<rect width="${ART_W}" height="${ART_H}" fill="rgb(236,232,218)"/>
${[1, 2, 3, 4, 5].map((i) => `<path d="M${i * 200} 0 V${ART_H}" stroke="rgb(170,160,140)" stroke-width="0.8"/>`).join("")}
${[1, 2].map((i) => `<path d="M0 ${i * 173} H${ART_W}" stroke="rgb(170,160,140)" stroke-width="0.8"/>`).join("")}
${contours}
<path d="${COAST}" fill="rgb(222,212,186)" stroke="rgb(60,56,48)" stroke-width="2.4"/>
${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  .map(
    (i) =>
      `<path d="M${40 + i * 92} 30 l14 -8 l14 8" fill="none" stroke="rgb(120,110,90)" stroke-width="1.2"/>`,
  )
  .join("")}
${water
  .map(
    ([x, y], i) =>
      `<text x="${x}" y="${y}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13" font-style="italic" fill="rgb(60,90,120)">${3 + ((i * 7) % 23)}</text>`,
  )
  .join("")}
<g transform="translate(1080 420)"><circle r="56" fill="none" stroke="rgb(90,80,64)" stroke-width="1.4"/><circle r="44" fill="none" stroke="rgb(90,80,64)" stroke-width="0.8"/><path d="M0 -62 L8 0 L0 62 L-8 0Z" fill="rgb(70,62,50)"/><path d="M-62 0 L0 6 L62 0 L0 -6Z" fill="rgb(150,140,120)"/><text y="-68" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="14" fill="rgb(60,56,48)">N</text></g>
<text x="560" y="420" font-family="ui-serif, Georgia, serif" font-size="34" letter-spacing="10" fill="rgb(52,70,92)">COLDBROOK BAY</text>
<text x="930" y="64" font-family="ui-serif, Georgia, serif" font-size="18" font-style="italic" fill="rgb(70,62,50)">Basin Head</text>
<text x="40" y="250" font-family="ui-serif, Georgia, serif" font-size="18" font-style="italic" fill="rgb(70,62,50)">Coldbrook</text>
<rect x="40" y="470" width="160" height="6" fill="none" stroke="rgb(60,56,48)"/><rect x="40" y="470" width="40" height="6" fill="rgb(60,56,48)"/><rect x="120" y="470" width="40" height="6" fill="rgb(60,56,48)"/>
<text x="40" y="496" font-family="ui-monospace, monospace" font-size="12" fill="rgb(60,56,48)">0     1     2 NM</text>`);

/** The open water, as the complement of the land along the same coast. */
const SEA =
  "M1200 92 C 1120 96 1040 104 990 132 C 940 160 930 206 880 214 C 820 224 790 186 740 194 C 680 204 650 246 600 270 C 550 294 500 312 446 318 C 392 324 360 300 318 314 C 270 330 250 372 214 410 C 180 446 150 486 128 520 L1200 520 Z";
const SHORE =
  "M1200 92 C 1120 96 1040 104 990 132 C 940 160 930 206 880 214 C 820 224 790 186 740 194 C 680 204 650 246 600 270 C 550 294 500 312 446 318 C 392 324 360 300 318 314 C 270 330 250 372 214 410 C 180 446 150 486 128 520";

const AERIAL = (() => {
  const rand = seeded(7);
  const greens = [
    "rgb(122,150,84)",
    "rgb(146,164,92)",
    "rgb(104,136,76)",
    "rgb(186,176,108)",
    "rgb(132,158,98)",
    "rgb(160,150,96)",
    "rgb(96,124,70)",
  ];
  // A patchwork of fields over everything; the sea is laid on top.
  const fields: string[] = [];
  for (let y = -10; y < ART_H; y += 46) {
    for (let x = -20; x < ART_W; x += 0) {
      const w = 54 + Math.round(rand() * 60);
      const h = 40 + Math.round(rand() * 10);
      const fill =
        greens[Math.floor(rand() * greens.length)] ?? "rgb(122,150,84)";
      const lines =
        rand() > 0.5
          ? Array.from(
              { length: 4 },
              (_, k) =>
                `<path d="M${x + 4} ${y + 8 + k * 9} h${w - 8}" stroke="rgb(0,0,0)" stroke-opacity="0.08" stroke-width="2"/>`,
            ).join("")
          : "";
      fields.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="rgb(70,92,52)" stroke-width="3"/>${lines}`,
      );
      x += w;
    }
  }
  const land = (x: number, y: number) =>
    y < 92 + ((1200 - x) / 1072) * 380 - 34;
  const trees: string[] = [];
  while (trees.length < 140) {
    const x = Math.round(rand() * ART_W);
    const y = Math.round(rand() * ART_H);
    if (!land(x, y)) continue;
    trees.push(
      `<circle cx="${x}" cy="${y}" r="${4 + Math.round(rand() * 4)}" fill="rgb(52,82,44)"/><circle cx="${x - 1}" cy="${y - 1}" r="2" fill="rgb(92,124,66)"/>`,
    );
  }
  const roofs: string[] = [];
  for (let i = 0; i < 34; i += 1) {
    const along = i < 22;
    const x = along
      ? 140 + i * 36 + Math.round(rand() * 10)
      : 30 + Math.round(rand() * 70);
    const y = along ? 54 + Math.round(rand() * 26) : 130 + (i - 22) * 26;
    if (!land(x, y)) continue;
    const red = (i * 7) % 3 !== 0;
    roofs.push(
      `<rect x="${x}" y="${y}" width="15" height="11" fill="${red ? "rgb(170,74,56)" : "rgb(120,118,116)"}"/><rect x="${x}" y="${y}" width="15" height="4" fill="${red ? "rgb(204,104,80)" : "rgb(156,154,150)"}"/>`,
    );
  }
  const glints: string[] = [];
  while (glints.length < 260) {
    const x = Math.round(rand() * ART_W);
    const y = Math.round(rand() * ART_H);
    if (y < 92 + ((1200 - x) / 1072) * 380 + 30) continue;
    glints.push(
      `<path d="M${x} ${y} q 5 -3 10 0" stroke="rgb(220,240,246)" stroke-opacity="${(0.25 + rand() * 0.35).toFixed(2)}" stroke-width="1.4" fill="none"/>`,
    );
  }
  const boats = water
    .slice(0, 12)
    .map(
      ([x, y], i) =>
        `<path d="M${x - 34} ${y + 4} q 17 ${i % 2 ? 5 : -5} 34 -1" stroke="rgb(214,238,242)" stroke-opacity="0.75" stroke-width="2.4" fill="none"/><path d="M${x - 8} ${y} q 8 -5 16 0 q -8 5 -16 0z" fill="rgb(250,250,246)"/><rect x="${x - 2}" y="${y - 2}" width="4" height="3" fill="rgb(176,72,56)"/>`,
    )
    .join("");
  return svgUri(`
<defs><radialGradient id="sea" cx="0.9" cy="1.05" r="1.1"><stop offset="0" stop-color="rgb(12,58,106)"/><stop offset="0.55" stop-color="rgb(26,100,148)"/><stop offset="0.85" stop-color="rgb(56,152,172)"/><stop offset="1" stop-color="rgb(104,190,190)"/></radialGradient><clipPath id="water"><path d="${SEA}"/></clipPath></defs>
<rect width="${ART_W}" height="${ART_H}" fill="rgb(116,146,82)"/>
${fields.join("")}
<path d="M0 86 C 300 94 600 70 980 110" stroke="rgb(206,196,170)" stroke-width="6" fill="none"/>
<path d="M60 0 C 70 160 90 300 60 520" stroke="rgb(206,196,170)" stroke-width="5" fill="none"/>
${trees.join("")}
${roofs.join("")}
<path d="${SEA}" fill="url(#sea)"/>
<g clip-path="url(#water)">
<path d="${SHORE}" stroke="rgb(150,214,204)" stroke-opacity="0.6" stroke-width="56" fill="none"/>
<path d="${SHORE}" stroke="rgb(178,226,214)" stroke-opacity="0.6" stroke-width="22" fill="none"/>
<path d="M560 430 C 680 380 820 392 920 432 C 820 420 690 412 560 430Z" fill="rgb(216,206,160)" opacity="0.75"/>
${glints.join("")}
${boats}
</g>
<path d="${SHORE}" stroke="rgb(226,212,166)" stroke-width="9" fill="none"/>
<path d="M640 254 l 76 70" stroke="rgb(120,100,76)" stroke-width="7"/>`);
})();

const DEFAULT_ALT =
  "A printed chart of Coldbrook Bay: the coastline, depth contours, soundings and a compass rose.";
const DEFAULT_REVEAL_ALT =
  "The same bay from the air: green fields and red roofs along the shore, sand, a pier and boats on blue water.";

/* --------------------------------- shader -------------------------------- */

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform float u_dpr;
uniform sampler2D u_a;
uniform sampler2D u_b;
uniform vec2 u_texA;
uniform vec2 u_texB;
uniform vec2 u_c;
uniform vec2 u_half;
uniform float u_round;
uniform float u_radius;
uniform float u_rings;
uniform float u_mag;
uniform float u_glare;
uniform float u_disp;
uniform float u_lift;
in vec2 v_uv;
out vec4 o_color;

vec2 cover(vec2 p, vec2 tex) {
  float s = max(u_res.x / tex.x, u_res.y / tex.y);
  vec2 size = tex * s;
  return (p - 0.5 * (u_res - size)) / size;
}

float sdBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float sheet(vec2 d) {
  return u_round > 0.5 ? length(d) - u_half.y : sdBox(d, u_half, u_radius);
}

void main() {
  vec2 p = v_uv * u_res;
  vec3 col = texture(u_a, cover(p, u_texA)).rgb;
  vec2 d = p - u_c;
  float sd = sheet(d);

  // The sheet's shadow on the paper, deeper and wider while it is lifted.
  vec2 so = vec2(3.0, 5.0) * u_dpr * (1.0 + 1.6 * u_lift);
  float blur = (5.0 + 9.0 * u_lift) * u_dpr;
  float shade = (1.0 - smoothstep(-blur, blur, sheet(d - so))) * (0.26 + 0.12 * u_lift);
  col *= 1.0 - shade * step(0.0, sd);

  float inside = 1.0 - smoothstep(-u_dpr, u_dpr, sd);
  if (inside > 0.0) {
    float R = u_round > 0.5 ? u_half.y : length(u_half);
    float zw = R / u_rings;
    float r = length(d);
    vec2 dir = r > 1e-3 ? d / r : vec2(0.0, -1.0);
    float z = r / zw;
    float k = floor(z);
    float t = fract(z);
    // Each ring is a flat facet: its band of the picture is magnified a
    // little more than the lens as a whole, about the facet's own middle, so
    // neighbouring bands are slightly out of register.
    float mid = (k + 0.5) * zw;
    float rs = (mid + (r - mid) * 1.6) / u_mag;
    // Red and blue bend differently, most at the facet edges.
    float e = pow(abs(t - 0.5) * 2.0, 3.0);
    float spread = u_disp * (0.6 + 2.6 * e) * (0.35 + r / R) * u_dpr;
    vec3 pick;
    pick.r = texture(u_b, cover(u_c + dir * (rs + spread), u_texB)).r;
    pick.g = texture(u_b, cover(u_c + dir * rs, u_texB)).g;
    pick.b = texture(u_b, cover(u_c + dir * (rs - spread), u_texB)).b;
    // The plastic: a hair of grey and a little contrast lost.
    vec3 lens = mix(pick, vec3(dot(pick, vec3(0.333))), 0.05) * 0.95 + 0.025;
    lens *= 1.0 - 0.12 * smoothstep(0.55 * R, R, r);

    vec2 lamp = normalize(vec2(-0.55, -0.83));
    float fw = max(fwidth(z), 1e-4);
    // Each facet's riser faces the centre: lit on the lamp's side, dark on
    // the far side.
    float riser = 1.0 - smoothstep(0.0, 1.4 * fw, 1.0 - t);
    float facing = dot(-dir, lamp);
    lens += riser * (facing > 0.0 ? 0.32 * facing : 0.22 * facing) * (0.35 + 0.65 * u_glare) * smoothstep(0.0, 2.0, z);
    // Concentric grooves throw an anisotropic sheen across the line
    // perpendicular to the light, like a record's.
    float aniso = exp(-pow(dot(dir, lamp), 2.0) * 22.0);
    lens += aniso * 0.16 * u_glare * smoothstep(0.08 * R, 0.3 * R, r) * (1.0 - smoothstep(0.8 * R, R, r));
    // A broad glare band fixed in the room: the sheet slides under it.
    float g = dot(p / u_res.y, normalize(vec2(1.0, 0.72)));
    lens += exp(-pow((g - 0.62) / 0.11, 2.0)) * 0.3 * u_glare;
    // The cut edge: a bright hairline inside it.
    lens += (1.0 - smoothstep(0.0, 2.2 * u_dpr, abs(sd + 1.6 * u_dpr))) * 0.32;
    col = mix(col, clamp(lens, 0.0, 1.0), inside);
  }
  o_color = vec4(col, 1.0);
}
`;

/* -------------------------------- component -------------------------------- */

type Sim = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  mode: "idle" | "drag" | "slide" | "glide";
  lift: number;
  liftV: number;
  liftT: number;
  frame: number;
  last: number;
  visible: boolean;
  w: number;
  h: number;
};

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  texA: WebGLTexture | null;
  texB: WebGLTexture | null;
  sizeA: [number, number];
  sizeB: [number, number];
  lost: boolean;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const where = (p: FresnelSheetPosition) => {
  const across = p.x < 0.36 ? "left" : p.x > 0.64 ? "right" : "";
  const down = p.y < 0.36 ? "top" : p.y > 0.64 ? "bottom" : "middle";
  if (!across) return down === "middle" ? "the middle" : `the ${down}`;
  return `the ${down} ${across}`;
};

/**
 * A flat plastic Fresnel magnifier lying on a printed chart. Through its
 * concentric ridges you see a second picture — the same bay from the air —
 * magnified about the sheet's centre and broken into rings: each ring is a
 * flat facet, so its band is slightly out of register with its neighbours,
 * with a faint rainbow fringe where red and blue bend differently at each
 * step. The ridges catch the lamp (a bright riser on its side, a dark one on
 * the far side), throw an anisotropic sheen across the rings, and a broad
 * glare band fixed in the room slides across the plastic as the sheet moves.
 *
 * Drag it 1:1; let go and it slides on with the release velocity and stops on
 * friction, meeting the edge with a soft bounce on the snap spring. Tap the
 * chart elsewhere and it glides there. It is a focusable group: the arrow
 * keys move it (Shift for larger steps) and Home centres it. Drawn in one
 * WebGL2 pass; without WebGL2 a CSS sheet shows the magnified picture with
 * ring lines and a glare. Under reduced motion it follows a drag but does not
 * slide, and keys and taps move it in place.
 */
export function FresnelSheet({
  src,
  alt = DEFAULT_ALT,
  revealSrc,
  revealAlt = DEFAULT_REVEAL_ALT,
  rings = 16,
  magnify = 2.2,
  glare = 0.5,
  dispersion = 0.5,
  shape = "card",
  size = 0.8,
  friction = 0.5,
  position,
  defaultPosition = { x: 0.62, y: 0.5 },
  onPositionChange,
  label = "Fresnel sheet",
  disabled = false,
  dpr = 2,
  className,
}: FresnelSheetProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const imageA = src ?? CHART;
  const imageB = revealSrc ?? AERIAL;
  const start = position ?? defaultPosition;

  const [box, setBox] = React.useState({ w: 640, h: 208 });
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [held, setHeld] = React.useState(false);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const gpuRef = React.useRef<Gpu | null>(null);
  const engine = React.useRef<{ upload: () => void } | null>(null);
  /** Set when the visitor moved the sheet, so only a real move is spoken. */
  const moved = React.useRef(false);
  const imgs = React.useRef<{
    a: HTMLImageElement | null;
    b: HTMLImageElement | null;
  }>({ a: null, b: null });

  /** The sheet's size in CSS px for a stage. */
  const sheetOf = (w: number, h: number) => {
    const sh = clamp(size, 0.4, 1) * h;
    const round = shape === "round";
    const sw = round ? sh : Math.min(sh * 1.6, w - 12);
    const hh = round ? Math.min(sh, w - 12) : sh;
    return { sw: round ? hh : sw, sh: hh, radius: round ? hh / 2 : 14 };
  };
  const S = sheetOf(box.w, box.h);

  const sim = React.useRef<Sim>({
    x: start.x * 640,
    y: start.y * 208,
    vx: 0,
    vy: 0,
    tx: start.x * 640,
    ty: start.y * 208,
    mode: "idle",
    lift: 0,
    liftV: 0,
    liftT: 0,
    frame: 0,
    last: 0,
    visible: false,
    w: 640,
    h: 208,
  });

  // The handle and the CSS sheet follow the sim through motion values.
  const hx = useMotionValue(r2(start.x * 640 - S.sw / 2));
  const hy = useMotionValue(r2(start.y * 208 - S.sh / 2));
  const bgPos = useMotionValue("0px 0px");

  const config = {
    rings: clamp(rings, 4, 40),
    magnify: clamp(magnify, 1.2, 4),
    glare: clamp(glare, 0, 1),
    dispersion: clamp(dispersion, 0, 1),
    round: shape === "round",
    S,
    friction: clamp(friction, 0, 1),
    dpr: clamp(dpr, 0.5, 2),
    motionSafe,
    onPositionChange,
  };
  const latest = React.useRef(config);

  const bounds = () => {
    const s = sim.current;
    const c = latest.current;
    const mx = Math.min(c.S.sw / 2 + 4, s.w / 2);
    const my = Math.min(c.S.sh / 2 + 4, s.h / 2);
    return { x0: mx, x1: s.w - mx, y0: my, y1: s.h - my };
  };

  const draw = React.useCallback(() => {
    const g = gpuRef.current;
    const canvas = canvasRef.current;
    const s = sim.current;
    const c = latest.current;
    if (!g || g.lost || !canvas || !g.texA || !g.texB || canvas.width < 2) {
      return;
    }
    const { gl } = g;
    const k = canvas.width / Math.max(1, s.w);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    g.program.set({
      u_res: [canvas.width, canvas.height],
      u_dpr: k,
      u_texA: g.sizeA,
      u_texB: g.sizeB,
      u_c: [s.x * k, s.y * k],
      u_half: [(c.S.sw / 2) * k, (c.S.sh / 2) * k],
      u_round: c.round ? 1 : 0,
      u_radius: c.S.radius * k,
      u_rings: c.rings,
      u_mag: c.magnify,
      u_glare: c.glare,
      u_disp: c.dispersion,
      u_lift: clamp(s.lift, 0, 1.4),
    });
    g.program.texture("u_a", g.texA, 0);
    g.program.texture("u_b", g.texB, 1);
    g.tri.draw();
    const root = rootRef.current;
    if (root && !root.hasAttribute("data-live")) {
      root.setAttribute("data-live", "");
    }
  }, []);

  /** Moves the handle and the CSS sheet to the sim's position. */
  const place = React.useCallback(() => {
    const s = sim.current;
    const c = latest.current;
    hx.set(r2(s.x - c.S.sw / 2));
    hy.set(r2(s.y - c.S.sh / 2));
    // The CSS sheet: the reveal picture cover-fitted, then magnified about
    // the sheet's centre, positioned relative to the sheet's corner.
    const cs = Math.max(s.w / ART_W, s.h / ART_H);
    const offX = (s.w - ART_W * cs) / 2;
    const offY = (s.h - ART_H * cs) / 2;
    const bx = c.S.sw / 2 - (s.x - offX) * c.magnify;
    const by = c.S.sh / 2 - (s.y - offY) * c.magnify;
    bgPos.set(`${r2(bx)}px ${r2(by)}px`);
  }, [hx, hy, bgPos]);

  const tickRef = React.useRef<(now: number) => void>(() => {});
  React.useEffect(() => {
    latest.current = config;
    tickRef.current = (now: number) => {
      const s = sim.current;
      const c = latest.current;
      s.frame = 0;
      if (!s.visible || document.hidden) {
        s.last = 0;
        return;
      }
      const dt = s.last ? Math.min(0.04, (now - s.last) / 1000) : 1 / 60;
      s.last = now;
      const b = bounds();
      const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / steps;
      const tau = lerp(0.9, 0.18, c.friction);
      const sk = springs.snap.stiffness / springs.snap.mass;
      const sc = springs.snap.damping / springs.snap.mass;
      const gk = springs.glide.stiffness / springs.glide.mass;
      const gc = springs.glide.damping / springs.glide.mass;
      const fk = springs.flick.stiffness / springs.flick.mass;
      const fc = springs.flick.damping / springs.flick.mass;
      for (let i = 0; i < steps; i += 1) {
        if (s.mode === "slide") {
          // Friction: speed decays with a time constant set by `friction`;
          // past an edge the snap spring pulls it back with one soft bounce.
          const decay = Math.exp(-h / tau);
          s.vx *= decay;
          s.vy *= decay;
          if (s.x < b.x0) s.vx += (-sk * (s.x - b.x0) - sc * s.vx) * h;
          if (s.x > b.x1) s.vx += (-sk * (s.x - b.x1) - sc * s.vx) * h;
          if (s.y < b.y0) s.vy += (-sk * (s.y - b.y0) - sc * s.vy) * h;
          if (s.y > b.y1) s.vy += (-sk * (s.y - b.y1) - sc * s.vy) * h;
          s.x += s.vx * h;
          s.y += s.vy * h;
        } else if (s.mode === "glide") {
          s.vx += (-gk * (s.x - s.tx) - gc * s.vx) * h;
          s.vy += (-gk * (s.y - s.ty) - gc * s.vy) * h;
          s.x += s.vx * h;
          s.y += s.vy * h;
        }
        s.liftV += (-fk * (s.lift - s.liftT) - fc * s.liftV) * h;
        s.lift += s.liftV * h;
      }
      if (!c.motionSafe) {
        s.lift = s.liftT;
        s.liftV = 0;
      }
      let moving =
        Math.abs(s.lift - s.liftT) > 0.002 || Math.abs(s.liftV) > 0.01;
      if (s.mode === "slide") {
        const inside =
          s.x >= b.x0 - 0.3 &&
          s.x <= b.x1 + 0.3 &&
          s.y >= b.y0 - 0.3 &&
          s.y <= b.y1 + 0.3;
        if (Math.hypot(s.vx, s.vy) < 4 && inside) s.mode = "idle";
        else moving = true;
      } else if (s.mode === "glide") {
        if (
          Math.hypot(s.x - s.tx, s.y - s.ty) < 0.2 &&
          Math.hypot(s.vx, s.vy) < 2
        ) {
          s.x = s.tx;
          s.y = s.ty;
          s.mode = "idle";
        } else moving = true;
      } else if (s.mode === "drag") moving = true;
      place();
      draw();
      if (moving) {
        s.frame = window.requestAnimationFrame(tickRef.current);
        return;
      }
      s.last = 0;
      s.vx = s.vy = 0;
      if (!moved.current) return;
      moved.current = false;
      const at = { x: r3(s.x / s.w), y: r3(s.y / s.h) };
      setSaid((p) => ({
        n: p.n + 1,
        text: `Sheet over ${where(at)} of the chart.`,
      }));
    };
  });

  const kick = React.useCallback(() => {
    const s = sim.current;
    if (s.frame || !s.visible || document.hidden) return;
    s.frame = window.requestAnimationFrame((t) => tickRef.current(t));
  }, []);

  /** Reports where the sheet will come to rest, as fractions. */
  const report = (x: number, y: number) => {
    const s = sim.current;
    moved.current = true;
    latest.current.onPositionChange?.({
      x: r3(clamp(x / s.w, 0, 1)),
      y: r3(clamp(y / s.h, 0, 1)),
    });
  };

  /** Glides (or, under reduced motion, moves) the sheet to a point. */
  const goTo = (x: number, y: number, tell = true) => {
    const s = sim.current;
    const b = bounds();
    s.tx = clamp(x, b.x0, b.x1);
    s.ty = clamp(y, b.y0, b.y1);
    if (!latest.current.motionSafe) {
      s.x = s.tx;
      s.y = s.ty;
      s.vx = s.vy = 0;
      s.mode = "glide";
    } else s.mode = "glide";
    kick();
    if (tell) report(s.tx, s.ty);
  };

  // GL: built once; images and size are fed in as they change.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    const s = sim.current;
    let detach = () => {};
    let disposed = false;
    const upload = () => {
      const g = gpuRef.current;
      if (!g || g.lost) return;
      const { a, b } = imgs.current;
      try {
        if (a?.complete && a.naturalWidth) {
          g.texA = uploadTexture(g.gl, a, {}, g.texA);
          g.sizeA = [a.naturalWidth, a.naturalHeight];
        }
        if (b?.complete && b.naturalWidth) {
          g.texB = uploadTexture(g.gl, b, {}, g.texB);
          g.sizeB = [b.naturalWidth, b.naturalHeight];
        }
      } catch {
        // A cross-origin picture without CORS cannot become a texture.
        root.setAttribute("data-fallback", "");
      }
      draw();
    };
    const build = () => {
      const gl = createGL(canvas, { alpha: false });
      if (!gl) return false;
      const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
      if (!program) return false;
      const tri = createFullscreenTriangle(gl, program);
      gpuRef.current = {
        gl,
        program,
        tri,
        texA: null,
        texB: null,
        sizeA: [ART_W, ART_H],
        sizeB: [ART_W, ART_H],
        lost: false,
      };
      resizeGL(gl, canvas, { dprCap: latest.current.dpr });
      upload();
      return true;
    };
    const release = () => {
      const g = gpuRef.current;
      gpuRef.current = null;
      if (!g || g.lost) return;
      if (g.texA) g.gl.deleteTexture(g.texA);
      if (g.texB) g.gl.deleteTexture(g.texB);
      g.tri.dispose();
      g.program.dispose();
    };
    if (!build()) root.setAttribute("data-fallback", "");
    else {
      detach = onContextLoss(
        canvas,
        () => {
          if (gpuRef.current) gpuRef.current.lost = true;
          root.removeAttribute("data-live");
        },
        () => {
          gpuRef.current = null;
          if (!disposed) build();
        },
      );
    }
    engine.current = { upload };
    const sizer = new ResizeObserver(() => {
      const w = Math.max(1, root.clientWidth);
      const h = Math.max(1, root.clientHeight);
      // Keep the sheet where it was, as a share of the stage.
      const fx = s.x / s.w;
      const fy = s.y / s.h;
      const ftx = s.tx / s.w;
      const fty = s.ty / s.h;
      s.w = w;
      s.h = h;
      s.x = fx * w;
      s.y = fy * h;
      s.tx = ftx * w;
      s.ty = fty * h;
      setBox((p) =>
        p.w === Math.round(w) && p.h === Math.round(h)
          ? p
          : { w: Math.round(w), h: Math.round(h) },
      );
      const g = gpuRef.current;
      if (g && !g.lost) resizeGL(g.gl, canvas, { dprCap: latest.current.dpr });
      const b = bounds();
      s.x = clamp(s.x, b.x0, b.x1);
      s.y = clamp(s.y, b.y0, b.y1);
      place();
      draw();
    });
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      s.visible = Boolean(entry?.isIntersecting);
      if (s.visible) {
        draw();
        kick();
      }
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) {
        draw();
        kick();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      engine.current = null;
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (s.frame) window.cancelAnimationFrame(s.frame);
      s.frame = 0;
      s.last = 0;
      s.visible = false;
      detach();
      release();
      root.removeAttribute("data-live");
    };
    // bounds and place read refs only; this effect runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw, kick]);

  // Both pictures load as images and become textures when they arrive.
  React.useEffect(() => {
    let alive = true;
    const load = (url: string, key: "a" | "b") => {
      const el = new Image();
      if (!url.startsWith("data:")) el.crossOrigin = "anonymous";
      el.decoding = "async";
      el.onload = () => {
        if (!alive) return;
        imgs.current[key] = el;
        engine.current?.upload();
      };
      el.src = url;
      return el;
    };
    const a = load(imageA, "a");
    const b = load(imageB, "b");
    return () => {
      alive = false;
      a.onload = null;
      b.onload = null;
    };
  }, [imageA, imageB]);

  // Look changes redraw; a new size or shape keeps the sheet inside.
  React.useEffect(() => {
    const s = sim.current;
    const b = bounds();
    s.x = clamp(s.x, b.x0, b.x1);
    s.y = clamp(s.y, b.y0, b.y1);
    place();
    draw();
  }, [draw, place, rings, magnify, glare, dispersion, shape, size, S.sw, S.sh]);

  const api = React.useRef({ goTo });
  React.useEffect(() => {
    api.current = { goTo };
  });

  // A host that moves `position` glides the sheet there.
  const px = position?.x;
  const py = position?.y;
  const asked = React.useRef(px === undefined ? null : `${px},${py}`);
  React.useEffect(() => {
    if (px === undefined || py === undefined) return;
    const key = `${px},${py}`;
    if (asked.current === key) return;
    asked.current = key;
    const s = sim.current;
    if (
      Math.abs(s.tx / s.w - px) < 0.002 &&
      Math.abs(s.ty / s.h - py) < 0.002
    ) {
      return;
    }
    api.current.goTo(px * s.w, py * s.h, false);
  }, [px, py]);

  /* ------------------------------ gestures -------------------------------- */

  const dragFrom = React.useRef({ x: 0, y: 0 });
  const drag = useDrag({
    threshold: 3,
    disabled,
    onStart: () => {
      const s = sim.current;
      s.mode = "drag";
      s.vx = s.vy = 0;
      s.liftT = 1;
      dragFrom.current = { x: s.x, y: s.y };
      setHeld(true);
      kick();
    },
    onMove: ({ offset }) => {
      const s = sim.current;
      const b = bounds();
      // 1:1 under the finger, held inside the stage.
      s.x = clamp(dragFrom.current.x + offset.x, b.x0, b.x1);
      s.y = clamp(dragFrom.current.y + offset.y, b.y0, b.y1);
      kick();
    },
    onEnd: ({ velocity }) => {
      const s = sim.current;
      const c = latest.current;
      s.liftT = 0;
      setHeld(false);
      if (!c.motionSafe) {
        s.mode = "idle";
        report(s.x, s.y);
        kick();
        return;
      }
      s.mode = "slide";
      s.vx = velocity.x;
      s.vy = velocity.y;
      // Where friction will stop it (exponential decay), kept inside.
      const tau = lerp(0.9, 0.18, c.friction);
      const b = bounds();
      report(
        clamp(s.x + velocity.x * tau, b.x0, b.x1),
        clamp(s.y + velocity.y * tau, b.y0, b.y1),
      );
      kick();
    },
    onCancel: () => {
      const s = sim.current;
      s.mode = "idle";
      s.liftT = 0;
      setHeld(false);
      kick();
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const s = sim.current;
    const step = event.shiftKey ? 0.16 : 0.04;
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const d = dirs[event.key];
    if (d) {
      event.preventDefault();
      const fromX = s.mode === "glide" ? s.tx : s.x;
      const fromY = s.mode === "glide" ? s.ty : s.y;
      goTo(fromX + d[0] * step * s.w, fromY + d[1] * step * s.h);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      goTo(s.w / 2, s.h / 2);
    }
  };

  /* -------------------------------- render -------------------------------- */

  const zw =
    (shape === "round" ? S.sh / 2 : Math.hypot(S.sw, S.sh) / 2) /
    clamp(rings, 4, 40);
  const ringLines = `repeating-radial-gradient(circle at 50% 50%, transparent 0px, transparent ${r2(zw - 1)}px, rgba(255, 255, 255, 0.28) ${r2(zw - 1)}px, rgba(255, 255, 255, 0.28) ${r2(zw)}px)`;
  const glareBand = `linear-gradient(118deg, transparent 30%, rgba(255, 255, 255, ${r2(0.08 + 0.3 * clamp(glare, 0, 1))}) 48%, transparent 64%)`;
  const coverW = Math.max(box.w / ART_W, box.h / ART_H);
  const fallbackSize = `${r2(ART_W * coverW * clamp(magnify, 1.2, 4))}px ${r2(ART_H * coverW * clamp(magnify, 1.2, 4))}px`;

  return (
    <div
      ref={rootRef}
      onClick={(event) => {
        if (disabled) return;
        const handle = (event.target as Element | null)?.closest(
          "[data-fresnel-handle]",
        );
        if (handle) return;
        const r = event.currentTarget.getBoundingClientRect();
        goTo(event.clientX - r.left, event.clientY - r.top);
      }}
      className={cn(
        "group/fresnel-sheet relative isolate h-56 w-full overflow-clip rounded-3 bg-[rgb(236,232,218)] select-none [-webkit-tap-highlight-color:transparent]",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        className,
      )}
    >
      {/* The CSS frame: the server's first paint and the no-WebGL sheet. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-300 group-data-live/fresnel-sheet:opacity-0"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageA}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full object-cover"
        />
        <motion.div
          className="absolute top-0 left-0 overflow-hidden shadow-[3px_6px_14px_color-mix(in_oklab,black_28%,transparent)]"
          style={{
            x: hx,
            y: hy,
            width: S.sw,
            height: S.sh,
            borderRadius: S.radius,
          }}
        >
          <motion.div
            className="absolute inset-0"
            style={{
              backgroundImage: `url("${imageB}")`,
              backgroundSize: fallbackSize,
              backgroundPosition: bgPos,
              backgroundRepeat: "no-repeat",
            }}
          />
          <div
            className="absolute inset-0"
            style={{ backgroundImage: `${glareBand}, ${ringLines}` }}
          />
        </motion.div>
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-live/fresnel-sheet:opacity-100"
      />
      <span role="img" aria-label={alt} className="sr-only" />
      <motion.div
        data-fresnel-handle=""
        role="group"
        aria-roledescription="magnifier sheet"
        aria-label={`${label}: ${revealAlt}`}
        aria-describedby={`${uid}-keys`}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={onKeyDown}
        {...drag}
        className={cn(
          "absolute top-0 left-0 touch-none outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-not-allowed"
            : held
              ? "cursor-grabbing"
              : "cursor-grab",
        )}
        style={{
          x: hx,
          y: hy,
          width: S.sw,
          height: S.sh,
          borderRadius: S.radius,
        }}
      />
      <p id={`${uid}-keys`} className="sr-only">
        Drag the sheet, or use the arrow keys to move it, with Shift for larger
        steps; Home centres it. Click the chart to send the sheet there.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
