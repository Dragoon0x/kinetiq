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

export type DitherPattern = "bayer" | "halftone" | "hatch" | "dash";

export type DitherLensProps = {
  /** Lens radius in CSS pixels. @default 200 */
  radius?: number;
  /** Feather width at the lens edge — 0 is a hard circle. @default 1 */
  softness?: number;
  /** Dither cell size in CSS pixels. @default 3 */
  pixelSize?: number;
  /** Gray levels the quantiser resolves to. @default 4 */
  levels?: number;
  /** The threshold geometry the dither reads. @default "bayer" */
  pattern?: DitherPattern;
  /** The low end of the quantised mix. Resolves `var(--ink)` when unset. */
  darkColor?: string;
  /** The high end of the quantised mix. Resolves `var(--color-surface-0)` when unset. */
  lightColor?: string;
  /** How much of the true sampled colour bleeds back through the two-tone mix. @default 0.1 */
  colorize?: number;
  /** Luminance contrast before thresholding. @default 0.6 */
  contrast?: number;
  /** Luminance offset before thresholding. @default 0 */
  brightness?: number;
  /** Flips the luminance ramp (0..1). @default 0 */
  invert?: number;
  /** Dither opacity inside the lens. @default 0.75 */
  strength?: number;
  /** Dither opacity outside the lens — a faint wash across the whole surface. @default 0 */
  baseStrength?: number;
  /** Per-frame decay of the phosphor ghost the lens leaves behind. @default 0.4 */
  trail?: number;
  /** Amplitude of the click-triggered degauss ring. @default 0.8 */
  degauss?: number;
  /** Darkens alternating dither rows for a CRT wash. @default 0 */
  scanlines?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const PATTERN_INDEX: Record<DitherPattern, number> = {
  bayer: 0,
  halftone: 1,
  hatch: 2,
  dash: 3,
};

/** Seconds the degauss ring takes to cross the surface and fully decay. */
const RIPPLE_LIFE = 0.9;
/** How quickly the phosphor ghost catches up to the live lens each frame. */
const GHOST_LAG = 0.25;
/** Ghost/ripple state a fresh mount starts with — far offscreen, inert. */
const IDLE_RIPPLE_START = -1000;

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec3 u_lens;
uniform float u_softness;
uniform float u_pixelSize;
uniform float u_levels;
uniform float u_pattern;
uniform vec4 u_dark;
uniform vec4 u_light;
uniform float u_colorize;
uniform float u_contrast;
uniform float u_brightness;
uniform float u_invert;
uniform float u_strength;
uniform float u_baseStrength;
uniform float u_scanlines;
uniform vec4 u_ripple;
uniform vec4 u_prev;
uniform float u_opacity;
uniform float u_still;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

${GLSL_LUMA}

vec3 dl_sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// The 2x2 base cell every Bayer level nests: bit-pair (bx,by) -> its 0..3
// rung. Bit-interleaving this per bit-plane (weight 16 for the least
// significant bit down to weight 1 for the most significant) reproduces the
// classic 8x8 matrix exactly — bounded to [0, 63/64], mean 31.5/64 — so
// there is never a lookup table, a non-constant array index, or a threshold
// that can exceed 1.0 and force a cell dark regardless of luminance.
int dl_bayer2(int bx, int by) {
  if (bx == 0 && by == 0) return 0;
  if (bx == 1 && by == 0) return 2;
  if (bx == 0 && by == 1) return 3;
  return 1;
}
float dl_bayerThreshold(vec2 cell) {
  ivec2 c = ivec2(mod(cell, 8.0));
  int total = 0;
  int weight = 16;
  for (int bit = 0; bit < 3; bit += 1) {
    total += dl_bayer2((c.x >> bit) & 1, (c.y >> bit) & 1) * weight;
    weight /= 4;
  }
  return float(total) / 64.0;
}

float dl_tri(float x) {
  float f = fract(x);
  return 1.0 - abs(f * 2.0 - 1.0);
}

// Per-pattern threshold in [0,1) at this fragment's position inside its
// pixelSize cell, compared against luminance to decide ink vs. page.
float dl_threshold(vec2 cell, vec2 local, float half_) {
  if (u_pattern < 0.5) {
    return dl_bayerThreshold(cell);
  } else if (u_pattern < 1.5) {
    // halftone: grows outward from the cell centre, like a printed dot.
    float d = length(local) / max(half_, 0.001);
    return clamp(d, 0.0, 1.0);
  } else if (u_pattern < 2.5) {
    // hatch: a diagonal coverage ramp, engraving-style.
    return dl_tri((local.x + local.y) / max(half_ * 2.0, 0.001));
  } else {
    // dash: horizontal coverage, blanked on alternating cell rows.
    float t = dl_tri(local.x / max(half_ * 2.0, 0.001));
    float rowGap = mod(cell.y, 2.0);
    return mix(t, 1.0, rowGap);
  }
}

vec3 dl_ditherColor(vec2 p) {
  float cellSize = max(u_pixelSize, 1.0);
  vec2 cell = floor(p / cellSize);
  vec2 cellCenter = (cell + 0.5) * cellSize;
  vec2 local = p - cellCenter;
  float half_ = cellSize * 0.5;

  vec3 src = dl_sampleOver(cellCenter / u_res);
  float luma = kx_luma(src);
  luma = clamp((luma - 0.5) * (1.0 + u_contrast) + 0.5 + u_brightness, 0.0, 1.0);
  luma = mix(luma, 1.0 - luma, clamp(u_invert, 0.0, 1.0));

  float t = dl_threshold(cell, local, half_);
  float steps = max(u_levels - 1.0, 1.0);
  float scaled = luma * steps + (t - 0.5);
  float q = clamp(floor(scaled + 0.5), 0.0, steps) / steps;

  vec3 toned = mix(u_dark.rgb, u_light.rgb, q);
  toned = mix(toned, src, clamp(u_colorize, 0.0, 1.0));
  float scan = mix(1.0, 1.0 - clamp(u_scanlines, 0.0, 1.0) * 0.55, mod(cell.y, 2.0));
  return toned * scan;
}

// DEGAUSS: a ring expanding from the click point bends where this fragment
// samples from, so the dither grid itself wobbles as the wave passes.
vec2 dl_rippleOffset(vec2 p) {
  float age = u_ripple.z;
  if (age < 0.0 || age > 0.9) return vec2(0.0);
  vec2 d = p - u_ripple.xy;
  float r = length(d);
  vec2 dir = r > 0.5 ? d / r : vec2(0.0);
  float t = clamp(age / 0.9, 0.0, 1.0);
  float ringR = t * (length(u_res) * 0.8 + 160.0);
  float diff = (r - ringR) / 28.0;
  float band = exp(-diff * diff);
  float decay = 1.0 - t;
  float amp = u_ripple.w * 34.0 * band * decay * decay;
  return dir * amp;
}

void main() {
  vec2 px = v_uv * u_res;

  vec2 bent = px;
  if (u_still < 0.5) {
    bent = px + dl_rippleOffset(px);
  }

  vec3 dithered = dl_ditherColor(bent);

  float feather = max(u_softness, 0.0) * 40.0 + 1.0;
  float d = length(px - u_lens.xy);
  float inLens = 1.0 - smoothstep(u_lens.z - feather, u_lens.z + feather, d);

  float mixAmount;
  if (u_still > 0.5) {
    // Reduced motion: the dither covers the whole surface as one still
    // frame — no lens, no ripple, no trail.
    mixAmount = 1.0;
  } else {
    float base = clamp(u_baseStrength, 0.0, 1.0);
    float lensAmt = inLens * clamp(u_strength, 0.0, 1.0);
    mixAmount = max(base, lensAmt);

    // Phosphor ghost: only where the previous lens covered and the live one doesn't.
    float dPrev = length(px - u_prev.xy);
    float inPrev = 1.0 - smoothstep(u_prev.z - feather, u_prev.z + feather, dPrev);
    float ghost = inPrev * (1.0 - inLens) * clamp(u_prev.w, 0.0, 1.0);
    mixAmount = clamp(mixAmount + ghost, 0.0, 1.0);
  }

  o_color = vec4(dithered, mixAmount * clamp(u_opacity, 0.0, 1.0));
}
`;

type LensLayerProps = Required<
  Pick<
    DitherLensProps,
    | "radius"
    | "softness"
    | "pixelSize"
    | "levels"
    | "pattern"
    | "colorize"
    | "contrast"
    | "brightness"
    | "invert"
    | "strength"
    | "baseStrength"
    | "trail"
    | "degauss"
    | "scanlines"
  >
> & {
  darkColor: string | undefined;
  lightColor: string | undefined;
};

/** Walks up from the host to the first opaque background colour, so a
 * texture sample over a transparent region composites onto the page rather
 * than onto black. */
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

/** Resolves a colour prop, falling back to a named CSS custom property read
 * off the document root — the literal `var(--ink)` / `var(--color-surface-0)`
 * defaults the props describe. */
function resolveThemeColor(
  value: string | undefined,
  cssVar: string,
  fallback: string,
): [number, number, number, number] {
  if (value) return resolveColor(value);
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(cssVar)
    .trim();
  return resolveColor(raw || fallback);
}

/**
 * The GL layer. Owns the context, the program, the texture, the pointer
 * spring, and the frame loop; reads everything else from the surface.
 */
function LensLayer({
  radius,
  softness,
  pixelSize,
  levels,
  pattern,
  darkColor,
  lightColor,
  colorize,
  contrast,
  brightness,
  invert,
  strength,
  baseStrength,
  trail,
  degauss,
  scanlines,
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
  const failedRef = React.useRef(false);

  // A rAF-driven tick clock — every age in this effect derives from the
  // timestamp requestAnimationFrame hands its callback, never Date.now().
  const clockRef = React.useRef<{ start: number | null; t: number }>({
    start: null,
    t: 0,
  });
  const rippleRef = React.useRef({
    x: -9999,
    y: -9999,
    startT: IDLE_RIPPLE_START,
  });
  const prevLensRef = React.useRef({ x: -9999, y: -9999, r: 0, alpha: 0 });
  const colorsRef = React.useRef<{
    dark: [number, number, number, number];
    light: [number, number, number, number];
  }>({ dark: [0, 0, 0, 1], light: [1, 1, 1, 1] });

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({
    radius,
    softness,
    pixelSize,
    levels,
    pattern,
    colorize,
    contrast,
    brightness,
    invert,
    strength,
    baseStrength,
    trail,
    degauss,
    scanlines,
  });
  React.useEffect(() => {
    paramsRef.current = {
      radius,
      softness,
      pixelSize,
      levels,
      pattern,
      colorize,
      contrast,
      brightness,
      invert,
      strength,
      baseStrength,
      trail,
      degauss,
      scanlines,
    };
  });

  // A stable indirection so `requestFrame` never has to depend on
  // `drawFrame` itself — `drawFrame` asks for its own next frame while a
  // ripple or a ghost is still alive, and a callback that lists itself as a
  // dependency is exactly the self-referential shape the house rules ban.
  const drawFrameRef = React.useRef<(now: number) => void>(() => {});

  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame((now) => {
      frameRef.current = null;
      drawFrameRef.current(now);
    });
  }, []);

  // One frame: advance the clock, upload the texture if a new paint landed,
  // draw, then age the ripple and the phosphor ghost for next time.
  const drawFrame = React.useCallback(
    (now: number) => {
      const gl = glRef.current;
      const program = programRef.current;
      const tri = triRef.current;
      const canvas = canvasRef.current;
      const live = surfaceRef.current;
      if (!live.active || !gl || !program || !tri || !canvas || !live.canvas)
        return;
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

      const clock = clockRef.current;
      if (clock.start === null) clock.start = now;
      clock.t = (now - clock.start) / 1000;

      const size = resizeGL(gl, canvas, { dprCap: 2 });
      const cssW = size.width / size.dpr;
      const cssH = size.height / size.dpr;
      const p = paramsRef.current;
      const colors = colorsRef.current;
      const ripple = rippleRef.current;
      const prev = prevLensRef.current;
      const rippleAge = live.motionSafe
        ? clock.t - ripple.startT
        : RIPPLE_LIFE + 1;

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      program.use();
      program.texture("u_tex", texture, 0);
      program.set({
        u_res: [cssW, cssH],
        u_lens: [x.get(), y.get(), p.radius],
        u_softness: p.softness,
        u_pixelSize: p.pixelSize,
        u_levels: p.levels,
        u_pattern: PATTERN_INDEX[p.pattern],
        u_dark: colors.dark,
        u_light: colors.light,
        u_colorize: p.colorize,
        u_contrast: p.contrast,
        u_brightness: p.brightness,
        u_invert: p.invert,
        u_strength: p.strength,
        u_baseStrength: p.baseStrength,
        u_scanlines: p.scanlines,
        u_ripple: [ripple.x, ripple.y, rippleAge, p.degauss],
        u_prev: [prev.x, prev.y, prev.r, prev.alpha],
        u_opacity: opacity.get(),
        u_still: live.motionSafe ? 0 : 1,
        u_bg: bgRef.current,
      });
      tri.draw();

      // The ghost chases the live lens on a fixed lag and fades by `trail`
      // each frame — the sliver it doesn't share with the live lens is the
      // trail the shader draws. Once it catches up (or fully fades) there is
      // nothing left to show, so the loop is free to go quiet until the
      // pointer (or a new ripple) wakes it again.
      const liveX = x.get();
      const liveY = y.get();
      const decayed = prev.alpha * (1 - p.trail);
      const refreshed = live.motionSafe
        ? Math.min(1, Math.max(decayed, opacity.get() * 0.16))
        : 0;
      const nextX = prev.x + (liveX - prev.x) * GHOST_LAG;
      const nextY = prev.y + (liveY - prev.y) * GHOST_LAG;
      prevLensRef.current = {
        x: nextX,
        y: nextY,
        r: p.radius,
        alpha: refreshed,
      };

      const ghostSeparated = Math.hypot(nextX - liveX, nextY - liveY) > 1;
      const rippleAlive = live.motionSafe && rippleAge <= RIPPLE_LIFE;
      if (rippleAlive || (refreshed > 0.01 && ghostSeparated)) requestFrame();
    },
    [x, y, opacity, requestFrame],
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

  // Dark/light resolve from CSS custom properties by default, so they track
  // the live theme; re-resolve whenever the html class flips.
  React.useEffect(() => {
    const resolve = () => {
      colorsRef.current = {
        dark: resolveThemeColor(darkColor, "--ink", "#141414"),
        light: resolveThemeColor(lightColor, "--color-surface-0", "#ffffff"),
      };
      requestFrame();
    };
    resolve();
    if (typeof MutationObserver === "undefined") return;
    const themeObserver = new MutationObserver(resolve);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    return () => themeObserver.disconnect();
  }, [darkColor, lightColor, requestFrame]);

  // Pointer on the host: spring the lens, fade in and out, and spawn a
  // degauss ripple on click. Reduced motion skips all of this — the shader
  // already ignores lens position once `u_still` is set, so there is
  // nothing for a pointer to drive.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host);

    if (!surfaceRef.current.motionSafe) {
      opacity.set(1);
      return;
    }

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      animate(x, event.clientX - rect.left, springs.snap);
      animate(y, event.clientY - rect.top, springs.snap);
    };
    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      x.jump(event.clientX - rect.left);
      y.jump(event.clientY - rect.top);
      animate(opacity, 1, { duration: 0.18 });
    };
    const leave = () => {
      animate(opacity, 0, { duration: 0.22 });
    };
    const down = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      rippleRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        startT: clockRef.current.t,
      };
      requestFrame();
    };

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    host.addEventListener("pointerdown", down);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
      host.removeEventListener("pointerdown", down);
    };
  }, [surface.host, x, y, opacity, requestFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="dither-lens"
      className="block h-full w-full"
    />
  );
}

/**
 * A lens that follows the cursor and pixelates the interface underneath into
 * an ordered dither: each cell samples the painted texture once, quantises
 * its luminance against a fixed threshold pattern — a classic 8×8 Bayer
 * matrix, a growing halftone dot, a diagonal hatch, or a dash — and repaints
 * it as `darkColor`/`lightColor`. The matrix itself never moves, so the same
 * patch of page always dithers into the same pixels; only the lens travels.
 * A click sends a DEGAUSS ring rippling outward, bending the grid as it
 * passes, and the lens leaves a faint phosphor ghost where it just was,
 * fading by `trail` every frame.
 * Reduced motion: one static dithered frame covers the whole surface — no
 * lens, no ripple, no trail.
 */
export function DitherLens({
  radius = 200,
  softness = 1,
  pixelSize = 3,
  levels = 4,
  pattern = "bayer",
  darkColor,
  lightColor,
  colorize = 0.1,
  contrast = 0.6,
  brightness = 0,
  invert = 0,
  strength = 0.75,
  baseStrength = 0,
  trail = 0.4,
  degauss = 0.8,
  scanlines = 0,
  paint,
  className,
  children,
}: DitherLensProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn("cursor-none", className)}
      effect={
        <LensLayer
          radius={radius}
          softness={softness}
          pixelSize={pixelSize}
          levels={levels}
          pattern={pattern}
          darkColor={darkColor}
          lightColor={lightColor}
          colorize={colorize}
          contrast={contrast}
          brightness={brightness}
          invert={invert}
          strength={strength}
          baseStrength={baseStrength}
          trail={trail}
          degauss={degauss}
          scanlines={scanlines}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
