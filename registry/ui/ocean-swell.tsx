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

export type OceanSwellProps = {
  /** Seconds for one full rise-and-fall of the swell. @default 7 */
  period?: number;
  /** Peak vertical bob at the crest, in CSS pixels. @default 6 */
  heave?: number;
  /** Peak tilt at the steepest point of the roll, in degrees. @default 1.6 */
  roll?: number;
  /** Specular sheen strength on the tilted face (0..1). @default 0.3 */
  sheen?: number;
  /** Fill for the page around the plate's silhouette. Defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const DEG2RAD = Math.PI / 180;

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_ax;
uniform float u_ay;
uniform float u_heave;
uniform float u_sheen;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

void main() {
  vec2 res = u_res;
  vec2 center = res * 0.5;
  // A fixed camera above the screen plane -- the swell moves the plate,
  // never the eye.
  float camDist = 1200.0;

  float sax = sin(u_ax);
  float cax = cos(u_ax);
  float say = sin(u_ay);
  float cay = cos(u_ay);

  // The plate's own axes and face normal in screen space, built the same
  // way tilt-plate builds them, just fed time-driven angles instead of
  // pointer-driven ones.
  vec3 ex = vec3(cay, 0.0, -say);
  vec3 ey = vec3(sax * say, cax, sax * cay);
  vec3 normal = vec3(cax * say, -sax, cax * cay);

  vec3 eye = vec3(center, camDist);
  // The heave offsets which screen pixel the ray is cast through, which
  // reads on screen as the whole plate rising and settling.
  vec3 screenPoint = vec3(v_uv * res + vec2(0.0, u_heave), 0.0);
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

  if (!inside) {
    // Off the plate: the host's own background, so the page reads as one
    // solid surface underneath.
    o_color = vec4(u_bg.rgb, 1.0);
    return;
  }

  // On the plate but over a transparent texel (a rounded corner, a gap in
  // the painted DOM): fade to the same background rather than showing black.
  vec4 tex = texture(u_tex, plateUv);
  vec3 base = mix(u_bg.rgb, tex.rgb, tex.a);

  // A soft specular band: a fixed light caught on a normal that keeps
  // rotating, so the highlight drifts across the surface as the plate
  // rolls. A wide smoothstep reads as a band, not a point glint.
  vec3 light = normalize(vec3(-0.35, -0.55, 0.75));
  vec3 view = normalize(eye - hit);
  vec3 halfVector = normalize(light + view);
  float ndoth = max(dot(normal, halfVector), 0.0);
  float band = smoothstep(0.72, 0.99, ndoth) * u_sheen;

  o_color = vec4(base + vec3(band), 1.0);
}
`;

type SwellLayerProps = Required<
  Pick<OceanSwellProps, "period" | "heave" | "roll" | "sheen">
> & { background?: string };

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

/**
 * The GL layer. Owns the context, the program, the texture, the continuous
 * time loop, and the frame draw; reads everything else from the surface.
 */
function SwellLayer({
  period,
  heave,
  roll,
  sheen,
  background,
}: SwellLayerProps) {
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
  const paramsRef = React.useRef({ period, heave, roll, sheen });
  React.useEffect(() => {
    paramsRef.current = { period, heave, roll, sheen };
  });

  // One frame: upload the texture if a new paint landed, compute the
  // swell's heave and tilt for the current tick, then draw.
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
    const safePeriod = Math.max(p.period, 0.01);
    const phase = (tickRef.current * 2 * Math.PI) / safePeriod;
    const axDeg = Math.sin(phase + 1.0) * p.roll;
    const ayDeg = Math.cos(phase * 0.7) * p.roll * 0.6;
    const heaveY = Math.sin(phase) * p.heave;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_ax: axDeg * DEG2RAD,
      u_ay: ayDeg * DEG2RAD,
      u_heave: heaveY,
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
    // loop tick.
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

  // Every completed paint asks for a frame, so a DOM change lands even
  // between loop ticks.
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Background colour, resolved against the host once it exists and again
  // if the caller changes it -- `var(--token)` needs the host's computed
  // style to read the theme that actually applies to it.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    requestFrame();
  }, [surface.host, background, requestFrame]);

  // The continuous swell loop: a rAF tick that advances the clock and
  // redraws every frame the effect is on screen -- there is no pointer or
  // click to drive this effect, only elapsed time. Gated the same way as
  // dust-reveal's idle-drift loop (IntersectionObserver + visibilitychange),
  // but never stops on its own the way a `drift <= 0` idle loop would: the
  // swell never settles, only the loop that draws it pauses off-screen.
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
        // Rebase the clock over the pause so the swell resumes, not jumps.
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
      data-effect-canvas="ocean-swell"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface as a plate riding a gentle ocean swell: a vertical heave and
 * two small tilt angles, all pure functions of elapsed time, feed the same
 * ray-plane projection tilt-plate uses, so the painted texture bends into a
 * raised, foreshortened surface rather than merely sliding or skewing. A
 * soft specular band drifts across the surface as its normal keeps rotating,
 * standing in for a light catching a rolling deck; everywhere off the plate,
 * and every transparent texel on it, fills with the host's own background so
 * the page reads as one solid surface underneath. The loop runs while the
 * effect is on screen and pauses when it scrolls out of view or the tab goes
 * to the background -- nothing here waits on a pointer or a click, only the
 * period you set.
 * Reduced motion: SurfacePaint renders in replace mode, so this layer
 * returns null and the real, flat DOM shows in its place.
 */
export function OceanSwell({
  period = 7,
  heave = 6,
  roll = 1.6,
  sheen = 0.3,
  background,
  paint,
  className,
  children,
}: OceanSwellProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <SwellLayer
          period={period}
          heave={heave}
          roll={roll}
          sheen={sheen}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
