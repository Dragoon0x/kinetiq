"use client";

import * as React from "react";

import {
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import {
  createGL,
  createGridMesh,
  createProgram,
  onContextLoss,
  resizeGL,
  uploadTexture,
  type GLContext,
  type Mesh,
  type Program,
} from "@/registry/lib/glsl";
import { cn } from "@/registry/lib/utils";

export type PillowPrintProps = {
  /** An image to print on the pillow instead of the drawn pass. For WebGL it must be same-origin or served with CORS. */
  src?: string;
  /** What the print shows, for assistive technology. @default a description of the drawn pass */
  alt?: string;
  /** How inflated the pillow is, 0 (nearly flat) to 1 (fully puffed). @default 0.6 */
  puff?: number;
  /** How glossy the vinyl is, 0 (satin) to 1 (wet shine). @default 0.6 */
  gloss?: number;
  /** How firm the pillow is, 0 (soft: slow, three wobbles) to 1 (firm: quick, one). @default 0.5 */
  stiffness?: number;
  /** How deep a press pushes in, 0 to 1. @default 0.6 */
  depth?: number;
  /** How wide the dimple is, 0 (a fingertip) to 1 (a palm). @default 0.45 */
  radius?: number;
  /** How much the vinyl wrinkles at its welded seams, 0 to 1. @default 0.5 */
  wrinkle?: number;
  /** How far the pillow leans toward the pointer, 0 to 1. @default 0.4 */
  tilt?: number;
  /** Play the vinyl's blups on press and release. Off unless asked for. @default false */
  sound?: boolean;
  /** Fires as a press pushes in. */
  onPress?: () => void;
  /** Fires as a press lets go. */
  onRelease?: () => void;
  /** Names the pillow for assistive technology. @default "Pillow print" */
  label?: string;
  /** Shows the pillow but takes no presses. @default false */
  disabled?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Sizes the box; the pillow is the largest 1.42:1 card inside. @default "h-52 w-full" */
  className?: string;
};

/* ----------------------------------- art ---------------------------------- */

const ASPECT = 1.42;

const r2 = (v: number) => Math.round(v * 100) / 100;

/** A lido pass in flat shapes: sky, sun, the pool and its lane ropes, set type. */
function passArt(): string {
  const ropes = [330, 380, 434]
    .map((y, i) =>
      Array.from({ length: 30 }, (_, j) => {
        const x = 24 + j * 23 + (i % 2) * 11;
        const fill = j % 2 ? "rgb(250,246,236)" : "rgb(226,88,62)";
        return `<circle cx="${x}" cy="${y}" r="${r2(5 - i * 0.6)}" fill="${fill}"/>`;
      }).join(""),
    )
    .join("");
  const ripples = Array.from({ length: 9 }, (_, i) => {
    const y = 312 + i * 21;
    return `<path d="M24 ${y} q 22 -7 44 0 t 44 0 t 44 0 t 44 0 t 44 0 t 44 0 t 44 0 t 44 0 t 44 0 t 44 0 t 44 0 t 44 0 t 44 0 t 44 0 t 44 0" fill="none" stroke="rgb(170,222,230)" stroke-opacity="${r2(0.5 - i * 0.04)}" stroke-width="2"/>`;
  }).join("");
  return `<rect width="710" height="500" fill="rgb(250,246,236)"/>
<rect x="24" y="24" width="662" height="452" fill="rgb(252,214,168)"/>
<rect x="24" y="24" width="662" height="160" fill="rgb(254,232,198)"/>
<circle cx="520" cy="196" r="96" fill="rgb(238,110,74)"/>
<circle cx="520" cy="196" r="64" fill="rgb(246,150,88)"/>
<rect x="24" y="290" width="662" height="186" fill="rgb(40,132,164)"/>
<rect x="24" y="290" width="662" height="14" fill="rgb(232,240,236)"/>
${ripples}${ropes}
<rect x="84" y="150" width="14" height="142" fill="rgb(30,52,72)"/>
<rect x="60" y="146" width="96" height="10" rx="5" fill="rgb(30,52,72)"/>
<rect x="148" y="218" width="12" height="74" fill="rgb(30,52,72)"/>
<rect x="120" y="214" width="78" height="9" rx="4.5" fill="rgb(30,52,72)"/>
<text x="56" y="92" font-family="ui-sans-serif, system-ui, sans-serif" font-size="58" font-weight="800" letter-spacing="2" fill="rgb(30,52,72)">COLDBROOK</text>
<text x="58" y="126" font-family="ui-monospace, Menlo, monospace" font-size="20" letter-spacing="8" fill="rgb(30,52,72)">LIDO · SUMMER PASS</text>
<text x="660" y="454" text-anchor="end" font-family="ui-monospace, Menlo, monospace" font-size="18" letter-spacing="4" fill="rgb(250,246,236)">NO. 0412</text>`;
}

const DEFAULT_SRC = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="710" height="500" viewBox="0 0 710 500">${passArt()}</svg>`,
)}`;
const DEFAULT_ALT =
  "A Coldbrook Lido summer pass, number 0412: a low orange sun over a blue pool with lane ropes and a diving board, the name set in heavy capitals.";

/* --------------------------------- shaders -------------------------------- */

/** The pillow's height at p ∈ [−1, 1]², shared by both shaders. */
const SURFACE = /* glsl */ `
uniform float u_aspect;
uniform float u_puff;
uniform vec2 u_press;
uniform float u_dk;
uniform float u_rad;
uniform float u_wrinkle;

float dome(vec2 p) {
  float ex = max(1.0 - p.x * p.x, 0.0);
  float ey = max(1.0 - p.y * p.y, 0.0);
  return pow(ex, 0.55) * pow(ey, 0.55);
}

/** Puckers along the welded seam and fans gathered into each corner. */
float wrinkles(vec2 p) {
  float w = 0.0;
  for (int i = 0; i < 4; i += 1) {
    vec2 c = vec2(i == 0 || i == 3 ? -1.0 : 1.0, i < 2 ? -1.0 : 1.0);
    vec2 d = (p - c) * vec2(u_aspect, 1.0);
    float r = length(d);
    float a = atan(d.y, d.x);
    w += sin(a * 16.0) * exp(-r * 4.2) * smoothstep(0.02, 0.12, r);
  }
  w += 0.45 * sin(p.x * u_aspect * 21.0) * exp(-(1.0 - abs(p.y)) * 13.0);
  w += 0.45 * sin(p.y * 21.0) * exp(-(1.0 - abs(p.x)) * 13.0 * u_aspect);
  return w;
}

float height(vec2 p) {
  float d0 = dome(p);
  float h = u_puff * d0;
  h += u_wrinkle * u_puff * 0.03 * wrinkles(p) * pow(d0, 0.25);
  // The press: a soft dimple with a raised rim, never through the floor.
  vec2 d = (p - u_press) * vec2(u_aspect, 1.0);
  float r2 = dot(d, d) / (u_rad * u_rad);
  float dim = exp(-r2);
  float rim = exp(-pow(sqrt(r2) - 1.35, 2.0) * 3.0) * 0.2;
  h -= u_dk * (dim - rim) * (h * 0.88 + 0.01);
  return h;
}
`;

const VERTEX = /* glsl */ `
in vec2 a_position;
in vec2 a_uv;
uniform vec2 u_lean;
uniform vec2 u_view;
uniform float u_cam;
uniform float u_lift;
out vec2 v_uv;
out vec2 v_p;
${SURFACE}

vec3 lean(vec3 w) {
  float cy = cos(u_lean.x);
  float sy = sin(u_lean.x);
  w = vec3(cy * w.x + sy * w.z, w.y, -sy * w.x + cy * w.z);
  float cx = cos(u_lean.y);
  float sx = sin(u_lean.y);
  return vec3(w.x, cx * w.y - sx * w.z, sx * w.y + cx * w.z);
}

void main() {
  vec2 p = a_position;
  float h = height(p);
  // The skin is pulled up, so the outline draws in at the middle of each
  // edge while the corners stay out.
  vec2 q = vec2(
    p.x * (1.0 - 0.07 * u_puff * (1.0 - p.y * p.y)),
    p.y * (1.0 - 0.09 * u_puff * (1.0 - p.x * p.x))
  );
  // A press draws the skin, and the print on it, in toward the dimple.
  vec2 dd = (p - u_press) * vec2(u_aspect, 1.0);
  float pull = exp(-dot(dd, dd) / (u_rad * u_rad * 1.6));
  q += (u_press - p) * pull * u_dk * 0.14;
  vec3 w = lean(vec3(q.x * u_aspect, q.y, h * u_lift));
  float f = u_cam / (u_cam - w.z);
  gl_Position = vec4(w.x * f / u_view.x, w.y * f / u_view.y, 0.0, 1.0);
  v_uv = a_uv;
  v_p = p;
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D u_img;
uniform vec2 u_lean;
uniform float u_gloss;
uniform float u_lift;
in vec2 v_uv;
in vec2 v_p;
out vec4 o_color;
${SURFACE}

vec3 lean(vec3 w) {
  float cy = cos(u_lean.x);
  float sy = sin(u_lean.x);
  w = vec3(cy * w.x + sy * w.z, w.y, -sy * w.x + cy * w.z);
  float cx = cos(u_lean.y);
  float sx = sin(u_lean.y);
  return vec3(w.x, cx * w.y - sx * w.z, sx * w.y + cx * w.z);
}

void main() {
  vec2 p = v_p;
  float e = 0.004;
  float hx = (height(p + vec2(e, 0.0)) - height(p - vec2(e, 0.0))) / (2.0 * e);
  float hy = (height(p + vec2(0.0, e)) - height(p - vec2(0.0, e))) / (2.0 * e);
  vec3 n = normalize(vec3(-hx * u_lift / u_aspect, -hy * u_lift, 1.0));
  n = normalize(lean(n));
  vec3 base = texture(u_img, v_uv).rgb;
  // A soft key from the upper left, and the vinyl's gloss: a softbox seen in
  // the bulge (a window-shaped reflection that slides as the skin curves and
  // leans), a crisp point of light, and a cool rim where the skin turns away.
  vec3 L = normalize(vec3(-0.45 - u_lean.x * 1.4, 0.55 + u_lean.y * 1.4, 0.75));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float diff = 0.62 + 0.45 * max(dot(n, L), 0.0);
  vec3 R = reflect(vec3(0.0, 0.0, -1.0), n);
  float box = smoothstep(0.2, 0.08, abs(R.x + 0.42)) * smoothstep(0.16, 0.06, abs(R.y - 0.46));
  float spec = pow(max(dot(n, H), 0.0), mix(60.0, 220.0, u_gloss));
  float fres = pow(1.0 - max(n.z, 0.0), 3.0) * 0.28;
  vec3 col = base * diff;
  col *= mix(0.76, 1.0, smoothstep(0.5, 0.96, n.z));
  col += vec3(box * 0.42 + spec * 0.5) * (0.15 + 0.85 * u_gloss);
  col += fres * vec3(0.86, 0.92, 1.0);
  // The welded seam: a pressed, slightly darker strip with a fine bright line.
  float edge = min((1.0 - abs(p.x)) * u_aspect, 1.0 - abs(p.y));
  col *= mix(0.8, 1.0, smoothstep(0.004, 0.03, edge));
  col += vec3(0.07) * smoothstep(0.016, 0.022, edge) * smoothstep(0.03, 0.024, edge);
  float a = smoothstep(0.0, max(fwidth(edge) * 1.5, 0.001), edge);
  o_color = vec4(clamp(col, 0.0, 1.0) * a, a);
}
`;

/* -------------------------------- component -------------------------------- */

type Phys = {
  /** Dimple depth and its velocity: 0 at rest, 1 fully in, below 0 popping out. */
  dk: number;
  dv: number;
  /** Lean in radians and their velocities. */
  lx: number;
  ly: number;
  vx: number;
  vy: number;
  /** Lean targets from the pointer. */
  tx: number;
  ty: number;
  /** Where the press is, in pillow coordinates (y up). */
  px: number;
  py: number;
  pressed: boolean;
  frame: number;
  last: number;
  visible: boolean;
};

type Gpu = {
  gl: GLContext;
  program: Program;
  mesh: Mesh;
  tex: WebGLTexture | null;
  lost: boolean;
};

const MAX_LEAN = (6 * Math.PI) / 180;
const KEY_STEP = 0.18;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * An image card printed on an inflated vinyl pillow. The surface bulges out,
 * draws in at the middle of each edge and wrinkles where the skin is welded
 * and gathered into the corners; a soft light and a vinyl gloss sit on it,
 * and the pillow leans toward the pointer so the highlight slides over the
 * bulge. Press and a dimple pushes in under the finger with a raised rim
 * while the rest of the pillow puffs out to keep its air; the dimple follows
 * the finger while held. Let go and it pops back on an underdamped spring set
 * by `stiffness`, overshooting into a little bump and wobbling level, the
 * whole pillow breathing with it.
 *
 * The pillow is a 72×72 mesh displaced in a WebGL2 vertex shader, lit per
 * pixel from the same height function. It is a real button: Space or Enter
 * held presses at a point the arrow keys move, and key up lets go. Under
 * reduced motion there is no lean and no wobble: the dimple still shows and
 * eases straight back. Without WebGL2 the print is shown as a card with CSS
 * shading and a dimple drawn where it is pressed.
 */
export function PillowPrint({
  src,
  alt = DEFAULT_ALT,
  puff = 0.6,
  gloss = 0.6,
  stiffness = 0.5,
  depth = 0.6,
  radius = 0.45,
  wrinkle = 0.5,
  tilt = 0.4,
  sound = false,
  onPress,
  onRelease,
  label = "Pillow print",
  disabled = false,
  dpr = 2,
  className,
}: PillowPrintProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const image = src ?? DEFAULT_SRC;

  const [ring, setRing] = React.useState<{ x: number; y: number } | null>(null);
  const [held, setHeld] = React.useState(false);

  const rootRef = React.useRef<HTMLButtonElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const gpuRef = React.useRef<Gpu | null>(null);
  const img = React.useRef<HTMLImageElement | null>(null);
  const kbd = React.useRef({ x: 0, y: 0 });
  const detachPress = React.useRef<(() => void) | null>(null);
  const phys = React.useRef<Phys>({
    dk: 0,
    dv: 0,
    lx: 0,
    ly: 0,
    vx: 0,
    vy: 0,
    tx: 0,
    ty: 0,
    px: 0,
    py: 0,
    pressed: false,
    frame: 0,
    last: 0,
    visible: false,
  });

  // The CSS card follows the same physics: a dimple and a breath of scale.
  const fbDepth = useMotionValue(0);
  const fbX = useMotionValue(50);
  const fbY = useMotionValue(50);
  const fbScale = useTransform(fbDepth, (d) => r2(1 + 0.015 * d));
  const fbDimple = useTransform(
    [fbX, fbY] as MotionValue<number>[],
    ([x, y]) =>
      `radial-gradient(circle at ${x}% ${y}%, color-mix(in oklab, black 34%, transparent), color-mix(in oklab, black 10%, transparent) 9%, color-mix(in oklab, white 22%, transparent) 13%, transparent 19%)`,
  );
  const fbOpacity = useTransform(fbDepth, (d) => r2(clamp(Math.abs(d), 0, 1)));

  const latest = React.useRef({
    puff,
    gloss,
    stiffness,
    depth,
    radius,
    wrinkle,
    tilt,
    motionSafe,
    dpr,
  });
  React.useEffect(() => {
    latest.current = {
      puff,
      gloss,
      stiffness,
      depth,
      radius,
      wrinkle,
      tilt,
      motionSafe,
      dpr,
    };
  });

  /** The box's pillow in px: centre and half sizes, as the shader fits it. */
  const fit = () => {
    const el = canvasRef.current;
    const r = el?.getBoundingClientRect();
    if (!r || r.width < 1) return null;
    const A = r.width / Math.max(1, r.height);
    const viewH = Math.max(1, ASPECT / A) / 0.84;
    const halfH = (r.height / 2) * (1 / viewH);
    return {
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
      halfW: halfH * ASPECT,
      halfH,
      viewH,
      A,
    };
  };

  const draw = React.useCallback(() => {
    const g = gpuRef.current;
    const canvas = canvasRef.current;
    const p = phys.current;
    const c = latest.current;
    if (!g || g.lost || !canvas || !g.tex || canvas.width < 2) return;
    const { gl } = g;
    const A = canvas.width / Math.max(1, canvas.height);
    const viewH = Math.max(1, ASPECT / A) / 0.84;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const pf = clamp(c.puff, 0, 1);
    const rad = 0.22 + 0.42 * clamp(c.radius, 0, 1);
    // The air kept: what the dimple pushes in puffs the rest out.
    const kept = 1 + 0.16 * p.dk * rad * rad * 4;
    g.program.use();
    g.program.set({
      u_aspect: ASPECT,
      u_puff: (0.06 + 0.5 * pf) * kept,
      u_press: [p.px, p.py],
      u_dk: p.dk * (0.35 + 0.65 * clamp(c.depth, 0, 1)),
      u_rad: rad,
      u_wrinkle: clamp(c.wrinkle, 0, 1),
      u_lean: [p.lx, p.ly],
      u_view: [viewH * A, viewH],
      u_cam: 7,
      u_lift: 1.5,
      u_gloss: clamp(c.gloss, 0, 1),
    });
    g.program.texture("u_img", g.tex, 0);
    g.mesh.draw();
    const root = rootRef.current;
    if (root && !root.hasAttribute("data-live"))
      root.setAttribute("data-live", "");
  }, []);

  const tickRef = React.useRef<(now: number) => void>(() => {});
  React.useEffect(() => {
    tickRef.current = (now: number) => {
      const p = phys.current;
      p.frame = 0;
      if (!p.visible || document.hidden) {
        p.last = 0;
        return;
      }
      const dt = p.last ? Math.min(0.04, (now - p.last) / 1000) : 1 / 60;
      p.last = now;
      const c = latest.current;
      if (!c.motionSafe) {
        // No springs: straight in, straight back over 150ms, no lean.
        p.dk = p.pressed ? 1 : Math.max(0, p.dk - dt / 0.15);
        p.dv = 0;
        p.lx = 0;
        p.ly = 0;
      } else {
        const st = clamp(c.stiffness, 0, 1);
        // Pressing in is quick and composed; letting go is the pillow's own
        // underdamped spring, soft and wobbly or firm and brief.
        const k = p.pressed ? springs.snap.stiffness : lerp(170, 900, st);
        const zeta = p.pressed ? 0.85 : lerp(0.14, 0.4, st);
        const target = p.pressed ? 1 : 0;
        const lk = springs.glide.stiffness;
        const lc = springs.glide.damping;
        for (let i = 0; i < 3; i += 1) {
          const h = dt / 3;
          p.dv += (-k * (p.dk - target) - 2 * zeta * Math.sqrt(k) * p.dv) * h;
          p.dk += p.dv * h;
          p.vx += (-lk * (p.lx - p.tx) - lc * p.vx) * h;
          p.vy += (-lk * (p.ly - p.ty) - lc * p.vy) * h;
          p.lx += p.vx * h;
          p.ly += p.vy * h;
        }
      }
      fbDepth.set(r2(p.dk));
      draw();
      const moving =
        p.pressed ||
        Math.abs(p.dk) > 0.002 ||
        Math.abs(p.dv) > 0.01 ||
        Math.abs(p.lx - p.tx) > 0.0005 ||
        Math.abs(p.ly - p.ty) > 0.0005 ||
        Math.abs(p.vx) + Math.abs(p.vy) > 0.001;
      if (moving) {
        p.frame = window.requestAnimationFrame(tickRef.current);
      } else {
        p.dk = 0;
        p.dv = 0;
        p.last = 0;
        fbDepth.set(0);
        draw();
      }
    };
  });

  const kick = React.useCallback(() => {
    const p = phys.current;
    if (p.frame || !p.visible || document.hidden) return;
    p.frame = window.requestAnimationFrame((t) => tickRef.current(t));
  }, []);

  // GL: built once; the image and the size are fed in as they change.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    let detach = () => {};
    let disposed = false;
    const build = () => {
      const gl = createGL(canvas, { alpha: true, premultipliedAlpha: true });
      if (!gl) return false;
      const program = createProgram(gl, VERTEX, FRAGMENT);
      if (!program) return false;
      const mesh = createGridMesh(gl, program, 72, 72);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gpuRef.current = { gl, program, mesh, tex: null, lost: false };
      if (img.current?.complete && img.current.naturalWidth) {
        try {
          gpuRef.current.tex = uploadTexture(gl, img.current, {}, null);
        } catch {
          return false;
        }
      }
      resizeGL(gl, canvas, { dprCap: clamp(latest.current.dpr, 0.5, 2) });
      draw();
      return true;
    };
    const release = () => {
      const g = gpuRef.current;
      gpuRef.current = null;
      if (!g || g.lost) return;
      g.mesh.dispose();
      g.program.dispose();
      if (g.tex) g.gl.deleteTexture(g.tex);
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
      if (!g || g.lost) return;
      resizeGL(g.gl, canvas, { dprCap: clamp(latest.current.dpr, 0.5, 2) });
      draw();
    });
    sizer.observe(canvas);
    const p = phys.current;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      p.visible = Boolean(entry?.isIntersecting);
      if (p.visible) {
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
      if (p.frame) window.cancelAnimationFrame(p.frame);
      p.frame = 0;
      p.last = 0;
      p.visible = false;
      detach();
      release();
      root.removeAttribute("data-live");
    };
  }, [draw, kick]);

  React.useEffect(() => {
    let alive = true;
    const el = new Image();
    if (!image.startsWith("data:")) el.crossOrigin = "anonymous";
    el.decoding = "async";
    const take = () => {
      if (!alive) return;
      img.current = el;
      const g = gpuRef.current;
      if (!g || g.lost) return;
      try {
        g.tex = uploadTexture(g.gl, el, {}, g.tex);
        draw();
      } catch {
        // A cross-origin image without CORS cannot become a texture.
        rootRef.current?.setAttribute("data-fallback", "");
        rootRef.current?.removeAttribute("data-live");
      }
    };
    el.onload = take;
    el.src = image;
    if (el.complete) take();
    return () => {
      alive = false;
      el.onload = null;
    };
  }, [image, draw]);

  React.useEffect(
    () => () => {
      detachPress.current?.();
    },
    [],
  );

  // Look changes redraw the still pillow.
  React.useEffect(() => {
    draw();
  }, [draw, puff, gloss, wrinkle, radius, depth]);

  /* ------------------------------ interaction ------------------------------ */

  const aimAt = (clientX: number, clientY: number) => {
    const f = fit();
    if (!f) return null;
    const x = clamp((clientX - f.cx) / f.halfW, -1, 1);
    const y = clamp(-(clientY - f.cy) / f.halfH, -1, 1);
    return { x, y };
  };

  const pressAt = (x: number, y: number, pan: number) => {
    const p = phys.current;
    p.px = x;
    p.py = y;
    fbX.set(r2(50 + x * 50));
    fbY.set(r2(50 - y * 50));
    if (p.pressed) return;
    p.pressed = true;
    setHeld(true);
    onPress?.();
    audio.play("blup", { pitch: 0.72, gain: 0.42, pan });
    kick();
  };

  const releasePress = (pan: number) => {
    const p = phys.current;
    if (!p.pressed) return;
    p.pressed = false;
    setHeld(false);
    onRelease?.();
    audio.play("blup", {
      pitch: 1.05 + 0.25 * clamp(stiffness, 0, 1),
      gain: 0.58,
      pan,
    });
    kick();
  };

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = aimAt(event.clientX, event.clientY);
    if (!at) return;
    const pan = panFrom(event.clientX, event.currentTarget);
    pressAt(at.x, at.y, pan);
    const id = event.pointerId;
    // While held, the dimple follows the finger anywhere; the window hears
    // the release even when the pointer has slid off the pillow.
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      const a = aimAt(e.clientX, e.clientY);
      if (!a) return;
      phys.current.px = a.x;
      phys.current.py = a.y;
      fbX.set(r2(50 + a.x * 50));
      fbY.set(r2(50 - a.y * 50));
      kick();
    };
    const detach = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (detachPress.current === detach) detachPress.current = null;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      detach();
      releasePress(panFrom(e.clientX, rootRef.current));
    };
    detachPress.current?.();
    detachPress.current = detach;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || event.pointerType !== "mouse") return;
    const at = aimAt(event.clientX, event.clientY);
    if (!at) return;
    const k = MAX_LEAN * clamp(tilt, 0, 1);
    phys.current.tx = at.x * k;
    phys.current.ty = at.y * k;
    kick();
  };

  const onPointerLeave = () => {
    phys.current.tx = 0;
    phys.current.ty = 0;
    kick();
  };

  const placeRing = (x: number, y: number) =>
    setRing({ x: r2(50 + x * 50), y: r2(50 - y * 50) });

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    };
    const d = dirs[event.key];
    if (d) {
      event.preventDefault();
      const k = kbd.current;
      k.x = clamp(k.x + d[0] * KEY_STEP, -0.85, 0.85);
      k.y = clamp(k.y + d[1] * KEY_STEP, -0.8, 0.8);
      placeRing(k.x, k.y);
      if (phys.current.pressed) {
        phys.current.px = k.x;
        phys.current.py = k.y;
        fbX.set(r2(50 + k.x * 50));
        fbY.set(r2(50 - k.y * 50));
        kick();
      }
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (event.repeat) return;
      placeRing(kbd.current.x, kbd.current.y);
      pressAt(kbd.current.x, kbd.current.y, kbd.current.x * 0.5);
      return;
    }
    if (event.key === "Escape" && phys.current.pressed) {
      event.preventDefault();
      releasePress(kbd.current.x * 0.5);
    }
  };

  const onKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      releasePress(kbd.current.x * 0.5);
    }
  };

  const pf = clamp(puff, 0, 1);

  return (
    <button
      ref={rootRef}
      type="button"
      aria-label={`${label}: ${alt}`}
      aria-describedby={`${uid}-keys`}
      disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onFocus={(event) => {
        if (event.currentTarget.matches(":focus-visible"))
          placeRing(kbd.current.x, kbd.current.y);
      }}
      onBlur={() => {
        setRing(null);
        releasePress(0);
      }}
      onContextMenu={(event) => event.preventDefault()}
      className={cn(
        "group/pillow-print [container-type:size] relative isolate block h-52 w-full touch-none rounded-3 select-none [-webkit-tap-highlight-color:transparent]",
        "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        className,
      )}
    >
      {/* The pillow's soft contact shadow grows with the puff. */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 h-[min(84cqh,59cqw)] w-[min(119cqh,84cqw)] -translate-x-1/2 -translate-y-1/2 rounded-[18%] blur-[14px]"
        style={{
          backgroundColor: `color-mix(in oklab, black ${Math.round(14 + 20 * pf)}%, transparent)`,
          top: `calc(50% + ${Math.round(4 + 8 * pf)}px)`,
        }}
      />
      {/* The CSS card: the server's first frame and the no-WebGL pillow. */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 h-[min(84cqh,59cqw)] w-[min(119cqh,84cqw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[9%] transition-opacity duration-300 group-data-live/pillow-print:opacity-0"
        style={{ scale: fbScale }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full object-cover"
        />
        <span
          className="absolute inset-0"
          style={{
            backgroundImage: [
              `radial-gradient(70% 60% at 34% 28%, color-mix(in oklab, white ${Math.round(16 + 26 * clamp(gloss, 0, 1))}%, transparent), transparent 70%)`,
              `radial-gradient(120% 110% at 50% 50%, transparent 52%, color-mix(in oklab, black ${Math.round(10 + 22 * pf)}%, transparent))`,
            ].join(", "),
          }}
        />
        <motion.span
          className="absolute inset-0"
          style={{ backgroundImage: fbDimple, opacity: fbOpacity }}
        />
        <span className="absolute inset-[2.5%] rounded-[7%] border border-white/25" />
      </motion.span>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-live/pillow-print:opacity-100"
      />
      {ring ? (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90 shadow-[0_0_0_1px_color-mix(in_oklab,black_35%,transparent)] transition-transform duration-150",
            held && "scale-75",
          )}
          style={{
            left: `calc(50% + ${r2((ring.x - 50) / 50)} * min(59.5cqh, 42cqw))`,
            top: `calc(50% + ${r2((ring.y - 50) / 50)} * min(42cqh, 29.5cqw))`,
          }}
        />
      ) : null}
      <span id={`${uid}-keys`} className="sr-only">
        Press and hold to dimple the pillow. With the keyboard, hold Space or
        Enter to press, use the arrow keys to move where you press, and let go
        to release.
      </span>
    </button>
  );
}
