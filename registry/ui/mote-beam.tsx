"use client";

import * as React from "react";

import { animate, useMotionValue } from "motion/react";

import {
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
  createFullscreenTriangle,
  createGL,
  createProgram,
  onContextLoss,
  resizeGL,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import type { PaintOptions } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type MoteBeamProps = {
  /** Beam axis angle in degrees, measured from straight down; positive rotates the top of the shaft clockwise. @default -28 */
  angle?: number;
  /** Beam width in CSS pixels — the shaft's width, feathered by a smoothstep across it. @default 180 */
  width?: number;
  /** Warm-white (#fff1d6) light alpha inside the beam, multiplied by the beam mask — the page under it warms. 0 turns the tint off; the motes still show. @default 0.28 */
  warmth?: number;
  /** Mote density, 0..1 — the fraction of the 120 seeded motes drawn. 1 shows all of them. @default 1 */
  motes?: number;
  /**
   * Pointer-stir strength: a unitless multiplier over a fixed base push,
   * the same convention as `heat`/`wind` in bonfire-edge — not a raw pixel
   * value itself. Motes within 80px of the pointer are shoved clear of it.
   * @default 1
   */
  stir?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

// Sentinel pointer position, far enough outside any canvas that the stir
// falloff always reads as "no pointer" — the same convention dust-reveal and
// bonfire-edge use for their own offscreen cursors.
const OFFSCREEN = -9999;

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform float u_angle;
uniform float u_width;
uniform float u_warmth;
uniform float u_stir;
uniform float u_motes;
uniform float u_tick;
uniform vec2 u_pointer;
uniform float u_still;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

const int NUM_MOTES = 120;
const float STIR_REACH = 80.0;
const float STIR_PUSH = 40.0;

void main() {
  vec2 px = v_uv * u_res;

  // Beam mask: perpendicular distance from this pixel to a line through the
  // host's centre running at u_angle, feathered to zero across u_width, and
  // weighted stronger toward the top of the host (never fully gone at the
  // bottom).
  vec2 center = u_res * 0.5;
  vec2 axis = vec2(sin(u_angle), cos(u_angle));
  vec2 rel = px - center;
  float distFromAxis = abs(rel.x * axis.y - rel.y * axis.x);
  float halfWidth = max(u_width, 1.0) * 0.5;
  float widthMask = 1.0 - smoothstep(0.0, halfWidth, distFromAxis);
  float topT = clamp(px.y / max(u_res.y, 1.0), 0.0, 1.0);
  float topFactor = 1.0 - smoothstep(0.0, 1.0, topT);
  float mask = widthMask * mix(0.3, 1.0, topFactor);

  // A faint dark vignette outside the beam (strongest where the mask is
  // weakest) so the shaft holds contrast on a light page, not just a dark
  // one; the warm-white light layer composites over it at mask * u_warmth.
  vec3 outColor = vec3(0.0);
  float outAlpha = 0.18 * (1.0 - mask);

  vec3 warmColor = vec3(1.0, 0.9451, 0.8392); // #fff1d6
  float warmAlpha = mask * u_warmth;
  outColor = mix(outColor, warmColor, warmAlpha);
  outAlpha = warmAlpha + outAlpha * (1.0 - warmAlpha);

  // Reduced motion pins the clock at zero so every mote sits at its birth
  // position with a fixed twinkle, whatever transient tick a stray frame
  // might otherwise carry.
  float t = u_still > 0.5 ? 0.0 : u_tick;
  float wanted = clamp(u_motes, 0.0, 1.0) * float(NUM_MOTES);
  // Motes peak at 0.95 alpha inside the beam and never drop below 0.25
  // outside it, so the dust reads over a light page as well as a dark one.
  float motePeakAlpha = mix(0.25, 0.95, mask);

  float moteAlphaSum = 0.0;

  for (int i = 0; i < NUM_MOTES; i += 1) {
    if (float(i) >= wanted) continue;

    vec2 seed = vec2(float(i) * 12.9898, float(i) * 78.233);
    vec2 h = vec2(kx_hash(seed), kx_hash(seed + vec2(31.7, 47.3)));

    // Seeded drift direction with a slow sway, advanced in UV space and
    // wrapped with fract so a mote leaving one edge re-enters the other.
    float dirAngle = h.x * 6.2831853 + sin(t * 0.15 + h.y * 6.2831853) * 0.6;
    vec2 dir = vec2(cos(dirAngle), sin(dirAngle));
    float speed = (0.6 + h.y) * 6.0;
    vec2 driftUv = dir * (t * speed) / u_res;
    vec2 basePx = fract(h + driftUv) * u_res;

    // Early rejection: skip the pointer-stir and disc math for any mote
    // that could not reach this pixel even at full stir push.
    float coarse = length(px - basePx);
    if (coarse > STIR_REACH + STIR_PUSH + 4.0) continue;

    vec2 toMote = basePx - u_pointer;
    float distToPointer = length(toMote);
    float falloff = 1.0 - smoothstep(0.0, STIR_REACH, distToPointer);
    vec2 pushDir = distToPointer > 0.0001 ? toMote / distToPointer : vec2(0.0, -1.0);
    vec2 motePx = basePx + pushDir * falloff * u_stir * STIR_PUSH;

    float d = length(px - motePx);
    float discR = mix(1.5, 3.0, kx_hash(seed + vec2(5.0, 5.0)));
    if (d > discR * 2.5) continue;
    float disc = 1.0 - smoothstep(discR * 0.4, discR, d);

    float twinkle = sin(t * 3.0 + h.x * 6.2831853) * 0.5 + 0.5;
    moteAlphaSum += disc * twinkle;
  }

  // Motes are plain white — the twinkle and the beam-vs-ground peak alpha
  // do all the shaping, so no per-mote colour mix is needed.
  float moteAlpha = clamp(moteAlphaSum * motePeakAlpha, 0.0, 1.0);
  outColor = mix(outColor, vec3(1.0), moteAlpha);
  outAlpha = moteAlpha + outAlpha * (1.0 - moteAlpha);

  o_color = vec4(outColor, clamp(outAlpha, 0.0, 1.0));
}
`;

type MoteLayerProps = Required<
  Pick<MoteBeamProps, "angle" | "width" | "warmth" | "motes" | "stir">
>;

/**
 * The GL layer. Owns the context, the program, the pointer spring, the idle
 * tick and the frame loop; reads everything else from the surface. Draws no
 * texture at all — the beam and its dust are pure geometry over the real
 * DOM, never a resample of it.
 */
function MoteLayer({ angle, width, warmth, motes, stir }: MoteLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const pointerX = useMotionValue<number>(OFFSCREEN);
  const pointerY = useMotionValue<number>(OFFSCREEN);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const tickRef = React.useRef(0);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ angle, width, warmth, motes, stir });
  React.useEffect(() => {
    paramsRef.current = { angle, width, warmth, motes, stir };
  });

  // One frame: read the current params and springs, draw.
  const drawFrame = React.useCallback(() => {
    frameRef.current = null;
    const gl = glRef.current;
    const program = programRef.current;
    const tri = triRef.current;
    const canvas = canvasRef.current;
    if (!gl || !program || !tri || !canvas) return;
    if (gl.isContextLost()) return;

    const size = resizeGL(gl, canvas, { dprCap: 2 });
    const cssW = size.width / size.dpr;
    const cssH = size.height / size.dpr;
    const p = paramsRef.current;
    const live = surfaceRef.current;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.set({
      u_res: [cssW, cssH],
      u_angle: (p.angle * Math.PI) / 180,
      u_width: Math.max(p.width, 1),
      u_warmth: p.warmth,
      u_stir: p.stir,
      u_motes: p.motes,
      u_tick: tickRef.current,
      u_pointer: [pointerX.get(), pointerY.get()],
      u_still: live.motionSafe ? 0 : 1,
    });
    tri.draw();
  }, [pointerX, pointerY]);

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
    // pointer move or idle tick.
    if (surfaceRef.current.version > 0) requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      tri.dispose();
      program.dispose();
      glRef.current = null;
      programRef.current = null;
      triRef.current = null;
    };
  }, [surface.active, requestFrame]);

  // Every pointer-spring change and every completed paint asks for a frame
  // — this alone covers a reduced-motion redraw, since the idle loop below
  // never starts in that case.
  React.useEffect(() => {
    const unsubs = [pointerX, pointerY].map((mv) =>
      mv.on("change", requestFrame),
    );
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [pointerX, pointerY, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // The idle loop: continuous while visible, mirroring dust-reveal's gated
  // rAF shape (IntersectionObserver + visibilitychange, only while the
  // surface is active) — but never started at all under reduced motion,
  // which instead gets the one still frame requested above.
  React.useEffect(() => {
    if (!surface.active) return;
    const host = surface.host;
    if (!host) return;
    if (!surface.motionSafe) {
      requestFrame();
      return;
    }

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
        // Rebase the clock over the pause so drift resumes, not jumps.
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
  }, [
    surface.active,
    surface.host,
    surface.motionSafe,
    drawFrame,
    requestFrame,
  ]);

  // Pointer on the host: spring toward it so stir reads from a smoothed
  // position, snap to it under reduced motion, and spring back offscreen
  // on exit so the falloff settles to zero.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;

    const still = !surfaceRef.current.motionSafe;
    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      if (still) {
        pointerX.set(px);
        pointerY.set(py);
      } else {
        animate(pointerX, px, springs.snap);
        animate(pointerY, py, springs.snap);
      }
    };
    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      pointerX.jump(event.clientX - rect.left);
      pointerY.jump(event.clientY - rect.top);
    };
    const leave = () => {
      if (still) {
        pointerX.set(OFFSCREEN);
        pointerY.set(OFFSCREEN);
      } else {
        animate(pointerX, OFFSCREEN, springs.glide);
        animate(pointerY, OFFSCREEN, springs.glide);
      }
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
  }, [surface.host, pointerX, pointerY]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="mote-beam"
      className="block h-full w-full"
    />
  );
}

/**
 * A shaft of light across the host, and the dust drifting inside it. The
 * beam mask is pure geometry — the perpendicular distance from each pixel to
 * a line through the host's centre at `angle`, feathered by a smoothstep
 * over `width` and weighted stronger toward the top — carrying a warm-white
 * (#fff1d6) light layer at `mask * warmth`, with a faint dark vignette
 * outside the mask so the shaft holds contrast over a light page as well as
 * a dark one. The dust is not sampled from anywhere: all 120 motes are
 * seeded from their loop index alone, drifting along their own
 * slowly-swaying direction and wrapping at the edges with `fract`, then
 * pushed clear of the pointer within 80px of it; each draws as a soft white
 * disc whose peak alpha rises toward the beam's centre but never drops to
 * zero outside it, so the dust reads on any ground. Nothing about the effect
 * reads the painted texture — the DOM underneath stays exactly as real as it
 * always was, only lit from the side.
 * Reduced motion: one still frame at t = 0 — the motes sit at their seeded
 * birth position with a fixed twinkle, and the pointer's stir snaps to
 * position instead of springing.
 */
export function MoteBeam({
  angle = -28,
  width = 180,
  warmth = 0.28,
  motes = 1,
  stir = 1,
  paint,
  className,
  children,
}: MoteBeamProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <MoteLayer
          angle={angle}
          width={width}
          warmth={warmth}
          motes={motes}
          stir={stir}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
