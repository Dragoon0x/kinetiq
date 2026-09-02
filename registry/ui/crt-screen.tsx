"use client";

import * as React from "react";

import {
  FULLSCREEN_VERTEX,
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

export type CrtScreenProps = {
  /** Barrel-bulge strength — how hard the picture bows toward its corners. @default 0.12 */
  curvature?: number;
  /** Scanline darken strength (0..1), applied to every second device row. @default 0.35 */
  scanlines?: number;
  /** Phosphor-triad strength (0..1) — how hard each device-pixel column favours its own primary. @default 0.25 */
  triad?: number;
  /** Bloom strength (0..1+) added back from a five-tap blur of the bright part of the image. @default 0.5 */
  bloom?: number;
  /** Flicker strength (0..1) driving a small, fast 60Hz brightness wobble. @default 0.6 */
  flicker?: number;
  /** Rolling-bar strength (0..1) — a soft bright band that climbs the frame once every ~10s. @default 0.25 */
  roll?: number;
  /** Whether a pointerdown on the host collapses the picture to a line and expands it back, the way a set does when it is switched off and on. @default true */
  powerCycle?: boolean;
  /** Fill colour override; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_tick;
uniform float u_curvature;
uniform float u_scanlines;
uniform float u_triad;
uniform float u_bloom;
uniform float u_flicker;
uniform float u_roll;
uniform float u_power;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// Barrel bulge about the centre: the further a point sits from the middle,
// the harder it gets pushed outward, so the rectangle bows into a tube
// shape and the corners land furthest past 0..1 — exactly the region the
// bezel test below rejects, which gives the rounded-corner falloff for
// free instead of a second, hand-rolled rounded-rect distance field.
vec2 barrel(vec2 uv, float amount) {
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);
  return uv + c * r2 * amount;
}

void main() {
  vec2 uv = v_uv;

  // Power-cycle: collapse the whole picture into a thin bright line about
  // the vertical centre over 0.5s, then expand it back over 0.4s. u_power
  // holds the clock tick of the last pointerdown; before the first one,
  // age is a very large positive number and collapse never engages.
  float age = u_tick - u_power;
  float collapse = 0.0;
  if (age >= 0.0 && age < 0.9) {
    collapse = age < 0.5
      ? smoothstep(0.0, 1.0, age / 0.5)
      : 1.0 - smoothstep(0.0, 1.0, (age - 0.5) / 0.4);
  }
  float scaleY = mix(1.0, 0.012, collapse);
  float bandHalf = scaleY * 0.5;
  float distFromCentre = abs(uv.y - 0.5);
  if (distFromCentre > bandHalf) {
    o_color = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  // Stretch the thin visible band back out to full content height, so the
  // whole picture reads as squeezed into it rather than merely cropped.
  uv.y = 0.5 + (uv.y - 0.5) / scaleY;

  // Barrel-warp, then the bezel test: outside the tube renders black.
  vec2 warped = barrel(uv, u_curvature);
  vec2 edgeDist = min(warped, 1.0 - warped);
  float inside = smoothstep(-0.012, 0.006, min(edgeDist.x, edgeDist.y));
  if (inside <= 0.0) {
    o_color = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec3 base = sampleOver(warped);

  // Phosphor triad: every third device-pixel column favours its own primary.
  vec2 px = v_uv * u_res;
  float col = mod(floor(px.x), 3.0);
  vec3 triadMask = col < 0.5
    ? vec3(1.0, 1.0 - u_triad, 1.0 - u_triad)
    : col < 1.5
      ? vec3(1.0 - u_triad, 1.0, 1.0 - u_triad)
      : vec3(1.0 - u_triad, 1.0 - u_triad, 1.0);
  vec3 color = base * triadMask;

  // Scanlines: darken every second device row.
  if (mod(floor(gl_FragCoord.y), 2.0) < 1.0) {
    color *= 1.0 - u_scanlines;
  }

  // Bloom: a plus-shaped five-tap blur, its bright part alone added back
  // so highlights spread into the glass without softening the whole image.
  vec2 texel = 1.5 / u_res;
  vec3 blurSum = base
    + sampleOver(warped + vec2(texel.x, 0.0))
    + sampleOver(warped - vec2(texel.x, 0.0))
    + sampleOver(warped + vec2(0.0, texel.y))
    + sampleOver(warped - vec2(0.0, texel.y));
  vec3 blurred = blurSum / 5.0;
  vec3 brightPart = max(blurred - 0.6, 0.0);
  color += brightPart * u_bloom;

  // Flicker: a small, fast brightness wobble every frame.
  color *= 1.0 + sin(u_tick * 60.0) * 0.02 * u_flicker;

  // Rolling bar: a soft bright band climbing the frame on its own clock,
  // wrapped so it re-enters at the top the instant it leaves the bottom.
  float barY = fract(u_tick * 0.1);
  float rollDist = abs(v_uv.y - barY);
  rollDist = min(rollDist, 1.0 - rollDist);
  color += (1.0 - smoothstep(0.0, 0.05, rollDist)) * u_roll * 0.5;

  // A slight vignette.
  vec2 vc = (v_uv - 0.5) * vec2(u_res.x / max(u_res.y, 1.0), 1.0);
  color *= clamp(1.0 - length(vc) * 0.28, 0.0, 1.0);

  // A bright core along the collapse line, brightest as the band thins.
  color += vec3(collapse * (1.0 - smoothstep(0.0, bandHalf, distFromCentre)) * 1.4);

  o_color = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

type CrtScreenLayerProps = Required<
  Pick<
    CrtScreenProps,
    | "curvature"
    | "scanlines"
    | "triad"
    | "bloom"
    | "flicker"
    | "roll"
    | "powerCycle"
  >
> & { background?: string };

/** Walks up from the host to the first opaque background colour, same probe
 * crystal-lens and tape-wear use, unless `override` is given. */
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

// Sentinel: further in the past than any real clock the tick loop will ever
// reach, so `u_tick - u_power` stays a large positive number (collapse off)
// until the first pointerdown lands.
const NEVER = -1e6;

/**
 * The GL layer. Owns the context, the program, the texture, the power-cycle
 * clock, and the frame loop; reads everything else from the surface.
 */
function CrtScreenLayer({
  curvature,
  scanlines,
  triad,
  bloom,
  flicker,
  roll,
  powerCycle,
  background,
}: CrtScreenLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const tickRef = React.useRef(0);
  const powerRef = React.useRef(NEVER);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({
    curvature,
    scanlines,
    triad,
    bloom,
    flicker,
    roll,
    powerCycle,
  });
  React.useEffect(() => {
    paramsRef.current = {
      curvature,
      scanlines,
      triad,
      bloom,
      flicker,
      roll,
      powerCycle,
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
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_tick: tickRef.current,
      u_curvature: p.curvature,
      u_scanlines: p.scanlines,
      u_triad: p.triad,
      u_bloom: p.bloom,
      u_flicker: p.flicker,
      u_roll: p.roll,
      u_power: powerRef.current,
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

  // The continuous loop: the tube never sits still on its own, so `u_tick`
  // advances every frame the host is actually visible. Gated by
  // IntersectionObserver and page visibility, only while `surface.active`.
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

  // Power-cycle: a pointerdown on the host starts the collapse/expand
  // clock. Reduced motion leaves the listener attached but inert, matching
  // the pointer-listener convention elsewhere in the wing — the layer
  // never renders under reduced motion anyway, so this only guards the ref.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const down = () => {
      if (!paramsRef.current.powerCycle) return;
      if (!surfaceRef.current.motionSafe) return;
      powerRef.current = tickRef.current;
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
      data-effect-canvas="crt-screen"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface read off a cathode-ray tube: a barrel warp bows the picture
 * toward its rounded corners (the corner falloff is the warp itself pushing
 * those points furthest past the bezel, not a second shape drawn over it),
 * a phosphor triad splits every third device-pixel column toward its own
 * primary, and scanlines darken every other device row. A five-tap bloom
 * lifts the brightest part of the image back into the glass, a soft bar
 * rolls up the frame on its own clock, and a fast, faint flicker keeps the
 * brightness honest to a real tube. A pointerdown on the host collapses the
 * whole picture to a bright horizontal line over half a second and expands
 * it back over the next four tenths, the way an old set looks switching off
 * and on. `<SurfacePaint mode="replace">` holds the real DOM at zero
 * opacity — still in flow, still focusable — while the canvas plays it
 * back, and the tick loop pauses off-screen and behind a hidden tab,
 * resuming rather than jumping.
 * Reduced motion: SurfacePaint's replace contract shows the real DOM and
 * marks the surface inactive, so this layer renders nothing.
 */
export function CrtScreen({
  curvature = 0.12,
  scanlines = 0.35,
  triad = 0.25,
  bloom = 0.5,
  flicker = 0.6,
  roll = 0.25,
  powerCycle = true,
  background,
  paint,
  className,
  children,
}: CrtScreenProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <CrtScreenLayer
          curvature={curvature}
          scanlines={scanlines}
          triad={triad}
          bloom={bloom}
          flicker={flicker}
          roll={roll}
          powerCycle={powerCycle}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
