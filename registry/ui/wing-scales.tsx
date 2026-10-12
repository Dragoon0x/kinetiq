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
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { project, useDrag, wheelPixels } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type WingScalesMarkings = "band" | "eyespot" | "plain";
export type WingScalesWheel = "focus" | "always" | "off";

export type WingScalesProps = {
  /** Magnification shown, 1 (the whole wing) to `maxZoom` (the ridges of one scale). A new value glides the view there. @default 1 */
  zoom?: number;
  /** Fires from the wheel, pinch, drag or key that changed the magnification, with the new value. */
  onZoomChange?: (zoom: number) => void;
  /** The deepest magnification, 8 to 160. @default 90 */
  maxZoom?: number;
  /** How strongly the ridges shine, 0 (dull pigment brown) to 1 (the full blue-green play). @default 0.75 */
  iridescence?: number;
  /** How far the wing rocks toward the pointer, 0 (held still) to 1 (26° each way). @default 0.6 */
  tilt?: number;
  /** Thickness of the ridges' film in nanometres, 300 to 560: it sets the colour family (gold, violet, blue, green). @default 420 */
  film?: number;
  /** The pigment under the film, any CSS colour. @default "oklch(0.26 0.03 45)" */
  ground?: string;
  /** The pattern of pigment scales: a spotted outer band, an eyespot on each hindwing, or plain. @default "band" */
  markings?: WingScalesMarkings;
  /** How far the scales lift as the wing breathes while you look, 0 to 1. @default 0.5 */
  breathe?: number;
  /** When a plain wheel zooms: once the wing has focus (or with Ctrl or ⌘), always, or never. Pinch always zooms. @default "focus" */
  wheel?: WingScalesWheel;
  /** Seeds the scales' small irregularities. @default 7 */
  seed?: number;
  /** Names the specimen for assistive technology. @default "Butterfly wing" */
  label?: string;
  /** Holds the scales flat: no breathing. @default false */
  paused?: boolean;
  /** Shows the wing but takes no gestures or keys. @default false */
  disabled?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Sizes the box; the insect is fitted inside it. @default "h-56 w-full" */
  className?: string;
};

/* --------------------------------- shaders -------------------------------- */

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform float u_fit;
uniform vec2 u_center;
uniform float u_zoom;
uniform vec2 u_tilt;
uniform float u_irid;
uniform float u_film;
uniform vec3 u_ground;
uniform int u_mark;
uniform float u_breath;
uniform float u_time;
uniform float u_seed;
out vec4 o_color;

${GLSL_SRGB}

const vec2 F_ROOT = vec2(0.05, 0.2);
const vec2 F_APEX = vec2(1.2, 0.9);
const vec2 F_TORN = vec2(0.9, -0.12);
const vec2 H_ROOT = vec2(0.05, 0.05);
const vec2 H_EYE = vec2(0.6, -0.5);
// Scales: cell width and row height in wing units, and length in rows.
const float CW = 0.016;
const float CH = 0.0105;
const float LEN = 1.72;
const float RIDGES = 16.0;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21) + u_seed * 0.137);
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

float sdTri(vec2 p, vec2 p0, vec2 p1, vec2 p2) {
  vec2 e0 = p1 - p0, e1 = p2 - p1, e2 = p0 - p2;
  vec2 v0 = p - p0, v1 = p - p1, v2 = p - p2;
  vec2 q0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 q1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 q2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(q0, q0), s * (v0.x * e0.y - v0.y * e0.x)),
                   vec2(dot(q1, q1), s * (v1.x * e1.y - v1.y * e1.x))),
                   vec2(dot(q2, q2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float sdFore(vec2 p) { return sdTri(p, F_ROOT, F_APEX, F_TORN) - 0.1; }
float sdHind(vec2 p) {
  float a = length((p - vec2(0.52, -0.4)) * vec2(1.0, 1.12)) - 0.44;
  float b = sdTri(p, vec2(0.05, 0.08), vec2(0.78, -0.06), vec2(0.28, -0.78)) - 0.06;
  return smin(a, b, 0.12);
}

float sdBody(vec2 w) {
  float thorax = length((w - vec2(0.0, 0.12)) / vec2(0.075, 0.2)) - 1.0;
  float belly = length((w - vec2(0.0, -0.3)) / vec2(0.05, 0.31)) - 1.0;
  float head = length(w - vec2(0.0, 0.37)) - 0.062;
  return min(min(thorax * 0.06, belly * 0.05), head);
}

float sdAntenna(vec2 w) {
  vec2 p = vec2(abs(w.x), w.y);
  float stalk = sdSeg(p, vec2(0.025, 0.42), vec2(0.16, 0.74));
  stalk = min(stalk, sdSeg(p, vec2(0.16, 0.74), vec2(0.3, 0.97)));
  float club = length((p - vec2(0.31, 0.98)) / vec2(1.0, 1.6)) - 0.022;
  return min(stalk - 0.006, club);
}

/** Which veins, as segments from each root. */
float veins(vec2 p, int wing) {
  float d = 1e3;
  if (wing == 0) {
    vec2 dirA = normalize(F_APEX - F_ROOT);
    d = min(d, sdSeg(p, F_ROOT + dirA * 0.1, F_APEX - dirA * 0.06));
    for (int i = 0; i < 6; i += 1) {
      float t = 0.08 + float(i) * 0.165;
      vec2 e = mix(F_APEX, F_TORN, t);
      vec2 dir = normalize(e - F_ROOT);
      d = min(d, sdSeg(p, F_ROOT + dir * 0.14, e - dir * 0.02));
    }
  } else {
    for (int i = 0; i < 6; i += 1) {
      float a = -0.12 - float(i) * 0.3;
      vec2 e = vec2(0.52, -0.4) + vec2(cos(a), sin(a) / 1.12) * 0.44;
      vec2 dir = normalize(e - H_ROOT);
      d = min(d, sdSeg(p, H_ROOT + dir * 0.12, e - dir * 0.02));
    }
  }
  return d;
}

/** Pigment scales: rgb and how much of a scale they claim. */
vec4 markings(vec2 p, int wing, float sd) {
  vec3 black = vec3(0.008, 0.007, 0.009);
  vec3 cream = vec3(0.86, 0.8, 0.62);
  vec3 ochre = vec3(0.72, 0.38, 0.08);
  float edge = -sd;
  if (u_mark == 2) {
    return vec4(black, 1.0 - smoothstep(0.025, 0.035, edge));
  }
  if (wing == 0) {
    float far = smoothstep(0.78, 0.9, length(p - F_ROOT));
    float bandW = u_mark == 0 ? 0.15 : 0.085;
    float band = far * (1.0 - smoothstep(bandW - 0.012, bandW, edge));
    band = max(band, 1.0 - smoothstep(0.022, 0.032, edge));
    if (u_mark == 0) {
      vec2 n = normalize(vec2(F_TORN.y - F_APEX.y, F_APEX.x - F_TORN.x));
      for (int i = 0; i < 6; i += 1) {
        vec2 c = mix(F_APEX, F_TORN, (float(i) + 0.6) / 6.6) - n * 0.075;
        float r = 0.026 - float(i) * 0.002;
        float s = 1.0 - smoothstep(r - 0.004, r, length(p - c));
        if (s > 0.0) return vec4(mix(black, cream, s), band);
      }
    }
    return vec4(black, band);
  }
  float far = smoothstep(0.5, 0.62, length(p - H_ROOT));
  if (u_mark == 1) {
    float r = length(p - H_EYE);
    if (r < 0.15) {
      float pupil = 1.0 - smoothstep(0.03, 0.036, length(p - H_EYE - vec2(0.012, 0.014)));
      vec3 c = r < 0.098 ? mix(black, cream, pupil) : ochre;
      return vec4(c, 1.0 - smoothstep(0.142, 0.15, r));
    }
    return vec4(black, max(far * (1.0 - smoothstep(0.06, 0.07, edge)), 1.0 - smoothstep(0.022, 0.032, edge)));
  }
  float band = far * (1.0 - smoothstep(0.11, 0.122, edge));
  band = max(band, 1.0 - smoothstep(0.022, 0.032, edge));
  for (int i = 0; i < 5; i += 1) {
    float a = -0.3 - float(i) * 0.3;
    vec2 c = vec2(0.52, -0.4) + vec2(cos(a), sin(a) / 1.12) * 0.37;
    float s = 1.0 - smoothstep(0.02, 0.025, length(p - c));
    if (s > 0.0) return vec4(mix(black, cream, s), band);
  }
  return vec4(black, band);
}

/** Thin-film reflectance at three wavelengths for a cosine of incidence. */
vec3 film(float cosI, float d) {
  float s2 = (1.0 - cosI * cosI) / (1.56 * 1.56);
  float ct = sqrt(max(1.0 - s2, 0.0));
  vec3 delta = 12.566 * 1.56 * d * ct / vec3(620.0, 540.0, 460.0);
  vec3 r = pow(0.5 - 0.5 * cos(delta), vec3(1.6));
  // Real stacks reflect a little of everything: a touch of white in the band.
  float m = (r.r + r.g + r.b) / 3.0;
  return mix(vec3(m), r, 0.85);
}

float tipEdge(float u) {
  return 0.97 - 0.032 * (0.5 - 0.5 * cos(u * 15.708)) - 0.12 * u * u * u * u;
}
float halfWidth(float v) { return mix(0.2, 1.0, smoothstep(0.0, 0.34, v)); }

mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }

void main() {
  float scale = u_fit * u_zoom;
  vec2 q = (gl_FragCoord.xy - 0.5 * u_res) / scale;
  // The specimen card turns in the hand: a ray from the eye meets the tilted
  // plane, so the tilt is real perspective, and the light and view are
  // carried into the plane's own frame.
  mat3 R = rotY(u_tilt.x) * rotX(-u_tilt.y);
  mat3 Rt = transpose(R);
  vec3 nP = R * vec3(0.0, 0.0, 1.0);
  float eye = 3.2 * (0.5 * u_res.y) / scale;
  vec3 o = vec3(0.0, 0.0, eye);
  vec3 dir = vec3(q, -eye);
  float t = -dot(nP, o) / dot(nP, dir);
  vec3 hit = o + t * dir;
  vec2 w = u_center + (Rt * hit).xy;
  vec3 V = Rt * normalize(o - hit);
  // A lamp above and to the left of the specimen, at a finite distance, so
  // the angle to it changes across the wing and a band of colour lies on it.
  vec3 onCard = R * vec3(w - vec2(0.0, 0.055), 0.0);
  vec3 L = Rt * normalize(vec3(-1.5, 2.1, 2.6) - onCard);
  float px = max(length(fwidth(w)), 1e-6);

  vec2 p = vec2(abs(w.x), w.y);
  float side = w.x < 0.0 ? -1.0 : 1.0;

  // The body and antennae sit over everything.
  float body = sdBody(w);
  float ant = sdAntenna(w);
  float sdF = sdFore(p);
  float sdH = sdHind(p);
  float sdW = min(min(sdF, sdH), min(body, ant));

  // Soft contact shadow on the card, pushed by the tilt.
  vec2 sp = w + vec2(0.035, 0.055) + u_tilt.yx * vec2(-0.12, 0.12);
  vec2 spp = vec2(abs(sp.x), sp.y);
  float sdS = min(min(sdFore(spp), sdHind(spp)), sdBody(sp));
  float shadow = 0.3 * (1.0 - smoothstep(-0.04, 0.1, sdS));

  if (sdW > px) {
    o_color = vec4(0.0, 0.0, 0.0, shadow);
    return;
  }

  vec3 ground = kx_srgbToLinear(u_ground);
  vec3 col;
  if (min(body, ant) < px * 0.5 + 0.0) {
    // Fur: near black, in streaks, with a cool rim where it turns away.
    float fur = hash(vec2(floor(w.x * 520.0 + w.y * 40.0), floor(w.y * 90.0)));
    col = vec3(0.014, 0.012, 0.011) * (0.7 + 0.8 * fur);
    float rim = smoothstep(-0.035, 0.0, min(body, ant));
    col += vec3(0.03, 0.036, 0.046) * rim * (0.5 + 0.5 * fur);
  } else {
    int wing = sdF < 0.0 ? 0 : 1;
    if (sdF > 0.0 && sdF < px && sdH > 0.0) wing = 0;
    float sd = wing == 0 ? sdF : sdH;
    vec2 root = wing == 0 ? F_ROOT : H_ROOT;
    vec2 a = wing == 0 ? normalize(vec2(1.0, 0.25)) : normalize(vec2(0.6, -0.8));
    vec2 b = vec2(-a.y, a.x);
    vec2 s = vec2(dot(p - root, b), dot(p - root, a));
    vec2 lat = vec2(s.x / CW, s.y / CH);
    vec2 fw = fwidth(lat);
    // Level of detail by footprint: scales resolve as a cell grows past a
    // few pixels, ridges as their spacing does.
    float sDetail = 1.0 - smoothstep(0.18, 0.45, fw.y);
    float rDetail = 1.0 - smoothstep(0.2, 0.45, fw.x * RIDGES / 0.92);

    float r0 = floor(lat.y);
    float found = 0.0;
    float u = 0.0, v = 0.0, row = 0.0, id = 0.0, edgeD = 0.0;
    vec2 cell = vec2(0.0);
    for (int k = 0; k < 2; k += 1) {
      float rr = r0 - 1.0 + float(k);
      float off = mod(rr, 2.0) * 0.5;
      float cx = floor(lat.x - off + 0.5) + off;
      float h = hash(vec2(rr, cx));
      float uu = (lat.x - cx) * 2.0 / 0.985 + (h - 0.5) * 0.05;
      float vv = (lat.y - rr) / (LEN * (1.0 + (h - 0.5) * 0.08));
      float e = min(halfWidth(vv) - abs(uu), min(tipEdge(uu) - vv, vv));
      if (e > 0.0) {
        found = 1.0;
        u = uu; v = vv; row = rr; id = h; cell = vec2(cx, rr);
        edgeD = e;
        break;
      }
    }

    // Breath: the rows lift a little in a slow travelling wave.
    float lift = u_breath * (0.5 + 0.5 * sin(u_time * 1.25 - row * 0.42 + id * 2.0)) * sDetail;

    // Pigment or film, decided per scale up close and per pixel far away.
    vec2 centreW = root + b * (cell.x * CW) + a * ((cell.y + LEN * 0.6) * CH);
    vec4 mark = markings(p, wing, sd);
    vec4 markC = markings(centreW, wing, wing == 0 ? sdFore(centreW) : sdHind(centreW));
    float pig = mix(mark.a, step(0.5, markC.a), sDetail * found);
    vec3 pigCol = mix(mark.rgb, markC.rgb, sDetail * found);

    float rootFade = smoothstep(0.06, 0.34, length(p - root));
    float phase = (u * 0.5 + 0.5) * RIDGES;
    float ridge = pow(0.5 + 0.5 * cos(phase * 6.2832), 4.0);
    float slope = -sin(phase * 6.2832);
    float ribs = pow(0.5 + 0.5 * cos(v * LEN * CH / 0.0009 * 6.2832), 6.0);

    float nu = (u * 0.28 + slope * 0.32 * rDetail) * sDetail;
    float nv = -lift * 0.6;
    vec3 n = normalize(vec3(side * (b * nu + a * nv).x, (b * nu + a * nv).y, 1.0));
    vec3 H = normalize(L + V);
    // Structural colour: the angle is part incidence, part view.
    float cosI = clamp(0.5 * dot(n, L) + 0.5 * dot(n, V), 0.05, 1.0);
    float spec = pow(max(dot(n, H), 0.0), 3.0);
    float d = u_film * (1.0 + (id - 0.5) * 0.05 * sDetail);
    vec3 irid = film(cosI, d) * (0.25 + 0.9 * spec);
    irid *= mix(0.74, mix(0.45, 1.25, ridge) - 0.12 * ribs * (1.0 - ridge), rDetail * sDetail);
    irid *= rootFade;
    float diffuse = 0.45 + 0.55 * max(dot(n, L), 0.0);
    vec3 base = ground * diffuse;
    vec3 scaleCol = mix(base, base * 0.3 + irid, u_irid);
    vec3 pigLit = pigCol * (0.5 + 0.5 * diffuse) + vec3(0.012) * spec;
    col = mix(scaleCol, pigLit, pig);
    col = mix(col, ground * 0.55 * diffuse, (1.0 - rootFade) * 0.45);

    // Up close: gaps between scales show the membrane, outlines show where
    // one scale lies on another, and a lifted tip shades the scale beneath.
    float edgePx = edgeD / max(fw.x * 2.0 / 0.985, 1e-5);
    float outline = mix(1.0, 0.55 + 0.45 * smoothstep(0.0, 1.6, edgePx), sDetail);
    float membrane = mix(1.0, found, sDetail);
    col = mix(ground * 0.45 + vec3(0.004, 0.006, 0.012), col * outline, membrane);
    float under = 0.0;
    if (found > 0.5 && row == r0) {
      float rr = r0 - 1.0;
      float off = mod(rr, 2.0) * 0.5;
      float cx = floor(lat.x - off + 0.5) + off;
      float uu = (lat.x - cx) * 2.0 / 0.985;
      if (abs(uu) < 1.0) {
        float gap = (lat.y - rr) - LEN * tipEdge(uu);
        float lifted = u_breath * (0.5 + 0.5 * sin(u_time * 1.25 - rr * 0.42 + hash(vec2(rr, cx)) * 2.0));
        under = (1.0 - smoothstep(0.0, 0.12 + 0.3 * lifted, gap)) * 0.55;
      }
    }
    col *= 1.0 - under * sDetail;

    // Veins: bare, dark tubes; shaded on the overlapping hindwing too.
    float vd = veins(p, wing);
    float vw = 0.0042 * (1.0 - 0.4 * smoothstep(0.3, 1.2, length(p - root)));
    // A vein thinner than a pixel only darkens by the share it covers.
    float vein = (1.0 - smoothstep(vw - px * 0.5, vw + px * 0.5, vd)) * min(1.0, 2.0 * vw / px);
    col = mix(col, ground * 0.32, vein * 0.8);
    if (wing == 1) col *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.06, sdF));
  }

  float alpha = 1.0 - smoothstep(-px, px, sdW);
  vec3 outCol = kx_linearToSrgb(clamp(col, 0.0, 1.0));
  float a = alpha + shadow * (1.0 - alpha);
  o_color = vec4(outCol * alpha, a);
}
`;

/* ------------------------------- still frame ------------------------------- */

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** The insect's bounds in wing units, and the point it is fitted about. */
const BOUNDS = { x: 1.38, top: 1.03, bottom: -0.92 };
const FIT_CY = (BOUNDS.top + BOUNDS.bottom) / 2;
const MAX_TILT = (26 * Math.PI) / 180;
/** Where a zoom from the whole insect looks first: the middle of the right forewing. */
const FOCUS = { x: 0.62, y: 0.4 };
const LEVELS = [1, 12, 40] as const;

const levelName = (z: number) =>
  z < 3
    ? "the whole wing"
    : z < 20
      ? "rows of overlapping scales"
      : z < 55
        ? "single scales"
        : "the ridges of one scale";
const shortLevel = (z: number) =>
  z < 3 ? "wing" : z < 20 ? "scales" : z < 55 ? "a scale" : "ridges";
const readout = (z: number) =>
  `×${z < 10 ? z.toFixed(1) : Math.round(z)} · ${shortLevel(z)}`;

/** The still: the same wing in SVG, for the server and for no WebGL2. */
function Still({ id, markings }: { id: string; markings: WingScalesMarkings }) {
  // Wing units × 100, y down.
  const fore = "5,-20 120,-90 90,12";
  const veinsFore = [0.08, 0.245, 0.41, 0.575, 0.74, 0.905].map((t) => {
    const ex = 120 + (90 - 120) * t;
    const ey = -90 + (12 + 90) * t;
    return `M${r2(5 + (ex - 5) * 0.12)} ${r2(-20 + (ey + 20) * 0.12)}L${r2(ex)} ${r2(ey)}`;
  });
  const veinsHind = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = -0.12 - i * 0.3;
    const ex = 52 + Math.cos(a) * 44;
    const ey = 40 - (Math.sin(a) / 1.12) * 44;
    return `M${r2(5 + (ex - 5) * 0.12)} ${r2(-5 + (ey + 5) * 0.12)}L${r2(ex)} ${r2(ey)}`;
  });
  const half = (
    <g>
      <g clipPath={`url(#${id}-hind)`}>
        <rect
          x={0}
          y={-20}
          width={110}
          height={110}
          fill={`url(#${id}-irid)`}
        />
        {markings === "eyespot" ? (
          <>
            <circle cx={60} cy={50} r={15} fill="oklch(0.6 0.13 65)" />
            <circle cx={60} cy={50} r={10} fill="oklch(0.16 0.01 300)" />
            <circle cx={61} cy={48.6} r={3.3} fill="oklch(0.88 0.04 90)" />
          </>
        ) : null}
        <path
          d="M95 26 Q 92 70 40 86"
          fill="none"
          stroke="oklch(0.16 0.01 300)"
          strokeWidth={
            markings === "band" ? 22 : markings === "eyespot" ? 12 : 5
          }
        />
        {markings === "band"
          ? [0, 1, 2, 3, 4].map((i) => {
              const a = -0.3 - i * 0.3;
              return (
                <circle
                  key={i}
                  cx={r2(52 + Math.cos(a) * 37)}
                  cy={r2(40 - (Math.sin(a) / 1.12) * 37)}
                  r={2.2}
                  fill="oklch(0.88 0.04 90)"
                />
              );
            })
          : null}
        <path
          d={veinsHind.join("")}
          stroke="oklch(0.2 0.02 40)"
          strokeWidth={0.7}
          fill="none"
        />
      </g>
      <g clipPath={`url(#${id}-fore)`}>
        <rect
          x={-6}
          y={-102}
          width={140}
          height={126}
          fill={`url(#${id}-irid)`}
        />
        <g style={{ transform: "translate(var(--wing-hx), var(--wing-hy))" }}>
          <ellipse
            cx={62}
            cy={-38}
            rx={44}
            ry={28}
            fill={`url(#${id}-gloss)`}
          />
        </g>
        <path
          d="M128 -96 L 98 18"
          fill="none"
          stroke="oklch(0.16 0.01 300)"
          strokeWidth={
            markings === "band" ? 30 : markings === "eyespot" ? 17 : 5
          }
        />
        {markings === "band"
          ? [0, 1, 2, 3, 4, 5].map((i) => {
              const t = (i + 0.6) / 6.6;
              return (
                <circle
                  key={i}
                  cx={r2(120 - 30 * t - 7.5)}
                  cy={r2(-90 + 102 * t - 2)}
                  r={r2(2.6 - i * 0.2)}
                  fill="oklch(0.88 0.04 90)"
                />
              );
            })
          : null}
        <path
          d={veinsFore.join("")}
          stroke="oklch(0.2 0.02 40)"
          strokeWidth={0.7}
          fill="none"
        />
      </g>
    </g>
  );
  return (
    <svg
      aria-hidden
      viewBox="-150 -110 300 210"
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 size-full"
    >
      <defs>
        <linearGradient id={`${id}-irid`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="oklch(0.24 0.04 50)" />
          <stop offset="0.22" stopColor="oklch(0.42 0.16 255)" />
          <stop offset="0.55" stopColor="oklch(0.62 0.17 238)" />
          <stop offset="0.8" stopColor="oklch(0.58 0.13 200)" />
          <stop offset="1" stopColor="oklch(0.42 0.16 280)" />
        </linearGradient>
        <radialGradient id={`${id}-gloss`}>
          <stop offset="0" stopColor="oklch(0.86 0.1 190)" stopOpacity="0.55" />
          <stop offset="1" stopColor="oklch(0.86 0.1 190)" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-fore`}>
          <polygon
            points={fore}
            stroke="black"
            strokeWidth={20}
            strokeLinejoin="round"
          />
        </clipPath>
        <clipPath id={`${id}-hind`}>
          <ellipse cx={52} cy={40} rx={44} ry={39.3} />
          <polygon
            points="5,-8 78,6 28,78"
            stroke="black"
            strokeWidth={12}
            strokeLinejoin="round"
          />
        </clipPath>
        <filter id={`${id}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      <g
        opacity={0.3}
        filter={`url(#${id}-soft)`}
        transform="translate(3.5 -5.5)"
      >
        <g fill="black">
          <polygon
            points={fore}
            stroke="black"
            strokeWidth={20}
            strokeLinejoin="round"
          />
          <ellipse cx={52} cy={40} rx={44} ry={39.3} />
        </g>
        <g fill="black" transform="scale(-1 1)">
          <polygon
            points={fore}
            stroke="black"
            strokeWidth={20}
            strokeLinejoin="round"
          />
          <ellipse cx={52} cy={40} rx={44} ry={39.3} />
        </g>
      </g>
      {half}
      <g transform="scale(-1 1)">{half}</g>
      <g fill="oklch(0.17 0.01 40)">
        <ellipse cx={0} cy={-12} rx={7.5} ry={20} />
        <ellipse cx={0} cy={30} rx={5} ry={31} />
        <circle cx={0} cy={-37} r={6.2} />
      </g>
      <path
        d="M2.5 -42 L16 -74 L30 -97 M-2.5 -42 L-16 -74 L-30 -97"
        fill="none"
        stroke="oklch(0.17 0.01 40)"
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      <circle cx={31} cy={-98} r={2.2} fill="oklch(0.17 0.01 40)" />
      <circle cx={-31} cy={-98} r={2.2} fill="oklch(0.17 0.01 40)" />
    </svg>
  );
}

/* -------------------------------- component -------------------------------- */

type Sim = {
  /** Log of the zoom: shown, velocity, target. */
  lz: number;
  lzV: number;
  lzT: number;
  cx: number;
  cy: number;
  cvx: number;
  cvy: number;
  cxT: number;
  cyT: number;
  /** A point that stays under the pointer while the zoom glides. */
  anchor: { wx: number; wy: number; sx: number; sy: number } | null;
  tx: number;
  ty: number;
  tvx: number;
  tvy: number;
  txT: number;
  tyT: number;
  /** A tilt the keys set and hold; the pointer's tilt is measured from it. */
  keyTx: number;
  keyTy: number;
  breath: number;
  time: number;
  activeUntil: number;
  frame: number;
  last: number;
  visible: boolean;
  /** Box size in device px, and the fit (device px per wing unit at ×1). */
  w: number;
  h: number;
  fit: number;
  announced: number;
};

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

let reader: CanvasRenderingContext2D | null | undefined;

/** Any resolved CSS colour (oklch included) as sRGB 0–1, through a 1×1 canvas. */
const readRgb = (css: string): [number, number, number] => {
  if (reader === undefined) {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    reader = c.getContext("2d", { willReadFrequently: true });
  }
  if (!reader) return [0.26, 0.2, 0.15];
  reader.clearRect(0, 0, 1, 1);
  reader.fillStyle = "rgb(66, 51, 38)";
  reader.fillStyle = css;
  reader.fillRect(0, 0, 1, 1);
  const d = reader.getImageData(0, 0, 1, 1).data;
  return [(d[0] ?? 0) / 255, (d[1] ?? 0) / 255, (d[2] ?? 0) / 255];
};

/**
 * A specimen of an invented blue butterfly, drawn per pixel in one WebGL2
 * pass, that you can look into all the way down to the ridges of a single
 * scale. The wing is made of real scales — rows of toothed paddles laid like
 * shingles — and its colour comes from the ridges on them: a thin-film term
 * at three wavelengths for the angle to the light, so the blue slides toward
 * green and violet as the pointer rocks the specimen (on a critically damped
 * spring with the drift constants). The wheel (once focused), a pinch or the
 * keys zoom about the pointer on the glide constants in log space; zoomed in,
 * a drag pans 1:1 and a release throws by projection. While you look, the
 * scales breathe: rows lift in a slow wave, their tips shading the scales
 * beneath; idle, they settle and the loop stops.
 *
 * It is a focusable group: + and − (or Up and Down) zoom, Page Up and Page
 * Down by ×3, Home shows the whole wing, End the ridges, Enter steps a
 * level, Left and Right rock the wing, Shift with an arrow pans, and Escape
 * returns to the whole wing. Under reduced motion nothing breathes or
 * glides — zoom and pan change in place — and the colour still shows.
 * Without WebGL2 an SVG still of the same insect is shown.
 */
export function WingScales({
  zoom = 1,
  onZoomChange,
  maxZoom = 90,
  iridescence = 0.75,
  tilt = 0.6,
  film = 420,
  ground = "oklch(0.26 0.03 45)",
  markings = "band",
  breathe = 0.5,
  wheel = "focus",
  seed = 7,
  label = "Butterfly wing",
  paused = false,
  disabled = false,
  dpr = 2,
  className,
}: WingScalesProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const id = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const top = clamp(maxZoom, 8, 160);
  const startZoom = clamp(zoom, 1, top);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carrierRef = React.useRef<HTMLSpanElement | null>(null);
  const chipRef = React.useRef<HTMLSpanElement | null>(null);
  const gpuRef = React.useRef<Gpu | null>(null);
  const groundRgb = React.useRef<[number, number, number]>([0.26, 0.2, 0.15]);
  const pointers = React.useRef(new Map<number, { x: number; y: number }>());
  const pinch = React.useRef<{
    d0: number;
    lz0: number;
    wx: number;
    wy: number;
  } | null>(null);
  const dragMode = React.useRef<"pan" | "tilt" | null>(null);
  const dragFrom = React.useRef({ cx: 0, cy: 0 });
  const hintTimer = React.useRef<number | null>(null);

  const [initialReadout] = React.useState(() => readout(startZoom));
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [hint, setHint] = React.useState(false);
  const [zoomed, setZoomed] = React.useState(startZoom > 1.05);

  const sim = React.useRef<Sim>({
    lz: Math.log(startZoom),
    lzV: 0,
    lzT: Math.log(startZoom),
    cx: 0,
    cy: FIT_CY,
    cvx: 0,
    cvy: 0,
    cxT: 0,
    cyT: FIT_CY,
    anchor: null,
    tx: 0,
    ty: 0,
    tvx: 0,
    tvy: 0,
    txT: 0,
    tyT: 0,
    keyTx: 0,
    keyTy: 0,
    breath: 0,
    time: 0,
    activeUntil: 0,
    frame: 0,
    last: 0,
    visible: false,
    w: 1,
    h: 1,
    fit: 1,
    announced: startZoom,
  });

  const config = {
    top,
    iridescence: clamp(iridescence, 0, 1),
    tilt: clamp(tilt, 0, 1),
    film: clamp(film, 300, 560),
    markings,
    breathe: clamp(breathe, 0, 1),
    wheel,
    seed,
    paused,
    disabled,
    dpr: clamp(dpr, 0.5, 2),
    motionSafe,
    onZoomChange,
  };
  const latest = React.useRef(config);

  /** Keeps the view on the insect: the centre may only move as far as the zoom lets the edges reach. */
  const clampCentre = (s: Sim, x: number, y: number, z: number) => {
    const halfW = s.w / 2 / (s.fit * z);
    const halfH = s.h / 2 / (s.fit * z);
    const rx = Math.max(0, BOUNDS.x - halfW);
    const lo = BOUNDS.bottom + halfH;
    const hi = BOUNDS.top - halfH;
    return {
      x: clamp(x, -rx, rx),
      y: lo > hi ? FIT_CY : clamp(y, lo, hi),
    };
  };

  const draw = React.useCallback(() => {
    const g = gpuRef.current;
    const canvas = canvasRef.current;
    const s = sim.current;
    const c = latest.current;
    if (!g || g.lost || !canvas || canvas.width < 2) return;
    const { gl } = g;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    g.program.set({
      u_res: [canvas.width, canvas.height],
      u_fit: s.fit,
      u_center: [s.cx, s.cy],
      u_zoom: Math.exp(s.lz),
      u_tilt: [s.tx, s.ty],
      u_irid: c.iridescence,
      u_film: c.film,
      u_ground: groundRgb.current,
      u_mark: c.markings === "band" ? 0 : c.markings === "eyespot" ? 1 : 2,
      u_breath: s.breath * c.breathe,
      u_time: s.time,
      u_seed: c.seed,
    });
    g.tri.draw();
    const root = rootRef.current;
    if (root && !root.hasAttribute("data-live")) {
      root.setAttribute("data-live", "");
    }
  }, []);

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
      // The goal for the centre: from the anchor while one holds a point
      // under the pointer, else the wanted centre, each as close as the
      // target zoom lets the view get to it (the wanted point is kept, so a
      // look into the forewing arrives as the zoom deepens).
      const zt = Math.exp(s.lzT);
      if (s.anchor) {
        s.cxT = s.anchor.wx - s.anchor.sx / (s.fit * zt);
        s.cyT = s.anchor.wy - s.anchor.sy / (s.fit * zt);
      }
      const goal = clampCentre(s, s.cxT, s.cyT, zt);
      if (!c.motionSafe) {
        s.lz = s.lzT;
        s.cx = goal.x;
        s.cy = goal.y;
        s.tx = s.txT;
        s.ty = s.tyT;
        s.lzV = s.cvx = s.cvy = s.tvx = s.tvy = 0;
        s.breath = 0;
      } else {
        const gk = springs.glide.stiffness / springs.glide.mass;
        const gc = springs.glide.damping / springs.glide.mass;
        const dk = springs.drift.stiffness / springs.drift.mass;
        const dc = springs.drift.damping / springs.drift.mass;
        const n = Math.max(1, Math.ceil(dt / (1 / 240)));
        const h = dt / n;
        for (let i = 0; i < n; i += 1) {
          s.lzV += (-gk * (s.lz - s.lzT) - gc * s.lzV) * h;
          s.lz += s.lzV * h;
          s.cvx += (-gk * (s.cx - goal.x) - gc * s.cvx) * h;
          s.cvy += (-gk * (s.cy - goal.y) - gc * s.cvy) * h;
          s.cx += s.cvx * h;
          s.cy += s.cvy * h;
          s.tvx += (-dk * (s.tx - s.txT) - dc * s.tvx) * h;
          s.tvy += (-dk * (s.ty - s.tyT) - dc * s.tvy) * h;
          s.tx += s.tvx * h;
          s.ty += s.tvy * h;
        }
        const engaged = !c.paused && c.breathe > 0 && now < s.activeUntil;
        s.breath += ((engaged ? 1 : 0) - s.breath) * (1 - Math.exp(-dt / 0.6));
        if (s.breath > 0.001) s.time += dt;
      }
      const z = Math.exp(s.lz);
      if (s.anchor) {
        // The anchored point stays under the pointer through the glide.
        const at = clampCentre(
          s,
          s.anchor.wx - s.anchor.sx / (s.fit * z),
          s.anchor.wy - s.anchor.sy / (s.fit * z),
          z,
        );
        s.cx = at.x;
        s.cy = at.y;
        s.cvx = s.cvy = 0;
      } else {
        const at = clampCentre(s, s.cx, s.cy, z);
        s.cx = at.x;
        s.cy = at.y;
      }
      draw();
      const root = rootRef.current;
      if (root && !gpuRef.current) {
        // No WebGL: the still's gloss slides with the tilt instead.
        root.style.setProperty("--wing-hx", `${r2((s.tx / MAX_TILT) * 26)}px`);
        root.style.setProperty("--wing-hy", `${r2((-s.ty / MAX_TILT) * 18)}px`);
      }
      const chip = chipRef.current;
      if (chip) {
        const text = readout(z);
        if (chip.textContent !== text) chip.textContent = text;
      }
      const moving =
        Math.abs(s.lz - s.lzT) > 1e-4 ||
        Math.abs(s.lzV) > 1e-3 ||
        Math.abs(s.cx - goal.x) * s.fit * z > 0.05 ||
        Math.abs(s.cy - goal.y) * s.fit * z > 0.05 ||
        Math.abs(s.cvx) + Math.abs(s.cvy) > 1e-4 ||
        Math.abs(s.tx - s.txT) > 1e-4 ||
        Math.abs(s.ty - s.tyT) > 1e-4 ||
        Math.abs(s.tvx) + Math.abs(s.tvy) > 1e-4 ||
        s.breath > 0.002 ||
        (c.motionSafe && now < s.activeUntil && !c.paused && c.breathe > 0);
      if (moving) {
        s.frame = window.requestAnimationFrame(tickRef.current);
        return;
      }
      s.last = 0;
      s.lz = s.lzT;
      s.anchor = null;
      s.breath = 0;
      s.cx = s.cxT = goal.x;
      s.cy = s.cyT = goal.y;
      draw();
      setZoomed(zt > 1.05);
      if (Math.abs(zt - s.announced) > 0.05) {
        s.announced = zt;
        setSaid((p) => ({
          n: p.n + 1,
          text: `Magnified ${zt < 10 ? zt.toFixed(1) : Math.round(zt)} times: ${levelName(zt)}.`,
        }));
      }
    };
  });

  const kick = React.useCallback(() => {
    const s = sim.current;
    if (s.frame || !s.visible || document.hidden) return;
    s.frame = window.requestAnimationFrame((t) => tickRef.current(t));
  }, []);

  /** Marks the visitor as present: the scales breathe for a while. */
  const engage = () => {
    sim.current.activeUntil = performance.now() + 2400;
    kick();
  };

  /**
   * Sets a new target zoom. With a screen point (device px from the centre,
   * y up) the world point under it stays there through the glide; "home"
   * glides back to the whole insect.
   */
  const zoomTo = (
    next: number,
    at: { sx: number; sy: number } | "home" | "keep",
  ) => {
    const s = sim.current;
    const c = latest.current;
    const z = clamp(next, 1, c.top);
    const shown = Math.exp(s.lz);
    if (at === "keep") {
      // The centre target was set by the caller.
      s.anchor = null;
    } else if (at === "home" || !c.motionSafe) {
      s.anchor = null;
      if (at === "home") {
        s.cxT = 0;
        s.cyT = FIT_CY;
      } else {
        // In place: the point under the pointer stays there at once.
        const goal = clampCentre(
          s,
          s.cx + at.sx / (s.fit * shown) - at.sx / (s.fit * z),
          s.cy + at.sy / (s.fit * shown) - at.sy / (s.fit * z),
          z,
        );
        s.cxT = goal.x;
        s.cyT = goal.y;
      }
    } else {
      s.anchor = {
        wx: s.cx + at.sx / (s.fit * shown),
        wy: s.cy + at.sy / (s.fit * shown),
        sx: at.sx,
        sy: at.sy,
      };
    }
    s.lzT = Math.log(z);
    engage();
    c.onZoomChange?.(Math.round(z * 100) / 100);
  };

  /** Device px offset of a client point from the box centre, y up. */
  const offsetOf = (clientX: number, clientY: number) => {
    const el = rootRef.current;
    const r = el?.getBoundingClientRect();
    if (!r) return { sx: 0, sy: 0, nx: 0, ny: 0 };
    const k = sim.current.w / Math.max(1, r.width);
    return {
      sx: (clientX - r.left - r.width / 2) * k,
      sy: -(clientY - r.top - r.height / 2) * k,
      nx: clamp(((clientX - r.left) / Math.max(1, r.width)) * 2 - 1, -1, 1),
      ny: clamp(-(((clientY - r.top) / Math.max(1, r.height)) * 2 - 1), -1, 1),
    };
  };

  // GL, size, visibility: built once.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    const s = sim.current;
    let detach = () => {};
    let disposed = false;
    const measure = () => {
      const k = latest.current.dpr;
      const ratio = Math.min(window.devicePixelRatio || 1, k);
      s.w = Math.max(1, Math.floor(canvas.clientWidth * ratio));
      s.h = Math.max(1, Math.floor(canvas.clientHeight * ratio));
      s.fit = Math.min(
        s.w / (2 * BOUNDS.x * 1.08),
        s.h / ((BOUNDS.top - BOUNDS.bottom) * 1.08),
      );
    };
    const build = () => {
      const gl = createGL(canvas, { alpha: true, premultipliedAlpha: true });
      if (!gl) return false;
      const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
      if (!program) return false;
      const tri = createFullscreenTriangle(gl, program);
      gl.disable(gl.BLEND);
      gpuRef.current = { gl, program, tri, lost: false };
      resizeGL(gl, canvas, { dprCap: latest.current.dpr });
      measure();
      draw();
      return true;
    };
    const release = () => {
      const g = gpuRef.current;
      gpuRef.current = null;
      if (!g || g.lost) return;
      g.tri.dispose();
      g.program.dispose();
    };
    if (!build()) {
      root.setAttribute("data-fallback", "");
    } else {
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
    const sizer = new ResizeObserver(() => {
      const g = gpuRef.current;
      measure();
      if (g && !g.lost) {
        resizeGL(g.gl, canvas, { dprCap: latest.current.dpr });
        draw();
      }
    });
    sizer.observe(canvas);
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
  }, [draw, kick]);

  // The pigment colour is resolved on the component's own element, and read
  // again when the theme changes (the carrier's 1ms colour transition).
  const readGround = React.useCallback(() => {
    const el = carrierRef.current;
    if (!el) return;
    groundRgb.current = readRgb(getComputedStyle(el).color);
    draw();
  }, [draw]);
  React.useEffect(() => {
    readGround();
  }, [readGround, ground]);

  // Look changes redraw the still wing.
  React.useEffect(() => {
    draw();
    kick();
  }, [draw, kick, iridescence, film, markings, seed, breathe]);

  // A host that moves `zoom` gets the same glide a key would; equal on
  // mount, so StrictMode's second run does nothing.
  const asked = React.useRef(startZoom);
  React.useEffect(() => {
    const next = clamp(zoom, 1, top);
    if (Math.abs(next - asked.current) < 0.01) return;
    asked.current = next;
    const s = sim.current;
    if (Math.abs(Math.exp(s.lzT) - next) < 0.01) return;
    const from = Math.exp(s.lzT);
    s.anchor = null;
    s.lzT = Math.log(next);
    if (next <= 1.001) {
      s.cxT = 0;
      s.cyT = FIT_CY;
    } else if (from <= 1.05) {
      // From the whole insect, a host's zoom looks into the right forewing.
      s.cxT = FOCUS.x;
      s.cyT = FOCUS.y;
    }
    kick();
  }, [zoom, top, kick]);

  const api = React.useRef({ offsetOf, zoomTo });
  React.useEffect(() => {
    api.current = { offsetOf, zoomTo };
  });

  // Wheel: needs a non-passive listener to keep the page still while it zooms.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onWheel = (event: WheelEvent) => {
      const c = latest.current;
      if (c.disabled || c.wheel === "off") return;
      const modifier = event.ctrlKey || event.metaKey;
      const focused = document.activeElement === root;
      if (c.wheel === "focus" && !modifier && !focused) {
        setHint(true);
        if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
        hintTimer.current = window.setTimeout(() => setHint(false), 1400);
        return;
      }
      const s = sim.current;
      const dy = wheelPixels(event).y;
      // Scrolling down looks deeper, toward the ridges; a pinch (which
      // arrives as a modified wheel) zooms in as the fingers spread.
      const factor = modifier ? Math.exp(-dy * 0.01) : Math.exp(dy * 0.0022);
      const current = Math.exp(s.lzT);
      const next = clamp(current * factor, 1, c.top);
      // At either limit the wheel belongs to the page again.
      if (Math.abs(next - current) < 1e-3) return;
      event.preventDefault();
      api.current.zoomTo(
        next,
        api.current.offsetOf(event.clientX, event.clientY),
      );
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, []);

  React.useEffect(
    () => () => {
      if (hintTimer.current !== null) window.clearTimeout(hintTimer.current);
    },
    [],
  );

  /* ------------------------------ interaction ------------------------------ */

  const drag = useDrag({
    threshold: 4,
    disabled,
    onStart: ({ event }) => {
      if (pinch.current) return;
      const s = sim.current;
      const z = Math.exp(s.lzT);
      const touch = event.pointerType !== "mouse";
      dragMode.current = z > 1.05 ? "pan" : touch ? "tilt" : null;
      s.anchor = null;
      dragFrom.current = { cx: s.cx, cy: s.cy };
      engage();
    },
    onMove: ({ offset }) => {
      if (pinch.current || !dragMode.current) return;
      const s = sim.current;
      const c = latest.current;
      engage();
      if (dragMode.current === "pan") {
        const k = s.w / Math.max(1, rootRef.current?.clientWidth ?? 1);
        const z = Math.exp(s.lz);
        const at = clampCentre(
          s,
          dragFrom.current.cx - (offset.x * k) / (s.fit * z),
          dragFrom.current.cy + (offset.y * k) / (s.fit * z),
          z,
        );
        // 1:1 under the finger: shown and target move together.
        s.cx = s.cxT = at.x;
        s.cy = s.cyT = at.y;
        s.cvx = s.cvy = 0;
      } else if (c.motionSafe) {
        const r = rootRef.current?.getBoundingClientRect();
        const span = Math.max(1, (r?.width ?? 200) / 2);
        s.txT = clamp(offset.x / span, -1, 1) * MAX_TILT * c.tilt;
        s.tyT = clamp(-offset.y / span, -1, 1) * MAX_TILT * c.tilt;
      }
      kick();
    },
    onEnd: ({ velocity }) => {
      const mode = dragMode.current;
      dragMode.current = null;
      const s = sim.current;
      const c = latest.current;
      if (mode === "pan" && c.motionSafe) {
        const k = s.w / Math.max(1, rootRef.current?.clientWidth ?? 1);
        const z = Math.exp(s.lz);
        const lx = project(0, velocity.x * k, 0.995) / (s.fit * z);
        const ly = project(0, velocity.y * k, 0.995) / (s.fit * z);
        const at = clampCentre(s, s.cx - lx, s.cy + ly, z);
        s.cxT = at.x;
        s.cyT = at.y;
        s.cvx = (-velocity.x * k) / (s.fit * z);
        s.cvy = (velocity.y * k) / (s.fit * z);
      } else if (mode === "tilt") {
        s.txT = s.keyTx;
        s.tyT = s.keyTy;
      }
      kick();
    },
    onCancel: () => {
      dragMode.current = null;
      const s = sim.current;
      s.txT = s.keyTx;
      s.tyT = s.keyTy;
      kick();
    },
  });

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      if (a && b) {
        const s = sim.current;
        const mid = offsetOf((a.x + b.x) / 2, (a.y + b.y) / 2);
        const z = Math.exp(s.lz);
        pinch.current = {
          d0: Math.max(8, Math.hypot(a.x - b.x, a.y - b.y)),
          lz0: s.lz,
          wx: s.cx + mid.sx / (s.fit * z),
          wy: s.cy + mid.sy / (s.fit * z),
        };
        dragMode.current = null;
      }
    }
    drag.onPointerDown(event);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const s = sim.current;
    const c = latest.current;
    if (pointers.current.has(event.pointerId)) {
      pointers.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
    }
    const p = pinch.current;
    if (p && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      if (a && b) {
        const d = Math.max(8, Math.hypot(a.x - b.x, a.y - b.y));
        const lz = clamp(p.lz0 + Math.log(d / p.d0), 0, Math.log(c.top));
        const z = Math.exp(lz);
        const mid = offsetOf((a.x + b.x) / 2, (a.y + b.y) / 2);
        const at = clampCentre(
          s,
          p.wx - mid.sx / (s.fit * z),
          p.wy - mid.sy / (s.fit * z),
          z,
        );
        // Pinch is 1:1: the fingers hold the wing.
        s.lz = s.lzT = lz;
        s.lzV = 0;
        s.anchor = null;
        s.cx = s.cxT = at.x;
        s.cy = s.cyT = at.y;
        engage();
        kick();
      }
      return;
    }
    drag.onPointerMove(event);
    if (event.pointerType === "mouse" && !dragMode.current && c.motionSafe) {
      const at = offsetOf(event.clientX, event.clientY);
      s.txT = clamp(s.keyTx + at.nx * MAX_TILT * c.tilt, -MAX_TILT, MAX_TILT);
      s.tyT = clamp(s.keyTy + at.ny * MAX_TILT * c.tilt, -MAX_TILT, MAX_TILT);
      engage();
      kick();
    }
  };

  const endPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pinch.current && pointers.current.size < 2) {
      pinch.current = null;
      latest.current.onZoomChange?.(
        Math.round(Math.exp(sim.current.lzT) * 100) / 100,
      );
      kick();
    }
  };

  /**
   * From the whole insect the keys look into the middle of the right
   * forewing, not the body at the centre: the view glides there as it zooms.
   */
  const lookIntoForewing = () => {
    const s = sim.current;
    s.anchor = null;
    s.cxT = FOCUS.x;
    s.cyT = FOCUS.y;
  };

  const nextLevel = (z: number) =>
    LEVELS.find((l) => l > z * 1.05) ?? (z >= top * 0.95 ? 1 : top);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const s = sim.current;
    const c = latest.current;
    const z = Math.exp(s.lzT);
    const step = (k: number) => {
      event.preventDefault();
      // Keys zoom about where the view is heading, not where it is now.
      if (z <= 1.05 && k > 1) lookIntoForewing();
      zoomTo(z * k, "keep");
    };
    if (event.shiftKey && event.key.startsWith("Arrow")) {
      event.preventDefault();
      const view = s.h / (s.fit * z);
      const dx =
        event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
      const dy =
        event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0;
      s.anchor = null;
      const at = clampCentre(
        s,
        s.cxT + dx * view * 0.12,
        s.cyT + dy * view * 0.12,
        z,
      );
      s.cxT = at.x;
      s.cyT = at.y;
      engage();
      return;
    }
    switch (event.key) {
      case "+":
      case "=":
      case "ArrowUp":
        step(1.5);
        return;
      case "-":
      case "_":
      case "ArrowDown":
        step(1 / 1.5);
        return;
      case "PageUp":
        step(3);
        return;
      case "PageDown":
        step(1 / 3);
        return;
      case "Home":
        event.preventDefault();
        zoomTo(1, "home");
        return;
      case "End":
        step(c.top / z);
        return;
      case "Enter": {
        event.preventDefault();
        const next = nextLevel(z);
        if (z <= 1.05 && next > 1) lookIntoForewing();
        zoomTo(next, next <= 1 ? "home" : "keep");
        return;
      }
      case "Escape":
        // Escape is ours only while there is a zoom to leave.
        if (z <= 1.001) return;
        event.preventDefault();
        zoomTo(1, "home");
        return;
      case "ArrowLeft":
      case "ArrowRight": {
        event.preventDefault();
        const d = event.key === "ArrowLeft" ? -1 : 1;
        const k = MAX_TILT * Math.max(0.25, c.tilt);
        s.keyTx = clamp(s.keyTx + d * k * 0.34, -k, k);
        s.txT = s.keyTx;
        s.tyT = s.keyTy;
        engage();
        setSaid((p) => ({
          n: p.n + 1,
          text: `Wing tilted ${Math.round((s.keyTx * 180) / Math.PI)} degrees.`,
        }));
        return;
      }
      default:
        return;
    }
  };

  return (
    <div
      ref={rootRef}
      role="group"
      aria-roledescription="zoomable specimen"
      aria-label={label}
      aria-describedby={`${id}-keys`}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => {
        endPointer(event);
        drag.onPointerUp(event);
      }}
      onPointerCancel={(event) => {
        endPointer(event);
        drag.onPointerCancel(event);
      }}
      onLostPointerCapture={drag.onLostPointerCapture}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse") return;
        const s = sim.current;
        s.txT = s.keyTx;
        s.tyT = s.keyTy;
        kick();
      }}
      onDoubleClick={(event) => {
        if (disabled) return;
        const next = nextLevel(Math.exp(sim.current.lzT));
        zoomTo(
          next,
          next <= 1 ? "home" : offsetOf(event.clientX, event.clientY),
        );
      }}
      onKeyDown={onKeyDown}
      onFocus={engage}
      className={cn(
        "group/wing-scales relative isolate h-56 w-full overflow-clip rounded-3 select-none [-webkit-tap-highlight-color:transparent]",
        "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled
          ? "cursor-not-allowed opacity-60"
          : zoomed
            ? "cursor-grab active:cursor-grabbing"
            : "cursor-zoom-in",
        className,
      )}
      style={{ touchAction: disabled ? "auto" : zoomed ? "none" : "pan-y" }}
    >
      <span
        ref={carrierRef}
        aria-hidden
        onTransitionEnd={readGround}
        className="pointer-events-none absolute size-0 transition-colors duration-1"
        style={{ color: ground }}
      />
      <div className="pointer-events-none absolute inset-0 transition-opacity duration-300 group-data-live/wing-scales:opacity-0">
        <Still id={id} markings={markings} />
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-live/wing-scales:opacity-100"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-2 left-2 inline-flex h-6 items-center rounded-full border border-hairline bg-[color-mix(in_oklab,var(--card)_82%,transparent)] px-2.5 font-mono text-[10px] tracking-[0.06em] whitespace-nowrap text-ink-2 tabular-nums backdrop-blur-sm"
      >
        <span ref={chipRef}>{initialReadout}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute bottom-2 left-1/2 inline-flex h-6 -translate-x-1/2 items-center rounded-full bg-[color-mix(in_oklab,var(--foreground)_78%,transparent)] px-2.5 text-[11px] whitespace-nowrap text-background transition-opacity duration-200",
          hint ? "opacity-100" : "opacity-0",
        )}
      >
        Click, then scroll to zoom
      </span>
      <p id={`${id}-keys`} className="sr-only">
        Plus and minus, or Up and Down, zoom in and out; Page Up and Page Down
        zoom by three times; Home shows the whole wing and End the ridges of one
        scale; Enter steps to the next level; Left and Right tilt the wing
        toward the light; Shift with an arrow moves around when zoomed in;
        Escape returns to the whole wing.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
