"use client";

import * as React from "react";

import { useMotionValue } from "motion/react";

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
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type TypeRainProps = {
  /** Glyph cell size in CSS pixels. @default 14 */
  cell?: number;
  /** Chance a given column rains at all (0..1) — a pure hash of the column index, never re-rolled. @default 0.8 */
  density?: number;
  /** Fall speed multiplier. @default 1 */
  speed?: number;
  /** Stream length in cells, from the bright head to where the trail fades to nothing. @default 12 */
  length?: number;
  /** Glyph ink colour; resolved with resolveColor against the host so var() tokens read the right theme. @default "var(--primary)" */
  color?: string;
  /** Head brightness multiplier; above 1 the head pops toward white. @default 1 */
  glow?: number;
  /** How far the untouched page sinks toward the background colour — 0.6 leaves it at 40% presence. @default 0.6 */
  dim?: number;
  /** Characters a stream can flicker through. @default digits, upper-case latin, a few symbols */
  charset?: string;
  /** Radius in CSS pixels around the pointer where the rain clears and the page shows through lit. @default 80 */
  repel?: number;
  /** Fill colour override for the dimmed page; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

// Katakana-free by design: digits, upper-case latin, a small symbol set.
const DEFAULT_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ+=-*#%$@";

// The atlas's own raster resolution — device px per glyph cell in the strip
// texture. Independent of `cell`, which sizes the on-screen sampling grid.
const ATLAS_CELL = 28;

type GlyphAtlas = { canvas: HTMLCanvasElement; count: number };

/**
 * Rasterises the charset into a single-row strip, one ATLAS_CELL-square cell
 * per glyph, white ink on a transparent field so the shader reads shape from
 * alpha alone — ascii-lens's atlas approach, without the coverage/angle
 * bookkeeping a lens needs and a rain does not: a glyph here is chosen by a
 * seeded hash, never by matching the page underneath.
 */
function buildGlyphAtlas(charset: string, fontFamily: string): GlyphAtlas {
  const chars = charset.length > 0 ? [...charset] : [" "];
  const canvas = document.createElement("canvas");
  canvas.width = chars.length * ATLAS_CELL;
  canvas.height = ATLAS_CELL;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { canvas, count: chars.length };

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${Math.round(ATLAS_CELL * 0.8)}px ${fontFamily}`;
  chars.forEach((char, index) => {
    if (char === " ") return;
    const cx = index * ATLAS_CELL + ATLAS_CELL / 2;
    const cy = ATLAS_CELL / 2;
    ctx.fillText(char, cx, cy);
  });
  return { canvas, count: chars.length };
}

/**
 * Resolves "var(--font-mono)" through the real cascade on `host`, mirroring
 * ascii-lens's resolveCssValue trick: a bare custom-property read hands back
 * unexpanded token text, so this sets the value on a hidden probe parented
 * to `host` and reads back what the cascade actually resolved it to.
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

/** Walks up from the host to the first opaque background colour, so a page
 * sample over a transparent texture region composites onto the real page
 * rather than onto black. Mirrors crystal-lens and dust-reveal's own copy. */
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
uniform sampler2D u_tex;
uniform sampler2D u_atlas;
uniform vec2 u_res;
uniform vec2 u_pointer;
uniform float u_tick;
uniform float u_cell;
uniform float u_density;
uniform float u_speed;
uniform float u_length;
uniform float u_glow;
uniform float u_dim;
uniform float u_repel;
uniform vec3 u_color;
uniform float u_glyphCount;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// A column's own hash, decorrelated per use by a fixed seed offset so the
// rain gate, the phase, and the speed variance never share one value.
float columnHash(float cx, float seed) {
  return kx_hash(vec2(cx, seed));
}

void main() {
  vec2 px = v_uv * u_res;
  float cell = max(u_cell, 1.0);
  vec2 cellIndex = floor(px / cell);
  float cx = cellIndex.x;
  float cy = cellIndex.y;
  float rows = u_res.y / cell;

  // Whether this column rains at all — a fixed hash of its own index.
  float gate = columnHash(cx, 0.0);
  bool columnActive = gate < clamp(u_density, 0.0, 1.0);

  // Head position in cells: staggered entry (fract of a per-column phase
  // plus time), scaled across (rows + streamLength) then shifted back by
  // streamLength so every stream starts above row 0 and finishes below the
  // last row.
  float phase = columnHash(cx, 11.0);
  float speedVariance = columnHash(cx, 37.0);
  float streamLength = max(u_length, 1.0);
  float head = fract(phase + u_tick * u_speed * (0.6 + 0.8 * speedVariance))
    * (rows + streamLength) - streamLength;

  float behind = head - cy;
  bool inStream = behind >= 0.0 && behind < streamLength;
  float falloff = clamp(1.0 - behind / streamLength, 0.0, 1.0);
  float brightness = (columnActive && inStream) ? falloff * max(u_glow, 0.0) : 0.0;

  // Pointer repel: near the pointer the stream itself goes dark, and the
  // page is forced to show fully lit regardless of what the stream is
  // doing there — the pointer clears a window.
  float distPointer = length(px - u_pointer);
  float repel = max(u_repel, 0.0);
  float pointerMask = smoothstep(max(repel - 24.0, 0.0), repel + 1.0, distPointer);
  brightness *= pointerMask;

  vec3 pageColor = sampleOver(px / u_res);
  vec3 dimmed = mix(pageColor, u_bg.rgb, clamp(u_dim, 0.0, 1.0));
  float litWeight = max(clamp(brightness, 0.0, 1.0), 1.0 - pointerMask);
  float extraGlow = clamp(brightness - 1.0, 0.0, 2.0);
  vec3 litBg = mix(dimmed, pageColor, litWeight);
  litBg = mix(litBg, vec3(1.0), extraGlow * 0.6);

  // Glyph choice flickers slowly: the flicker slot changes a few times a
  // second, offset per column so columns never flicker in lockstep.
  float flickerSeed = columnHash(cx, 5.0);
  float slot = floor(u_tick * 3.0 + flickerSeed);
  float glyphSeed = kx_hash(vec2(cx * 12.9898 + cy * 78.233, slot));
  float glyphCount = max(u_glyphCount, 1.0);
  float glyphIndex = clamp(floor(glyphSeed * glyphCount), 0.0, glyphCount - 1.0);

  vec2 localUv = fract(px / cell);
  vec2 atlasUv = vec2((glyphIndex + localUv.x) / glyphCount, localUv.y);
  vec4 glyph = texture(u_atlas, atlasUv);

  vec3 glyphTint = mix(u_color, vec3(1.0), clamp(extraGlow, 0.0, 1.0));
  float glyphAlpha = glyph.a * clamp(brightness, 0.0, 1.0);

  vec3 finalColor = mix(litBg, glyphTint, glyphAlpha);
  o_color = vec4(finalColor, 1.0);
}
`;

type RainLayerProps = Required<
  Pick<
    TypeRainProps,
    | "cell"
    | "density"
    | "speed"
    | "length"
    | "color"
    | "glow"
    | "dim"
    | "charset"
    | "repel"
  >
> & { background?: string };

// Sentinel pointer position, far enough outside any canvas that the repel
// radius never reaches it.
const OFFSCREEN = -9999;

/**
 * The GL layer. Owns the context, the program, the page texture, the glyph
 * atlas texture, the pointer position, the clock, and the frame loop; reads
 * everything else from the surface.
 */
function RainLayer({
  cell,
  density,
  speed,
  length,
  color,
  glow,
  dim,
  charset,
  repel,
  background,
}: RainLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const x = useMotionValue<number>(OFFSCREEN);
  const y = useMotionValue<number>(OFFSCREEN);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const atlasTextureRef = React.useRef<WebGLTexture | null>(null);
  const atlasRef = React.useRef<GlyphAtlas | null>(null);
  const atlasBuildIdRef = React.useRef(0);
  const atlasUploadedIdRef = React.useRef(0);
  const colorRgbRef = React.useRef<[number, number, number]>([1, 1, 1]);
  const frameRef = React.useRef<number | null>(null);
  const tickRef = React.useRef(0);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({
    cell,
    density,
    speed,
    length,
    glow,
    dim,
    repel,
  });
  React.useEffect(() => {
    paramsRef.current = { cell, density, speed, length, glow, dim, repel };
  });

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
    if (!atlas || atlas.count === 0) return;
    if (atlasUploadedIdRef.current !== atlasBuildIdRef.current) {
      // Nearest, not linear: atlas cells sit edge-to-edge with no gutter, so
      // bilinear filtering would bleed each glyph into its neighbour.
      atlasTextureRef.current = uploadTexture(
        gl,
        atlas.canvas,
        { linear: false, wrap: "clamp" },
        atlasTextureRef.current,
      );
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
    program.texture("u_tex", texture, 0);
    program.texture("u_atlas", atlasTexture, 1);
    program.set({
      u_res: [cssW, cssH],
      u_pointer: [x.get(), y.get()],
      u_tick: tickRef.current,
      u_cell: p.cell,
      u_density: p.density,
      u_speed: p.speed,
      u_length: p.length,
      u_glow: p.glow,
      u_dim: p.dim,
      u_repel: p.repel,
      u_color: colorRgbRef.current,
      u_glyphCount: atlas.count,
      u_bg: bg,
    });
    tri.draw();
  }, [x, y]);

  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(drawFrame);
  }, [drawFrame]);

  // GL setup and teardown. The canvas only mounts once the surface is
  // active (after the first paint, and only under motion-safe conditions —
  // this effect is a replace-mode layer), so this is keyed on
  // `surface.active`, not on mount: a mount-only effect would run against no
  // canvas at all.
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
    atlasUploadedIdRef.current = 0;
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
    // A paint (or an atlas) may already be waiting: draw it now rather than
    // on the next tick.
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

  // Every motion-value change and every completed paint asks for a frame —
  // covers the pointer moving even while the idle loop below happens to be
  // between ticks.
  React.useEffect(() => {
    const unsubs = [x, y].map((mv) => mv.on("change", requestFrame));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [x, y, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // The continuous loop: a rAF tick that advances `u_tick` and redraws every
  // frame while the surface is visible — streams never stop falling on
  // their own. Gated by IntersectionObserver and visibilitychange, exactly
  // dust-reveal's idle-drift loop shape, minus the "nothing to animate"
  // bail-out: rain has no still state to fall back to.
  React.useEffect(() => {
    if (!surface.active) return;
    const host = surface.host;
    if (!host) return;

    let raf = 0;
    let started: number | null = null;
    let pausedAt: number | null = null;
    let inView = false;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (started === null) started = now;
      tickRef.current = (now - started) / 1000;
      drawFrame();
    };

    const syncLoop = () => {
      const shouldRun = inView && !document.hidden;
      if (shouldRun && raf === 0) {
        // Rebase the clock over the pause so the rain resumes, not jumps.
        if (started !== null && pausedAt !== null) {
          started += performance.now() - pausedAt;
        }
        pausedAt = null;
        raf = requestAnimationFrame(tick);
      } else if (!shouldRun && raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
        pausedAt = performance.now();
      }
    };

    const intersection = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) inView = last.isIntersecting;
      syncLoop();
    });
    intersection.observe(host);
    const onVisibility = () => syncLoop();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [surface.active, surface.host, drawFrame]);

  // Build the glyph atlas once per charset (and once the host exists, so
  // --font-mono can be resolved through the real cascade). Independent of
  // GL readiness — drawFrame simply waits for both.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const fontFamily = resolveFontFamily(host, "var(--font-mono)");
    atlasRef.current = buildGlyphAtlas(charset, fontFamily);
    atlasBuildIdRef.current += 1;
    requestFrame();
  }, [surface.host, charset, requestFrame]);

  // Resolve the ink colour through the real cascade too — `var(--primary)`
  // is itself a token, so a bare custom-property read would hand a
  // still-unexpanded string to the shader.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const rgba = resolveColor(color, host);
    colorRgbRef.current = [rgba[0], rgba[1], rgba[2]];
    requestFrame();
  }, [surface.host, color, requestFrame]);

  // Pointer on the host: track it directly, no spring — the repel window
  // should sit exactly under the cursor, not chase it.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background)
      : effectiveBackground(host);

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      x.set(event.clientX - rect.left);
      y.set(event.clientY - rect.top);
    };
    const leave = () => {
      x.set(OFFSCREEN);
      y.set(OFFSCREEN);
    };

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerenter", move);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerenter", move);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
    };
  }, [surface.host, background, x, y]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="type-rain"
      className="block h-full w-full"
    />
  );
}

/**
 * Streams of glyphs fall down the interface and light it as they pass. Each
 * column is a pure function of its own index, the clock, and a hash seeded
 * from that index — never Math.random — so whether a column rains at all,
 * how fast its stream falls, and which glyphs flicker past are fixed the
 * instant the column is chosen. The rest of the surface sits dimmed toward
 * the background colour; that dim field is the real, painted DOM, held at
 * zero opacity beneath the canvas that stands in for it. The head of a
 * stream glows brightest and lights the true page colour through for a
 * short trail before fading back into the dim, and moving the pointer
 * across the surface parts the rain, opening a window where the page always
 * shows through lit.
 * Reduced motion: the real DOM shows at full opacity and this layer renders
 * nothing.
 */
export function TypeRain({
  cell = 14,
  density = 0.8,
  speed = 1,
  length = 12,
  color = "var(--primary)",
  glow = 1,
  dim = 0.6,
  charset = DEFAULT_CHARSET,
  repel = 80,
  background,
  paint,
  className,
  children,
}: TypeRainProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <RainLayer
          cell={cell}
          density={density}
          speed={speed}
          length={length}
          color={color}
          glow={glow}
          dim={dim}
          charset={charset}
          repel={repel}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
