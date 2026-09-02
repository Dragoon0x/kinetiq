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
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type TiltPlateProps = {
  /** Peak rotation at the pointer's own edge of the host, in degrees. @default 10 */
  angle?: number;
  /** Camera distance from the screen plane, in CSS px — lower reads more dramatic. @default 900 */
  perspective?: number;
  /** Specular sheen strength on the tilted face (0..1). @default 0.35 */
  sheen?: number;
  /** Drop-shadow strength under the raised edge (0..1). @default 0.35 */
  shadow?: number;
  /** Fill for the page around the tilted plate's silhouette. Defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_ax;
uniform float u_ay;
uniform float u_perspective;
uniform float u_sheen;
uniform float u_shadow;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

void main() {
  vec2 res = u_res;
  vec2 center = res * 0.5;
  float camDist = max(u_perspective, 1.0);

  float sax = sin(u_ax);
  float cax = cos(u_ax);
  float say = sin(u_ay);
  float cay = cos(u_ay);

  // The plate's own axes and face normal in screen space, built by rotating
  // the flat plate ax about x then ay about y — the same order the pointer
  // handler composes its target angles in, so the corner nearest the
  // cursor swings toward the camera rather than away from it.
  vec3 ex = vec3(cay, 0.0, -say);
  vec3 ey = vec3(sax * say, cax, sax * cay);
  vec3 normal = vec3(cax * say, -sax, cax * cay);

  // A camera sits on the +z axis, u_perspective px in front of the screen
  // plane (z = 0); the ray for this pixel runs from the eye through the
  // pixel's own position on that plane, then on into the scene.
  vec3 eye = vec3(center, camDist);
  vec3 screenPoint = vec3(v_uv * res, 0.0);
  vec3 dir = screenPoint - eye;
  float denom = dot(normal, dir);

  vec2 plateUv = vec2(2.0);
  vec3 hit = screenPoint;
  if (abs(denom) > 0.0001) {
    float t = -dot(normal, eye - vec3(center, 0.0)) / denom;
    hit = eye + dir * t;
    vec3 rel = hit - vec3(center, 0.0);
    plateUv = vec2(dot(ex, rel) / res.x + 0.5, dot(ey, rel) / res.y + 0.5);
  }

  bool inside = plateUv.x >= 0.0 && plateUv.x <= 1.0 &&
                plateUv.y >= 0.0 && plateUv.y <= 1.0;

  if (inside) {
    vec4 tex = texture(u_tex, plateUv);
    vec3 base = mix(u_bg.rgb, tex.rgb, tex.a);

    vec3 light = normalize(vec3(-0.4, -0.6, 0.7));
    vec3 view = normalize(eye - hit);
    vec3 halfVector = normalize(light + view);
    float sheen = pow(max(dot(normal, halfVector), 0.0), 24.0) * u_sheen;
    float diffuse = 0.9 + 0.1 * dot(normal, light);

    o_color = vec4(base * diffuse + vec3(sheen), 1.0);
    return;
  }

  // Off the plate: the host's own background, darkened by a soft shadow
  // that pools toward whichever edge the tilt lifts closest to the camera,
  // so that edge reads as clear of the page rather than merely rotated.
  vec2 excess = max(vec2(0.0), max(-plateUv, plateUv - 1.0));
  float outsideDist = length(excess);
  vec2 raised = vec2(-say, sax);
  float raisedLen = length(raised);
  vec2 outward = v_uv - vec2(0.5);
  float outwardLen = length(outward);
  float dirWeight = (raisedLen > 0.0001 && outwardLen > 0.0001)
    ? clamp(dot(outward / outwardLen, raised / raisedLen), 0.0, 1.0)
    : 0.0;
  float falloff = 1.0 - smoothstep(0.0, 0.4, outsideDist);
  float shadowAlpha = u_shadow * dirWeight * falloff;
  o_color = vec4(u_bg.rgb * (1.0 - shadowAlpha * 0.6), 1.0);
}
`;

/** Walks up from the host to the first opaque background colour, so pixels
 * off the tilted plate composite onto the page rather than onto black. */
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

type PlateLayerProps = Required<
  Pick<TiltPlateProps, "angle" | "perspective" | "sheen" | "shadow">
> & { background?: string };

/**
 * The GL layer. Owns the context, the program, the texture, the two
 * pointer-sprung tilt angles, and the frame loop; reads everything else
 * from the surface.
 */
function PlateLayer({
  angle,
  perspective,
  sheen,
  shadow,
  background,
}: PlateLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const ax = useMotionValue<number>(0);
  const ay = useMotionValue<number>(0);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ angle, perspective, sheen, shadow });
  React.useEffect(() => {
    paramsRef.current = { angle, perspective, sheen, shadow };
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
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_ax: ax.get(),
      u_ay: ay.get(),
      u_perspective: p.perspective,
      u_sheen: p.sheen,
      u_shadow: p.shadow,
      u_bg: bgRef.current,
    });
    tri.draw();
  }, [ax, ay]);

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

  // Every spring tick and every completed paint asks for a frame. The
  // springs stop emitting "change" once they settle, so the loop stops
  // itself with them — nothing here schedules a frame on a timer.
  React.useEffect(() => {
    const unsubs = [ax, ay].map((mv) => mv.on("change", requestFrame));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [ax, ay, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Background colour, resolved against the host once it exists and again
  // if the caller changes it — `var(--token)` needs the host's computed
  // style to read the theme that actually applies to it.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    requestFrame();
  }, [surface.host, background, requestFrame]);

  // Pointer on the host: spring ax/ay toward the pointer's offset from
  // centre, and back to flat the moment it leaves.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;

    const move = (event: PointerEvent) => {
      if (!surfaceRef.current.motionSafe) return;
      const rect = host.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const halfW = rect.width / 2;
      const halfH = rect.height / 2;
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const deg = paramsRef.current.angle;
      const targetAxDeg = ((py - halfH) / halfH) * deg;
      const targetAyDeg = -((px - halfW) / halfW) * deg;
      animate(ax, targetAxDeg * (Math.PI / 180), springs.glide);
      animate(ay, targetAyDeg * (Math.PI / 180), springs.glide);
    };
    const leave = () => {
      animate(ax, 0, springs.glide);
      animate(ay, 0, springs.glide);
    };

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
    };
  }, [surface.host, ax, ay]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="tilt-plate"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface as a rigid plate that tilts to face the pointer, with real
 * perspective. One fragment shader casts a ray from a camera `perspective`
 * px above the screen through every pixel and intersects it with the plate
 * rotated by two pointer-driven angles, so the painted texture reads back
 * correctly foreshortened rather than merely skewed. The angles are two
 * motion values on `springs.glide`, chasing the pointer's offset from
 * centre and drifting back to flat the instant it leaves; a thin specular
 * sheen tracks the tilt like light off glass, and a soft shadow gathers
 * under whichever edge lifts toward the camera.
 * Reduced motion: `SurfacePaint` renders in replace mode, so this layer
 * returns null and the real, flat DOM shows in its place.
 */
export function TiltPlate({
  angle = 10,
  perspective = 900,
  sheen = 0.35,
  shadow = 0.35,
  background,
  paint,
  className,
  children,
}: TiltPlateProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={className}
      effect={
        <PlateLayer
          angle={angle}
          perspective={perspective}
          sheen={sheen}
          shadow={shadow}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
