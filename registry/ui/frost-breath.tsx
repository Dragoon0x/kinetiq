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
import { clamp } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type FrostBreathProps = {
  /** Warm-breath radius at the pointer, in CSS pixels. @default 110 */
  radius?: number;
  /** How fast the fog map warms under a resting or slow-moving pointer, per second. @default 1.4 */
  bloom?: number;
  /** How fast the fog fades back toward clear glass, per second. @default 0.35 */
  clear?: number;
  /** Blur strength over the fogged patch (scales a nine-tap box blur's pixel radius). @default 1 */
  blur?: number;
  /** Tint colour the fog mixes toward. CSS; resolved with `resolveColor`. @default "#dfe9f2" */
  tint?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
${GLSL_NOISE}
uniform sampler2D u_tex;
uniform sampler2D u_map;
uniform vec2 u_res;
uniform float u_blur;
uniform vec3 u_tint;
uniform float u_still;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

// A single box-blur pixel step; scaled by the blur prop below.
const float BLUR_BASE_PX = 3.0;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// A uniform nine-tap box blur over the painted texture — soft enough to
// read as breath-fogged glass, not a heavy blur.
vec3 blurredView(vec2 uv, float radiusPx) {
  vec2 o = vec2(radiusPx) / u_res;
  vec3 sum = vec3(0.0);
  for (int dy = -1; dy <= 1; dy += 1) {
    for (int dx = -1; dx <= 1; dx += 1) {
      sum += sampleOver(uv + vec2(float(dx), float(dy)) * o);
    }
  }
  return sum / 9.0;
}

void main() {
  if (u_still > 0.5) {
    // Reduced motion: no loop runs the fog map, so there is nothing honest
    // to show — draw nothing rather than freeze a fake cloud.
    o_color = vec4(0.0);
    return;
  }

  float f = texture(u_map, v_uv).r;
  if (f <= 0.01) {
    o_color = vec4(0.0);
    return;
  }

  // Feather the map's own soft-circle edge with a low-frequency fbm so the
  // cloud reads as breath spreading unevenly across glass, not a disc.
  vec2 px = v_uv * u_res;
  float feather = kx_fbm(px * 0.03);
  float fog = clamp(f * mix(0.55, 1.2, feather), 0.0, 1.0);

  vec3 blurred = blurredView(v_uv, u_blur * BLUR_BASE_PX);
  vec3 c = mix(blurred, u_tint, 0.35);
  o_color = vec4(c, fog * 0.9);
}
`;

type FrostBreathLayerProps = Required<
  Pick<FrostBreathProps, "radius" | "bloom" | "clear" | "blur" | "tint">
>;

/** Walks up from the host to the first opaque background colour, so a
 * blurred sample over a transparent texture region composites onto the
 * page rather than onto black. Mirrors crystal-lens's `effectiveBackground`. */
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

/** The offscreen fog map runs at a quarter the GL canvas's own resolution —
 * plenty for a soft breath cloud, a quarter of the upload cost every frame
 * the loop is warming or fading it. */
const MAP_SCALE = 0.25;

/** Pointer speed, in host CSS px/s, at or above which the glass is moving
 * too fast to fog — only a resting or slowly drifting pointer warms it. */
const SPEED_LIMIT = 60;

/** No fresh pointermove within this long counts as resting, even when the
 * last recorded sample was fast — otherwise a swipe that simply stops would
 * read as still-fast forever. */
const REST_AFTER_MS = 80;

/** Seconds of continued warming a single warm frame buys the loop, past
 * `1 / clear` (the rough time a fully warm spot takes to fade to nothing) —
 * at the default `clear` this settles the loop about six seconds after the
 * last warm frame, so the loop always outlives its own decay rather than
 * racing it. */
const WARM_BUFFER = 2.1;

/**
 * The GL layer. Owns the context, the program, the page texture, the fog
 * map and its texture, the pointer state, and the frame loop; reads
 * everything else from the surface.
 */
function FrostBreathLayer({
  radius,
  bloom,
  clear,
  blur,
  tint,
}: FrostBreathLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const mapCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const mapCtxRef = React.useRef<CanvasRenderingContext2D | null>(null);
  const fogTextureRef = React.useRef<WebGLTexture | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const colorRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const failedRef = React.useRef(false);

  // Pointer state lives in refs, never React state — read once per frame.
  const pointerRef = React.useRef({ x: 0, y: 0 });
  const pointerInsideRef = React.useRef(false);
  const velocityRef = React.useRef(0);
  const lastMoveRef = React.useRef<{ x: number; y: number; t: number } | null>(
    null,
  );
  // rAF-timestamp domain (same clock as `now` below and `performance.now()`).
  const warmUntilRef = React.useRef(0);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ radius, bloom, clear, blur });
  React.useEffect(() => {
    paramsRef.current = { radius, bloom, clear, blur };
  });

  // One frame: re-upload the page texture on a new paint, update + upload
  // the fog map when `animateFog` is set (the loop passes its own `dt`; a
  // plain requestFrame() redraw leaves the map untouched), then draw.
  const drawFrame = React.useCallback(
    (now: number, animateFog = false, dt = 0) => {
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

      // The fog map tracks the GL canvas at quarter resolution, recreated
      // (which clears it) whenever the host resizes.
      const mapW = Math.max(1, Math.round(size.width * MAP_SCALE));
      const mapH = Math.max(1, Math.round(size.height * MAP_SCALE));
      let map = mapCanvasRef.current;
      let resized = false;
      if (!map) {
        map = document.createElement("canvas");
        mapCanvasRef.current = map;
        mapCtxRef.current = map.getContext("2d");
        resized = true;
      }
      if (map.width !== mapW || map.height !== mapH) {
        map.width = mapW;
        map.height = mapH;
        resized = true;
      }
      const mctx = mapCtxRef.current;

      let painted = false;
      if (animateFog && mctx && dt > 0) {
        // Fade the whole map toward clear first...
        mctx.save();
        mctx.globalCompositeOperation = "destination-out";
        mctx.globalAlpha = clamp(p.clear * dt, 0, 1);
        mctx.fillStyle = "#fff";
        mctx.fillRect(0, 0, map.width, map.height);
        mctx.restore();

        // ...then, while the pointer rests or drifts slowly inside, warm it
        // back up under the pointer and push the loop's own stop time out.
        const warming =
          pointerInsideRef.current && velocityRef.current < SPEED_LIMIT;
        if (warming) {
          const scaleX = cssW > 0 ? map.width / cssW : 0;
          const scaleY = cssH > 0 ? map.height / cssH : 0;
          const mx = pointerRef.current.x * scaleX;
          const my = pointerRef.current.y * scaleY;
          const mr = Math.max(1, p.radius * scaleX);
          const gradient = mctx.createRadialGradient(mx, my, 0, mx, my, mr);
          gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
          gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
          mctx.save();
          mctx.globalCompositeOperation = "lighter";
          mctx.globalAlpha = clamp(p.bloom * dt, 0, 1);
          mctx.fillStyle = gradient;
          mctx.beginPath();
          mctx.arc(mx, my, mr, 0, Math.PI * 2);
          mctx.fill();
          mctx.restore();
          warmUntilRef.current =
            now + (1 / Math.max(p.clear, 0.0001)) * WARM_BUFFER * 1000;
        }
        painted = true;
      }

      if (mctx && (resized || painted || !fogTextureRef.current)) {
        // Premultiplied so the map's alpha (built up by "lighter", faded by
        // "destination-out") lands directly in the red channel the shader
        // reads — a plain unmultiplied upload would leave red pinned at 1
        // wherever the map has ever been touched, losing the fade entirely.
        fogTextureRef.current = uploadTexture(
          gl,
          map,
          { linear: true, premultiply: true },
          fogTextureRef.current,
        );
      }
      const fogTexture = fogTextureRef.current;
      if (!fogTexture) return;

      // Overlay: draw only the fog, transparent everywhere else.
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      program.use();
      program.texture("u_tex", texture, 0);
      program.texture("u_map", fogTexture, 1);
      program.set({
        u_res: [cssW, cssH],
        u_blur: p.blur,
        u_tint: [colorRef.current[0], colorRef.current[1], colorRef.current[2]],
        u_still: live.motionSafe ? 0 : 1,
        u_bg: bgRef.current,
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
      if (fogTextureRef.current) gl.deleteTexture(fogTextureRef.current);
      fogTextureRef.current = null;
      mapCanvasRef.current = null;
      mapCtxRef.current = null;
      tri.dispose();
      program.dispose();
      glRef.current = null;
      programRef.current = null;
      triRef.current = null;
    };
  }, [surface.active, requestFrame]);

  // Every completed paint asks for a frame — the fog map is left untouched,
  // the page texture underneath it just gets fresher.
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Pointer + the fog loop, together: the loop only exists to warm and fade
  // the fog map, so it is driven by the same pointer state that feeds it. It
  // runs while the pointer is inside OR the map still holds warmth from a
  // recent visit, gated by the surface being active and motion-safe, the
  // host being on screen, and the tab being visible — and it stops on its
  // own once everything has cleared. Under reduced motion nothing is warmed
  // and nothing is drawn, so the effect does not even attach.
  React.useEffect(() => {
    if (!surface.active || !surface.motionSafe) return;
    const host = surface.host;
    if (!host) return;
    bgRef.current = effectiveBackground(host);
    colorRef.current = resolveColor(tint, host);

    let raf = 0;
    let lastTime: number | null = null;
    let inView = false;

    const shouldRun = (nowMs: number) =>
      pointerInsideRef.current || nowMs < warmUntilRef.current;

    const tick = (now: number) => {
      raf = 0;
      const dt = lastTime === null ? 0 : (now - lastTime) / 1000;
      lastTime = now;
      const last = lastMoveRef.current;
      if (last === null || now - last.t > REST_AFTER_MS) {
        // No fresh sample recently: nothing shows the pointer is still
        // moving fast, so treat it as resting.
        velocityRef.current = 0;
      }
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
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const last = lastMoveRef.current;
      if (last) {
        const dt = (event.timeStamp - last.t) / 1000;
        if (dt > 0) {
          velocityRef.current = Math.hypot(px - last.x, py - last.y) / dt;
        }
      }
      lastMoveRef.current = { x: px, y: py, t: event.timeStamp };
      pointerRef.current.x = px;
      pointerRef.current.y = py;
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
  }, [surface.active, surface.host, surface.motionSafe, tint, drawFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="frost-breath"
      className="block h-full w-full"
    />
  );
}

/**
 * Breath fogs the glass wherever the pointer settles. A small offscreen map,
 * a quarter the canvas's own size, is warmed under the pointer with a soft
 * radial gradient whenever it rests or drifts below a walking pace — a fast
 * sweep passes too quickly to leave a mark — and every frame the whole map
 * fades back toward clear. The shader reads that map as a cloud: where it
 * holds enough warmth, the live interface blurs through a nine-tap box and
 * tints toward the glass colour, its boundary roughened by a low-frequency
 * noise so the breath spreads unevenly rather than as a neat disc. The loop
 * behind the map only runs while the pointer is on the glass or the map
 * still holds warmth from a recent visit, and stops on its own once
 * everything has cleared.
 * Reduced motion: no fog is drawn — the interface underneath shows plain.
 */
export function FrostBreath({
  radius = 110,
  bloom = 1.4,
  clear = 0.35,
  blur = 1,
  tint = "#dfe9f2",
  paint,
  className,
  children,
}: FrostBreathProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <FrostBreathLayer
          radius={radius}
          bloom={bloom}
          clear={clear}
          blur={blur}
          tint={tint}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
