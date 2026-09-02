"use client";

import * as React from "react";

import {
  FULLSCREEN_VERTEX,
  bindScreen,
  createFramebuffer,
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

export type FluidWashProps = {
  /** Simulation resolution relative to the canvas (0..1]. @default 0.35 */
  resolution?: number;
  /** Jacobi iterations solving for pressure each frame; halved automatically on the byte fallback. @default 12 */
  pressureIterations?: number;
  /** Velocity retained per step — doubles as advection dissipation. @default 0.98 */
  viscosity?: number;
  /** Dye retained per step. @default 0.97 */
  dissipation?: number;
  /** Splat strength multiplier, on both the velocity kick and the ink dropped. @default 0.6 */
  force?: number;
  /** Splat radius, as a fraction of the stage's shorter side. @default 0.08 */
  splatRadius?: number;
  /** How far the settled velocity displaces the sampled page, in CSS px at unit velocity. @default 10 */
  refraction?: number;
  /** Dye colour, any CSS colour incl. tokens. @default "var(--primary)" */
  color?: string;
  /** How strongly pooled dye tints the page (0..1). @default 0.35 */
  tint?: number;
  /** Fill colour where the painted texture is transparent; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

// Signed fields (velocity, divergence, pressure) share one clamp/bias range.
// Generous headroom over a typical splat's impulse magnitude — see
// `IMPULSE_GAIN` below — with the byte fallback clamping gracefully rather
// than wrapping when a fast swipe would otherwise exceed it.
const FIELD_RANGE = 48.0;

// Converts a per-frame pointer delta (CSS px) into the field's own "texels
// per step" unit: multiplying by `resolution` accounts for the sim grid
// being coarser than the canvas, and this extra gain just gives the default
// `force` a visible kick without the caller having to compensate for it.
const IMPULSE_GAIN = 2.5;

// Below this, a decaying splat is indistinguishable from a still fluid.
const ENERGY_STOP = 0.002;

// Shared decode/encode for every signed field — appended into whichever
// shader source needs it, rather than repeated by hand in each one.
const FIELD_CODEC = /* glsl */ `
const float kx_range = ${FIELD_RANGE.toFixed(1)};
float kx_decode(float raw, bool byteMode) {
  return byteMode ? (raw * 2.0 - 1.0) * kx_range : raw;
}
float kx_encode(float v, bool byteMode) {
  float c = clamp(v, -kx_range, kx_range);
  return byteMode ? (c / kx_range * 0.5 + 0.5) : c;
}
`;

const ADVECT_VELOCITY_FRAGMENT = /* glsl */ `
uniform sampler2D u_velocity;
uniform vec2 u_texel;
uniform float u_dissipation;
uniform bool u_byteMode;
in vec2 v_uv;
out vec4 o_color;
${FIELD_CODEC}
void main() {
  vec4 self = texture(u_velocity, v_uv);
  vec2 vel = vec2(kx_decode(self.r, u_byteMode), kx_decode(self.g, u_byteMode));
  vec2 coord = clamp(v_uv - vel * u_texel, 0.0, 1.0);
  vec4 carried = texture(u_velocity, coord);
  vec2 result = vec2(
    kx_decode(carried.r, u_byteMode),
    kx_decode(carried.g, u_byteMode)
  ) * u_dissipation;
  o_color = vec4(kx_encode(result.x, u_byteMode), kx_encode(result.y, u_byteMode), 0.0, 1.0);
}
`;

const ADVECT_DYE_FRAGMENT = /* glsl */ `
uniform sampler2D u_velocity;
uniform sampler2D u_dye;
uniform vec2 u_texel;
uniform float u_dissipation;
uniform bool u_byteMode;
in vec2 v_uv;
out vec4 o_color;
${FIELD_CODEC}
void main() {
  vec4 self = texture(u_velocity, v_uv);
  vec2 vel = vec2(kx_decode(self.r, u_byteMode), kx_decode(self.g, u_byteMode));
  vec2 coord = clamp(v_uv - vel * u_texel, 0.0, 1.0);
  vec4 dye = texture(u_dye, coord);
  o_color = dye * u_dissipation;
}
`;

const SPLAT_VELOCITY_FRAGMENT = /* glsl */ `
uniform sampler2D u_velocity;
uniform vec2 u_res;
uniform vec2 u_point;
uniform vec2 u_impulse;
uniform float u_radius;
uniform bool u_byteMode;
in vec2 v_uv;
out vec4 o_color;
${FIELD_CODEC}
void main() {
  vec4 self = texture(u_velocity, v_uv);
  vec2 vel = vec2(kx_decode(self.r, u_byteMode), kx_decode(self.g, u_byteMode));
  vec2 px = v_uv * u_res;
  float d = length(px - u_point);
  float g = exp(-(d * d) / (2.0 * u_radius * u_radius));
  vel += u_impulse * g;
  o_color = vec4(kx_encode(vel.x, u_byteMode), kx_encode(vel.y, u_byteMode), 0.0, 1.0);
}
`;

const SPLAT_DYE_FRAGMENT = /* glsl */ `
uniform sampler2D u_dye;
uniform vec2 u_res;
uniform vec2 u_point;
uniform float u_radius;
uniform vec3 u_color;
uniform float u_amount;
in vec2 v_uv;
out vec4 o_color;
void main() {
  vec4 dye = texture(u_dye, v_uv);
  vec2 px = v_uv * u_res;
  float d = length(px - u_point);
  float g = exp(-(d * d) / (2.0 * u_radius * u_radius));
  float add = clamp(g * u_amount, 0.0, 1.0);
  vec3 rgb = mix(dye.rgb, u_color, add);
  float a = clamp(dye.a + add, 0.0, 1.0);
  o_color = vec4(rgb, a);
}
`;

const DIVERGENCE_FRAGMENT = /* glsl */ `
uniform sampler2D u_velocity;
uniform vec2 u_texel;
uniform bool u_byteMode;
in vec2 v_uv;
out vec4 o_color;
${FIELD_CODEC}
void main() {
  float l = kx_decode(texture(u_velocity, v_uv - vec2(u_texel.x, 0.0)).r, u_byteMode);
  float r = kx_decode(texture(u_velocity, v_uv + vec2(u_texel.x, 0.0)).r, u_byteMode);
  float b = kx_decode(texture(u_velocity, v_uv - vec2(0.0, u_texel.y)).g, u_byteMode);
  float t = kx_decode(texture(u_velocity, v_uv + vec2(0.0, u_texel.y)).g, u_byteMode);
  float div = 0.5 * ((r - l) + (t - b));
  o_color = vec4(kx_encode(div, u_byteMode), 0.0, 0.0, 1.0);
}
`;

// Warm-started: `u_pressure` is not cleared between frames (only on
// creation), so each frame's solve continues from the last one rather than
// restarting from zero — fewer iterations needed for a comparable result.
const PRESSURE_FRAGMENT = /* glsl */ `
uniform sampler2D u_pressure;
uniform sampler2D u_divergence;
uniform vec2 u_texel;
uniform bool u_byteMode;
in vec2 v_uv;
out vec4 o_color;
${FIELD_CODEC}
void main() {
  float l = kx_decode(texture(u_pressure, v_uv - vec2(u_texel.x, 0.0)).r, u_byteMode);
  float r = kx_decode(texture(u_pressure, v_uv + vec2(u_texel.x, 0.0)).r, u_byteMode);
  float b = kx_decode(texture(u_pressure, v_uv - vec2(0.0, u_texel.y)).r, u_byteMode);
  float t = kx_decode(texture(u_pressure, v_uv + vec2(0.0, u_texel.y)).r, u_byteMode);
  float div = kx_decode(texture(u_divergence, v_uv).r, u_byteMode);
  float p = (l + r + b + t - div) * 0.25;
  o_color = vec4(kx_encode(p, u_byteMode), 0.0, 0.0, 1.0);
}
`;

const GRADIENT_SUBTRACT_FRAGMENT = /* glsl */ `
uniform sampler2D u_pressure;
uniform sampler2D u_velocity;
uniform vec2 u_texel;
uniform bool u_byteMode;
in vec2 v_uv;
out vec4 o_color;
${FIELD_CODEC}
void main() {
  float l = kx_decode(texture(u_pressure, v_uv - vec2(u_texel.x, 0.0)).r, u_byteMode);
  float r = kx_decode(texture(u_pressure, v_uv + vec2(u_texel.x, 0.0)).r, u_byteMode);
  float b = kx_decode(texture(u_pressure, v_uv - vec2(0.0, u_texel.y)).r, u_byteMode);
  float t = kx_decode(texture(u_pressure, v_uv + vec2(0.0, u_texel.y)).r, u_byteMode);
  vec4 self = texture(u_velocity, v_uv);
  vec2 vel = vec2(kx_decode(self.r, u_byteMode), kx_decode(self.g, u_byteMode));
  vel -= 0.5 * vec2(r - l, t - b);
  o_color = vec4(kx_encode(vel.x, u_byteMode), kx_encode(vel.y, u_byteMode), 0.0, 1.0);
}
`;

const SCREEN_FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform sampler2D u_velocity;
uniform sampler2D u_dye;
uniform vec2 u_res;
uniform float u_refraction;
uniform vec3 u_color;
uniform float u_tint;
uniform vec4 u_bg;
uniform bool u_byteMode;
in vec2 v_uv;
out vec4 o_color;
${FIELD_CODEC}
vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}
void main() {
  vec4 self = texture(u_velocity, v_uv);
  vec2 vel = vec2(kx_decode(self.r, u_byteMode), kx_decode(self.g, u_byteMode));
  vec2 offset = vel * u_refraction / u_res;
  vec3 page = sampleOver(v_uv - offset);
  float ink = texture(u_dye, v_uv).a;
  vec3 c = mix(page, u_color, clamp(ink * u_tint, 0.0, 1.0));
  o_color = vec4(c, 1.0);
}
`;

type Programs = {
  advectVelocity: Program;
  advectDye: Program;
  splatVelocity: Program;
  splatDye: Program;
  divergence: Program;
  pressure: Program;
  gradientSubtract: Program;
  screen: Program;
};

type Triangles = Record<keyof Programs, FullscreenTriangle>;

const PROGRAM_SPECS: { key: keyof Programs; fragment: string }[] = [
  { key: "advectVelocity", fragment: ADVECT_VELOCITY_FRAGMENT },
  { key: "advectDye", fragment: ADVECT_DYE_FRAGMENT },
  { key: "splatVelocity", fragment: SPLAT_VELOCITY_FRAGMENT },
  { key: "splatDye", fragment: SPLAT_DYE_FRAGMENT },
  { key: "divergence", fragment: DIVERGENCE_FRAGMENT },
  { key: "pressure", fragment: PRESSURE_FRAGMENT },
  { key: "gradientSubtract", fragment: GRADIENT_SUBTRACT_FRAGMENT },
  { key: "screen", fragment: SCREEN_FRAGMENT },
];

type SimBundle = {
  velocity: PingPong;
  pressure: PingPong;
  divergence: Framebuffer;
  dye: PingPong;
  width: number;
  height: number;
  precision: "half" | "byte";
};

type PendingSplat = {
  point: [number, number];
  impulse: [number, number];
  radius: number;
  color: [number, number, number];
  amount: number;
};

type FluidWashLayerProps = Required<
  Pick<
    FluidWashProps,
    | "resolution"
    | "pressureIterations"
    | "viscosity"
    | "dissipation"
    | "force"
    | "splatRadius"
    | "refraction"
    | "color"
    | "tint"
  >
> & { background?: string };

/** Walks up from the host to the first opaque background colour — the same
 * probe crystal-lens and pond-glass use — so a transparent region of the
 * painted texture composites onto the page rather than onto black. */
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

/** Clears a signed field (velocity, divergence, pressure) to "zero,
 * no motion" — biased mid-grey in byte mode (decodes to 0), true zero in
 * half-float mode. Shared across all three since they all use the same
 * `kx_decode`/`kx_encode` bias. */
function clearSignedField(
  gl: GLContext,
  fb: Framebuffer,
  byteMode: boolean,
): void {
  fb.bind();
  gl.clearColor(byteMode ? 0.5 : 0, byteMode ? 0.5 : 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

/** Dye is plain 0..1 colour + ink amount — no bias needed, clears to fully
 * transparent regardless of precision. */
function clearDye(gl: GLContext, fb: Framebuffer): void {
  fb.bind();
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

function createSimBundle(
  gl: GLContext,
  width: number,
  height: number,
): SimBundle {
  const velocity = createPingPong(gl, width, height, true);
  const pressure = createPingPong(gl, width, height, true);
  const divergence = createFramebuffer(gl, width, height, true);
  const dye = createPingPong(gl, width, height, true);
  const byteMode = velocity.precision === "byte";
  clearSignedField(gl, velocity.read, byteMode);
  clearSignedField(gl, velocity.write, byteMode);
  clearSignedField(gl, pressure.read, byteMode);
  clearSignedField(gl, pressure.write, byteMode);
  clearSignedField(gl, divergence, byteMode);
  clearDye(gl, dye.read);
  clearDye(gl, dye.write);
  return {
    velocity,
    pressure,
    divergence,
    dye,
    width,
    height,
    precision: velocity.precision,
  };
}

function disposeSimBundle(sim: SimBundle): void {
  sim.velocity.dispose();
  sim.pressure.dispose();
  sim.divergence.dispose();
  sim.dye.dispose();
}

/**
 * The GL layer. Owns the context, the eight programs (advect velocity and
 * dye, splat velocity and dye, divergence, pressure, gradient-subtract,
 * screen), the four simulation buffers, the pending splat, and both frame
 * loops — a coalesced one for reacting to a fresh paint, a self-stepping
 * one for the running simulation; reads everything else from the surface.
 */
function FluidWashLayer({
  resolution,
  pressureIterations,
  viscosity,
  dissipation,
  force,
  splatRadius,
  refraction,
  color,
  tint,
  background,
}: FluidWashLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programsRef = React.useRef<Programs | null>(null);
  const trianglesRef = React.useRef<Triangles | null>(null);
  const simRef = React.useRef<SimBundle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const colorRef = React.useRef<[number, number, number, number]>([0, 0, 0, 1]);
  const pendingSplatRef = React.useRef<PendingSplat | null>(null);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({
    resolution,
    pressureIterations,
    viscosity,
    dissipation,
    force,
    splatRadius,
    refraction,
    tint,
  });
  React.useEffect(() => {
    paramsRef.current = {
      resolution,
      pressureIterations,
      viscosity,
      dissipation,
      force,
      splatRadius,
      refraction,
      tint,
    };
  });

  // One frame: upload the texture if a new paint landed, then step the
  // whole stable-fluids pipeline once and composite onto the canvas.
  const drawFrame = React.useCallback(() => {
    frameRef.current = null;
    const gl = glRef.current;
    const programs = programsRef.current;
    const triangles = trianglesRef.current;
    const canvas = canvasRef.current;
    const live = surfaceRef.current;
    if (!gl || !programs || !triangles || !canvas || !live.canvas) return;
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
    let sim = simRef.current;
    if (!sim || sized.changed || sim.width !== simW || sim.height !== simH) {
      if (sim) disposeSimBundle(sim);
      sim = createSimBundle(gl, simW, simH);
      simRef.current = sim;
    }

    const byteMode = sim.precision === "byte";
    const iterations = byteMode
      ? Math.max(1, Math.floor(p.pressureIterations / 2))
      : p.pressureIterations;
    const texel: [number, number] = [1 / simW, 1 / simH];
    const res: [number, number] = [cssW, cssH];

    gl.disable(gl.BLEND);

    // 1. Advect velocity through itself (semi-Lagrangian), decaying by
    // `viscosity` as it goes.
    sim.velocity.write.bind();
    programs.advectVelocity.use();
    programs.advectVelocity.texture("u_velocity", sim.velocity.read.texture, 0);
    programs.advectVelocity.set({
      u_texel: texel,
      u_dissipation: p.viscosity,
      u_byteMode: byteMode,
    });
    triangles.advectVelocity.draw();
    sim.velocity.swap();

    // 2. Splat the pointer's impulse into velocity and its ink into dye —
    // only when it actually moved this frame.
    const splat = pendingSplatRef.current;
    pendingSplatRef.current = null;
    if (splat) {
      sim.velocity.write.bind();
      programs.splatVelocity.use();
      programs.splatVelocity.texture(
        "u_velocity",
        sim.velocity.read.texture,
        0,
      );
      programs.splatVelocity.set({
        u_res: res,
        u_point: splat.point,
        u_impulse: splat.impulse,
        u_radius: splat.radius,
        u_byteMode: byteMode,
      });
      triangles.splatVelocity.draw();
      sim.velocity.swap();

      sim.dye.write.bind();
      programs.splatDye.use();
      programs.splatDye.texture("u_dye", sim.dye.read.texture, 0);
      programs.splatDye.set({
        u_res: res,
        u_point: splat.point,
        u_radius: splat.radius,
        u_color: splat.color,
        u_amount: splat.amount,
      });
      triangles.splatDye.draw();
      sim.dye.swap();
    }

    // 3. Divergence of the (not yet divergence-free) velocity field.
    sim.divergence.bind();
    programs.divergence.use();
    programs.divergence.texture("u_velocity", sim.velocity.read.texture, 0);
    programs.divergence.set({ u_texel: texel, u_byteMode: byteMode });
    triangles.divergence.draw();

    // 4. Solve for pressure with `iterations` Jacobi relaxations.
    for (let i = 0; i < iterations; i += 1) {
      sim.pressure.write.bind();
      programs.pressure.use();
      programs.pressure.texture("u_pressure", sim.pressure.read.texture, 0);
      programs.pressure.texture("u_divergence", sim.divergence.texture, 1);
      programs.pressure.set({ u_texel: texel, u_byteMode: byteMode });
      triangles.pressure.draw();
      sim.pressure.swap();
    }

    // 5. Subtract the pressure gradient so velocity is divergence-free.
    sim.velocity.write.bind();
    programs.gradientSubtract.use();
    programs.gradientSubtract.texture(
      "u_pressure",
      sim.pressure.read.texture,
      0,
    );
    programs.gradientSubtract.texture(
      "u_velocity",
      sim.velocity.read.texture,
      1,
    );
    programs.gradientSubtract.set({ u_texel: texel, u_byteMode: byteMode });
    triangles.gradientSubtract.draw();
    sim.velocity.swap();

    // 6. Advect dye through the settled velocity, decaying by `dissipation`.
    sim.dye.write.bind();
    programs.advectDye.use();
    programs.advectDye.texture("u_velocity", sim.velocity.read.texture, 0);
    programs.advectDye.texture("u_dye", sim.dye.read.texture, 1);
    programs.advectDye.set({
      u_texel: texel,
      u_dissipation: p.dissipation,
      u_byteMode: byteMode,
    });
    triangles.advectDye.draw();
    sim.dye.swap();

    // 7. Composite: the painted page, displaced by velocity and tinted by
    // pooled dye, fully replaces the canvas.
    bindScreen(gl);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const bg = bgRef.current;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const [cr, cg, cb] = colorRef.current;
    programs.screen.use();
    programs.screen.texture("u_tex", texture, 0);
    programs.screen.texture("u_velocity", sim.velocity.read.texture, 1);
    programs.screen.texture("u_dye", sim.dye.read.texture, 2);
    programs.screen.set({
      u_res: res,
      u_refraction: p.refraction,
      u_color: [cr, cg, cb],
      u_tint: p.tint,
      u_bg: bg,
      u_byteMode: byteMode,
    });
    triangles.screen.draw();
  }, []);

  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(drawFrame);
  }, [drawFrame]);

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

    const programs: Partial<Programs> = {};
    const triangles: Partial<Triangles> = {};
    let ok = true;
    for (const spec of PROGRAM_SPECS) {
      const program = createProgram(gl, FULLSCREEN_VERTEX, spec.fragment);
      if (!program) {
        ok = false;
        break;
      }
      programs[spec.key] = program;
      triangles[spec.key] = createFullscreenTriangle(gl, program);
    }
    if (!ok) {
      for (const key of Object.keys(triangles) as (keyof Programs)[]) {
        triangles[key]?.dispose();
      }
      for (const key of Object.keys(programs) as (keyof Programs)[]) {
        programs[key]?.dispose();
      }
      failedRef.current = true;
      return;
    }

    glRef.current = gl;
    programsRef.current = programs as Programs;
    trianglesRef.current = triangles as Triangles;
    uploadedVersionRef.current = 0;

    const detach = onContextLoss(canvas, () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      failedRef.current = true;
    });
    // A paint may already be waiting: draw the flat, undisturbed surface
    // now rather than on the first pointer move.
    if (surfaceRef.current.version > 0) requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (textureRef.current) gl.deleteTexture(textureRef.current);
      textureRef.current = null;
      uploadedVersionRef.current = 0;
      if (simRef.current) disposeSimBundle(simRef.current);
      simRef.current = null;
      const finishedTriangles = trianglesRef.current;
      const finishedPrograms = programsRef.current;
      if (finishedTriangles) {
        for (const key of Object.keys(
          finishedTriangles,
        ) as (keyof Programs)[]) {
          finishedTriangles[key].dispose();
        }
      }
      if (finishedPrograms) {
        for (const key of Object.keys(finishedPrograms) as (keyof Programs)[]) {
          finishedPrograms[key].dispose();
        }
      }
      glRef.current = null;
      programsRef.current = null;
      trianglesRef.current = null;
    };
  }, [surface.active, requestFrame]);

  // Every completed paint asks for a frame, so the fluid stays in sync with
  // the live page even while resting between splats.
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Resolves against the host so `var(--token)` reads the theme that
  // applies to it, and re-resolves whenever the colour prop or host change.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    colorRef.current = resolveColor(color, host);
  }, [color, surface.host]);

  // Pointer on the host: queue one splat per moved frame and drive the
  // sim's own rAF loop. The loop lives entirely in this effect's closure
  // (plain locals, not refs) — it steps every frame while the pointer is
  // inside or the fluid still carries energy from the last splat, and
  // stops itself once that energy decays past ENERGY_STOP; a fresh splat
  // restarts it. Hidden tabs pause it outright.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);

    let raf = 0;
    let inside = false;
    let energy = 0;
    // The raw pointer position (updated on every event) versus its value as
    // of the last consumed tick — the splat delta is measured between
    // these, once per frame, per the house rule against Date.now: "per-frame
    // velocity" means deltas over frame ticks, not over wall-clock time.
    let rawX = 0;
    let rawY = 0;
    let haveRaw = false;
    let frameX = 0;
    let frameY = 0;
    let haveFrame = false;

    const consumeSplat = () => {
      if (!haveRaw) return;
      if (haveFrame) {
        const dx = rawX - frameX;
        const dy = rawY - frameY;
        if (dx !== 0 || dy !== 0) {
          const rect = host.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const p = paramsRef.current;
            const minDim = Math.min(rect.width, rect.height);
            pendingSplatRef.current = {
              point: [rawX, rawY],
              impulse: [
                dx * p.resolution * p.force * IMPULSE_GAIN,
                dy * p.resolution * p.force * IMPULSE_GAIN,
              ],
              radius: Math.max(1, p.splatRadius * minDim),
              color: [
                colorRef.current[0],
                colorRef.current[1],
                colorRef.current[2],
              ],
              amount: 0.5 * p.force,
            };
            energy = (Math.hypot(dx, dy) / minDim) * p.force;
          }
        }
      }
      frameX = rawX;
      frameY = rawY;
      haveFrame = true;
    };

    // Energy decays on the clock, not per frame, so a slow renderer does
    // not keep the loop alive for longer than a fast one would.
    let lastTick = 0;
    const tick = (now?: number) => {
      raf = 0;
      const stamp = typeof now === "number" ? now : lastTick;
      const frames = lastTick > 0 ? Math.min(6, (stamp - lastTick) / 16.7) : 1;
      lastTick = stamp;
      consumeSplat();
      drawFrame();
      energy *= Math.pow(paramsRef.current.viscosity, frames);
      if (surfaceRef.current.active && (inside || energy >= ENERGY_STOP)) {
        raf = requestAnimationFrame(tick);
      }
    };

    const wake = () => {
      if (raf === 0) raf = requestAnimationFrame(tick);
    };

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      rawX = event.clientX - rect.left;
      rawY = event.clientY - rect.top;
      haveRaw = true;
      wake();
    };

    const enter = (event: PointerEvent) => {
      inside = true;
      // A fresh entry shouldn't splat from wherever the pointer last was —
      // only from movement recorded after this point.
      haveFrame = false;
      move(event);
    };
    const leave = () => {
      inside = false;
      haveFrame = false;
    };

    const onVisibility = () => {
      if (document.hidden) {
        if (raf !== 0) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      } else if (
        surfaceRef.current.active &&
        (inside || energy >= ENERGY_STOP)
      ) {
        wake();
      }
    };

    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
      document.removeEventListener("visibilitychange", onVisibility);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, [surface.host, background, drawFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="fluid-wash"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface under a sheet of fluid the pointer stirs. A real velocity
 * field runs on the GPU — semi-Lagrangian advection, a pointer splat into
 * both the velocity and a dye field, then a divergence / pressure-Jacobi /
 * gradient-subtract projection that keeps the flow incompressible — and the
 * page itself is the fluid's surface, sampled displaced by the settled
 * velocity and tinted wherever the dye has pooled. A device without a
 * float-renderable framebuffer gets a byte-encoded, biased velocity and
 * pressure field instead (and half the pressure iterations) rather than
 * losing the effect outright. The simulation loop runs only while the
 * pointer is inside the stage or the fluid still carries energy from the
 * last splat; once that energy decays past a small threshold the fluid
 * falls still and the loop stops itself.
 * Reduced motion: the real DOM shows in full and this layer renders
 * nothing, since the canvas replaces the page outright.
 */
export function FluidWash({
  resolution = 0.35,
  pressureIterations = 12,
  viscosity = 0.98,
  dissipation = 0.97,
  force = 0.6,
  splatRadius = 0.08,
  refraction = 10,
  color = "var(--primary)",
  tint = 0.35,
  background,
  paint,
  className,
  children,
}: FluidWashProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <FluidWashLayer
          resolution={resolution}
          pressureIterations={pressureIterations}
          viscosity={viscosity}
          dissipation={dissipation}
          force={force}
          splatRadius={splatRadius}
          refraction={refraction}
          color={color}
          tint={tint}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
