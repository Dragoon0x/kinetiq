"use client";

import * as React from "react";

import { animate, useMotionValue } from "motion/react";

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
import { springs } from "@/registry/lib/motion";
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type VortexPullProps = {
  /** Reach of the vortex around the (sprung) pointer, in CSS pixels. @default 200 */
  radius?: number;
  /** The twist's ceiling while held, in turns. @default 1.5 */
  strength?: number;
  /** How fast the twist winds up toward `strength` while held, in turns per second. @default 1.2 */
  windup?: number;
  /** Scales the stiffness of the spring that pulls the twist back to zero after release — higher snaps back harder without changing how much it overshoots. @default 1 */
  release?: number;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec2 u_pointer;
uniform float u_radius;
uniform float u_twist;
uniform float u_still;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  if (u_still > 0.5) {
    // Reduced motion: the vortex never engages. No still outline either —
    // the only honest reduced-motion frame here is an empty one.
    o_color = vec4(0.0);
    return;
  }

  vec2 px = v_uv * u_res;
  vec2 d = px - u_pointer;
  float dist = length(d);
  float R = max(u_radius, 1.0);
  if (dist >= R) {
    o_color = vec4(0.0);
    return;
  }

  float fall = 1.0 - dist / R;
  float angle = u_twist * 6.28318530718 * fall * fall;

  // Inverse-map the sample: the colour drawn at this pixel is whatever page
  // pixel would land here after the page is rotated forward by angle
  // about the pointer — so the source offset is this pixel's own offset
  // from the pointer, rotated backward by the same angle.
  float ca = cos(-angle);
  float sa = sin(-angle);
  vec2 rotated = vec2(d.x * ca - d.y * sa, d.x * sa + d.y * ca);
  vec3 color = sampleOver((u_pointer + rotated) / u_res);

  // A faint dark centre that deepens with how far the twist is wound, in
  // either direction.
  float vignette = clamp(
    (1.0 - smoothstep(0.0, R * 0.5, dist)) * abs(u_twist) * 0.4,
    0.0,
    1.0
  );
  color = mix(color, vec3(0.0), vignette);

  // Full strength near the pointer, fading to nothing by the rim. Written
  // ascending (inner edge below outer edge) because GLSL ES 3.0 needs
  // edge0 < edge1 for smoothstep — this is the ascending form of the same
  // falloff, full near the centre and gone by the rim.
  float ring = 1.0 - smoothstep(R * 0.8, R, dist);
  float alpha = ring * min(1.0, abs(u_twist) * 8.0);

  o_color = vec4(color, alpha);
}
`;

type Twist = { value: number; velocity: number };

/** Per-frame damped-spring constants for the release relax: ζ < 1, so the
 * twist rings slightly past zero before settling rather than easing in
 * flat. `release` scales stiffness only — the character (how much it
 * overshoots) stays fixed, only the pace changes. */
const RELEASE_STIFFNESS = 0.18;
const RELEASE_DAMPING = 0.82;
/** Combined |velocity| + |value| below which the release spring counts as
 * settled and the loop stops asking for another frame. */
const TWIST_STOP = 0.002;

/** Ramps `twist.value` toward `cap` at `rate` turns/sec while held.
 * Winding up is a plain ramp, not a spring, so velocity stays at zero here
 * — release always starts the relax spring from rest, never carrying a
 * windup rate into it. Module-level, mirroring honey-glass's stepSpring,
 * so the hold effect below never mutates the ref's fields inline. */
function windUp(twist: Twist, rate: number, dt: number, cap: number): void {
  twist.velocity = 0;
  twist.value = Math.min(cap, twist.value + rate * dt);
}

/** One per-frame step of a damped spring pulling `twist.value` back to
 * zero — honey-glass's stepSpring, for a scalar instead of a Vec2. */
function stepRelease(twist: Twist, stiffness: number, damping: number): void {
  const accel = -twist.value * stiffness;
  twist.velocity = (twist.velocity + accel) * damping;
  twist.value += twist.velocity;
}

/** Walks up from the host to the first opaque background colour, so a
 * sample over a transparent texture region composites onto the page
 * rather than onto black. Mirrors crystal-lens's effectiveBackground. */
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

type VortexLayerProps = Required<
  Pick<VortexPullProps, "radius" | "strength" | "windup" | "release">
>;

/**
 * The GL layer. Owns the context, the program, the texture, the sprung
 * pointer position, the CPU-stepped twist, and the frame loop; reads
 * everything else from the surface.
 */
function VortexLayer({ radius, strength, windup, release }: VortexLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const x = useMotionValue<number>(-9999);
  const y = useMotionValue<number>(-9999);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const failedRef = React.useRef(false);

  // The twist lives entirely in a ref as a plain CPU value — never a
  // motion value, per the brief. `holdingRef` is the only other state the
  // hold/release loop needs.
  const twistRef = React.useRef<Twist>({ value: 0, velocity: 0 });
  const holdingRef = React.useRef(false);
  const lastTimeRef = React.useRef<number | null>(null);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ radius, strength, windup, release });
  React.useEffect(() => {
    paramsRef.current = { radius, strength, windup, release };
  });

  // One frame: upload the texture if a new paint landed, then draw at
  // wherever the pointer spring and the twist currently sit.
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
      u_pointer: [x.get(), y.get()],
      u_radius: p.radius,
      u_twist: twistRef.current.value,
      u_still: live.motionSafe ? 0 : 1,
      u_bg: bgRef.current,
    });
    tri.draw();
  }, [x, y]);

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

  // Every pointer-spring tick asks for a frame.
  React.useEffect(() => {
    const unsubs = [x, y].map((mv) => mv.on("change", requestFrame));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [x, y, requestFrame]);

  // Every completed paint asks for a frame too, so the vortex samples the
  // live page even while the twist itself is at rest.
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Pointer on the host, and the hold/release loop it drives. Position
  // follows the pointer on a spring, so the vortex's centre is never the
  // pointer's raw, jittery reading. The twist is a hold-driven ramp on the
  // way up and a damped spring on the way down, stepped by a
  // self-scheduling loop gated on the surface being active, the host on
  // screen, and the tab visible — and it stops the moment the twist
  // itself stops changing, whether that's because it hit its cap while
  // still held or because the release spring has settled.
  React.useEffect(() => {
    if (!surface.active) return;
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host);

    let raf = 0;
    let inView = false;

    const stepTwist = (now: number) => {
      raf = 0;
      const dt =
        lastTimeRef.current === null ? 0 : (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      const p = paramsRef.current;
      const twist = twistRef.current;

      if (holdingRef.current) {
        windUp(twist, p.windup, dt, p.strength);
      } else {
        stepRelease(
          twist,
          RELEASE_STIFFNESS * Math.max(p.release, 0),
          RELEASE_DAMPING,
        );
      }
      requestFrame();

      const changing = holdingRef.current
        ? twist.value < p.strength
        : Math.abs(twist.velocity) + Math.abs(twist.value) > TWIST_STOP;

      if (inView && !document.hidden && changing) {
        raf = requestAnimationFrame(stepTwist);
      } else {
        lastTimeRef.current = null;
      }
    };

    const ensureRunning = () => {
      if (raf !== 0 || !inView || document.hidden) return;
      if (!surfaceRef.current.motionSafe) return;
      raf = requestAnimationFrame(stepTwist);
    };

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      if (surfaceRef.current.motionSafe) {
        animate(x, px, springs.snap);
        animate(y, py, springs.snap);
      } else {
        x.set(px);
        y.set(py);
      }
    };
    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      x.jump(event.clientX - rect.left);
      y.jump(event.clientY - rect.top);
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const rect = host.getBoundingClientRect();
      x.jump(event.clientX - rect.left);
      y.jump(event.clientY - rect.top);
      holdingRef.current = true;
      lastTimeRef.current = null;
      ensureRunning();
    };
    const up = () => {
      holdingRef.current = false;
      lastTimeRef.current = null;
      ensureRunning();
    };

    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerdown", down);
    host.addEventListener("pointerup", up);
    host.addEventListener("pointercancel", up);

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
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerdown", down);
      host.removeEventListener("pointerup", up);
      host.removeEventListener("pointercancel", up);
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [surface.active, surface.host, x, y, requestFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="vortex-pull"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface caught in a vortex under the pointer. Press and hold, and a
 * CPU-stepped twist ramps up at `windup` turns per second toward `strength`;
 * the fragment shader rotates every sample of the painted page about the
 * (sprung) pointer by that twist times a squared radial falloff, so the
 * centre spins hardest and the rim barely turns. Release, and the twist
 * doesn't just fall to zero — it rings back on a damped per-frame spring
 * tuned to overshoot slightly, so the page snaps past level before it
 * settles. The loop that steps the twist runs only while it's actually
 * changing — winding up, or still ringing down after release — and stops
 * itself the moment it's flat again.
 * Reduced motion: the vortex never engages; the layer draws nothing and the
 * real page shows through untouched.
 */
export function VortexPull({
  radius = 200,
  strength = 1.5,
  windup = 1.2,
  release = 1,
  paint,
  className,
  children,
}: VortexPullProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <VortexLayer
          radius={radius}
          strength={strength}
          windup={windup}
          release={release}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
