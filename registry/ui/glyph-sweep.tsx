"use client";

import * as React from "react";

import { animate, useMotionValue } from "motion/react";

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

// Layout effects only ever run client-side here (the file is "use client"),
// but Next.js still warns about useLayoutEffect during SSR module
// evaluation — the same guard use-painted-surface.ts uses for its own.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

export type SweepDirection = "right" | "left" | "down" | "up";

export type GlyphSweepProps = {
  /** Which panel is active. Changing it retains the outgoing frame and sweeps a glyph band across to the panel at this index. */
  index: number;
  /** Which way the band sweeps across the surface. @default "right" */
  direction?: SweepDirection;
  /** Sweep duration in seconds. @default 0.9 */
  duration?: number;
  /** Width of the glyph band, in CSS pixels. @default 140 */
  band?: number;
  /** Glyph cell size, in CSS pixels. @default 10 */
  cell?: number;
  /** Glyph ramp rasterised into the atlas, ordered dense to sparse. @default "@%#*+=-:. " */
  charset?: string;
  /** Glyph ink colour, mixed with the outgoing texel's own colour. CSS; resolved with `resolveColor`. @default "var(--primary)" */
  color?: string;
  /** Fill colour where a texture samples transparent; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  /** The panels. Only the one at `index` renders into the painted DOM. */
  children: React.ReactNode[];
};

// The atlas's own raster resolution — device px per glyph cell in the strip
// texture. Independent of `cell`, which sizes the on-screen sampling grid.
const ATLAS_CELL = 16;

// uniform vec2 u_glyphs[MAX_GLYPHS] — keep in lockstep with the shader's
// array size below.
const MAX_GLYPHS = 16;

const DEFAULT_CHARSET = "@%#*+=-:. ";

// Sweep math runs along one screen axis; `sign` picks which end of it the
// band starts from.
const AXIS_BY_DIRECTION: Record<
  SweepDirection,
  { axis: number; sign: number }
> = {
  right: { axis: 0, sign: 1 },
  left: { axis: 0, sign: -1 },
  down: { axis: 1, sign: 1 },
  up: { axis: 1, sign: -1 },
};

type AtlasGlyph = {
  /** Mean alpha coverage of the rasterised glyph, 0..1. */
  coverage: number;
  /** Cell position in the atlas strip. */
  index: number;
};

type GlyphAtlas = { canvas: HTMLCanvasElement; glyphs: AtlasGlyph[] };

/**
 * Rasterises `charset` into a single-row strip, one ATLAS_CELL-square cell
 * per glyph, white ink on a transparent field so the shader can read shape
 * from alpha alone. Each glyph's mean coverage is measured back from the
 * pixels it just drew — deterministic given the charset and the resolved
 * font, never a function of the painted page. Simplified from ascii-lens's
 * atlas: coverage only, no edge glyphs — glyph-sweep picks by luminance
 * alone.
 */
function buildGlyphAtlas(charset: string, fontFamily: string): GlyphAtlas {
  const chars = Array.from(charset).slice(0, MAX_GLYPHS);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, chars.length) * ATLAS_CELL;
  canvas.height = ATLAS_CELL;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const glyphs: AtlasGlyph[] = [];
  if (!ctx) return { canvas, glyphs };

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.round(ATLAS_CELL * 0.85)}px ${fontFamily}`;

  chars.forEach((char, index) => {
    const cx = index * ATLAS_CELL + ATLAS_CELL / 2;
    const cy = ATLAS_CELL / 2;
    if (char !== " ") ctx.fillText(char, cx, cy);
    const data = ctx.getImageData(
      index * ATLAS_CELL,
      0,
      ATLAS_CELL,
      ATLAS_CELL,
    ).data;
    let sum = 0;
    for (let p = 3; p < data.length; p += 4) sum += data[p] ?? 0;
    const coverage = sum / (255 * ATLAS_CELL * ATLAS_CELL);
    glyphs.push({ coverage, index });
  });

  return { canvas, glyphs };
}

/** Flattens glyph metadata into the vec2[MAX_GLYPHS] uniform layout: coverage, index — zero-padded past the charset's real count. */
function buildGlyphUniformArray(glyphs: AtlasGlyph[]): Float32Array {
  const data = new Float32Array(MAX_GLYPHS * 2);
  glyphs.forEach((g, i) => {
    if (i >= MAX_GLYPHS) return;
    data[i * 2] = g.coverage;
    data[i * 2 + 1] = g.index;
  });
  return data;
}

/**
 * Resolves a `font-family` value that may reference `var(--font-mono)` to
 * its computed, literal form via a hidden probe parented to `host` — the
 * same trick ascii-lens's atlas builder needs, duplicated here since it
 * isn't exported.
 */
function resolveFontFamily(host: HTMLElement, value: string): string {
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.fontFamily = value;
  host.appendChild(probe);
  const resolved = getComputedStyle(probe).fontFamily;
  probe.remove();
  return resolved || value;
}

/** Walks up from the host to the first opaque background colour, so a
 * transparent texture region composites onto the real page rather than onto
 * black. Mirrors crystal-lens's and dust-reveal's own copy. */
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

const FRAGMENT = /* glsl */ `
${GLSL_NOISE}
${GLSL_LUMA}
uniform sampler2D u_prev;
uniform sampler2D u_tex;
uniform sampler2D u_atlas;
uniform vec2 u_res;
uniform float u_progress;
uniform float u_axis;
uniform float u_sign;
uniform float u_band;
uniform float u_cell;
uniform vec2 u_glyphs[${MAX_GLYPHS}];
uniform float u_glyphCount;
uniform vec3 u_color;
uniform vec4 u_bg;
uniform float u_newReady;
in vec2 v_uv;
out vec4 o_color;

const int MAX_GLYPHS = ${MAX_GLYPHS};
// How much of the ink colour replaces the outgoing texel's own colour in a
// glyph cell — dyed, not painted flat.
const float GLYPH_TINT = 0.7;
// Fraction of the band over which a cell's own flip point jitters, so the
// glyph-to-new-panel edge reads ragged rather than a straight wipe.
const float RAGGED = 0.6;

vec3 sampleOver(sampler2D tex, vec2 uv) {
  vec4 t = texture(tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  vec2 px = v_uv * u_res;
  float extent = mix(u_res.x, u_res.y, u_axis);
  float coordRaw = mix(px.x, px.y, u_axis);
  float coord = u_sign > 0.0 ? coordRaw : (extent - coordRaw);

  float halfBand = u_band * 0.5;
  float edge = u_progress * (extent + u_band) - halfBand;
  float distFromEdge = coord - edge;

  // Ahead of the band: untouched outgoing panel.
  if (distFromEdge >= halfBand) {
    o_color = vec4(sampleOver(u_prev, px / u_res), 1.0);
    return;
  }

  vec3 newColor = u_newReady > 0.5
    ? sampleOver(u_tex, px / u_res)
    : sampleOver(u_prev, px / u_res);

  // Behind the band: the incoming panel has fully taken over.
  if (distFromEdge <= -halfBand) {
    o_color = vec4(newColor, 1.0);
    return;
  }

  // Inside the band: a glyph cell, chosen by the outgoing panel's own
  // luminance at the cell centre — bright reads as a sparse glyph, dark as
  // a dense one — tinted by u_color, then blended toward the incoming panel
  // across the band with a per-cell jitter.
  float cell = max(u_cell, 1.0);
  vec2 cellCenter = (floor(px / cell) + 0.5) * cell;
  vec3 cellColor = sampleOver(u_prev, cellCenter / u_res);
  float targetCoverage = 1.0 - kx_luma(cellColor);

  float bestDist = 1e9;
  float chosen = 0.0;
  int count = int(u_glyphCount);
  for (int i = 0; i < MAX_GLYPHS; i++) {
    if (i >= count) break;
    vec2 g = u_glyphs[i];
    float d = abs(g.x - targetCoverage);
    if (d < bestDist) { bestDist = d; chosen = g.y; }
  }

  vec2 localUv = fract(px / cell);
  vec2 atlasUv = vec2((chosen + localUv.x) / max(u_glyphCount, 1.0), localUv.y);
  vec4 glyphTex = texture(u_atlas, atlasUv);
  vec3 glyphInk = mix(cellColor, u_color, GLYPH_TINT);
  vec3 glyphPixel = mix(u_bg.rgb, glyphInk, glyphTex.a);

  float bandT = (distFromEdge + halfBand) / max(u_band, 1.0);
  float jitter = kx_hash(floor(px / cell));
  float flip = mix(0.5 - RAGGED * 0.5, 0.5 + RAGGED * 0.5, jitter);
  float aa = 1.5 / max(u_band, 1.0);
  float glyphMix = smoothstep(flip - aa, flip + aa, bandT);

  o_color = vec4(mix(newColor, glyphPixel, glyphMix), 1.0);
}
`;

/** Copies the painted texture into a retained canvas (reused across sweeps) so the outgoing panel survives the DOM switch. */
function retainCopy(
  target: HTMLCanvasElement | null,
  source: HTMLCanvasElement,
): HTMLCanvasElement {
  const canvas = target ?? document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  canvas.getContext("2d")?.drawImage(source, 0, 0);
  return canvas;
}

type SweepLayerProps = Required<
  Pick<
    GlyphSweepProps,
    "index" | "direction" | "duration" | "band" | "cell" | "charset" | "color"
  >
> & { background?: string };

/**
 * The GL layer. Owns the context, the program, the outgoing/incoming page
 * textures, the glyph atlas, and the frame loop; reads everything else from
 * the surface. `index` is the only trigger for a sweep — no idle ticking
 * between them.
 */
function SweepLayer({
  index,
  direction,
  duration,
  band,
  cell,
  charset,
  color,
  background,
}: SweepLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // 1 = fully settled on the incoming panel — the steady state between
  // sweeps, and the correct value before any sweep has ever run.
  const progress = useMotionValue<number>(1);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const prevCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const prevTextureRef = React.useRef<WebGLTexture | null>(null);
  const prevCaptureIdRef = React.useRef(0);
  const prevUploadedIdRef = React.useRef(0);
  const atlasTextureRef = React.useRef<WebGLTexture | null>(null);
  const atlasRef = React.useRef<GlyphAtlas | null>(null);
  const atlasBuildIdRef = React.useRef(0);
  const atlasUploadedIdRef = React.useRef(0);
  const colorRgbRef = React.useRef<[number, number, number, number]>([
    1, 1, 1, 1,
  ]);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const frameRef = React.useRef<number | null>(null);
  const failedRef = React.useRef(false);

  const prevIndexRef = React.useRef(index);
  const sweepControlsRef = React.useRef<ReturnType<typeof animate> | null>(
    null,
  );
  // Whether u_tex already holds the incoming panel's own paint. False from
  // the moment a sweep starts until the painter lands a version newer than
  // the one in force when it started.
  const newReadyRef = React.useRef(true);
  const sweepStartVersionRef = React.useRef(0);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });

  const axisSign = AXIS_BY_DIRECTION[direction];
  const paramsRef = React.useRef({
    band,
    cell,
    axis: axisSign.axis,
    sign: axisSign.sign,
  });
  React.useEffect(() => {
    paramsRef.current = {
      band,
      cell,
      axis: axisSign.axis,
      sign: axisSign.sign,
    };
  });

  // One frame: upload whatever textures landed since the last draw, then
  // composite the outgoing texture, the glyph band, and the incoming
  // texture in a single pass.
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

    if (!newReadyRef.current && live.version > sweepStartVersionRef.current) {
      newReadyRef.current = true;
    }

    if (
      prevUploadedIdRef.current !== prevCaptureIdRef.current &&
      prevCanvasRef.current
    ) {
      prevTextureRef.current = uploadTexture(
        gl,
        prevCanvasRef.current,
        { linear: true, wrap: "clamp" },
        prevTextureRef.current,
      );
      prevUploadedIdRef.current = prevCaptureIdRef.current;
    }
    // Before the first sweep nothing has been retained yet. Falling back to
    // the current texture is harmless — at progress 1 the shader never
    // actually samples u_prev.
    const prevTexture = prevTextureRef.current ?? texture;

    const atlas = atlasRef.current;
    if (!atlas || atlas.glyphs.length === 0) return;
    if (atlasUploadedIdRef.current !== atlasBuildIdRef.current) {
      atlasTextureRef.current = uploadTexture(
        gl,
        atlas.canvas,
        { linear: false, wrap: "clamp" },
        atlasTextureRef.current,
      );
      const location = program.uniforms.u_glyphs;
      if (location) {
        gl.useProgram(program.program);
        gl.uniform2fv(location, buildGlyphUniformArray(atlas.glyphs));
      }
      atlasUploadedIdRef.current = atlasBuildIdRef.current;
    }
    const atlasTexture = atlasTextureRef.current;
    if (!atlasTexture) return;

    const size = resizeGL(gl, canvas, { dprCap: 2 });
    const cssW = size.width / size.dpr;
    const cssH = size.height / size.dpr;
    const p = paramsRef.current;
    const bg = bgRef.current;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_prev", prevTexture, 0);
    program.texture("u_tex", texture, 1);
    program.texture("u_atlas", atlasTexture, 2);
    program.set({
      u_res: [cssW, cssH],
      u_progress: progress.get(),
      u_axis: p.axis,
      u_sign: p.sign,
      u_band: p.band,
      u_cell: p.cell,
      u_glyphCount: atlas.glyphs.length,
      u_color: [
        colorRgbRef.current[0],
        colorRgbRef.current[1],
        colorRgbRef.current[2],
      ],
      u_bg: bg,
      u_newReady: newReadyRef.current ? 1 : 0,
    });
    tri.draw();
  }, [progress]);

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
    prevUploadedIdRef.current = 0;
    atlasUploadedIdRef.current = 0;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const detach = onContextLoss(canvas, () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      failedRef.current = true;
    });
    // A paint (or a retained frame) may already be waiting: draw it now
    // rather than on the next index change.
    if (surfaceRef.current.version > 0) requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (textureRef.current) gl.deleteTexture(textureRef.current);
      textureRef.current = null;
      uploadedVersionRef.current = 0;
      if (prevTextureRef.current) gl.deleteTexture(prevTextureRef.current);
      prevTextureRef.current = null;
      prevUploadedIdRef.current = 0;
      if (atlasTextureRef.current) gl.deleteTexture(atlasTextureRef.current);
      atlasTextureRef.current = null;
      atlasUploadedIdRef.current = 0;
      tri.dispose();
      program.dispose();
      glRef.current = null;
      programRef.current = null;
      triRef.current = null;
    };
  }, [surface.active, requestFrame]);

  // The sweep's own progress and every completed paint ask for a frame —
  // nothing else does, so the loop is silent between sweeps.
  React.useEffect(() => {
    const unsubscribe = progress.on("change", requestFrame);
    return unsubscribe;
  }, [progress, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Build the glyph atlas once per charset (and once the host exists, so
  // --font-mono can be resolved through the real cascade).
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const fontFamily = resolveFontFamily(host, "var(--font-mono)");
    atlasRef.current = buildGlyphAtlas(charset, fontFamily);
    atlasBuildIdRef.current += 1;
    requestFrame();
  }, [surface.host, charset, requestFrame]);

  // Resolve the ink colour through the real cascade — `var(--primary)`
  // needs the host's own theme scope, not the document root's.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    colorRgbRef.current = resolveColor(color, host);
    requestFrame();
  }, [surface.host, color, requestFrame]);

  // Resolve the fill colour for wherever a texture samples transparent.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    requestFrame();
  }, [surface.host, background, requestFrame]);

  // The sweep trigger: retain the outgoing frame the moment `index`
  // changes, then run `progress` 0 → 1. A layout effect so the retain runs
  // synchronously against the pre-swap paint, in the same tick React
  // committed the new panel — before the painter has had a chance to
  // repaint over it.
  useIsomorphicLayoutEffect(() => {
    const fromIndex = prevIndexRef.current;
    prevIndexRef.current = index;
    if (fromIndex === index) return;

    sweepControlsRef.current?.stop();
    const live = surfaceRef.current;
    if (!live.canvas || !live.motionSafe) {
      // Nothing painted yet, or reduced motion (the layer renders nothing
      // regardless of what happens here) — land on the incoming panel with
      // no sweep to run.
      progress.jump(1);
      newReadyRef.current = true;
      return;
    }

    prevCanvasRef.current = retainCopy(prevCanvasRef.current, live.canvas);
    prevCaptureIdRef.current += 1;

    newReadyRef.current = false;
    sweepStartVersionRef.current = live.version;

    progress.jump(0);
    sweepControlsRef.current = animate(progress, 1, {
      duration,
      ease: "easeInOut",
      onComplete: () => {
        // Safety net: the painter should already have repainted the
        // incoming panel well before the sweep finishes, but if it somehow
        // has not, stop waiting on it rather than hold the far side of the
        // band on stale pixels forever.
        if (!newReadyRef.current) {
          newReadyRef.current = true;
          requestFrame();
        }
      },
    });
    requestFrame();
  }, [index, duration, progress, requestFrame]);

  // A sweep in flight must not outlive the component.
  React.useEffect(
    () => () => {
      sweepControlsRef.current?.stop();
    },
    [],
  );

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="glyph-sweep"
      className="block h-full w-full"
    />
  );
}

/**
 * A transition between panels: change `index` and a band of glyphs sweeps
 * across the surface, dissolving the outgoing panel into type at its
 * leading edge while the incoming one sets in crisp behind it. Only the
 * active panel ever renders into the painted DOM — the outgoing texture is
 * retained into its own canvas the instant `index` changes, before the
 * painter has redrawn anything, so the sweep never waits on a paint to
 * start. Each glyph cell is chosen by the outgoing frame's own luminance at
 * that cell (bright reads as a sparse glyph, dark as a dense one) and
 * tinted with `color`; a per-cell hash offsets exactly when each cell gives
 * way to the incoming panel, so the trailing edge reads ragged rather than
 * a straight wipe.
 * Reduced motion: panels swap instantly with no sweep, and this layer
 * renders nothing — the real DOM shows the active panel directly.
 */
export function GlyphSweep({
  index,
  direction = "right",
  duration = 0.9,
  band = 140,
  cell = 10,
  charset = DEFAULT_CHARSET,
  color = "var(--primary)",
  background,
  paint,
  className,
  children,
}: GlyphSweepProps) {
  const activeIndex =
    children.length > 0 ? clamp(index, 0, children.length - 1) : 0;

  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <SweepLayer
          index={activeIndex}
          direction={direction}
          duration={duration}
          band={band}
          cell={cell}
          charset={charset}
          color={color}
          background={background}
        />
      }
    >
      {children[activeIndex] ?? null}
    </SurfacePaint>
  );
}
