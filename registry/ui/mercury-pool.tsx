"use client";

import * as React from "react";

import {
  FULLSCREEN_VERTEX,
  GLSL_LUMA,
  bindScreen,
  createFullscreenTriangle,
  createGL,
  createPingPong,
  createProgram,
  onContextLoss,
  resizeGL,
  uploadTexture,
  type Framebuffer,
  type FullscreenTriangle,
  type GLContext,
  type PingPong,
  type Program,
} from "@/registry/lib/glsl";
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type MercuryPoolProps = {
  /** How far the base tone leans toward the mirrored environment rather than the page's own grey (0..1). @default 0.85 */
  metal?: number;
  /** Strength of the reflected ground/sky environment (0..1). @default 0.8 */
  reflection?: number;
  /** Multiplier on pond-glass's own stable simulation speed; values above 1 are clamped to 1, so the sim never runs faster than that proven-stable baseline. @default 1 */
  ripple?: number;
  /** Wave energy retained per simulation step (0..1). @default 0.985 */
  damping?: number;
  /** How far the page's dark ink is inlaid into the metal (0..1). @default 0.7 */
  ink?: number;
  /** Fill colour where the painted texture is transparent; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

// Height field is stored biased in byte mode (fallback framebuffers), raw in
// half-float mode. RANGE bounds both — a safety clamp against the sim
// blowing up, and the span the byte encoding has to work with.
const RANGE = 6.0;

// A drop trails the pointer every TRAVEL_PX of CSS-px travel, radius and
// strength fixed — the surface is stirred by hover, never by a click. Kept
// gentle so a sweep leaves a soft wake instead of a chain of collisions.
const TRAVEL_PX = 18;
const DROP_RADIUS = 6;
const DROP_STRENGTH = 0.18;
// The simulation loop keeps stepping this long after the last drop before
// it stops itself; a new drop restarts it.
const SETTLE_S = 4;
const SIM_RESOLUTION = 0.5;

const SIM_FRAGMENT = /* glsl */ `
uniform sampler2D u_state;
uniform vec2 u_texel;
uniform vec2 u_res;
uniform float u_damping;
uniform float u_speed;
uniform vec4 u_drops[4];
uniform bool u_byteMode;
in vec2 v_uv;
out vec4 o_color;

const float RANGE = ${RANGE.toFixed(1)};

float decodeH(float raw) {
  return u_byteMode ? (raw * 2.0 - 1.0) * RANGE : raw;
}

float encodeH(float h) {
  float clamped = clamp(h, -RANGE, RANGE);
  return u_byteMode ? (clamped / RANGE * 0.5 + 0.5) : clamped;
}

float sampleH(vec2 uv) {
  return decodeH(texture(u_state, uv).r);
}

void main() {
  vec4 state = texture(u_state, v_uv);
  float h = decodeH(state.r);
  float hPrev = decodeH(state.g);

  float hL = sampleH(v_uv - vec2(u_texel.x, 0.0));
  float hR = sampleH(v_uv + vec2(u_texel.x, 0.0));
  float hU = sampleH(v_uv - vec2(0.0, u_texel.y));
  float hD = sampleH(v_uv + vec2(0.0, u_texel.y));
  float lap = hL + hR + hU + hD - 4.0 * h;

  // Classic explicit wave step from the last two states; new.g becomes
  // old.r so one ping-pong pair carries both h(t) and h(t-1).
  float hNew = (2.0 * h - hPrev) * u_damping + u_speed * lap;

  vec2 px = v_uv * u_res;
  for (int i = 0; i < 4; i++) {
    vec4 drop = u_drops[i];
    if (drop.w == 0.0) continue;
    float r = max(drop.z, 0.5);
    vec2 dropPx = drop.xy * u_res;
    float dist = length(px - dropPx);
    float g = exp(-(dist * dist) / (2.0 * r * r));
    hNew += g * drop.w;
  }

  o_color = vec4(encodeH(hNew), encodeH(h), 0.0, 1.0);
}
`;

const RENDER_FRAGMENT =
  GLSL_LUMA +
  /* glsl */ `
uniform sampler2D u_height;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform vec2 u_res;
uniform float u_metal;
uniform float u_reflection;
uniform float u_ink;
uniform vec4 u_bg;
uniform bool u_byteMode;
in vec2 v_uv;
out vec4 o_color;

const float RANGE = ${RANGE.toFixed(1)};

float decodeH(float raw) {
  return u_byteMode ? (raw * 2.0 - 1.0) * RANGE : raw;
}

float sampleH(vec2 uv) {
  return decodeH(texture(u_height, uv).r);
}

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  float hL = sampleH(v_uv - vec2(u_texel.x, 0.0));
  float hR = sampleH(v_uv + vec2(u_texel.x, 0.0));
  float hU = sampleH(v_uv - vec2(0.0, u_texel.y));
  float hD = sampleH(v_uv + vec2(0.0, u_texel.y));
  // Central differences over one sim texel, scaled from UV space into CSS
  // px so the slope is a real per-pixel gradient rather than a raw
  // per-texel step — the latter reads as dithering once the field is
  // byte-quantized. Clamping keeps a single noisy texel from swinging the
  // normal (and everything shaded from it) between extremes.
  vec2 texelPx = max(u_texel * u_res, vec2(0.0001));
  vec2 grad = vec2(hR - hL, hD - hU) / (2.0 * texelPx);
  vec3 normal = normalize(vec3(-grad, 1.0));
  normal.xy = clamp(normal.xy, -0.35, 0.35);

  // Environment: a dark ground below the waterline and a bright sky above
  // it, read off the normal's tilt. A soft smoothstep band stands in for
  // a horizon line, so the two blend into each other rather than snapping.
  vec3 ground = vec3(0.2275, 0.2471, 0.2784);
  vec3 sky = vec3(0.8745, 0.9020, 0.9333);
  float tilt = normal.y * 0.5 + 0.5;
  float band = smoothstep(0.35, 0.65, tilt);
  vec3 reflection = mix(ground, sky, band) * u_reflection;

  // The page's own tone stands in for the metal's resting grey; the mirror
  // takes over as u_metal rises.
  vec3 grey = vec3(kx_luma(sampleOver(v_uv)));
  vec3 metal = mix(grey, reflection, u_metal);

  // The page's dark ink is inlaid into the surface: read displaced a
  // couple of px by the same (clamped) normal the environment used, then
  // multiplied straight in — no threshold — so it darkens smoothly as the
  // surface ripples instead of sitting flat on it.
  vec2 inkUv = v_uv + normal.xy * 2.0 / u_res;
  float pageInk = 1.0 - kx_luma(sampleOver(inkUv));
  vec3 c = metal * (1.0 - pageInk * u_ink * 0.8);

  vec3 lightDir = normalize(vec3(-0.35, -0.55, 0.75));
  float spec = pow(max(dot(normal, lightDir), 0.0), 60.0);
  c += spec;

  o_color = vec4(c, 1.0);
}
`;

type Drop = { x: number; y: number; radius: number; strength: number };

type PoolLayerProps = Required<
  Pick<MercuryPoolProps, "metal" | "reflection" | "ripple" | "damping" | "ink">
> & { background?: string };

/** Walks up from the host to the first opaque background colour, so a
 * transparent region of the painted texture composites onto the page rather
 * than onto black — the same probe crystal-lens and pond-glass use, with
 * `within` passed so a token-valued `background-color` resolves against the
 * real cascade instead of a detached probe canvas. */
function effectiveBackground(
  el: HTMLElement | null,
): [number, number, number, number] {
  let node: HTMLElement | null = el;
  while (node) {
    const bg = getComputedStyle(node).backgroundColor;
    const rgba = resolveColor(bg, node);
    if (rgba[3] > 0.01) return rgba;
    node = node.parentElement;
  }
  return resolveColor(
    getComputedStyle(document.documentElement).getPropertyValue(
      "--background",
    ) || "#fff",
    document.documentElement,
  );
}

/** Clears a freshly created (or recreated) height field to "flat, no
 * motion" — biased mid-grey in byte mode (which decodes to h = 0), true
 * zero in half-float mode. */
function clearHeightField(
  gl: GLContext,
  fb: Framebuffer,
  precision: "half" | "byte",
): void {
  fb.bind();
  if (precision === "byte") {
    gl.clearColor(0.5, 0.5, 0, 1);
  } else {
    gl.clearColor(0, 0, 0, 0);
  }
  gl.clear(gl.COLOR_BUFFER_BIT);
}

/**
 * The GL layer. Owns the context, the two programs (sim + screen), the
 * ping-pong height field, the pending-drop queue and the frame loop; reads
 * everything else from the surface.
 */
function PoolLayer({
  metal,
  reflection,
  ripple,
  damping,
  ink,
  background,
}: PoolLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const simProgramRef = React.useRef<Program | null>(null);
  const renderProgramRef = React.useRef<Program | null>(null);
  const simTriRef = React.useRef<FullscreenTriangle | null>(null);
  const renderTriRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const pingPongRef = React.useRef<PingPong | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const pendingDropsRef = React.useRef<Drop[]>([]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ metal, reflection, ripple, damping, ink });
  React.useEffect(() => {
    paramsRef.current = { metal, reflection, ripple, damping, ink };
  });

  // One frame: upload the texture if a new paint landed, step the sim once
  // (consuming whatever drops are pending), then render.
  const drawFrame = React.useCallback(() => {
    frameRef.current = null;
    const gl = glRef.current;
    const simProgram = simProgramRef.current;
    const renderProgram = renderProgramRef.current;
    const simTri = simTriRef.current;
    const renderTri = renderTriRef.current;
    const canvas = canvasRef.current;
    const live = surfaceRef.current;
    if (
      !gl ||
      !simProgram ||
      !renderProgram ||
      !simTri ||
      !renderTri ||
      !canvas ||
      !live.canvas
    )
      return;
    if (gl.isContextLost()) return;

    if (uploadedVersionRef.current !== live.version) {
      textureRef.current = uploadTexture(
        gl,
        live.canvas,
        { linear: true, wrap: "clamp" },
        textureRef.current,
      );
      uploadedVersionRef.current = live.version;
    }
    const texture = textureRef.current;
    if (!texture) return;

    const sized = resizeGL(gl, canvas, { dprCap: 2 });
    const cssW = sized.width / sized.dpr;
    const cssH = sized.height / sized.dpr;
    const p = paramsRef.current;

    const simW = Math.max(1, Math.round(sized.width * SIM_RESOLUTION));
    const simH = Math.max(1, Math.round(sized.height * SIM_RESOLUTION));
    let pingPong = pingPongRef.current;
    if (
      !pingPong ||
      sized.changed ||
      pingPong.read.width !== simW ||
      pingPong.read.height !== simH
    ) {
      pingPong?.dispose();
      pingPong = createPingPong(gl, simW, simH, true);
      clearHeightField(gl, pingPong.read, pingPong.precision);
      clearHeightField(gl, pingPong.write, pingPong.precision);
      pingPongRef.current = pingPong;
    }

    const byteMode = pingPong.precision === "byte";
    // pond-glass's own stable speed (0.5) and byte-mode easing (×0.85),
    // verbatim — this wave equation is only proven stable at that speed.
    // `ripple` scales it down, never up: capping the multiplier at 1.0
    // means the sim can never run faster than pond-glass's own baseline,
    // which is what a discrete Laplacian this size tolerates before it
    // aliases into a checkerboard.
    const baseSpeed = 0.5 * Math.min(p.ripple, 1);
    const effSpeed = byteMode ? baseSpeed * 0.85 : baseSpeed;
    const texel: [number, number] = [1 / simW, 1 / simH];
    const res: [number, number] = [cssW, cssH];

    const drops = pendingDropsRef.current;
    pendingDropsRef.current = [];
    const dropData = new Float32Array(16);
    for (let i = 0; i < 4; i += 1) {
      const d = drops[i];
      dropData[i * 4] = d ? d.x : 0;
      dropData[i * 4 + 1] = d ? d.y : 0;
      dropData[i * 4 + 2] = d ? d.radius : 1;
      dropData[i * 4 + 3] = d ? d.strength : 0;
    }

    // Sim step: raw height data, not colour — blend off.
    gl.disable(gl.BLEND);
    pingPong.write.bind();
    simProgram.use();
    simProgram.texture("u_state", pingPong.read.texture, 0);
    simProgram.set({
      u_texel: texel,
      u_res: res,
      u_damping: p.damping,
      u_speed: effSpeed,
      u_byteMode: byteMode,
    });
    const dropsLoc = simProgram.uniforms.u_drops;
    if (dropsLoc) gl.uniform4fv(dropsLoc, dropData);
    simTri.draw();
    pingPong.swap();

    // Screen pass: the settled field's normal reads off a mirrored
    // environment and refracts the page's own ink into the metal.
    bindScreen(gl);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
      gl.SRC_ALPHA,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
    );
    const bg = bgRef.current;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    renderProgram.use();
    renderProgram.texture("u_height", pingPong.read.texture, 0);
    renderProgram.texture("u_tex", texture, 1);
    renderProgram.set({
      u_texel: texel,
      u_res: res,
      u_metal: p.metal,
      u_reflection: p.reflection,
      u_ink: p.ink,
      u_bg: bg,
      u_byteMode: byteMode,
    });
    renderTri.draw();
  }, []);

  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(drawFrame);
  }, [drawFrame]);

  // GL setup and teardown. The canvas only mounts once the surface is
  // active (after the first paint), so this is keyed on `surface.active`,
  // not on mount: a mount-only effect never sees the canvas.
  React.useEffect(() => {
    if (!surface.active) return;
    const canvas = canvasRef.current;
    if (!canvas || failedRef.current) return;
    const gl = createGL(canvas, { alpha: true, premultipliedAlpha: true });
    if (!gl) {
      failedRef.current = true;
      return;
    }
    const simProgram = createProgram(gl, FULLSCREEN_VERTEX, SIM_FRAGMENT);
    const renderProgram = createProgram(gl, FULLSCREEN_VERTEX, RENDER_FRAGMENT);
    if (!simProgram || !renderProgram) {
      simProgram?.dispose();
      renderProgram?.dispose();
      failedRef.current = true;
      return;
    }
    const simTri = createFullscreenTriangle(gl, simProgram);
    const renderTri = createFullscreenTriangle(gl, renderProgram);
    glRef.current = gl;
    simProgramRef.current = simProgram;
    renderProgramRef.current = renderProgram;
    simTriRef.current = simTri;
    renderTriRef.current = renderTri;
    uploadedVersionRef.current = 0;

    const detach = onContextLoss(canvas, () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      failedRef.current = true;
    });
    // The pool may already have a paint waiting: draw the flat, undisturbed
    // surface now rather than on the first drop.
    if (surfaceRef.current.version > 0) requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (textureRef.current) gl.deleteTexture(textureRef.current);
      textureRef.current = null;
      uploadedVersionRef.current = 0;
      pingPongRef.current?.dispose();
      pingPongRef.current = null;
      simTri.dispose();
      renderTri.dispose();
      simProgram.dispose();
      renderProgram.dispose();
      glRef.current = null;
      simProgramRef.current = null;
      renderProgramRef.current = null;
      simTriRef.current = null;
      renderTriRef.current = null;
    };
  }, [surface.active, requestFrame]);

  // Every completed paint asks for a frame, so the pool stays in sync with
  // the live page even while resting between drops.
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Pointer on the host: queue a drop every TRAVEL_PX of movement and drive
  // the sim's own rAF loop. The loop lives entirely in this effect's
  // closure (plain locals, not refs) — it steps every frame while a drop is
  // fresh, and stops itself SETTLE_S seconds after the last one; a new drop
  // restarts it.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);

    let raf = 0;
    let lastTs: number | null = null;
    let idleFor = Number.POSITIVE_INFINITY;

    const tick = (ts: number) => {
      raf = 0;
      const dt = lastTs === null ? 0 : Math.min((ts - lastTs) / 1000, 1 / 20);
      lastTs = ts;
      const hadDrop = pendingDropsRef.current.length > 0;
      idleFor = hadDrop ? 0 : idleFor + dt;
      drawFrame();
      if (idleFor < SETTLE_S) {
        raf = requestAnimationFrame(tick);
      } else {
        lastTs = null;
      }
    };

    const wake = () => {
      idleFor = 0;
      if (raf === 0) raf = requestAnimationFrame(tick);
    };

    const addDrop = (u: number, v: number) => {
      const list = pendingDropsRef.current;
      if (list.length >= 4) list.shift();
      list.push({ x: u, y: v, radius: DROP_RADIUS, strength: DROP_STRENGTH });
      wake();
    };

    let hoverX = 0;
    let hoverY = 0;
    let haveHover = false;

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      if (haveHover) {
        const dx = px - hoverX;
        const dy = py - hoverY;
        // Throttle by distance moved, not by time.
        if (dx * dx + dy * dy < TRAVEL_PX * TRAVEL_PX) return;
      }
      haveHover = true;
      hoverX = px;
      hoverY = py;
      addDrop(px / rect.width, py / rect.height);
    };

    const leave = () => {
      haveHover = false;
    };

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, [surface.host, background, drawFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="mercury-pool"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface reflected in a pool of mercury. Sweeping the pointer trails
 * small drops across a real ping-pong height-field simulation — the same
 * `2h - h_prev` wave integration PondGlass runs, seeded every 14px of
 * travel instead of on click — and the screen pass reads the settled
 * field's gradient as a surface normal: a dark-ground, bright-sky
 * environment reflects off it behind a sharp horizon line, the page's own
 * tone stands in for the metal's resting grey, and the page's dark ink is
 * inlaid into the surface and refracted by that same normal, so text and
 * rules ripple with the liquid rather than sitting flat on it. A device
 * without a float-renderable framebuffer falls back to a byte-encoded
 * height field, same as PondGlass. Reduced motion: this layer renders
 * nothing and the real DOM shows at full opacity.
 */
export function MercuryPool({
  metal = 0.85,
  reflection = 0.8,
  ripple = 1,
  damping = 0.985,
  ink = 0.7,
  background,
  paint,
  className,
  children,
}: MercuryPoolProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <PoolLayer
          metal={metal}
          reflection={reflection}
          ripple={ripple}
          damping={damping}
          ink={ink}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
