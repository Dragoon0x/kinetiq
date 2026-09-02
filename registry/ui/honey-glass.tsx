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
import { clamp } from "@/registry/lib/spatial";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type HoneyGlassProps = {
  /** How thick the honey feels: scales both the bulge spring's pull and its velocity retention. Higher is slower to follow. @default 1 */
  viscosity?: number;
  /** Inward pull at the bulge's centre, in CSS pixels. @default 28 */
  bulge?: number;
  /** Reach of the bulge from its centre, in CSS pixels. @default 220 */
  radius?: number;
  /** Amber tint mixed into the bulge at full amplitude. Any CSS colour. @default "#d9931a" */
  tint?: string;
  /** Specular sheen strength across the bulge's dome (0..1-ish). @default 0.6 */
  sheen?: number;
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
uniform vec2 u_center;
uniform float u_radius;
uniform float u_bulge;
uniform float u_amplitude;
uniform vec3 u_tint;
uniform float u_sheen;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  vec2 px = v_uv * u_res;
  vec2 d = px - u_center;
  float r = length(d);
  float R = max(u_radius, 1.0);
  float t = clamp(r / R, 0.0, 1.0);
  // A dome-shaped bell: 1 at the centre, easing smoothly to 0 at the rim.
  float profile = 1.0 - smoothstep(0.0, 1.0, t);
  vec2 dir = r > 0.0 ? d / r : vec2(0.0);

  // Every sample is pulled toward the bulge centre by the profile times the
  // current amplitude, so the page reads as pooled and drawn inward, the
  // way a surface sags under something heavy and slow rather than being
  // pushed up the way a blister would be.
  vec2 offsetPx = -dir * u_bulge * profile * u_amplitude;
  vec3 color = sampleOver((px + offsetPx) / u_res);

  color = mix(color, u_tint, profile * u_amplitude * 0.35);

  // Specular sheen: the dome's own slope is steepest partway between the
  // centre and the rim, and zero at both, so lighting it from a fixed
  // upper-left direction lands a soft ring on the near-pointer face of the
  // bulge rather than a flat glow across the whole dome.
  float slope = 6.0 * t * (1.0 - t);
  vec2 light = normalize(vec2(-0.6, -0.8));
  float facing = max(dot(-dir, light), 0.0);
  float sheenAmt = slope * facing * u_amplitude * u_sheen;
  color += vec3(sheenAmt);

  o_color = vec4(color, 1.0);
}
`;

type Vec2 = { x: number; y: number };

/** Per-frame constants for the bulge centre's damped spring: weak enough,
 * and retentive enough of its own velocity, that it reads as dragging
 * through something thick rather than snapping to the pointer. `viscosity`
 * scales both terms the same direction, so a thicker honey is slower
 * everywhere rather than differently shaped. */
const STIFFNESS = 0.02;
const DAMPING = 0.92;
/** Seconds for the bulge amplitude to rise to 1 while the pointer is over
 * the surface, and to fall back to 0 once it leaves. */
const RISE_SECONDS = 1.2;
const FALL_SECONDS = 2;
/** Combined velocity + distance-to-target below which the spring counts as settled. */
const SPRING_STOP = 0.02;

/** One damped-spring step of `pos`/`vel` toward `target`, mutated in place.
 * Kept out of the hook body per house convention — see warp-grid's
 * integrateField / applyImpulse, which do the same for their own field. */
function stepSpring(
  pos: Vec2,
  vel: Vec2,
  target: Vec2,
  stiffness: number,
  damping: number,
): void {
  const ax = (target.x - pos.x) * stiffness;
  const ay = (target.y - pos.y) * stiffness;
  vel.x = (vel.x + ax) * damping;
  vel.y = (vel.y + ay) * damping;
  pos.x += vel.x;
  pos.y += vel.y;
}

/** Walks up from the host to the first opaque background colour, so a
 * sample over a transparent texture region composites onto the page rather
 * than onto black. Mirrors crystal-lens's `effectiveBackground`. */
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

type HoneyGlassLayerProps = Required<
  Pick<HoneyGlassProps, "viscosity" | "bulge" | "radius" | "tint" | "sheen">
> & { background?: string };

/**
 * The GL layer. Owns the context, the program, the page texture, the CPU
 * spring driving the bulge centre, its amplitude, and the frame loop;
 * reads everything else from the surface.
 */
function HoneyGlassLayer({
  viscosity,
  bulge,
  radius,
  tint,
  sheen,
  background,
}: HoneyGlassLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const tintRef = React.useRef<[number, number, number]>([1, 1, 1]);
  const failedRef = React.useRef(false);

  // The spring and its amplitude live entirely in refs — a plain CPU
  // simulation, never motion values, per the brief.
  const posRef = React.useRef<Vec2>({ x: 0, y: 0 });
  const velRef = React.useRef<Vec2>({ x: 0, y: 0 });
  const targetRef = React.useRef<Vec2>({ x: 0, y: 0 });
  const ampRef = React.useRef(0);
  const insideRef = React.useRef(false);
  const lastTimeRef = React.useRef<number | null>(null);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ viscosity, bulge, radius, sheen });
  React.useEffect(() => {
    paramsRef.current = { viscosity, bulge, radius, sheen };
  });

  // One frame: upload the texture if a new paint landed, then draw the
  // bulge at wherever the spring and amplitude currently sit.
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
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_center: [posRef.current.x, posRef.current.y],
      u_radius: p.radius,
      u_bulge: p.bulge,
      u_amplitude: ampRef.current,
      u_tint: tintRef.current,
      u_sheen: p.sheen,
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

  // Every completed paint asks for a frame, even while the bulge is at rest.
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Colours are resolved against the host once it exists, and again if the
  // caller changes them — `background` may be a `var(--token)`, though
  // `tint` defaults to a literal hex rather than a token.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    const resolvedTint = resolveColor(tint, host);
    tintRef.current = [resolvedTint[0], resolvedTint[1], resolvedTint[2]];
    requestFrame();
  }, [surface.host, background, tint, requestFrame]);

  // Pointer on the host, and the spring/amplitude loop it drives. The loop
  // only exists to move the bulge toward the pointer and ease its
  // amplitude up or down, so it's driven by the same pointer state that
  // feeds it, gated by the surface being active, the host on screen, and
  // the tab visible — and it stops itself once the spring has caught the
  // target and the amplitude has finished easing.
  React.useEffect(() => {
    if (!surface.active) return;
    const host = surface.host;
    if (!host) return;

    let raf = 0;
    let inView = false;

    const stepSimulation = (now: number) => {
      raf = 0;
      const dt =
        lastTimeRef.current === null ? 0 : (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      const p = paramsRef.current;
      const viscosity = Math.max(p.viscosity, 0.0001);
      const stiffness = STIFFNESS / viscosity;
      const damping = clamp(1 - (1 - DAMPING) * viscosity, 0, 0.999);
      stepSpring(
        posRef.current,
        velRef.current,
        targetRef.current,
        stiffness,
        damping,
      );

      const rate = insideRef.current ? 1 / RISE_SECONDS : -1 / FALL_SECONDS;
      ampRef.current = clamp(ampRef.current + rate * dt, 0, 1);
      requestFrame();

      const vel = velRef.current;
      const dx = targetRef.current.x - posRef.current.x;
      const dy = targetRef.current.y - posRef.current.y;
      const springEnergy =
        Math.abs(vel.x) + Math.abs(vel.y) + Math.abs(dx) + Math.abs(dy);
      const ampSettled = insideRef.current
        ? ampRef.current >= 1
        : ampRef.current <= 0;
      const settled = springEnergy <= SPRING_STOP && ampSettled;

      if (inView && !document.hidden && !settled) {
        raf = requestAnimationFrame(stepSimulation);
      } else {
        lastTimeRef.current = null;
      }
    };

    const ensureRunning = () => {
      if (raf !== 0 || !inView || document.hidden) return;
      raf = requestAnimationFrame(stepSimulation);
    };

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      targetRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      // A fresh approach starts the bulge under the pointer rather than
      // dragging it in from wherever it last settled; only the follow lags.
      if (ampRef.current <= 0) {
        posRef.current = { x: targetRef.current.x, y: targetRef.current.y };
        velRef.current = { x: 0, y: 0 };
      }
      insideRef.current = true;
      ensureRunning();
    };
    const leave = () => {
      insideRef.current = false;
      ensureRunning();
    };

    host.addEventListener("pointerenter", move);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);

    const intersection = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) inView = last.isIntersecting;
      if (inView) {
        ensureRunning();
      } else if (raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
        lastTimeRef.current = null;
      }
    });
    intersection.observe(host);

    const onVisibility = () => {
      if (document.hidden) {
        if (raf !== 0) {
          cancelAnimationFrame(raf);
          raf = 0;
          lastTimeRef.current = null;
        }
      } else {
        ensureRunning();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      host.removeEventListener("pointerenter", move);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [surface.active, surface.host, requestFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="honey-glass"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface under honey. A bulge follows the pointer on a heavily
 * damped CPU spring — weak stiffness and high velocity retention, both
 * scaled together by `viscosity` — so it drags rather than snaps, and its
 * amplitude eases up over about 1.2s while the pointer is present and back
 * down over about 2s once it leaves. Where the shader's dome reaches, it
 * pulls the page inward toward the centre, warms it with an amber tint,
 * and catches a soft specular sheen on the near-pointer slope. The
 * simulation runs only while the spring hasn't caught its target or the
 * amplitude hasn't finished easing, and stops itself once both are still.
 * Reduced motion: `SurfacePaint`'s replace-mode contract handles it — the
 * real DOM shows at full opacity and this layer renders nothing.
 */
export function HoneyGlass({
  viscosity = 1,
  bulge = 28,
  radius = 220,
  tint = "#d9931a",
  sheen = 0.6,
  background,
  paint,
  className,
  children,
}: HoneyGlassProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={className}
      effect={
        <HoneyGlassLayer
          viscosity={viscosity}
          bulge={bulge}
          radius={radius}
          tint={tint}
          sheen={sheen}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
