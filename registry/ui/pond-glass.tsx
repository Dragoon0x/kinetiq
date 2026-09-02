"use client";

import * as React from "react";

import {
  FULLSCREEN_VERTEX,
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

export type PondGlassProps = {
  /** How far the water bends the page beneath a ring, in CSS px. @default 40 */
  refraction?: number;
  /** Specular strength on wave crests (0..1). @default 0.6 */
  highlight?: number;
  /** Wave energy retained per simulation step (0..1). @default 0.985 */
  damping?: number;
  /** Wave propagation speed. @default 0.5 */
  speed?: number;
  /** Seconds the simulation keeps stepping after the last drop before it stops itself. @default 4 */
  settle?: number;
  /** Stone radius in CSS px. @default 8 */
  dropRadius?: number;
  /** Stone strength — the height added where it lands. @default 1 */
  dropStrength?: number;
  /** Small drops trail the pointer while it moves, not only on click. @default false */
  hoverDrops?: boolean;
  /** Simulation resolution relative to the canvas (0..1]. @default 0.5 */
  resolution?: number;
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

const RENDER_FRAGMENT = /* glsl */ `
uniform sampler2D u_height;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform vec2 u_res;
uniform float u_refraction;
uniform float u_highlight;
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
  float hC = sampleH(v_uv);
  float hL = sampleH(v_uv - vec2(u_texel.x, 0.0));
  float hR = sampleH(v_uv + vec2(u_texel.x, 0.0));
  float hU = sampleH(v_uv - vec2(0.0, u_texel.y));
  float hD = sampleH(v_uv + vec2(0.0, u_texel.y));
  vec2 grad = vec2(hR - hL, hD - hU) * 0.5;

  vec2 offset = grad * u_refraction / u_res;
  vec2 disp = offset * 0.18;

  vec3 c;
  c.r = sampleOver(v_uv - offset - disp).r;
  c.g = sampleOver(v_uv - offset).g;
  c.b = sampleOver(v_uv - offset + disp).b;

  vec3 normal = normalize(vec3(-grad, 1.0));
  vec3 lightDir = normalize(vec3(-0.35, -0.55, 0.75));
  float spec = pow(max(dot(normal, lightDir), 0.0), 24.0);
  c += u_highlight * spec;

  // smoothstep needs edge0 < edge1, so darken on -hC rather than hC: this
  // reads 0 at and above the rest level and ramps to 1 by hC = -0.4.
  float trough = smoothstep(0.0, 0.4, -hC);
  c *= mix(1.0, 0.8, trough);

  o_color = vec4(c, 1.0);
}
`;

type Drop = { x: number; y: number; radius: number; strength: number };

type PondLayerProps = Required<
  Pick<
    PondGlassProps,
    | "refraction"
    | "highlight"
    | "damping"
    | "speed"
    | "settle"
    | "dropRadius"
    | "dropStrength"
    | "hoverDrops"
    | "resolution"
  >
> & { background?: string };

/** Walks up from the host to the first opaque background colour, so a
 * transparent region of the painted texture composites onto the page rather
 * than onto black — the same probe crystal-lens and dust-reveal use, with
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
function PondLayer({
  refraction,
  highlight,
  damping,
  speed,
  settle,
  dropRadius,
  dropStrength,
  hoverDrops,
  resolution,
  background,
}: PondLayerProps) {
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
  const paramsRef = React.useRef({
    refraction,
    highlight,
    damping,
    speed,
    settle,
    dropRadius,
    dropStrength,
    hoverDrops,
    resolution,
  });
  React.useEffect(() => {
    paramsRef.current = {
      refraction,
      highlight,
      damping,
      speed,
      settle,
      dropRadius,
      dropStrength,
      hoverDrops,
      resolution,
    };
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

    const simW = Math.max(1, Math.round(sized.width * p.resolution));
    const simH = Math.max(1, Math.round(sized.height * p.resolution));
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
    // Byte-mode integrates the wave equation over an 8-bit-encoded field —
    // ease propagation down a touch so it stays stable.
    const effSpeed = byteMode ? p.speed * 0.85 : p.speed;
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

    // Screen pass: the settled field refracts the painted texture.
    bindScreen(gl);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const bg = bgRef.current;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    renderProgram.use();
    renderProgram.texture("u_height", pingPong.read.texture, 0);
    renderProgram.texture("u_tex", texture, 1);
    renderProgram.set({
      u_texel: texel,
      u_res: res,
      u_refraction: p.refraction,
      u_highlight: p.highlight,
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
    const gl = createGL(canvas, { alpha: true, premultipliedAlpha: false });
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
    // The pond may already have a paint waiting: draw the flat, undistorted
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

  // Every completed paint asks for a frame, so the pond stays in sync with
  // the live page even while resting between drops.
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Pointer on the host: queue drops and drive the sim's own rAF loop.
  // The loop lives entirely in this effect's closure (plain locals, not
  // refs) — it steps every frame while a drop is fresh, and stops itself
  // `settle` seconds after the last one; a new drop restarts it.
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
      if (idleFor < paramsRef.current.settle) {
        raf = requestAnimationFrame(tick);
      } else {
        lastTs = null;
      }
    };

    const wake = () => {
      idleFor = 0;
      if (raf === 0) raf = requestAnimationFrame(tick);
    };

    const addDrop = (
      u: number,
      v: number,
      radius: number,
      strength: number,
    ) => {
      const list = pendingDropsRef.current;
      if (list.length >= 4) list.shift();
      list.push({ x: u, y: v, radius, strength });
      wake();
    };

    let hoverX = 0;
    let hoverY = 0;
    let haveHover = false;

    const down = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const p = paramsRef.current;
      addDrop(px / rect.width, py / rect.height, p.dropRadius, p.dropStrength);
    };

    const move = (event: PointerEvent) => {
      if (!paramsRef.current.hoverDrops) return;
      const rect = host.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      if (haveHover) {
        const dx = px - hoverX;
        const dy = py - hoverY;
        // Throttle by distance moved (>= 12px) rather than by time.
        if (dx * dx + dy * dy < 144) return;
      }
      haveHover = true;
      hoverX = px;
      hoverY = py;
      const p = paramsRef.current;
      addDrop(
        px / rect.width,
        py / rect.height,
        p.dropRadius * 0.4,
        p.dropStrength * 0.25,
      );
    };

    host.addEventListener("pointerdown", down);
    host.addEventListener("pointermove", move);
    return () => {
      host.removeEventListener("pointerdown", down);
      host.removeEventListener("pointermove", move);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, [surface.host, background, drawFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="pond-glass"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface under still water. Click anywhere and a stone drops: a real
 * height-field wave simulation runs on the GPU — a ping-pong pair of
 * framebuffers integrating the classic `2h - h_prev` wave equation at a
 * fraction of the canvas resolution — and every ring that crosses the page
 * refracts and highlights whatever sits beneath it before settling back to
 * glass. A device without a float-renderable framebuffer gets a byte-encoded
 * height field instead (biased around a fixed range, propagation eased down
 * a touch for stability) rather than losing the effect outright. The DOM
 * underneath sits at zero opacity, still in flow and still focusable, so
 * every click that drops a stone also reaches the real element beneath it.
 * Reduced motion: the real DOM shows at full opacity and this layer renders
 * nothing.
 */
export function PondGlass({
  refraction = 40,
  highlight = 0.6,
  damping = 0.985,
  speed = 0.5,
  settle = 4,
  dropRadius = 8,
  dropStrength = 1,
  hoverDrops = false,
  resolution = 0.5,
  background,
  paint,
  className,
  children,
}: PondGlassProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <PondLayer
          refraction={refraction}
          highlight={highlight}
          damping={damping}
          speed={speed}
          settle={settle}
          dropRadius={dropRadius}
          dropStrength={dropStrength}
          hoverDrops={hoverDrops}
          resolution={resolution}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
