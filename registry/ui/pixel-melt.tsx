"use client";

import * as React from "react";

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
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import { clamp } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type PixelMeltProps = {
  /** Warm-brush radius, in CSS pixels. @default 120 */
  radius?: number;
  /** How fast the heat map warms under a resting pointer, per second. @default 0.9 */
  rate?: number;
  /** How fast warmth fades back toward cold, per second. @default 0.5 */
  cool?: number;
  /** Longest a fully warm column can drip, in CSS pixels. @default 60 */
  maxDrip?: number;
  /** Width of one drip column, in CSS pixels. @default 3 */
  columns?: number;
  /** Fill colour behind transparent texture regions; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
${GLSL_NOISE}
${GLSL_LUMA}
uniform sampler2D u_tex;
uniform sampler2D u_heat;
uniform vec2 u_res;
uniform float u_maxDrip;
uniform float u_columns;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

vec4 contentAt(vec2 uv) {
  return texture(u_tex, clamp(uv, 0.0, 1.0));
}

void main() {
  vec2 px = v_uv * u_res;
  float cols = max(u_columns, 1.0);
  float column = floor(px.x / cols);

  // The heat field itself stays smooth — linear-filtered and read at the
  // fragment's own position, never quantised — so neighbouring columns
  // share a continuous drip length. Only the column's own reach is
  // quantised, via a hash that shortens some columns by up to 30% so
  // drips read as separate strands, widest near the source and tapering
  // as they fall.
  float h = texture(u_heat, clamp(v_uv, 0.0, 1.0)).r;
  float variation = 1.0 - 0.3 * kx_hash(vec2(column, 0.0));

  float dripPx = h * u_maxDrip * variation;
  float dripUV = dripPx / u_res.y;
  vec2 srcUV = v_uv - vec2(0.0, dripUV);

  // Walk the pulled interval [y - drip, y] in six taps and keep the
  // inkiest one (highest alpha times darkness) — a hit anywhere along the
  // reach carries down as one continuous column of the source colour,
  // rather than a single point sample flickering on and off across fine
  // text detail. No ink anywhere in reach leaves the pixel as paper.
  vec4 paper = contentAt(v_uv);
  vec4 bestColor = paper;
  float bestInk = -1.0;
  float bestT = 0.0;
  for (int i = 0; i < 6; i++) {
    float t = float(i) / 5.0;
    vec4 c = contentAt(mix(v_uv, srcUV, t));
    float ink = c.a * (1.0 - kx_luma(c.rgb));
    if (ink > bestInk) {
      bestInk = ink;
      bestColor = c;
      bestT = t;
    }
  }

  float inkThreshold = 0.15;
  vec4 pixel = bestInk > inkThreshold ? bestColor : paper;

  // Taper the last eight pixels of reach so a drip's tip rounds off
  // instead of snapping shut: as the ink found sits nearer the far end of
  // the pulled interval (bestT toward 1), fade it out.
  float tipStart = clamp(1.0 - 8.0 / max(dripPx, 8.0), 0.0, 0.999);
  float tipFade = dripPx > 8.0 ? 1.0 - smoothstep(tipStart, 1.0, bestT) : 1.0;
  pixel.a *= tipFade;

  // A slight darkening along a drip, deepest where the heat runs highest.
  pixel.rgb *= 1.0 - 0.15 * h;

  o_color = vec4(mix(u_bg.rgb, pixel.rgb, pixel.a), 1.0);
}
`;

type PixelMeltLayerProps = Required<
  Pick<PixelMeltProps, "radius" | "rate" | "cool" | "maxDrip" | "columns">
> & { background?: string };

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

/** Seconds of continued warming a single warm frame buys the loop, past
 * `1 / cool` (the rough time a fully warm pixel takes to fade to
 * nothing), so the loop always outlives its own decay rather than racing it. */
const WARM_BUFFER = 1.2;

/**
 * The GL layer. Owns the context, the program, the page texture, the heat
 * map and its texture, the pointer state, and the frame loop; reads
 * everything else from the surface.
 */
function PixelMeltLayer({
  radius,
  rate,
  cool,
  maxDrip,
  columns,
  background,
}: PixelMeltLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const heatCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const heatCtxRef = React.useRef<CanvasRenderingContext2D | null>(null);
  const heatTextureRef = React.useRef<WebGLTexture | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const failedRef = React.useRef(false);

  // Pointer state lives in refs, never React state — read once per frame.
  const pointerRef = React.useRef({ x: 0, y: 0 });
  const pointerInsideRef = React.useRef(false);
  // rAF-timestamp domain (same clock as `now` below and `performance.now()`).
  const warmUntilRef = React.useRef(0);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ radius, rate, cool, maxDrip, columns });
  React.useEffect(() => {
    paramsRef.current = { radius, rate, cool, maxDrip, columns };
  });

  // One frame: re-upload the page texture on a new paint, update + upload
  // the heat map when `animateHeat` is set (the loop passes its own `dt`;
  // a plain requestFrame() redraw leaves the map untouched), then draw.
  const drawFrame = React.useCallback(
    (now: number, animateHeat = false, dt = 0) => {
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

      // The heat map tracks the GL canvas at quarter resolution, recreated
      // (which clears it) whenever the host resizes.
      const mapW = Math.max(1, Math.round(size.width * 0.25));
      const mapH = Math.max(1, Math.round(size.height * 0.25));
      let map = heatCanvasRef.current;
      let resized = false;
      if (!map) {
        map = document.createElement("canvas");
        heatCanvasRef.current = map;
        heatCtxRef.current = map.getContext("2d");
        resized = true;
      }
      if (map.width !== mapW || map.height !== mapH) {
        map.width = mapW;
        map.height = mapH;
        resized = true;
      }
      const hctx = heatCtxRef.current;

      let painted = false;
      if (animateHeat && hctx && dt > 0) {
        // Fade the whole map toward cold first...
        hctx.save();
        hctx.globalCompositeOperation = "destination-out";
        hctx.globalAlpha = clamp(p.cool * dt, 0, 1);
        hctx.fillStyle = "#fff";
        hctx.fillRect(0, 0, map.width, map.height);
        hctx.restore();

        // ...then, while the pointer rests inside, warm it back up under
        // the pointer and push the loop's own stop time back out.
        if (pointerInsideRef.current) {
          const scaleX = cssW > 0 ? map.width / cssW : 0;
          const scaleY = cssH > 0 ? map.height / cssH : 0;
          const mx = pointerRef.current.x * scaleX;
          const my = pointerRef.current.y * scaleY;
          const mr = Math.max(1, p.radius * scaleX);
          const gradient = hctx.createRadialGradient(mx, my, 0, mx, my, mr);
          gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
          gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
          hctx.save();
          hctx.globalCompositeOperation = "lighter";
          hctx.globalAlpha = clamp(p.rate * dt, 0, 1);
          hctx.fillStyle = gradient;
          hctx.beginPath();
          hctx.arc(mx, my, mr, 0, Math.PI * 2);
          hctx.fill();
          hctx.restore();
          warmUntilRef.current =
            now + (1 / Math.max(p.cool, 0.0001)) * WARM_BUFFER * 1000;
        }
        painted = true;
      }

      if (hctx && (resized || painted || !heatTextureRef.current)) {
        // Premultiplied so the map's alpha (built up by "lighter", faded by
        // "destination-out") lands directly in the red channel the shader
        // reads — a plain unmultiplied upload would leave red pinned at 1
        // wherever the map has ever been touched, losing the fade entirely.
        heatTextureRef.current = uploadTexture(
          gl,
          map,
          { linear: true, premultiply: true },
          heatTextureRef.current,
        );
      }
      const heatTexture = heatTextureRef.current;
      if (!heatTexture) return;

      const bg = bgRef.current;
      gl.clearColor(bg[0], bg[1], bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      program.use();
      program.texture("u_tex", texture, 0);
      program.texture("u_heat", heatTexture, 1);
      program.set({
        u_res: [cssW, cssH],
        u_maxDrip: p.maxDrip,
        u_columns: Math.max(1, p.columns),
        u_bg: bg,
      });
      tri.draw();
    },
    [],
  );

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
    // pointer move.
    if (surfaceRef.current.version > 0) requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (textureRef.current) gl.deleteTexture(textureRef.current);
      textureRef.current = null;
      uploadedVersionRef.current = 0;
      if (heatTextureRef.current) gl.deleteTexture(heatTextureRef.current);
      heatTextureRef.current = null;
      heatCanvasRef.current = null;
      heatCtxRef.current = null;
      tri.dispose();
      program.dispose();
      glRef.current = null;
      programRef.current = null;
      triRef.current = null;
    };
  }, [surface.active, requestFrame]);

  // Every completed paint asks for a frame — the map is left untouched, the
  // page texture underneath it just gets fresher.
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Pointer + the heat loop, together: the loop only exists to warm and
  // cool the heat map, so it is driven by the same pointer state that feeds
  // it. It runs while the pointer rests inside OR the map still holds
  // warmth from a recent visit, gated by the surface being active, the host
  // being on screen, and the tab being visible — and it stops on its own
  // once everything has cooled.
  React.useEffect(() => {
    if (!surface.active) return;
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);

    let raf = 0;
    let lastTime: number | null = null;
    let inView = false;

    const shouldRun = (nowMs: number) =>
      pointerInsideRef.current || nowMs < warmUntilRef.current;

    const tick = (now: number) => {
      raf = 0;
      const dt = lastTime === null ? 0 : (now - lastTime) / 1000;
      lastTime = now;
      drawFrame(now, true, dt);
      if (inView && !document.hidden && shouldRun(now)) {
        raf = requestAnimationFrame(tick);
      } else {
        lastTime = null;
      }
    };

    const ensureRunning = () => {
      if (raf !== 0 || !inView || document.hidden) return;
      if (!shouldRun(performance.now())) return;
      raf = requestAnimationFrame(tick);
    };

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      pointerRef.current.x = event.clientX - rect.left;
      pointerRef.current.y = event.clientY - rect.top;
      pointerInsideRef.current = true;
      ensureRunning();
    };
    const leave = () => {
      pointerInsideRef.current = false;
    };

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerenter", move);
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
        lastTime = null;
      }
    });
    intersection.observe(host);

    const onVisibility = () => {
      if (document.hidden) {
        if (raf !== 0) {
          cancelAnimationFrame(raf);
          raf = 0;
          lastTime = null;
        }
      } else {
        ensureRunning();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerenter", move);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [surface.active, surface.host, background, drawFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="pixel-melt"
      className="block h-full w-full"
    />
  );
}

/**
 * The interface melts under the pointer's warmth. A small offscreen heat
 * map, quartered in scale like ice-pane's own, warms wherever the pointer
 * rests within `radius` and fades back to cold every frame on its own
 * clock; a warmUntil timer keeps the loop running only as long as the map
 * still holds warmth. The shader reads that field smoothly — never
 * quantised — while a per-column hash trims some columns' reach by up to
 * 30%, `columns` sets each band's width, and six taps along every drip's
 * pull keep the inkiest hit so the source colour rides down as one solid
 * strand, tapering off over its last eight pixels rather than scattering.
 * Reduced motion: SurfacePaint's replace-mode contract handles it — the
 * real DOM shows at full opacity and this layer renders nothing.
 */
export function PixelMelt({
  radius = 120,
  rate = 0.9,
  cool = 0.5,
  maxDrip = 60,
  columns = 3,
  background,
  paint,
  className,
  children,
}: PixelMeltProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <PixelMeltLayer
          radius={radius}
          rate={rate}
          cool={cool}
          maxDrip={maxDrip}
          columns={columns}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
