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

export type BlueprintLensProps = {
  /** Lens radius in CSS pixels. @default 180 */
  radius?: number;
  /** Softens the rim feather and the edge-detection threshold band (0..1). @default 0.5 */
  softness?: number;
  /** Drafting-grid spacing in CSS pixels. @default 24 */
  grid?: number;
  /** Traced-edge stroke weight in CSS pixels; the Sobel line is dilated to this width. @default 1.2 */
  lineWeight?: number;
  /** Ground colour inside the lens. @default "#0d3b8c" */
  blue?: string;
  /** Line, grid and tick colour. @default "#e9f1ff" */
  paper?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec3 u_lens;
uniform float u_softness;
uniform float u_grid;
uniform float u_lineWeight;
uniform vec4 u_blue;
uniform vec4 u_paper;
uniform float u_opacity;
uniform float u_still;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

${GLSL_LUMA}

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

float lumAt(vec2 uv) {
  return kx_luma(sampleOver(uv));
}

// A 3x3 Sobel response (edge magnitude) at one sample point.
float sobelAt(vec2 uv, vec2 texel) {
  float tl = lumAt(uv + vec2(-texel.x, -texel.y));
  float tc = lumAt(uv + vec2(0.0, -texel.y));
  float tr = lumAt(uv + vec2(texel.x, -texel.y));
  float ml = lumAt(uv + vec2(-texel.x, 0.0));
  float mr = lumAt(uv + vec2(texel.x, 0.0));
  float bl = lumAt(uv + vec2(-texel.x, texel.y));
  float bc = lumAt(uv + vec2(0.0, texel.y));
  float br = lumAt(uv + vec2(texel.x, texel.y));
  float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
  float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
  return length(vec2(gx, gy));
}

// A thin band around |d| == 0, halfWidth px wide, feathered by feather px.
float thinLine(float d, float halfWidth, float feather) {
  return 1.0 - smoothstep(halfWidth, halfWidth + feather, abs(d));
}

void main() {
  vec2 px = v_uv * u_res;
  vec2 d = px - u_lens.xy;
  float r = length(d);
  float R = max(u_lens.z, 1.0);
  float feather = mix(0.5, 3.0, clamp(u_softness, 0.0, 1.0));
  float edge = 1.0 - smoothstep(R - feather, R + 0.5, r);
  if (edge <= 0.0) { o_color = vec4(0.0); return; }

  if (u_still > 0.5) {
    // Reduced motion: no tracing, only a still outline so the lens is
    // legible as a shape without redrawing anything under it.
    float t = clamp(r / R, 0.0, 1.0);
    float ring = smoothstep(0.82, 0.985, t) * (1.0 - smoothstep(0.985, 1.0, t));
    o_color = vec4(u_paper.rgb, ring * 0.6 * u_opacity * edge);
    return;
  }

  vec2 uv = v_uv;
  vec2 texel = 1.0 / u_res;

  // Sobel edges, dilated by sampling the same operator around a small ring
  // scaled to lineWeight and keeping the strongest response.
  float response = sobelAt(uv, texel);
  vec2 dilateStep = texel * u_lineWeight;
  response = max(response, sobelAt(uv + vec2(dilateStep.x, 0.0), texel));
  response = max(response, sobelAt(uv + vec2(-dilateStep.x, 0.0), texel));
  response = max(response, sobelAt(uv + vec2(0.0, dilateStep.y), texel));
  response = max(response, sobelAt(uv + vec2(0.0, -dilateStep.y), texel));
  float lo = 0.15;
  float hi = mix(0.19, 0.55, clamp(u_softness, 0.0, 1.0));
  float lineMask = smoothstep(lo, hi, response);

  // Drafting grid: 1px lines every u_grid px, fixed to the page rather
  // than the lens, so the loupe reads as a window onto one blueprint sheet.
  vec2 cell = mod(px, max(u_grid, 1.0));
  vec2 toLine = min(cell, max(u_grid, 1.0) - cell);
  float gridMask = thinLine(min(toLine.x, toLine.y), 0.4, 0.6);

  // Dimension ticks every 20px of arc length along the rim, short and radial.
  float angle = atan(d.y, d.x);
  float anglePerTick = 20.0 / R;
  float nearestTick = floor(angle / anglePerTick + 0.5) * anglePerTick;
  float wrapped = mod(angle - nearestTick + 3.14159265, 6.28318531) - 3.14159265;
  float arcDist = abs(wrapped) * r;
  float tickBand = smoothstep(R - 10.0, R - 8.0, r) * (1.0 - smoothstep(R - 1.0, R + 0.5, r));
  float tickMask = thinLine(arcDist, 0.5, 0.6) * tickBand;

  // A thin rim stroke right at the boundary.
  float rimMask = thinLine(r - R, 0.6, 0.8);

  vec3 c = u_blue.rgb;
  c = mix(c, u_paper.rgb, gridMask * 0.12);
  c = mix(c, u_paper.rgb, lineMask * 0.92);
  c = mix(c, u_paper.rgb, tickMask * 0.85);
  c = mix(c, u_paper.rgb, rimMask * 0.9);

  o_color = vec4(c, u_opacity * edge);
}
`;

type LensLayerProps = Required<
  Pick<
    BlueprintLensProps,
    "radius" | "softness" | "grid" | "lineWeight" | "blue" | "paper"
  >
>;

/** Walks up from the host to the first opaque background colour, so
 * luminance sampled from transparent texture regions reads as the page
 * behind them rather than as false black edges. */
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
function LensLayer({
  radius,
  softness,
  grid,
  lineWeight,
  blue,
  paper,
}: LensLayerProps) {
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
  const colorsRef = React.useRef<{
    blue: [number, number, number, number];
    paper: [number, number, number, number];
  }>({
    blue: [0.05, 0.23, 0.55, 1],
    paper: [0.91, 0.95, 1, 1],
  });
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ radius, softness, grid, lineWeight });
  React.useEffect(() => {
    paramsRef.current = { radius, softness, grid, lineWeight };
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
      u_grid: p.grid,
      u_lineWeight: p.lineWeight,
      u_blue: colorsRef.current.blue,
      u_paper: colorsRef.current.paper,
      u_opacity: opacity.get(),
      u_still: live.motionSafe ? 0 : 1,
      u_bg: bgRef.current,
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

  // Resolve the two theme-able colours against the host so `var(--token)`
  // reads the theme in force on this subtree.
  React.useEffect(() => {
    colorsRef.current = {
      blue: resolveColor(blue, surface.host),
      paper: resolveColor(paper, surface.host),
    };
    if (surfaceRef.current.version > 0) requestFrame();
  }, [surface.host, blue, paper, requestFrame]);

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
      data-effect-canvas="blueprint-lens"
      className="block h-full w-full"
    />
  );
}

/**
 * A loupe that reads the live interface as a cyanotype blueprint. Inside
 * the circle the ground turns `blue`; a 3x3 Sobel pass over the painted
 * texture's luminance finds the interface's edges and redraws them in
 * `paper` at `lineWeight` px, dilated by re-sampling the operator on a
 * small ring rather than blurring afterward. A drafting grid sits behind
 * the tracing at 12% alpha, and dimension ticks mark the rim every 20px
 * like a ruler's dial, closed off by a thin rim stroke. The lens position
 * is a spring on the wrapper's pointer, never on the canvas, and the DOM
 * underneath stays real — nothing here intercepts a click.
 * Reduced motion: the page shows untouched with a still lens outline that
 * follows the pointer without springing.
 */
export function BlueprintLens({
  radius = 180,
  softness = 0.5,
  grid = 24,
  lineWeight = 1.2,
  blue = "#0d3b8c",
  paper = "#e9f1ff",
  paint,
  className,
  children,
}: BlueprintLensProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn("cursor-none", className)}
      effect={
        <LensLayer
          radius={radius}
          softness={softness}
          grid={grid}
          lineWeight={lineWeight}
          blue={blue}
          paper={paper}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
