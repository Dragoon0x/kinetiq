"use client";

import * as React from "react";

import {
  FULLSCREEN_VERTEX,
  GLSL_LUMA,
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
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import { clamp } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type StencilSprayProps = {
  /** Spray ink colour. CSS; resolved with `resolveColor`. @default "#2f6bff" */
  color?: string;
  /** Disc radius per coat, in CSS pixels. @default 140 */
  spread?: number;
  /** Overspray speckle strength in the thin halo past solid coverage. @default 0.6 */
  grain?: number;
  /** Coats layered onto one click — each stacks density on the last via an additive composite. @default 1 */
  coats?: number;
  /** Fill colour where a texture samples transparent; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

// The coverage map's own resolution, relative to the host's device pixels —
// a quarter, same as ice-pane's melt map.
const MAP_SCALE = 0.25;
const DPR_CAP = 2;

// Fixed per coat, per the device: enough grit to read as spray, not a
// uniform disc.
const DOT_COUNT = 140;
// How far past the disc's own radius the grit is allowed to scatter.
const DOT_SPREAD = 1.25;
// Alpha at the centre of the soft disc; it fades to 0 at its own edge.
const DISC_ALPHA = 0.55;
// Coats stack via an additive composite with no cap in the device's own
// words, but an unbounded loop per pointerdown is still a footgun — this
// bounds the per-click canvas work without changing how one coat looks.
const MAX_COATS = 8;

const FRAGMENT = /* glsl */ `
${GLSL_NOISE}
${GLSL_LUMA}
uniform sampler2D u_tex;
uniform sampler2D u_map;
uniform vec2 u_res;
uniform vec3 u_color;
uniform float u_grain;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

void main() {
  vec2 px = v_uv * u_res;
  vec4 pageTex = texture(u_tex, v_uv);
  vec3 page = mix(u_bg.rgb, pageTex.rgb, pageTex.a);
  float coverage = texture(u_map, v_uv).r;

  // The stencil: existing dark ink -- real text, real rules -- resists the
  // spray, so it reads clean under whatever coverage lands around it.
  // Nothing counts as ink where the DOM painted nothing (alpha 0) or where
  // the pixel already matches the page's own background, or the ground
  // itself would mask every click before it ever reached the shader.
  float luma = kx_luma(page);
  float nearBg = step(length(page - u_bg.rgb), 0.04);
  float hasInk = step(0.001, pageTex.a);
  float inkMask = smoothstep(0.35, 0.8, 1.0 - luma) * hasInk * (1.0 - nearBg);

  vec3 outColor = mix(page, u_color, clamp(coverage * 1.6, 0.0, 1.0) * (1.0 - inkMask));

  // Overspray: a sparse speckle in the thin halo the coats never fully
  // covered, regardless of the stencil -- real spray drifts over ink too.
  float halo = step(0.02, coverage) * (1.0 - step(0.2, coverage));
  float speckle = step(0.6, kx_hash(px));
  outColor += u_color * u_grain * halo * speckle;

  o_color = vec4(clamp(outColor, 0.0, 1.0), 1.0);
}
`;

/**
 * Deterministic 2D hash — the same shape as glsl.ts's own kx_hash, just
 * evaluated on the CPU so the coverage map's dot placement can share the
 * house formula. Never Math.random: the same click always paints the same
 * grit.
 */
function hash2(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/**
 * Sizes (or resizes) the coverage map to a quarter of the host's device
 * pixels. Assigning `width`/`height` clears a canvas's own bitmap even when
 * re-set to the same element — that native behaviour IS the "recreated on
 * host resize" the map owes ice-pane's melt map, no fresh element required.
 * A module-level helper so the mutation never lands on a ref alias inside a
 * hook body, mirroring glyph-sweep's `retainCopy`.
 */
function ensureCoverageMap(
  target: HTMLCanvasElement | null,
  hostWidth: number,
  hostHeight: number,
  dpr: number,
): { canvas: HTMLCanvasElement; cleared: boolean } {
  const width = Math.max(1, Math.round(hostWidth * dpr * MAP_SCALE));
  const height = Math.max(1, Math.round(hostHeight * dpr * MAP_SCALE));
  const canvas = target ?? document.createElement("canvas");
  const cleared = canvas.width !== width || canvas.height !== height;
  if (cleared) {
    canvas.width = width;
    canvas.height = height;
  }
  return { canvas, cleared };
}

/**
 * Paints `coats` layered passes onto `ctx` at a map-space point: a soft
 * radial disc (alpha `DISC_ALPHA` at the centre, fading to 0 at `radius`)
 * plus `DOT_COUNT` hashed 1–2px grit dots scattered within `DOT_SPREAD`
 * times that radius. Every dot's angle, distance, size, and alpha comes from
 * `hash2` seeded on the click index, the coat index, and the dot index, so
 * one click always paints the same grit. Composited with "lighter" so
 * repeat coats and overlapping clicks build density instead of replacing
 * it — the map holds no clock and never fades on its own.
 */
function paintCoverage(
  ctx: CanvasRenderingContext2D,
  mx: number,
  my: number,
  radius: number,
  coats: number,
  clickIndex: number,
): void {
  const discRadius = Math.max(radius, 0.001);
  const outer = discRadius * DOT_SPREAD;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let coat = 0; coat < coats; coat += 1) {
    const gradient = ctx.createRadialGradient(mx, my, 0, mx, my, discRadius);
    gradient.addColorStop(0, `rgba(255, 255, 255, ${DISC_ALPHA})`);
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(mx, my, discRadius, 0, Math.PI * 2);
    ctx.fill();

    for (let dot = 0; dot < DOT_COUNT; dot += 1) {
      const seed = clickIndex * 100000 + coat * (DOT_COUNT + 1) + dot;
      const angle = hash2(seed, 11.7) * Math.PI * 2;
      const t = Math.sqrt(hash2(seed, 53.3));
      const r = t * outer;
      const size = 0.5 + hash2(seed, 91.3) * 0.5;
      const alpha = 0.35 + hash2(seed, 202.1) * 0.45;
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(
        mx + Math.cos(angle) * r,
        my + Math.sin(angle) * r,
        size,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Walks up from the host to the first opaque background colour, so a
 * sample over a transparent texture region composites onto the page rather
 * than onto black. Mirrors crystal-lens's `effectiveBackground`. */
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

type SprayLayerProps = Required<
  Pick<StencilSprayProps, "color" | "spread" | "grain" | "coats">
> & { background?: string };

/**
 * The GL layer. Owns the context, the program, the page texture, the
 * coverage map (a small offscreen 2D canvas kept in a ref) and its texture;
 * reads everything else from the surface. There is no frame loop: a click
 * paints the map and asks for exactly one frame, same as a fresh page paint.
 */
function SprayLayer({
  color,
  spread,
  grain,
  coats,
  background,
}: SprayLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const colorRef = React.useRef<[number, number, number, number]>([0, 0, 0, 1]);
  const failedRef = React.useRef(false);

  // The coverage map: a quarter-resolution offscreen 2D canvas. No clock,
  // no fade — only a click (or a host resize, which clears it) changes it.
  const mapCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const mapCtxRef = React.useRef<CanvasRenderingContext2D | null>(null);
  const mapTextureRef = React.useRef<WebGLTexture | null>(null);
  // Map px per host CSS px — set whenever drawFrame (re)sizes the map, read
  // by the pointerdown handler to place a click in the map's own space.
  const mapScaleRef = React.useRef(0);
  const mapVersionRef = React.useRef(0);
  const mapUploadedVersionRef = React.useRef(0);
  const clickIndexRef = React.useRef(0);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ spread, grain, coats });
  React.useEffect(() => {
    paramsRef.current = { spread, grain, coats };
  });

  // One frame: upload the page texture and the coverage map if either has a
  // newer version than what's on the GPU, then draw. Never reschedules
  // itself — every caller asks for exactly the frame it needs.
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

    const size = resizeGL(gl, canvas, { dprCap: DPR_CAP });
    const cssW = size.width / size.dpr;
    const cssH = size.height / size.dpr;

    const { canvas: map, cleared } = ensureCoverageMap(
      mapCanvasRef.current,
      cssW,
      cssH,
      size.dpr,
    );
    if (map !== mapCanvasRef.current) {
      mapCanvasRef.current = map;
      mapCtxRef.current = map.getContext("2d");
    }
    mapScaleRef.current = size.dpr * MAP_SCALE;
    if (cleared) mapVersionRef.current += 1;

    if (mapUploadedVersionRef.current !== mapVersionRef.current) {
      // Premultiplied so the map's own alpha lands directly in the red
      // channel the shader reads as coverage — mirrors ice-pane's melt map.
      mapTextureRef.current = uploadTexture(
        gl,
        map,
        { linear: true, premultiply: true },
        mapTextureRef.current,
      );
      mapUploadedVersionRef.current = mapVersionRef.current;
    }
    const mapTexture = mapTextureRef.current;
    if (!mapTexture) return;

    const p = paramsRef.current;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.texture("u_map", mapTexture, 1);
    program.set({
      u_res: [cssW, cssH],
      u_color: [colorRef.current[0], colorRef.current[1], colorRef.current[2]],
      u_grain: p.grain,
      u_bg: bgRef.current,
    });
    tri.draw();
  }, []);

  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(drawFrame);
  }, [drawFrame]);

  // GL setup and teardown. The canvas only mounts once the surface is
  // active (after the first paint, and only under motion-safe conditions in
  // replace mode), so this is keyed on `surface.active`, not on mount — a
  // mount-only effect would run against no canvas at all.
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
    mapUploadedVersionRef.current = 0;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const detach = onContextLoss(canvas, () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      failedRef.current = true;
    });
    // A paint may already be waiting: draw it now rather than on the next
    // click.
    if (surfaceRef.current.version > 0) requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (textureRef.current) gl.deleteTexture(textureRef.current);
      textureRef.current = null;
      uploadedVersionRef.current = 0;
      if (mapTextureRef.current) gl.deleteTexture(mapTextureRef.current);
      mapTextureRef.current = null;
      mapUploadedVersionRef.current = 0;
      mapCanvasRef.current = null;
      mapCtxRef.current = null;
      mapScaleRef.current = 0;
      mapVersionRef.current = 0;
      tri.dispose();
      program.dispose();
      glRef.current = null;
      programRef.current = null;
      triRef.current = null;
    };
  }, [surface.active, requestFrame]);

  // Every completed page paint asks for exactly one frame, so the page
  // under the spray stays current.
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Colour and fill resolve against the host so a `var(--token)` picks up
  // the theme in force on this subtree.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    colorRef.current = resolveColor(color, host);
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    requestFrame();
  }, [surface.host, color, background, requestFrame]);

  // Click on the host: paint `coats` coats into the coverage map at the
  // pointer's host-relative point, then ask for the one frame that shows
  // it. No move/drag tracking — the device is a single stamp per click.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;

    const down = (event: PointerEvent) => {
      if (!surfaceRef.current.motionSafe) return;
      const mctx = mapCtxRef.current;
      const scale = mapScaleRef.current;
      if (!mctx || scale <= 0) return;
      const rect = host.getBoundingClientRect();
      const mx = (event.clientX - rect.left) * scale;
      const my = (event.clientY - rect.top) * scale;
      const p = paramsRef.current;
      const mapRadius = Math.max(p.spread, 0) * scale;
      const coatCount = clamp(Math.round(p.coats), 1, MAX_COATS);
      const clickIndex = clickIndexRef.current;
      clickIndexRef.current += 1;
      paintCoverage(mctx, mx, my, mapRadius, coatCount, clickIndex);
      mapVersionRef.current += 1;
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
      data-effect-canvas="stencil-spray"
      className="block h-full w-full"
    />
  );
}

/**
 * Paint sprays through the page rather than onto it: click the surface and
 * the click lands on an offscreen coverage map, not the DOM, then the
 * fragment shader reads that map to tint the live page toward `color`. Each
 * click stamps `coats` coats — a soft disc plus 140 hashed grit dots
 * scattered past its own edge, every dot's position and size seeded off the
 * click and dot index, so the same click always paints the same grit. The
 * page's own dark ink — real text, real rules, still real because the DOM
 * under the canvas is real — acts as a stencil that resists the spray, and
 * a faint speckle of overspray drifts past the solid coverage regardless.
 * The map holds no clock: coverage never fades on its own, only a host
 * resize clears it.
 * Reduced motion: `SurfacePaint` holds `active` false in replace mode, so
 * this layer renders nothing and the real DOM shows in its place.
 */
export function StencilSpray({
  color = "#2f6bff",
  spread = 140,
  grain = 0.6,
  coats = 1,
  background,
  paint,
  className,
  children,
}: StencilSprayProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <SprayLayer
          color={color}
          spread={spread}
          grain={grain}
          coats={coats}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
