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
import { cn } from "@/registry/lib/utils";
import {
  SurfacePaint,
  useSurface,
  type SurfaceContextValue,
} from "@/registry/ui/surface-paint";

export type FaxFeedProps = {
  /** Scan advance rate: rows per second while `loop`, CSS pixels per second in a single pass. @default 90 */
  speed?: number;
  /** Ordered-dither strength on the received page — 0 keeps raw luminance, 1 is a hard black-and-white halftone. @default 0.9 */
  dither?: number;
  /** Chance a scan row drops out and prints blank white, 0..1 scaled to a 5% ceiling. @default 0.25 */
  dropouts?: number;
  /** Horizontal smear in CSS pixels the rollers drag into the darker of two neighbouring samples. @default 3 */
  smear?: number;
  /** Cycles the scan from the top once it reaches the bottom, feeding the finished sheet out first; false stops at the bottom. @default true */
  loop?: boolean;
  /** Fill colour where the texture is transparent; defaults to the host's own effective background. */
  background?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

const FRAGMENT = /* glsl */ `
uniform sampler2D u_tex;
uniform vec2 u_res;
uniform float u_tick;
uniform float u_speed;
uniform float u_dither;
uniform float u_dropouts;
uniform float u_smear;
uniform float u_loop;
uniform vec4 u_bg;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}
${GLSL_LUMA}

vec3 ff_sampleOver(vec2 uv) {
  vec4 t = texture(u_tex, clamp(uv, 0.0, 1.0));
  return mix(u_bg.rgb, t.rgb, t.a);
}

// The 2x2 base cell every Bayer level nests: bit-pair (bx,by) -> its 0..3
// rung. Bit-interleaving this per bit-plane (weight 16 for the least
// significant bit down to weight 1 for the most significant) reproduces the
// classic 8x8 matrix exactly, so there is never a lookup table or a
// non-constant array index.
int ff_bayerRung(int bx, int by) {
  if (bx == 0 && by == 0) return 0;
  if (bx == 1 && by == 0) return 2;
  if (bx == 0 && by == 1) return 3;
  return 1;
}

// Bounded to exactly [0, 63/64] — 64 distinct, evenly spaced levels, mean
// 31.5/64 — never above 1.0, so a hard threshold compare against luma never
// forces a cell black regardless of what the source pixel actually is.
float ff_bayerThreshold(vec2 cell) {
  ivec2 c = ivec2(mod(cell, 8.0));
  int total = 0;
  int weight = 16;
  for (int bit = 0; bit < 3; bit += 1) {
    total += ff_bayerRung((c.x >> bit) & 1, (c.y >> bit) & 1) * weight;
    weight /= 4;
  }
  return float(total) / 64.0;
}

// A whole scan row goes missing at random, seeded from its own index alone
// so the same row always drops, or always survives.
float ff_rowDropped(float row) {
  float h = kx_hash(vec2(row, 0.0));
  float limit = clamp(u_dropouts, 0.0, 1.0) * 0.05;
  return h < limit ? 1.0 : 0.0;
}

// One ordered-dither sample: a dropped row prints paper white outright: no
// dither, no ink, before any of the rest runs. Otherwise the luminance
// clips its white point at 0.95 — a near-white page never earns a black
// cell, only genuine ink well below that highlight can — then thresholds
// against the Bayer matrix at this pixel's screen position: black when the
// (clipped) luma sits under the matrix value here, white when it does not.
// u_dither blends how hard that call lands versus the raw clipped tone.
float ff_ditherLuma(vec2 p) {
  float row = floor(p.y / 2.0);
  if (ff_rowDropped(row) > 0.5) return 1.0;

  vec3 src = ff_sampleOver(p / u_res);
  float luma = kx_luma(src);
  float toneLuma = clamp(luma / 0.95, 0.0, 1.0);
  float threshold = ff_bayerThreshold(floor(p));
  float bw = toneLuma < threshold ? 0.0 : 1.0;
  return mix(toneLuma, bw, clamp(u_dither, 0.0, 1.0));
}

void main() {
  vec2 px = v_uv * u_res;
  float height = max(u_res.y, 1.0);
  float rows = max(height / 2.0, 1.0);

  float cycleT = 0.0;
  float scanY;
  if (u_loop > 0.5) {
    cycleT = fract(u_tick * u_speed / rows);
    scanY = cycleT * height;
  } else {
    scanY = clamp(u_tick * u_speed, 0.0, height);
  }

  // Feed-out: the last 0.6s of a looping pass slides the finished sheet up
  // and out before the next page starts scanning from the top.
  float feedShift = 0.0;
  if (u_loop > 0.5 && u_speed > 0.0) {
    float cyclePeriod = rows / u_speed;
    float timeLeft = (1.0 - cycleT) * cyclePeriod;
    if (timeLeft < 0.6) {
      feedShift = height * clamp((0.6 - timeLeft) / 0.6, 0.0, 1.0);
    }
  }

  vec3 result;
  if (px.y < scanY) {
    // Received: already printed above the scan head.
    float sy = px.y + feedShift;
    if (sy > height) {
      result = u_bg.rgb;
    } else {
      vec2 rp = vec2(px.x, sy);
      float row = floor(rp.y / 2.0);
      float smearPx = max(u_smear, 0.0) * kx_hash(vec2(row, 5.0));
      float here = ff_ditherLuma(rp);
      float dragged = ff_ditherLuma(rp - vec2(smearPx, 0.0));
      result = vec3(min(here, dragged));
    }
  } else {
    // Waiting: the unscanned original, faint until the head arrives.
    vec3 page = ff_sampleOver(px / u_res);
    result = mix(page, u_bg.rgb, 0.65);
  }

  // The scan head: a bright 3px band with a soft glow around it.
  float d = abs(px.y - scanY);
  float band = 1.0 - smoothstep(0.0, 1.5, d);
  float glow = exp(-d * 0.1) * 0.45;
  result = mix(result, vec3(1.0), clamp(band + glow, 0.0, 1.0));

  o_color = vec4(result, 1.0);
}
`;

type FeedLayerProps = Required<
  Pick<FaxFeedProps, "speed" | "dither" | "dropouts" | "smear" | "loop">
> & { background?: string };

/** Walks up from the host to the first opaque background colour, so a
 * texture sample over a transparent region composites onto the page rather
 * than onto black. */
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
 * The GL layer. Owns the context, the program, the texture, the tick clock,
 * and the frame loop; reads everything else from the surface. There is no
 * pointer here — the scan head is driven purely by time.
 */
function FeedLayer({
  speed,
  dither,
  dropouts,
  smear,
  loop,
  background,
}: FeedLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

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
  const paramsRef = React.useRef({ speed, dither, dropouts, smear, loop });
  React.useEffect(() => {
    paramsRef.current = { speed, dither, dropouts, smear, loop };
  });

  // One frame: upload the texture if a new paint landed, then draw at the
  // clock's current tick.
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
      u_tick: tickRef.current,
      u_speed: p.speed,
      u_dither: p.dither,
      u_dropouts: p.dropouts,
      u_smear: p.smear,
      u_loop: p.loop ? 1 : 0,
      u_bg: bgRef.current,
    });
    tri.draw();
  }, []);

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
    // tick.
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

  // Every completed paint asks for a frame — mostly redundant with the tick
  // loop below, but it covers the gap between the surface going active and
  // the loop's first tick landing.
  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Resolve the fill colour once the host exists, and again whenever the
  // theme flips, since `background` (or the effective backdrop) may resolve
  // a CSS custom property.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const resolve = () => {
      bgRef.current = background
        ? resolveColor(background, host)
        : effectiveBackground(host);
      requestFrame();
    };
    resolve();
    if (typeof MutationObserver === "undefined") return;
    const themeObserver = new MutationObserver(resolve);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    return () => themeObserver.disconnect();
  }, [surface.host, background, requestFrame]);

  // The continuous tick loop: this effect is the whole reason the scan head
  // moves. Gated on `surface.active` plus IntersectionObserver and
  // visibilitychange — a plain local function calling itself via
  // requestAnimationFrame, never a self-referential callback — it runs for
  // as long as the surface is on screen and the tab is visible, and goes
  // fully quiet otherwise.
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
        // Rebase the clock over the pause so the scan resumes, not jumps.
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

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="fax-feed"
      className="block h-full w-full"
    />
  );
}

/**
 * The live interface as a page arriving by fax: a scan head sweeps down the
 * canvas at `speed`, and everything above it has already printed as an
 * ordered 8×8 Bayer dither — pure black and white, no grey — with the odd
 * row dropped to blank white and a horizontal smear dragging the darker of
 * two neighbouring samples into place, the way a real machine's rollers
 * streak ink. Below the head the original waits at a third of its strength.
 * With `loop` on, the finished sheet slides up and out in the last 0.6s of
 * each pass before a fresh page starts scanning from the top; the tick that
 * drives all of it comes from the shared rAF clock, never a random seed.
 * Reduced motion: the primitive shows the real DOM and this layer renders
 * nothing.
 */
export function FaxFeed({
  speed = 90,
  dither = 0.9,
  dropouts = 0.25,
  smear = 3,
  loop = true,
  background,
  paint,
  className,
  children,
}: FaxFeedProps) {
  return (
    <SurfacePaint
      mode="replace"
      paint={paint}
      className={cn(className)}
      effect={
        <FeedLayer
          speed={speed}
          dither={dither}
          dropouts={dropouts}
          smear={smear}
          loop={loop}
          background={background}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
