"use client";

import * as React from "react";

import { motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import {
  FULLSCREEN_VERTEX,
  createFullscreenTriangle,
  createGL,
  createPingPong,
  createProgram,
  onContextLoss,
  resizeGL,
  uploadTexture,
  type FullscreenTriangle,
  type GLContext,
  type PingPong,
  type Program,
} from "@/registry/lib/glsl";
import { cn } from "@/registry/lib/utils";

export type LiquifyPrintState = "rest" | "smearing" | "relaxing" | "holding";

export type LiquifyPrintProps = {
  /** An image to smear instead of the drawn print. For WebGL it must be same-origin or served with CORS. */
  src?: string;
  /** What the print shows, for assistive technology. @default a description of the drawn poster */
  alt?: string;
  /** The brush's radius in px. @default 56 */
  brush?: number;
  /** How long the paint takes to remember its shape once you stop, in ms. @default 2200 */
  relax?: number;
  /** How wet a fresh smear looks, 0 (dry and matte) to 1 (a shining sheen that dries as it relaxes). @default 0.55 */
  gloss?: number;
  /** How much paint a stroke carries, 0 to 1.5. @default 1 */
  strength?: number;
  /** How much a circling stroke winds the paint into a vortex, 0 to 1. @default 0.6 */
  swirl?: number;
  /** Controlled: every smear is pinned and none relax. */
  pinned?: boolean;
  /** Pin every smear from the start when uncontrolled. @default false */
  defaultPinned?: boolean;
  /** Fires when the pin is switched, with the new state. */
  onPinnedChange?: (pinned: boolean) => void;
  /** Fires as a stroke starts, with whether it is pinned. */
  onSmear?: (pinned: boolean) => void;
  /** Fires when the print is restored by a double click, Escape or `restoreKey`. */
  onRestore?: () => void;
  /** Fires as the print goes from rest to smearing, relaxing or holding, and back. */
  onStateChange?: (state: LiquifyPrintState) => void;
  /** Change it to restore the print from outside. */
  restoreKey?: number;
  /** Names the print for assistive technology. @default "Wet print" */
  label?: string;
  /** Shows the print but takes no input. @default false */
  disabled?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Sizes the print; give it a height. @default "h-56 w-full" */
  className?: string;
};

/* ---------------------------------- art ----------------------------------- */

const r1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

/** A fern frond: a curving rachis with paired leaflets that shrink toward the tip. */
function frond(
  x0: number,
  y0: number,
  len: number,
  bend: number,
  colour: string,
): string {
  const parts: string[] = [];
  const pts: { x: number; y: number; a: number }[] = [];
  const n = 26;
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const a = -Math.PI / 2 + bend * t;
    const prev = pts[i - 1];
    const step = len / n;
    pts.push(
      prev
        ? { x: prev.x + Math.cos(a) * step, y: prev.y + Math.sin(a) * step, a }
        : { x: x0, y: y0, a },
    );
  }
  parts.push(
    `<path d="M${pts.map((p) => `${r1(p.x)} ${r1(p.y)}`).join(" L")}" fill="none" stroke="${colour}" stroke-width="3" stroke-linecap="round"/>`,
  );
  for (let i = 2; i < n; i += 1) {
    const p = pts[i];
    if (!p) continue;
    const t = i / n;
    const leaf = (1 - t) * 64 + 10;
    for (const side of [-1, 1]) {
      const a = p.a + side * (Math.PI / 2.6);
      const tipX = p.x + Math.cos(a) * leaf;
      const tipY = p.y + Math.sin(a) * leaf;
      const nx = Math.cos(a + Math.PI / 2) * leaf * 0.16;
      const ny = Math.sin(a + Math.PI / 2) * leaf * 0.16;
      parts.push(
        `<path d="M${r1(p.x)} ${r1(p.y)} Q${r1((p.x + tipX) / 2 + nx)} ${r1((p.y + tipY) / 2 + ny)} ${r1(tipX)} ${r1(tipY)} Q${r1((p.x + tipX) / 2 - nx)} ${r1((p.y + tipY) / 2 - ny)} ${r1(p.x)} ${r1(p.y)} Z" fill="${colour}"/>`,
      );
      // The vein: a fine line down every leaflet, the detail a smear drags out.
      parts.push(
        `<path d="M${r1(p.x)} ${r1(p.y)} L${r1(tipX)} ${r1(tipY)}" stroke="rgba(244,236,222,0.55)" stroke-width="0.9"/>`,
      );
    }
  }
  return parts.join("");
}

function poster(): string {
  const lines = Array.from({ length: 16 }, (_, i) => {
    const y = 96 + i * 26;
    return `<path d="M960 ${y} H1420" stroke="rgba(38,52,48,0.16)" stroke-width="1.4"/>`;
  }).join("");
  const dots = Array.from({ length: 10 }, (_, i) =>
    Array.from(
      { length: 6 },
      (_, j) =>
        `<circle cx="${1010 + i * 40}" cy="${452 + j * 22}" r="4" fill="rgb(214,92,64)"/>`,
    ).join(""),
  ).join("");
  return `<rect width="1500" height="600" fill="rgb(244,236,222)"/>
<rect x="60" y="60" width="520" height="480" fill="rgb(52,104,96)"/>
<circle cx="460" cy="210" r="132" fill="rgb(232,112,78)"/>
<circle cx="460" cy="210" r="92" fill="rgb(244,170,92)"/>
<rect x="60" y="430" width="520" height="22" fill="rgb(238,196,92)"/>
${frond(250, 560, 470, 0.9, "rgb(30,58,46)")}
${frond(410, 560, 360, -0.7, "rgb(84,140,92)")}
<text x="640" y="200" font-family="Georgia, 'Times New Roman', serif" font-size="128" font-weight="700" fill="rgb(30,40,38)" letter-spacing="-2">FERN</text>
<text x="640" y="320" font-family="Georgia, 'Times New Roman', serif" font-size="128" font-style="italic" fill="rgb(214,92,64)" letter-spacing="-2">study</text>
<text x="646" y="378" font-family="ui-monospace, Menlo, monospace" font-size="22" fill="rgb(30,40,38)" letter-spacing="6">No. 7 · FERNWORKS PRESS</text>
<rect x="640" y="404" width="300" height="3" fill="rgb(30,40,38)"/>
<text x="646" y="452" font-family="Georgia, serif" font-size="26" fill="rgb(52,64,60)">Polypodium, drawn from life</text>
<text x="646" y="490" font-family="Georgia, serif" font-size="26" fill="rgb(52,64,60)">in the north glasshouse.</text>
${lines}${dots}
<rect x="960" y="60" width="460" height="24" fill="rgb(52,104,96)"/>
<text x="1420" y="560" text-anchor="end" font-family="ui-monospace, Menlo, monospace" font-size="18" fill="rgb(52,64,60)" letter-spacing="3">EDITION OF 120</text>`;
}

const DEFAULT_SRC = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="600" viewBox="0 0 1500 600">${poster()}</svg>`,
)}`;
const DEFAULT_ALT =
  "A Fernworks Press poster titled Fern study, No. 7: two fern fronds over a teal block and an orange sun, with set type to the right.";

/* --------------------------------- shaders -------------------------------- */

/** Offsets are stored in uv; a byte field stores them in ±RANGE around one half. */
const CODEC = /* glsl */ `
uniform float u_bytes;
const float RANGE = 0.35;
vec2 dec(vec4 t) { return u_bytes > 0.5 ? (t.rg - 0.5) * 2.0 * RANGE : t.rg; }
vec4 enc(vec2 d) { return u_bytes > 0.5 ? vec4(clamp(d / (2.0 * RANGE) + 0.5, 0.0, 1.0), 0.0, 1.0) : vec4(d, 0.0, 1.0); }
`;

const PUSH = /* glsl */ `
uniform sampler2D u_field;
uniform vec2 u_from;
uniform vec2 u_to;
uniform float u_radius;
uniform float u_aspect;
uniform float u_strength;
uniform float u_twist;
in vec2 v_uv;
out vec4 o_color;
${CODEC}
void main() {
  vec2 a = vec2(u_from.x * u_aspect, u_from.y);
  vec2 b = vec2(u_to.x * u_aspect, u_to.y);
  vec2 q = vec2(v_uv.x * u_aspect, v_uv.y);
  vec2 ab = b - a;
  float t = clamp(dot(q - a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
  vec2 c = a + ab * t;
  float d = length(q - c);
  float w = exp(-(d * d) / (u_radius * u_radius)) * u_strength;
  // Where the paint now under this point came from: turned back about the
  // brush, and back along the stroke.
  float ang = -u_twist * w;
  vec2 r = q - c;
  vec2 turned = c + vec2(r.x * cos(ang) - r.y * sin(ang), r.x * sin(ang) + r.y * cos(ang));
  vec2 src = vec2(turned.x / u_aspect, turned.y) - (u_to - u_from) * w;
  vec2 D = dec(texture(u_field, src));
  o_color = enc(src + D - v_uv);
}
`;

const SCALE = /* glsl */ `
uniform sampler2D u_field;
uniform float u_keep;
in vec2 v_uv;
out vec4 o_color;
${CODEC}
void main() {
  o_color = enc(dec(texture(u_field, v_uv)) * u_keep);
}
`;

const SCREEN = /* glsl */ `
uniform sampler2D u_img;
uniform sampler2D u_live;
uniform sampler2D u_pinned;
uniform vec4 u_cover;
uniform vec2 u_texel;
uniform float u_gloss;
uniform float u_original;
in vec2 v_uv;
out vec4 o_color;
${CODEC}
vec2 total(vec2 uv) {
  vec2 q = uv + dec(texture(u_live, uv));
  return q + dec(texture(u_pinned, q)) - uv;
}
void main() {
  vec2 uv = v_uv;
  vec2 D = total(uv);
  vec3 col = texture(u_img, (uv + D) * u_cover.xy + u_cover.zw).rgb;
  // Wet paint: the size of the push is a surface, lit from the upper left;
  // where the smear packed paint together it runs a little richer.
  vec2 ex = vec2(u_texel.x, 0.0);
  vec2 ey = vec2(0.0, u_texel.y);
  vec2 Dr = total(uv + ex);
  vec2 Dl = total(uv - ex);
  vec2 Dd = total(uv + ey);
  vec2 Du = total(uv - ey);
  float div = (Dr.x - Dl.x) / (2.0 * u_texel.x) + (Dd.y - Du.y) / (2.0 * u_texel.y);
  float hx = length(Dr) - length(Dl);
  float hy = length(Dd) - length(Du);
  float wet = smoothstep(0.0005, 0.012, length(D)) * u_gloss;
  // Shine lives where the paint was actually worked: the strain of the push.
  float strain = smoothstep(0.0, 0.02, length(Dr - Dl) + length(Dd - Du));
  vec3 n = normalize(vec3(-hx * 40.0, -hy * 40.0, 1.0));
  vec3 l = normalize(vec3(-0.55, -0.65, 0.6));
  vec3 h = normalize(l + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, h), 0.0), 40.0);
  float lit = clamp(dot(n, l) / l.z, 0.75, 1.15);
  col *= mix(1.0, lit, wet * strain * 0.7);
  col *= 1.0 - clamp(div * 0.25, 0.0, 0.2) * wet;
  col += vec3(1.0, 0.98, 0.94) * spec * wet * strain * 0.5;
  col = mix(col, texture(u_img, uv * u_cover.xy + u_cover.zw).rgb, u_original);
  o_color = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/* --------------------------------- engine --------------------------------- */

type Config = {
  brush: number;
  relax: number;
  gloss: number;
  strength: number;
  swirl: number;
  motionSafe: boolean;
  dpr: number;
};

type Gpu = {
  gl: GLContext;
  push: Program;
  scale: Program;
  screen: Program;
  triPush: FullscreenTriangle;
  triScale: FullscreenTriangle;
  triScreen: FullscreenTriangle;
  live: PingPong;
  pinned: PingPong;
  tex: WebGLTexture | null;
  texSize: { w: number; h: number };
  bytes: boolean;
  lost: boolean;
};

type Engine = {
  configure: (cfg: Config) => void;
  setImage: (img: HTMLImageElement | null) => void;
  /** A brush segment, in px of the print: from, to, twist in radians, pinned or live. */
  stroke: (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    twist: number,
    pin: boolean,
  ) => void;
  /** The hand has lifted (or the keys stopped): relaxation may begin. */
  release: () => void;
  hold: (on: boolean) => void;
  restore: (instant: boolean) => void;
  /** Whether anything is smeared, live or pinned. */
  dirty: () => boolean;
  resize: () => void;
  wake: () => void;
  setVisible: (on: boolean) => void;
  dispose: () => void;
};

const QUEUE = 48;

function createEngine(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  onState: (s: LiquifyPrintState) => void,
): Engine {
  let cfg: Config | null = null;
  let gpu: Gpu | null = null;
  let failed = false;
  let disposed = false;
  let visible = false;
  let frame = 0;
  let last = 0;
  const size = { w: 0, h: 0 };
  // Segments waiting for the next frame: x0, y0, x1, y1, twist, pin.
  const queue = new Float32Array(QUEUE * 6);
  let queued = 0;
  let img: HTMLImageElement | null = null;
  // Live field bound and relaxation clock.
  let liveBound = 0;
  let pinnedBound = 0;
  let idleFor = 0;
  let relaxing = false;
  let held = false;
  let down = false;
  let restoring = 0;
  let original = 0;
  let state: LiquifyPrintState = "rest";

  const build = (): boolean => {
    const gl = createGL(canvas, { alpha: false });
    if (!gl) return false;
    const push = createProgram(gl, FULLSCREEN_VERTEX, PUSH);
    const scale = createProgram(gl, FULLSCREEN_VERTEX, SCALE);
    const screen = createProgram(gl, FULLSCREEN_VERTEX, SCREEN);
    if (!push || !scale || !screen) return false;
    const live = createPingPong(gl, 8, 8, true);
    const pinned = createPingPong(gl, 8, 8, true);
    gpu = {
      gl,
      push,
      scale,
      screen,
      triPush: createFullscreenTriangle(gl, push),
      triScale: createFullscreenTriangle(gl, scale),
      triScreen: createFullscreenTriangle(gl, screen),
      live,
      pinned,
      tex: null,
      texSize: { w: 1, h: 1 },
      bytes: live.precision === "byte",
      lost: false,
    };
    return true;
  };

  const releaseGpu = () => {
    const g = gpu;
    gpu = null;
    if (!g || g.lost) return;
    g.triPush.dispose();
    g.triScale.dispose();
    g.triScreen.dispose();
    g.push.dispose();
    g.scale.dispose();
    g.screen.dispose();
    g.live.dispose();
    g.pinned.dispose();
    if (g.tex) g.gl.deleteTexture(g.tex);
  };

  const setState = (next: LiquifyPrintState) => {
    if (next === state) return;
    state = next;
    onState(next);
  };

  /** Both fields cleared to "no offset". */
  const clearFields = () => {
    const g = gpu;
    if (!g || g.lost) return;
    const { gl } = g;
    const v = g.bytes ? 0.5 : 0;
    for (const f of [
      g.live.read,
      g.live.write,
      g.pinned.read,
      g.pinned.write,
    ]) {
      f.bind();
      gl.clearColor(v, v, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    liveBound = 0;
    pinnedBound = 0;
  };

  const fieldSize = () => {
    const w = Math.max(16, Math.min(320, Math.round(size.w / 4)));
    const h = Math.max(8, Math.round((w * size.h) / Math.max(1, size.w)));
    return { w, h };
  };

  const ensureFields = () => {
    const g = gpu;
    if (!g || g.lost) return;
    const fs = fieldSize();
    if (g.live.read.width === fs.w && g.live.read.height === fs.h) return;
    g.live.dispose();
    g.pinned.dispose();
    g.live = createPingPong(g.gl, fs.w, fs.h, true);
    g.pinned = createPingPong(g.gl, fs.w, fs.h, true);
    g.bytes = g.live.precision === "byte";
    clearFields();
  };

  const upload = () => {
    const g = gpu;
    if (!g || g.lost || !img || !img.complete || !img.naturalWidth) return;
    try {
      g.tex = uploadTexture(g.gl, img, {}, g.tex);
      g.texSize = { w: img.naturalWidth, h: img.naturalHeight };
    } catch {
      // A cross-origin image without CORS cannot become a texture.
      failed = true;
      root.setAttribute("data-fallback", "");
      root.removeAttribute("data-live");
    }
  };

  const cover = (): number[] => {
    const g = gpu;
    const aspect = size.w / Math.max(1, size.h);
    const ia = (g?.texSize.w ?? 1) / Math.max(1, g?.texSize.h ?? 1);
    if (ia > aspect) {
      const sx = aspect / ia;
      return [sx, 1, (1 - sx) / 2, 0];
    }
    const sy = ia / aspect;
    return [1, sy, 0, (1 - sy) / 2];
  };

  const scaleField = (field: PingPong, keep: number) => {
    const g = gpu;
    if (!g) return;
    g.scale.use();
    g.scale.set({ u_keep: keep, u_bytes: g.bytes ? 1 : 0 });
    g.scale.texture("u_field", field.read.texture, 0);
    field.write.bind();
    g.triScale.draw();
    field.swap();
  };

  const applyQueue = () => {
    const g = gpu;
    const c = cfg;
    if (!g || g.lost || !c || !queued) return;
    const aspect = size.w / Math.max(1, size.h);
    const radius = clamp(c.brush, 8, 240) / Math.max(1, size.h);
    g.push.use();
    for (let i = 0; i < queued; i += 1) {
      const o = i * 6;
      const pin = (queue[o + 5] ?? 0) > 0.5;
      const field = pin ? g.pinned : g.live;
      g.push.set({
        u_from: [(queue[o] ?? 0) / size.w, (queue[o + 1] ?? 0) / size.h],
        u_to: [(queue[o + 2] ?? 0) / size.w, (queue[o + 3] ?? 0) / size.h],
        u_radius: radius,
        u_aspect: aspect,
        // Strength 1 carries most, not all, of the paint under the brush.
        u_strength: clamp(c.strength, 0, 1.5) * 0.8,
        u_twist: queue[o + 4] ?? 0,
        u_bytes: g.bytes ? 1 : 0,
      });
      g.push.texture("u_field", field.read.texture, 0);
      field.write.bind();
      g.triPush.draw();
      field.swap();
      const moved =
        Math.hypot(
          (queue[o + 2] ?? 0) - (queue[o] ?? 0),
          (queue[o + 3] ?? 0) - (queue[o + 1] ?? 0),
        ) /
          Math.max(1, size.h) +
        Math.abs(queue[o + 4] ?? 0) * radius;
      if (pin) pinnedBound = Math.min(0.35, pinnedBound + moved);
      else liveBound = Math.min(0.35, liveBound + moved);
    }
    queued = 0;
  };

  const draw = () => {
    const g = gpu;
    const c = cfg;
    if (!g || g.lost || !c || size.w < 1 || !g.tex) return;
    const { gl } = g;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    const fs = fieldSize();
    g.screen.use();
    g.screen.set({
      u_cover: cover(),
      u_texel: [1 / fs.w, 1 / fs.h],
      u_gloss: clamp01(c.gloss),
      u_original: original,
      u_bytes: g.bytes ? 1 : 0,
    });
    g.screen.texture("u_img", g.tex, 0);
    g.screen.texture("u_live", g.live.read.texture, 1);
    g.screen.texture("u_pinned", g.pinned.read.texture, 2);
    g.triScreen.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** Critically damped from rest: how much of a smear is left after t of a relax of time constant tau. */
  const remain = (t: number, tau: number) => (1 + t / tau) * Math.exp(-t / tau);

  const step = (dt: number) => {
    const c = cfg;
    const g = gpu;
    if (!c || !g || g.lost) return;
    ensureFields();
    applyQueue();
    if (restoring > 0) {
      if (c.motionSafe) {
        // The snap spring's time scale, both fields at once.
        const tau = 1 / Math.sqrt(springs.snap.stiffness / springs.snap.mass);
        const t0 = restoring;
        restoring += dt;
        const keep =
          remain(restoring, tau * 1.6) / Math.max(1e-6, remain(t0, tau * 1.6));
        scaleField(g.live, keep);
        scaleField(g.pinned, keep);
        liveBound *= keep;
        pinnedBound *= keep;
        if (liveBound + pinnedBound < 0.0006 || restoring > 0.8) {
          clearFields();
          restoring = 0;
        }
      } else {
        original = Math.min(1, original + dt / 0.4);
        if (original >= 1) {
          clearFields();
          original = 0;
          restoring = 0;
        }
      }
      return;
    }
    if (down || held || liveBound <= 0) {
      idleFor = 0;
      relaxing = false;
      return;
    }
    idleFor += dt;
    if (idleFor < 0.14) return;
    const tau = Math.max(0.1, c.relax / 1000) / 4;
    if (!c.motionSafe) {
      // Reduced motion: no glide back, a cross-fade once the relax time is up.
      if (idleFor < c.relax / 1000) return;
      relaxing = true;
      original = Math.min(1, original + dt / 0.4);
      if (original >= 1) {
        scaleField(g.live, 0);
        liveBound = 0;
        original = 0;
        relaxing = false;
      }
      return;
    }
    relaxing = true;
    const t1 = idleFor - 0.14;
    const t0 = Math.max(0, t1 - dt);
    const keep = remain(t1, tau) / Math.max(1e-6, remain(t0, tau));
    scaleField(g.live, keep);
    liveBound *= keep;
    if (liveBound < 0.0004) {
      scaleField(g.live, 0);
      liveBound = 0;
      relaxing = false;
    }
  };

  const busy = () =>
    queued > 0 || restoring > 0 || (liveBound > 0 && !held) || original > 0;

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !visible || document.hidden || !cfg) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(1 / 20, (now - last) / 1000) : 1 / 60;
    last = now;
    step(dt);
    draw();
    setState(
      down
        ? "smearing"
        : relaxing || restoring > 0
          ? "relaxing"
          : liveBound > 0 || pinnedBound > 0
            ? "holding"
            : "rest",
    );
    if (busy() || down) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const resize = () => {
    const g = gpu;
    const c = cfg;
    if (!g || g.lost || !c) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    size.w = w;
    size.h = h;
    const cap = clamp(c.dpr, 0.5, 2);
    const ratio = Math.min(window.devicePixelRatio || 1, cap);
    resizeGL(g.gl, canvas, {
      dprCap: cap,
      renderScale: ratio >= 1.5 ? 0.75 : 1,
    });
    ensureFields();
    draw();
  };

  const start = () => {
    if (!build()) return false;
    clearFields();
    upload();
    resize();
    return true;
  };

  let detach: () => void = () => {};

  return {
    configure(next) {
      cfg = next;
      if (failed) return;
      if (!gpu) {
        if (!start()) {
          failed = true;
          root.setAttribute("data-fallback", "");
          return;
        }
        detach = onContextLoss(
          canvas,
          () => {
            if (gpu) gpu.lost = true;
            if (frame) window.cancelAnimationFrame(frame);
            frame = 0;
            root.removeAttribute("data-live");
          },
          () => {
            gpu = null;
            if (!disposed && start()) kick();
          },
        );
      }
      resize();
      kick();
    },
    setImage(next) {
      img = next;
      upload();
      draw();
    },
    stroke(x0, y0, x1, y1, twist, pin) {
      if (failed) return;
      // Long jumps are cut into brush-sized steps, so a fast flick still smears.
      const c = cfg;
      const reach = Math.max(4, (c?.brush ?? 56) * 0.5);
      const parts = Math.min(
        8,
        Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / reach)),
      );
      for (let k = 0; k < parts; k += 1) {
        if (queued >= QUEUE) break;
        const o = queued * 6;
        queue[o] = x0 + ((x1 - x0) * k) / parts;
        queue[o + 1] = y0 + ((y1 - y0) * k) / parts;
        queue[o + 2] = x0 + ((x1 - x0) * (k + 1)) / parts;
        queue[o + 3] = y0 + ((y1 - y0) * (k + 1)) / parts;
        queue[o + 4] = twist / parts;
        queue[o + 5] = pin ? 1 : 0;
        queued += 1;
      }
      down = true;
      idleFor = 0;
      original = 0;
      kick();
    },
    release() {
      down = false;
      idleFor = 0;
      kick();
    },
    hold(on) {
      held = on;
      idleFor = 0;
      kick();
    },
    restore(instant) {
      queued = 0;
      if (instant) {
        clearFields();
        restoring = 0;
        original = 0;
        draw();
        setState("rest");
        return;
      }
      restoring = 1e-4;
      original = 0;
      kick();
    },
    dirty: () => liveBound > 0 || pinnedBound > 0 || queued > 0,
    resize,
    wake() {
      draw();
      kick();
    },
    setVisible(on) {
      visible = on;
      if (on) kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      detach();
      releaseGpu();
      root.removeAttribute("data-live");
    },
  };
}

/* -------------------------------- component -------------------------------- */

const STEP_PX = 24;

/**
 * A print you push around like wet paint. Drag across it and the picture
 * smears along your stroke; circle and the paint winds into a small vortex.
 * Fresh smears are wet — lit by the strain of the push, so they shine — and
 * when you stop, the print slowly relaxes back to itself on a critically
 * damped ease, as if the paint remembered its shape, drying as it goes.
 * Smears made with Shift held are pinned and stay; holding Shift while idle
 * keeps the live ones where they are. Double click or Escape restores it on
 * the snap spring.
 *
 * The print is a displacement field in WebGL2 — two of them, live over
 * pinned — at a quarter of the canvas, sampled through once per frame. The
 * print is focusable: arrow keys smear from a brush at its centre (Shift to
 * pin), [ and ] twist the paint, Escape restores. Under reduced motion smears
 * still follow the hand, and the print cross-fades back instead of gliding.
 */
export function LiquifyPrint({
  src,
  alt = DEFAULT_ALT,
  brush = 56,
  relax = 2200,
  gloss = 0.55,
  strength = 1,
  swirl = 0.6,
  pinned,
  defaultPinned = false,
  onPinnedChange,
  onSmear,
  onRestore,
  onStateChange,
  restoreKey = 0,
  label = "Wet print",
  disabled = false,
  dpr = 2,
  className,
}: LiquifyPrintProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const image = src ?? DEFAULT_SRC;
  const [ownPinned, setOwnPinned] = React.useState(defaultPinned);
  const pinAll = pinned ?? ownPinned;
  // The brush ring follows the hand in motion values, never through state.
  const [ringMode, setRingMode] = React.useState<
    "off" | "pointer" | "keyboard"
  >("off");
  const ringX = useMotionValue(0);
  const ringY = useMotionValue(0);
  const setRing = (r: {
    x: number;
    y: number;
    mode: "off" | "pointer" | "keyboard";
  }) => {
    ringX.set(r.x);
    ringY.set(r.y);
    setRingMode(r.mode);
  };
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visibleRef = React.useRef(false);
  const last = React.useRef<{
    x: number;
    y: number;
    dx: number;
    dy: number;
  } | null>(null);
  const shift = React.useRef(false);
  const kbd = React.useRef({ x: -1, y: -1 });
  const stateCb = React.useRef(onStateChange);

  const config: Config = {
    brush,
    relax,
    gloss,
    strength,
    swirl,
    motionSafe,
    dpr,
  };
  const latest = React.useRef(config);
  React.useEffect(() => {
    latest.current = config;
    stateCb.current = onStateChange;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const e = createEngine(root, canvas, (s) => stateCb.current?.(s));
    engine.current = e;
    e.configure(latest.current);
    e.setVisible(visibleRef.current);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  React.useEffect(() => {
    let alive = true;
    const img = new Image();
    if (!image.startsWith("data:")) img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      if (alive) engine.current?.setImage(img);
    };
    img.src = image;
    if (img.complete) engine.current?.setImage(img);
    return () => {
      alive = false;
      img.onload = null;
    };
  }, [image]);

  // Shift anywhere pins: while it is down, live smears hold still too.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const on = event.shiftKey;
      if (on === shift.current) return;
      shift.current = on;
      engine.current?.hold(on);
    };
    const onBlur = () => {
      shift.current = false;
      engine.current?.hold(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) engine.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const restore = React.useCallback(
    (why: "key" | "pointer" | "host") => {
      engine.current?.restore(false);
      onRestore?.();
      if (why !== "host") say("Restored.");
    },
    [onRestore],
  );

  // A host that bumps `restoreKey` restores the print.
  const seenKey = React.useRef(restoreKey);
  React.useEffect(() => {
    if (seenKey.current === restoreKey) return;
    seenKey.current = restoreKey;
    restore("host");
  }, [restoreKey, restore]);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visibleRef.current = Boolean(entry?.isIntersecting);
      engine.current?.setVisible(visibleRef.current);
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visibleRef.current = false;
    };
  }, []);

  const local = (clientX: number, clientY: number) => {
    const r = rootRef.current?.getBoundingClientRect();
    return r ? { x: clientX - r.left, y: clientY - r.top } : { x: 0, y: 0 };
  };

  /** One segment of a stroke: the push, plus twist from how sharply the stroke is turning. */
  const smear = (x: number, y: number, pin: boolean) => {
    const prev = last.current;
    if (!prev) {
      last.current = { x, y, dx: 0, dy: 0 };
      return;
    }
    const dx = x - prev.x;
    const dy = y - prev.y;
    if (Math.hypot(dx, dy) < 0.5) return;
    let twist = 0;
    if (prev.dx !== 0 || prev.dy !== 0) {
      const turn = Math.atan2(
        prev.dx * dy - prev.dy * dx,
        prev.dx * dx + prev.dy * dy,
      );
      twist = clamp(turn, -0.6, 0.6) * clamp01(swirl) * 0.9;
    }
    engine.current?.stroke(prev.x, prev.y, x, y, twist, pin);
    last.current = { x, y, dx, dy };
  };

  const drag = useDrag({
    threshold: 2,
    disabled,
    onStart: ({ point, event }) => {
      const p = local(point.x, point.y);
      last.current = { x: p.x, y: p.y, dx: 0, dy: 0 };
      const pin = pinAll || event.shiftKey;
      onSmear?.(pin);
    },
    onMove: ({ point, event }) => {
      const p = local(point.x, point.y);
      setRing({ x: Math.round(p.x), y: Math.round(p.y), mode: "pointer" });
      smear(p.x, p.y, pinAll || event.shiftKey);
    },
    onEnd: () => {
      last.current = null;
      engine.current?.release();
    },
    onCancel: () => {
      last.current = null;
      engine.current?.release();
    },
  });

  const keyBrush = () => {
    const el = rootRef.current;
    if (!el) return { x: 0, y: 0 };
    if (kbd.current.x < 0)
      kbd.current = { x: el.clientWidth / 2, y: el.clientHeight / 2 };
    return kbd.current;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const el = rootRef.current;
    if (!el) return;
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const d = dirs[event.key];
    if (d) {
      event.preventDefault();
      const b = keyBrush();
      const x = clamp(b.x + d[0] * STEP_PX, 8, el.clientWidth - 8);
      const y = clamp(b.y + d[1] * STEP_PX, 8, el.clientHeight - 8);
      const pin = pinAll || event.shiftKey;
      engine.current?.stroke(b.x, b.y, x, y, 0, pin);
      engine.current?.release();
      if (!event.repeat) onSmear?.(pin);
      kbd.current = { x, y };
      setRing({ x: Math.round(x), y: Math.round(y), mode: "keyboard" });
      return;
    }
    if (event.key === "[" || event.key === "]") {
      event.preventDefault();
      const b = keyBrush();
      engine.current?.stroke(
        b.x,
        b.y,
        b.x,
        b.y,
        event.key === "]" ? 0.7 : -0.7,
        pinAll || event.shiftKey,
      );
      engine.current?.release();
      setRing({ x: Math.round(b.x), y: Math.round(b.y), mode: "keyboard" });
      return;
    }
    if (event.key === "Escape") {
      // Only ours when there is something to restore; otherwise the page's.
      if (!engine.current?.dirty()) return;
      event.preventDefault();
      restore("key");
      return;
    }
    if (event.key === "p" || event.key === "P") {
      event.preventDefault();
      const next = !pinAll;
      if (pinned === undefined) setOwnPinned(next);
      onPinnedChange?.(next);
      say(next ? "Pinned: smears stay." : "Unpinned: smears relax.");
    }
  };

  const ringSize = Math.round(clamp(brush, 8, 240) * 2);

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-roledescription="wet print"
      aria-label={`${label}. ${alt}`}
      aria-describedby={`${uid}-keys`}
      tabIndex={disabled ? -1 : 0}
      {...drag}
      onPointerMove={(event) => {
        drag.onPointerMove(event);
        if (event.pointerType === "mouse" && !disabled) {
          const p = local(event.clientX, event.clientY);
          setRing({ x: Math.round(p.x), y: Math.round(p.y), mode: "pointer" });
        }
      }}
      onPointerLeave={() => setRingMode((m) => (m === "pointer" ? "off" : m))}
      onDoubleClick={() => {
        if (!disabled) restore("pointer");
      }}
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        if (event.currentTarget.matches(":focus-visible")) {
          const b = keyBrush();
          setRing({ x: Math.round(b.x), y: Math.round(b.y), mode: "keyboard" });
        }
      }}
      onBlur={() => setRingMode((m) => (m === "keyboard" ? "off" : m))}
      className={cn(
        "group/liquify-print relative isolate h-56 w-full touch-none overflow-clip rounded-3 bg-surface-2 select-none",
        ringMode === "pointer" ? "cursor-none" : "cursor-default",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <span id={`${uid}-keys`} className="sr-only">
        Drag to smear the paint. Arrow keys smear from the brush, Shift pins a
        smear, the bracket keys twist the paint, P pins every smear, and Escape
        restores the print.
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image}
        alt=""
        draggable={false}
        className="pointer-events-none absolute inset-0 size-full object-cover"
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 group-data-live/liquify-print:opacity-100"
      />
      <motion.span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-0 left-0 rounded-full border border-white/80 shadow-[0_0_0_1px_color-mix(in_oklab,black_35%,transparent)] transition-opacity duration-150",
          ringMode === "off" ? "opacity-0" : "opacity-100",
        )}
        style={{
          width: ringSize,
          height: ringSize,
          marginLeft: -ringSize / 2,
          marginTop: -ringSize / 2,
          x: ringX,
          y: ringY,
        }}
      />
      <span role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}
