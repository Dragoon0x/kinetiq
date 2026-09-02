"use client";

import * as React from "react";

import { animate, useMotionValue } from "motion/react";

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
import { easings, springs } from "@/registry/lib/motion";
import { resolveColor, type PaintOptions } from "@/registry/lib/paint";
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type ThermalReceiptMode = "scroll" | "auto" | "manual";

export type ThermalReceiptProps = {
  /** How progress is driven. "scroll" reads the host's viewport position; "auto" fills once on a timer when the host first appears; "manual" takes `progress` directly. @default "scroll" */
  mode?: ThermalReceiptMode;
  /** The print position for `mode="manual"`, 0 (nothing printed) to 1 (fully printed). Ignored otherwise. */
  progress?: number;
  /** Fill duration in seconds for `mode="auto"`. @default 2.4 */
  duration?: number;
  /** Halftone dot grid size in CSS pixels. @default 2 */
  dot?: number;
  /** How far the ink lightens as the head speeds up; 0 disables the tell. @default 0.5 */
  fade?: number;
  /** Paper colour, resolved against the host so `var(--token)` reads the right theme. @default "#f4efe4" */
  paper?: string;
  /** Fill colour outside the paper; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_progress;
uniform float u_dot;
uniform float u_fade;
uniform float u_headSpeed;
uniform vec4 u_paper;
uniform vec4 u_ink;
uniform vec4 u_hot;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}
${GLSL_LUMA}

// Ink detection samples the live page against its own background, not the
// paper: the paper is only the printed substrate, and mixing transparent
// regions onto it would give blank paper a nonzero darkness and speckle
// the whole page with false dots. u_bg is the page's real background.
vec3 sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

void main() {
  vec2 px = v_uv * u_res;
  float p = clamp(u_progress, 0.0, 1.0);
  float headY = p * u_res.y;
  float edgeFade = smoothstep(0.0, 0.015, p) * (1.0 - smoothstep(0.985, 1.0, p));

  // Faint ribs scored into the stock every 6 CSS px, so blank paper still
  // reads as paper rather than a flat fill.
  float ribPhase = mod(px.y, 6.0);
  float rib = 1.0 - smoothstep(0.0, 1.2, ribPhase);
  vec3 paper = mix(u_paper.rgb, u_paper.rgb * 0.96, rib * 0.35);
  vec3 color = paper;

  if (px.y < headY) {
    // Printed: a halftone of round dots on a dot-sized grid, one hash per
    // cell (not per pixel) deciding whether that cell fires at all. A cell
    // only ever contributes ink when the page actually painted something
    // dark there — a cell sitting within 0.06 of the background is blank
    // paper and is forced to zero coverage regardless of its luma, so a
    // uniform per-cell hash can never light up empty stock.
    float cellSize = max(u_dot, 1.0);
    vec2 cell = floor(px / cellSize);
    vec2 cellCenter = (cell + 0.5) * cellSize;
    vec3 centerColor = sampleOver(cellCenter / u_res);
    float luma = kx_luma(centerColor);
    float coverage = clamp((1.0 - luma) * 1.4, 0.0, 1.0);
    coverage *= step(0.06, length(centerColor - u_bg.rgb));
    float threshold = kx_hash(cell) * 0.9;
    float hasInk = coverage > threshold ? 1.0 : 0.0;

    // The dot radius spans the full cell — the inscribed circle reaches
    // every edge — so a run of inked cells reads as a solid printed line
    // instead of a perforation.
    vec2 local = (px - cellCenter) / (cellSize * 0.5);
    float dotShape = 1.0 - smoothstep(0.92, 1.06, length(local));
    float ink = hasInk * dotShape;

    // Ink laid down while the head is moving fast starves and prints
    // lighter — the one honest tell that a head is sweeping through, not a
    // static image sitting underneath.
    float lighten = clamp(u_fade * u_headSpeed, 0.0, 1.0);
    vec3 inkColor = mix(u_ink.rgb, u_paper.rgb, lighten);
    color = mix(paper, inkColor, ink);
  }

  // The print head: a dark bar six pixels tall straddling the line, with a
  // hot filament at its centre.
  float dHead = abs(px.y - headY);
  float bar = (1.0 - step(3.0, dHead)) * edgeFade;
  float filament = (1.0 - smoothstep(0.0, 0.9, dHead)) * edgeFade;
  vec3 barColor = u_ink.rgb * 0.25;
  color = mix(color, barColor, bar * 0.9);
  color = mix(color, u_hot.rgb, filament * 0.85);

  o_color = vec4(color, 1.0);
}
`;

type ReceiptLayerProps = Required<
  Pick<ThermalReceiptProps, "mode" | "duration" | "dot" | "fade" | "paper">
> & { progress?: number; background?: string };

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Walks up from the host to the first opaque background colour, so the
 * clear colour behind the paper composites onto the page rather than onto
 * black — the same probe crystal-lens and laser-print use for their own
 * backdrops. */
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
 * The GL layer. Owns the context, the program, the texture, the progress
 * motion value, the head-speed tracker and the frame loop; reads everything
 * else from the surface.
 */
function ReceiptLayer({
  mode,
  progress: progressProp,
  duration,
  dot,
  fade,
  paper,
  background,
}: ReceiptLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const progress = useMotionValue<number>(0);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const textureRef = React.useRef<WebGLTexture | null>(null);
  const uploadedVersionRef = React.useRef(0);
  const frameRef = React.useRef<number | null>(null);
  const headSpeedRef = React.useRef(0);
  const bgRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const paperRef = React.useRef<[number, number, number, number]>([1, 1, 1, 1]);
  const inkRef = React.useRef<[number, number, number, number]>([0, 0, 0, 1]);
  const hotRef = React.useRef<[number, number, number, number]>([1, 0.5, 0, 1]);
  const failedRef = React.useRef(false);

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ dot, fade });
  React.useEffect(() => {
    paramsRef.current = { dot, fade };
  }, [dot, fade]);

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
    const bg = bgRef.current;
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_tex", texture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_progress: progress.get(),
      u_dot: p.dot,
      u_fade: p.fade,
      u_headSpeed: headSpeedRef.current,
      u_paper: paperRef.current,
      u_ink: inkRef.current,
      u_hot: hotRef.current,
      u_bg: bg,
    });
    tri.draw();
  }, [progress]);

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
    // scroll or tick.
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

  // Every progress change and every completed paint asks for a frame.
  React.useEffect(() => {
    const unsub = progress.on("change", requestFrame);
    return unsub;
  }, [progress, requestFrame]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Resolve the paper, ink, filament and outer background colours against
  // the host, so `var(--token)` reads the theme in force there.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    bgRef.current = background
      ? resolveColor(background, host)
      : effectiveBackground(host);
    paperRef.current = resolveColor(paper, host);
    inkRef.current = resolveColor("var(--ink)", host);
    hotRef.current = resolveColor("var(--accent-bright)", host);
    requestFrame();
  }, [surface.host, background, paper, requestFrame]);

  // mode="manual": the prop drives the motion value directly, no spring.
  React.useEffect(() => {
    if (mode !== "manual") return;
    progress.jump(clamp01(progressProp ?? 0));
  }, [mode, progressProp, progress]);

  // mode="scroll" | "auto": the motion value is driven either by the
  // host's place in the viewport (springed toward on every scroll/resize)
  // or by a one-shot timed fill the first time the host intersects.
  React.useEffect(() => {
    if (mode === "manual") return;
    const host = surface.host;
    if (!host) return;

    if (mode === "auto") {
      progress.jump(0);
      let started = false;
      let controls: ReturnType<typeof animate> | null = null;
      const io = new IntersectionObserver((entries) => {
        const last = entries[entries.length - 1];
        if (last?.isIntersecting && !started) {
          started = true;
          controls = animate(progress, 1, { duration, ease: easings.enter });
        }
      });
      io.observe(host);
      return () => {
        io.disconnect();
        controls?.stop();
      };
    }

    // mode === "scroll"
    const computeProgress = (): number => {
      const rect = host.getBoundingClientRect();
      const vh = window.innerHeight;
      const denom = vh * 0.55 + rect.height;
      const raw = denom > 0 ? (vh - rect.top) / denom : 0;
      return clamp01(raw);
    };
    // Compute immediately so a host already in view prints correctly
    // before the first scroll event ever fires.
    progress.jump(computeProgress());
    const onScroll = () => {
      animate(progress, computeProgress(), springs.glide);
    };
    window.addEventListener("scroll", onScroll, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [mode, duration, surface.host, progress]);

  // The tick loop: tracks the head's speed from progress deltas and
  // redraws every frame, but only while the head is actually moving — a
  // receipt has no sparks or shimmer to animate once it is still, so
  // unlike laser-print's beam this loop is not kept alive merely by
  // sitting mid-page. It keeps going while a frame-to-frame progress
  // change exceeds 1e-4, or for 0.4s past the last one so the speed-based
  // fade can ease back to zero, then stops outright and leaves a single
  // frozen frame at zero speed. A fresh progress change — scroll, the
  // manual range, the auto tween — always restarts it.
  React.useEffect(() => {
    if (!surface.active) return;
    const host = surface.host;
    if (!host) return;

    const SETTLE_MS = 400;
    const MOVE_EPSILON = 1e-4;

    let raf = 0;
    let lastNow: number | null = null;
    let lastProgress = progress.get();
    let lastActiveNow = 0;
    let inView = false;

    const stop = () => {
      if (raf === 0) return;
      cancelAnimationFrame(raf);
      raf = 0;
      lastNow = null;
      headSpeedRef.current = 0;
      requestFrame();
    };

    const tick = (now: number) => {
      const current = progress.get();
      if (lastNow !== null) {
        const dt = Math.max((now - lastNow) / 1000, 1 / 240);
        const delta = Math.abs(current - lastProgress);
        if (delta > MOVE_EPSILON) lastActiveNow = now;
        // Instantaneous progress-per-second, eased toward rather than
        // snapped to, so the fade relaxes smoothly once a scroll settles.
        const target = Math.min(delta / dt, 1);
        headSpeedRef.current +=
          (target - headSpeedRef.current) * Math.min(dt * 8, 1);
      } else {
        // A fresh start (or a resume after a pause): count this frame as
        // active so the settle window begins now, not already expired.
        lastActiveNow = now;
      }
      lastNow = now;
      lastProgress = current;
      drawFrame();

      if (!inView || document.hidden || now - lastActiveNow >= SETTLE_MS) {
        stop();
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    const start = () => {
      if (raf !== 0 || !inView || document.hidden) return;
      lastNow = null;
      lastProgress = progress.get();
      raf = requestAnimationFrame(tick);
    };

    const intersection = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) inView = last.isIntersecting;
      if (inView) start();
      else stop();
    });
    intersection.observe(host);
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    // Any progress change — a scroll spring tick, a manual jump, an auto
    // tween frame — is "the head moving": (re)start if it is not already
    // running. Once running, the loop itself decides when to stop.
    const unsubProgress = progress.on("change", start);

    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      unsubProgress();
    };
  }, [surface.active, surface.host, progress, drawFrame, requestFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="thermal-receipt"
      className="block h-full w-full"
    />
  );
}

/**
 * A thermal receipt printer's output, resolving in as the head sweeps down
 * the page. Progress is the host's place in the viewport — `mode="scroll"`
 * reads it straight off `host.getBoundingClientRect()` on every scroll and
 * resize, `mode="auto"` fills it once on a timer the moment the host first
 * appears, and `mode="manual"` takes the number from you. Above the line
 * the interface resolves as a halftone of round dots, luma quantised on a
 * `dot`-px grid and thresholded per cell against a hash rather than a
 * modulated radius, because a real thermal head only lays a dot fully down
 * or not at all; ink printed while the head is moving fast comes out
 * visibly lighter, tracked from the progress delta each frame. Below the
 * line sits plain stock, ribbed every six pixels and its own opaque paper —
 * nothing composites against the page behind it.
 * Reduced motion: SurfacePaint shows the real DOM already fully printed and this layer renders nothing.
 */
export function ThermalReceipt({
  mode = "scroll",
  progress,
  duration = 2.4,
  dot = 2,
  fade = 0.5,
  paper = "#f4efe4",
  background,
  paint,
  className,
  children,
}: ThermalReceiptProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <ReceiptLayer
          mode={mode}
          progress={progress}
          duration={duration}
          dot={dot}
          fade={fade}
          paper={paper}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
