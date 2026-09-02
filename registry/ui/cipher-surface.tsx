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
import { springs } from "@/registry/lib/motion";
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

/** Printable ASCII minus space — '!' through '~', 94 glyphs. */
const DEFAULT_CHARSET = Array.from({ length: 126 - 33 + 1 }, (_, i) =>
  String.fromCharCode(33 + i),
).join("");

/** Square cell size (px) each glyph is drawn into inside the atlas strip. */
const ATLAS_GLYPH_PX = 64;

export type CipherSurfaceProps = {
  /** Decode radius around the cursor, in CSS pixels. @default 260 */
  radius?: number;
  /** Fraction of the radius the decode edge softens over (0..1). @default 0.5 */
  softness?: number;
  /** Cell height in CSS pixels; width is `cell * aspect. @default 11 */
  cell?: number;
  /** Cell width as a fraction of cell, to match the mono font's proportions. @default 0.7 */
  aspect?: number;
  /** Glyph pool drawn into the atlas. @default printable ASCII minus space */
  charset?: string;
  /** How much a glyph's own colour comes from the page vs. color (0..1). @default 1 */
  colored?: number;
  /** Accent colour for monochrome glyphs and the wavefront glow. @default "var(--primary)" */
  color?: string;
  /** Output brightness multiplier for the cipher glyphs. @default 1 */
  brightness?: number;
  /** Fraction of cells eligible to reroll on each cadence tick. @default 0.1 */
  scramble?: number;
  /** Reroll cadence in hertz — one cadence tick every 1 / scrambleSpeed seconds. @default 6 */
  scrambleSpeed?: number;
  /** Width of the wavefront band, as a fraction of radius. @default 0.2 */
  edgeWidth?: number;
  /** How much faster glyphs churn inside the wavefront band. @default 1 */
  edgeFlicker?: number;
  /** Additive glow strength in the wavefront band. @default 2 */
  edgeGlow?: number;
  /** How far the wavefront band's glyphs tint toward color (0..1). @default 0.75 */
  edgeTint?: number;
  /** Chromatic offset in the wavefront band, in CSS pixels. @default 6 */
  aberration?: number;
  /** How much real texture bleeds through the gaps between undecoded glyphs (0..1). @default 0.15 */
  passthrough?: number;
  /** Colour distance from the background under which a cell is skipped outright. @default 0.03 */
  threshold?: number;
  /** Background colour override; defaults to the host's own effective background. */
  background?: string;
  /** Spring the cursor position with springs.snap instead of snapping it directly. @default true */
  smoothing?: boolean;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT =
  GLSL_NOISE +
  GLSL_LUMA +
  /* glsl */ `
uniform sampler2D u_tex;
uniform sampler2D u_atlas;
uniform vec2 u_res;
uniform vec2 u_cursor;
uniform float u_radius;
uniform float u_softness;
uniform float u_cell;
uniform float u_aspect;
uniform float u_glyphCount;
uniform float u_colored;
uniform vec3 u_color;
uniform float u_brightness;
uniform float u_scramble;
uniform float u_scrambleSpeed;
uniform float u_edgeWidth;
uniform float u_edgeFlicker;
uniform float u_edgeGlow;
uniform float u_edgeTint;
uniform float u_aberration;
uniform float u_passthrough;
uniform float u_threshold;
uniform vec4 u_bg;
uniform float u_tick;
uniform float u_presence;
uniform float u_corner;
in vec2 v_uv;
out vec4 o_color;

vec3 kx_sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// Antialiased rounded-rect coverage so the canvas doesn't square off a
// rounded host — px is in canvas CSS pixels, origin top-left.
float kx_roundedAlpha(vec2 px, vec2 res, float r) {
  float rr = clamp(r, 0.0, min(res.x, res.y) * 0.5);
  vec2 halfSize = res * 0.5;
  vec2 q = abs(px - halfSize) - halfSize + rr;
  float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rr;
  return 1.0 - smoothstep(-1.0, 1.0, dist);
}

// Most recent cadence epoch (walking back from epoch) at which this
// cell's gate passed, so a cell holds its glyph between passes instead of
// rerolling every tick. Bounded — never an unbounded search — a cell whose
// gate never fires inside the window just falls back to the live epoch.
float kx_heldEpoch(vec2 cell, float epoch, float scramble) {
  for (int i = 0; i < 20; i++) {
    float e = epoch - float(i);
    if (e < 0.0) break;
    float gate = kx_hash(cell * 1.7 + vec2(e * 12.9898, e * 78.233));
    if (gate < scramble) return e;
  }
  return epoch;
}

void main() {
  vec2 px = v_uv * u_res;
  float cellW = max(u_cell * u_aspect, 1.0);
  float cellH = max(u_cell, 1.0);
  vec2 cellIndex = floor(px / vec2(cellW, cellH));
  vec2 cellLocal = fract(px / vec2(cellW, cellH));
  vec2 cellCenterUV = (cellIndex + 0.5) * vec2(cellW, cellH) / u_res;

  // The cell takes the darkest of five taps, not its centre: a cell that
  // holds any ink at all reads as ink, so the cipher keeps the weight of
  // the type it replaces instead of thinning to the anti-aliased average.
  vec2 tap = vec2(cellW, cellH) * 0.28 / u_res;
  vec3 pageColor = kx_sampleOver(cellCenterUV);
  float luma = kx_luma(pageColor);
  for (int i = 0; i < 4; i++) {
    vec2 o = i == 0 ? vec2(tap.x, 0.0) : i == 1 ? vec2(-tap.x, 0.0) : i == 2 ? vec2(0.0, tap.y) : vec2(0.0, -tap.y);
    vec3 c = kx_sampleOver(cellCenterUV + o);
    float l = kx_luma(c);
    if (l < luma) { luma = l; pageColor = c; }
  }
  bool isBg = length(pageColor - u_bg.rgb) < u_threshold;

  float dist = length(px - u_cursor);
  float d = (1.0 - smoothstep(u_radius * (1.0 - u_softness), u_radius, dist)) * u_presence;
  float edgeSpan = max(u_edgeWidth * u_radius, 1.0);
  float edgeBand = (1.0 - smoothstep(0.0, edgeSpan, abs(dist - u_radius))) * u_presence;

  // Held glyph: reroll gate at the base cadence, most cells hold.
  float epoch = floor(u_tick * u_scrambleSpeed);
  float heldEpoch = kx_heldEpoch(cellIndex, epoch, u_scramble);
  float glyphSeed = kx_hash(cellIndex * 1.3 + vec2(heldEpoch * 91.7, heldEpoch * 13.3));
  float glyphIndex = clamp(floor(glyphSeed * u_glyphCount), 0.0, u_glyphCount - 1.0);

  // Wavefront glyph: an independent, ungated, faster cadence — always churns.
  float flickerEpoch = floor(u_tick * u_scrambleSpeed * max(u_edgeFlicker, 0.0));
  float flickerSeed = kx_hash(cellIndex * 1.9 + vec2(flickerEpoch * 33.1, flickerEpoch * 57.7));
  float flickerIndex = clamp(floor(flickerSeed * u_glyphCount), 0.0, u_glyphCount - 1.0);
  float chosenIndex = edgeBand > 0.5 ? flickerIndex : glyphIndex;

  float atlasU = (chosenIndex + cellLocal.x) / u_glyphCount;
  float mask = texture(u_atlas, vec2(atlasU, cellLocal.y)).a;

  vec2 abOffset = vec2(u_aberration, 0.0) / u_res * edgeBand;
  vec3 pageColorAb = vec3(
    kx_sampleOver(cellCenterUV + abOffset).r,
    pageColor.g,
    kx_sampleOver(cellCenterUV - abOffset).b
  );

  vec3 glyphColor = mix(u_color, pageColorAb, u_colored);
  // Ink is strongest where the page is darkest: the cipher keeps the
  // weight of the type it replaces.
  glyphColor *= mix(1.0, 0.45, luma) * u_brightness;
  glyphColor = mix(glyphColor, u_color, u_edgeTint * edgeBand);
  glyphColor += u_color * u_edgeGlow * edgeBand * mask;

  vec3 undecoded = mix(u_bg.rgb, glyphColor, mask);
  undecoded = mix(undecoded, pageColor, u_passthrough * (1.0 - mask));

  vec4 raw = texture(u_tex, clamp(v_uv, 0.0, 1.0));
  vec3 decoded = mix(u_bg.rgb, raw.rgb, raw.a);

  vec3 rgb = isBg ? u_bg.rgb : mix(undecoded, decoded, d);
  float cornerAlpha = kx_roundedAlpha(px, u_res, u_corner);
  o_color = vec4(rgb, cornerAlpha);
}
`;

type CipherLayerProps = Required<
  Pick<
    CipherSurfaceProps,
    | "radius"
    | "softness"
    | "cell"
    | "aspect"
    | "charset"
    | "colored"
    | "color"
    | "brightness"
    | "scramble"
    | "scrambleSpeed"
    | "edgeWidth"
    | "edgeFlicker"
    | "edgeGlow"
    | "edgeTint"
    | "aberration"
    | "passthrough"
    | "threshold"
    | "smoothing"
  >
> & { background?: string };

/** Walks up from the host to the first opaque background colour, same as
 * crystal-lens, unless `override` is given. `within` scopes any `var(...)`
 * token in `override` to the host's own theme. */
function effectiveBackground(
  el: HTMLElement | null,
  override?: string,
): [number, number, number, number] {
  if (override) return resolveColor(override, el);
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

function effectiveCornerRadius(el: HTMLElement): number {
  const value = parseFloat(getComputedStyle(el).borderTopLeftRadius);
  return Number.isFinite(value) ? value : 0;
}

/** Draws `charset` once into a horizontal 2D-canvas strip, one square cell
 * per glyph, white ink on a transparent ground so the fragment shader can
 * tint every glyph itself and read coverage from the alpha channel. */
function buildGlyphAtlas(charset: string): {
  canvas: HTMLCanvasElement;
  count: number;
} {
  const source = charset.length > 0 ? charset : DEFAULT_CHARSET;
  const glyphs = Array.from(source);
  const count = Math.max(1, glyphs.length);
  const canvas = document.createElement("canvas");
  canvas.width = count * ATLAS_GLYPH_PX;
  canvas.height = ATLAS_GLYPH_PX;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const monoFont =
      getComputedStyle(document.body).getPropertyValue("--font-mono").trim() ||
      "ui-monospace";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Bold and large in the cell: the cipher has to read as ink, not lint.
    ctx.font = `600 ${Math.round(ATLAS_GLYPH_PX * 0.84)}px ${monoFont}`;
    glyphs.forEach((glyph, index) => {
      ctx.fillText(
        glyph,
        index * ATLAS_GLYPH_PX + ATLAS_GLYPH_PX / 2,
        ATLAS_GLYPH_PX / 2 + 1,
      );
    });
  }
  return { canvas, count };
}

/**
 * The GL layer. Owns the context, the two textures (page + glyph atlas),
 * the cursor spring, the tick clock, and the frame loop; reads everything
 * else from the surface.
 */
function CipherLayer({
  radius,
  softness,
  cell,
  aspect,
  charset,
  colored,
  color,
  brightness,
  scramble,
  scrambleSpeed,
  edgeWidth,
  edgeFlicker,
  edgeGlow,
  edgeTint,
  aberration,
  passthrough,
  threshold,
  background,
  smoothing,
}: CipherLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const x = useMotionValue<number>(-9999);
  const y = useMotionValue<number>(-9999);
  const presence = useMotionValue<number>(0);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const atlasTextureRef = React.useRef<WebGLTexture | null>(null);
  const glyphCountRef = React.useRef(1);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const tickRef = React.useRef(0);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const colorRef = React.useRef<[number, number, number]>([0.5, 0.5, 0.5]);
  const cornerRef = React.useRef(0);
  const failedRef = React.useRef(false);
  const pointerInsideRef = React.useRef(false);
  const syncLoopRef = React.useRef<(() => void) | null>(null);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({
    radius,
    softness,
    cell,
    aspect,
    colored,
    brightness,
    scramble,
    scrambleSpeed,
    edgeWidth,
    edgeFlicker,
    edgeGlow,
    edgeTint,
    aberration,
    passthrough,
    threshold,
  });
  React.useEffect(() => {
    paramsRef.current = {
      radius,
      softness,
      cell,
      aspect,
      colored,
      brightness,
      scramble,
      scrambleSpeed,
      edgeWidth,
      edgeFlicker,
      edgeGlow,
      edgeTint,
      aberration,
      passthrough,
      threshold,
    };
  });

  // One frame: upload the page texture if a new paint landed, then draw
  // every uniform from the refs above (never from React state).
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
    const atlas = atlasTextureRef.current;
    if (!texture || !atlas) return;

    const size = resizeGL(gl, canvas, { dprCap: 2 });
    const cssW = size.width / size.dpr;
    const cssH = size.height / size.dpr;
    const p = paramsRef.current;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.texture("u_atlas", atlas, 1);
    program.set({
      u_res: [cssW, cssH],
      u_cursor: [x.get(), y.get()],
      u_radius: p.radius,
      u_softness: p.softness,
      u_cell: p.cell,
      u_aspect: p.aspect,
      u_glyphCount: glyphCountRef.current,
      u_colored: p.colored,
      u_color: colorRef.current,
      u_brightness: p.brightness,
      u_scramble: p.scramble,
      u_scrambleSpeed: p.scrambleSpeed,
      u_edgeWidth: p.edgeWidth,
      u_edgeFlicker: p.edgeFlicker,
      u_edgeGlow: p.edgeGlow,
      u_edgeTint: p.edgeTint,
      u_aberration: p.aberration,
      u_passthrough: p.passthrough,
      u_threshold: p.threshold,
      u_bg: bgRef.current,
      u_tick: tickRef.current,
      u_presence: presence.get(),
      u_corner: cornerRef.current,
    });
    tri.draw();
  }, [x, y, presence]);

  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(drawFrame);
  }, [drawFrame]);

  // GL setup and teardown. The canvas only mounts once the surface is
  // active (after the first paint, and under replace mode only once motion
  // is safe), so this is keyed on `surface.active`, not on mount — a
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
      if (atlasTextureRef.current) gl.deleteTexture(atlasTextureRef.current);
      atlasTextureRef.current = null;
      uploadedVersionRef.current = 0;
      glyphCountRef.current = 1;
      tri.dispose();
      program.dispose();
      glRef.current = null;
      programRef.current = null;
      triRef.current = null;
    };
  }, [surface.active, requestFrame]);

  // The glyph atlas — rebuilt whenever the charset changes, reusing the GL
  // texture object across rebuilds via uploadTexture's `existing` param.
  React.useEffect(() => {
    if (!surface.active) return;
    const gl = glRef.current;
    if (!gl) return;
    const built = buildGlyphAtlas(charset);
    atlasTextureRef.current = uploadTexture(
      gl,
      built.canvas,
      { linear: true, wrap: "clamp" },
      atlasTextureRef.current,
    );
    glyphCountRef.current = built.count;
    requestFrame();
  }, [surface.active, charset, requestFrame]);

  // Every motion-value change and every completed paint asks for a frame —
  // this alone carries the presence fade in and out smoothly even while
  // the continuous loop below is stopped.
  React.useEffect(() => {
    const unsubs = [x, y, presence].map((mv) => mv.on("change", requestFrame));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [x, y, presence, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Pointer on the host: spring (or snap) the cursor, resolve the page's
  // effective colours, and fade the decode presence in and out.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host, background);
    const [r, g, b] = resolveColor(color, host);
    colorRef.current = [r, g, b];
    cornerRef.current = effectiveCornerRadius(host);

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      if (smoothing) {
        animate(x, px, springs.snap);
        animate(y, py, springs.snap);
      } else {
        x.jump(px);
        y.jump(py);
      }
    };
    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      x.jump(event.clientX - rect.left);
      y.jump(event.clientY - rect.top);
      pointerInsideRef.current = true;
      animate(presence, 1, { duration: 0.18 });
      syncLoopRef.current?.();
    };
    const leave = () => {
      pointerInsideRef.current = false;
      animate(presence, 0, { duration: 0.22 });
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
  }, [surface.host, background, color, smoothing, x, y, presence]);

  // The continuous tick loop: runs while the pointer is inside or an idle
  // reroll cadence is active, gated by intersection and tab visibility, and
  // stops outright once neither is true. Kept on `surface.active` for the
  // same reason as the GL effect above — it must tear down and re-arm with
  // the same lifecycle the canvas itself follows.
  React.useEffect(() => {
    if (!surface.active) return;
    const host = surface.host;
    if (!host) return;

    let loopRaf = 0;
    let lastTime: number | null = null;
    let inView = false;

    const shouldContinue = () =>
      surfaceRef.current.active &&
      inView &&
      !document.hidden &&
      (pointerInsideRef.current || paramsRef.current.scramble > 0);

    const loopStep = (now: number) => {
      loopRaf = 0;
      if (lastTime !== null) {
        tickRef.current += (now - lastTime) / 1000;
      }
      lastTime = now;
      drawFrame();
      if (shouldContinue()) {
        loopRaf = requestAnimationFrame(loopStep);
      } else {
        lastTime = null;
      }
    };
    const startLoop = () => {
      if (loopRaf !== 0) return;
      lastTime = null;
      loopRaf = requestAnimationFrame(loopStep);
    };
    const stopLoop = () => {
      if (loopRaf !== 0) cancelAnimationFrame(loopRaf);
      loopRaf = 0;
    };
    const syncLoop = () => {
      if (shouldContinue()) startLoop();
      else stopLoop();
    };
    syncLoopRef.current = syncLoop;

    const intersection = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) inView = last.isIntersecting;
      syncLoop();
    });
    intersection.observe(host);
    const onVisibility = () => syncLoop();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      syncLoopRef.current = null;
      stopLoop();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [surface.active, surface.host, drawFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="cipher-surface"
      className="block h-full w-full"
    />
  );
}

/**
 * The whole painted surface renders as cipher glyphs pulled from a mono
 * font atlas; bring the cursor close and cells inside `radius` peel back
 * into the crisp, coloured page behind a flickering, glowing wavefront,
 * with a chromatic fringe riding the decode edge. Idle cells reroll on a
 * fixed cadence from a seeded hash table, never `Math.random` — the same
 * page decodes the same way on every visit. It stands on
 * `<SurfacePaint mode="replace">`: the canvas *is* the page, and the real
 * DOM sits underneath at opacity 0, still interactive, while one fragment
 * shader samples the painted texture per cell, skips near-background cells
 * outright, and blends the raw texture back in as the decode amount rises
 * toward the cursor. The tick loop pauses off-screen and behind a hidden
 * tab, and stops outright once nothing is decoding and idle reroll is off.
 * Reduced motion: SurfacePaint's replace contract shows the real DOM and
 * marks the surface inactive, so this layer renders nothing.
 */
export function CipherSurface({
  radius = 260,
  softness = 0.5,
  cell = 11,
  aspect = 0.7,
  charset = DEFAULT_CHARSET,
  colored = 1,
  color = "var(--primary)",
  brightness = 1,
  scramble = 0.1,
  scrambleSpeed = 6,
  edgeWidth = 0.2,
  edgeFlicker = 1,
  edgeGlow = 2,
  edgeTint = 0.75,
  aberration = 6,
  passthrough = 0.15,
  threshold = 0.03,
  background,
  smoothing = true,
  paint,
  className,
  children,
}: CipherSurfaceProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={className}
      effect={
        <CipherLayer
          radius={radius}
          softness={softness}
          cell={cell}
          aspect={aspect}
          charset={charset}
          colored={colored}
          color={color}
          brightness={brightness}
          scramble={scramble}
          scrambleSpeed={scrambleSpeed}
          edgeWidth={edgeWidth}
          edgeFlicker={edgeFlicker}
          edgeGlow={edgeGlow}
          edgeTint={edgeTint}
          aberration={aberration}
          passthrough={passthrough}
          threshold={threshold}
          background={background}
          smoothing={smoothing}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
