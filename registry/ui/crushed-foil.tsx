"use client";

import * as React from "react";

import { animate, useMotionValue } from "motion/react";

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
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type CrushedFoilProps = {
  /** Darkening at each facet's crease, where two cells meet (0..1). @default 0.2 */
  crease?: number;
  /** Voronoi facet cell size, in CSS pixels. @default 42 */
  facet?: number;
  /** How far the material reads as tinted metal over the raw page, and how strongly it takes a specular hit (0..1). @default 0.3 */
  metal?: number;
  /** The foil's own colour, any CSS colour (tokens included). @default "#cfd6e2" */
  tint?: string;
  /** Height of the pointer light above the plane, in CSS pixels. @default 420 */
  lightRadius?: number;
  /** Fill for whatever the painted texture leaves transparent. Defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_facet;
uniform float u_crease;
uniform float u_metal;
uniform vec4 u_tint;
uniform vec3 u_light;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// A cell's hashed tilt, each axis in [-1, 1] before the 0.6 dampening in
// main() keeps every facet close enough to upright that the page under it
// stays legible rather than folding into a mirror.
vec2 facetTilt(vec2 cellId) {
  float tx = kx_hash(cellId + vec2(19.7, 3.1)) * 2.0 - 1.0;
  float ty = kx_hash(cellId + vec2(4.3, 27.9)) * 2.0 - 1.0;
  return vec2(tx, ty);
}

void main() {
  vec2 px = v_uv * u_res;
  float cellSize = max(u_facet, 1.0);
  vec2 cellUnit = px / cellSize;
  vec2 base = floor(cellUnit);
  vec2 f = fract(cellUnit);

  // Voronoi over the 3x3 neighbourhood of hashed cell points: the nearest
  // site owns this pixel and carries its facet's normal; the gap to the
  // second-nearest site is how far this pixel sits from the seam.
  float nearest = 8.0;
  float second = 8.0;
  vec2 nearestCell = base;
  for (int gy = -1; gy <= 1; gy++) {
    for (int gx = -1; gx <= 1; gx++) {
      vec2 neighbor = vec2(float(gx), float(gy));
      vec2 cellId = base + neighbor;
      vec2 jitter = vec2(kx_hash(cellId), kx_hash(cellId + vec2(91.3, 12.7)));
      vec2 point = neighbor + jitter - f;
      float d = length(point);
      if (d < nearest) {
        second = nearest;
        nearest = d;
        nearestCell = cellId;
      } else if (d < second) {
        second = d;
      }
    }
  }

  vec2 tilt = facetTilt(nearestCell) * 0.6;
  vec3 normal = normalize(vec3(tilt, 1.0));

  vec3 page = sampleOver(v_uv);

  // The sprung pointer stands in for a point light held u_light.z above the
  // plane; this pixel's own position is that plane at height 0.
  vec3 lightDir = normalize(u_light - vec3(px, 0.0));
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 halfDir = normalize(lightDir + viewDir);

  float diffuse = clamp(dot(normal, lightDir), 0.0, 1.0);
  float specular = pow(max(dot(normal, halfDir), 0.0), 40.0);
  float metalMix = clamp(u_metal, 0.0, 1.0);

  vec3 color = mix(page, u_tint.rgb * (0.4 + 0.6 * diffuse), metalMix);
  color += specular * 0.8 * (1.0 - metalMix * 0.3);

  // Crease: darken within 1.5px of a seam between two facets, smoothed
  // across that span so the edge reads anti-aliased, not a hard step.
  float edgeGap = (second - nearest) * cellSize;
  float creaseMask = 1.0 - smoothstep(0.0, 1.5, edgeGap);
  color *= 1.0 - clamp(u_crease, 0.0, 1.0) * creaseMask;

  o_color = vec4(color, 1.0);
}
`;

type FoilLayerProps = Required<
  Pick<CrushedFoilProps, "crease" | "facet" | "metal" | "tint" | "lightRadius">
> & { background?: string };

/** Walks up from the host to the first opaque background colour, so the
 * foil fills its transparent regions with the page rather than black — the
 * same probe crystal-lens and hex-floor use for their own backdrop. */
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

// Sentinel light position, far enough outside any canvas that its direction
// reads as a fixed, near-grazing rest light — the same off-screen relax
// hex-floor and dust-reveal use for their own cursor spring.
const OFFSCREEN = -9999;

/**
 * The GL layer. Owns the context, the program, the texture, the pointer
 * spring, and the frame loop; reads everything else from the surface.
 */
function FoilLayer({
  crease,
  facet,
  metal,
  tint,
  lightRadius,
  background,
}: FoilLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const x = useMotionValue<number>(OFFSCREEN);
  const y = useMotionValue<number>(OFFSCREEN);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const tintRef = React.useRef<[number, number, number, number]>([
    0.81, 0.84, 0.89, 1,
  ]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ crease, facet, metal, lightRadius });
  React.useEffect(() => {
    paramsRef.current = { crease, facet, metal, lightRadius };
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
    const bg = bgRef.current;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_facet: p.facet,
      u_crease: p.crease,
      u_metal: p.metal,
      u_tint: tintRef.current,
      u_light: [x.get(), y.get(), p.lightRadius],
      u_bg: bg,
    });
    tri.draw();
  }, [x, y]);

  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(drawFrame);
  }, [drawFrame]);

  // GL setup and teardown. The canvas only mounts once the surface is
  // active (after the first paint, and only under motion-safe conditions in
  // this replace-mode effect), so this is keyed on `surface.active`, not on
  // mount — a mount-only effect would run against no canvas at all.
  React.useEffect(() => {
    if (!surface.active) return;
    const canvas = canvasRef.current;
    if (!canvas || failedRef.current) return;
    const gl = createGL(canvas, { alpha: true, premultipliedAlpha: true });
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
    gl.blendFuncSeparate(
      gl.SRC_ALPHA,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
    );

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

  // Every motion-value change asks for a frame — the pointer spring settles
  // on its own, so this alone is the whole loop: no idle tick to gate.
  React.useEffect(() => {
    const unsubs = [x, y].map((mv) => mv.on("change", requestFrame));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [x, y, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Colours are resolved against the host once it exists, and again if the
  // caller changes them — `var(--token)` needs the host's computed style to
  // read the theme that actually applies to it.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    tintRef.current = resolveColor(tint, host);
    requestFrame();
  }, [surface.host, background, tint, requestFrame]);

  // Pointer on the host: spring the light toward the cursor, snap it in on
  // entry so the first hit never sweeps in from the offscreen sentinel, and
  // spring it back out on exit so the sheen relaxes rather than jumping.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      animate(x, event.clientX - rect.left, springs.snap);
      animate(y, event.clientY - rect.top, springs.snap);
    };
    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      x.jump(event.clientX - rect.left);
      y.jump(event.clientY - rect.top);
    };
    const leave = () => {
      animate(x, OFFSCREEN, springs.snap);
      animate(y, OFFSCREEN, springs.snap);
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
  }, [surface.host, x, y]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="crushed-foil"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface printed onto a sheet of crushed foil: a seeded Voronoi
 * facet field breaks the flat page into small planes, each tilted by its
 * own hash, and a crease darkens every seam between them. Only the light
 * moves — the sprung pointer stands in for a point source held above the
 * plane, so hovering sweeps a directional sheen and a tight specular hit
 * across facets that never themselves distort the image underneath. The
 * whole field is one hashed lattice in the fragment shader; nothing is
 * simulated or uploaded, only lit.
 * Reduced motion: replace mode renders nothing here and the real, flat DOM
 * shows in its place.
 */
export function CrushedFoil({
  crease = 0.2,
  facet = 42,
  metal = 0.3,
  tint = "#cfd6e2",
  lightRadius = 420,
  background,
  paint,
  className,
  children,
}: CrushedFoilProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <FoilLayer
          crease={crease}
          facet={facet}
          metal={metal}
          tint={tint}
          lightRadius={lightRadius}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
