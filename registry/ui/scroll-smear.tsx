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

export type ScrollSmearProps = {
  /** Multiplier from scroll/wheel velocity (px/s) to blur length (px). @default 0.06 */
  strength?: number;
  /** Per-frame velocity decay, applied as `decay ** (dt / 16.7ms)`. @default 0.9 */
  decay?: number;
  /** Sample count along the blur axis, clamped to 32. @default 12 */
  taps?: number;
  /** The axis the streak stretches along. @default "y" */
  axis?: "x" | "y";
  /** Fill for regions where the painted texture is transparent. Defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_length;
uniform int u_taps;
uniform vec2 u_dir;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

const int MAX_TAPS = 32;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  // Below half a pixel of blur the streak would be imperceptible anyway --
  // skip the tap loop and show the texture untouched.
  if (u_length < 0.5) {
    o_color = vec4(sampleOver(v_uv), 1.0);
    return;
  }

  int taps = clamp(u_taps, 1, MAX_TAPS);
  float denom = max(float(taps - 1), 1.0);
  vec2 stepPx = u_dir * u_length;

  vec3 sum = vec3(0.0);
  float weightSum = 0.0;
  for (int i = 0; i < MAX_TAPS; i++) {
    if (i >= taps) break;
    float t = taps > 1 ? (float(i) / denom) - 0.5 : 0.0;
    vec2 offsetPx = stepPx * t;
    // Centre-weighted: a triangular window peaking at the middle tap and
    // tapering toward the two ends, so this reads as one long exposure
    // rather than a flat, evenly-smeared blur.
    float weight = max(1.0 - abs(2.0 * t), 0.05);
    sum += sampleOver(v_uv + offsetPx / u_res) * weight;
    weightSum += weight;
  }

  vec3 color = sum / max(weightSum, 0.0001);
  o_color = vec4(color, 1.0);
}
`;

type SmearLayerProps = Required<
  Pick<ScrollSmearProps, "strength" | "decay" | "taps" | "axis">
> & { background?: string };

/** Walks up from the host to the first opaque background colour, so a fully
 * transparent painted texture composites onto the page rather than onto
 * black — the same fallback crystal-lens and warp-grid use. */
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
    document.documentElement,
  );
}

/** One rAF's worth of nominal frame time, for turning elapsed ms into "frames". */
const FRAME_MS = 16.7;

/** Below this px/s the streak is gone anyway (u_length < 0.5 at typical strength) -- stop the loop rather than idling on an imperceptible decay tail. */
const VELOCITY_STOP = 1;

/**
 * The GL layer. Owns the context, the program, the texture, the velocity
 * state, and the frame loop; reads everything else from the surface.
 */
function SmearLayer({
  strength,
  decay,
  taps,
  axis,
  background,
}: SmearLayerProps) {
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

  // Current scroll/wheel velocity in px/s along the page's own axis --
  // magnitude only matters, direction is dropped once it feeds the shader.
  const velocityRef = React.useRef(0);
  const lastScrollRef = React.useRef<{ y: number; t: number } | null>(null);
  const lastWheelRef = React.useRef<number | null>(null);
  const loopRef = React.useRef<number | null>(null);
  const lastTickRef = React.useRef<number | null>(null);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ strength, decay, taps, axis });
  React.useEffect(() => {
    paramsRef.current = { strength, decay, taps, axis };
  }, [strength, decay, taps, axis]);

  // One frame: upload the texture if a new paint landed, then draw the
  // current velocity's blur length.
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
    const length = Math.min(140, Math.abs(velocityRef.current) * p.strength);
    const dir: [number, number] = p.axis === "x" ? [1, 0] : [0, 1];

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_length: length,
      u_taps: Math.max(1, Math.round(p.taps)),
      u_dir: dir,
      u_bg: bgRef.current,
    });
    tri.draw();
  }, []);

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
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const detach = onContextLoss(canvas, () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      failedRef.current = true;
    });
    // A paint may already be waiting: draw it now rather than on the next
    // scroll or wheel event.
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

  // Every completed paint asks for a frame, even while the page is still.
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // The background resolves against the host so `var(--token)` reads the
  // theme in force there, like crystal-lens and warp-grid.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    requestFrame();
  }, [surface.host, background, requestFrame]);

  // Scroll and wheel on the outside world: a passive, captured `scroll` on
  // `window` turns consecutive scrollY deltas into a velocity; a `wheel` on
  // the host adds its own delta/dt so a wheel gesture over the host still
  // registers once the page has nowhere left to scroll. A self-scheduling
  // loop decays that velocity every frame, redraws, and stops itself the
  // instant it settles -- it never idles once still.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;

    const tick = (now: number) => {
      if (!surfaceRef.current.active) {
        loopRef.current = null;
        lastTickRef.current = null;
        return;
      }
      const last = lastTickRef.current;
      lastTickRef.current = now;
      const dtMs = last === null ? FRAME_MS : now - last;
      const frames = dtMs / FRAME_MS;
      const p = paramsRef.current;
      velocityRef.current *= Math.pow(p.decay, frames);
      requestFrame();
      if (Math.abs(velocityRef.current) <= VELOCITY_STOP) {
        // Draw once at (near) rest, then stop rather than idling.
        velocityRef.current = 0;
        loopRef.current = null;
        lastTickRef.current = null;
        return;
      }
      loopRef.current = requestAnimationFrame(tick);
    };

    const ensureLoop = () => {
      if (loopRef.current !== null) return;
      lastTickRef.current = null;
      loopRef.current = requestAnimationFrame(tick);
    };

    const handleScroll = (event: Event) => {
      const now = event.timeStamp;
      const y = window.scrollY;
      const last = lastScrollRef.current;
      if (last) {
        const dt = (now - last.t) / 1000;
        if (dt > 0) velocityRef.current = (y - last.y) / dt;
      }
      lastScrollRef.current = { y, t: now };
      ensureLoop();
    };

    const handleWheel = (event: WheelEvent) => {
      const now = event.timeStamp;
      const last = lastWheelRef.current;
      // Guard the divisor: back-to-back wheel events can land on the same
      // timestamp, and dividing by ~0 would spike velocity to infinity.
      const dt =
        last === null ? 1 / 60 : Math.max((now - last) / 1000, 1 / 240);
      velocityRef.current += event.deltaY / dt;
      lastWheelRef.current = now;
      ensureLoop();
    };

    window.addEventListener("scroll", handleScroll, {
      passive: true,
      capture: true,
    });
    host.addEventListener("wheel", handleWheel, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      host.removeEventListener("wheel", handleWheel);
      if (loopRef.current !== null) cancelAnimationFrame(loopRef.current);
      loopRef.current = null;
      lastScrollRef.current = null;
      lastWheelRef.current = null;
      lastTickRef.current = null;
    };
  }, [surface.host, requestFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="scroll-smear"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface as a long exposure of itself. A passive, captured `scroll`
 * listener on `window` turns consecutive scrollY deltas into a velocity in
 * px/s, and a `wheel` listener on the host adds its own delta/dt so a wheel
 * gesture still registers once the page can't scroll any further. That
 * velocity decays by `decay` every ~16.7ms of elapsed time and its
 * magnitude becomes a blur length, which the fragment shader turns into
 * `taps` samples spread along `axis`, weighted toward the centre so the
 * page itself streaks rather than fading behind a flat blur. The loop stops
 * scheduling itself the moment the velocity settles, drawing one final
 * sharp frame instead of idling.
 * Reduced motion: SurfacePaint renders in replace mode, so this layer
 * returns null and the real, unblurred DOM shows in its place.
 */
export function ScrollSmear({
  strength = 0.06,
  decay = 0.9,
  taps = 12,
  axis = "y",
  background,
  paint,
  className,
  children,
}: ScrollSmearProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <SmearLayer
          strength={strength}
          decay={decay}
          taps={taps}
          axis={axis}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
