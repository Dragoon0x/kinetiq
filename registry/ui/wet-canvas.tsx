"use client";

import * as React from "react";

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
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type WetCanvasProps = {
  /** Woven-ground height — how strongly the cloth pattern reads under the paint. @default 1 */
  weave?: number;
  /** Paper-grain strength, a fine per-pixel speckle over the ground. @default 0.4 */
  grain?: number;
  /** Light direction over the ground and the ridges, in degrees. @default 135 */
  light?: number;
  /** Brush radius, in the smear map's own quarter-scale pixels. @default 70 */
  brush?: number;
  /** How far a fully-saturated stroke drags the paint, in CSS pixels. @default 40 */
  strength?: number;
  /** Seconds for a stroke to dry back to flat. @default 8 */
  dry?: number;
  /** Specular strength on a wet ridge. @default 0.6 */
  gloss?: number;
  /** How tall a ridge rises where the stroke has dragged the paint. @default 0.8 */
  ridge?: number;
  /** Fill colour override; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

// The smear map is a quarter the host's own size — plenty of resolution for
// a soft brush stroke, a quarter of the upload cost every wet frame.
const MAP_SCALE = 0.25;

// A pointer travelling this fast (host CSS px/s) fully saturates the ±0.5
// smear encoding; slower strokes leave a fainter drag.
const SMEAR_REFERENCE_SPEED = 2000;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform sampler2D u_smear;
uniform vec2 u_res;
uniform float u_weave;
uniform float u_grain;
uniform float u_light;
uniform float u_strength;
uniform float u_gloss;
uniform float u_ridge;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

const float WEAVE_FREQ = 0.55;
const float THREAD_FREQ = 1.9;
const float EPS_PX = 2.0;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// The woven ground plus the ridge the current smear raises, summed into one
// scalar height field so a single finite-difference pass lights both.
float heightAt(vec2 p) {
  float weaveMain = sin(p.x * WEAVE_FREQ) * sin(p.y * WEAVE_FREQ);
  float threads = (sin(p.x * THREAD_FREQ) + sin(p.y * THREAD_FREQ)) * 0.15;
  float w = u_weave * (weaveMain + threads);

  vec2 uv = clamp(p / u_res, 0.0, 1.0);
  vec2 raw = texture(u_smear, uv).rg;
  vec2 s = (raw - 0.5) * 2.0 * u_strength;
  float r = u_ridge * length(s);

  return w + r;
}

void main() {
  vec2 px = v_uv * u_res;

  // The stroke drags the sampled page along its own direction of travel.
  vec2 smearRaw = texture(u_smear, v_uv).rg;
  vec2 s = (smearRaw - 0.5) * 2.0 * u_strength;
  vec2 dragUv = clamp(v_uv - s / u_res, 0.0, 1.0);
  vec3 color = sampleOver(dragUv);

  // Light the combined weave+ridge height field from its own gradient.
  float hXp = heightAt(px + vec2(EPS_PX, 0.0));
  float hXm = heightAt(px - vec2(EPS_PX, 0.0));
  float hYp = heightAt(px + vec2(0.0, EPS_PX));
  float hYm = heightAt(px - vec2(0.0, EPS_PX));
  float dHdx = (hXp - hXm) / (2.0 * EPS_PX);
  float dHdy = (hYp - hYm) / (2.0 * EPS_PX);
  vec3 normal = normalize(vec3(-dHdx, -dHdy, 1.0));

  float lightRad = radians(u_light);
  vec3 lightDir = normalize(vec3(cos(lightRad), sin(lightRad), 0.85));
  float diffuse = clamp(dot(normal, lightDir), -1.0, 1.0);

  vec3 halfDir = normalize(lightDir + vec3(0.0, 0.0, 1.0));
  float specAngle = clamp(dot(normal, halfDir), 0.0, 1.0);
  float spec = pow(specAngle, 24.0);

  // Gloss reads strongest where the ridge is tallest (freshly wet) and
  // fades to a faint sheen over dry weave.
  float wetness = clamp(length(s) / max(u_strength, 0.001), 0.0, 1.0);
  float specStrength = mix(0.04, 1.0, wetness) * u_gloss;

  float grain = u_grain * (kx_hash(px) - 0.5);

  vec3 shaded = color * (1.0 + diffuse * 0.06 + grain * 0.05);
  shaded += spec * specStrength;

  o_color = vec4(clamp(shaded, 0.0, 1.0), 1.0);
}
`;

type WetCanvasLayerProps = Required<
  Pick<
    WetCanvasProps,
    | "weave"
    | "grain"
    | "light"
    | "brush"
    | "strength"
    | "dry"
    | "gloss"
    | "ridge"
  >
> & { background?: string };

/** Walks up from the host to the first opaque background colour, so paint
 * sampled over a transparent region composites onto the page rather than
 * onto black — the same probe crystal-lens and rain-glass use. */
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

/** Blends the smear map toward neutral grey (0.5, zero displacement) by
 * `alpha` — a plain `source-over` fill, so a fresh stroke's own alpha
 * falloff is what keeps the overwrite soft, never a composite mode. */
function driftMapDry(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  alpha: number,
): void {
  if (alpha <= 0) return;
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.fillStyle = "rgb(128, 128, 128)";
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;
}

/** Paints one soft radial stroke into the smear map: colour encodes the
 * pointer's velocity (already scaled into the ±0.5 range) in R/G, alpha
 * fades with distance from the pointer so the stroke overwrites the map
 * softly rather than stamping a hard disc. */
function paintSmearStroke(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  vx: number,
  vy: number,
  brush: number,
): void {
  const r = Math.round((0.5 + clamp(vx, -0.5, 0.5)) * 255);
  const g = Math.round((0.5 + clamp(vy, -0.5, 0.5)) * 255);
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, brush);
  gradient.addColorStop(0, `rgba(${r}, ${g}, 128, 1)`);
  gradient.addColorStop(1, `rgba(${r}, ${g}, 128, 0)`);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, brush, 0, Math.PI * 2);
  ctx.fill();
}

type LastMove = { x: number; y: number; tick: number };

/**
 * The GL layer. Owns the context, the program, the page texture, the smear
 * map (a small offscreen 2D canvas kept in a ref) and the frame loop; reads
 * everything else from the surface.
 */
function WetCanvasLayer({
  weave,
  grain,
  light,
  brush,
  strength,
  dry,
  gloss,
  ridge,
  background,
}: WetCanvasLayerProps) {
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

  // The smear map: a small offscreen 2D canvas, a quarter the host's size,
  // storing a per-pixel displacement vector encoded in RG (0.5 = zero).
  const mapCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const mapCtxRef = React.useRef<CanvasRenderingContext2D | null>(null);
  const mapTextureRef = React.useRef<WebGLTexture | null>(null);
  const mapVersionRef = React.useRef(0);
  const mapUploadedVersionRef = React.useRef(0);

  const tickRef = React.useRef(0);
  const wetUntilRef = React.useRef(0);
  const pointerInsideRef = React.useRef(false);
  const lastMoveRef = React.useRef<LastMove | null>(null);
  // Bridges the wet loop (below) to the pointer effect further down, so a
  // `background` change — which re-attaches pointer listeners — never
  // tears down and restarts the loop's own clock.
  const startLoopRef = React.useRef<(() => void) | null>(null);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({
    weave,
    grain,
    light,
    brush,
    strength,
    dry,
    gloss,
    ridge,
  });
  React.useEffect(() => {
    paramsRef.current = {
      weave,
      grain,
      light,
      brush,
      strength,
      dry,
      gloss,
      ridge,
    };
  });

  // One frame: upload the page texture and the smear map if either has a
  // newer version than what's on the GPU, then draw.
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

    const map = mapCanvasRef.current;
    if (!map) return;
    if (mapUploadedVersionRef.current !== mapVersionRef.current) {
      mapTextureRef.current = uploadTexture(
        gl,
        map,
        { linear: true },
        mapTextureRef.current,
      );
      mapUploadedVersionRef.current = mapVersionRef.current;
    }
    const mapTexture = mapTextureRef.current;
    if (!mapTexture) return;

    const size = resizeGL(gl, canvas, { dprCap: 2 });
    const cssW = size.width / size.dpr;
    const cssH = size.height / size.dpr;
    const p = paramsRef.current;
    const bg = bgRef.current;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.texture("u_smear", mapTexture, 1);
    program.set({
      u_res: [cssW, cssH],
      u_weave: p.weave,
      u_grain: p.grain,
      u_light: p.light,
      u_strength: p.strength,
      u_gloss: p.gloss,
      u_ridge: p.ridge,
      u_bg: bg,
    });
    tri.draw();
  }, []);

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
    mapUploadedVersionRef.current = 0;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const detach = onContextLoss(canvas, () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      failedRef.current = true;
    });
    // A paint (or a smear map) may already be waiting: draw it now rather
    // than on the next pointer move.
    if (surfaceRef.current.version > 0) requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (textureRef.current) gl.deleteTexture(textureRef.current);
      textureRef.current = null;
      uploadedVersionRef.current = 0;
      if (mapTextureRef.current) gl.deleteTexture(mapTextureRef.current);
      mapTextureRef.current = null;
      mapUploadedVersionRef.current = 0;
      tri.dispose();
      program.dispose();
      glRef.current = null;
      programRef.current = null;
      triRef.current = null;
    };
  }, [surface.active, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // The smear map itself: created lazily, resized (and reset to neutral
  // grey) whenever the host's own size changes.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;

    const ensureMap = () => {
      const rect = host.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width * MAP_SCALE));
      const height = Math.max(1, Math.round(rect.height * MAP_SCALE));
      let canvas = mapCanvasRef.current;
      if (!canvas) {
        canvas = document.createElement("canvas");
        mapCanvasRef.current = canvas;
      }
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      mapCtxRef.current = ctx;
      if (ctx) {
        ctx.fillStyle = "rgb(128, 128, 128)";
        ctx.fillRect(0, 0, width, height);
      }
      mapVersionRef.current += 1;
      requestFrame();
    };

    ensureMap();
    const resizeObserver = new ResizeObserver(ensureMap);
    resizeObserver.observe(host);
    return () => resizeObserver.disconnect();
  }, [surface.host, requestFrame]);

  // The wet loop: a rAF clock that advances only while the paint is still
  // wet (pointer inside, or `wetUntil` hasn't elapsed), drying the smear map
  // and redrawing every frame it runs, then stopping itself. Kept apart from
  // the pointer effect below so a `background` change — which re-attaches
  // pointer listeners — never resets this clock mid-stroke.
  React.useEffect(() => {
    if (!surface.active) return;
    const host = surface.host;
    if (!host) return;

    let raf = 0;
    let started: number | null = null;
    let pausedAt: number | null = null;
    let inView = true;
    let prevTick = 0;

    const stillWet = (): boolean =>
      pointerInsideRef.current || wetUntilRef.current > tickRef.current;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (started === null) started = now;
      const current = (now - started) / 1000;
      const dt = Math.max(0, current - prevTick);
      prevTick = current;
      tickRef.current = current;

      const map = mapCanvasRef.current;
      const ctx = mapCtxRef.current;
      if (map && ctx) {
        const dryFor = Math.max(paramsRef.current.dry, 0.001);
        driftMapDry(ctx, map.width, map.height, dt / dryFor);
        mapVersionRef.current += 1;
      }
      drawFrame();

      if (!stillWet()) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const startLoop = () => {
      if (raf !== 0) return;
      if (!(inView && !document.hidden)) return;
      if (started !== null && pausedAt !== null) {
        started += performance.now() - pausedAt;
      }
      pausedAt = null;
      raf = requestAnimationFrame(tick);
    };
    startLoopRef.current = startLoop;
    // The pointer may already be inside from before the surface went
    // active (reduced motion settling, a slow first paint): pick that up
    // now rather than waiting for the next pointermove.
    if (stillWet()) startLoop();

    const syncVisibility = () => {
      const visible = inView && !document.hidden;
      if (visible) {
        if (stillWet()) startLoop();
      } else if (raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
        pausedAt = performance.now();
      }
    };

    const intersection = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) inView = last.isIntersecting;
      syncVisibility();
    });
    intersection.observe(host);
    document.addEventListener("visibilitychange", syncVisibility);

    return () => {
      startLoopRef.current = null;
      if (raf !== 0) cancelAnimationFrame(raf);
      intersection.disconnect();
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, [surface.active, surface.host, drawFrame]);

  // Pointer on the host: brush a stroke into the smear map on every move
  // (no button needed), extend `wetUntil`, and nudge the loop above awake.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const last = lastMoveRef.current;
      const currentTick = tickRef.current;
      if (last) {
        const dt = currentTick - last.tick;
        if (dt > 0) {
          const p = paramsRef.current;
          const k = 0.5 / SMEAR_REFERENCE_SPEED;
          const vx = ((px - last.x) / dt) * k;
          const vy = ((py - last.y) / dt) * k;
          const ctx = mapCtxRef.current;
          if (ctx) {
            paintSmearStroke(
              ctx,
              px * MAP_SCALE,
              py * MAP_SCALE,
              vx,
              vy,
              Math.max(p.brush, 0.001),
            );
            mapVersionRef.current += 1;
          }
          wetUntilRef.current = currentTick + p.dry * 1.2;
        }
      }
      lastMoveRef.current = { x: px, y: py, tick: currentTick };
      pointerInsideRef.current = true;
      startLoopRef.current?.();
    };

    const enter = (event: PointerEvent) => {
      pointerInsideRef.current = true;
      const rect = host.getBoundingClientRect();
      lastMoveRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        tick: tickRef.current,
      };
      startLoopRef.current?.();
    };

    const leave = () => {
      pointerInsideRef.current = false;
    };

    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    return () => {
      pointerInsideRef.current = false;
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
    };
  }, [surface.host, background]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="wet-canvas"
      className="block h-full w-full"
    />
  );
}

/**
 * Wet paint over a woven ground: a cloth weave and a paper grain sit under
 * the page with their own lighting, and dragging the pointer raises glossy
 * ridges that catch the light before drying back flat. The smear is nothing
 * but the pointer's own velocity, brushed into a small offscreen 2D map that
 * fades back to neutral grey every frame the paint is still wet — so the
 * fragment shader stays one pass, reading that map once to drag the sampled
 * page along the stroke and once more, by finite difference, to light the
 * ridge it just raised. The weave and grain stay visible everywhere, even
 * where the paint has never touched, and everything under the canvas is the
 * real, painted DOM — the canvas stands in for it, not beside it.
 * Reduced motion: SurfacePaint holds `active` false in replace mode, so this
 * layer renders nothing and the real DOM shows in its place.
 */
export function WetCanvas({
  weave = 1,
  grain = 0.4,
  light = 135,
  brush = 70,
  strength = 40,
  dry = 8,
  gloss = 0.6,
  ridge = 0.8,
  background,
  paint,
  className,
  children,
}: WetCanvasProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <WetCanvasLayer
          weave={weave}
          grain={grain}
          light={light}
          brush={brush}
          strength={strength}
          dry={dry}
          gloss={gloss}
          ridge={ridge}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
