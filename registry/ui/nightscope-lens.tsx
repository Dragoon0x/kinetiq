"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import {
  FULLSCREEN_VERTEX,
  GLSL_LUMA,
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

export type NightscopeLensProps = {
  /** Lens radius in CSS pixels. @default 170 */
  radius?: number;
  /** Fraction of the disc spent easing its alpha toward the rim (0..~0.95). @default 0.4 */
  softness?: number;
  /** Luminance multiplier feeding the phosphor conversion. @default 1.6 */
  gain?: number;
  /** Intensifier grain strength. @default 0.25 */
  noise?: number;
  /** Bloom strength around bright content. @default 0.5 */
  bloom?: number;
  /** Phosphor tint, any CSS colour. @default "#9dff7a" */
  phosphor?: string;
  /** The mono pointer-coordinate readout beside the lens. @default true */
  readout?: boolean;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform vec3 u_lens;
uniform float u_softness;
uniform float u_gain;
uniform float u_noise;
uniform float u_bloom;
uniform vec3 u_phosphor;
uniform float u_opacity;
uniform float u_still;
uniform float u_tick;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}
${GLSL_LUMA}

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

float lumaAt(vec2 px) {
  return kx_luma(sampleOver(px / u_res));
}

void main() {
  vec2 px = v_uv * u_res;
  vec2 d = px - u_lens.xy;
  float r = length(d);
  float R = max(u_lens.z, 1.0);

  // The disc's own alpha fades over softness's share of a small margin past
  // R. The rim ring and tick marks below are measured against R directly so
  // the bezel stays crisp even where this fade has already thinned to
  // nothing.
  float pad = 5.0;
  float outer = R + pad;
  float inner = outer * (1.0 - clamp(u_softness, 0.02, 0.95));
  float mask = 1.0 - smoothstep(inner, outer, r);

  float PI = 3.14159265;
  float angle = atan(d.y, d.x);
  float cardinal = abs(mod(angle + PI * 0.25, PI * 0.5) - PI * 0.25);
  float ringBand = 1.0 - smoothstep(1.0, 2.2, abs(r - R));
  float tickRadial = 1.0 - smoothstep(2.0, 7.0, abs(r - (R - 5.0)));
  float tickAngular = 1.0 - smoothstep(0.03, 0.07, cardinal);
  float structure = clamp(ringBand + tickRadial * tickAngular, 0.0, 1.0) * step(r, outer);

  float edge = max(mask, structure);
  if (edge <= 0.0) { o_color = vec4(0.0); return; }
  float t = clamp(r / R, 0.0, 1.0);

  if (u_still > 0.5) {
    // Reduced motion: one still outline only — no phosphor conversion, no
    // bloom, no scanlines, no grain — legible as a shape without moving or
    // flickering anything under it.
    o_color = vec4(u_phosphor * 0.85, structure * u_opacity);
    return;
  }

  float luma = lumaAt(px) * u_gain;

  // Five-tap bloom: the centre sample plus an orthogonal cross, so bright
  // content halos into its neighbours the way an intensifier tube blooms
  // past its own edge.
  float bloomR = 2.5;
  float bloomSum = luma
    + lumaAt(px + vec2(bloomR, 0.0)) * u_gain
    + lumaAt(px - vec2(bloomR, 0.0)) * u_gain
    + lumaAt(px + vec2(0.0, bloomR)) * u_gain
    + lumaAt(px - vec2(0.0, bloomR)) * u_gain;
  float glow = max(bloomSum / 5.0 - luma, 0.0);
  float intensity = luma + glow * u_bloom * 2.0;

  // Intensifier grain: a hash reseeded on the pixel plus a tick quantised to
  // 30 steps per second, so the static resamples in visible discrete frames
  // instead of drifting smoothly.
  float grain = (kx_hash(px * 0.75 + floor(u_tick * 30.0)) - 0.5) * 2.0 * u_noise;
  intensity += grain;

  // Scanlines every two *device* pixels — gl_FragCoord is already in the
  // canvas's backing-store pixels, so no separate DPR uniform is needed.
  float scan = mod(floor(gl_FragCoord.y), 2.0) < 1.0 ? 1.0 : 0.85;
  intensity *= scan;

  // Dark vignette toward the rim.
  intensity *= 1.0 - smoothstep(0.35, 1.0, t) * 0.65;

  vec3 color = u_phosphor * clamp(intensity, 0.0, 1.6);
  color = max(color, u_phosphor * structure * 0.9);
  o_color = vec4(color, u_opacity * edge);
}
`;

type LensLayerProps = Required<
  Pick<
    NightscopeLensProps,
    "radius" | "softness" | "gain" | "noise" | "bloom" | "phosphor" | "readout"
  >
>;

type ReadoutInfo = { x: number; y: number };

/** Readout commit cadence, ms — ~10Hz regardless of pointermove rate. */
const READOUT_TICK_MS = 100;

/** Walks up from the host to the first opaque background colour, so a
 * sample over a transparent texture region composites onto the page rather
 * than onto black — the same probe crystal-lens uses for its own backdrop. */
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
 * The GL layer. Owns the context, the program, the texture, the pointer
 * spring, the intensifier-noise clock, and the frame loop; the mono
 * coordinate readout is a DOM sibling of the canvas driven by the same
 * motion values.
 */
function LensLayer({
  radius,
  softness,
  gain,
  noise,
  bloom,
  phosphor,
  readout,
}: LensLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const x = useMotionValue<number>(-9999);
  const y = useMotionValue<number>(-9999);
  const opacity = useMotionValue<number>(0);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const phosphorRef = React.useRef<[number, number, number]>([0.62, 1.0, 0.48]);
  const failedRef = React.useRef(false);

  const tickRef = React.useRef(0);
  const hoveringRef = React.useRef(false);
  const syncLoopRef = React.useRef<() => void>(() => {});

  const readoutInfoRef = React.useRef<ReadoutInfo>({ x: 0, y: 0 });
  const [readoutInfo, setReadoutInfo] = React.useState<ReadoutInfo>({
    x: 0,
    y: 0,
  });

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ radius, softness, gain, noise, bloom });
  React.useEffect(() => {
    paramsRef.current = { radius, softness, gain, noise, bloom };
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
      u_lens: [x.get(), y.get(), p.radius],
      u_softness: p.softness,
      u_gain: p.gain,
      u_noise: p.noise,
      u_bloom: p.bloom,
      u_phosphor: phosphorRef.current,
      u_opacity: opacity.get(),
      u_still: live.motionSafe ? 0 : 1,
      u_tick: tickRef.current,
      u_bg: bgRef.current,
    });
    tri.draw();
  }, [x, y, opacity]);

  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(drawFrame);
  }, [drawFrame]);

  // GL setup and teardown. The canvas only mounts once the surface is
  // active (after the first paint), so this is keyed on `surface.active`,
  // not on mount: a mount-only effect never sees it.
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

  // Every motion-value change and every completed paint asks for a frame.
  React.useEffect(() => {
    const unsubs = [x, y, opacity].map((mv) => mv.on("change", requestFrame));
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [x, y, opacity, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // The intensifier-noise loop: a self-scheduling rAF that only exists to
  // advance u_tick and redraw every frame while the pointer is inside and
  // motion is safe. It starts on pointerenter and stops on pointerleave —
  // the opacity fade that follows keeps drawing through the motion-value
  // subscription above, unrelated to this loop.
  React.useEffect(() => {
    if (!surface.active) return;

    let raf = 0;
    let started: number | null = null;
    let pausedAt: number | null = null;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (started === null) started = now;
      tickRef.current = (now - started) / 1000;
      drawFrame();
    };

    const syncLoop = () => {
      const shouldRun =
        hoveringRef.current &&
        !document.hidden &&
        surfaceRef.current.motionSafe;
      if (shouldRun && raf === 0) {
        // Rebase the clock over the pause so the noise resumes, not jumps.
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
    syncLoopRef.current = syncLoop;
    const onVisibility = () => syncLoop();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      syncLoopRef.current = () => {};
    };
  }, [surface.active, drawFrame]);

  // Pointer on the host: spring the lens, sample the readout, fade in and
  // out, and start/stop the noise loop.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host);
    const rgba = resolveColor(phosphor, host);
    phosphorRef.current = [rgba[0], rgba[1], rgba[2]];

    const still = !surfaceRef.current.motionSafe;
    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      if (still) {
        x.set(px);
        y.set(py);
      } else {
        animate(x, px, springs.snap);
        animate(y, py, springs.snap);
      }
      readoutInfoRef.current = { x: Math.round(px), y: Math.round(py) };
    };
    const enter = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      x.jump(px);
      y.jump(py);
      readoutInfoRef.current = { x: Math.round(px), y: Math.round(py) };
      hoveringRef.current = true;
      syncLoopRef.current();
      if (still) opacity.set(1);
      else animate(opacity, 1, { duration: 0.18 });
    };
    const leave = () => {
      hoveringRef.current = false;
      syncLoopRef.current();
      if (still) opacity.set(0);
      else animate(opacity, 0, { duration: 0.22 });
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
  }, [surface.host, phosphor, x, y, opacity]);

  // Commits the readout ref to state at a fixed ~10Hz tick, independent of
  // how often pointermove actually fires.
  React.useEffect(() => {
    if (!readout) return;
    const id = window.setInterval(() => {
      setReadoutInfo((prev) => {
        const next = readoutInfoRef.current;
        return prev.x === next.x && prev.y === next.y ? prev : next;
      });
    }, READOUT_TICK_MS);
    return () => window.clearInterval(id);
  }, [readout]);

  const readoutX = useTransform(x, (v) => v + radius + 16);
  const readoutY = useTransform(y, (v) => v - radius);

  if (!surface.active) return null;

  return (
    <>
      <canvas
        ref={canvasRef}
        data-effect-canvas="nightscope-lens"
        className="block h-full w-full"
      />
      {readout && (
        <motion.div
          style={{ x: readoutX, y: readoutY, opacity }}
          className="pointer-events-none absolute top-0 left-0 min-w-20 rounded-1 border border-hairline bg-surface-0/85 px-2 py-1 font-mono text-[10px] leading-tight backdrop-blur-sm"
        >
          <div className="tabular-nums" style={{ color: phosphor }}>
            {readoutInfo.x}, {readoutInfo.y}
          </div>
        </motion.div>
      )}
    </>
  );
}

/**
 * A hover-driven night-vision lens over the live interface: inside the
 * circle, each pixel's luminance is multiplied by `gain` and mapped into a
 * single `phosphor` tint, with a five-tap cross sample blooming bright
 * content and a two-device-pixel scanline pattern dimming alternate rows.
 * An intensifier-grain hash reseeds every 1/30s while the pointer is
 * inside, so the noise flickers in visible discrete steps rather than
 * drifting smoothly, and the loop driving it starts on pointer entry and
 * stops the instant the pointer leaves. A dark vignette thins the phosphor
 * toward the rim, and a thin ring with four cardinal tick marks frames the
 * disc like an instrument bezel; outside the disc nothing is drawn. When
 * `readout` is on, a small mono panel beside the lens reports the
 * pointer's host-relative coordinates.
 * Reduced motion: the lens holds a single still outline at the pointer
 * with no bloom, no scanlines, no grain, and no spring — it simply
 * follows.
 */
export function NightscopeLens({
  radius = 170,
  softness = 0.4,
  gain = 1.6,
  noise = 0.25,
  bloom = 0.5,
  phosphor = "#9dff7a",
  readout = true,
  paint,
  className,
  children,
}: NightscopeLensProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn("cursor-none", className)}
      effect={
        <LensLayer
          radius={radius}
          softness={softness}
          gain={gain}
          noise={noise}
          bloom={bloom}
          phosphor={phosphor}
          readout={readout}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
