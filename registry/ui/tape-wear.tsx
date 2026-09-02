"use client";

import * as React from "react";

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

export type TapeWearProps = {
  /** Overall wear — drives grain strength, the extra chroma-bleed offset, and the per-line horizontal wobble. @default 0.5 */
  wear?: number;
  /** Chroma horizontal-blur width, in CSS pixels. @default 2 */
  bleed?: number;
  /** Whole-frame vertical jitter strength. @default 1 */
  jitter?: number;
  /** Tracking-band strength — its x-shift, brightness lift, desaturation and tear line all scale with this; 0 removes the band outright. @default 0.6 */
  tracking?: number;
  /** How fast the tracking band climbs the frame, in bands per second. @default 0.15 */
  trackingSpeed?: number;
  /** Dropout streak frequency. @default 0.4 */
  dropouts?: number;
  /** Scanline darken strength. @default 0.3 */
  scanlines?: number;
  /** Vignette strength by distance from centre. @default 0.35 */
  vignette?: number;
  /** Warm-cast strength (lifts red, drops blue). @default 0.15 */
  tint?: number;
  /** Fill colour override; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT =
  GLSL_NOISE +
  /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_tick;
uniform float u_wear;
uniform float u_bleed;
uniform float u_jitter;
uniform float u_tracking;
uniform float u_trackingSpeed;
uniform float u_dropouts;
uniform float u_scanlines;
uniform float u_vignette;
uniform float u_tint;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// NTSC YIQ, so luma and chroma can be pulled apart and recombined the way
// a tape head actually separates them.
vec3 rgbToYiq(vec3 c) {
  return vec3(
    dot(c, vec3(0.299, 0.587, 0.114)),
    dot(c, vec3(0.596, -0.274, -0.322)),
    dot(c, vec3(0.211, -0.523, 0.312))
  );
}

vec3 yiqToRgb(vec3 yiq) {
  return vec3(
    yiq.x + 0.956 * yiq.y + 0.621 * yiq.z,
    yiq.x - 0.272 * yiq.y - 0.647 * yiq.z,
    yiq.x - 1.106 * yiq.y + 1.703 * yiq.z
  );
}

void main() {
  float t = u_tick;
  vec2 px = v_uv * u_res;
  float line = floor(gl_FragCoord.y);

  vec2 sampleUV = v_uv;

  // Whole-frame vertical jitter — a faint shake shared by every pixel.
  float jitterNoise = kx_noise(vec2(t * 7.0, 0.0)) - 0.5;
  sampleUV.y += u_jitter * jitterNoise * (2.0 / u_res.y);

  // Per-line horizontal wobble — each device row nudges its own amount.
  float wobbleNoise = kx_hash(vec2(line, floor(t * 24.0))) - 0.5;
  sampleUV.x += wobbleNoise * u_wear * (1.0 / u_res.x);

  // Tracking band: climbs the frame (fract of a falling clock), tearing
  // whatever it crosses. bandStrength gates every band effect below, so
  // tracking = 0 removes the band outright.
  float bandY = fract(-t * u_trackingSpeed);
  float dy = fract(v_uv.y - bandY + 0.5) - 0.5;
  float bandHalf = 0.04;
  float bandSoft = bandHalf * 0.6;
  float bandMask = clamp(
    1.0 - smoothstep(bandHalf - bandSoft, bandHalf, abs(dy)),
    0.0,
    1.0
  );
  float bandStrength = bandMask * u_tracking;

  float trackNoise = kx_hash(vec2(line, floor(t * 60.0) + 5.0)) * 2.0 - 1.0;
  sampleUV.x += bandStrength * 12.0 * trackNoise / u_res.x;

  // Chroma bleed: luma sampled sharp at the (jittered, tracked) read
  // point; chroma from a 5-tap horizontal blur, nudged further by wear.
  vec3 sharp = sampleOver(sampleUV);
  float sharpY = rgbToYiq(sharp).x;

  vec2 chromaCenter = sampleUV + vec2(u_wear / u_res.x, 0.0);
  vec2 bstep = vec2(max(u_bleed, 0.0) / u_res.x, 0.0);
  vec3 blurSum = sampleOver(chromaCenter - 2.0 * bstep)
    + sampleOver(chromaCenter - bstep)
    + sampleOver(chromaCenter)
    + sampleOver(chromaCenter + bstep)
    + sampleOver(chromaCenter + 2.0 * bstep);
  vec3 blurredYiq = rgbToYiq(blurSum / 5.0);
  vec3 color = yiqToRgb(vec3(sharpY, blurredYiq.y, blurredYiq.z));

  // Inside the band: brightness lifts, chroma drops, and a bright tear
  // line rides the leading (climbing) edge.
  float colorY = rgbToYiq(color).x;
  color = mix(color, vec3(colorY), clamp(bandStrength, 0.0, 1.0) * 0.8);
  color *= 1.0 + bandStrength * 0.5;
  float tear = 1.0 - smoothstep(0.0, 0.0035, abs(dy + bandHalf));
  color += vec3(tear * clamp(bandStrength, 0.0, 2.0));

  // Dropouts: seeded per (line, slot) — a short streak from a seeded x,
  // running a seeded length, when the gate hash clears the threshold.
  float slot = floor(t * 12.0);
  float dropoutGate = kx_hash(vec2(line, slot));
  if (dropoutGate < u_dropouts * 0.01) {
    float startX = kx_hash(vec2(line, slot + 0.37));
    float lenFrac = mix(0.04, 0.22, kx_hash(vec2(line, slot + 0.71)));
    if (v_uv.x >= startX && v_uv.x <= startX + lenFrac) {
      float shade = mix(0.65, 1.0, kx_hash(vec2(line, slot + 1.13)));
      color = mix(color, vec3(shade), 0.85);
    }
  }

  // Scanlines: darken every other device row.
  if (mod(floor(gl_FragCoord.y), 2.0) < 1.0) {
    color *= 1.0 - u_scanlines * 0.35;
  }

  // Vignette by distance from centre, aspect-corrected.
  vec2 centered = (v_uv - 0.5) * vec2(u_res.x / max(u_res.y, 1.0), 1.0);
  color *= clamp(1.0 - length(centered) * u_vignette, 0.0, 1.0);

  // Tint: a warm cast, lifting red and dropping blue.
  color.r += 0.08 * u_tint;
  color.b -= 0.08 * u_tint;

  // Grain, seeded from the pixel and the clock — never Math.random.
  color += vec3(kx_hash(px + t) * 0.06 * u_wear);

  o_color = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

type TapeWearLayerProps = Required<
  Pick<
    TapeWearProps,
    | "wear"
    | "bleed"
    | "jitter"
    | "tracking"
    | "trackingSpeed"
    | "dropouts"
    | "scanlines"
    | "vignette"
    | "tint"
  >
> & { background?: string };

/** Walks up from the host to the first opaque background colour, same as
 * crystal-lens, unless `override` is given — `within` scopes any var()
 * token in `override` (or a walked-up token) to the host's own theme. */
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

/**
 * The GL layer. Owns the context, the program, the texture, the tick
 * clock, and the frame loop; reads everything else from the surface.
 */
function TapeWearLayer({
  wear,
  bleed,
  jitter,
  tracking,
  trackingSpeed,
  dropouts,
  scanlines,
  vignette,
  tint,
  background,
}: TapeWearLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const tickRef = React.useRef(0);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({
    wear,
    bleed,
    jitter,
    tracking,
    trackingSpeed,
    dropouts,
    scanlines,
    vignette,
    tint,
  });
  React.useEffect(() => {
    paramsRef.current = {
      wear,
      bleed,
      jitter,
      tracking,
      trackingSpeed,
      dropouts,
      scanlines,
      vignette,
      tint,
    };
  });

  // One frame: upload the texture if a new paint landed, then draw every
  // uniform from the refs above (never from React state).
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

    const sized = resizeGL(gl, canvas, { dprCap: 2 });
    const cssW = sized.width / sized.dpr;
    const cssH = sized.height / sized.dpr;
    const p = paramsRef.current;
    const bg = bgRef.current;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_tick: tickRef.current,
      u_wear: p.wear,
      u_bleed: p.bleed,
      u_jitter: p.jitter,
      u_tracking: p.tracking,
      u_trackingSpeed: p.trackingSpeed,
      u_dropouts: p.dropouts,
      u_scanlines: p.scanlines,
      u_vignette: p.vignette,
      u_tint: p.tint,
      u_bg: bg,
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
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const detach = onContextLoss(canvas, () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      failedRef.current = true;
    });
    // A paint may already be waiting: draw it now rather than on the next
    // tick.
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

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Resolve the fill colour whenever the host or the override changes.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host, background);
  }, [surface.host, background]);

  // The continuous loop: playback never stops on its own, so `u_tick`
  // advances every frame the host is actually visible. Gated by
  // IntersectionObserver and page visibility, same as the GL effect, only
  // while `surface.active`.
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
        // Rebase the clock over the pause so playback resumes, not jumps.
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

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="tape-wear"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface played back from a worn cassette: the frame shakes the way
 * a VCR head misreads a tape it has run a thousand times, chroma bleeds
 * sideways off a five-tap horizontal blur recombined in YIQ, a tracking
 * band climbs the frame and tears whatever it crosses, dropout streaks
 * flicker in and out, and scanlines and a warm vignette sit over the top.
 * Every flaw — the line wobble, the band's noise, a dropout's position and
 * length, the grain — is seeded from `u_tick` and the pixel it lands on,
 * never `Math.random`, so the same wear plays back identically every time.
 * It stands on `<SurfacePaint mode="replace">`: the canvas *is* the page,
 * and the tick loop pauses off-screen and behind a hidden tab, resuming
 * rather than jumping.
 * Reduced motion: SurfacePaint's replace contract shows the real DOM and
 * marks the surface inactive, so this layer renders nothing.
 */
export function TapeWear({
  wear = 0.5,
  bleed = 2,
  jitter = 1,
  tracking = 0.6,
  trackingSpeed = 0.15,
  dropouts = 0.4,
  scanlines = 0.3,
  vignette = 0.35,
  tint = 0.15,
  background,
  paint,
  className,
  children,
}: TapeWearProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <TapeWearLayer
          wear={wear}
          bleed={bleed}
          jitter={jitter}
          tracking={tracking}
          trackingSpeed={trackingSpeed}
          dropouts={dropouts}
          scanlines={scanlines}
          vignette={vignette}
          tint={tint}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
