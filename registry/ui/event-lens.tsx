"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

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
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type EventLensTag = "h1" | "h2" | "h3" | "p";
export type EventLensBackdrop = "grid" | "dots" | "plain";

export type EventLensImage = {
  /** A picture behind the words, drawn cover-fit. Same-origin or CORS-enabled. */
  src?: string;
  /** What the picture shows. Without it the picture is decoration. */
  alt?: string;
};

export type EventLensProps = {
  /** The headline the mass bends. Real text: it is what assistive technology reads. @default "Everything bends toward what matters." */
  headline?: string;
  /** A smaller line under the headline, bent too. */
  subline?: string;
  /** The element the headline renders as. @default "h2" */
  as?: EventLensTag;
  /** A picture behind the words. */
  image?: EventLensImage;
  /** What lies behind the words: a fine grid, a dot field or nothing. @default "grid" */
  backdrop?: EventLensBackdrop;
  /** How heavy the mass is: the size of its shadow and how hard it bends, 0.2 to 1. @default 0.6 */
  mass?: number;
  /** How bright the accretion disc and the photon edge burn, 0 to 1. @default 0.6 */
  disk?: number;
  /** How fast it spins: the disc's turn, its lopsided glow and the swirl of the bent light, 0 to 1. @default 0.5 */
  spin?: number;
  /** The disc's colour, any CSS colour. @default a warm pigment from the warn hue */
  diskColor?: string;
  /** Where the mass rests, as fractions of the box. @default { x: 0.72, y: 0.5 } */
  rest?: { x: number; y: number };
  /** Dragging and the keys move it. @default true */
  interactive?: boolean;
  /** Stops the disc turning. @default false */
  paused?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The lens's accessible name. @default "Event lens" */
  label?: string;
  /** Fires when the mass is taken hold of (true) and let go (false). */
  onHoldChange?: (held: boolean) => void;
  /** Fires when the mass has drifted back to rest. */
  onRest?: () => void;
  /** Nothing moves it. @default false */
  disabled?: boolean;
  /** Sizes the box. @default "h-56 w-full" */
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const pct3 = (v: number) => `${Number((v * 100).toFixed(3))}%`;

const FRAGMENT = /* glsl */ `
uniform sampler2D u_scene;
uniform vec2 u_res;
uniform vec2 u_hole;
uniform float u_rs;
uniform float u_einstein;
uniform float u_spin;
uniform float u_time;
uniform float u_disk;
uniform vec3 u_diskColor;
uniform vec3 u_hot;
uniform vec3 u_ink;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

vec3 scene(vec2 px) {
  return texture(u_scene, clamp(px / u_res, vec2(0.0005), vec2(0.9995))).rgb;
}

void main() {
  vec2 p = v_uv * u_res;
  vec2 d = p - u_hole;
  float r = max(length(d), 0.001);
  float rs = u_rs;

  // The thin lens: a source at β = r − θE²/r appears at r. Inside the
  // Einstein radius β turns negative and the picture comes back flipped;
  // at it, whatever is right behind becomes a ring. Spin drags the frame,
  // so the bent light swirls the closer it passes.
  float beta = r - u_einstein * u_einstein / r;
  float ang = atan(d.y, d.x) + u_spin * 1.4 * (rs * rs) / (r * r);
  vec3 col = scene(u_hole + vec2(cos(ang), sin(ang)) * beta);

  // The shadow and its crisp photon edge.
  float shadow = 1.0 - smoothstep(rs * 0.985, rs * 1.02, r);
  float edgeW = 0.9 + rs * 0.02;
  float pr = (r - rs * 1.045) / edgeW;
  float photon = exp(-pr * pr);

  // The disc, tilted toward the viewer: an annulus seen as a flat ellipse,
  // its smoke sheared by Keplerian rotation (the inner rings run faster).
  float c = cos(-0.16);
  float s = sin(-0.16);
  vec2 q = vec2(c * d.x - s * d.y, s * d.x + c * d.y);
  vec2 e = vec2(q.x, q.y / 0.27);
  float rd = length(e);
  float rIn = rs * 1.6;
  float rOut = rs * 3.5;
  float theta = atan(e.y, e.x);
  float omega = u_time * (0.5 + 1.6 * u_spin) * pow(rIn / max(rd, rIn * 0.5), 1.5);
  float tw = theta - omega;
  vec2 ring = vec2(cos(tw), sin(tw));
  float n = kx_fbm(ring * (1.4 + rd / rs * 0.55) + vec2(rd / rs * 1.9, 3.7));
  float band = smoothstep(rIn * 0.9, rIn * 1.18, rd) * (1.0 - smoothstep(rOut * 0.55, rOut, rd));
  float heat = 1.0 - smoothstep(rIn, rIn * 1.9, rd);
  // The side coming toward us is brighter.
  float doppler = 1.0 + u_spin * 0.85 * cos(theta + 0.4);
  float smoke = band * (0.28 + 0.72 * n) * u_disk;
  // The near half is in front of the shadow; the far half hides behind it.
  float front = step(0.0, q.y);
  float seen = mix(1.0 - shadow, 1.0, front);
  smoke *= seen;

  // The far side of the disc, bent up and over the shadow as a faint arc.
  float hr = (r - rs * 1.32) / (rs * 0.16);
  float halo = exp(-hr * hr);
  float over = smoothstep(-0.2, 0.9, -d.y / r);
  float back = halo * (0.35 + 0.65 * over) * (0.4 + 0.6 * kx_fbm(vec2(cos(atan(d.y, d.x) - omega * 1.4), sin(atan(d.y, d.x) - omega * 1.4)) * 2.2)) * u_disk;

  col = mix(col, u_ink, shadow);
  col = mix(col, u_ink, clamp(smoke * 0.5, 0.0, 0.6));
  vec3 glow = mix(u_diskColor, u_hot, heat * 0.75);
  col = mix(col, glow, clamp(smoke * (0.45 + 0.85 * heat) * doppler, 0.0, 0.95));
  col = mix(col, mix(u_diskColor, u_hot, 0.5), clamp(back * 0.85, 0.0, 0.9) * (1.0 - shadow));
  col = mix(col, u_hot, clamp(photon * (0.55 + 0.6 * u_disk), 0.0, 1.0));
  o_color = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

type Vec3 = [number, number, number];

type Colours = {
  background: string;
  line: string;
  minor: string;
  major: string;
  head: string;
  sub: string;
  disk: Vec3;
  hot: Vec3;
  ink: Vec3;
};

type Config = {
  mass: number;
  disk: number;
  spin: number;
  rest: { x: number; y: number };
  dpr: number;
  backdrop: EventLensBackdrop;
  src: string | undefined;
  motionSafe: boolean;
  paused: boolean;
};

type Report = {
  onHoldChange?: (held: boolean) => void;
  onRest?: () => void;
  live: (on: boolean) => void;
  fallback: (on: boolean) => void;
  place: (x: number, y: number, rs: number) => void;
};

type Engine = {
  configure: (cfg: Config) => void;
  colours: (c: Colours) => void;
  repaint: () => void;
  resize: () => void;
  setVisible: (on: boolean) => void;
  grab: () => void;
  dragBy: (dx: number, dy: number) => void;
  release: (vx: number, vy: number) => void;
  visit: (x: number, y: number) => void;
  nudge: (dx: number, dy: number) => void;
  home: () => void;
  dispose: () => void;
};

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  texture: WebGLTexture | null;
  lost: boolean;
};

/** Any CSS colour as 0–1 rgb, through a 1×1 canvas. */
function colourReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): Vec3 => {
    if (!ctx) return [0.5, 0.5, 0.5];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(128, 128, 128)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [(d[0] ?? 0) / 255, (d[1] ?? 0) / 255, (d[2] ?? 0) / 255];
  };
}

/**
 * Paints each word of an element into the scene where the browser laid it
 * out: a Range per word gives its line box, and the word is drawn on that
 * line's baseline in the element's own computed font, so the lensed picture is
 * the headline the page set, wrapping and all.
 */
function paintWords(
  ctx: CanvasRenderingContext2D,
  el: HTMLElement,
  origin: DOMRect,
  colour: string,
) {
  const cs = getComputedStyle(el);
  const font =
    cs.font ||
    `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  ctx.font = font;
  ctx.fillStyle = colour;
  ctx.textBaseline = "alphabetic";
  const spaced = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ("letterSpacing" in spaced) {
    spaced.letterSpacing =
      cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
  }
  const range = document.createRange();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? "";
    const words = /\S+/g;
    for (let m = words.exec(text); m; m = words.exec(text)) {
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const rect = range.getClientRects()[0];
      if (!rect) continue;
      const metrics = ctx.measureText(m[0]);
      const ascent = metrics.fontBoundingBoxAscent || rect.height * 0.8;
      const descent = metrics.fontBoundingBoxDescent || rect.height * 0.2;
      const baseline =
        rect.top - origin.top + (rect.height - (ascent + descent)) / 2 + ascent;
      ctx.fillText(m[0], rect.left - origin.left, baseline);
    }
  }
  range.detach();
}

function createLens(
  root: HTMLDivElement,
  glCanvas: HTMLCanvasElement,
  words: () => { head: HTMLElement | null; sub: HTMLElement | null },
  report: { current: Report },
): Engine {
  let cfg: Config | null = null;
  let colours: Colours | null = null;
  let gpu: Gpu | null = null;
  let width = 0;
  let height = 0;
  let visible = false;
  let disposed = false;
  let frame = 0;
  let last = 0;
  let painted = false;
  let fallback = false;
  let sceneDirty = true;
  let time = 0;
  let flare = 0;
  let held = false;
  let imageEl: HTMLImageElement | null = null;
  let imageReady = false;
  const hole = { x: 0, y: 0, placed: false };
  const runs: { stop: () => void }[] = [];
  let flareRun: { stop: () => void } | null = null;
  let homeTimer = 0;
  let aim = { x: 0, y: 0 };
  const art = document.createElement("canvas");

  const setFallback = (on: boolean) => {
    if (on === fallback) return;
    fallback = on;
    report.current.fallback(on);
  };

  const buildGpu = (): boolean => {
    const gl = createGL(glCanvas, { alpha: false });
    if (!gl) return false;
    const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
    if (!program) return false;
    gpu = {
      gl,
      program,
      tri: createFullscreenTriangle(gl, program),
      texture: null,
      lost: false,
    };
    sceneDirty = true;
    return true;
  };
  if (!buildGpu()) setFallback(true);

  const detachLoss = onContextLoss(
    glCanvas,
    () => {
      if (gpu) gpu.lost = true;
      setFallback(true);
    },
    () => {
      gpu = null;
      if (buildGpu()) setFallback(false);
      request();
    },
  );

  const shadowRadius = () =>
    (0.045 + 0.08 * clamp(cfg?.mass ?? 0.6, 0.2, 1)) * Math.min(width, height);

  const restPoint = () => ({
    x: clamp(cfg?.rest.x ?? 0.72, 0, 1) * width,
    y: clamp(cfg?.rest.y ?? 0.5, 0, 1) * height,
  });

  const stopRuns = () => {
    for (const run of runs.splice(0)) run.stop();
    window.clearTimeout(homeTimer);
  };

  const animating = () => runs.length > 0 || flareRun !== null || held;

  const paintScene = (g: Gpu) => {
    if (!colours || !cfg || width < 2 || height < 2) return;
    const ratio = Math.min(
      window.devicePixelRatio || 1,
      clamp(cfg.dpr, 0.5, 2),
    );
    const bw = Math.max(1, Math.round(width * ratio));
    const bh = Math.max(1, Math.round(height * ratio));
    if (art.width !== bw || art.height !== bh) {
      art.width = bw;
      art.height = bh;
    }
    const ctx = art.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = colours.background;
    ctx.fillRect(0, 0, width, height);
    if (cfg.src && imageEl && imageReady) {
      const iw = imageEl.naturalWidth || 1;
      const ih = imageEl.naturalHeight || 1;
      const s = Math.max(width / iw, height / ih);
      ctx.drawImage(
        imageEl,
        (width - iw * s) / 2,
        (height - ih * s) / 2,
        iw * s,
        ih * s,
      );
    } else if (cfg.backdrop === "grid") {
      // The house grid: 24 px minor lines and 96 px major ones over them.
      for (const [step, colour] of [
        [24, colours.minor],
        [96, colours.major],
      ] as const) {
        ctx.fillStyle = colour;
        for (let x = 0; x <= width; x += step) ctx.fillRect(x, 0, 1, height);
        for (let y = 0; y <= height; y += step) ctx.fillRect(0, y, width, 1);
      }
    } else if (cfg.backdrop === "dots") {
      ctx.fillStyle = colours.line;
      for (let y = 12; y < height; y += 16) {
        for (let x = 12; x < width; x += 16) {
          ctx.beginPath();
          ctx.arc(x, y, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    const origin = root.getBoundingClientRect();
    const { head, sub } = words();
    if (head) paintWords(ctx, head, origin, colours.head);
    if (sub) paintWords(ctx, sub, origin, colours.sub);
    try {
      g.texture = uploadTexture(g.gl, art, { linear: true }, g.texture);
      sceneDirty = false;
    } catch {
      // A cross-origin picture without CORS taints the scene: show the
      // plain page and the drawn mass instead.
      setFallback(true);
    }
  };

  const draw = (now: number) => {
    frame = 0;
    if (disposed || !visible || !cfg || !colours || width < 2) return;
    const dt = Math.min(1 / 30, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    const turning = cfg.motionSafe && !cfg.paused && cfg.spin > 0;
    if (turning) time += dt;
    const rs = shadowRadius();
    const g = gpu;
    if (g && !g.lost && !g.gl.isContextLost() && !fallback) {
      if (sceneDirty || !g.texture) paintScene(g);
      if (g.texture) {
        const { gl } = g;
        resizeGL(gl, glCanvas, { dprCap: clamp(cfg.dpr, 0.5, 2) });
        g.program.use();
        g.program.texture("u_scene", g.texture, 0);
        g.program.set({
          u_res: [width, height],
          u_hole: [hole.x, hole.y],
          u_rs: rs,
          u_einstein: rs * 2.05,
          u_spin: clamp(cfg.spin, 0, 1),
          u_time: time,
          u_disk: clamp(cfg.disk, 0, 1) * (1 + flare),
          u_diskColor: colours.disk,
          u_hot: colours.hot,
          u_ink: colours.ink,
        });
        g.tri.draw();
        if (!painted) {
          painted = true;
          report.current.live(true);
        }
      }
    }
    report.current.place(hole.x, hole.y, rs);
    if (turning || animating()) frame = requestAnimationFrame(draw);
    else last = 0;
  };

  const request = () => {
    if (frame || disposed || !visible) return;
    frame = requestAnimationFrame(draw);
  };

  const setFlare = (to: number, hold: boolean) => {
    flareRun?.stop();
    if (!cfg?.motionSafe) {
      flare = 0;
      flareRun = null;
      return;
    }
    flareRun = animate(flare, to, {
      ...(hold ? springs.flick : springs.drift),
      onUpdate: (v) => {
        flare = v;
      },
      onComplete: () => {
        flareRun = null;
      },
    });
  };

  const glideTo = (
    x: number,
    y: number,
    spring: typeof springs.glide | typeof springs.drift,
    vx = 0,
    vy = 0,
    then?: () => void,
  ) => {
    let pending = 2;
    const done = () => {
      pending -= 1;
      if (pending === 0) then?.();
    };
    runs.push(
      animate(hole.x, x, {
        ...spring,
        velocity: vx,
        onUpdate: (v) => {
          hole.x = v;
          request();
        },
        onComplete: done,
      }),
      animate(hole.y, y, {
        ...spring,
        velocity: vy,
        onUpdate: (v) => {
          hole.y = v;
          request();
        },
        onComplete: done,
      }),
    );
    request();
  };

  const goHome = (vx = 0, vy = 0) => {
    stopRuns();
    const home = restPoint();
    if (!cfg?.motionSafe) {
      hole.x = home.x;
      hole.y = home.y;
      report.current.onRest?.();
      request();
      return;
    }
    // Let go, it drifts back on the drift spring, carrying the throw.
    glideTo(home.x, home.y, springs.drift, vx, vy, () => {
      runs.length = 0;
      report.current.onRest?.();
      request();
    });
  };

  return {
    configure: (next) => {
      const prev = cfg;
      cfg = next;
      if (
        !prev ||
        prev.backdrop !== next.backdrop ||
        prev.src !== next.src ||
        prev.dpr !== next.dpr
      ) {
        sceneDirty = true;
      }
      if (next.src && next.src !== prev?.src) {
        imageReady = false;
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          if (imageEl !== img) return;
          imageReady = true;
          sceneDirty = true;
          request();
        };
        img.onerror = () => {
          if (imageEl === img) setFallback(true);
        };
        img.src = next.src;
        imageEl = img;
      }
      if (
        prev &&
        (prev.rest.x !== next.rest.x || prev.rest.y !== next.rest.y) &&
        !held
      ) {
        goHome();
      }
      request();
    },
    colours: (next) => {
      colours = next;
      sceneDirty = true;
      request();
    },
    repaint: () => {
      sceneDirty = true;
      request();
    },
    resize: () => {
      const w = Math.max(1, root.clientWidth);
      const h = Math.max(1, root.clientHeight);
      if (w === width && h === height) return;
      const fx = width ? hole.x / width : -1;
      const fy = height ? hole.y / height : -1;
      width = w;
      height = h;
      sceneDirty = true;
      if (!hole.placed || fx < 0) {
        const home = restPoint();
        hole.x = home.x;
        hole.y = home.y;
        hole.placed = true;
      } else {
        hole.x = fx * w;
        hole.y = fy * h;
      }
      request();
    },
    setVisible: (on) => {
      visible = on;
      if (on) request();
    },
    grab: () => {
      stopRuns();
      held = true;
      setFlare(0.6, true);
      report.current.onHoldChange?.(true);
      request();
    },
    dragBy: (dx, dy) => {
      hole.x = clamp(hole.x + dx, 0, width);
      hole.y = clamp(hole.y + dy, 0, height);
      request();
    },
    release: (vx, vy) => {
      held = false;
      setFlare(0, false);
      report.current.onHoldChange?.(false);
      goHome(vx, vy);
    },
    visit: (x, y) => {
      if (!cfg?.motionSafe) return;
      stopRuns();
      setFlare(0.35, true);
      glideTo(x, y, springs.glide, 0, 0, () => {
        runs.length = 0;
        // A moment over the spot, then home.
        homeTimer = window.setTimeout(() => {
          setFlare(0, false);
          goHome();
        }, 420);
      });
    },
    nudge: (dx, dy) => {
      // Quick presses add up: each one moves the target, not the mass.
      const from = runs.length > 0 ? aim : { x: hole.x, y: hole.y };
      stopRuns();
      const tx = clamp(from.x + dx, 0, width);
      const ty = clamp(from.y + dy, 0, height);
      aim = { x: tx, y: ty };
      if (!cfg?.motionSafe) {
        hole.x = tx;
        hole.y = ty;
        request();
        return;
      }
      glideTo(tx, ty, springs.glide, 0, 0, () => {
        runs.length = 0;
      });
    },
    home: () => {
      setFlare(0, false);
      goHome();
    },
    dispose: () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      stopRuns();
      flareRun?.stop();
      flareRun = null;
      detachLoss();
      if (imageEl) {
        imageEl.onload = null;
        imageEl.onerror = null;
      }
      const g = gpu;
      gpu = null;
      if (g && !g.lost && !g.gl.isContextLost()) {
        if (g.texture) g.gl.deleteTexture(g.texture);
        g.tri.dispose();
        g.program.dispose();
      }
    },
  };
}

/**
 * A black hole sitting on a headline. The words are real text, laid out by
 * the browser; once WebGL2 is up each word is painted into a texture where it
 * was set, and one pass lenses that picture through the point-lens equation —
 * content behind the mass bends into arcs, a flipped image appears inside the
 * Einstein radius and whatever is right behind becomes a ring round the
 * shadow, all swirled by `spin` — wrapped by a thin smoky disc with a bright
 * photon edge. Drag it (it flares on `springs.flick` while held) and release:
 * it drifts back to rest on `springs.drift` carrying the throw. Arrow keys move
 * it on `springs.glide`; Escape, Enter or Home send it home. Under reduced
 * motion the disc is still and the mass returns at once.
 */
export function EventLens({
  headline = "Everything bends toward what matters.",
  subline,
  as: Tag = "h2",
  image,
  backdrop = "grid",
  mass = 0.6,
  disk = 0.6,
  spin = 0.5,
  diskColor = "oklch(from var(--warn) 0.8 0.15 calc(h - 22))",
  rest = { x: 0.72, y: 0.5 },
  interactive = true,
  paused = false,
  dpr = 2,
  label = "Event lens",
  onHoldChange,
  onRest,
  disabled = false,
  className,
}: EventLensProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const glRef = React.useRef<HTMLCanvasElement | null>(null);
  const headRef = React.useRef<HTMLElement | null>(null);
  const subRef = React.useRef<HTMLParagraphElement | null>(null);
  const carriers = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const pageShown = React.useRef(true);
  const [live, setLive] = React.useState(false);
  const [fallback, setFallback] = React.useState(false);

  const active = interactive && !disabled;
  const restX = clamp(rest.x, 0, 1);
  const restY = clamp(rest.y, 0, 1);
  const hx = useMotionValue(0);
  const hy = useMotionValue(0);
  const hs = useMotionValue(20);
  const stillScale = useTransform(hs, (v) => r2(v / 30));
  const grip = useTransform(hs, (v) => r2(v * 2 + 14));

  const cfg: Config = {
    mass,
    disk,
    spin,
    rest: { x: restX, y: restY },
    dpr,
    backdrop,
    src: image?.src,
    motionSafe,
    paused,
  };
  const cfgRef = React.useRef(cfg);
  const report = React.useRef<Report>({
    live: () => {},
    fallback: () => {},
    place: () => {},
  });
  React.useLayoutEffect(() => {
    cfgRef.current = cfg;
    report.current = {
      onHoldChange,
      onRest,
      live: (on) => setLive(on),
      fallback: (on) => setFallback(on),
      place: (x, y, rs) => {
        const root = rootRef.current;
        if (!root) return;
        hx.set(r2(x - restX * root.clientWidth));
        hy.set(r2(y - restY * root.clientHeight));
        hs.set(r2(rs));
      },
    };
  });

  const readColours = React.useCallback(() => {
    const host = carriers.current;
    if (!host) return;
    const read = colourReader();
    const kids = Array.from(host.children);
    const at = (i: number) => {
      const el = kids[i];
      return el ? getComputedStyle(el).color : "rgb(128, 128, 128)";
    };
    engine.current?.colours({
      background: at(0),
      line: at(1),
      head: at(2),
      sub: at(3),
      disk: read(at(4)),
      hot: read(at(5)),
      ink: read(at(6)),
      minor: at(7),
      major: at(8),
    });
  }, []);

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = glRef.current;
    if (!root || !canvas) return;
    const e = createLens(
      root,
      canvas,
      () => ({ head: headRef.current, sub: subRef.current }),
      report,
    );
    engine.current = e;
    e.configure(cfgRef.current);
    readColours();
    e.resize();
    e.setVisible(visible.current && pageShown.current);
    // The words are painted in the page's own font: once it has loaded.
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) e.repaint();
    });
    return () => {
      cancelled = true;
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, [readColours]);

  const cfgKey = JSON.stringify(cfg);
  React.useEffect(() => {
    engine.current?.configure(cfgRef.current);
  }, [cfgKey]);

  React.useEffect(() => {
    engine.current?.repaint();
  }, [headline, subline]);

  const colourKey = diskColor;
  React.useEffect(() => {
    readColours();
  }, [colourKey, readColours]);

  React.useEffect(() => {
    const onVisibility = () => {
      pageShown.current = document.visibilityState !== "hidden";
      engine.current?.setVisible(visible.current && pageShown.current);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      engine.current?.resize();
      engine.current?.repaint();
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      engine.current?.setVisible(visible.current && pageShown.current);
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  const drag = useDrag({
    threshold: 3,
    disabled: !active,
    onStart: () => engine.current?.grab(),
    onMove: ({ delta }) => engine.current?.dragBy(delta.x, delta.y),
    onEnd: ({ velocity }) => engine.current?.release(velocity.x, velocity.y),
    onCancel: () => engine.current?.release(0, 0),
    onTap: (event) => {
      const root = rootRef.current;
      if (!root) return;
      const r = root.getBoundingClientRect();
      engine.current?.visit(event.clientX - r.left, event.clientY - r.top);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!active) return;
    if (
      event.key === "Escape" ||
      event.key === "Home" ||
      event.key === "Enter"
    ) {
      // The stage closes on an Escape left unhandled; this one is ours.
      event.preventDefault();
      engine.current?.home();
      return;
    }
    const by = event.shiftKey ? 48 : 16;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-by, 0],
      ArrowRight: [by, 0],
      ArrowUp: [0, -by],
      ArrowDown: [0, by],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    engine.current?.nudge(move[0], move[1]);
  };

  const showStill = !live || fallback;

  return (
    <div
      ref={bindRoot}
      data-live={live && !fallback ? "" : undefined}
      {...drag}
      className={cn(
        "group/event-lens @container relative isolate h-56 w-full overflow-clip bg-background",
        active
          ? "cursor-grab touch-none select-none active:cursor-grabbing"
          : "",
        className,
      )}
    >
      {/* The page as the server sends it: backdrop, picture, words. */}
      {image?.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image.src}
          alt={image.alt ?? ""}
          className="absolute inset-0 size-full object-cover"
        />
      ) : backdrop === "plain" ? null : (
        <div
          aria-hidden
          className={cn(
            "absolute inset-0",
            backdrop === "grid" ? "bg-grid" : "",
          )}
          style={
            backdrop === "dots"
              ? {
                  backgroundImage:
                    "radial-gradient(circle, var(--hairline-strong) 1px, transparent 1.5px)",
                  backgroundSize: "16px 16px",
                  backgroundPosition: "4px 4px",
                }
              : undefined
          }
        />
      )}
      <canvas
        ref={glRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-200 group-data-live/event-lens:opacity-100"
      />
      <div className="pointer-events-none relative z-10 flex size-full max-w-[82%] flex-col justify-center gap-2 px-5 @[30rem]:max-w-[64%] @[30rem]:px-8 @[48rem]:max-w-[60%]">
        <Tag
          ref={headRef as React.Ref<HTMLHeadingElement & HTMLParagraphElement>}
          className="text-xl leading-[1.08] font-semibold tracking-tight text-balance text-foreground group-data-live/event-lens:text-transparent @[24rem]:text-2xl @[30rem]:text-4xl @[48rem]:text-5xl"
        >
          {headline}
        </Tag>
        {subline ? (
          <p
            ref={subRef}
            className="hidden text-sm text-ink-2 group-data-live/event-lens:text-transparent @[24rem]:block @[30rem]:text-base"
          >
            {subline}
          </p>
        ) : null}
      </div>
      {/* The mass when the lensing is not drawn: a shadow, its photon
          edge and the tilted disc, moving with the hand all the same. */}
      <motion.div
        aria-hidden
        className={cn(
          "pointer-events-none absolute z-20",
          showStill ? "" : "hidden",
        )}
        style={{ left: pct3(restX), top: pct3(restY), x: hx, y: hy }}
      >
        <motion.svg
          viewBox="-100 -100 200 200"
          className="absolute -translate-x-1/2 -translate-y-1/2 overflow-visible"
          style={{ width: 200, height: 200, scale: stillScale }}
        >
          <defs>
            <radialGradient id={`${uid}-disc`} cx="50%" cy="50%" r="50%">
              <stop offset="40%" stopColor="black" stopOpacity={0} />
              <stop
                offset="50%"
                style={{ stopColor: diskColor }}
                stopOpacity={0.95}
              />
              <stop
                offset="100%"
                style={{ stopColor: diskColor }}
                stopOpacity={0}
              />
            </radialGradient>
          </defs>
          <ellipse
            cx={0}
            cy={0}
            rx={96}
            ry={26}
            fill={`url(#${uid}-disc)`}
            transform="rotate(-9)"
            opacity={0.85}
          />
          <circle
            r={36}
            fill="none"
            strokeWidth={5}
            style={{ stroke: diskColor }}
            opacity={0.5}
          />
          <circle r={30} style={{ fill: "oklch(0.08 0.01 258)" }} />
          <circle
            r={31.5}
            fill="none"
            strokeWidth={1.6}
            stroke="white"
            opacity={0.85}
          />
          <path
            d="M -90 4 A 92 24 -9 0 0 90 -4"
            fill="none"
            strokeWidth={7}
            style={{ stroke: diskColor }}
            opacity={0.55}
            transform="rotate(-9)"
          />
        </motion.svg>
      </motion.div>
      <motion.button
        type="button"
        aria-label={label}
        aria-describedby={active ? hintId : undefined}
        disabled={!active}
        onKeyDown={onKeyDown}
        onBlur={() => engine.current?.home()}
        className={cn(
          "absolute z-30 -translate-x-1/2 -translate-y-1/2 cursor-[inherit] rounded-full outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
        style={{
          left: pct3(restX),
          top: pct3(restY),
          x: hx,
          y: hy,
          width: grip,
          height: grip,
        }}
      />
      <span
        ref={carriers}
        aria-hidden
        onTransitionEnd={readColours}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        <span className="text-background transition-colors duration-1" />
        <span className="text-hairline-strong transition-colors duration-1" />
        <span className="text-foreground transition-colors duration-1" />
        <span className="text-ink-2 transition-colors duration-1" />
        <span
          className="transition-colors duration-1"
          style={{ color: diskColor }}
        />
        <span
          className="transition-colors duration-1"
          style={{ color: "oklch(from var(--warn) 0.97 0.04 h)" }}
        />
        <span
          className="transition-colors duration-1"
          style={{ color: "oklch(0.07 0.01 258)" }}
        />
        <span
          className="transition-colors duration-1"
          style={{ color: "var(--grid-minor)" }}
        />
        <span
          className="transition-colors duration-1"
          style={{ color: "var(--grid-major)" }}
        />
      </span>
      {active ? (
        <p id={hintId} className="sr-only">
          Arrow keys move the mass, Shift further; Escape, Enter or Home lets it
          drift back.
        </p>
      ) : null}
    </div>
  );
}
