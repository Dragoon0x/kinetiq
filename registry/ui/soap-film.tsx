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

export type SoapFilmProps = {
  /** How hard the interference colour tints the page (0..1). @default 0.3 */
  strength?: number;
  /** Amplitude of the thickness field. @default 1 */
  flow?: number;
  /** How fast the field drifts. @default 1 */
  speed?: number;
  /** How much the sprung pointer thins the film locally (0..1). @default 0.6 */
  push?: number;
  /** Pointer dip radius in CSS pixels. @default 180 */
  radius?: number;
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
uniform vec2 u_pointer;
uniform float u_radius;
uniform float u_strength;
uniform float u_flow;
uniform float u_speed;
uniform float u_push;
uniform float u_tick;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  vec2 px = v_uv * u_res;
  vec3 page = sampleOver(v_uv);

  // Thickness field: a flowing fbm advected by the clock and speed, scaled
  // by flow, thinned near the sprung pointer by a smooth radial dip.
  float t = u_tick * u_speed * 0.1;
  float raw = kx_fbm(px * 0.004 + vec2(t));
  float distToPointer = length(px - u_pointer);
  float dip = u_push * (1.0 - smoothstep(0.0, max(u_radius, 1.0), distToPointer));
  float d = clamp(raw * u_flow - dip, 0.0, 1.0);

  // Map the field to a physical thickness and get each channel's thin-film
  // reflectance there (refractive index 1.33, normal incidence).
  float thicknessNm = mix(200.0, 800.0, d);
  float filmIndex = 1.33;
  float phaseR = 4.0 * 3.14159265359 * filmIndex * thicknessNm / 650.0;
  float phaseG = 4.0 * 3.14159265359 * filmIndex * thicknessNm / 540.0;
  float phaseB = 4.0 * 3.14159265359 * filmIndex * thicknessNm / 450.0;
  vec3 interference = vec3(
    cos(phaseR) * cos(phaseR),
    cos(phaseG) * cos(phaseG),
    cos(phaseB) * cos(phaseB)
  );

  // The film tints the page rather than replacing it.
  vec3 tinted = page * (1.0 - u_strength) + page * interference * u_strength * 1.6;

  // A soft specular where the thickness field changes fastest — light
  // catching a ripple in the film.
  float gx = dFdx(d);
  float gy = dFdy(d);
  float grad = length(vec2(gx, gy));
  float specular = smoothstep(0.0, 0.02, grad) * 0.4 * u_strength;
  tinted += vec3(specular);

  o_color = vec4(clamp(tinted, 0.0, 1.0), 1.0);
}
`;

type SoapFilmLayerProps = Required<
  Pick<SoapFilmProps, "strength" | "flow" | "speed" | "push" | "radius">
> & { background?: string };

/** Walks up from the host to the first opaque background colour, so a film
 * sample over a transparent region composites onto the page rather than onto
 * black — the same probe crystal-lens and dust-reveal use for their own
 * backdrop. */
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

// Sentinel pointer position, far enough outside any canvas that the dip
// radius never reaches it.
const OFFSCREEN = -9999;

/**
 * The GL layer. Owns the context, the program, the texture, the pointer
 * spring, the flow tick and the frame loop; reads everything else from the
 * surface.
 */
function SoapFilmLayer({
  strength,
  flow,
  speed,
  push,
  radius,
  background,
}: SoapFilmLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const x = useMotionValue<number>(OFFSCREEN);
  const y = useMotionValue<number>(OFFSCREEN);

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
  const paramsRef = React.useRef({ strength, flow, speed, push, radius });
  React.useEffect(() => {
    paramsRef.current = { strength, flow, speed, push, radius };
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

    const sized = resizeGL(gl, canvas, { dprCap: 2 });
    const cssW = sized.width / sized.dpr;
    const cssH = sized.height / sized.dpr;
    const p = paramsRef.current;
    const bg = bgRef.current;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_pointer: [x.get(), y.get()],
      u_radius: p.radius,
      u_strength: p.strength,
      u_flow: p.flow,
      u_speed: p.speed,
      u_push: p.push,
      u_tick: tickRef.current,
      u_bg: bg,
    });
    tri.draw();
  }, [x, y]);

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
    // pointer move or flow tick.
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

  // Every motion-value change and every completed paint asks for a frame —
  // this alone covers the pointer dip whenever the loop below is between
  // frames.
  React.useEffect(() => {
    const unsubs = [x, y].map((mv) => mv.on("change", requestFrame));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [x, y, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // The flow loop: a rAF tick that advances `u_tick` and redraws every
  // frame so the field keeps breathing. Gated the same way as the GL effect
  // (only while the surface is active) plus IntersectionObserver /
  // visibilitychange — the film flows continuously while visible and pauses
  // off-screen or behind a hidden tab.
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
        // Rebase the clock over the pause so the field resumes, not jumps.
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

  // Pointer on the host: spring the dip toward the cursor, snap it in on
  // entry so the first dip never sweeps in from the offscreen sentinel, and
  // spring it back out on exit.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      animate(x, event.clientX - rect.left, springs.glide);
      animate(y, event.clientY - rect.top, springs.glide);
    };
    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      x.jump(event.clientX - rect.left);
      y.jump(event.clientY - rect.top);
    };
    const leave = () => {
      animate(x, OFFSCREEN, springs.glide);
      animate(y, OFFSCREEN, springs.glide);
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
  }, [surface.host, background, x, y]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="soap-film"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface under a soap film: a thickness field of flowing noise, fed
 * by the rAF clock and `speed`, decides how thick the film reads at every
 * pixel, and thin-film interference at that thickness — refractive index
 * 1.33, red/green/blue read at 650/540/450nm — tints the painted page with
 * the oily rainbow a real film shows, never replacing its colours outright.
 * The pointer springs a local dip into the field, thinning the film (and
 * brightening its fringe) within `radius` px, and a soft specular catches
 * wherever the thickness changes fastest. The field keeps flowing on its own
 * tick as long as the surface is on screen and the tab is visible — no
 * `Math.random` in it, only `kx_fbm` walked forward by time.
 * Reduced motion: the real DOM shows at full opacity and this layer renders
 * nothing.
 */
export function SoapFilm({
  strength = 0.3,
  flow = 1,
  speed = 1,
  push = 0.6,
  radius = 180,
  background,
  paint,
  className,
  children,
}: SoapFilmProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <SoapFilmLayer
          strength={strength}
          flow={flow}
          speed={speed}
          push={push}
          radius={radius}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
