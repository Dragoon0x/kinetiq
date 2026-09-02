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

export type AsciiLensCharset = "ascii" | "blocks" | "binary";

export type AsciiLensProps = {
  /** Lens radius in CSS pixels. @default 180 */
  radius?: number;
  /** Feather width at the rim, as a fraction of the radius (0..1) — the zone that dissolves from page to glyphs. @default 0.5 */
  softness?: number;
  /** Screen-space size of one glyph cell, in CSS pixels. @default 10 */
  cell?: number;
  /** Which ramp draws the surface. @default "ascii" */
  charset?: AsciiLensCharset;
  /** Ink colour, mixed with the page's own sampled colour by `tint`. CSS; resolved with `resolveColor`. @default "var(--primary)" */
  color?: string;
  /** How much of `color` replaces the sampled page colour (0 = page colour only, 1 = pure `color`). @default 0.6 */
  tint?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

// The atlas's own raster resolution — device px per glyph cell in the
// strip texture. Independent of `cell`, which sizes the on-screen sampling
// grid; the atlas is stretched (bilinear) to fit whatever `cell` is.
const ATLAS_CELL = 16;

// uniform vec4 u_glyphs[MAX_GLYPHS] — keep in lockstep with the shader's
// array size below.
const MAX_GLYPHS = 24;

type EdgeGlyph = { char: string; angle: number };
type CharsetSpec = { ramp: string[]; edges: EdgeGlyph[] };

// Fixed ramps, one per charset. `ascii` also carries a slash family so
// strong edges can be drawn along their own direction rather than only by
// how dark or light they are. Edge angles are the stroke's characteristic
// gradient direction (the direction luminance changes across the stroke),
// mod PI since an edge and its reverse look identical.
const CHARSETS: Record<AsciiLensCharset, CharsetSpec> = {
  ascii: {
    ramp: [" ", ".", ":", "-", "=", "+", "*", "#", "%", "@"],
    edges: [
      { char: "-", angle: Math.PI / 2 },
      { char: "|", angle: 0 },
      { char: "/", angle: Math.PI / 4 },
      { char: "\\", angle: (Math.PI * 3) / 4 },
    ],
  },
  blocks: { ramp: [" ", "░", "▒", "▓", "█"], edges: [] },
  binary: { ramp: [" ", "0", "1"], edges: [] },
};

type AtlasGlyph = {
  /** Mean alpha coverage of the rasterised glyph, 0..1. */
  coverage: number;
  /** Characteristic gradient angle in radians, mod PI. Meaningless unless hasAngle. */
  angle: number;
  hasAngle: 0 | 1;
  /** Cell position in the atlas strip. */
  index: number;
};

type GlyphAtlas = { canvas: HTMLCanvasElement; glyphs: AtlasGlyph[] };

/**
 * Rasterises a charset's ramp + edge glyphs into a single-row strip, one
 * ATLAS_CELL-square cell per glyph, white ink on a transparent field so the
 * shader can read shape from alpha alone. Each glyph's mean coverage is
 * measured back from the pixels it just drew — deterministic given the
 * charset and the resolved font, never a function of the painted page.
 */
function buildAtlas(charset: AsciiLensCharset, fontFamily: string): GlyphAtlas {
  const spec = CHARSETS[charset];
  const chars = [
    ...spec.ramp.map((char) => ({ char, angle: 0, hasAngle: 0 as const })),
    ...spec.edges.map((e) => ({
      char: e.char,
      angle: e.angle,
      hasAngle: 1 as const,
    })),
  ].slice(0, MAX_GLYPHS);

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
  ctx.font = `600 ${Math.round(ATLAS_CELL * 0.85)}px ${fontFamily}`;

  chars.forEach((c, index) => {
    const cx = index * ATLAS_CELL + ATLAS_CELL / 2;
    const cy = ATLAS_CELL / 2;
    if (c.char !== " ") ctx.fillText(c.char, cx, cy);
    const data = ctx.getImageData(
      index * ATLAS_CELL,
      0,
      ATLAS_CELL,
      ATLAS_CELL,
    ).data;
    let sum = 0;
    for (let p = 3; p < data.length; p += 4) sum += data[p] ?? 0;
    const coverage = sum / (255 * ATLAS_CELL * ATLAS_CELL);
    glyphs.push({ coverage, angle: c.angle, hasAngle: c.hasAngle, index });
  });

  return { canvas, glyphs };
}

/** Flattens glyph metadata into the vec4[MAX_GLYPHS] uniform layout: coverage, angle, hasAngle, index — zero-padded past the charset's real count. */
function buildGlyphUniformArray(glyphs: AtlasGlyph[]): Float32Array {
  const data = new Float32Array(MAX_GLYPHS * 4);
  glyphs.forEach((g, i) => {
    if (i >= MAX_GLYPHS) return;
    data[i * 4] = g.coverage;
    data[i * 4 + 1] = g.angle;
    data[i * 4 + 2] = g.hasAngle;
    data[i * 4 + 3] = g.index;
  });
  return data;
}

/**
 * Resolves a CSS value that may reference custom properties (`var(--x)`) to
 * its computed, literal form. A bare `getPropertyValue` read of a custom
 * property returns its unexpanded token text — `--primary` on this repo's
 * tokens is itself `var(--accent)` — so this sets the value on a hidden
 * probe parented to `host` and reads back what the real cascade resolved it
 * to, the same trick `resolveColor`'s callers need for tokenised colours.
 */
function resolveCssValue(
  host: HTMLElement,
  property: "color" | "fontFamily",
  value: string,
): string {
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  if (property === "color") probe.style.color = value;
  else probe.style.fontFamily = value;
  host.appendChild(probe);
  const resolved = getComputedStyle(probe)[property];
  probe.remove();
  return resolved || value;
}

/** Walks up from the host to the first opaque background colour, so page
 * samples over transparent texture regions composite onto the real page
 * rather than onto black. Mirrors crystal-lens's `effectiveBackground`. */
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
${GLSL_LUMA}
uniform sampler2D u_tex;
uniform sampler2D u_atlas;
uniform vec2 u_res;
uniform vec3 u_lens;
uniform float u_softness;
uniform float u_cell;
uniform vec4 u_glyphs[${MAX_GLYPHS}];
uniform float u_glyphCount;
uniform vec3 u_color;
uniform float u_tint;
uniform float u_opacity;
uniform float u_still;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

const int MAX_GLYPHS = ${MAX_GLYPHS};
const float PI = 3.14159265359;
const float EDGE_THRESHOLD = 0.2;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

float angularDist(float a, float b) {
  float d = mod(abs(a - b), PI);
  return min(d, PI - d);
}

void main() {
  vec2 px = v_uv * u_res;
  // Reduced motion draws the whole surface regardless of where the lens
  // centre sits (it defaults off-screen until the first pointer event) —
  // so the mask short-circuits to fully open rather than reasoning about
  // distance from a point that may never have been set.
  float mask = 1.0;
  if (u_still <= 0.5) {
    float r = length(px - u_lens.xy);
    float R = max(u_lens.z, 1.0);
    float feather = clamp(u_softness, 0.0, 1.0) * R;
    mask = 1.0 - smoothstep(max(R - feather, 0.0), R, r);
  }
  if (mask <= 0.0) { o_color = vec4(0.0); return; }

  float cell = max(u_cell, 1.0);
  vec2 cellCenter = (floor(px / cell) + 0.5) * cell;
  vec2 hx = vec2(cell * 0.5, 0.0);
  vec2 hy = vec2(0.0, cell * 0.5);

  vec3 cCenter = sampleOver(cellCenter / u_res);
  float lumaC = kx_luma(cCenter);
  float dx = kx_luma(sampleOver((cellCenter + hx) / u_res))
           - kx_luma(sampleOver((cellCenter - hx) / u_res));
  float dy = kx_luma(sampleOver((cellCenter + hy) / u_res))
           - kx_luma(sampleOver((cellCenter - hy) / u_res));
  float edgeStrength = length(vec2(dx, dy));

  float bgLuma = kx_luma(u_bg.rgb);
  float coverage = bgLuma < 0.5 ? lumaC : (1.0 - lumaC);
  float ga = mod(atan(dy, dx), PI);

  // Single pass: track the closest ramp glyph (by coverage) and the
  // closest edge glyph (by angle) at once. i is the canonical bounded
  // for-loop counter, so u_glyphs[i] stays a portable, statically
  // analysable index — never a runtime-computed subscript.
  float bestRampDist = 1e9;
  float rampIndex = 0.0;
  float bestEdgeDist = 1e9;
  float edgeIndex = -1.0;
  int count = int(u_glyphCount);
  for (int i = 0; i < MAX_GLYPHS; i++) {
    if (i >= count) break;
    vec4 g = u_glyphs[i];
    if (g.z > 0.5) {
      float d = angularDist(ga, g.y);
      if (d < bestEdgeDist) { bestEdgeDist = d; edgeIndex = g.w; }
    } else {
      float d = abs(g.x - coverage);
      if (d < bestRampDist) { bestRampDist = d; rampIndex = g.w; }
    }
  }
  float chosen = (edgeStrength > EDGE_THRESHOLD && edgeIndex >= 0.0)
    ? edgeIndex
    : rampIndex;

  vec2 localUv = fract(px / cell);
  vec2 atlasUv = vec2((chosen + localUv.x) / max(u_glyphCount, 1.0), localUv.y);
  vec4 glyph = texture(u_atlas, atlasUv);

  vec3 tinted = mix(cCenter, u_color, clamp(u_tint, 0.0, 1.0));
  // The lens is opaque: the page is covered by its own background and set
  // again in glyphs, so type reads as type rather than as noise over type.
  o_color = vec4(mix(u_bg.rgb, tinted, glyph.a), mask * u_opacity);
}
`;

type LensLayerProps = Required<
  Pick<
    AsciiLensProps,
    "radius" | "softness" | "cell" | "charset" | "color" | "tint"
  >
>;

/**
 * The GL layer. Owns the context, the program, the page texture, the glyph
 * atlas texture, the pointer spring, and the frame loop; reads everything
 * else from the surface.
 */
function LensLayer({
  radius,
  softness,
  cell,
  charset,
  color,
  tint,
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
  const atlasTextureRef = React.useRef<WebGLTexture | null>(null);
  const atlasRef = React.useRef<GlyphAtlas | null>(null);
  const atlasBuildIdRef = React.useRef(0);
  const atlasUploadedIdRef = React.useRef(0);
  const colorRgbRef = React.useRef<[number, number, number, number]>([
    1, 1, 1, 1,
  ]);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ radius, softness, cell, tint });
  React.useEffect(() => {
    paramsRef.current = { radius, softness, cell, tint };
  }, [radius, softness, cell, tint]);

  // One frame: upload textures if anything new landed, then draw.
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

    const atlas = atlasRef.current;
    if (!atlas || atlas.glyphs.length === 0) return;
    if (atlasUploadedIdRef.current !== atlasBuildIdRef.current) {
      // Nearest, not linear: atlas cells sit edge-to-edge with no gutter,
      // so bilinear filtering would bleed each glyph into its neighbour at
      // the cell boundary. Crisp cells also suit the character-grid look.
      atlasTextureRef.current = uploadTexture(
        gl,
        atlas.canvas,
        { linear: false, wrap: "clamp" },
        atlasTextureRef.current,
      );
      const location = program.uniforms.u_glyphs;
      if (location) {
        gl.useProgram(program.program);
        gl.uniform4fv(location, buildGlyphUniformArray(atlas.glyphs));
      }
      atlasUploadedIdRef.current = atlasBuildIdRef.current;
    }
    const atlasTexture = atlasTextureRef.current;
    if (!atlasTexture) return;

    const size = resizeGL(gl, canvas, { dprCap: 2 });
    const cssW = size.width / size.dpr;
    const cssH = size.height / size.dpr;
    const p = paramsRef.current;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.texture("u_atlas", atlasTexture, 1);
    program.set({
      u_res: [cssW, cssH],
      u_lens: [x.get(), y.get(), p.radius],
      u_softness: p.softness,
      u_cell: p.cell,
      u_glyphCount: atlas.glyphs.length,
      u_color: [
        colorRgbRef.current[0],
        colorRgbRef.current[1],
        colorRgbRef.current[2],
      ],
      u_tint: p.tint,
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
    atlasUploadedIdRef.current = 0;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const detach = onContextLoss(canvas, () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      failedRef.current = true;
    });
    // A paint (or an atlas) may already be waiting: draw it now rather
    // than on the next pointer move.
    if (surfaceRef.current.version > 0) requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (textureRef.current) gl.deleteTexture(textureRef.current);
      textureRef.current = null;
      uploadedVersionRef.current = 0;
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

  // Build the glyph atlas once per charset (and once the host exists, so
  // --font-mono can be resolved through the real cascade). Independent of
  // GL readiness — drawFrame simply waits for both.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const fontFamily = resolveCssValue(host, "fontFamily", "var(--font-mono)");
    atlasRef.current = buildAtlas(charset, fontFamily);
    atlasBuildIdRef.current += 1;
    requestFrame();
  }, [surface.host, charset, requestFrame]);

  // Resolve the ink colour through the real cascade too — `var(--primary)`
  // is itself `var(--accent)`, so a bare custom-property read would hand a
  // still-unexpanded string to resolveColor.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    colorRgbRef.current = resolveColor(resolveCssValue(host, "color", color));
    requestFrame();
  }, [surface.host, color, requestFrame]);

  // Pointer on the host: spring the lens, fade in and out on enter/leave.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host);

    const still = !surfaceRef.current.motionSafe;
    if (still) {
      // Reduced motion: the whole surface renders as glyphs immediately —
      // a legible still frame, not something that waits on a hover.
      opacity.set(1);
    }

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
      if (!still) animate(opacity, 1, { duration: 0.18 });
    };
    const leave = () => {
      if (!still) animate(opacity, 0, { duration: 0.22 });
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
      data-effect-canvas="ascii-lens"
      className="block h-full w-full"
    />
  );
}

/**
 * A soft lens that follows the cursor and redraws the interface beneath it
 * as type. Each screen cell samples the painted texture's luminance and
 * local gradient, then picks a glyph from a fixed atlas by shape — an edge
 * glyph when the gradient is strong and points its way, otherwise the
 * coverage-ramp glyph nearest the cell's brightness — never by brightness
 * alone. Outside the lens the page shows untouched, and the DOM stays real
 * under the glass: every control still clicks, focuses, and types like
 * itself, because the glyphs are only ever drawn over it, never in place of
 * it.
 * Reduced motion: the whole surface renders as a still field of glyphs, no
 * lens and no spring — a legible frame rather than a frozen distortion.
 */
export function AsciiLens({
  radius = 180,
  softness = 0.5,
  cell = 10,
  charset = "ascii",
  color = "var(--primary)",
  tint = 0.6,
  paint,
  className,
  children,
}: AsciiLensProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn("cursor-none", className)}
      effect={
        <LensLayer
          radius={radius}
          softness={softness}
          cell={cell}
          charset={charset}
          color={color}
          tint={tint}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
