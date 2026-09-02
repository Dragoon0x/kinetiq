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
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type SignalGlitchProps = {
  /** Roughly how many bursts fire per second, on average — checked once per quarter-second slot and suppressed while a burst is already running. @default 0.8 */
  rate?: number;
  /** How long a burst lasts, in seconds. @default 0.22 */
  duration?: number;
  /** Overall glitch strength (0..1) — scales band shift, channel split, block noise and speckle together. @default 0.6 */
  intensity?: number;
  /** Horizontal bands a burst tears the frame into; heights are seeded, not equal. Clamped to 16 in the shader. @default 6 */
  bands?: number;
  /** Peak per-band horizontal shift, in CSS pixels. @default 24 */
  shift?: number;
  /** Peak per-channel colour split (red left, blue right) in shifted bands, in CSS pixels. @default 4 */
  split?: number;
  /** Strength of the always-on scanline darkening applied every 2 CSS pixels (0..1) — keep this faint, it never turns off. @default 0.25 */
  scanlines?: number;
  /** Speckle grain strength during a burst (0..1). @default 0.15 */
  noise?: number;
  /** Whether a pointerdown on the surface forces a burst immediately. @default true */
  clickBurst?: boolean;
  /** Fill colour override for wherever the texture is transparent; defaults to the host's own effective background. */
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
uniform float u_burst;
uniform float u_seed;
uniform float u_intensity;
uniform float u_bands;
uniform float u_shift;
uniform float u_split;
uniform float u_scanlines;
uniform float u_noise;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

const int kx_maxBands = 16;

vec3 kx_sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// Fast attack, slow decay — the shape every burst rides. A single progress
// value (0..1 across "duration") drives every glitch term below toward and
// away from zero, so nothing pops in or out.
float kx_envelope(float progress) {
  float attack = smoothstep(0.0, 0.12, progress);
  float release = 1.0 - smoothstep(0.12, 1.0, progress);
  return attack * release;
}

// Non-uniform band index for a DOM-oriented y in [0,1): each band height is
// seeded from seed, so the strips a burst tears the frame into are ragged
// rather than an even grid, and always sum to the full height.
float kx_bandIndex(float y, float bandsF, float seed) {
  int n = clamp(int(bandsF), 1, kx_maxBands);
  float weights[kx_maxBands];
  float total = 0.0;
  for (int i = 0; i < kx_maxBands; i++) {
    if (i >= n) break;
    float w = 0.35 + kx_hash(vec2(float(i), seed));
    weights[i] = w;
    total += w;
  }
  float acc = 0.0;
  for (int i = 0; i < kx_maxBands; i++) {
    if (i >= n) break;
    float h = weights[i] / max(total, 0.0001);
    if (y < acc + h || i == n - 1) return float(i);
    acc += h;
  }
  return float(n - 1);
}

// A handful of seeded rectangles of inverted or brightened texture, re-drawn
// several times over the burst so they flicker instead of sitting still.
// Gated by amount: a weaker burst shows fewer blocks.
vec3 kx_blockNoise(vec2 uv, vec3 color, float seed, float progress, float amount) {
  float epoch = floor(progress * 18.0);
  vec3 result = color;
  for (int i = 0; i < 7; i++) {
    vec2 g = vec2(seed + epoch * 4.7, float(i) * 3.1);
    float gate = kx_hash(g);
    if (gate > amount * 0.7 + 0.1) continue;
    vec2 origin = vec2(kx_hash(g + vec2(1.7, 0.0)), kx_hash(g + vec2(0.0, 1.7)));
    vec2 extent = vec2(0.04, 0.015)
      + vec2(kx_hash(g + vec2(2.3, 0.0)), kx_hash(g + vec2(0.0, 2.3))) * vec2(0.22, 0.07);
    if (uv.x < origin.x || uv.x > origin.x + extent.x) continue;
    if (uv.y < origin.y || uv.y > origin.y + extent.y) continue;
    float invert = step(0.5, kx_hash(g + vec2(4.1, 4.1)));
    vec3 inverted = vec3(1.0) - result;
    vec3 brightened = clamp(result * 1.7 + 0.12, 0.0, 1.0);
    result = mix(brightened, inverted, invert);
  }
  return result;
}

void main() {
  vec2 px = v_uv * u_res;
  vec3 color = vec3(0.0);

  if (u_burst >= 0.0) {
    float progress = clamp(u_burst, 0.0, 1.0);
    float envelope = kx_envelope(progress);

    float bandIndex = kx_bandIndex(v_uv.y, u_bands, u_seed);
    float bandHash = kx_hash(vec2(bandIndex, u_seed));
    // Only some bands move at all — a second, independent seeded gate.
    float shiftGate = step(kx_hash(vec2(bandIndex, u_seed + 31.0)), 0.55);
    float shiftPx = u_shift * u_intensity * (bandHash - 0.5) * 2.0 * shiftGate * envelope;
    float splitPx = u_split * u_intensity * shiftGate * envelope;

    vec2 shiftedUV = vec2(v_uv.x - shiftPx / u_res.x, v_uv.y);
    vec2 splitOff = vec2(splitPx / u_res.x, 0.0);
    vec3 shifted = vec3(
      kx_sampleOver(shiftedUV - splitOff).r,
      kx_sampleOver(shiftedUV).g,
      kx_sampleOver(shiftedUV + splitOff).b
    );

    color = kx_blockNoise(v_uv, shifted, u_seed, progress, u_intensity * envelope);

    float grain = kx_noise(px * 0.9 + vec2(u_seed * 13.1, progress * 61.0));
    color += (grain - 0.5) * 2.0 * u_noise * u_intensity * envelope;

    float lineDist = abs(v_uv.y - progress);
    float line = smoothstep(0.035, 0.0, lineDist) * envelope;
    color += vec3(line);
  } else {
    color = kx_sampleOver(v_uv);
  }

  // A faint standing scanline, on whether or not a burst is running.
  float scanRow = step(1.0, mod(floor(px.y), 2.0));
  color *= 1.0 - u_scanlines * scanRow;

  o_color = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

type GlitchLayerProps = Required<
  Pick<
    SignalGlitchProps,
    | "rate"
    | "duration"
    | "intensity"
    | "bands"
    | "shift"
    | "split"
    | "scanlines"
    | "noise"
    | "clickBurst"
  >
> & { background?: string };

/** A tiny, deterministic integer hash — the schedule's only source of
 * unpredictability: same slot in, same value out, every time. No
 * Math.random, no Date.now. */
function hash01(n: number): number {
  let h = (n | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Walks up from the host to the first opaque background colour, so a
 * texel sampled over a transparent region composites onto the page rather
 * than onto black — the same probe crystal-lens uses for its own backdrop.
 * `background`, when given, may itself hold a `var(--token)`, so it is
 * resolved against the host's own theme rather than the document root. */
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
 * The GL layer. Owns the context, the program, the texture, the burst
 * schedule and the frame loop; reads everything else from the surface.
 */
function GlitchLayer({
  rate,
  duration,
  intensity,
  bands,
  shift,
  split,
  scanlines,
  noise,
  clickBurst,
  background,
}: GlitchLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const failedRef = React.useRef(false);

  // The virtual clock (seconds, rAF-driven, never Date.now), the slot it is
  // currently in, the slot the last actual draw happened in, and the
  // running burst's start time + seed.
  const tRef = React.useRef(0);
  const slotRef = React.useRef(0);
  const lastDrawnSlotRef = React.useRef(-1);
  const burstStartRef = React.useRef<number | null>(null);
  const burstSeedRef = React.useRef(0);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({
    rate,
    duration,
    intensity,
    bands,
    shift,
    split,
    scanlines,
    noise,
  });
  React.useEffect(() => {
    paramsRef.current = {
      rate,
      duration,
      intensity,
      bands,
      shift,
      split,
      scanlines,
      noise,
    };
  });

  // One frame: skip outright when idling (no burst, same slot, same paint),
  // otherwise upload a new paint if one landed and draw.
  const drawFrame = React.useCallback(() => {
    frameRef.current = null;
    const gl = glRef.current;
    const program = programRef.current;
    const tri = triRef.current;
    const canvas = canvasRef.current;
    const live = surfaceRef.current;
    if (!gl || !program || !tri || !canvas || !live.canvas) return;
    if (gl.isContextLost()) return;

    const p = paramsRef.current;
    const burstStart = burstStartRef.current;
    const progress =
      burstStart === null
        ? -1
        : Math.min((tRef.current - burstStart) / p.duration, 1);
    const bursting = progress >= 0;

    const versionPending = uploadedVersionRef.current !== live.version;
    const slotChanged = slotRef.current !== lastDrawnSlotRef.current;
    if (!bursting && !versionPending && !slotChanged) return;
    lastDrawnSlotRef.current = slotRef.current;

    if (versionPending) {
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
    const bg = bgRef.current;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_burst: progress,
      u_seed: burstSeedRef.current,
      u_intensity: p.intensity,
      u_bands: p.bands,
      u_shift: p.shift,
      u_split: p.split,
      u_scanlines: p.scanlines,
      u_noise: p.noise,
      u_bg: bg,
    });
    tri.draw();
  }, []);

  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(drawFrame);
  }, [drawFrame]);

  // GL setup and teardown. The canvas only mounts once the surface is
  // active (after the first paint, under replace mode only once motion is
  // safe), so this is keyed on `surface.active`, not on mount — a
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
    // slot boundary.
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

  // Every completed paint asks for a frame, in case the continuous loop
  // below is currently paused (off-screen or hidden tab).
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // The continuous loop: a virtual clock in seconds, sliced into
  // quarter-second slots. A new slot checks, once, whether this is the one
  // that opens a burst — decided by hashing the slot index against `rate`,
  // never a random number. Gated by IntersectionObserver + visibilitychange
  // and by `surface.active`, so the clock (and any burst) truly pauses
  // off-screen rather than jumping forward on return.
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
      const t = (now - started) / 1000;
      tRef.current = t;

      const p = paramsRef.current;
      const slot = Math.floor(t * 4);
      const crossedSlot = slot !== slotRef.current;
      slotRef.current = slot;

      if (
        burstStartRef.current !== null &&
        t - burstStartRef.current >= p.duration
      ) {
        burstStartRef.current = null;
      }
      if (
        crossedSlot &&
        burstStartRef.current === null &&
        hash01(slot) < p.rate / 4
      ) {
        burstStartRef.current = t;
        burstSeedRef.current = slot;
      }

      drawFrame();
    };

    const syncLoop = () => {
      const shouldRun = inView && !document.hidden;
      if (shouldRun && raf === 0) {
        // Rebase the clock over the pause so the schedule resumes, not
        // jumps ahead as if bursts had kept happening off-screen.
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

  // Resolve the effective background once the host exists or `background`
  // changes; the continuous loop above picks the new value up on its next
  // tick.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host, background);
  }, [surface.host, background]);

  // A click forces a burst immediately, seeded from the slot it lands on —
  // the only input this layer takes besides the schedule itself.
  React.useEffect(() => {
    if (!clickBurst) return;
    const host = surface.host;
    if (!host) return;
    const down = () => {
      const slot = Math.floor(tRef.current * 4);
      slotRef.current = slot;
      burstStartRef.current = tRef.current;
      burstSeedRef.current = slot;
      requestFrame();
    };
    host.addEventListener("pointerdown", down);
    return () => host.removeEventListener("pointerdown", down);
  }, [surface.host, clickBurst, requestFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="signal-glitch"
      className="block h-full w-full"
    />
  );
}

/**
 * The painted interface as a weak signal that periodically loses lock. A
 * virtual clock advances every animation frame and is sliced into
 * quarter-second slots; whether a slot opens a burst comes from hashing
 * the clock itself — never a random number — so the same session tears on
 * the same beat every time it replays. When a burst fires, the frame
 * splits into seeded horizontal bands that shift sideways and split their
 * colour channels, a handful of inverted blocks and a rolling bright line
 * ride a fast-in, slow-decay envelope, and it all settles back to a clean
 * pass-through under one faint standing scanline. A pointerdown on the
 * surface forces a burst immediately, seeded from the slot it lands on.
 * The loop keeps running while the surface is visible but skips the
 * actual draw whenever nothing has changed since the last slot boundary,
 * so idling between bursts costs almost nothing.
 * Reduced motion: SurfacePaint's replace contract shows the real DOM and
 * marks the surface inactive, so this layer renders nothing.
 */
export function SignalGlitch({
  rate = 0.8,
  duration = 0.22,
  intensity = 0.6,
  bands = 6,
  shift = 24,
  split = 4,
  scanlines = 0.25,
  noise = 0.15,
  clickBurst = true,
  background,
  paint,
  className,
  children,
}: SignalGlitchProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={className}
      effect={
        <GlitchLayer
          rate={rate}
          duration={duration}
          intensity={intensity}
          bands={bands}
          shift={shift}
          split={split}
          scanlines={scanlines}
          noise={noise}
          clickBurst={clickBurst}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
