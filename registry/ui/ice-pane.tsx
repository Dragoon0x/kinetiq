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

export type IcePaneProps = {
  /** Base density of the crystalline frost field. @default 0.85 */
  frost?: number;
  /** How hard the frost's own relief bends the view beneath it. @default 18 */
  refraction?: number;
  /** Blur strength at full frost thickness. @default 0.8 */
  blur?: number;
  /** Melt-brush radius, in CSS pixels. @default 110 */
  melt?: number;
  /** How fast the melt map warms under a resting pointer. @default 1 */
  meltSpeed?: number;
  /** How fast warmth fades back toward frozen, per second. @default 0.35 */
  refreeze?: number;
  /** Tint colour mixed into the frost at full density. CSS; resolved with `resolveColor`. @default "var(--accent-bright)" */
  color?: string;
  /** How much of `color` replaces the sampled view at full frost (0..1). @default 0.25 */
  tint?: number;
  /** Glint density across the standing frost (0..1-ish). @default 0.6 */
  sparkle?: number;
  /** Fill colour behind transparent texture regions; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
${GLSL_NOISE}
uniform sampler2D u_tex;
uniform sampler2D u_melt;
uniform vec2 u_res;
uniform float u_frost;
uniform float u_refraction;
uniform float u_blur;
uniform vec3 u_color;
uniform float u_tint;
uniform float u_sparkle;
uniform float u_tick;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

const float FROST_SCALE = 5.5;

vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// The frost field at uv: value noise folded around its own midline so it
// reads as thin crystal veins rather than soft blobs, scaled by u_frost
// and cut back wherever the melt map (0 frozen -> 1 clear) says the ice
// has cleared.
float frostField(vec2 uv) {
  float n = kx_fbm(uv * FROST_SCALE);
  float ridge = 1.0 - abs(n * 2.0 - 1.0);
  float m = texture(u_melt, clamp(uv, 0.0, 1.0)).r;
  return u_frost * ridge * (1.0 - m);
}

vec3 blurredView(vec2 uv, float radiusPx) {
  vec2 o = vec2(radiusPx) / u_res;
  vec3 c = sampleOver(uv) * 0.4;
  c += sampleOver(uv + vec2(o.x, 0.0)) * 0.15;
  c += sampleOver(uv - vec2(o.x, 0.0)) * 0.15;
  c += sampleOver(uv + vec2(0.0, o.y)) * 0.15;
  c += sampleOver(uv - vec2(0.0, o.y)) * 0.15;
  return c;
}

void main() {
  vec2 uv = v_uv;
  vec2 texel = 1.0 / u_res;

  float f = frostField(uv);

  // Normal from the frost field's own relief (central differences) — the
  // ice's crystal texture is what bends the view under it.
  float fx = frostField(uv + vec2(texel.x, 0.0)) - frostField(uv - vec2(texel.x, 0.0));
  float fy = frostField(uv + vec2(0.0, texel.y)) - frostField(uv - vec2(0.0, texel.y));
  vec3 nrm = normalize(vec3(-fx, -fy, 1.0));

  // Wet rim: the melt boundary is where the melt map's own gradient peaks.
  float gx = texture(u_melt, uv + vec2(texel.x, 0.0)).r - texture(u_melt, uv - vec2(texel.x, 0.0)).r;
  float gy = texture(u_melt, uv + vec2(0.0, texel.y)).r - texture(u_melt, uv - vec2(0.0, texel.y)).r;
  float rim = smoothstep(0.05, 0.35, length(vec2(gx, gy)));

  vec2 refracted = uv + nrm.xy * u_refraction * (f + rim * 0.5) / u_res;
  vec3 view = blurredView(refracted, u_blur * f * 6.0);

  vec3 c = mix(view, u_color, clamp(u_tint, 0.0, 1.0) * f);
  c = mix(c, vec3(1.0), f * 0.35);

  // Sparkle: a sparse set of 3px cells glint, brighter where the frost
  // stands thick, twinkling on the shared clock.
  vec2 px = uv * u_res;
  vec2 cell = floor(px / 3.0);
  float h = kx_hash(cell);
  float qualifies = step(1.0 - clamp(u_sparkle, 0.0, 1.0) * 0.06, h);
  float twinkle = 0.5 + 0.5 * sin(u_tick * 4.0 + h * 6.2831853);
  c += vec3(qualifies * twinkle * f * 0.6);

  c *= mix(1.0, 0.85, rim);

  o_color = vec4(c, 1.0);
}
`;

type IcePaneLayerProps = Required<
  Pick<
    IcePaneProps,
    | "frost"
    | "refraction"
    | "blur"
    | "melt"
    | "meltSpeed"
    | "refreeze"
    | "color"
    | "tint"
    | "sparkle"
  >
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
 * `1 / refreeze` (the rough time a fully warm spot takes to fade to
 * nothing), so the loop always outlives its own decay rather than racing it. */
const WARM_BUFFER = 1.2;

/**
 * The GL layer. Owns the context, the program, the page texture, the melt
 * map and its texture, the pointer state, and the frame loop; reads
 * everything else from the surface.
 */
function IcePaneLayer({
  frost,
  refraction,
  blur,
  melt,
  meltSpeed,
  refreeze,
  color,
  tint,
  sparkle,
  background,
}: IcePaneLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const meltCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const meltCtxRef = React.useRef<CanvasRenderingContext2D | null>(null);
  const meltTextureRef = React.useRef<WebGLTexture | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const colorRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
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
  const paramsRef = React.useRef({
    frost,
    refraction,
    blur,
    melt,
    meltSpeed,
    refreeze,
    tint,
    sparkle,
  });
  React.useEffect(() => {
    paramsRef.current = {
      frost,
      refraction,
      blur,
      melt,
      meltSpeed,
      refreeze,
      tint,
      sparkle,
    };
  });

  // One frame: re-upload the page texture on a new paint, update + upload
  // the melt map when `animateMelt` is set (the loop passes its own `dt`;
  // a plain requestFrame() redraw leaves the map untouched), then draw.
  const drawFrame = React.useCallback(
    (now: number, animateMelt = false, dt = 0) => {
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

      // The melt map tracks the GL canvas at quarter resolution, recreated
      // (which clears it) whenever the host resizes.
      const mapW = Math.max(1, Math.round(size.width * 0.25));
      const mapH = Math.max(1, Math.round(size.height * 0.25));
      let map = meltCanvasRef.current;
      let resized = false;
      if (!map) {
        map = document.createElement("canvas");
        meltCanvasRef.current = map;
        meltCtxRef.current = map.getContext("2d");
        resized = true;
      }
      if (map.width !== mapW || map.height !== mapH) {
        map.width = mapW;
        map.height = mapH;
        resized = true;
      }
      const mctx = meltCtxRef.current;

      let painted = false;
      if (animateMelt && mctx && dt > 0) {
        // Fade the whole map toward frozen first...
        mctx.save();
        mctx.globalCompositeOperation = "destination-out";
        mctx.globalAlpha = clamp(p.refreeze * dt, 0, 1);
        mctx.fillStyle = "#fff";
        mctx.fillRect(0, 0, map.width, map.height);
        mctx.restore();

        // ...then, while the pointer rests inside, warm it back up under
        // the pointer and push the loop's own stop time back out.
        if (pointerInsideRef.current) {
          const scaleX = cssW > 0 ? map.width / cssW : 0;
          const scaleY = cssH > 0 ? map.height / cssH : 0;
          const mx = pointerRef.current.x * scaleX;
          const my = pointerRef.current.y * scaleY;
          const mr = Math.max(1, p.melt * scaleX);
          const gradient = mctx.createRadialGradient(mx, my, 0, mx, my, mr);
          gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
          gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
          mctx.save();
          mctx.globalCompositeOperation = "lighter";
          mctx.globalAlpha = clamp(p.meltSpeed * dt, 0, 1);
          mctx.fillStyle = gradient;
          mctx.beginPath();
          mctx.arc(mx, my, mr, 0, Math.PI * 2);
          mctx.fill();
          mctx.restore();
          warmUntilRef.current =
            now + (1 / Math.max(p.refreeze, 0.0001)) * WARM_BUFFER * 1000;
        }
        painted = true;
      }

      if (mctx && (resized || painted || !meltTextureRef.current)) {
        // Premultiplied so the map's alpha (built up by "lighter", faded by
        // "destination-out") lands directly in the red channel the shader
        // reads — a plain unmultiplied upload would leave red pinned at 1
        // wherever the map has ever been touched, losing the fade entirely.
        meltTextureRef.current = uploadTexture(
          gl,
          map,
          { linear: true, premultiply: true },
          meltTextureRef.current,
        );
      }
      const meltTexture = meltTextureRef.current;
      if (!meltTexture) return;

      const bg = bgRef.current;
      gl.clearColor(bg[0], bg[1], bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      program.use();
      program.texture("u_tex", texture, 0);
      program.texture("u_melt", meltTexture, 1);
      program.set({
        u_res: [cssW, cssH],
        u_frost: p.frost,
        u_refraction: p.refraction,
        u_blur: p.blur,
        u_color: [
          colorRef.current[0],
          colorRef.current[1],
          colorRef.current[2],
        ],
        u_tint: p.tint,
        u_sparkle: p.sparkle,
        u_tick: now / 1000,
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
      if (meltTextureRef.current) gl.deleteTexture(meltTextureRef.current);
      meltTextureRef.current = null;
      meltCanvasRef.current = null;
      meltCtxRef.current = null;
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

  // Pointer + the melt loop, together: the loop only exists to warm and
  // fade the melt map, so it is driven by the same pointer state that feeds
  // it. It runs while the pointer rests inside OR the map still holds
  // warmth from a recent visit, gated by the surface being active, the host
  // being on screen, and the tab being visible — and it stops on its own
  // once everything has refrozen.
  React.useEffect(() => {
    if (!surface.active) return;
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    colorRef.current = resolveColor(color, host);

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
  }, [surface.active, surface.host, background, color, drawFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="ice-pane"
      className="block h-full w-full"
    />
  );
}

/**
 * Frost settles over the interface — a ridged, veined noise field that
 * blurs, cools, and refracts the view beneath it — and melts wherever the
 * cursor rests. A small offscreen map carries the warmth: each active frame
 * it is warmed under the pointer with a soft radial brush and faded back
 * toward zero by elapsed time, so a clearing you carve creeps shut again
 * once you move on. The shader reads that map to cut the frost back, bend
 * the clear view through the ice's own relief, darken a wet rim at the
 * thaw's boundary, and scatter a twinkling sparkle across whatever frost
 * still stands. The loop that drives all of this only runs while the
 * pointer is inside the pane or the map still holds warmth from a recent
 * visit, and stops on its own once everything has refrozen.
 * Reduced motion: `SurfacePaint`'s replace-mode contract handles it — the
 * real DOM shows at full opacity and this layer renders nothing.
 */
export function IcePane({
  frost = 0.85,
  refraction = 18,
  blur = 0.8,
  melt = 110,
  meltSpeed = 1,
  refreeze = 0.35,
  color = "var(--accent-bright)",
  tint = 0.25,
  sparkle = 0.6,
  background,
  paint,
  className,
  children,
}: IcePaneProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <IcePaneLayer
          frost={frost}
          refraction={refraction}
          blur={blur}
          melt={melt}
          meltSpeed={meltSpeed}
          refreeze={refreeze}
          color={color}
          tint={tint}
          sparkle={sparkle}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
