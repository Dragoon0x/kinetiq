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

export type PhotocopyProps = {
  /**
   * The generation the counter starts on (1..8). Clicking owns the counter
   * from mount onward, so this only seeds where the run begins — it is not
   * re-read after the first paint.
   * @default 1
   */
  generation?: number;
  /** How fast the luminance curve narrows toward pure black-and-white as generations climb. @default 0.35 */
  contrast?: number;
  /** Toner speckle strength in the mid greys, scaled by the generation. @default 0.6 */
  speckle?: number;
  /** Per-generation rotation about the centre, in degrees per generation × 0.2. @default 0.6 */
  skew?: number;
  /** Vertical drum-streak darkening strength (0..1). @default 0.3 */
  streak?: number;
  /** Fill colour where the texture samples transparent; defaults to the host's own effective background. */
  background?: string;
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
uniform vec2 u_res;
uniform float u_generation;
uniform float u_contrast;
uniform float u_speckle;
uniform float u_skew;
uniform float u_streak;
uniform float u_flash;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

vec3 kx_sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  vec2 px = v_uv * u_res;
  float g = clamp(u_generation, 1.0, 8.0);

  // Each generation re-photographs a slightly crooked, slightly shifted
  // copy of the last one: rotate about the centre by skew * g * 0.2 degrees
  // and drift by a seeded px offset per axis, both keyed on g alone so a
  // replay always drifts the same way.
  vec2 center = u_res * 0.5;
  float angle = radians(u_skew * g * 0.2);
  float ca = cos(angle);
  float sa = sin(angle);
  vec2 centered = px - center;
  vec2 rotated = vec2(
    centered.x * ca - centered.y * sa,
    centered.x * sa + centered.y * ca
  );
  vec2 drift = vec2(
    (kx_hash(vec2(g, 5.0)) * 2.0 - 1.0) * 3.0,
    (kx_hash(vec2(g, 17.0)) * 2.0 - 1.0) * 3.0
  );
  vec2 srcUv = (rotated + center + drift) / u_res;

  vec3 src = kx_sampleOver(srcUv);
  float luma = kx_luma(src);

  // Contrast curve: a smoothstep whose half-width narrows as g grows, so the
  // image crushes from a soft grey scan toward a hard black-and-white one.
  float w = max(0.42 / (1.0 + g * u_contrast), 0.001);
  float crushed = smoothstep(0.5 - w, 0.5 + w, luma);

  // Toner speckle: a per-pixel hash seeded by g, thresholded so roughly
  // half its candidates fire, gated to pixels sitting near mid-grey (the
  // tone toner spatter reads on) and scaled by speckle * g.
  float speckHash = kx_hash(px + g * 7.0);
  float speckGate = step(0.5, speckHash);
  float midGrey = clamp(1.0 - abs(luma - 0.5) * 2.0, 0.0, 1.0);
  crushed -= speckGate * midGrey * u_speckle * g * 0.05;

  // A vertical drum streak: one 20px column, positioned by g, darkened by
  // streak for the whole run.
  float streakX = kx_hash(vec2(g, 41.0)) * u_res.x;
  float streakBand = 1.0 - smoothstep(0.0, 20.0, abs(px.x - streakX));
  crushed *= 1.0 - u_streak * streakBand;

  crushed = clamp(crushed, 0.0, 1.0);

  // Near-monochrome output with a slight cool cast, the way toner on cheap
  // stock never quite reads as neutral grey.
  vec3 outColor = crushed * vec3(0.94, 0.98, 1.04);

  // The scan-bar flash: a bright line sweeping top to bottom over the 0.3s
  // that follows a click. u_flash < 0 means no flash is running.
  if (u_flash >= 0.0) {
    float dist = abs(v_uv.y - u_flash);
    float band = 1.0 - smoothstep(0.0, 0.05, dist);
    outColor = mix(outColor, vec3(1.0), band * 0.9);
  }

  o_color = vec4(clamp(outColor, 0.0, 1.0), 1.0);
}
`;

type PhotocopyLayerProps = Required<
  Pick<
    PhotocopyProps,
    "generation" | "contrast" | "speckle" | "skew" | "streak"
  >
> & { background?: string };

/** Walks up from the host to the first opaque background colour, so a
 * texel sampled over a transparent region composites onto the real page
 * rather than onto black — the same probe crystal-lens and signal-glitch
 * use for their own backdrop. `background`, when given, may itself hold a
 * `var(--token)`, so it is resolved against the host's own theme. */
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
 * The GL layer. Owns the context, the program, the texture, the generation
 * counter and the flash spring; reads everything else from the surface.
 */
function PhotocopyLayer({
  generation,
  contrast,
  speckle,
  skew,
  streak,
  background,
}: PhotocopyLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // -1 = no flash running; 0..1 = progress of the top-to-bottom scan bar.
  const flash = useMotionValue<number>(-1);
  const flashControlsRef = React.useRef<ReturnType<typeof animate> | null>(
    null,
  );

  // The counter itself: seeded once from `generation`, then owned entirely
  // by clicks — never re-read from the prop after mount.
  const generationRef = React.useRef(clamp(Math.round(generation), 1, 8));

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const frameRef = React.useRef<number | null>(null);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ contrast, speckle, skew, streak });
  React.useEffect(() => {
    paramsRef.current = { contrast, speckle, skew, streak };
  });

  // One frame: upload the texture if a new paint landed, then draw the
  // current generation (plus whatever flash progress is in flight).
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
      u_generation: generationRef.current,
      u_contrast: p.contrast,
      u_speckle: p.speckle,
      u_skew: p.skew,
      u_streak: p.streak,
      u_flash: flash.get(),
      u_bg: bg,
    });
    tri.draw();
  }, [flash]);

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
    // click.
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

  // The flash motion value and every completed paint ask for a frame.
  // Nothing else does — between clicks the loop is silent.
  React.useEffect(() => {
    const unsubscribe = flash.on("change", requestFrame);
    return unsubscribe;
  }, [flash, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // A prop change redraws once with the new values — no loop starts, just
  // one more frame with the current generation.
  React.useEffect(() => {
    requestFrame();
  }, [contrast, speckle, skew, streak, requestFrame]);

  // Resolve the fill colour for wherever a texture samples transparent.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host, background);
    requestFrame();
  }, [surface.host, background, requestFrame]);

  // pointerdown on the host: one more generation, a 0.3s scan-bar flash,
  // then the layer settles on the new generation and goes quiet again.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const down = () => {
      generationRef.current = clamp(generationRef.current + 1, 1, 8);
      flashControlsRef.current?.stop();
      flash.jump(0);
      flashControlsRef.current = animate(flash, 1, {
        duration: 0.3,
        ease: "linear",
        onComplete: () => {
          // Turns the wipe off and, via the change subscription above,
          // draws the settled frame one last time — then nothing ticks
          // until the next click.
          flash.set(-1);
        },
      });
    };
    host.addEventListener("pointerdown", down);
    return () => host.removeEventListener("pointerdown", down);
  }, [surface.host, flash]);

  // A flash in flight must not outlive the component.
  React.useEffect(
    () => () => {
      flashControlsRef.current?.stop();
    },
    [],
  );

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="photocopy"
      className="block h-full w-full"
    />
  );
}

/**
 * The painted interface run back through a photocopier that gets worse
 * every time it is fed in again. A click asks for one more generation
 * (capped at eight): the source rotates and drifts a seeded fraction of a
 * pixel about the centre, its luminance runs through a curve that narrows
 * toward pure black-and-white as generations climb, toner speckle spatters
 * the mid-greys, and one vertical drum streak darkens the same column for
 * the whole run. A bright bar sweeps top to bottom over 0.3s on every
 * click — the scan light crossing the platen — then the layer settles on
 * the new generation and goes quiet; nothing ticks between clicks.
 * `generation` only seeds where the counter starts; the click owns it from
 * there.
 * Reduced motion: SurfacePaint's replace contract shows the real DOM and
 * marks the surface inactive, so this layer renders nothing.
 */
export function Photocopy({
  generation = 1,
  contrast = 0.35,
  speckle = 0.6,
  skew = 0.6,
  streak = 0.3,
  background,
  paint,
  className,
  children,
}: PhotocopyProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <PhotocopyLayer
          generation={generation}
          contrast={contrast}
          speckle={speckle}
          skew={skew}
          streak={streak}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
