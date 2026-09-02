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

export type SnowSettleProps = {
  /** How many of a column's flake slots are active (0..1, a hash gate per slot). @default 0.6 */
  density?: number;
  /** Fall speed multiplier. @default 1 */
  speed?: number;
  /** Flake radius in CSS pixels; the column width is size × 3. @default 2.2 */
  size?: number;
  /** How fast snow piles up on a ledge a flake keeps crossing. @default 1 */
  drift?: number;
  /** Radius in CSS pixels around the pointer that brushes drifts clear. @default 60 */
  brush?: number;
  /** Flake colour. CSS; resolved with resolveColor against the host. Drift caps are always white. @default "#ffffff" */
  color?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

// How many independently-phased flakes fall through one column at once.
const FLAKES_PER_COLUMN = 3;
// The drift map's resolution relative to the CSS canvas — ice-pane's own
// melt-map scale, reused here for the same reason: coarse enough to stay
// cheap, fine enough that a pile reads as a shape rather than a blob.
const MAP_SCALE = 0.25;
// How far above a ledge the shader looks for recorded pile height, in CSS px.
const CAP_PX = 12;
// Per second the whole drift map fades toward clear.
const FADE_RATE = 0.02;
// Per second the pointer's brush clears the map under it.
const ERASE_RATE = 6;
// Flake disc radius, in units of `size`.
const FLAKE_RADIUS_SCALE = 1.3;
// How wide a band around a ledge counts as "the flake is passing over it",
// in units of the flake's own radius — wide enough that a flake contributes
// to the pile across several consecutive frames as it falls through.
const LANDING_BAND_SCALE = 2.2;

const FRAGMENT = /* glsl */ `
${GLSL_NOISE}
${GLSL_LUMA}
uniform sampler2D u_tex;
uniform sampler2D u_drift;
uniform vec2 u_res;
uniform float u_tick;
uniform float u_density;
uniform float u_speed;
uniform float u_size;
uniform vec3 u_color;
uniform float u_still;
in vec2 v_uv;
out vec4 o_color;

// A ledge: the painted texture goes from a lighter pixel to a darker one
// within 3px straight down — content starting just under a lighter run,
// i.e. the top edge of whatever sits there. Thresholded at 0.25 so a soft
// gradient never counts, only a real edge.
float ledgeAt(vec2 uv) {
  vec2 step3 = vec2(0.0, 3.0) / max(u_res, vec2(1.0));
  float hereL = kx_luma(texture(u_tex, clamp(uv, 0.0, 1.0)).rgb);
  float belowL = kx_luma(texture(u_tex, clamp(uv + step3, 0.0, 1.0)).rgb);
  float diff = max(0.0, hereL - belowL);
  return smoothstep(0.15, 0.35, diff);
}

// The drift map holds accumulated pile height (0..1) at the exact spot a
// ledge was crossed, painted on the CPU. A pixel up to h * CAP_PX above that
// spot counts as inside the pile; the far edge of the pile softens rather
// than cutting hard.
float driftCoverage(vec2 uv) {
  float coverage = 0.0;
  for (int i = 0; i < 8; i += 1) {
    float d = (float(i) + 0.5) * (${CAP_PX}.0 / 8.0);
    vec2 sampleUv = uv + vec2(0.0, d) / u_res;
    float h = texture(u_drift, clamp(sampleUv, 0.0, 1.0)).r;
    float capHeight = h * ${CAP_PX}.0;
    float e0 = max(capHeight - 3.0, 0.0);
    float e1 = capHeight + 0.001;
    float within = step(d, capHeight);
    float softTop = 1.0 - smoothstep(e0, e1, d);
    coverage = max(coverage, within * softTop);
  }
  return clamp(coverage, 0.0, 1.0);
}

void main() {
  vec2 px = v_uv * u_res;
  float onLedge = ledgeAt(v_uv);

  float cw = max(u_size * 3.0, 1.0);
  float cx = floor(px.x / cw);
  float columnCenterX = (cx + 0.5) * cw;

  // Each column carries a small, fixed set of flakes, every one a pure
  // function of the column's own index, its slot, and the clock — never
  // Math.random — so which slots exist, how fast they fall and where they
  // sway are all fixed the instant the column is chosen.
  float flakeAlpha = 0.0;
  for (int i = 0; i < ${FLAKES_PER_COLUMN}; i += 1) {
    float fi = float(i);
    float gate = kx_hash(vec2(cx, 3.0 + fi * 17.0));
    if (gate >= clamp(u_density, 0.0, 1.0)) continue;

    float phase = kx_hash(vec2(cx, 11.0 + fi * 29.0));
    float speedVar = kx_hash(vec2(cx, 37.0 + fi * 53.0));
    float swayPhase = kx_hash(vec2(cx, 71.0 + fi * 13.0)) * 6.2831853;
    float slotOffset = fi / ${FLAKES_PER_COLUMN}.0;
    float loopFrac = fract(phase + slotOffset + u_tick * u_speed * (0.5 + 0.7 * speedVar));
    float headY = loopFrac * u_res.y;

    float sway = u_still > 0.5 ? 0.0 : sin(u_tick * u_speed * 1.3 + swayPhase) * cw * 0.32;
    vec2 center = vec2(columnCenterX + sway, headY);

    float r = max(u_size * ${FLAKE_RADIUS_SCALE}, 0.5);
    float dist = length(px - center);
    float disc = 1.0 - smoothstep(r * 0.55, r, dist);
    // Thin the disc where it meets a ledge live, so a flake looks like it
    // settles into the surface rather than passing through it — the CPU-side
    // drift cap is what actually stays behind.
    disc *= 1.0 - onLedge * 0.9;
    flakeAlpha = max(flakeAlpha, disc);
  }

  float cap = driftCoverage(v_uv);
  // Manual "over" compositing (cap over flake) since both are drawn in one
  // pass here rather than as separate blended draws.
  float outA = cap + flakeAlpha * (1.0 - cap);
  vec3 outRGB = vec3(0.0);
  if (outA > 0.0001) {
    outRGB = (vec3(1.0) * cap + u_color * flakeAlpha * (1.0 - cap)) / outA;
  }
  o_color = vec4(outRGB, outA);
}
`;

type SnowLayerProps = Required<
  Pick<
    SnowSettleProps,
    "density" | "speed" | "size" | "drift" | "brush" | "color"
  >
>;

function hash2(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

type LedgeTable = { mapW: number; mapH: number; columns: number[][] };

/**
 * Downsamples the painted texture to MAP_SCALE and finds every ledge in it —
 * the same light-to-dark-within-3px test the shader runs live, run once here
 * against a coarse raster instead of every pixel every frame — bucketed by
 * raster column so the drift loop can look one up by a flake's x position
 * without touching pixels again until the next paint.
 */
function buildLedgeTable(
  scratch: HTMLCanvasElement | null,
  source: HTMLCanvasElement,
  cssW: number,
  cssH: number,
): { canvas: HTMLCanvasElement; table: LedgeTable } {
  const mapW = Math.max(1, Math.round(cssW * MAP_SCALE));
  const mapH = Math.max(1, Math.round(cssH * MAP_SCALE));
  const canvas = scratch ?? document.createElement("canvas");
  if (canvas.width !== mapW) canvas.width = mapW;
  if (canvas.height !== mapH) canvas.height = mapH;
  const table: LedgeTable = { mapW, mapH, columns: [] };
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { canvas, table };

  ctx.clearRect(0, 0, mapW, mapH);
  ctx.drawImage(source, 0, 0, mapW, mapH);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, mapW, mapH).data;
  } catch {
    return { canvas, table };
  }

  const luma = (i: number): number => {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };

  const columns: number[][] = Array.from({ length: mapW }, () => []);
  for (let mx = 0; mx < mapW; mx += 1) {
    for (let my = 0; my < mapH - 1; my += 1) {
      const here = (my * mapW + mx) * 4;
      const below = ((my + 1) * mapW + mx) * 4;
      const diff = Math.max(0, luma(here) - luma(below));
      if (diff > 0.25) columns[mx]?.push(my / MAP_SCALE);
    }
  }
  table.columns = columns;
  return { canvas, table };
}

/**
 * The GL layer. Owns the context, the program, the painted-page texture, the
 * ledge table, the drift map and its texture, the pointer, and the frame
 * loop; reads everything else from the surface.
 */
function SnowLayer({
  density,
  speed,
  size,
  drift,
  brush,
  color,
}: SnowLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);

  const ledgeScratchRef = React.useRef<HTMLCanvasElement | null>(null);
  const ledgeTableRef = React.useRef<LedgeTable | null>(null);
  const ledgeVersionRef = React.useRef(-1);

  const driftCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const driftCtxRef = React.useRef<CanvasRenderingContext2D | null>(null);
  const driftTextureRef = React.useRef<WebGLTexture | null>(null);

  const frameRef = React.useRef<number | null>(null);
  const tickRef = React.useRef(0);
  const colorRgbRef = React.useRef<[number, number, number]>([1, 1, 1]);
  const failedRef = React.useRef(false);

  const pointerRef = React.useRef({ x: 0, y: 0 });
  const pointerInsideRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ density, speed, size, drift, brush });
  React.useEffect(() => {
    paramsRef.current = { density, speed, size, drift, brush };
  });

  // One frame: upload the page texture if a new paint landed, rebuild the
  // ledge table if that paint is new, advance the drift map when animating,
  // upload it, then draw.
  const drawFrame = React.useCallback((animateDrift = false, dt = 0) => {
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

    const size2d = resizeGL(gl, canvas, { dprCap: 2 });
    const cssW = size2d.width / size2d.dpr;
    const cssH = size2d.height / size2d.dpr;
    const p = paramsRef.current;

    if (ledgeVersionRef.current !== live.version) {
      const built = buildLedgeTable(
        ledgeScratchRef.current,
        live.canvas,
        cssW,
        cssH,
      );
      ledgeScratchRef.current = built.canvas;
      ledgeTableRef.current = built.table;
      ledgeVersionRef.current = live.version;
    }

    // The drift map tracks the GL canvas at quarter resolution, recreated
    // (which clears it) whenever the host resizes — ice-pane's melt map.
    const mapW = Math.max(1, Math.round(cssW * MAP_SCALE));
    const mapH = Math.max(1, Math.round(cssH * MAP_SCALE));
    let map = driftCanvasRef.current;
    let resized = false;
    if (!map) {
      map = document.createElement("canvas");
      driftCanvasRef.current = map;
      driftCtxRef.current = map.getContext("2d");
      resized = true;
    }
    if (map.width !== mapW || map.height !== mapH) {
      map.width = mapW;
      map.height = mapH;
      resized = true;
    }
    const mctx = driftCtxRef.current;

    let painted = false;
    if (animateDrift && mctx && dt > 0) {
      // Fade the whole map toward clear first...
      mctx.save();
      mctx.globalCompositeOperation = "destination-out";
      mctx.globalAlpha = clamp(FADE_RATE * dt, 0, 1);
      mctx.fillStyle = "#fff";
      mctx.fillRect(0, 0, map.width, map.height);
      mctx.restore();

      // ...then the pointer brushes a clearing within `brush` px...
      if (pointerInsideRef.current) {
        const scaleX = cssW > 0 ? map.width / cssW : 0;
        const scaleY = cssH > 0 ? map.height / cssH : 0;
        const bx = pointerRef.current.x * scaleX;
        const by = pointerRef.current.y * scaleY;
        const br = Math.max(1, p.brush * scaleX);
        const gradient = mctx.createRadialGradient(bx, by, 0, bx, by, br);
        gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
        gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
        mctx.save();
        mctx.globalCompositeOperation = "destination-out";
        mctx.globalAlpha = clamp(ERASE_RATE * dt, 0, 1);
        mctx.fillStyle = gradient;
        mctx.beginPath();
        mctx.arc(bx, by, br, 0, Math.PI * 2);
        mctx.fill();
        mctx.restore();
      }

      // ...then every column's own seeded flakes grow a little height
      // wherever their head is currently passing near a ledge row.
      const table = ledgeTableRef.current;
      if (table && table.mapW > 0) {
        const cw = Math.max(p.size * 3, 1);
        const numColumns = Math.max(1, Math.ceil(cssW / cw));
        const band =
          Math.max(p.size * FLAKE_RADIUS_SCALE, 0.5) * LANDING_BAND_SCALE;
        const tick = tickRef.current;
        for (let cx = 0; cx < numColumns; cx += 1) {
          const columnCenterX = (cx + 0.5) * cw;
          const mx = Math.min(
            table.mapW - 1,
            Math.max(0, Math.floor(columnCenterX * MAP_SCALE)),
          );
          const ledgeRows = table.columns[mx];
          if (!ledgeRows || ledgeRows.length === 0) continue;
          for (let slot = 0; slot < FLAKES_PER_COLUMN; slot += 1) {
            const gate = hash2(cx, 3 + slot * 17);
            if (gate >= p.density) continue;
            const phase = hash2(cx, 11 + slot * 29);
            const speedVar = hash2(cx, 37 + slot * 53);
            const slotOffset = slot / FLAKES_PER_COLUMN;
            const raw =
              phase + slotOffset + tick * p.speed * (0.5 + 0.7 * speedVar);
            const loopFrac = raw - Math.floor(raw);
            const headY = loopFrac * cssH;
            for (const ledgeY of ledgeRows) {
              if (Math.abs(headY - ledgeY) > band) continue;
              const dx = columnCenterX * MAP_SCALE;
              const dy = ledgeY * MAP_SCALE;
              const dr = Math.max(cw * MAP_SCALE * 0.6, 1);
              const dot = mctx.createRadialGradient(dx, dy, 0, dx, dy, dr);
              dot.addColorStop(0, "rgba(255, 255, 255, 1)");
              dot.addColorStop(1, "rgba(255, 255, 255, 0)");
              mctx.save();
              mctx.globalCompositeOperation = "lighter";
              mctx.globalAlpha = clamp(p.drift * dt, 0, 1);
              mctx.fillStyle = dot;
              mctx.beginPath();
              mctx.arc(dx, dy, dr, 0, Math.PI * 2);
              mctx.fill();
              mctx.restore();
            }
          }
        }
      }
      painted = true;
    }

    if (mctx && (resized || painted || !driftTextureRef.current)) {
      // Premultiplied so the map's own alpha lands directly in the red
      // channel the shader reads — ice-pane's melt-map upload trick.
      driftTextureRef.current = uploadTexture(
        gl,
        map,
        { linear: true, premultiply: true },
        driftTextureRef.current,
      );
    }
    const driftTexture = driftTextureRef.current;
    if (!driftTexture) return;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.texture("u_drift", driftTexture, 1);
    program.set({
      u_res: [cssW, cssH],
      u_tick: tickRef.current,
      u_density: p.density,
      u_speed: p.speed,
      u_size: p.size,
      u_color: colorRgbRef.current,
      u_still: live.motionSafe ? 0 : 1,
    });
    tri.draw();
  }, []);

  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => drawFrame());
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
    // tick — this is also what produces the reduced-motion still frame.
    if (surfaceRef.current.version > 0) requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (textureRef.current) gl.deleteTexture(textureRef.current);
      textureRef.current = null;
      uploadedVersionRef.current = 0;
      if (driftTextureRef.current) gl.deleteTexture(driftTextureRef.current);
      driftTextureRef.current = null;
      driftCanvasRef.current = null;
      driftCtxRef.current = null;
      tri.dispose();
      program.dispose();
      glRef.current = null;
      programRef.current = null;
      triRef.current = null;
    };
  }, [surface.active, requestFrame]);

  // Every completed paint asks for a frame — the still frame under reduced
  // motion stays current with the real DOM even though nothing is falling.
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Resolve the ink colour through the real cascade, in case a var() token
  // is ever passed — the default is a literal so this settles once.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const rgba = resolveColor(color, host);
    colorRgbRef.current = [rgba[0], rgba[1], rgba[2]];
    requestFrame();
  }, [surface.host, color, requestFrame]);

  // The continuous loop: falling never stops on its own while the surface is
  // visible — dust-reveal's gated idle-drift shape, minus the "nothing to
  // animate" bail-out, plus a motion-safe gate: reduced motion draws exactly
  // one still frame (above) and this loop never starts.
  React.useEffect(() => {
    if (!surface.active || !surface.motionSafe) return;
    const host = surface.host;
    if (!host) return;

    let raf = 0;
    let started: number | null = null;
    let pausedAt: number | null = null;
    let lastTime: number | null = null;
    let inView = false;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (started === null) started = now;
      tickRef.current = (now - started) / 1000;
      const dt = lastTime === null ? 0 : (now - lastTime) / 1000;
      lastTime = now;
      drawFrame(true, dt);
    };

    const syncLoop = () => {
      const shouldRun = inView && !document.hidden;
      if (shouldRun && raf === 0) {
        // Rebase the clock over the pause so the snowfall resumes, not jumps.
        if (started !== null && pausedAt !== null) {
          started += performance.now() - pausedAt;
        }
        pausedAt = null;
        lastTime = null;
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
  }, [surface.active, surface.motionSafe, surface.host, drawFrame]);

  // Pointer on the host: tracked directly, no spring — the brush should
  // clear exactly under the cursor, not chase it.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;

    const move = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      pointerRef.current.x = event.clientX - rect.left;
      pointerRef.current.y = event.clientY - rect.top;
      pointerInsideRef.current = true;
    };
    const leave = () => {
      pointerInsideRef.current = false;
    };

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerenter", move);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("pointercancel", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerenter", move);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("pointercancel", leave);
    };
  }, [surface.host]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="snow-settle"
      className="block h-full w-full"
    />
  );
}

/**
 * Snow that lands on what is there. Soft discs fall down each size × 3px
 * column on a phase hashed from the column's own index — type-rain's seeded
 * streams, sway included — while a small offscreen map, read from the
 * painted texture at quarter scale, tracks every ledge (a row where the
 * interface goes from a lighter pixel to a darker one within 3px straight
 * down) a flake's head keeps passing near, and grows a little height there.
 * The shader reads that map back as a soft white cap sitting on each ledge
 * and thins a falling flake wherever it crosses one live, so snow appears to
 * settle into the real layout instead of falling through it; the map fades
 * on its own and the pointer brushes a clearing within `brush` px, so
 * nothing piles up forever. The DOM underneath stays fully interactive —
 * only the canvas above it draws, and only where snow differs from empty air.
 * Reduced motion: one still snowfall frame renders with no loop and no
 * drifts accumulating.
 */
export function SnowSettle({
  density = 0.6,
  speed = 1,
  size = 2.2,
  drift = 1,
  brush = 60,
  color = "#ffffff",
  paint,
  className,
  children,
}: SnowSettleProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <SnowLayer
          density={density}
          speed={speed}
          size={size}
          drift={drift}
          brush={brush}
          color={color}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
