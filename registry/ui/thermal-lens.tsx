"use client";

import * as React from "react";

import { animate, useMotionValue } from "motion/react";

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
import { springs } from "@/registry/lib/motion";
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type ThermalPalette = "ironbow" | "arctic" | "plasma";

export type ThermalLensProps = {
  /** Lens radius in CSS pixels. @default 180 */
  radius?: number;
  /** Edge feather, 0 (crisp) to 1 (soft). @default 0.5 */
  softness?: number;
  /** Which ramp the heat reads through. @default "ironbow" */
  palette?: ThermalPalette;
  /** Strength of the white glow bloomed off the hottest pixels. @default 0.6 */
  bloom?: number;
  /** Contrast applied to the heat curve before the ramp. @default 1 */
  contrast?: number;
  /** Flips which luminance extreme reads hot; dark ink is hot by default. @default false */
  invert?: boolean;
  /** A faint 2px camera grid over the lens. @default false */
  grid?: boolean;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

// Five fixed stops per palette, flattened to r,g,b triples so the whole ramp
// uploads as one uniform array. Every palette shares the same first stop — a
// cold, near-black blue — so the coldest reading never renders as flat black.
const PALETTE_RAMPS: Record<ThermalPalette, number[]> = {
  ironbow: [
    0.09,
    0.11,
    0.32, // cold blue ground
    0.29,
    0.04,
    0.38, // deep purple
    0.78,
    0.06,
    0.07, // red
    0.96,
    0.46,
    0.04, // orange
    0.99,
    0.92,
    0.38, // yellow
  ],
  arctic: [
    0.03,
    0.05,
    0.14, // cold blue ground
    0.1,
    0.32,
    0.82, // blue
    0.22,
    0.72,
    0.9, // cyan
    0.62,
    0.9,
    0.95, // pale cyan
    0.97,
    0.99,
    1.0, // white
  ],
  plasma: [
    0.06,
    0.03,
    0.14, // cold blue ground
    0.42,
    0.07,
    0.52, // purple
    0.86,
    0.18,
    0.52, // pink
    0.98,
    0.42,
    0.32, // orange-pink
    0.98,
    0.9,
    0.32, // yellow
  ],
};

const FRAGMENT = /* glsl */ `
${GLSL_LUMA}
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec3 u_lens;
uniform float u_softness;
uniform float u_bloom;
uniform float u_contrast;
uniform float u_invert;
uniform float u_grid;
uniform float u_opacity;
uniform float u_still;
uniform vec4 u_bg;
uniform vec3 u_ramp[5];
in vec2 v_uv;
out vec4 o_color;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

float heatAt(vec2 uv) {
  float l = kx_luma(sampleOver(uv));
  return u_invert > 0.5 ? l : 1.0 - l;
}

// Progressive mix across five fixed stops. Every u_ramp subscript below is a
// literal constant, never a computed one, so this never touches dynamic
// array indexing.
vec3 rampColor(float t) {
  float seg = clamp(t, 0.0, 1.0) * 4.0;
  vec3 c = mix(u_ramp[0], u_ramp[1], clamp(seg, 0.0, 1.0));
  c = mix(c, u_ramp[2], clamp(seg - 1.0, 0.0, 1.0));
  c = mix(c, u_ramp[3], clamp(seg - 2.0, 0.0, 1.0));
  c = mix(c, u_ramp[4], clamp(seg - 3.0, 0.0, 1.0));
  return c;
}

void main() {
  vec2 px = v_uv * u_res;
  vec2 d = px - u_lens.xy;
  float r = length(d);
  float R = max(u_lens.z, 1.0);
  float feather = mix(1.5, R * 0.5, clamp(u_softness, 0.0, 1.0));
  float edge = 1.0 - smoothstep(R - feather, R + 1.0, r);
  if (edge <= 0.001) { o_color = vec4(0.0); return; }
  float t = clamp(r / R, 0.0, 1.0);

  if (u_still > 0.5) {
    // Reduced motion: an outline only, so the lens reads as a shape without
    // simulating any reading under it.
    float ring = smoothstep(0.82, 0.965, t) * (1.0 - smoothstep(0.965, 1.0, t));
    o_color = vec4(0.75, 0.86, 1.0, ring * 0.6 * u_opacity * edge);
    return;
  }

  vec2 uv = px / u_res;
  float texel = 1.0 / max(u_res.x, u_res.y);
  float off = texel * 2.4;

  float h = heatAt(uv);
  float hBlur = h
    + heatAt(uv + vec2(off, 0.0))
    + heatAt(uv - vec2(off, 0.0))
    + heatAt(uv + vec2(0.0, off))
    + heatAt(uv - vec2(0.0, off));
  hBlur /= 5.0;

  float heat = clamp((h - 0.5) * u_contrast + 0.5, 0.0, 1.0);
  vec3 c = rampColor(heat);

  // Bloom: the blurred hot channel added back as a white glow, so the
  // brightest readings clip toward white instead of stopping at yellow.
  float glow = smoothstep(0.55, 1.0, hBlur) * max(u_bloom, 0.0);
  c += vec3(1.0) * glow * 0.65;

  if (u_grid > 0.5) {
    float spacing = 22.0;
    vec2 gp = mod(px - u_lens.xy + spacing * 0.5, spacing) - spacing * 0.5;
    float lineX = 1.0 - smoothstep(0.0, 1.0, abs(gp.x));
    float lineY = 1.0 - smoothstep(0.0, 1.0, abs(gp.y));
    c += vec3(0.55, 0.7, 0.8) * max(lineX, lineY) * 0.16;
  }

  // Thin dark rim so the lens reads as an instrument, not a soft spotlight.
  float rim = smoothstep(0.9, 0.965, t) * (1.0 - smoothstep(0.965, 1.0, t));
  c = mix(c, vec3(0.03, 0.02, 0.05), rim * 0.5);

  o_color = vec4(c, u_opacity * edge);
}
`;

type ThermalLensLayerProps = Required<
  Pick<
    ThermalLensProps,
    "radius" | "softness" | "palette" | "bloom" | "contrast" | "invert" | "grid"
  >
>;

/** Walks up from the host to the first opaque background colour, so samples
 * over transparent texture regions composite onto the page rather than onto
 * black. */
function effectiveBackground(
  el: HTMLElement | null,
): [number, number, number, number] {
  let node: HTMLElement | null = el;
  while (node) {
    const bg = getComputedStyle(node).backgroundColor;
    const rgba = resolveColor(bg);
    if (rgba[3] > 0.01) return rgba;
    node = node.parentElement;
  }
  return resolveColor(
    getComputedStyle(document.documentElement).getPropertyValue(
      "--background",
    ) || "#fff",
  );
}

/**
 * The GL layer. Owns the context, the program, the texture, the pointer
 * spring, and the frame loop; reads everything else from the surface.
 */
function ThermalLensLayer({
  radius,
  softness,
  palette,
  bloom,
  contrast,
  invert,
  grid,
}: ThermalLensLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const x = useMotionValue<number>(-9999);
  const y = useMotionValue<number>(-9999);
  const opacity = useMotionValue<number>(0);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({
    radius,
    softness,
    palette,
    bloom,
    contrast,
    invert,
    grid,
  });
  React.useEffect(() => {
    paramsRef.current = {
      radius,
      softness,
      palette,
      bloom,
      contrast,
      invert,
      grid,
    };
  });

  // One frame: upload the texture if a new paint landed, then draw.
  const drawFrame = React.useCallback(() => {
    frameRef.current = null;
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
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_lens: [x.get(), y.get(), p.radius],
      u_softness: p.softness,
      u_bloom: p.bloom,
      u_contrast: p.contrast,
      u_invert: p.invert ? 1 : 0,
      u_grid: p.grid ? 1 : 0,
      u_opacity: opacity.get(),
      u_still: live.motionSafe ? 0 : 1,
      u_bg: bgRef.current,
      u_ramp: PALETTE_RAMPS[p.palette],
    });
    tri.draw();
  }, [x, y, opacity]);

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
    // pointer move.
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

  // Every motion-value change and every completed paint asks for a frame.
  React.useEffect(() => {
    const unsubs = [x, y, opacity].map((mv) => mv.on("change", requestFrame));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [x, y, opacity, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Pointer on the host: spring the lens, fade in and out.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host);

    const still = !surfaceRef.current.motionSafe;
    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      if (still) {
        x.set(px);
        y.set(py);
      } else {
        animate(x, px, springs.snap);
        animate(y, py, springs.snap);
      }
    };
    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      x.jump(event.clientX - rect.left);
      y.jump(event.clientY - rect.top);
      if (still) opacity.set(1);
      else animate(opacity, 1, { duration: 0.18 });
    };
    const leave = () => {
      if (still) opacity.set(0);
      else animate(opacity, 0, { duration: 0.22 });
    };

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
    };
  }, [surface.host, x, y, opacity]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="thermal-lens"
      className="block h-full w-full"
    />
  );
}

/**
 * A lens that reads the interface as heat. Inside a feathered circle that
 * follows the cursor, the painted texture's luminance is mapped through a
 * five-stop ramp — a cold blue ground rising through purple, red, orange and
 * yellow — with the hottest pixels bloomed toward white by a five-tap blur
 * of that same heat channel, the way a thermal camera clips its brightest
 * reading. Dark ink reads hot by default, since ink is where the interface
 * is dense; `invert` swaps which luminance extreme glows. The ramp itself is
 * a plain JavaScript lookup by `palette`, uploaded once as five fixed
 * colours — the shader only blends between them, it never invents one.
 * Reduced motion: a single still outline sits at the pointer with no spring
 * and no heat map underneath.
 */
export function ThermalLens({
  radius = 180,
  softness = 0.5,
  palette = "ironbow",
  bloom = 0.6,
  contrast = 1,
  invert = false,
  grid = false,
  paint,
  className,
  children,
}: ThermalLensProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn("cursor-none", className)}
      effect={
        <ThermalLensLayer
          radius={radius}
          softness={softness}
          palette={palette}
          bloom={bloom}
          contrast={contrast}
          invert={invert}
          grid={grid}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
