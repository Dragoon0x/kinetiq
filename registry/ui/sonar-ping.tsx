"use client";

import * as React from "react";

import {
  FULLSCREEN_VERTEX,
  GLSL_LUMA,
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
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type SonarPingProps = {
  /** Ring expansion speed, px/s. @default 380 */
  speed?: number;
  /** Width of the lit front band, px. @default 26 */
  width?: number;
  /** Trailing-decay rate behind the front (per 100px of wake). @default 1 */
  decay?: number;
  /** Resting overlay darkness (0..1). @default 0.82 */
  darkness?: number;
  /** Edge "return" flare strength. @default 1 */
  edges?: number;
  /** Edge "return" colour — what the sonar reads back. @default "#7cf2c4" */
  color?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

/** The shader's fixed ring-slot count — `u_rings` is a vec4[6] array. */
const MAX_RINGS = 6;

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_speed;
uniform float u_width;
uniform float u_decay;
uniform float u_darkness;
uniform float u_edges;
uniform vec3 u_color;
uniform float u_still;
uniform vec4 u_rings[6];
in vec2 v_uv;
out vec4 o_color;

${GLSL_LUMA}

float lumAt(vec2 uv) {
  return kx_luma(texture(u_tex, clamp(uv, 0.0, 1.0)).rgb);
}

// A Gaussian band of width w centred on d == 0.
float band(float d, float w) {
  float x = d / max(w, 0.001);
  return exp(-x * x);
}

void main() {
  vec2 px = v_uv * u_res;

  if (u_still > 0.5) {
    // Reduced motion: the resting darkness only — no ring ever runs.
    o_color = vec4(0.0, 0.0, 0.0, clamp(u_darkness, 0.0, 1.0));
    return;
  }

  // Per ring: a lit front band plus a decaying wake behind it, both driven
  // by the ring's own age (radius = age * speed). A ring that has not been
  // fired (or long since died) carries a huge age, so both terms fall to
  // zero on their own — no separate "alive" flag needed.
  float lit = 0.0;
  float ringBand = 0.0;
  for (int i = 0; i < 6; i++) {
    vec4 ring = u_rings[i];
    float age = ring.z;
    float radius = age * u_speed;
    float d = distance(px, ring.xy);
    float b = band(d - radius, u_width);
    float trail = exp(-max(radius - d, 0.0) * u_decay / 100.0) * 0.6;
    lit = max(lit, b + trail);
    ringBand = max(ringBand, b);
  }
  lit = clamp(lit, 0.0, 1.0);

  // A 3x3 Sobel pass over the painted texture's luminance, sampled a texel
  // apart in every direction.
  vec2 texel = 1.0 / u_res;
  float tl = lumAt(v_uv + vec2(-texel.x, -texel.y));
  float tc = lumAt(v_uv + vec2(0.0, -texel.y));
  float tr = lumAt(v_uv + vec2(texel.x, -texel.y));
  float ml = lumAt(v_uv + vec2(-texel.x, 0.0));
  float mr = lumAt(v_uv + vec2(texel.x, 0.0));
  float bl = lumAt(v_uv + vec2(-texel.x, texel.y));
  float bc = lumAt(v_uv + vec2(0.0, texel.y));
  float br = lumAt(v_uv + vec2(texel.x, texel.y));
  float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
  float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
  float edgeMag = smoothstep(0.08, 0.4, length(vec2(gx, gy)));

  // The interface's own edges flare in color, but only inside the ring
  // band — the "returns" of whatever the front is sweeping over right now.
  float returns = clamp(edgeMag * u_edges * ringBand, 0.0, 1.0);

  float alpha = clamp(u_darkness * (1.0 - lit), 0.0, 1.0);
  vec3 outColor = mix(vec3(0.0), u_color, returns);
  alpha = max(alpha, returns);
  o_color = vec4(outColor, alpha);
}
`;

type SonarPingLayerProps = Required<
  Pick<
    SonarPingProps,
    "speed" | "width" | "decay" | "darkness" | "edges" | "color"
  >
>;

/**
 * The GL layer. Owns the context, the program, the texture, the ring pool,
 * and the frame loop; reads everything else from the surface.
 */
function SonarPingLayer({
  speed,
  width,
  decay,
  darkness,
  edges,
  color,
}: SonarPingLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const drawFrameRef = React.useRef<((tick: number) => void) | null>(null);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ speed, width, decay, darkness, edges });
  React.useEffect(() => {
    paramsRef.current = { speed, width, decay, darkness, edges };
  });

  const colorRef = React.useRef<[number, number, number, number]>([0, 0, 0, 1]);

  // Fixed ring pool (struct-of-arrays, never React state) — `cursor` round-
  // robins so a burst of clicks recycles the oldest ring rather than
  // dropping the newest. `born` is the rAF tick (ms) the ring was pushed.
  const ringsRef = React.useRef({
    x: new Float32Array(MAX_RINGS),
    y: new Float32Array(MAX_RINGS),
    born: new Float32Array(MAX_RINGS).fill(-1e6),
    cursor: 0,
  });
  const ringsUniformRef = React.useRef(new Float32Array(MAX_RINGS * 4));
  // Latest rAF timestamp the loop has observed — never Date.now(); read by
  // the pointerdown handler so a pushed ring is born on the same clock the
  // loop ages rings against.
  const tickRef = React.useRef(0);

  // Coalescing scheduler. Stable identity (empty deps) so the GL setup
  // effect below only re-runs when `surface.active` flips — it calls
  // through `drawFrameRef` rather than closing over `drawFrame` directly,
  // which is what lets a continuous, self-rescheduling loop avoid becoming
  // a self-referential callback.
  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame((tick) => {
      frameRef.current = null;
      drawFrameRef.current?.(tick);
    });
  }, []);

  // One frame: upload the texture if a new paint landed, age the ring pool,
  // draw, then — only while a ring's radius has not yet swept past the far
  // corner of the surface — ask for the next frame. The loop stops on its
  // own the moment every ring has died.
  const drawFrame = React.useCallback(
    (tick: number) => {
      tickRef.current = tick;
      const gl = glRef.current;
      const program = programRef.current;
      const tri = triRef.current;
      const canvas = canvasRef.current;
      const live = surfaceRef.current;
      if (!gl || !program || !tri || !canvas || !live.canvas) return;
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

      const size = resizeGL(gl, canvas, { dprCap: 2 });
      const cssW = size.width / size.dpr;
      const cssH = size.height / size.dpr;
      const p = paramsRef.current;
      const still = !live.motionSafe;

      const rings = ringsRef.current;
      const uniformArray = ringsUniformRef.current;
      let anyAlive = false;
      for (let i = 0; i < MAX_RINGS; i += 1) {
        const born = rings.born[i] ?? -1e6;
        const rx = rings.x[i] ?? 0;
        const ry = rings.y[i] ?? 0;
        const age = (tick - born) / 1000;
        const radius = age * p.speed;
        // A ring dies once its radius passes the farthest corner from its
        // own origin — past that, every visible point is already behind
        // the front, and the shader's own decay term takes it to zero.
        const farX = Math.max(rx, cssW - rx);
        const farY = Math.max(ry, cssH - ry);
        const farCorner = Math.hypot(farX, farY);
        if (!still && age >= 0 && radius <= farCorner) anyAlive = true;
        const o = i * 4;
        uniformArray[o] = rx;
        uniformArray[o + 1] = ry;
        uniformArray[o + 2] = age;
        uniformArray[o + 3] = 0;
      }

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      program.use();
      program.texture("u_tex", texture, 0);
      program.set({
        u_res: [cssW, cssH],
        u_speed: p.speed,
        u_width: p.width,
        u_decay: p.decay,
        u_darkness: p.darkness,
        u_edges: p.edges,
        u_color: [
          colorRef.current[0],
          colorRef.current[1],
          colorRef.current[2],
        ],
        u_still: still ? 1 : 0,
        u_rings: uniformArray,
      });
      tri.draw();

      if (!still && surfaceRef.current.active && anyAlive) {
        requestFrame();
      }
    },
    [requestFrame],
  );

  React.useEffect(() => {
    drawFrameRef.current = drawFrame;
  });

  // GL setup and teardown. The canvas only mounts once the surface is
  // active (after the first paint), so this is keyed on `surface.active`,
  // not on mount: a mount-only effect would run against no canvas at all.
  React.useEffect(() => {
    if (!surface.active) return;
    const canvas = canvasRef.current;
    if (!canvas || failedRef.current) return;
    const gl = createGL(canvas, { alpha: true, premultipliedAlpha: false });
    if (!gl) {
      failedRef.current = true;
      return;
    }
    const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
    if (!program) {
      failedRef.current = true;
      return;
    }
    const tri = createFullscreenTriangle(gl, program);
    glRef.current = gl;
    programRef.current = program;
    triRef.current = tri;
    uploadedVersionRef.current = 0;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const detach = onContextLoss(canvas, () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      failedRef.current = true;
    });
    // A paint may already be waiting: draw it now rather than on the next
    // pointerdown.
    if (surfaceRef.current.version > 0) requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (textureRef.current) gl.deleteTexture(textureRef.current);
      textureRef.current = null;
      uploadedVersionRef.current = 0;
      tri.dispose();
      program.dispose();
      glRef.current = null;
      programRef.current = null;
      triRef.current = null;
    };
  }, [surface.active, requestFrame]);

  // Every completed paint asks for a frame, so the darkness and any edge
  // returns stay current with the live page.
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Colour resolves against the host so a `var(--token)` picks up the theme
  // in force on this subtree.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    colorRef.current = resolveColor(color, host);
    requestFrame();
  }, [surface.host, color, requestFrame]);

  // Pointerdown on the host pushes a ring and kicks the loop; reduced motion
  // leaves the listener attached but inert — no ring is ever pushed and the
  // drawn frame never reads one.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;

    const down = (event: PointerEvent) => {
      if (!surfaceRef.current.motionSafe) return;
      const rect = host.getBoundingClientRect();
      const rings = ringsRef.current;
      const i = rings.cursor;
      rings.x[i] = event.clientX - rect.left;
      rings.y[i] = event.clientY - rect.top;
      rings.born[i] = tickRef.current;
      rings.cursor = (i + 1) % MAX_RINGS;
      requestFrame();
    };

    host.addEventListener("pointerdown", down);
    return () => {
      host.removeEventListener("pointerdown", down);
    };
  }, [surface.host, requestFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="sonar-ping"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface sits under a dark scrim that only a ping can cut through:
 * click the host and a ring runs outward from the impact point at `speed`
 * px/s, its front a soft `width`-px band with a decaying wake trailing
 * behind, easing the scrim's alpha down wherever the ping has reached. Right
 * inside that band, a 3x3 Sobel pass over the painted texture's luminance
 * finds the interface's real edges and flares them in `color` — the
 * "returns" a sonar reads back. Up to six rings run at once, each ageing off
 * the clock its own click was born on; the loop that redraws them stops
 * itself once every ring's radius has swept past the far corner of the
 * surface, roughly four seconds at the defaults. At rest, with nothing
 * travelling, the page is nothing but the scrim at `darkness`.
 * Reduced motion: the scrim holds still at `darkness` and a click does
 * nothing — no ring, no ping.
 */
export function SonarPing({
  speed = 380,
  width = 26,
  decay = 1,
  darkness = 0.82,
  edges = 1,
  color = "#7cf2c4",
  paint,
  className,
  children,
}: SonarPingProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={className}
      effect={
        <SonarPingLayer
          speed={speed}
          width={width}
          decay={decay}
          darkness={darkness}
          edges={edges}
          color={color}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
