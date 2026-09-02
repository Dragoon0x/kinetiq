"use client";

import * as React from "react";

import {
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
  createEmptyTexture,
  createFullscreenTriangle,
  createGL,
  createProgram,
  onContextLoss,
  resizeGL,
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

export type RainLedgeProps = {
  /** Fraction of columns that rain at all — a fixed hash of each column's own index, never re-rolled. @default 0.5 */
  density?: number;
  /** Fall speed multiplier. @default 1 */
  speed?: number;
  /** Streak length in CSS pixels, from the bright head to where it fades. @default 18 */
  length?: number;
  /** Splash ring size multiplier. @default 1 */
  splash?: number;
  /** Streak and splash colour. @default "#9cc4ff" */
  color?: string;
  /** Painter options passed to the surface. */
  paint?: PaintOptions;
  className?: string;
  children: React.ReactNode;
};

// A drop column is 6 CSS px wide, matching the resolution the CPU ledge scan
// records at — fixed, not a prop, so the two always agree.
const COLUMN_PX = 6;
// The cutoff/ledge lookup covers this many columns; a surface wider than
// COLUMN_PX * SCAN_COLUMNS just reuses the last recorded columns past that.
const SCAN_COLUMNS = 256;
// Ledge rows kept per column. Only the topmost ever matters for rendering —
// the streak is clipped above it — the rest are recorded for completeness.
const SCAN_MAX_LEDGES = 4;
// The painted surface is downsampled to 1/SCAN_DOWNSCALE its CSS size before
// the CPU reads it back with getImageData.
const SCAN_DOWNSCALE = 4;
// Splash ring buffer size, and how long a splash takes to fully fade.
const SPLASH_MAX = 32;
const SPLASH_LIFE = 0.5;

const FRAGMENT = /* glsl */ `
${GLSL_NOISE}
uniform sampler2D u_cutoff;
uniform vec2 u_res;
uniform float u_tick;
uniform float u_density;
uniform float u_speed;
uniform float u_length;
uniform float u_splash;
uniform vec3 u_color;
uniform float u_still;
uniform vec4 u_splashes[${SPLASH_MAX}];
in vec2 v_uv;
out vec4 o_color;

const float COLUMN_PX = ${COLUMN_PX}.0;
const float SCAN_COLUMNS_F = ${SCAN_COLUMNS}.0;
const int SPLASH_COUNT = ${SPLASH_MAX};
const float SPLASH_LIFE = ${SPLASH_LIFE};

// A column's own hash, decorrelated per use by a fixed seed offset — the
// same trick type-rain uses so the rain gate, phase, speed and gap never
// share one value.
float columnHash(float cx, float seed) { return kx_hash(vec2(cx, seed)); }

void main() {
  vec2 px = v_uv * u_res;
  float cx = floor(px.x / COLUMN_PX);

  // The cutoff LUT: one texel per column, R channel holding the first
  // recorded ledge row (0 = top, 1 = bottom / no ledge at all), rebuilt on
  // the CPU once per painted version.
  float colU = (cx + 0.5) / SCAN_COLUMNS_F;
  float cutoffY = texture(u_cutoff, vec2(colU, 0.5)).r * u_res.y;

  float gate = columnHash(cx, 0.0);
  bool raining = gate < clamp(u_density, 0.0, 1.0) && px.y < cutoffY;

  float alpha = 0.0;
  float streamLength = max(u_length, 1.0);

  if (raining) {
    // Staggered fall: phase offsets the column's own cycle, speedVar varies
    // how fast it falls, gap adds idle time above the top so columns don't
    // all restart together. Reduced motion freezes the clock at zero rather
    // than swapping in a different formula, so the still frame is just this
    // same rain caught at t=0, never a stand-in shape.
    float phase = columnHash(cx, 11.0);
    float speedVar = columnHash(cx, 37.0);
    float gapSeed = columnHash(cx, 53.0);
    float gap = gapSeed * u_res.y * 0.8;
    float span = u_res.y + streamLength + gap;
    float effectiveTick = u_still > 0.5 ? 0.0 : u_tick;
    float t = fract(phase + effectiveTick * u_speed * (0.6 + 0.8 * speedVar));
    float headY = t * span - streamLength;
    float behind = headY - px.y;
    if (behind >= 0.0 && behind < streamLength) {
      float falloff = 1.0 - behind / streamLength;
      alpha = falloff * falloff;
    }
  }

  if (u_still <= 0.5) {
    for (int i = 0; i < SPLASH_COUNT; i++) {
      vec4 s = u_splashes[i];
      float life = clamp(1.0 - s.z / SPLASH_LIFE, 0.0, 1.0);
      if (life <= 0.0) continue;
      float radius = s.z * 60.0 * max(u_splash, 0.0);
      float dist = length(px - s.xy);
      float ring = 1.0 - smoothstep(0.0, 2.5, abs(dist - radius));
      alpha = max(alpha, ring * life);
    }
  }

  o_color = vec4(u_color, clamp(alpha, 0.0, 1.0));
}
`;

type LedgeLayerProps = Required<
  Pick<RainLedgeProps, "density" | "speed" | "length" | "splash" | "color">
>;

// --------------------------------------------------------------------------
// The CPU ledge scan
// --------------------------------------------------------------------------

type LedgeScan = {
  /** RGBA8 bytes for the SCAN_COLUMNS×1 cutoff texture — R is the only
   * channel read by the shader. */
  cutoff: Uint8Array;
  /** Up to SCAN_MAX_LEDGES ledge rows (CSS px) per column, row-major,
   * -1 where no ledge was found. */
  ledges: Float32Array;
};

function createLedgeScan(): LedgeScan {
  const cutoff = new Uint8Array(SCAN_COLUMNS * 4);
  for (let c = 0; c < SCAN_COLUMNS; c += 1) {
    cutoff[c * 4] = 255;
    cutoff[c * 4 + 3] = 255;
  }
  const ledges = new Float32Array(SCAN_COLUMNS * SCAN_MAX_LEDGES).fill(-1);
  return { cutoff, ledges };
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

const luma = (r: number, g: number, b: number): number =>
  0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Downsamples `source` into `scratch` at 1/SCAN_DOWNSCALE the CSS size and
 * scans each 6px column for rows where a lighter pixel sits over darker
 * content just below it — a top ledge edge — writing both the per-column
 * cutoff bytes and up to four ledge rows into `scan`, in place. A pure step
 * over a caller-owned scan and scratch context, never a direct ref mutation
 * inside a hook body.
 */
function scanLedgesInto(
  scan: LedgeScan,
  scratch: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
): void {
  if (cssWidth <= 0 || cssHeight <= 0) return;
  const lowW = Math.max(1, Math.round(cssWidth / SCAN_DOWNSCALE));
  const lowH = Math.max(1, Math.round(cssHeight / SCAN_DOWNSCALE));
  const canvas = scratch.canvas;
  if (canvas.width !== lowW) canvas.width = lowW;
  if (canvas.height !== lowH) canvas.height = lowH;
  scratch.clearRect(0, 0, lowW, lowH);
  scratch.drawImage(source, 0, 0, lowW, lowH);

  let data: Uint8ClampedArray;
  try {
    data = scratch.getImageData(0, 0, lowW, lowH).data;
  } catch {
    return; // a tainted source — keep whatever scan we had rather than throw
  }

  const lumaAt = (lx: number, ly: number): number => {
    const i = (ly * lowW + lx) * 4;
    return luma(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
  };

  const cols = Math.min(SCAN_COLUMNS, Math.ceil(cssWidth / COLUMN_PX));
  for (let c = 0; c < SCAN_COLUMNS; c += 1) {
    const ledgeBase = c * SCAN_MAX_LEDGES;
    if (c >= cols) {
      scan.cutoff[c * 4] = 255;
      scan.cutoff[c * 4 + 1] = 0;
      scan.cutoff[c * 4 + 2] = 0;
      scan.cutoff[c * 4 + 3] = 255;
      for (let k = 0; k < SCAN_MAX_LEDGES; k += 1)
        scan.ledges[ledgeBase + k] = -1;
      continue;
    }
    const lx = Math.min(
      lowW - 1,
      Math.max(0, Math.floor(((c + 0.5) * COLUMN_PX * lowW) / cssWidth)),
    );
    let found = 0;
    let firstLy = -1;
    for (let ly = 0; ly < lowH - 1 && found < SCAN_MAX_LEDGES; ly += 1) {
      const edge = smoothstep(0.2, 0.5, lumaAt(lx, ly) - lumaAt(lx, ly + 1));
      if (edge > 0.5) {
        if (found === 0) firstLy = ly;
        scan.ledges[ledgeBase + found] = (ly / lowH) * cssHeight;
        found += 1;
      }
    }
    for (let k = found; k < SCAN_MAX_LEDGES; k += 1)
      scan.ledges[ledgeBase + k] = -1;
    const ratio = firstLy >= 0 ? firstLy / lowH : 1;
    scan.cutoff[c * 4] = Math.round(clamp01(ratio) * 255);
    scan.cutoff[c * 4 + 1] = 0;
    scan.cutoff[c * 4 + 2] = 0;
    scan.cutoff[c * 4 + 3] = 255;
  }
}

// --------------------------------------------------------------------------
// Per-frame splash spawning — a CPU mirror of the shader's own head maths
// --------------------------------------------------------------------------

/**
 * Mirrors GLSL_NOISE's kx_hash bit for bit, as far as JS/GLSL float parity
 * allows, so the CPU-side gate and phase agree with the fragment shader's.
 */
function kxHash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

const frac = (x: number): number => x - Math.floor(x);

type SplashRing = {
  x: Float32Array;
  y: Float32Array;
  born: Float32Array;
  next: number;
};

function createSplashRing(): SplashRing {
  return {
    x: new Float32Array(SPLASH_MAX).fill(-9999),
    y: new Float32Array(SPLASH_MAX).fill(-9999),
    born: new Float32Array(SPLASH_MAX).fill(-1000),
    next: 0,
  };
}

function spawnSplash(
  ring: SplashRing,
  x: number,
  y: number,
  born: number,
): void {
  const i = ring.next;
  ring.x[i] = x;
  ring.y[i] = y;
  ring.born[i] = born;
  ring.next = (i + 1) % SPLASH_MAX;
}

/**
 * Mirrors the shader's per-column head position for every rain-active
 * column, comparing this frame's head against the last to catch it crossing
 * that column's topmost recorded ledge, and spawns a splash into `ring` when
 * one lands. Columns are already clipped below their first ledge on screen,
 * so only that first row can ever be reached by a visible streak — the
 * remaining recorded rows are never checked here. A pure step over
 * caller-owned buffers, never a direct ref mutation inside a hook body.
 */
function stepColumnHeads(
  prevHeadY: Float32Array,
  ledges: Float32Array,
  ring: SplashRing,
  cols: number,
  height: number,
  tick: number,
  density: number,
  speed: number,
  length: number,
): void {
  const streamLength = Math.max(length, 1);
  const gateLimit = clamp01(density);
  for (let c = 0; c < cols; c += 1) {
    if (kxHash(c, 0) >= gateLimit) continue;
    const ledgeY = ledges[c * SCAN_MAX_LEDGES] ?? -1;
    const phase = kxHash(c, 11);
    const speedVar = kxHash(c, 37);
    const gap = kxHash(c, 53) * height * 0.8;
    const span = height + streamLength + gap;
    const t = frac(phase + tick * speed * (0.6 + 0.8 * speedVar));
    const headY = t * span - streamLength;
    const prev = prevHeadY[c] ?? Number.NaN;
    if (
      ledgeY >= 0 &&
      Number.isFinite(prev) &&
      prev <= ledgeY &&
      headY > ledgeY
    ) {
      spawnSplash(ring, c * COLUMN_PX + COLUMN_PX / 2, ledgeY, tick);
    }
    prevHeadY[c] = headY;
  }
}

/** Rebuilds the flat `u_splashes` upload buffer (x, y, age, 0 per slot) from
 * `ring`, in place — a pure step over a caller-owned buffer. */
function writeSplashUniform(
  ring: SplashRing,
  tick: number,
  out: Float32Array,
): void {
  for (let i = 0; i < SPLASH_MAX; i += 1) {
    const base = i * 4;
    out[base] = ring.x[i] ?? -9999;
    out[base + 1] = ring.y[i] ?? -9999;
    out[base + 2] = tick - (ring.born[i] ?? -1000);
    out[base + 3] = 0;
  }
}

// --------------------------------------------------------------------------

/**
 * The GL layer. Owns the context, the program, the cutoff LUT texture, the
 * ledge scan, the splash ring buffer, and the frame loop; reads everything
 * else from the surface.
 */
function LedgeLayer({
  density,
  speed,
  length,
  splash,
  color,
}: LedgeLayerProps) {
  const surface = useSurface();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const glRef = React.useRef<GLContext | null>(null);
  const programRef = React.useRef<Program | null>(null);
  const triRef = React.useRef<FullscreenTriangle | null>(null);
  const cutoffTextureRef = React.useRef<WebGLTexture | null>(null);
  const frameRef = React.useRef<number | null>(null);
  const tickRef = React.useRef(0);
  const failedRef = React.useRef(false);
  const colorRgbRef = React.useRef<[number, number, number]>([0.61, 0.77, 1.0]);

  const scanRef = React.useRef<LedgeScan>(createLedgeScan());
  const scratchCtxRef = React.useRef<CanvasRenderingContext2D | null>(null);
  const scannedVersionRef = React.useRef(0);
  const uploadedScanVersionRef = React.useRef(0);
  const prevHeadYRef = React.useRef(
    new Float32Array(SCAN_COLUMNS).fill(Number.NaN),
  );
  const splashRingRef = React.useRef<SplashRing>(createSplashRing());
  const splashUniformRef = React.useRef(new Float32Array(SPLASH_MAX * 4));

  const surfaceRef = React.useRef<SurfaceContextValue>(surface);
  React.useEffect(() => {
    surfaceRef.current = surface;
  });
  const paramsRef = React.useRef({ density, speed, length, splash });
  React.useEffect(() => {
    paramsRef.current = { density, speed, length, splash };
  });

  // One frame: reupload the cutoff LUT if a new scan landed, rebuild the
  // splash upload buffer, then draw.
  const drawFrame = React.useCallback(() => {
    frameRef.current = null;
    const gl = glRef.current;
    const program = programRef.current;
    const tri = triRef.current;
    const canvas = canvasRef.current;
    const cutoffTexture = cutoffTextureRef.current;
    const live = surfaceRef.current;
    if (!gl || !program || !tri || !canvas || !cutoffTexture) return;
    if (gl.isContextLost()) return;

    if (uploadedScanVersionRef.current !== scannedVersionRef.current) {
      gl.bindTexture(gl.TEXTURE_2D, cutoffTexture);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        SCAN_COLUMNS,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        scanRef.current.cutoff,
      );
      uploadedScanVersionRef.current = scannedVersionRef.current;
    }

    const size = resizeGL(gl, canvas, { dprCap: 2 });
    const cssW = size.width / size.dpr;
    const cssH = size.height / size.dpr;
    const p = paramsRef.current;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    program.use();
    program.texture("u_cutoff", cutoffTexture, 0);
    program.set({
      u_res: [cssW, cssH],
      u_tick: tickRef.current,
      u_density: p.density,
      u_speed: p.speed,
      u_length: p.length,
      u_splash: p.splash,
      u_color: colorRgbRef.current,
      u_still: live.motionSafe ? 0 : 1,
    });

    writeSplashUniform(
      splashRingRef.current,
      tickRef.current,
      splashUniformRef.current,
    );
    const splashLocation = program.uniforms.u_splashes;
    if (splashLocation) {
      gl.useProgram(program.program);
      gl.uniform4fv(splashLocation, splashUniformRef.current);
    }

    tri.draw();
  }, []);

  const requestFrame = React.useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(drawFrame);
  }, [drawFrame]);

  // GL setup and teardown. The canvas only mounts once the surface is
  // active (after the first paint), so this is keyed on `surface.active`,
  // not on mount: a mount-only effect would run against no canvas at all.
  // The cutoff LUT is a fixed 256×1 size, so — unlike warp-grid's field —
  // it's created once here rather than in a props-keyed effect of its own.
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
    const cutoffTexture = createEmptyTexture(gl, SCAN_COLUMNS, 1);
    gl.bindTexture(gl.TEXTURE_2D, cutoffTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      SCAN_COLUMNS,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      scanRef.current.cutoff,
    );
    uploadedScanVersionRef.current = scannedVersionRef.current;

    glRef.current = gl;
    programRef.current = program;
    triRef.current = tri;
    cutoffTextureRef.current = cutoffTexture;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const detach = onContextLoss(canvas, () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      failedRef.current = true;
    });
    // A paint (and a scan) may already be waiting: draw now rather than on
    // the next tick.
    if (surfaceRef.current.version > 0) requestFrame();

    return () => {
      detach();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      gl.deleteTexture(cutoffTexture);
      cutoffTextureRef.current = null;
      uploadedScanVersionRef.current = 0;
      tri.dispose();
      program.dispose();
      glRef.current = null;
      programRef.current = null;
      triRef.current = null;
    };
  }, [surface.active, requestFrame]);

  // The ledge scan: whenever a new paint lands, downsample it and rescan
  // for ledges, then ask for a frame so the cutoff LUT reuploads.
  React.useEffect(() => {
    if (!surface.active) return;
    if (!surface.canvas || surface.version === 0) return;
    if (scannedVersionRef.current === surface.version) return;
    if (!scratchCtxRef.current) {
      const scratch = document.createElement("canvas");
      scratchCtxRef.current = scratch.getContext("2d", {
        willReadFrequently: true,
      });
    }
    const ctx2d = scratchCtxRef.current;
    if (!ctx2d) return;
    scanLedgesInto(
      scanRef.current,
      ctx2d,
      surface.canvas,
      surface.width,
      surface.height,
    );
    scannedVersionRef.current = surface.version;
    requestFrame();
  }, [
    surface.active,
    surface.canvas,
    surface.version,
    surface.width,
    surface.height,
    requestFrame,
  ]);

  React.useEffect(() => {
    if (surface.version > 0) requestFrame();
  }, [surface.version, requestFrame]);

  // Resolve the ink colour through the real cascade — var() tokens need the
  // host's computed style to read the theme that applies to it, exactly
  // type-rain's own colour effect.
  React.useEffect(() => {
    const host = surface.host;
    if (!host) return;
    const rgba = resolveColor(color, host);
    colorRgbRef.current = [rgba[0], rgba[1], rgba[2]];
    requestFrame();
  }, [surface.host, color, requestFrame]);

  // The continuous loop: rain never stops falling on its own while the host
  // is visible. Gated by IntersectionObserver and page visibility, exactly
  // dust-reveal's idle loop, plus motionSafe — reduced motion already drew
  // its one still frame above and this loop must never spawn a splash.
  React.useEffect(() => {
    if (!surface.active || !surface.motionSafe) return;
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
      const live = surfaceRef.current;
      const p = paramsRef.current;
      const cols = Math.min(
        SCAN_COLUMNS,
        Math.max(1, Math.ceil(live.width / COLUMN_PX)),
      );
      stepColumnHeads(
        prevHeadYRef.current,
        scanRef.current.ledges,
        splashRingRef.current,
        cols,
        live.height,
        tickRef.current,
        p.density,
        p.speed,
        p.length,
      );
      drawFrame();
    };

    const syncLoop = () => {
      const shouldRun = inView && !document.hidden;
      if (shouldRun && raf === 0) {
        // Rebase the clock over the pause so the rain resumes, not jumps.
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
  }, [surface.active, surface.motionSafe, surface.host, drawFrame]);

  if (!surface.active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-effect-canvas="rain-ledge"
      className="block h-full w-full"
    />
  );
}

/**
 * Rain falls in 6px-wide columns, each with its own hashed phase, speed and
 * gap so drops never fall in lockstep — the same seeding type-rain uses for
 * its streams. Once per painted version, a low-resolution CPU scan reads the
 * surface for a lighter pixel sitting over darker content just below it — a
 * top ledge edge — and records the first such row per column into a small
 * lookup texture the shader clips streaks against, so a drop disappears at
 * the furniture it lands on instead of falling through it. The same
 * per-column phase maths run again on the CPU every frame to catch the
 * moment a drop's head crosses that recorded row, spawning a splash — an
 * expanding ring that fades over half a second — into a 32-slot ring buffer
 * uploaded straight to the shader alongside the streaks. Everywhere a drop
 * or a splash isn't, the layer stays fully transparent, so the real,
 * interactive page underneath is untouched.
 * Reduced motion: one still rainfall frame, no ledge crossings are checked
 * and nothing splashes.
 */
export function RainLedge({
  density = 0.5,
  speed = 1,
  length = 18,
  splash = 1,
  color = "#9cc4ff",
  paint,
  className,
  children,
}: RainLedgeProps) {
  return (
    <SurfacePaint
      mode="overlay"
      paint={paint}
      className={cn(className)}
      effect={
        <LedgeLayer
          density={density}
          speed={speed}
          length={length}
          splash={splash}
          color={color}
        />
      }
    >
      {children}
    </SurfacePaint>
  );
}
