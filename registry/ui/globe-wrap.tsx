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

export type GlobeWrapProps = {
  /** Sphere radius, as a fraction of min(width, height) / 2. @default 0.9 */
  radius?: number;
  /** Axial tilt of the spin axis, in degrees. @default 18 */
  tilt?: number;
  /** Per-second velocity decay after release — lower burns off the spin faster. @default 0.12 */
  inertia?: number;
  /** Atmosphere glow strength at the rim (0..1). @default 0.6 */
  atmosphere?: number;
  /** Fill for the disc's surroundings. Defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_sphereRadius;
uniform float u_tilt;
uniform float u_spin;
uniform float u_atmosphere;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  vec2 px = v_uv * u_res;
  vec2 p = px - u_res * 0.5;
  float r = length(p);
  float R = max(u_sphereRadius, 1.0);

  if (r > R) {
    // Outside the disc: the background, with a thin blue-white atmosphere
    // glow fading out within 6% of R past the edge.
    float band = max(R * 0.06, 0.001);
    float t = clamp((r - R) / band, 0.0, 1.0);
    float glow = (1.0 - smoothstep(0.0, 1.0, t)) * u_atmosphere;
    vec3 haze = vec3(0.75, 0.85, 1.0);
    o_color = vec4(mix(u_bg.rgb, haze, glow), 1.0);
    return;
  }

  // Ray-sphere: the near hemisphere's height at this pixel, then the surface
  // normal there.
  float z = sqrt(max(R * R - r * r, 0.0));
  vec3 n = vec3(p.x, p.y, z) / R;

  // Axial tilt — rotate the normal about x.
  float ct = cos(u_tilt);
  float st = sin(u_tilt);
  n = vec3(n.x, n.y * ct - n.z * st, n.y * st + n.z * ct);

  // Spin — rotate about y. This is the same normal the lighting below reads,
  // so the lit hemisphere turns with the globe, the way a real sphere under
  // a fixed light would.
  float cs = cos(u_spin);
  float ss = sin(u_spin);
  n = vec3(n.x * cs + n.z * ss, n.y, -n.x * ss + n.z * cs);

  // Spherical UV: the texture wraps twice around the equator and once,
  // full height, from pole to pole.
  float u = atan(n.z, n.x) / 6.2831853 + 0.5;
  // DOM y runs down the page, so the sphere's up pole takes the top row.
  float v = acos(clamp(-n.y, -1.0, 1.0)) / 3.14159265;
  vec3 base = sampleOver(vec2(fract(u * 2.0), v));

  // Lighting: a fixed upper-left key light, a grazing-angle rim shade off
  // the screen-space edge distance, and a small specular glint.
  vec3 light = normalize(vec3(-0.55, -0.6, 0.58));
  float diffuse = max(dot(n, light), 0.0) * 0.65 + 0.35;
  float edge = r / R;
  float shade = 1.0 - 0.25 * smoothstep(0.7, 1.0, edge);
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 halfVec = normalize(light + viewDir);
  float spec = pow(max(dot(n, halfVec), 0.0), 24.0) * 0.35;

  vec3 color = base * diffuse * shade + spec;
  o_color = vec4(color, 1.0);
}
`;

/** px of pointer travel mapped to radians of spin per drag move. */
const DRAG_TO_SPIN = 0.005;
/** Below this angular speed the globe reads as still; the loop stops rather than idling forever. */
const SPIN_STOP = 0.001;
/** A defensive ceiling on the fling speed a single pointer event can hand the decay loop — real drags never approach it. */
const MAX_SPIN_VELOCITY = 40;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Walks up from the host to the first opaque background colour, so the
 * disc's surroundings composite onto the page rather than onto black. */
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

type GlobeLayerProps = Required<
  Pick<GlobeWrapProps, "radius" | "tilt" | "inertia" | "atmosphere">
> & { background?: string };

/**
 * The GL layer. Owns the context, the program, the texture, the spin angle
 * and its release velocity, and the frame loop; reads everything else from
 * the surface.
 */
function GlobeLayer({
  radius,
  tilt,
  inertia,
  atmosphere,
  background,
}: GlobeLayerProps) {
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

  // Spin state lives entirely in refs — a plain angle and its release
  // velocity, never a spring: the contract is a direct drag plus a decaying
  // fling, not a physics toy.
  const spinAngleRef = React.useRef(0);
  const velocityRef = React.useRef(0);
  const draggingRef = React.useRef(false);
  const lastPointerXRef = React.useRef(0);
  const lastPointerTRef = React.useRef(0);
  const spinFrameRef = React.useRef<number | null>(null);
  const lastSpinTsRef = React.useRef<number | null>(null);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ radius, tilt, inertia, atmosphere });
  React.useEffect(() => {
    paramsRef.current = { radius, tilt, inertia, atmosphere };
  });

  // One frame: upload the texture if a new paint landed, then draw.
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
    const sphereRadius = p.radius * Math.min(cssW, cssH) * 0.5;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_sphereRadius: sphereRadius,
      u_tilt: (p.tilt * Math.PI) / 180,
      u_spin: spinAngleRef.current,
      u_atmosphere: p.atmosphere,
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
      if (spinFrameRef.current !== null)
        cancelAnimationFrame(spinFrameRef.current);
      spinFrameRef.current = null;
      failedRef.current = true;
    });
    // A paint may already be waiting: draw it now rather than on the next
    // pointer move.
    if (surfaceRef.current.version > 0) requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (spinFrameRef.current !== null)
        cancelAnimationFrame(spinFrameRef.current);
      spinFrameRef.current = null;
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

  // Every completed paint asks for a frame, even while the globe is at rest.
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Colours resolve against the host once it exists, and again if the
  // caller changes them — `var(--token)` needs the host's computed style to
  // read the theme that actually applies to it.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    requestFrame();
  }, [surface.host, background, requestFrame]);

  // Pointer on the host: press starts a drag, move adds straight to the
  // spin angle and records a velocity, release hands that velocity to a
  // small decay loop. The loop is a plain local function that reschedules
  // itself only while there is still spin left to bleed off.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;

    const stepSpin = (timestamp: number) => {
      spinFrameRef.current = null;
      if (!surfaceRef.current.active) {
        velocityRef.current = 0;
        lastSpinTsRef.current = null;
        return;
      }
      const lastTs = lastSpinTsRef.current;
      const dt =
        lastTs === null ? 0 : Math.min((timestamp - lastTs) / 1000, 0.1);
      lastSpinTsRef.current = timestamp;
      if (dt > 0) {
        spinAngleRef.current += velocityRef.current * dt;
        velocityRef.current *= Math.pow(paramsRef.current.inertia, dt);
      }
      requestFrame();
      if (Math.abs(velocityRef.current) >= SPIN_STOP) {
        spinFrameRef.current = requestAnimationFrame(stepSpin);
      } else {
        velocityRef.current = 0;
        lastSpinTsRef.current = null;
      }
    };

    const startSpinLoop = () => {
      if (spinFrameRef.current !== null) return;
      if (Math.abs(velocityRef.current) < SPIN_STOP) return;
      lastSpinTsRef.current = null;
      spinFrameRef.current = requestAnimationFrame(stepSpin);
    };

    let captured = false;
    const down = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (spinFrameRef.current !== null) {
        cancelAnimationFrame(spinFrameRef.current);
        spinFrameRef.current = null;
      }
      draggingRef.current = true;
      velocityRef.current = 0;
      lastPointerXRef.current = event.clientX;
      lastPointerTRef.current = event.timeStamp;
      captured = false;
    };

    const move = (event: PointerEvent) => {
      if (!draggingRef.current) return;
      const dx = event.clientX - lastPointerXRef.current;
      // Capture only once a real drag has begun, so a plain click on a
      // control under the globe still reaches it.
      if (!captured && Math.abs(dx) > 4) {
        host.setPointerCapture(event.pointerId);
        captured = true;
      }
      const dt = Math.max(
        (event.timeStamp - lastPointerTRef.current) / 1000,
        1 / 240,
      );
      const delta = dx * DRAG_TO_SPIN;
      spinAngleRef.current += delta;
      velocityRef.current = clamp(
        delta / dt,
        -MAX_SPIN_VELOCITY,
        MAX_SPIN_VELOCITY,
      );
      lastPointerXRef.current = event.clientX;
      lastPointerTRef.current = event.timeStamp;
      requestFrame();
    };

    const up = (event: PointerEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      if (host.hasPointerCapture?.(event.pointerId)) {
        host.releasePointerCapture(event.pointerId);
      }
      startSpinLoop();
    };

    host.addEventListener("pointerdown", down);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerup", up);
    host.addEventListener("pointercancel", up);
    return () => {
      host.removeEventListener("pointerdown", down);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerup", up);
      host.removeEventListener("pointercancel", up);
      draggingRef.current = false;
      if (spinFrameRef.current !== null)
        cancelAnimationFrame(spinFrameRef.current);
      spinFrameRef.current = null;
    };
  }, [surface.host, requestFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="globe-wrap"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface, ray-cast onto a sphere sitting in the middle of the host.
 * One fragment shader does all of it: outside the disc it is background plus
 * a thin atmosphere glow; inside, each pixel's own surface normal — tilted
 * on its axis and spun by however far the drag has travelled — looks up the
 * painted DOM texture, wrapping it twice around the equator and once, full
 * height, from pole to pole, then lights it from a fixed upper-left key with
 * a grazing rim shade and a small specular glint. A drag adds straight to
 * the spin angle; letting go hands the last swipe's speed to a small decay
 * loop that keeps the globe turning until it drops below a thousandth of a
 * radian per second, at which point it stops asking for frames rather than
 * idling forever. Nothing moves on its own — no pointer, no spin.
 * Reduced motion: `SurfacePaint` renders in replace mode, so the layer
 * returns null and the real, flat DOM shows in its place.
 */
export function GlobeWrap({
  radius = 0.9,
  tilt = 18,
  inertia = 0.12,
  atmosphere = 0.6,
  background,
  paint,
  className,
  children,
}: GlobeWrapProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn("cursor-grab touch-none", className)}
      effect={
        <GlobeLayer
          radius={radius}
          tilt={tilt}
          inertia={inertia}
          atmosphere={atmosphere}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
