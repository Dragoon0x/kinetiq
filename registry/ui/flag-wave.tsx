"use client";

import * as React from "react";

import { animate, useMotionValue } from "motion/react";

import {
  GLSL_NOISE,
  createGL,
  createGridMesh,
  createProgram,
  onContextLoss,
  resizeGL,
  uploadTexture,
  type GLContext,
  type Mesh,
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

export type FlagWaveProps = {
  /** Wind speed driving the ripple phase. @default 1 */
  wind?: number;
  /** How hard the gust cycle swells and slacks the ripple. @default 1 */
  gust?: number;
  /** Ripple displacement amplitude at the free edge, in pixels. @default 22 */
  amplitude?: number;
  /** Diffuse fold-shading strength (0..1). @default 0.4 */
  shading?: number;
  /** How much a nearby pointer calms the cloth beside it (0..1). @default 0.7 */
  calm?: number;
  /** Fill colour override; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FLAG_COLS = 48;
const FLAG_ROWS = 24;

const VERTEX = /* glsl */ `
in vec2 a_position;
in vec2 a_uv;
uniform vec2 u_res;
uniform float u_time;
uniform float u_wind;
uniform float u_gust;
uniform float u_amplitude;
uniform float u_calm;
uniform vec2 u_pointer;
out vec2 v_uv;
out vec3 v_normal;

${GLSL_NOISE}

const float GRID_INV_COLS = 1.0 / 48.0;
const float GRID_INV_ROWS = 1.0 / 24.0;

// The gust cycle breathes the ripple strength in and out on a slow half
// second period; floored so the cloth never fully stalls mid-cycle.
float kx_gust(float t) {
  return max(0.3, 0.7 + 0.3 * sin(t * 0.5) * u_gust);
}

// 1 right at the pointer, fading to 0 by 200 CSS px away. Written as an
// increasing smoothstep (edge0 < edge1) and inverted, since GLSL ES 3.0
// leaves a decreasing one undefined.
float kx_pointerNear(vec2 uv) {
  vec2 px = uv * u_res;
  return 1.0 - smoothstep(0.0, 200.0, distance(px, u_pointer));
}

// The displacement: a travelling sine plus a drifting noise field, scaled
// outward from the pinned edge by uv.x squared so the hoist barely moves
// while the fly end whips, breathed by the gust, and calmed near the
// pointer.
float kx_flagZ(vec2 uv, float t) {
  float wave = sin(uv.x * 8.0 - t * u_wind * 4.0) * 0.7
    + kx_noise(vec2(uv.x * 3.0 - t * u_wind, uv.y * 2.0)) * 0.6;
  float near = kx_pointerNear(uv);
  return u_amplitude * uv.x * uv.x * wave * kx_gust(t) * (1.0 - u_calm * near);
}

void main() {
  vec2 uv = a_uv;
  float z = kx_flagZ(uv, u_time);

  // Surface normal from finite differences of the same displacement, one
  // grid cell over in each direction.
  float zXp = kx_flagZ(uv + vec2(GRID_INV_COLS, 0.0), u_time);
  float zXm = kx_flagZ(uv - vec2(GRID_INV_COLS, 0.0), u_time);
  float zYp = kx_flagZ(uv + vec2(0.0, GRID_INV_ROWS), u_time);
  float zYm = kx_flagZ(uv - vec2(0.0, GRID_INV_ROWS), u_time);
  float normalScale = max(u_amplitude, 1.0) * 2.0;
  v_normal = normalize(vec3(zXm - zXp, zYm - zYp, normalScale));

  // The ripple pulls the cloth in slightly along x as it bulges in z, and
  // the free edge sags under its own weight — a pixel offset converted to
  // clip space; y is flipped because clip-space up is positive while a
  // pixel droop is a downward, positive-y offset.
  vec2 offsetPx = vec2(-z * 0.08, 0.0);
  vec2 pos = a_position + (offsetPx / u_res) * 2.0;
  pos.y -= (uv.x * uv.x * 6.0) / u_res.y * 2.0;

  v_uv = uv;
  gl_Position = vec4(pos / (1.0 + z / 900.0), 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform float u_shading;
uniform vec4 u_bg;
in vec2 v_uv;
in vec3 v_normal;
out vec4 o_color;

void main() {
  vec4 t = texture(u_tex, clamp(v_uv, 0.0, 1.0));
  vec3 color = mix(u_bg.rgb, t.rgb, t.a);

  vec3 n = normalize(v_normal);
  vec3 lightDir = normalize(vec3(-0.35, 0.5, 0.8));
  float diffuse = dot(n, lightDir);
  color *= mix(1.0, 0.6 + 0.6 * diffuse, u_shading);

  vec3 halfDir = normalize(lightDir + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, halfDir), 0.0), 24.0) * u_shading * 0.25;
  color += spec;

  o_color = vec4(color, 1.0);
}
`;

type FlagLayerProps = Required<
  Pick<FlagWaveProps, "wind" | "gust" | "amplitude" | "shading" | "calm">
> & { background?: string };

/** Walks up from the host to the first opaque background colour, so the
 * ground the flag clears to composites onto the page rather than onto
 * black — the same probe crystal-lens and cloth-drape use. */
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

/**
 * The GL layer. Owns the context, the program, the grid mesh, the pointer
 * spring, the wind clock and the frame loop; reads everything else from the
 * surface.
 */
function FlagLayer({
  wind,
  gust,
  amplitude,
  shading,
  calm,
  background,
}: FlagLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const cursorX = useMotionValue<number>(-9999);
  const cursorY = useMotionValue<number>(-9999);
  const calmStrength = useMotionValue<number>(0);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const meshRef = React.useRef<Mesh | null>(null);
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
  const paramsRef = React.useRef({ wind, gust, amplitude, shading, calm });
  React.useEffect(() => {
    paramsRef.current = { wind, gust, amplitude, shading, calm };
  });

  // One frame: upload the texture if a new paint landed, then draw.
  const drawFrame = React.useCallback(() => {
    frameRef.current = null;
    const gl = glRef.current;
    const program = programRef.current;
    const mesh = meshRef.current;
    const canvas = canvasRef.current;
    const live = surfaceRef.current;
    if (!gl || !program || !mesh || !canvas || !live.canvas) return;
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
      u_time: tickRef.current,
      u_wind: p.wind,
      u_gust: p.gust,
      u_amplitude: p.amplitude,
      u_calm: p.calm * calmStrength.get(),
      u_pointer: [cursorX.get(), cursorY.get()],
      u_shading: p.shading,
      u_bg: bg,
    });
    mesh.draw();
  }, [cursorX, cursorY, calmStrength]);

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
    const program = createProgram(gl, VERTEX, FRAGMENT);
    if (!program) {
      failedRef.current = true;
      return;
    }
    const mesh = createGridMesh(gl, program, FLAG_COLS, FLAG_ROWS);
    glRef.current = gl;
    programRef.current = program;
    meshRef.current = mesh;
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
    // pointer move or wind tick.
    if (surfaceRef.current.version > 0) requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (textureRef.current) gl.deleteTexture(textureRef.current);
      textureRef.current = null;
      uploadedVersionRef.current = 0;
      mesh.dispose();
      program.dispose();
      glRef.current = null;
      programRef.current = null;
      meshRef.current = null;
    };
  }, [surface.active, requestFrame]);

  // Every motion-value change and every completed paint asks for a frame —
  // this alone covers a redraw whenever the wind loop below is paused.
  React.useEffect(() => {
    const unsubs = [cursorX, cursorY, calmStrength].map((mv) =>
      mv.on("change", requestFrame),
    );
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [cursorX, cursorY, calmStrength, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // The wind loop: a rAF tick that advances the clock and redraws every
  // frame, because the flag never stops flying while it is visible. Gated
  // the same way as the GL effect (only while the surface is active) plus
  // IntersectionObserver/visibilitychange, mirroring cloth-drape's wind
  // loop.
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
        // Rebase the clock over the pause so the wind resumes, not jumps.
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

  // Pointer on the host: track the calming point directly, while how much
  // it calms the cloth springs in on arrival and back out on leave — the
  // same push/dent shape cloth-drape uses for its cursor dent.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      cursorX.set(event.clientX - rect.left);
      cursorY.set(event.clientY - rect.top);
    };
    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      cursorX.jump(event.clientX - rect.left);
      cursorY.jump(event.clientY - rect.top);
      animate(calmStrength, 1, springs.glide);
    };
    const leave = () => {
      animate(calmStrength, 0, springs.glide);
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
  }, [surface.host, background, cursorX, cursorY, calmStrength]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="flag-wave"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface pinned along its left edge like a flag, flying free on the
 * right: a forty-eight by twenty-four grid mesh carries the painted page,
 * and its vertex shader displaces every point along z from a travelling
 * sine ripple layered with drifting noise, both scaled outward from the
 * pinned edge by the squared distance across the cloth so the hoist barely
 * moves while the fly end whips. A slow gust cycle breathes the ripple
 * strength in and out without ever quite stalling; the same displacement
 * pulls the cloth in slightly along x and lets the free edge sag under its
 * own weight. Face normals come from finite differences of that
 * displacement, so the fragment shader shades every fold as it tilts toward
 * and away from the light, with a faint specular catching the ridges, and a
 * hand held near the fabric calms the ripple beside it. Everything under
 * the flag is the real DOM, painted once per change and mapped onto the
 * mesh as a texture, so the ground the cloth leaves at its rippling edges
 * clears to the background colour behind it.
 * Reduced motion: the real DOM shows at full opacity and this layer renders
 * nothing.
 */
export function FlagWave({
  wind = 1,
  gust = 1,
  amplitude = 22,
  shading = 0.4,
  calm = 0.7,
  background,
  paint,
  className,
  children,
}: FlagWaveProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <FlagLayer
          wind={wind}
          gust={gust}
          amplitude={amplitude}
          shading={shading}
          calm={calm}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
