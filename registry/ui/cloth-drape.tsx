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

export type ClothDrapeProps = {
  /** Mesh columns. @default 48 */
  cols?: number;
  /** Mesh rows. @default 32 */
  rows?: number;
  /** Wind strength driving the wave displacement. @default 0.6 */
  wind?: number;
  /** Wave speed. @default 1 */
  speed?: number;
  /** Wave displacement amplitude, in pixels. @default 18 */
  amplitude?: number;
  /** Peak depth of the cursor dent, in pixels. @default 40 */
  push?: number;
  /** Cursor dent radius, in CSS pixels. @default 160 */
  radius?: number;
  /** Diffuse fold-shading strength (0..1). @default 0.35 */
  shading?: number;
  /** Fill colour override; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const VERTEX = /* glsl */ `
in vec2 a_position;
in vec2 a_uv;
uniform vec2 u_res;
uniform float u_time;
uniform float u_wind;
uniform float u_speed;
uniform float u_amplitude;
uniform vec2 u_cursor;
uniform float u_push;
uniform float u_radius;
uniform float u_dent;
uniform float u_cols;
uniform float u_rows;
out vec2 v_uv;
out vec3 v_normal;

${GLSL_NOISE}

// The wave part of the displacement — wind rolling slow folds through the
// cloth. No cursor, no time seed beyond u_time: same shape every frame at
// the same clock, never Math.random.
float kx_windZ(vec2 p) {
  float wave = sin(p.x * 6.0 + u_time * u_speed) * 0.6
    + kx_noise(p * 3.0 + u_time * u_speed * 0.3) * 0.8;
  return u_amplitude * wave * u_wind;
}

// The cursor's dent — a smooth push inward, scaled by the sprung dent
// strength so it grows in on arrival and relaxes back out on leave.
float kx_dentZ(vec2 p) {
  float dist = distance(p * u_res, u_cursor);
  return u_push * smoothstep(u_radius, 0.0, dist) * u_dent;
}

float kx_displace(vec2 p) {
  return kx_windZ(p) - kx_dentZ(p);
}

void main() {
  vec2 p = a_uv;
  float windZ = kx_windZ(p);
  float z = windZ - kx_dentZ(p);

  // Surface normal from finite differences of the same displacement the
  // vertex itself uses, sampled a cell over in each direction.
  float invCols = 1.0 / max(u_cols, 1.0);
  float invRows = 1.0 / max(u_rows, 1.0);
  float zXp = kx_displace(p + vec2(invCols, 0.0));
  float zXm = kx_displace(p - vec2(invCols, 0.0));
  float zYp = kx_displace(p + vec2(0.0, invRows));
  float zYm = kx_displace(p - vec2(0.0, invRows));
  float normalScale = max(u_amplitude, 1.0) * 2.0;
  v_normal = normalize(vec3(zXm - zXp, zYm - zYp, normalScale));

  // A faint sway in x/y from the same wind wave, converted from a pixel
  // offset into clip space.
  vec2 swayPx = vec2(windZ * 0.15);
  vec2 pos = a_position + (swayPx / u_res) * 2.0;

  v_uv = a_uv;
  gl_Position = vec4(pos / (1.0 + z * 0.0008), 0.0, 1.0);
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

type ClothLayerProps = Required<
  Pick<
    ClothDrapeProps,
    | "cols"
    | "rows"
    | "wind"
    | "speed"
    | "amplitude"
    | "push"
    | "radius"
    | "shading"
  >
> & { background?: string };

/** Walks up from the host to the first opaque background colour, so the
 * ground the cloth clears to composites onto the page rather than onto
 * black — the same probe crystal-lens and dust-reveal use. */
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
function ClothLayer({
  cols,
  rows,
  wind,
  speed,
  amplitude,
  push,
  radius,
  shading,
  background,
}: ClothLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const cursorX = useMotionValue<number>(-9999);
  const cursorY = useMotionValue<number>(-9999);
  const dent = useMotionValue<number>(0);

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
  const paramsRef = React.useRef({
    cols,
    rows,
    wind,
    speed,
    amplitude,
    push,
    radius,
    shading,
  });
  React.useEffect(() => {
    paramsRef.current = {
      cols,
      rows,
      wind,
      speed,
      amplitude,
      push,
      radius,
      shading,
    };
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
      u_speed: p.speed,
      u_amplitude: p.amplitude,
      u_cursor: [cursorX.get(), cursorY.get()],
      u_push: p.push,
      u_radius: p.radius,
      u_dent: dent.get(),
      u_cols: p.cols,
      u_rows: p.rows,
      u_shading: p.shading,
      u_bg: bg,
    });
    mesh.draw();
  }, [cursorX, cursorY, dent]);

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
    const program = createProgram(gl, VERTEX, FRAGMENT);
    if (!program) {
      failedRef.current = true;
      return;
    }
    const p = paramsRef.current;
    const mesh = createGridMesh(gl, program, p.cols, p.rows);
    glRef.current = gl;
    programRef.current = program;
    meshRef.current = mesh;
    uploadedVersionRef.current = 0;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

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
    const unsubs = [cursorX, cursorY, dent].map((mv) =>
      mv.on("change", requestFrame),
    );
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [cursorX, cursorY, dent, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // The wind loop: a rAF tick that advances the clock and redraws every
  // frame, because the wind never stops while the cloth is visible. Gated
  // the same way as the GL effect (only while the surface is active) plus
  // IntersectionObserver/visibilitychange, mirroring dust-reveal's idle
  // drift loop.
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

  // Pointer on the host: track the push point directly (a dent should feel
  // attached to the cursor, not lagging it) while the dent's strength — how
  // far it has sunk in — springs in on arrival and relaxes back out on
  // leave.
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
      animate(dent, 1, springs.glide);
    };
    const leave = () => {
      animate(dent, 0, springs.glide);
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
  }, [surface.host, background, cursorX, cursorY, dent]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="cloth-drape"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface hung as a sheet of cloth: a forty-eight by thirty-two grid
 * mesh — a few thousand vertices — carries the painted page, and its vertex
 * shader displaces every point along z from a rolling wind wave plus a
 * cursor-shaped dent that pushes in and springs back out on a
 * `springs.glide` motion value. Face normals come from finite differences of
 * that same displacement, so the fragment shader can shade every fold as the
 * mesh tilts toward and away from the light, with a faint specular catching
 * the ridges. The wind never stops while the cloth is visible; only the dent
 * answers the pointer. Everything under the cloth is the real DOM, painted
 * once per change and mapped onto the mesh as a texture, so the space the
 * cloth leaves at its swaying edges clears to the ground colour behind it.
 * Reduced motion: the real DOM shows at full opacity and this layer renders
 * nothing.
 */
export function ClothDrape({
  cols = 48,
  rows = 32,
  wind = 0.6,
  speed = 1,
  amplitude = 18,
  push = 40,
  radius = 160,
  shading = 0.35,
  background,
  paint,
  className,
  children,
}: ClothDrapeProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <ClothLayer
          cols={cols}
          rows={rows}
          wind={wind}
          speed={speed}
          amplitude={amplitude}
          push={push}
          radius={radius}
          shading={shading}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
